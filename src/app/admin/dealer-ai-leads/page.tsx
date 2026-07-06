"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { useCurrentUser } from "@/hooks/useApi";

type LeadRow = {
  id: string;
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

const LIMIT = 25;

export default function AdminDealerAILeadsPage() {
  const { t } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { getToken } = useAuth();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const leadParam = searchParams.get("lead");
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [probabilityFilter, setProbabilityFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [notice, setNotice] = useState("");

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
      });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      const data = await call<LeadPage>(`/admin/dealer-ai-leads?${params.toString()}`);
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
      const data = await call<LeadDetail>(`/admin/dealer-ai-leads/${id}`);
      setDetail(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lead detail is unavailable.");
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportPdf(id: string) {
    const token = await getToken();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/admin/dealer-ai-leads/${id}/intelligence.pdf`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (!res.ok) {
      setNotice(`PDF export failed: ${res.status} ${res.statusText}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dealer-ai-intelligence.pdf";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.SUPER_ADMIN) router.replace("/");
  }, [meLoading, me, router]);

  useEffect(() => {
    if (me?.role === Role.SUPER_ADMIN) loadLeads(0).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.role, statusFilter, probabilityFilter, submittedQuery]);

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
          <h1 style={{ margin: 0, color: t.ink, fontSize: 24, letterSpacing: -0.5 }}>Car dealer AI leads</h1>
          <p style={{ margin: "4px 0 0", color: t.ink3, lineHeight: 1.35, fontSize: 13 }}>
            Public dealer funding review submissions, uploaded evidence, AI probability, booking status, and bucket access.
          </p>
        </div>
        <Link href="/programs/car-dealers" style={{ ...qcBtn(t), textDecoration: "none" }}>Dealer landing page</Link>
      </div>

      <div style={{ flexShrink: 0, display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
        <Stat title="Total leads" value={String(counts.total)} sub="all matching filters" t={t} />
        <Stat title="Good probability" value={String(counts.good)} sub="visible page" t={t} good />
        <Stat title="Booked calls" value={String(counts.booked)} sub="visible page" t={t} />
        <Stat title="Missing items" value={String(counts.missing)} sub="visible page" t={t} warn />
      </div>

      <Card pad={12} style={{ flexShrink: 0 }}>
        <form onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) 230px 260px auto", gap: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, dealership"
            style={inputStyle(t)}
          />
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

      <div style={{ flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: detail || selectedId ? "minmax(0,1fr) minmax(390px,480px)" : "1fr", gap: 14, alignItems: "stretch", overflow: "hidden" }}>
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
                  <span style={{ color: t.ink3, fontSize: 12 }}>{row.full_name} · {row.email}</span>
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

        {selectedId ? (
          <LeadDetailPanel
            detail={detail}
            loading={detailLoading}
            onClose={() => { setSelectedId(null); setDetail(null); }}
            onExport={() => exportPdf(selectedId)}
          />
        ) : null}
      </div>
    </div>
  );
}

function LeadDetailPanel({ detail, loading, onClose, onExport }: { detail: LeadDetail | null; loading: boolean; onClose: () => void; onExport: () => void }) {
  const { t } = useTheme();
  const result = detail?.latest_review?.result || detail?.intake.result_snapshot || null;
  const evidence = asRecord(result?.document_evidence_map);
  const missing = arrayOfRecords(result?.missing_or_incomplete_items);
  const strengths = arrayOfStrings(result?.strengths);
  const risks = arrayOfStrings(result?.risks);

  return (
    <Card pad={0} style={{ minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <div style={{ flexShrink: 0, padding: 16, borderBottom: `1px solid ${t.line}`, display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, color: t.ink, fontSize: 18 }}>{detail?.intake.business_name || detail?.intake.full_name || "Dealer lead"}</h2>
          <p style={{ margin: "4px 0 0", color: t.ink3, fontSize: 12 }}>{detail?.intake.email}</p>
        </div>
        <button style={qcBtn(t)} onClick={onClose}>Close</button>
      </div>
      {loading || !detail ? (
        <div style={{ padding: 20, color: t.ink3 }}>Loading lead detail...</div>
      ) : (
        <div style={{ flex: 1, minHeight: 0, padding: 16, display: "grid", gap: 14, overflowY: "auto" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill bg={probabilityTone(t, String(result?.probability_status || "")).bg} color={probabilityTone(t, String(result?.probability_status || "")).fg}>
              {String(result?.probability_status || "No screen yet")}
            </Pill>
            <Pill bg={detail.intake.call_booked ? t.profitBg : t.surface2} color={detail.intake.call_booked ? t.profit : t.ink2}>
              {detail.intake.call_booked ? "Call booked" : "Call not booked"}
            </Pill>
          </div>

          <InfoBlock title="Contact">
            <Line label="Name" value={detail.intake.full_name} />
            <Line label="Email" value={detail.intake.email} />
            <Line label="Phone" value={detail.intake.phone || "—"} />
            <Line label="Requested amount" value={formatMoney(detail.intake.requested_loan_amount)} />
            <Line label="Use of funds" value={detail.intake.loan_purpose || "—"} />
            <Line label="Referral" value={detail.intake.referral_source || "—"} />
          </InfoBlock>

          <InfoBlock title="Actions">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/admin/buckets`} style={{ ...qcBtnPrimary(t), textDecoration: "none" }}>Open Buckets</Link>
              <button style={qcBtn(t)} onClick={() => navigator.clipboard.writeText(detail.intake.bucket_id)}>Copy bucket ID</button>
              <button style={qcBtn(t)} onClick={onExport}>Export intelligence PDF</button>
            </div>
          </InfoBlock>

          <InfoBlock title="AI next step">
            <p style={{ margin: 0, color: t.ink2, lineHeight: 1.45 }}>{String(result?.one_next_step || result?.executive_summary || "Awaiting AI review.")}</p>
          </InfoBlock>

          <InfoBlock title="Uploaded files">
            <div style={{ display: "grid", gap: 7 }}>
              {detail.files.length ? detail.files.slice(0, 16).map((file) => (
                <div key={file.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, borderBottom: `1px solid ${t.line}`, paddingBottom: 7 }}>
                  <span style={{ color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.zip_entry_path || file.file_name}</span>
                  <span style={{ color: t.ink3, fontSize: 12 }}>{formatSize(file.size_bytes)}</span>
                </div>
              )) : <span style={{ color: t.ink3 }}>No uploaded files yet.</span>}
            </div>
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
        </div>
      )}
    </Card>
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
