"use client";

// Universal, read-only admin view over every e-signed agreement on the
// platform -- merges 3 backend-side sources (Platform Access + Referral
// Protection contract_agreements, the 3 client-facing contract types +
// credit-authorization requested-document signatures, and payment
// pre-authorizations) into one paginated, searchable table. See
// app/routers/agreements.py for the merge logic; this page is a thin list
// view matching the AI Underwriter Leads page's list pattern (manual
// fetch + local state, offset/limit pagination, search+type filter).
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// The fetch, the pagination arithmetic, the role gate and every action are
// unchanged; only the surface vocabulary moved:
//   local gridHeader()/rowStyle() → `.gridhd` / `.gridrow`, with the bespoke
//                                   five-column track kept inline (rule 3)
//   local inputStyle()            → Input / Select (`.field`)
//   qcBtn / qcBtnPrimary          → Btn / BtnLink
//   notice string                 → WarnLine, which wraps (the old inline span
//                                   was a single amber line)
//   "No certificate" Pill         → CellChip

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Btn, BtnLink, CellChip, Input, Loading, PageHeader, Panel, Row, Select, Sub, WarnLine } from "@/components/ds";
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

// The list's own track. Bespoke — five columns sized to their contents, not
// spans of the twelve-column page grid — so it stays inline (rule 3) while
// `.gridhd` / `.gridrow` own everything that is not the track.
const COLS = "minmax(220px,1.3fr) minmax(200px,1fr) 140px 170px 130px";

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
    <div className="grid">
      <PageHeader
        title="Agreements"
        lede="Every e-signed agreement on the platform in one place -- Platform Access, Referral Protection, client-facing engagement contracts, credit authorizations, and payment pre-authorizations."
      />

      <Panel>
        <form
          onSubmit={submitSearch}
          // Bespoke: a growing search box, a fixed-width type filter and a
          // shrink-to-fit submit. Not a twelve-column page row.
          style={{ display: "grid", gridTemplateColumns: "minmax(240px,1fr) 260px auto", gap: 10, alignItems: "center" }}
        >
          <Input
            aria-label="Search agreements"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, company, contract #"
          />
          <Select
            aria-label="Filter by agreement type"
            value={typeFilter}
            onChange={(event) => { setOffset(0); setTypeFilter(event.target.value); }}
          >
            {TYPE_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </Select>
          <Btn variant="pri" type="submit">Search</Btn>
        </form>
      </Panel>

      {notice ? <WarnLine>{notice}</WarnLine> : null}

      <Panel noPad>
        <div className="gridhd" style={{ gridTemplateColumns: COLS }}>
          <span>Agreement</span>
          <span>Party</span>
          <span>Contract #</span>
          <span>Signed</span>
          <span></span>
        </div>
        {loading ? (
          <div className="panel-b"><Loading>Loading agreements...</Loading></div>
        ) : rows.map((row) => (
          <div key={`${row.source}-${row.id}`} className="gridrow" style={{ gridTemplateColumns: COLS }}>
            <div>
              <div className="trunc"><strong>{row.title}</strong></div>
              <Sub>{sourceLabel(row.source)} · v{row.document_version}</Sub>
            </div>
            <div>
              <div className="trunc">{row.party_name || row.typed_name || "—"}</div>
              <div className="trunc sub">
                {[row.party_email, row.party_company].filter(Boolean).join(" · ") || partyKindLabel(row.party_kind)}
              </div>
            </div>
            <div>{row.contract_number || "—"}</div>
            <Sub>{formatDateTime(row.signed_at)}</Sub>
            <Row className="end">
              {row.agreement_type === "referral_protection" && row.company_id ? (
                <Btn
                  size="sm"
                  onClick={() => setDealRegTarget({ id: row.company_id!, name: row.party_company || row.party_name || "Referral partner" })}
                >
                  Issue Deal Registration
                </Btn>
              ) : null}
              {row.certificate_download_url ? (
                <BtnLink size="sm" href={row.certificate_download_url} target="_blank" rel="noreferrer">
                  Certificate
                </BtnLink>
              ) : (
                <CellChip>No certificate</CellChip>
              )}
            </Row>
          </div>
        ))}
        {/* Pagination bar. `.panel > .panel-h:last-child` already drops the
            hairline under it, and the last `.gridrow` above supplies the one
            over it, so this needs no border of its own. */}
        <div className="panel-h">
          <Sub>{total ? `${offset + 1}-${Math.min(offset + LIMIT, total)} of ${total}` : "0 agreements"}</Sub>
          <span className="sp" />
          <Btn disabled={offset === 0 || loading} onClick={() => loadAgreements(Math.max(0, offset - LIMIT))}>Previous</Btn>
          <Btn disabled={offset + LIMIT >= total || loading} onClick={() => loadAgreements(offset + LIMIT)}>Next</Btn>
        </div>
      </Panel>

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
