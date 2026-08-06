"use client";

// Universal, read-only admin view over every e-signed agreement on the
// platform -- merges 3 backend-side sources (Platform Access + Referral
// Protection contract_agreements, the 3 client-facing contract types +
// credit-authorization requested-document signatures, and payment
// pre-authorizations) into one paginated, searchable table. See
// app/routers/agreements.py for the merge logic; this page is a thin list
// view matching the AI Underwriter Leads page's list pattern (manual
// fetch + local state, offset/limit pagination, search+type filter).

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { api } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { useCurrentUser } from "@/hooks/useApi";
import { IssueDealRegistrationModal } from "@/components/IssueDealRegistrationModal";

type AgreementRow = {
  id: string;
  source: "contract" | "requested_document" | "payment_authorization";
  agreement_type: string;
  title: string;
  contract_number: string | null;
  party_name: string | null;
  party_email: string | null;
  party_company: string | null;
  party_kind: "user" | "company" | "lead" | "client" | "unknown";
  company_id: string | null;
  typed_name: string;
  signed_at: string | null;
  document_version: string;
  certificate_available: boolean;
  certificate_download_url: string | null;
  detail_url: string | null;
};

type AgreementPage = {
  items: AgreementRow[];
  total: number;
  limit: number;
  offset: number;
};

const LIMIT = 50;

const TYPE_FILTERS = [
  { value: "all", label: "All types" },
  { value: "platform_access", label: "Platform Access Agreement" },
  { value: "referral_protection", label: "Referral Protection Agreement" },
  { value: "contract_sba_engagement", label: "SBA Engagement Agreement" },
  { value: "contract_client_engagement", label: "Client Engagement Agreement" },
  { value: "contract_consulting_addendum", label: "Consulting Addendum" },
  { value: "credit_authorization", label: "Credit Report Authorization" },
  { value: "payment_authorization", label: "Payment Pre-Authorization" },
] as const;

export default function AdminAgreementsPage() {
  const { t } = useTheme();
  const { getToken } = useAuth();
  const { data: me } = useCurrentUser();

  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [dealRegTarget, setDealRegTarget] = useState<{ id: string; name: string } | null>(null);

  async function call<T>(path: string): Promise<T> {
    const token = await getToken();
    return api<T>(path, { authToken: token ?? undefined });
  }

  async function loadAgreements(nextOffset = offset) {
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams({
        limit: String(LIMIT),
        offset: String(nextOffset),
        agreement_type: typeFilter,
      });
      if (submittedQuery.trim()) params.set("q", submittedQuery.trim());
      const data = await call<AgreementPage>(`/admin/agreements?${params.toString()}`);
      setRows(data.items);
      setTotal(data.total);
      setOffset(data.offset);
      if (!data.items.length) setNotice("No signed agreements match these filters.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Agreements are unavailable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgreements(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedQuery, typeFilter]);

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    setOffset(0);
    setSubmittedQuery(query);
  }

  if (me && me.role !== Role.SUPER_ADMIN) return null;

  return (
    <div style={{ maxWidth: 1480, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <h1 style={{ margin: 0, color: t.ink, fontSize: 24, letterSpacing: -0.5 }}>Agreements</h1>
        <p style={{ margin: "4px 0 0", color: t.ink3, lineHeight: 1.35, fontSize: 13 }}>
          Every e-signed agreement on the platform in one place -- Platform Access, Referral Protection,
          client-facing engagement contracts, credit authorizations, and payment pre-authorizations.
        </p>
      </div>

      <Card pad={12}>
        <form onSubmit={submitSearch} style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 260px auto", gap: 10, alignItems: "center" }}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, company, contract #"
            style={inputStyle(t)}
          />
          <select value={typeFilter} onChange={(event) => { setOffset(0); setTypeFilter(event.target.value); }} style={inputStyle(t)}>
            {TYPE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button type="submit" style={qcBtnPrimary(t)}>Search</button>
        </form>
      </Card>

      {notice ? <div style={{ color: t.warn, fontSize: 13, fontWeight: 700 }}>{notice}</div> : null}

      <Card pad={0} style={{ overflow: "hidden" }}>
        <div style={gridHeader(t)}>
          <span>Agreement</span>
          <span>Party</span>
          <span>Contract #</span>
          <span>Signed</span>
          <span></span>
        </div>
        <div>
          {loading ? (
            <div style={{ padding: 24, color: t.ink3 }}>Loading agreements...</div>
          ) : rows.map((row) => (
            <div key={`${row.source}-${row.id}`} style={rowStyle(t)}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ color: t.ink, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.title}
                </strong>
                <span style={{ color: t.ink3, fontSize: 12 }}>{sourceLabel(row.source)} · v{row.document_version}</span>
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={{ color: t.ink, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {row.party_name || row.typed_name || "—"}
                </span>
                <span style={{ color: t.ink3, fontSize: 12, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {[row.party_email, row.party_company].filter(Boolean).join(" · ") || partyKindLabel(row.party_kind)}
                </span>
              </div>
              <div style={{ color: t.ink2, fontSize: 13 }}>{row.contract_number || "—"}</div>
              <div style={{ color: t.ink3, fontSize: 12 }}>{formatDateTime(row.signed_at)}</div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
                {row.agreement_type === "referral_protection" && row.company_id ? (
                  <button
                    type="button"
                    onClick={() => setDealRegTarget({ id: row.company_id!, name: row.party_company || row.party_name || "Referral partner" })}
                    style={{ ...qcBtn(t), padding: "6px 10px", fontSize: 12 }}
                  >
                    Issue Deal Registration
                  </button>
                ) : null}
                {row.certificate_download_url ? (
                  <a href={row.certificate_download_url} target="_blank" rel="noreferrer" style={{ ...qcBtn(t), padding: "6px 10px", fontSize: 12, textDecoration: "none" }}>
                    Certificate
                  </a>
                ) : (
                  <Pill>No certificate</Pill>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: `1px solid ${t.line}` }}>
          <span style={{ color: t.ink3, fontSize: 12 }}>{total ? `${offset + 1}-${Math.min(offset + LIMIT, total)} of ${total}` : "0 agreements"}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={qcBtn(t)} disabled={offset === 0 || loading} onClick={() => loadAgreements(Math.max(0, offset - LIMIT))}>Previous</button>
            <button style={qcBtn(t)} disabled={offset + LIMIT >= total || loading} onClick={() => loadAgreements(offset + LIMIT)}>Next</button>
          </div>
        </div>
      </Card>

      {dealRegTarget ? (
        <IssueDealRegistrationModal
          open
          onClose={() => setDealRegTarget(null)}
          companyId={dealRegTarget.id}
          companyName={dealRegTarget.name}
        />
      ) : null}
    </div>
  );
}

function sourceLabel(source: AgreementRow["source"]): string {
  if (source === "contract") return "Contract";
  if (source === "requested_document") return "Requested document";
  return "Billing";
}

function partyKindLabel(kind: AgreementRow["party_kind"]): string {
  if (kind === "user") return "Platform user";
  if (kind === "company") return "Referral partner company";
  if (kind === "lead") return "Lead";
  if (kind === "client") return "Client";
  return "Unresolved party";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function gridHeader(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(220px,1.3fr) minmax(200px,1fr) 140px 170px 130px",
    gap: 12,
    padding: "12px 16px",
    borderBottom: `1px solid ${t.line}`,
    color: t.ink3,
    fontSize: 11,
    fontWeight: 900,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  };
}

function rowStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: "minmax(220px,1.3fr) minmax(200px,1fr) 140px 170px 130px",
    gap: 12,
    alignItems: "center",
    padding: "13px 16px",
    borderBottom: `1px solid ${t.line}`,
  };
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
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
