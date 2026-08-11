"use client";

// Dealer-partner ("broker") portal: start dealer AI-intake applications on
// behalf of your own clients, chat/upload/run-review on them, and leave
// internal notes with the underwriting team. Curated subset of the admin
// "AI Underwriter Leads" cockpit — no credit-pull, program-fit, vendor-email,
// exports, or client-thread reply here; those stay admin-only. Every fetch in
// this file targets /broker/ai-underwriter-leads* only, by construction.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Modal } from "@/components/design-system/Modal";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { api, ApiError } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { useCurrentUser } from "@/hooks/useApi";
import { LeadCockpit, type LeadCockpitAdapter } from "@/components/admin/LeadCockpit";
import { RunReviewDialog, type ReviewProgress } from "@/components/admin/RunReviewDialog";
import { LeadNotesPanel, type LeadNote } from "@/components/broker/LeadNotesPanel";
import type { IntakeResponse } from "@/lib/intake";

type LeadRow = {
  id: string;
  bucket_id: string;
  bucket_name: string;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  status: string;
  outcome_status: string;
  probability_status?: string | null;
  one_next_step?: string | null;
  file_count: number;
  missing_required_count: number;
  updated_at: string;
};

type LeadPage = { items: LeadRow[]; total: number; limit: number; offset: number };

type RequestedDoc = { id: string; name: string; description?: string | null; required: boolean; status: string };
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
    result_snapshot?: Record<string, unknown> | null;
  };
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
  messages?: Array<{ id: string; role: string; content: string; created_at: string }>;
  notes?: LeadNote[];
};

type CreateLeadPayload = {
  full_name: string;
  email: string;
  phone?: string;
  business_name?: string;
  notify_client: boolean;
  preferred_language: "en" | "es";
};

const OUTCOME_COLUMNS: Array<{ key: "submitted" | "closed" | "denied"; label: string }> = [
  { key: "submitted", label: "Submitted" },
  { key: "closed", label: "Closed" },
  { key: "denied", label: "Denied" },
];

// Mirrors the program titles on /broker/programs -- keyed by the same slug
// passed via ?program=. Purely a display label for the create-lead modal's
// contextual note; BrokerLeadCreate has no program field to actually
// persist this against yet (see broker/programs/page.tsx's header comment).
const PROGRAM_TITLES: Record<string, string> = {
  sba: "SBA 7(a) / 504 / Express",
  "working-capital": "Dealer Working Capital Facility",
  floorplan: "Dealer Floorplan / Dealer LOC",
  "real-estate-backed": "Real Estate Backed Dealer Capital",
  "reinsurance-backed": "Reinsurance-Backed Financing",
  "bridge-private-credit": "Bridge / Private Credit Refinance",
};

export default function BrokerAIUnderwriterLeadsPage() {
  const { t } = useTheme();
  const { getToken } = useAuth();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [notesPosting, setNotesPosting] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [programLabel, setProgramLabel] = useState<string | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);

  // Coming from a "Start" button on /broker/programs -- auto-open the
  // create-lead modal with a contextual note naming the program. No
  // fabricated backend field: this is display-only, not persisted.
  useEffect(() => {
    const slug = searchParams.get("program");
    if (slug && PROGRAM_TITLES[slug]) {
      setProgramLabel(PROGRAM_TITLES[slug]);
      setCreateOpen(true);
    }
  }, [searchParams]);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }

  async function loadLeads() {
    setLoading(true);
    setNotice("");
    try {
      const data = await call<LeadPage>("/broker/ai-underwriter-leads?limit=100&offset=0");
      setRows(data.items);
      setTotal(data.total);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Leads are unavailable.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function openLead(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setNotice("");
    try {
      const data = await call<LeadDetail>(`/broker/ai-underwriter-leads/${id}`);
      setDetail(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lead detail is unavailable.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeLead() {
    setSelectedId(null);
    setDetail(null);
    loadLeads().catch(() => undefined);
  }

  async function refreshSelectedLead() {
    if (selectedId) await openLead(selectedId);
  }

  async function createLead(payload: CreateLeadPayload) {
    setCreating(true);
    setNotice("");
    try {
      const res = await call<LeadDetail>("/broker/ai-underwriter-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      setProgramLabel(null);
      await loadLeads();
      await openLead(res.intake.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const body = (error.body as { detail?: { intake_id?: string; message?: string } } | undefined)?.detail;
        if (body?.intake_id) {
          setCreateOpen(false);
          setNotice(body.message || "An active lead already exists for this email — opening it.");
          await openLead(body.intake_id);
          return;
        }
      }
      setNotice(error instanceof Error ? error.message : "Could not create the lead.");
    } finally {
      setCreating(false);
    }
  }

  async function postNote(content: string) {
    if (!selectedId) return;
    setNotesPosting(true);
    setNotesError(null);
    try {
      await call(`/broker/ai-underwriter-leads/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      await refreshSelectedLead();
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Could not post the note.");
    } finally {
      setNotesPosting(false);
    }
  }

  function openRerun() {
    if (selectedId) setRerunOpen(true);
  }

  async function requestDeletion() {
    if (!selectedId) return;
    if (!window.confirm("Flag this lead for deletion? This does not delete anything yet — a super admin must confirm before it's removed.")) return;
    setDeletionBusy(true);
    try {
      await call(`/broker/ai-underwriter-leads/${selectedId}/request-deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      });
      // The lead vanishes from this board once flagged — close and reload.
      closeLead();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not flag this lead for deletion.");
    } finally {
      setDeletionBusy(false);
    }
  }

  async function startRerun(): Promise<{ review_id: string }> {
    if (!selectedId) throw new Error("No lead selected.");
    return call<{ review_id: string }>(`/broker/ai-underwriter-leads/${selectedId}/run-review`, { method: "POST" });
  }

  async function pollRerun(reviewId: string) {
    if (!selectedId) throw new Error("No lead selected.");
    return call<ReviewProgress>(`/broker/ai-underwriter-leads/${selectedId}/review-progress?review_id=${reviewId}`);
  }

  async function onRerunDone(completed: boolean) {
    if (completed) {
      await refreshSelectedLead();
      await loadLeads();
      setNotice("AI review re-run complete.");
    }
  }

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
    const base = `/broker/ai-underwriter-leads/${selectedId}`;
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
      // Not offered to dealer partners — the broker page never renders a UI
      // element that would call these, so throwing is safe (never invoked).
      loadClientThread: () => {
        throw new Error("Client thread is not available in the broker portal.");
      },
      replyClientThread: () => {
        throw new Error("Client thread is not available in the broker portal.");
      },
      // Broker leads are always dealer-variant (create_broker_ai_lead never
      // offers a real-estate path), so these are unconditional here.
      requestPfs: async (ownerName?: string) => { await post("/request-pfs", { owner_name: ownerName || null }); },
      requestDebtSchedule: async () => { await post("/request-debt-schedule"); },
      submitPfs: async (payload) => { await post("/requested-documents/pfs", payload); },
      submitDebtSchedule: async (payload) => { await post("/requested-documents/debt-schedule", payload); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (meLoading) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }
  if (me && me.role !== Role.DEALER_PARTNER) {
    return (
      <main style={{ padding: 24 }}>
        <Card pad={20}>This page is only available to dealer partner accounts.</Card>
      </main>
    );
  }
  if (!loaded && !loading) {
    loadLeads().catch(() => undefined);
  }

  const columns = OUTCOME_COLUMNS.map((col) => ({
    ...col,
    rows: rows.filter((r) => r.outcome_status === col.key),
  }));

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: t.ink }}>My Leads</h1>
          <p style={{ margin: "4px 0 0", color: t.ink3, fontSize: 13 }}>{total} leads on file</p>
        </div>
        <button type="button" style={qcBtnPrimary(t)} onClick={() => setCreateOpen(true)}>
          New lead
        </button>
      </div>

      {notice ? <Card pad={12}><span style={{ color: t.ink2, fontSize: 13 }}>{notice}</span></Card> : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 14 }}>
        {columns.map((col) => (
          <Card key={col.key} pad={14}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <strong style={{ color: t.ink, fontSize: 13 }}>{col.label}</strong>
              <Pill bg={t.surface2} color={t.ink3}>{col.rows.length}</Pill>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {col.rows.length === 0 ? (
                <span style={{ color: t.ink3, fontSize: 12.5 }}>No leads here yet.</span>
              ) : (
                col.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openLead(row.id)}
                    style={{
                      textAlign: "left",
                      border: `1px solid ${t.line}`,
                      borderRadius: 12,
                      padding: 12,
                      background: t.surface2,
                      cursor: "pointer",
                      display: "grid",
                      gap: 4,
                    }}
                  >
                    <strong style={{ color: t.ink, fontSize: 13 }}>{row.business_name || row.full_name}</strong>
                    <span style={{ color: t.ink3, fontSize: 12 }}>{row.full_name} · {row.email}</span>
                    <span style={{ color: t.ink3, fontSize: 12 }}>
                      {row.file_count} files · {row.missing_required_count} missing
                    </span>
                    <span style={{ color: t.ink2, fontSize: 12 }}>{row.probability_status || row.one_next_step || "Awaiting AI screen"}</span>
                  </button>
                ))
              )}
            </div>
          </Card>
        ))}
      </div>

      <Modal open={!!selectedId} onClose={closeLead} size="stage" bodyStyle={{ display: "flex", flexDirection: "column" }}>
        {selectedId ? (
          detailLoading || !cockpitResponse || !cockpitAdapter ? (
            <div style={{ padding: 24, color: t.ink3 }}>Loading lead…</div>
          ) : (
            <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12, height: "100%", padding: 16, minHeight: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, color: t.ink, fontSize: 18 }}>{detail?.intake.business_name || detail?.intake.full_name}</h2>
                  <span style={{ color: t.ink3, fontSize: 12 }}>{detail?.intake.email}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill bg={t.surface2} color={t.ink2}>{detail?.intake.outcome_status}</Pill>
                  <button type="button" style={qcBtn(t)} disabled={deletionBusy} onClick={requestDeletion}>Request deletion</button>
                  <button type="button" style={qcBtn(t)} onClick={closeLead}>Close</button>
                </div>
              </div>
              <div style={{ position: "relative", overflow: "hidden", minHeight: 0 }}>
                <LeadCockpit
                  response={cockpitResponse}
                  adapter={cockpitAdapter}
                  initialMessages={detail?.messages}
                  onResponse={(r) => {
                    // Keep detail in sync with live cockpit turns so any
                    // remount (notes toggle, reopen) seeds the full thread.
                    setDetail((current) =>
                      current
                        ? {
                            ...current,
                            messages: r.messages ?? current.messages,
                            files: r.files ?? current.files,
                            requested_documents: r.requested_documents ?? current.requested_documents,
                            latest_review: r.latest_review ?? current.latest_review,
                            intake: { ...current.intake, result_snapshot: r.intake?.result_snapshot ?? current.intake.result_snapshot },
                          }
                        : current,
                    );
                  }}
                  onRequestRerun={openRerun}
                />
                <button
                  type="button"
                  onClick={() => setNotesOpen((v) => !v)}
                  aria-label={notesOpen ? "Hide internal notes" : "Show internal notes"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: notesOpen ? 360 : 0,
                    transform: "translateY(-50%)",
                    zIndex: 21,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    padding: "10px 6px",
                    borderRadius: "10px 0 0 10px",
                    border: `1px solid ${t.line}`,
                    borderRight: notesOpen ? `1px solid ${t.line}` : "none",
                    background: t.surface,
                    color: t.ink2,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 700,
                    transition: "right 200ms ease",
                  }}
                >
                  <Icon name={notesOpen ? "chevR" : "chevL"} size={12} />
                  <span style={{ writingMode: "vertical-rl", letterSpacing: 0.5 }}>
                    Notes{detail?.notes?.length ? ` (${detail.notes.length})` : ""}
                  </span>
                </button>
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 360,
                    zIndex: 20,
                    display: "grid",
                    transform: notesOpen ? "translateX(0)" : "translateX(100%)",
                    transition: "transform 200ms ease",
                    boxShadow: notesOpen ? "-8px 0 24px rgba(0,0,0,0.18)" : "none",
                  }}
                >
                  <LeadNotesPanel notes={detail?.notes ?? []} onPost={postNote} posting={notesPosting} error={notesError} />
                </div>
              </div>
            </div>
          )
        ) : null}
      </Modal>

      <RunReviewDialog open={rerunOpen} onClose={() => setRerunOpen(false)} onStart={startRerun} poll={pollRerun} onDone={onRerunDone} />

      {createOpen ? (
        <CreateBrokerLeadModal
          onClose={() => { setCreateOpen(false); setProgramLabel(null); }}
          onCreate={createLead}
          creating={creating}
          programLabel={programLabel}
        />
      ) : null}
    </main>
  );
}

function CreateBrokerLeadModal({
  onClose,
  onCreate,
  creating,
  programLabel,
}: {
  onClose: () => void;
  onCreate: (payload: CreateLeadPayload) => void | Promise<void>;
  creating: boolean;
  programLabel?: string | null;
}) {
  const { t } = useTheme();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "es">("en");
  const [error, setError] = useState("");

  const label = (text: string) => ({ color: t.ink3, fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: 1, marginBottom: 4, display: "block" });

  function submit() {
    if (!fullName.trim()) { setError("Client name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
    setError("");
    onCreate({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      business_name: businessName.trim() || undefined,
      notify_client: notifyClient,
      preferred_language: preferredLanguage,
    });
  }

  return (
    <Modal open onClose={onClose} title="Create a new lead" size="md">
      <div style={{ display: "grid", gap: 12, padding: 4 }}>
        <p style={{ margin: 0, color: t.ink3, fontSize: 13, lineHeight: 1.45 }}>
          Create a lead on behalf of your client and start underwriting now. Your client can log in later with this
          email — they receive a secure code by email.
        </p>

        {programLabel ? (
          <div style={{ border: `1px solid ${t.petrol}40`, background: t.petrolSoft, borderRadius: 10, padding: "8px 12px", fontSize: 12.5, color: t.petrol, fontWeight: 700 }}>
            Starting a lead for: {programLabel}
          </div>
        ) : null}

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
          <div>
            <label style={label("Business")}>Business name</label>
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Dealership / business" style={{ ...inputStyle(t), width: "100%" }} />
          </div>
          <div>
            <label style={label("Language")}>Preferred language (client)</label>
            <select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value as "en" | "es")} style={{ ...inputStyle(t), width: "100%" }}>
              <option value="en">English</option>
              <option value="es">Español (Spanish)</option>
            </select>
          </div>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: t.ink2, cursor: "pointer" }}>
          <input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} />
          Email the client a secure login/resume link now
        </label>

        {error ? <div style={{ color: t.danger, fontSize: 12 }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <button style={qcBtn(t)} onClick={onClose} disabled={creating}>Cancel</button>
          <button style={qcBtnPrimary(t)} onClick={submit} disabled={creating}>
            {creating ? "Creating…" : "Create lead"}
          </button>
        </div>
      </div>
    </Modal>
  );
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
