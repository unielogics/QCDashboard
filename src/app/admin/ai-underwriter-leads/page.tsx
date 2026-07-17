"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, useToast, Toast } from "@/components/design-system/primitives";
import { Modal } from "@/components/design-system/Modal";
import { TypingDots } from "@/components/design-system/TypingDots";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { api, ApiError } from "@/lib/api";

// Surface a FastAPI 422/400 `detail` (string or [{msg}]) instead of the bare
// "422 Unprocessable Entity" so operators see WHY a send was rejected.
function apiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const detail = (error.body as { detail?: unknown } | null)?.detail;
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
      const msgs = detail.map((d) => (d && typeof d === "object" && "msg" in d ? String((d as { msg: unknown }).msg) : "")).filter(Boolean);
      if (msgs.length) return msgs.join("; ");
    }
    return error.message || fallback;
  }
  return error instanceof Error ? error.message : fallback;
}
import { Role } from "@/lib/enums.generated";
import { useCurrentUser, useBookingLink, useDriveFiles, type DriveFile } from "@/hooks/useApi";
import { LeadCockpit, type LeadCockpitAdapter, type ClientThreadMessage } from "@/components/admin/LeadCockpit";
import { RunReviewDialog, type ReviewProgress } from "@/components/admin/RunReviewDialog";
import type { IntakeResponse } from "@/lib/intake";
import { useUI } from "@/store/ui";

type LeadRow = {
  id: string;
  variant: string;
  client_id?: string | null;
  bucket_id: string;
  bucket_name: string;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  status: string;
  probability_status?: string | null;
  confidence?: string | null;
  one_next_step?: string | null;
  latest_review_status?: string | null;
  booking_recommended: boolean;
  call_booked: boolean;
  file_count: number;
  missing_required_count: number;
  requested_loan_amount?: number | null;
  estimated_credit_score?: number | null;
  created_at: string;
  updated_at: string;
  last_message_at?: string | null;
};

type LeadPage = {
  items: LeadRow[];
  total: number;
  limit: number;
  offset: number;
};

type RequestedDoc = {
  id: string;
  name: string;
  description?: string | null;
  required: boolean;
  status: string;
};

type UploadedFile = {
  id: string;
  requested_document_id?: string | null;
  parent_zip_file_id?: string | null;
  zip_entry_path?: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

type LeadDetail = {
  intake: LeadRow & {
    loan_purpose?: string | null;
    referral_source?: string | null;
    asset_rows?: Array<Record<string, unknown>> | null;
    result_snapshot?: Record<string, unknown> | null;
  };
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
  messages?: Array<{ id: string; role: string; content: string; created_at: string }>;
  artifacts?: Artifact[];
  email_sends?: EmailSend[];
};

type Artifact = {
  id: string;
  intake_id: string;
  artifact_type: string;
  title: string;
  body_text?: string | null;
  body_json?: Record<string, unknown> | null;
  s3_key?: string | null;
  download_url?: string | null;
  created_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

type EmailSend = {
  id: string;
  intake_id: string;
  executive_summary_artifact_id?: string | null;
  lender_packet_artifact_id?: string | null;
  to_emails: string[];
  cc_emails?: string[] | null;
  subject: string;
  body: string;
  vendor_access_ids?: string[] | null;
  ses_status: string;
  ses_message_ids?: string[] | null;
  ses_error?: string | null;
  sent_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

type VendorEmailPreview = {
  subject: string;
  body: string;
  to_emails: string[];
  cc_emails: string[];
  executive_summary?: Artifact | null;
  lender_packet?: Artifact | null;
};

type BucketAccessMode = "none" | "login" | "passcode";

type VendorEmailSendPayload = {
  to_emails: string[];
  cc_emails: string[];
  subject: string;
  body: string;
  include_lender_packet: boolean;
  attach_lender_packet: boolean;
  attach_executive_summary: boolean;
  attach_package_zip: boolean;
  bucket_access: BucketAccessMode;
  drive_file_ids: string[];
};

type VendorEmailSendResult = {
  email_sends: EmailSend[];
  vendor_access_ids: string[];
};

type DriveIngestResult = {
  ingested: number;
  skipped: number;
  items: { drive_file_id: string; file_name?: string | null; status: string; reason?: string | null }[];
};

const PROBABILITY_FILTERS = [
  { value: "all", label: "All probability" },
  { value: "Good probability - book call", label: "Good probability" },
  { value: "Promising but needs one clarification", label: "Promising" },
  { value: "Not enough evidence yet", label: "Not enough evidence" },
  { value: "Poor probability based on current file", label: "Poor probability" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All status" },
  { value: "collecting", label: "Collecting" },
  { value: "reviewing", label: "Reviewing" },
  { value: "completed", label: "Completed" },
];

const VARIANT_FILTERS = [
  { value: "all", label: "All reviews" },
  { value: "dealer", label: "Dealer" },
  { value: "real_estate", label: "Real estate" },
];

const LIMIT = 25;

export default function AdminAIUnderwriterLeadsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  // Match Sidebar.tsx widths (68 collapsed / 232 expanded) so the full-screen
  // lead modal clears the menu and leaves it clickable.
  const sidebarWidth = sidebarCollapsed ? 68 : 232;
  const { getToken } = useAuth();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const leadParam = searchParams.get("lead");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [variantFilter, setVariantFilter] = useState("all");
  const [probabilityFilter, setProbabilityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadLeads(nextOffset = offset) {
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(nextOffset),
        status_filter: statusFilter,
        probability_status: probabilityFilter,
        variant_filter: variantFilter,
      });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      const data = await call<LeadPage>(`/admin/ai-underwriter-leads?${params.toString()}`);
      setRows(data.items);
      setTotal(data.total);
      setOffset(data.offset);
      if (!data.items.length) setNotice("No dealer leads match these filters.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Dealer leads are unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function openLead(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setNotice("");
    try {
      const data = await call<LeadDetail>(`/admin/ai-underwriter-leads/${id}`);
      setDetail(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lead detail is unavailable.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function createLead(payload: CreateLeadPayload) {
    setCreating(true);
    setNotice("");
    try {
      const res = await call<LeadDetail>("/admin/ai-underwriter-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      await loadLeads(0);
      await openLead(res.intake.id);
    } catch (error) {
      // Duplicate email → backend returns 409 with the existing intake_id; open it.
      if (error instanceof ApiError && error.status === 409) {
        const detail = (error.body as { detail?: { intake_id?: string; message?: string } } | undefined)?.detail;
        if (detail?.intake_id) {
          setCreateOpen(false);
          setNotice(detail.message || "A lead already exists for this email — opening it.");
          await openLead(detail.intake_id);
          return;
        }
      }
      setNotice(error instanceof Error ? error.message : "Could not create the lead.");
    } finally {
      setCreating(false);
    }
  }

  async function exportPdf(id: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/admin/ai-underwriter-leads/${id}/intelligence.pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      setNotice(`PDF export failed: ${res.status} ${res.statusText}`);
      return;
    }
    // Prefer the server's dealer-named Content-Disposition filename.
    const dealer = detail?.intake.business_name || detail?.intake.full_name || "";
    const safeDealer = dealer.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = (match && decodeURIComponent(match[1].trim().replace(/"/g, ""))) || (safeDealer ? `${safeDealer}-intelligence.pdf` : "dealer-ai-intelligence.pdf");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadPackageZip(id: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/admin/ai-underwriter-leads/${id}/package.zip`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) throw new Error(`Package export failed: ${res.status} ${res.statusText}`);
    // Prefer the server's Content-Disposition filename (already named after the
    // dealer), falling back to the dealer name from the loaded lead detail.
    const dealer = detail?.intake.business_name || detail?.intake.full_name || "";
    const safeDealer = dealer.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    const disposition = res.headers.get("Content-Disposition") || "";
    const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
    const filename = (match && decodeURIComponent(match[1].trim().replace(/"/g, ""))) || (safeDealer ? `${safeDealer}-package.zip` : "underwriting-package.zip");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function refreshSelectedLead() {
    if (selectedId) await openLead(selectedId);
  }

  function closeLead() {
    setSelectedId(null);
    setDetail(null);
    // Strip ?lead= so the modal does not auto-reopen from the deep-link effect.
    if (leadParam) router.replace("/admin/ai-underwriter-leads");
    // Reflect any in-modal re-run/uploads in the list.
    loadLeads().catch(() => undefined);
  }

  // Re-run is driven by the in-app RunReviewDialog (themed confirm + live
  // progress), not a browser confirm. The button just opens the dialog.
  function openRerun() {
    if (selectedId) setRerunOpen(true);
  }

  async function startRerun(): Promise<{ review_id: string }> {
    if (!selectedId) throw new Error("No lead selected.");
    return call<{ review_id: string }>(`/admin/ai-underwriter-leads/${selectedId}/run-review`, { method: "POST" });
  }

  async function pollRerun(reviewId: string) {
    if (!selectedId) throw new Error("No lead selected.");
    return call<ReviewProgress>(`/admin/ai-underwriter-leads/${selectedId}/review-progress?review_id=${reviewId}`);
  }

  async function onRerunDone(completed: boolean) {
    if (completed) {
      await refreshSelectedLead();
      await loadLeads();
      setNotice("AI review re-run complete — showing the latest breakdown.");
    }
  }

  // Map the admin LeadDetail into the IntakeResponse shape the cockpit expects,
  // and build a Clerk-authenticated transport adapter against the admin endpoints.
  const cockpitResponse = useMemo<IntakeResponse | null>(() => {
    if (!detail) return null;
    return {
      token: null,
      session_token: null,
      intake: {
        id: detail.intake.id,
        bucket_id: detail.intake.bucket_id,
        full_name: detail.intake.full_name,
        email: detail.intake.email,
        phone: detail.intake.phone ?? null,
        business_name: detail.intake.business_name ?? null,
        loan_purpose: detail.intake.loan_purpose ?? null,
        requested_loan_amount: detail.intake.requested_loan_amount ?? null,
        estimated_credit_score: detail.intake.estimated_credit_score ?? null,
        referral_source: detail.intake.referral_source ?? null,
        status: detail.intake.status,
        result_snapshot: detail.intake.result_snapshot ?? null,
      },
      requested_documents: detail.requested_documents,
      files: detail.files,
      latest_review: detail.latest_review ?? null,
      messages: detail.messages,
      assistant_message: "",
      widget: null,
    } as unknown as IntakeResponse;
  }, [detail]);

  const cockpitAdapter = useMemo<LeadCockpitAdapter | null>(() => {
    if (!selectedId) return null;
    const base = `/admin/ai-underwriter-leads/${selectedId}`;
    const post = <T,>(path: string, body?: unknown) =>
      call<T>(`${base}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    return {
      sendChat: (message: string) => post<IntakeResponse>("/chat", { message }),
      uploadInit: (payload) => post("/files/upload-init", payload),
      uploadComplete: async (fileId: string) => {
        await post("/files/complete", { file_id: fileId });
      },
      runReview: () => post<IntakeResponse>("/run-review"),
      reload: () => call<IntakeResponse>(base),
      loadClientThread: () => call<{ messages: Array<{ id: string; role: string; author_name?: string | null; content: string; created_at: string }> }>(`${base}/client-thread`),
      replyClientThread: (message: string) => post<{ messages: Array<{ id: string; role: string; author_name?: string | null; content: string; created_at: string }> }>("/client-thread/reply", { message }),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function generateExecutiveSummary(id: string) {
    setNotice("");
    try {
      await call<Artifact>(`/admin/ai-underwriter-leads/${id}/executive-summary`, { method: "POST" });
      await refreshSelectedLead();
      setNotice("Executive summary generated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Executive summary failed.");
    }
  }

  async function generateLenderPacket(id: string) {
    setNotice("");
    try {
      await call<Artifact>(`/admin/ai-underwriter-leads/${id}/lender-packet`, { method: "POST" });
      await refreshSelectedLead();
      setNotice("Lender packet generated.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lender packet failed.");
    }
  }

  async function previewVendorEmail(id: string, payload: { to_emails: string[]; cc_emails: string[]; subject?: string; body?: string; include_lender_packet?: boolean }) {
    setNotice("");
    try {
      const preview = await call<VendorEmailPreview>(`/admin/ai-underwriter-leads/${id}/vendor-email/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await refreshSelectedLead();
      return preview;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Vendor email preview failed.");
      throw error;
    }
  }

  async function sendVendorEmail(id: string, payload: VendorEmailSendPayload) {
    setNotice("");
    const res = await call<VendorEmailSendResult>(`/admin/ai-underwriter-leads/${id}/vendor-email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await refreshSelectedLead();
    return res;
  }

  async function ingestFromDrive(id: string, driveFileIds: string[]) {
    setNotice("");
    const res = await call<DriveIngestResult>(`/admin/ai-underwriter-leads/${id}/files/ingest-from-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drive_file_ids: driveFileIds }),
    });
    await refreshSelectedLead();
    return res;
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) loadLeads(0).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, statusFilter, variantFilter, probabilityFilter, submittedQuery]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN && leadParam && leadParam !== selectedId) {
      openLead(leadParam).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, leadParam]);

  const counts = useMemo(() => ({
    total,
    good: rows.filter((row) => row.probability_status === "Good probability - book call").length,
    booked: rows.filter((row) => row.call_booked).length,
    missing: rows.reduce((sum, row) => sum + row.missing_required_count, 0),
  }), [rows, total]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query);
  }

  if (me && me.role !== Role.SUPER_ADMIN) return null;

  return (
    <div style={{ height: "calc(100dvh - 105px)", maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12, minHeight: 0, overflow: "hidden" }}>
      <div style={{ flexShrink: 0, display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, color: t.ink, fontSize: 24, letterSpacing: -0.5 }}>AI Underwriter Leads</h1>
          <p style={{ margin: "4px 0 0", color: t.ink3, lineHeight: 1.35, fontSize: 13 }}>
            Dealer and real-estate funding review submissions, conversations, evidence, management packages, and vendor sends.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={qcBtnPrimary(t)} onClick={() => setCreateOpen(true)}>Create lead</button>
          <Link href="/admin/buckets" style={{ ...qcBtn(t), textDecoration: "none" }}>Buckets</Link>
        </div>
      </div>

      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
        <Stat title="Total leads" value={String(counts.total)} sub="all matching filters" t={t} />
        <Stat title="Good probability" value={String(counts.good)} sub="visible page" t={t} good />
        <Stat title="Booked calls" value={String(counts.booked)} sub="visible page" t={t} />
        <Stat title="Missing items" value={String(counts.missing)} sub="visible page" t={t} warn />
      </div>

      <Card pad={12} style={{ flexShrink: 0 }}>
        <form onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 190px 210px 250px auto", gap: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, dealership"
            style={inputStyle(t)}
          />
          <select value={variantFilter} onChange={(event) => { setOffset(0); setVariantFilter(event.target.value); }} style={inputStyle(t)}>
            {VARIANT_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={statusFilter} onChange={(event) => { setOffset(0); setStatusFilter(event.target.value); }} style={inputStyle(t)}>
            {STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select value={probabilityFilter} onChange={(event) => { setOffset(0); setProbabilityFilter(event.target.value); }} style={inputStyle(t)}>
            {PROBABILITY_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="submit" style={qcBtnPrimary(t)}>Search</button>
        </form>
      </Card>

      {notice ? <div style={{ color: t.warn, fontSize: 13, fontWeight: 700 }}>{notice}</div> : null}

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "1fr", gap: 14, alignItems: "stretch", overflow: "hidden" }}>
        <Card pad={0} style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={gridHeader(t)}>
            <span>Lead</span>
            <span>AI probability</span>
            <span>Evidence</span>
            <span>Next step</span>
            <span>Updated</span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 24, color: t.ink3 }}>Loading dealer leads...</div>
            ) : rows.map((row) => (
              <button key={row.id} type="button" onClick={() => openLead(row.id)} style={rowStyle(t, selectedId === row.id)}>
                <div style={{ minWidth: 0 }}>
                  <strong style={{ color: t.ink, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {row.business_name || row.full_name}
                  </strong>
                  <span style={{ color: t.ink3, fontSize: 12 }}>{variantLabel(row.variant)} · {row.full_name} · {row.email}</span>
                </div>
                <div>
                  <Pill bg={probabilityTone(t, row.probability_status).bg} color={probabilityTone(t, row.probability_status).fg}>
                    {row.probability_status || "No screen yet"}
                  </Pill>
                  <span style={{ color: t.ink3, fontSize: 12, display: "block", marginTop: 5 }}>
                    {row.confidence ? `${row.confidence} confidence` : row.latest_review_status || "awaiting review"}
                  </span>
                </div>
                <div style={{ color: t.ink2, fontSize: 13 }}>
                  <strong>{row.file_count}</strong> files · <strong>{row.missing_required_count}</strong> missing
                  <span style={{ display: "block", color: row.call_booked ? t.profit : t.ink3, marginTop: 5 }}>
                    {row.call_booked ? "Call booked" : row.booking_recommended ? "Booking recommended" : "No booking yet"}
                  </span>
                </div>
                <div style={{ color: t.ink2, fontSize: 13, lineHeight: 1.35, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                  {row.one_next_step || "Awaiting AI next step."}
                </div>
                <div style={{ color: t.ink3, fontSize: 12 }}>{formatDate(row.updated_at)}</div>
              </button>
            ))}
          </div>
          <div style={{ flexShrink: 0, padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${t.line}` }}>
            <span style={{ color: t.ink3, fontSize: 12 }}>{total ? `${offset + 1}-${Math.min(offset + LIMIT, total)} of ${total}` : "0 leads"}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={qcBtn(t)} disabled={offset === 0 || loading} onClick={() => loadLeads(Math.max(0, offset - LIMIT))}>Previous</button>
              <button style={qcBtn(t)} disabled={offset + LIMIT >= total || loading} onClick={() => loadLeads(offset + LIMIT)}>Next</button>
            </div>
          </div>
        </Card>

      </div>

      <Modal open={!!selectedId} onClose={closeLead} size="stage" insetLeft={sidebarWidth} bodyStyle={{ display: "flex", flexDirection: "column" }}>
        {selectedId ? (
          <LeadDetailPanel
            detail={detail}
            loading={detailLoading}
            onClose={closeLead}
            onExport={() => exportPdf(selectedId)}
            onGenerateSummary={() => generateExecutiveSummary(selectedId)}
            onGeneratePacket={() => generateLenderPacket(selectedId)}
            onPreviewEmail={(payload) => previewVendorEmail(selectedId, payload)}
            onSendEmail={(payload) => sendVendorEmail(selectedId, payload)}
            onIngestFromDrive={(ids) => ingestFromDrive(selectedId, ids)}
            onRerun={openRerun}
            rerunning={rerunOpen}
            cockpitResponse={cockpitResponse}
            cockpitAdapter={cockpitAdapter}
            onCockpitResponse={() => { /* cockpit owns its live state; refresh the list lazily on close */ }}
            onDownloadZip={() => downloadPackageZip(selectedId)}
          />
        ) : null}
      </Modal>

      <RunReviewDialog
        open={rerunOpen}
        onClose={() => setRerunOpen(false)}
        onStart={startRerun}
        poll={pollRerun}
        onDone={onRerunDone}
      />

      {createOpen ? (
        <CreateLeadModal
          onClose={() => setCreateOpen(false)}
          onCreate={createLead}
          creating={creating}
        />
      ) : null}
    </div>
  );
}

function LeadDetailPanel({
  detail,
  loading,
  onClose,
  onExport,
  onGenerateSummary,
  onGeneratePacket,
  onPreviewEmail,
  onSendEmail,
  onIngestFromDrive,
  onRerun,
  rerunning,
  cockpitResponse,
  cockpitAdapter,
  onCockpitResponse,
  onDownloadZip,
}: {
  detail: LeadDetail | null;
  loading: boolean;
  onClose: () => void;
  onExport: () => void;
  onGenerateSummary: () => Promise<void> | void;
  onGeneratePacket: () => Promise<void> | void;
  onPreviewEmail: (payload: { to_emails: string[]; cc_emails: string[]; subject?: string; body?: string; include_lender_packet?: boolean }) => Promise<VendorEmailPreview>;
  onSendEmail: (payload: VendorEmailSendPayload) => Promise<VendorEmailSendResult>;
  onIngestFromDrive: (driveFileIds: string[]) => Promise<DriveIngestResult>;
  onRerun: () => void;
  rerunning: boolean;
  cockpitResponse: IntakeResponse | null;
  cockpitAdapter: LeadCockpitAdapter | null;
  onCockpitResponse: (r: IntakeResponse) => void;
  onDownloadZip: () => Promise<void>;
}) {
  const { t } = useTheme();
  const toast = useToast();
  const bookingLink = useBookingLink();
  const [activeTab, setActiveTab] = useState<"conversation" | "workspace">("conversation");
  const [workspaceSub, setWorkspaceSub] = useState<"overview" | "documents" | "client" | "package">("overview");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  // Real send (via the operator's connected Gmail) — recipients, Drive picker,
  // and selected Drive files to attach.
  const [toEmails, setToEmails] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  // Attachment toggles + how the recipient reaches the secure bucket.
  const [attachPacket, setAttachPacket] = useState(true);
  const [attachSummary, setAttachSummary] = useState(false);
  const [attachZip, setAttachZip] = useState(false);
  const [bucketAccess, setBucketAccess] = useState<BucketAccessMode>("login");
  // Separate picker for ingesting Drive files INTO the bucket for AI analysis
  // (distinct from the email-attach picker above).
  const [ingestPickerOpen, setIngestPickerOpen] = useState(false);
  const [ingestFiles, setIngestFiles] = useState<DriveFile[]>([]);
  const result = detail?.latest_review?.result || detail?.intake.result_snapshot || null;
  const evidence = asRecord(result?.document_evidence_map);
  const missing = arrayOfRecords(result?.missing_or_incomplete_items);
  const strengths = arrayOfStrings(result?.strengths);
  const risks = arrayOfStrings(result?.risks);
  const artifacts = detail?.artifacts || [];
  const summary = artifacts.find((artifact) => artifact.artifact_type === "executive_summary");
  const packet = artifacts.find((artifact) => artifact.artifact_type === "lender_packet");

  async function previewEmail() {
    setBusy("preview");
    try {
      // No recipients needed — this drafts a subject + body the operator copies
      // into their own mail client. The lender packet is regenerated so the draft
      // references the current evidence.
      const preview = await onPreviewEmail({
        to_emails: [],
        cc_emails: [],
        subject: subject || undefined,
        body: body || undefined,
        include_lender_packet: true,
      });
      setSubject(preview.subject);
      setBody(preview.body);
    } finally {
      setBusy("");
    }
  }

  // Parse a raw recipients string into { valid, invalid }. Unwraps display-name
  // forms ("Jane <jane@x.com>") and requires a real dot-bearing TLD so the
  // backend's strict EmailStr validation can't 422 the whole send on a token
  // that merely contained "@".
  function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
    const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const token of raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)) {
      const m = token.match(EMAIL_RE);
      if (m) valid.push(m[0]);
      else invalid.push(token);
    }
    return { valid, invalid };
  }

  async function sendEmail() {
    const to = parseEmails(toEmails);
    const cc = parseEmails(ccEmails);
    if (to.invalid.length || cc.invalid.length) {
      toast.show(`Fix these email addresses: ${[...to.invalid, ...cc.invalid].join(", ")}`);
      return;
    }
    if (!to.valid.length) {
      toast.show("Add at least one recipient email");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.show("Draft a subject and body first");
      return;
    }
    if (subject.trim().length > 512) {
      toast.show("Subject is too long (max 512 characters)");
      return;
    }
    if (body.trim().length > 12000) {
      toast.show("Body is too long (max 12,000 characters)");
      return;
    }
    setBusy("send");
    try {
      const res = await onSendEmail({
        to_emails: to.valid,
        cc_emails: cc.valid,
        subject: subject.trim(),
        body: body.trim(),
        include_lender_packet: attachPacket,
        attach_lender_packet: attachPacket,
        attach_executive_summary: attachSummary,
        attach_package_zip: attachZip,
        bucket_access: bucketAccess,
        drive_file_ids: driveFiles.map((f) => f.id),
      });
      const ok = (res.email_sends || []).filter((s) => !s.ses_error).length;
      const failed = (res.email_sends || []).length - ok;
      toast.show(failed ? `Sent ${ok}, ${failed} failed — check status` : `Sent to ${ok} recipient${ok === 1 ? "" : "s"}`);
    } catch (error) {
      toast.show(apiErrorMessage(error, "Send failed"));
    } finally {
      setBusy("");
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.show(`${label} copied`);
    } catch {
      toast.show("Copy failed");
    }
  }

  async function runIngest() {
    if (!ingestFiles.length) {
      toast.show("Pick at least one Drive file");
      return;
    }
    setBusy("ingest");
    try {
      const res = await onIngestFromDrive(ingestFiles.map((f) => f.id));
      const parts = [`${res.ingested} imported`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      const suffix = res.ingested ? " — Re-run AI review to fold them in" : "";
      toast.show(`${parts.join(", ")}${suffix}`);
      setIngestFiles([]);
      setIngestPickerOpen(false);
    } catch (error) {
      toast.show(apiErrorMessage(error, "Drive import failed"));
    } finally {
      setBusy("");
    }
  }

  async function downloadZip() {
    if (!detail) return;
    setZipBusy(true);
    try {
      await onDownloadZip();
      toast.show("Package downloaded");
    } catch (err) {
      toast.show(err instanceof Error ? err.message : "Package download failed");
    } finally {
      setZipBusy(false);
    }
  }

  return (
    <Card pad={0} style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: 16, borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: t.ink, fontSize: 18 }}>{detail?.intake.business_name || detail?.intake.full_name || "AI lead"}</h2>
          <p style={{ margin: "4px 0 0", color: t.ink3, fontSize: 12 }}>
            {detail ? `${variantLabel(detail.intake.variant)} · ${detail.intake.email}` : "Loading"}
          </p>
        </div>
        <button style={qcBtn(t)} onClick={onClose}>Close</button>
      </div>
      {loading || !detail ? (
        <div style={{ padding: 20, color: t.ink3 }}>Loading lead detail...</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ flexShrink: 0, padding: "12px 16px 0", display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 8 }}>
            {[
              ["conversation", "Conversation"],
              ["workspace", "Workspace"],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveTab(value as typeof activeTab)}
                style={{ ...qcBtn(t), background: activeTab === value ? t.brandSoft : t.surface2, color: activeTab === value ? t.brand : t.ink2 }}
              >
                {label}
              </button>
            ))}
          </div>
          {activeTab === "workspace" ? (
            <div style={{ flexShrink: 0, padding: "10px 16px 12px", display: "flex", gap: 6, borderBottom: `1px solid ${t.line}`, flexWrap: "wrap" }}>
              {[
                ["overview", "Overview"],
                ["documents", "Documents"],
                ["client", "Client conversation"],
                ["package", "Package"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWorkspaceSub(value as typeof workspaceSub)}
                  style={{ ...qcBtn(t), fontSize: 12, padding: "6px 12px", background: workspaceSub === value ? t.brand : t.surface2, color: workspaceSub === value ? t.inverse : t.ink2 }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{ flexShrink: 0, borderBottom: `1px solid ${t.line}`, marginTop: 12 }} />
          )}
          <div style={{ flex: 1, minHeight: 0, padding: 16, display: "grid", gap: 14, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill bg={probabilityTone(t, String(result?.probability_status || "")).bg} color={probabilityTone(t, String(result?.probability_status || "")).fg}>
              {String(result?.probability_status || "No screen yet")}
            </Pill>
            <Pill bg={detail.intake.call_booked ? t.profitBg : t.surface2} color={detail.intake.call_booked ? t.profit : t.ink2}>
              {detail.intake.call_booked ? "Call booked" : "Call not booked"}
            </Pill>
          </div>

          {activeTab === "conversation" ? (
            cockpitResponse && cockpitAdapter ? (
              <div style={{ flex: 1, minHeight: 460, display: "flex" }}>
                <LeadCockpit
                  response={cockpitResponse}
                  adapter={cockpitAdapter}
                  variant={detail.intake.variant}
                  initialMessages={detail.messages}
                  onResponse={onCockpitResponse}
                  onRequestRerun={onRerun}
                />
              </div>
            ) : (
              <span style={{ color: t.ink3 }}>Loading conversation…</span>
            )
          ) : null}

          {activeTab === "workspace" && workspaceSub === "overview" ? (
            <>
              <InfoBlock title="Contact">
                <Line label="Name" value={detail.intake.full_name} />
                <Line label="Email" value={detail.intake.email} />
                <Line label="Phone" value={detail.intake.phone || "-"} />
                <Line label="Requested amount" value={formatMoney(detail.intake.requested_loan_amount)} />
                <Line label="Use of funds" value={detail.intake.loan_purpose || "-"} />
                <Line label="Referral" value={detail.intake.referral_source || "-"} />
              </InfoBlock>

              <InfoBlock title="Actions">
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button style={{ ...qcBtnPrimary(t), opacity: rerunning ? 0.6 : 1, cursor: rerunning ? "wait" : "pointer" }} onClick={onRerun} disabled={rerunning}>
                    {rerunning ? "Re-running AI review…" : "Re-run AI review on latest uploads"}
                  </button>
                  <button style={qcBtn(t)} onClick={onExport}>Export intelligence PDF</button>
                  <Link href={`/admin/buckets`} style={{ ...qcBtn(t), textDecoration: "none" }}>Open Buckets</Link>
                  <button style={qcBtn(t)} onClick={() => navigator.clipboard.writeText(detail.intake.bucket_id)}>Copy bucket ID</button>
                </div>
                {detail.latest_review?.status ? (
                  <span style={{ display: "block", marginTop: 8, fontSize: 12, color: detail.latest_review.status === "failed" ? t.danger : t.ink3 }}>
                    Latest review: {detail.latest_review.status}
                    {detail.latest_review.error ? ` — ${detail.latest_review.error}` : ""}
                  </span>
                ) : null}
              </InfoBlock>

              <InfoBlock title="AI next step">
                <p style={{ margin: 0, color: t.ink2, lineHeight: 1.45 }}>{String(result?.one_next_step || result?.executive_summary || "Awaiting AI review.")}</p>
              </InfoBlock>

              <InfoBlock title="Evidence coverage">
                <CompactList rows={arrayOfRecords(evidence?.baseline_coverage).map((row) => ({
                  title: String(row.category || "Evidence"),
                  body: `${String(row.status || "unclear")} · ${Array.isArray(row.evidence) ? row.evidence.join(" | ") : String(row.evidence || row.gap || "")}`,
                }))} empty="No evidence map yet." />
              </InfoBlock>

              <InfoBlock title="Missing / blockers">
                <CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty="No missing items listed." />
              </InfoBlock>

              <InfoBlock title="Strengths / risks">
                <CompactList rows={[...strengths.map((item) => ({ title: "Strength", body: item })), ...risks.map((item) => ({ title: "Risk", body: item }))]} empty="Awaiting strengths and risks." />
              </InfoBlock>
            </>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "documents" ? (
            <InfoBlock title={`Uploaded files (${detail.files.length})`}>
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45, flex: 1, minWidth: 200 }}>
                    Import files from your Google Drive so the AI reads and learns from them — imported files are analyzed and folded into the review, just like uploads.
                  </span>
                  <button
                    style={qcBtn(t)}
                    disabled={busy !== ""}
                    title="Pick files from your connected Google Drive to analyze with the AI"
                    onClick={() => setIngestPickerOpen(true)}
                  >
                    {busy === "ingest" ? <><Spinner /> Importing…</> : `Add from Google Drive${ingestFiles.length ? ` (${ingestFiles.length})` : ""}`}
                  </button>
                </div>
                <div style={{ display: "grid", gap: 7 }}>
                  {detail.files.length ? detail.files.slice(0, 60).map((file) => (
                    <div key={file.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${t.line}`, paddingBottom: 7 }}>
                      <span style={{ color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.zip_entry_path || file.file_name}</span>
                      <span style={{ color: t.ink3, fontSize: 12 }}>{formatSize(file.size_bytes)}</span>
                    </div>
                  )) : <span style={{ color: t.ink3 }}>No uploaded files yet.</span>}
                </div>
              </div>
            </InfoBlock>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "client" && cockpitAdapter ? (
            <ClientConversation adapter={cockpitAdapter} clientName={detail.intake.full_name} />
          ) : null}

          {activeTab === "workspace" && workspaceSub === "package" ? (
            <>
              {/* Step 1 — Executive summary (short on-screen narrative) */}
              <InfoBlock title="1 · Executive summary">
                <div style={{ display: "grid", gap: 10 }}>
                  <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45 }}>
                    A short credit-officer memo in plain prose — read it here and copy it into notes or a message. It also becomes the opening of the lender packet PDF in step 2.
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button style={qcBtnPrimary(t)} onClick={async () => { setBusy("summary"); try { await onGenerateSummary(); toast.show("Executive summary ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "summary" ? <><Spinner /> Generating…</> : summary ? "Regenerate summary" : "Generate executive summary"}
                    </button>
                    <Pill bg={summary ? t.profitBg : t.surface2} color={summary ? t.profit : t.ink3}>{summary ? "Ready" : "Not started"}</Pill>
                    {summary ? <button style={qcBtn(t)} onClick={() => copyText("Summary", summary.body_text || String(summary.body_json?.executive_summary || ""))}>Copy summary</button> : null}
                    {summary?.title ? <button style={qcBtn(t)} onClick={() => copyText("Title", summary.title)}>Copy title</button> : null}
                  </div>
                  {summary ? (
                    <div style={{ display: "grid", gap: 6, border: `1px solid ${t.line}`, borderRadius: 10, padding: 12, background: t.surface, maxHeight: 260, overflowY: "auto" }}>
                      <strong style={{ color: t.ink }}>{summary.title}</strong>
                      <p style={{ margin: 0, color: t.ink2, whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: 13 }}>{summary.body_text || String(summary.body_json?.executive_summary || "")}</p>
                      <span style={{ color: t.ink3, fontSize: 12 }}>Generated {formatDateTime(summary.created_at)}</span>
                    </div>
                  ) : <span style={{ color: t.ink3, fontSize: 13 }}>Generate a polished underwriter summary from the analyzed evidence.</span>}
                </div>
              </InfoBlock>

              {/* Step 2 — Lender packet PDF (the full branded document) */}
              <InfoBlock title="2 · Lender packet PDF">
                <div style={{ display: "grid", gap: 10 }}>
                  <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45 }}>
                    The full branded document for a bank underwriter — landscape, white background, month-over-month bank charts (deposits, withdrawals, ending balance), a 2-year tax summary, Excel-style tables, our logo, and a CONFIDENTIAL watermark. Sensitive account and ID numbers are redacted.
                  </span>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button style={qcBtnPrimary(t)} onClick={async () => { setBusy("packet"); try { await onGeneratePacket(); toast.show("Lender packet ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "packet" ? <><Spinner /> Generating…</> : packet ? "Regenerate packet" : "Generate lender packet PDF"}
                    </button>
                    <Pill bg={packet ? t.profitBg : t.surface2} color={packet ? t.profit : t.ink3}>{packet ? "Ready" : "Not started"}</Pill>
                    {packet?.download_url ? <a href={packet.download_url} target="_blank" rel="noreferrer" style={{ ...qcBtn(t), textDecoration: "none" }}>Download / preview PDF</a> : null}
                    {packet ? <span style={{ color: t.ink3, fontSize: 12 }}>{formatDateTime(packet.created_at)}</span> : null}
                  </div>
                </div>
              </InfoBlock>

              {/* Step 3 — Ship it: full package + copy affordances */}
              <InfoBlock title="3 · Ship the package">
                <div style={{ display: "grid", gap: 10 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button style={qcBtnPrimary(t)} onClick={downloadZip} disabled={zipBusy}>
                      {zipBusy ? <><Spinner /> Building ZIP…</> : "Download full package (.zip)"}
                    </button>
                    <button style={qcBtn(t)} onClick={() => copyText("Bucket ID", detail.intake.bucket_id)}>Copy bucket ID</button>
                  </div>
                  <p style={{ margin: 0, color: t.ink3, fontSize: 12, lineHeight: 1.4 }}>
                    The ZIP bundles every uploaded document, the lender packet PDF, the executive summary, and an editable email template — ready to attach, upload, or archive anywhere.
                  </p>
                </div>
              </InfoBlock>

              {/* Step 4 — Draft, then either copy to your inbox OR send from your connected Gmail */}
              <InfoBlock title="4 · Email — draft, then copy or send">
                <div style={{ display: "grid", gap: 10 }}>
                  <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.45 }}>
                    Draft a lender/vendor email from the analyzed evidence. Copy the subject and body into your own mail client, or add recipients below and send it straight from your connected Gmail with the lender packet plus any Google Drive files attached.
                  </span>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Subject</label>
                    <div style={{ position: "relative" }}>
                      <input value={subject} maxLength={512} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject line" style={{ ...inputStyle(t), width: "100%", paddingRight: 40 }} />
                      <CopyIconButton t={t} disabled={!subject.trim()} onCopy={() => copyText("Subject", subject)} style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)" }} />
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Body</label>
                    <div style={{ position: "relative" }}>
                      <textarea value={body} maxLength={12000} onChange={(event) => setBody(event.target.value)} placeholder="Prepare a draft, or write the email body here" style={{ ...inputStyle(t), width: "100%", minHeight: 200, paddingTop: 10, paddingRight: 40, resize: "vertical", lineHeight: 1.5 }} />
                      <CopyIconButton t={t} disabled={!body.trim()} onCopy={() => copyText("Body", body)} style={{ position: "absolute", right: 8, top: 8 }} />
                    </div>
                  </div>

                  {/* Recipients — only used by the "Send via your Gmail" path. */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>To</label>
                      <input value={toEmails} onChange={(e) => setToEmails(e.target.value)} placeholder="lender@bank.com" style={{ ...inputStyle(t), width: "100%" }} />
                    </div>
                    <div style={{ display: "grid", gap: 6 }}>
                      <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Cc <span style={{ textTransform: "none", fontWeight: 500 }}>(optional)</span></label>
                      <input value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} placeholder="comma-separated" style={{ ...inputStyle(t), width: "100%" }} />
                    </div>
                  </div>

                  {/* Selected Google Drive attachments */}
                  {driveFiles.length > 0 ? (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {driveFiles.map((f) => (
                        <span key={f.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 999, padding: "4px 8px 4px 10px", fontSize: 12, color: t.ink }}>
                          <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <button
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setDriveFiles((prev) => prev.filter((x) => x.id !== f.id))}
                            style={{ border: "none", background: "transparent", color: t.ink3, cursor: "pointer", fontSize: 14, lineHeight: 1, padding: 0 }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {/* Attachments + secure-bucket access — controls what actually
                      goes out when "Send via your Gmail" is used. */}
                  <div style={{ display: "grid", gap: 8, border: `1px solid ${t.line}`, borderRadius: 10, padding: "10px 12px" }}>
                    <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Attach to the email</label>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: t.ink, cursor: "pointer" }}>
                        <input type="checkbox" checked={attachPacket} onChange={(e) => setAttachPacket(e.target.checked)} /> Lender packet PDF
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: t.ink, cursor: "pointer" }}>
                        <input type="checkbox" checked={attachSummary} onChange={(e) => setAttachSummary(e.target.checked)} /> Executive summary (.txt)
                      </label>
                      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: t.ink, cursor: "pointer" }}>
                        <input type="checkbox" checked={attachZip} onChange={(e) => setAttachZip(e.target.checked)} /> Full package (.zip)
                      </label>
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 2 }}>
                      <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Bucket access</label>
                      <select value={bucketAccess} onChange={(e) => setBucketAccess(e.target.value as BucketAccessMode)} style={{ ...inputStyle(t), padding: "4px 8px", minWidth: 210 }}>
                        <option value="login">Vendor login link (invited email)</option>
                        <option value="passcode">Link + access code (no login)</option>
                        <option value="none">No bucket access</option>
                      </select>
                      <span style={{ color: t.ink3, fontSize: 12 }}>
                        {bucketAccess === "passcode"
                          ? "A one-time access code is generated and included in the email."
                          : bucketAccess === "login"
                            ? "Recipient logs in with their invited vendor email."
                            : "The email carries only the attachments above."}
                      </span>
                    </div>
                    <span style={{ color: t.ink3, fontSize: 11.5, lineHeight: 1.4 }}>
                      Files over 8&nbsp;MB (or a combined set over ~18&nbsp;MB) fall back to the secure bucket link instead of attaching.
                    </span>
                  </div>

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <button style={qcBtnPrimary(t)} onClick={async () => { setBusy("preview"); try { await previewEmail(); toast.show("Draft ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "preview" ? <><Spinner /> Drafting…</> : (subject || body) ? "Regenerate draft" : "Draft email with AI"}
                    </button>
                    <button
                      style={qcBtn(t)}
                      disabled={busy !== "" || !subject.trim() || !body.trim() || !toEmails.trim()}
                      title={!subject.trim() || !body.trim() ? "Draft a subject and body first" : !toEmails.trim() ? "Add at least one recipient in the To field" : "Send from your connected Gmail (falls back to firm email)"}
                      onClick={sendEmail}
                    >
                      {busy === "send" ? <><Spinner /> Sending…</> : "Send via your Gmail"}
                    </button>
                    <button
                      style={qcBtn(t)}
                      disabled={busy !== ""}
                      title="Attach files from your connected Google Drive"
                      onClick={() => setDrivePickerOpen(true)}
                    >
                      Attach from Drive{driveFiles.length ? ` (${driveFiles.length})` : ""}
                    </button>
                    <button
                      style={qcBtn(t)}
                      disabled={!bookingLink.data?.url}
                      title={bookingLink.data?.url ? "Append your booking link to the body" : "Enable your Booking Page first (Booking Page in the sidebar)"}
                      onClick={() => {
                        const url = bookingLink.data?.url;
                        if (!url) return;
                        setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}Book a time with me: ${url}`);
                        toast.show("Booking link inserted");
                      }}
                    >
                      Insert booking link
                    </button>
                  </div>
                </div>
              </InfoBlock>
            </>
          ) : null}
          </div>
        </div>
      )}
      {/* Toast mounted at Card level so success/error messages show on every
          tab (Documents ingest, Overview, etc.), not just the package composer. */}
      <Toast msg={toast.msg} />
      <DriveFilePicker
        open={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        selectedIds={driveFiles.map((f) => f.id)}
        onPick={(file) => {
          setDriveFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]));
        }}
        onUnpick={(id) => setDriveFiles((prev) => prev.filter((f) => f.id !== id))}
      />
      <DriveFilePicker
        open={ingestPickerOpen}
        mode="ingest"
        busy={busy === "ingest"}
        maxSelect={50}
        onClose={() => setIngestPickerOpen(false)}
        selectedIds={ingestFiles.map((f) => f.id)}
        onPick={(file) => {
          setIngestFiles((prev) => {
            if (prev.some((f) => f.id === file.id)) return prev;
            if (prev.length >= 50) return prev;
            return [...prev, file];
          });
        }}
        onUnpick={(id) => setIngestFiles((prev) => prev.filter((f) => f.id !== id))}
        onConfirm={runIngest}
      />
    </Card>
  );
}

function DriveFilePicker({
  open,
  onClose,
  selectedIds,
  onPick,
  onUnpick,
  mode = "attach",
  busy = false,
  maxSelect,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onPick: (file: DriveFile) => void;
  onUnpick: (id: string) => void;
  mode?: "attach" | "ingest";
  busy?: boolean;
  maxSelect?: number;
  onConfirm?: () => void;
}) {
  const { t } = useTheme();
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  // Only fetch once the picker is open; hitting /google/drive/files when the
  // operator hasn't connected Drive returns [] (best-effort), so no error state.
  const { data, isLoading, isError, refetch, isFetching } = useDriveFiles(submitted || undefined, open);
  const files = data?.files ?? [];
  const ingest = mode === "ingest";

  function fmtSize(size?: string | null): string {
    const n = size ? Number(size) : NaN;
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Modal open={open} onClose={onClose} title={ingest ? "Add from Google Drive" : "Attach from Google Drive"} icon="paperclip" size="md">
      <div style={{ display: "grid", gap: 12, padding: 16 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") setSubmitted(query.trim()); }}
            placeholder="Search your Drive files by name…"
            style={{ ...inputStyle(t), flex: 1 }}
          />
          <button style={qcBtn(t)} onClick={() => setSubmitted(query.trim())}>Search</button>
        </div>
        <span style={{ color: t.ink3, fontSize: 12, lineHeight: 1.4 }}>
          {ingest
            ? "Only files you open or create with Qualified Commercial are visible here (Drive “file” scope). Selected files are imported into this file’s document set and analyzed by the AI. Files over 25 MB are skipped."
            : "Only files you open or create with Qualified Commercial are visible here (Drive “file” scope). Files over 8 MB, or a combined attachment set over ~18 MB, are shared via the secure bucket instead of attached."}
        </span>
        {isLoading || isFetching ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: t.ink3, fontSize: 13, padding: "12px 0" }}>
            <Spinner /> Loading Drive files…
          </div>
        ) : isError ? (
          <div style={{ display: "grid", gap: 8 }}>
            <span style={{ color: t.ink3, fontSize: 13 }}>Couldn’t reach Google Drive. Make sure your Google account is connected in Settings → Connections.</span>
            <button style={qcBtn(t)} onClick={() => refetch()}>Retry</button>
          </div>
        ) : files.length === 0 ? (
          <span style={{ color: t.ink3, fontSize: 13, padding: "12px 0" }}>
            {submitted ? "No matching Drive files." : "No Drive files found. Connect Google Drive in Settings → Connections, or search by name."}
          </span>
        ) : (
          <div style={{ display: "grid", gap: 4, maxHeight: 360, overflow: "auto" }}>
            {files.map((f) => {
              const picked = selectedIds.includes(f.id);
              const atCap = maxSelect !== undefined && !picked && selectedIds.length >= maxSelect;
              return (
                <button
                  key={f.id}
                  disabled={atCap}
                  title={atCap ? `Up to ${maxSelect} files per import` : undefined}
                  onClick={() => (picked ? onUnpick(f.id) : onPick(f))}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, textAlign: "left",
                    padding: "8px 10px", borderRadius: 8, cursor: atCap ? "not-allowed" : "pointer",
                    opacity: atCap ? 0.5 : 1,
                    border: `1px solid ${picked ? t.brand : t.line}`,
                    background: picked ? t.brandSoft : "transparent",
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: t.ink, fontSize: 13 }}>{f.name}</span>
                  <span style={{ color: t.ink3, fontSize: 11 }}>{fmtSize(f.size)}</span>
                  <span style={{ color: picked ? t.brand : t.ink3, fontSize: 12, fontWeight: 800 }}>{picked ? "Added" : "Add"}</span>
                </button>
              );
            })}
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          {ingest ? (
            <>
              <button style={qcBtn(t)} onClick={onClose} disabled={busy}>Cancel</button>
              <button style={qcBtnPrimary(t)} onClick={() => onConfirm?.()} disabled={busy || selectedIds.length === 0}>
                {busy ? <><Spinner /> Importing…</> : `Import & analyze${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
              </button>
            </>
          ) : (
            <button style={qcBtnPrimary(t)} onClick={onClose}>Done{selectedIds.length ? ` (${selectedIds.length})` : ""}</button>
          )}
        </div>
      </div>
    </Modal>
  );
}

function ClientConversation({ adapter, clientName }: { adapter: LeadCockpitAdapter; clientName?: string | null }) {
  const { t } = useTheme();
  const [messages, setMessages] = useState<ClientThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adapter
      .loadClientThread()
      .then((r) => { if (alive) setMessages(r.messages || []); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the client conversation."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adapter]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      const r = await adapter.replyClientThread(text);
      setMessages(r.messages || []);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ border: `1px solid ${t.warn}`, background: t.warnBg, borderRadius: 10, padding: "9px 12px", color: t.warn, fontSize: 12, lineHeight: 1.45 }}>
        This is the <strong>client-facing</strong> conversation{clientName ? ` with ${clientName}` : ""}. Anything you send here is visible to the client and is attributed to you as their underwriter. Your private notes stay in the Conversation tab.
      </div>

      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, maxHeight: 420, overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {loading ? (
          <span style={{ color: t.ink3, fontSize: 13 }}>Loading client conversation…</span>
        ) : messages.length === 0 ? (
          <span style={{ color: t.ink3, fontSize: 13 }}>No messages in the client conversation yet.</span>
        ) : (
          messages.map((m) => {
            const isClient = m.role === "user" && !(m.author_name || "").toLowerCase().startsWith("underwriter");
            const isAI = m.role === "assistant";
            const align = isClient ? "flex-start" : "flex-end";
            const bg = isAI ? t.surface2 : isClient ? t.surface2 : t.brandSoft;
            const label = isAI ? "AI" : m.author_name || (isClient ? clientName || "Client" : "You");
            return (
              <div key={m.id} style={{ display: "flex", flexDirection: "column", alignItems: align }}>
                <span style={{ color: t.ink3, fontSize: 10, marginBottom: 2 }}>{label}</span>
                <div style={{ maxWidth: "82%", background: bg, color: t.ink, borderRadius: 10, padding: "8px 11px", fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap", border: `1px solid ${t.line}` }}>
                  {m.content}
                </div>
              </div>
            );
          })
        )}
        {sending ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <span style={{ color: t.ink3, fontSize: 10, marginBottom: 2 }}>AI</span>
            <div style={{ background: t.surface2, borderRadius: 10, padding: "8px 11px", border: `1px solid ${t.line}` }}>
              <TypingDots label="Client AI is responding" />
            </div>
          </div>
        ) : null}
      </div>

      {error ? <div style={{ color: t.danger, fontSize: 12 }}>{error}</div> : null}

      <div style={{ display: "grid", gap: 6 }}>
        <label style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>Reply on behalf (as underwriter)</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter inserts a newline.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Answer the client here — Enter to send, Shift+Enter for a new line. They will see this and the AI will respond."
          style={{ ...inputStyle(t), minHeight: 90, paddingTop: 10, resize: "vertical", lineHeight: 1.5 }}
        />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button style={qcBtnPrimary(t)} onClick={send} disabled={sending || !draft.trim()}>
            {sending ? <><Spinner /> Sending…</> : "Send to client"}
          </button>
          <span style={{ color: t.ink3, fontSize: 12 }}>Visible to the client · attributed to you</span>
        </div>
      </div>
    </div>
  );
}

type CreateLeadPayload = {
  variant: "dealer" | "real_estate";
  full_name: string;
  email: string;
  phone?: string;
  business_name?: string;
  investor_name?: string;
  target_property_address?: string;
  transaction_type?: string;
  requested_amount?: number;
  estimated_value_or_purchase_price?: number;
  monthly_rent?: number;
  estimated_credit_tier?: string;
  notify_client: boolean;
};

function CreateLeadModal({
  onClose,
  onCreate,
  creating,
}: {
  onClose: () => void;
  onCreate: (payload: CreateLeadPayload) => void | Promise<void>;
  creating: boolean;
}) {
  const { t } = useTheme();
  const [variant, setVariant] = useState<"dealer" | "real_estate">("dealer");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [investorName, setInvestorName] = useState("");
  const [propertyAddress, setPropertyAddress] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [requestedAmount, setRequestedAmount] = useState("");
  const [propertyValue, setPropertyValue] = useState("");
  const [monthlyRent, setMonthlyRent] = useState("");
  const [creditTier, setCreditTier] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [error, setError] = useState("");

  const isRE = variant === "real_estate";
  const label = (text: string) => ({ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4, display: "block" });
  const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

  function submit() {
    if (!fullName.trim()) { setError("Client name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
    setError("");
    onCreate({
      variant,
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      business_name: isRE ? undefined : (businessName.trim() || undefined),
      investor_name: isRE ? (investorName.trim() || undefined) : undefined,
      target_property_address: isRE ? (propertyAddress.trim() || undefined) : undefined,
      transaction_type: isRE ? (transactionType.trim() || undefined) : undefined,
      requested_amount: isRE ? num(requestedAmount) : undefined,
      estimated_value_or_purchase_price: isRE ? num(propertyValue) : undefined,
      monthly_rent: isRE ? num(monthlyRent) : undefined,
      estimated_credit_tier: isRE ? (creditTier.trim() || undefined) : undefined,
      notify_client: notifyClient,
    });
  }

  return (
    <Modal open onClose={onClose} title="Create AI underwriter lead" size="md">
      <div style={{ display: "grid", gap: 12, padding: 4 }}>
        <p style={{ margin: 0, color: t.ink3, fontSize: 13, lineHeight: 1.45 }}>
          Create a lead on behalf of a client and start underwriting now. The client can log in later with this email (they receive a secure code by email).
        </p>

        <div>
          <label style={label("Type")}>Lead type</label>
          <select value={variant} onChange={(e) => setVariant(e.target.value as "dealer" | "real_estate")} style={{ ...inputStyle(t), width: "100%" }}>
            <option value="dealer">Dealer</option>
            <option value="real_estate">Real estate</option>
          </select>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={label("Name")}>Client full name *</label>
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" style={{ ...inputStyle(t), width: "100%" }} />
          </div>
          <div>
            <label style={label("Email")}>Client email *</label>
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" style={{ ...inputStyle(t), width: "100%" }} />
          </div>
          <div>
            <label style={label("Phone")}>Phone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Optional" style={{ ...inputStyle(t), width: "100%" }} />
          </div>
          {!isRE ? (
            <div>
              <label style={label("Business")}>Business name</label>
              <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Dealership / business" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
          ) : (
            <div>
              <label style={label("Investor")}>Investor / entity name</label>
              <input value={investorName} onChange={(e) => setInvestorName(e.target.value)} placeholder="Holdings LLC" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
          )}
        </div>

        {isRE ? (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={label("Property")}>Target property address</label>
              <input value={propertyAddress} onChange={(e) => setPropertyAddress(e.target.value)} placeholder="123 Main St, City ST" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
            <div>
              <label style={label("Transaction")}>Transaction type</label>
              <input value={transactionType} onChange={(e) => setTransactionType(e.target.value)} placeholder="purchase / refinance / cash-out" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
            <div>
              <label style={label("Credit")}>Estimated credit tier</label>
              <input value={creditTier} onChange={(e) => setCreditTier(e.target.value)} placeholder="e.g. 700+" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
            <div>
              <label style={label("Amount")}>Requested amount ($)</label>
              <input value={requestedAmount} onChange={(e) => setRequestedAmount(e.target.value)} inputMode="numeric" placeholder="500000" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
            <div>
              <label style={label("Value")}>Property value / price ($)</label>
              <input value={propertyValue} onChange={(e) => setPropertyValue(e.target.value)} inputMode="numeric" placeholder="800000" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
            <div>
              <label style={label("Rent")}>Monthly rent ($)</label>
              <input value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)} inputMode="numeric" placeholder="4500" style={{ ...inputStyle(t), width: "100%" }} />
            </div>
          </div>
        ) : null}

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.ink2, cursor: "pointer" }}>
          <input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} />
          Email the client a secure login/resume link now
        </label>

        {error ? <div style={{ color: t.danger, fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button style={qcBtn(t)} onClick={onClose} disabled={creating}>Cancel</button>
          <button style={qcBtnPrimary(t)} onClick={submit} disabled={creating}>
            {creating ? <><Spinner /> Creating…</> : "Create lead"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Stat({ title, value, sub, t, good, warn }: { title: string; value: string; sub: string; t: ReturnType<typeof useTheme>["t"]; good?: boolean; warn?: boolean }) {
  return (
    <Card pad={12}>
      <div style={{ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>{title}</div>
      <div style={{ marginTop: 6, color: good ? t.profit : warn ? t.warn : t.ink, fontSize: 24, fontWeight: 900 }}>{value}</div>
      <div style={{ color: t.ink3, fontSize: 12 }}>{sub}</div>
    </Card>
  );
}

function CopyIconButton({ t, onCopy, disabled, style }: { t: ReturnType<typeof useTheme>["t"]; onCopy: () => void; disabled?: boolean; style?: CSSProperties }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      disabled={disabled}
      title="Copy"
      aria-label="Copy"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 7, border: `1px solid ${t.line}`,
        background: t.surface2, color: disabled ? t.ink4 : t.ink2,
        cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.5 : 1, padding: 0,
        ...style,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </button>
  );
}

function Spinner() {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        borderRadius: 999,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        verticalAlign: "-2px",
        marginRight: 6,
        animation: "qc-spin 0.7s linear infinite",
      }}
    >
      <style>{"@keyframes qc-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}

function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <section style={{ display: "grid", gap: 8 }}>
      <h3 style={{ margin: 0, color: t.ink, fontSize: 13, textTransform: "uppercase", letterSpacing: 1 }}>{title}</h3>
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: 12, background: t.surface2 }}>{children}</div>
    </section>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "140px minmax(0,1fr)", gap: 10, padding: "4px 0" }}>
      <span style={{ color: t.ink3, fontSize: 12 }}>{label}</span>
      <strong style={{ color: t.ink, fontSize: 13, overflowWrap: "anywhere" }}>{value}</strong>
    </div>
  );
}

function CompactList({ rows, empty }: { rows: Array<{ title: string; body: string }>; empty: string }) {
  const { t } = useTheme();
  if (!rows.length) return <div style={{ color: t.ink3, fontSize: 13 }}>{empty}</div>;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      {rows.slice(0, 10).map((row, index) => (
        <div key={`${row.title}-${index}`} style={{ display: "grid", gap: 2 }}>
          <strong style={{ color: t.ink, fontSize: 13 }}>{row.title}</strong>
          <span style={{ color: t.ink2, fontSize: 12, lineHeight: 1.4 }}>{row.body}</span>
        </div>
      ))}
    </div>
  );
}

function gridHeader(t: ReturnType<typeof useTheme>["t"]) {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(220px,1.2fr) minmax(190px,.9fr) 170px minmax(240px,1.2fr) 100px",
    gap: 12,
    padding: "12px 16px",
    borderBottom: `1px solid ${t.line}`,
    color: t.ink3,
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
  };
}

function rowStyle(t: ReturnType<typeof useTheme>["t"], active: boolean) {
  return {
    width: "100%",
    display: "grid",
    gridTemplateColumns: "minmax(220px,1.2fr) minmax(190px,.9fr) 170px minmax(240px,1.2fr) 100px",
    gap: 12,
    alignItems: "center",
    padding: "15px 16px",
    border: 0,
    borderBottom: `1px solid ${t.line}`,
    background: active ? t.brandSoft : "transparent",
    textAlign: "left" as const,
    cursor: "pointer",
  };
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
  return {
    minHeight: 42,
    border: `1px solid ${t.line}`,
    borderRadius: 12,
    background: t.surface,
    color: t.ink,
    padding: "0 12px",
    outline: "none",
  };
}

function probabilityTone(t: ReturnType<typeof useTheme>["t"], value?: string | null) {
  if (value === "Good probability - book call") return { bg: t.profitBg, fg: t.profit };
  if (value === "Poor probability based on current file") return { bg: t.dangerBg, fg: t.danger };
  if (value === "Promising but needs one clarification") return { bg: t.warnBg, fg: t.warn };
  return { bg: t.surface2, fg: t.ink2 };
}

function variantLabel(value?: string | null) {
  if (value === "real_estate_dscr_v1") return "Real estate";
  // "dealer_gatekeeper_v1" is the canonical dealer marker; "dealer_financing_v1"
  // is the legacy value kept as a fallback during the deploy window.
  if (value === "dealer_gatekeeper_v1" || value === "dealer_financing_v1") return "Dealer";
  return "AI review";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatMoney(value?: number | null) {
  if (value == null) return "—";
  return value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(1)}M` : `$${Math.round(value).toLocaleString()}`;
}

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
