"use client";

// Operator-facing full credit report. Renders every field iSoftPull
// surfaced — score models with reason codes, personal info, identity
// risk panel, address/employment history, tradelines, inquiries.
//
// Mounts on /clients/[id] under a "View full report" expansion.
// Backend: GET /credit/pulls/{pull_id}/parsed (super_admin/loan_exec/broker only).
//
// Restyled onto the plain-CSS design system: each former Card+SectionLabel is
// now one `.panel`, the field grids are `.grid` (auto-fit tracks stay inline —
// their minimum column widths are a per-section design call, not a 12-col
// span), and the status pills are `.cellchip`. The only colours still written
// inline are the two data-derived ones: the fraud-shield banner and the
// derogatory tradeline. Losing the red on a derog row would make it scan the
// same as a current account, which is the one thing this screen exists to
// prevent.

import { Icon } from "@/components/design-system/Icon";
import { BtnLink, CellChip, Panel, Sub, Tag } from "@/components/ds";
import type { ParsedReport, ParsedTradeAccount, ParsedInquiry } from "@/lib/types";

export function CreditReportDetail({
  report,
  loading,
  reportLink,
}: {
  report: ParsedReport | undefined;
  loading?: boolean;
  reportLink?: string | null;
}) {
  if (loading) {
    return (
      <Panel>
        <Sub>Loading credit report…</Sub>
      </Panel>
    );
  }
  if (!report) {
    return (
      <Panel>
        <Sub>No parsed credit report on file.</Sub>
      </Panel>
    );
  }

  const fraudText = report.identity_risk.fraud_shield?.text;
  const ofacStatus = report.identity_risk.ofac?.search_status ?? "—";
  const mlaStatus = report.identity_risk.mla?.covered_borrower_status ?? "—";

  return (
    <div className="grid">
      {/* Score models */}
      <Panel
        title="Credit scores"
        actions={
          reportLink ? (
            <BtnLink
              size="sm"
              href={reportLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Icon name="arrowR" size={11} /> View raw report
            </BtnLink>
          ) : undefined
        }
      >
        <div className="grid cols-auto">
          {report.scores.map((s, i) => (
            <div className="kpi" key={i}>
              <div className="lbl">{s.model}</div>
              <div className="knum num">{s.score ?? "—"}</div>
              {s.reason_codes.length > 0 ? (
                <ul className="sub" style={{ marginTop: 6 }}>
                  {s.reason_codes.map((rc, j) => (
                    <li key={j}>• {rc}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {report.scores.length === 0 ? <Sub>No scores parsed.</Sub> : null}
        </div>
      </Panel>

      {/* Identity Risk — most operationally important panel */}
      {(fraudText || ofacStatus !== "—" || mlaStatus !== "—") && (
        <Panel title="Identity risk">
          {fraudText ? (
            <div
              style={{
                background: "var(--danger-tint)",
                border: "1px solid rgba(180, 35, 24, 0.28)",
                borderRadius: 10,
                padding: "11px 13px",
                marginBottom: 12,
              }}
            >
              <div className="row">
                <Icon name="alert" size={18} color="var(--danger)" stroke={2.4} />
                <CellChip tone="bad">Fraud shield</CellChip>
                <strong>{fraudText}</strong>
              </div>
            </div>
          ) : null}
          <div
            className="grid"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))" }}
          >
            <KV label="OFAC search status" value={ofacStatus} />
            <KV label="MLA covered borrower" value={mlaStatus} />
          </div>
        </Panel>
      )}

      {/* Personal info + addresses + employment */}
      <Panel title="Personal information">
        <div
          className="grid"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}
        >
          {Object.entries(report.personal_info).map(([k, v]) => (
            <KV key={k} label={pretty(k)} value={v} />
          ))}
        </div>
      </Panel>

      {report.addresses.length > 0 && (
        <Panel title="Address history">
          <div className="grid cols-auto">
            {report.addresses.map((a, i) => (
              <div className="card" key={i}>
                <Tag>{a.period}</Tag>
                {Object.entries(a.fields).map(([k, v]) => (
                  <div className="kv" key={k}>
                    <span>{pretty(k)}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {report.employment.length > 0 && (
        <Panel title="Employment history">
          <div className="grid cols-auto">
            {report.employment.map((e, i) => (
              <div className="card" key={i}>
                <Tag>{e.period}</Tag>
                {Object.entries(e.fields).map(([k, v]) => (
                  <div className="kv" key={k}>
                    <span>{pretty(k)}</span>
                    <b>{v}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Tradelines */}
      <Panel title={`Trade accounts (${report.trade_accounts.length})`}>
        <div className="ladder">
          {report.trade_accounts.length === 0 ? <Sub>No tradelines.</Sub> : null}
          {report.trade_accounts.map((ta, i) => (
            <TradeRow key={i} account={ta} />
          ))}
        </div>
      </Panel>

      {/* Inquiries */}
      <Panel title={`Inquiries (${report.inquiries.length})`}>
        {report.inquiries.length === 0 ? <Sub>No inquiries on file.</Sub> : null}
        {report.inquiries.map((inq, i) => (
          <InquiryRow key={i} inq={inq} />
        ))}
      </Panel>

      {/* Public record + collections (only when present) */}
      {report.public_records.length > 0 && (
        <Panel
          title={`Public records (${report.public_records.length})`}
          actions={<CellChip tone="warn">Adverse</CellChip>}
        >
          <div className="tblwrap">
            <pre className="sub">{JSON.stringify(report.public_records, null, 2)}</pre>
          </div>
        </Panel>
      )}
      {report.collections.length > 0 && (
        <Panel
          title={`Collections (${report.collections.length})`}
          actions={<CellChip tone="warn">Adverse</CellChip>}
        >
          <div className="tblwrap">
            <pre className="sub">{JSON.stringify(report.collections, null, 2)}</pre>
          </div>
        </Panel>
      )}
    </div>
  );
}

/** Stacked label-over-value. Distinct from the `.kv` class, which is the
 *  space-between row used for the address/employment field lists. */
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="lbl">{label}</div>
      <div className="num">
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function TradeRow({ account }: { account: ParsedTradeAccount }) {
  const f = account.fields;
  const status = (f.account_status ?? "").toLowerCase();
  const rating = (f.account_rating ?? "").toLowerCase();
  const isDerog = /delinquen|past due|charge|collection|120 days|90 days|60 days|default/.test(rating);
  const isOpen = status === "open";
  const balance = f.balance ?? "0";
  const limit = f.credit_limit ?? "—";
  const company = f.company ?? "—";
  const accountType = f.account_type ?? "—";

  return (
    <div
      className="card"
      // Data-derived: a derogatory tradeline has to read as red at a glance.
      style={isDerog ? { borderColor: "var(--danger)", background: "var(--danger-tint)" } : undefined}
    >
      <div className="row">
        <strong>{company}</strong>
        <span className="sp" />
        <CellChip tone={isOpen ? "ok" : "mut"}>{f.account_status ?? "—"}</CellChip>
        {isDerog ? <CellChip tone="bad">Derogatory</CellChip> : null}
      </div>
      <div className="sub">
        {accountType} · {f.portfolio_type ?? "—"}
      </div>
      <div
        className="grid mt"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
      >
        <KV label="Balance" value={`$${balance}`} />
        {limit !== "0" && limit !== "—" ? <KV label="Limit" value={`$${limit}`} /> : null}
        {f.monthly_payment_amount ? <KV label="Monthly" value={`$${f.monthly_payment_amount}`} /> : null}
        {f.date_of_opening ? <KV label="Opened" value={f.date_of_opening} /> : null}
        {f.date_reported ? <KV label="Reported" value={f.date_reported} /> : null}
        {f.responsibility ? <KV label="Resp." value={f.responsibility} /> : null}
        {f.past_due && f.past_due !== "N/A" ? <KV label="Past due" value={`$${f.past_due}`} /> : null}
      </div>
      {f.account_rating ? (
        <div className="mt">
          {isDerog ? (
            <CellChip tone="bad">{f.account_rating}</CellChip>
          ) : (
            <Sub>{f.account_rating}</Sub>
          )}
        </div>
      ) : null}
    </div>
  );
}

function InquiryRow({ inq }: { inq: ParsedInquiry }) {
  return (
    <div className="filerow">
      <div className="num" style={{ minWidth: 82 }}>
        <strong>{inq.fields.date ?? "—"}</strong>
      </div>
      <div className="sp">
        <strong>{inq.fields.company ?? "—"}</strong>
        <div className="sub">{inq.fields.industry ?? ""}</div>
      </div>
    </div>
  );
}

function pretty(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
