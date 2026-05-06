"use client";

// Operator-facing full credit report. Renders every field iSoftPull
// surfaced — score models with reason codes, personal info, identity
// risk panel, address/employment history, tradelines, inquiries.
//
// Mounts on /clients/[id] under a "View full report" expansion.
// Backend: GET /credit/pulls/{pull_id}/parsed (super_admin/loan_exec/broker only).

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
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
  const { t } = useTheme();

  if (loading) {
    return (
      <Card pad={16}>
        <div style={{ fontSize: 13, color: t.ink3 }}>Loading credit report…</div>
      </Card>
    );
  }
  if (!report) {
    return (
      <Card pad={16}>
        <div style={{ fontSize: 13, color: t.ink3 }}>
          No parsed credit report on file.
        </div>
      </Card>
    );
  }

  const fraudText = report.identity_risk.fraud_shield?.text;
  const ofacStatus = report.identity_risk.ofac?.search_status ?? "—";
  const mlaStatus = report.identity_risk.mla?.covered_borrower_status ?? "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Score models */}
      <Card pad={16}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <SectionLabel>Credit scores</SectionLabel>
          {reportLink ? (
            <a
              href={reportLink}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontSize: 11, fontWeight: 700, color: t.brand, textDecoration: "none" }}
            >
              <Icon name="arrowR" size={11} /> View raw report
            </a>
          ) : null}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          {report.scores.map((s, i) => (
            <div key={i} style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
                {s.model}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', marginTop: 4 }}>
                {s.score ?? "—"}
              </div>
              {s.reason_codes.length > 0 ? (
                <ul style={{ margin: "8px 0 0", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 4 }}>
                  {s.reason_codes.map((rc, j) => (
                    <li key={j} style={{ fontSize: 11, color: t.ink3, lineHeight: 1.4 }}>
                      • {rc}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
          {report.scores.length === 0 ? (
            <div style={{ fontSize: 12, color: t.ink3 }}>No scores parsed.</div>
          ) : null}
        </div>
      </Card>

      {/* Identity Risk — most operationally important panel */}
      {(fraudText || ofacStatus !== "—" || mlaStatus !== "—") && (
        <Card pad={16} style={fraudText ? { borderColor: t.danger, background: t.dangerBg } : undefined}>
          <SectionLabel>Identity risk</SectionLabel>
          {fraudText ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: t.surface, borderRadius: 8, marginBottom: 10 }}>
              <Icon name="alert" size={18} color={t.danger} stroke={2.4} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 800, color: t.danger, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Fraud shield
                </div>
                <div style={{ fontSize: 13, color: t.ink, fontWeight: 600 }}>{fraudText}</div>
              </div>
            </div>
          ) : null}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 4 }}>
            <KV label="OFAC search status" value={ofacStatus} />
            <KV label="MLA covered borrower" value={mlaStatus} />
          </div>
        </Card>
      )}

      {/* Personal info + addresses + employment */}
      <Card pad={16}>
        <SectionLabel>Personal information</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 6 }}>
          {Object.entries(report.personal_info).map(([k, v]) => (
            <KV key={k} label={pretty(k)} value={v} />
          ))}
        </div>
      </Card>

      {report.addresses.length > 0 && (
        <Card pad={16}>
          <SectionLabel>Address history</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 6 }}>
            {report.addresses.map((a, i) => (
              <div key={i} style={{ border: `1px solid ${t.line}`, borderRadius: 8, padding: 10 }}>
                <Pill bg={t.surface2} color={t.ink2}>{a.period}</Pill>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {Object.entries(a.fields).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 12, color: t.ink2 }}>
                      <span style={{ color: t.ink3 }}>{pretty(k)}:</span> <strong style={{ color: t.ink }}>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {report.employment.length > 0 && (
        <Card pad={16}>
          <SectionLabel>Employment history</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 6 }}>
            {report.employment.map((e, i) => (
              <div key={i} style={{ border: `1px solid ${t.line}`, borderRadius: 8, padding: 10 }}>
                <Pill bg={t.surface2} color={t.ink2}>{e.period}</Pill>
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {Object.entries(e.fields).map(([k, v]) => (
                    <div key={k} style={{ fontSize: 12, color: t.ink2 }}>
                      <span style={{ color: t.ink3 }}>{pretty(k)}:</span> <strong style={{ color: t.ink }}>{v}</strong>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Tradelines */}
      <Card pad={16}>
        <SectionLabel>Trade accounts ({report.trade_accounts.length})</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {report.trade_accounts.length === 0 ? (
            <div style={{ fontSize: 12, color: t.ink3 }}>No tradelines.</div>
          ) : null}
          {report.trade_accounts.map((ta, i) => (
            <TradeRow key={i} account={ta} />
          ))}
        </div>
      </Card>

      {/* Inquiries */}
      <Card pad={16}>
        <SectionLabel>Inquiries ({report.inquiries.length})</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
          {report.inquiries.length === 0 ? (
            <div style={{ fontSize: 12, color: t.ink3 }}>No inquiries on file.</div>
          ) : null}
          {report.inquiries.map((inq, i) => (
            <InquiryRow key={i} inq={inq} />
          ))}
        </div>
      </Card>

      {/* Public record + collections (only when present) */}
      {report.public_records.length > 0 && (
        <Card pad={16} style={{ borderColor: t.warn }}>
          <SectionLabel>Public records ({report.public_records.length})</SectionLabel>
          <pre style={{ fontSize: 11, color: t.ink2, marginTop: 6 }}>
            {JSON.stringify(report.public_records, null, 2)}
          </pre>
        </Card>
      )}
      {report.collections.length > 0 && (
        <Card pad={16} style={{ borderColor: t.warn }}>
          <SectionLabel>Collections ({report.collections.length})</SectionLabel>
          <pre style={{ fontSize: 11, color: t.ink2, marginTop: 6 }}>
            {JSON.stringify(report.collections, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  const { t } = useTheme();
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: t.ink, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function TradeRow({ account }: { account: ParsedTradeAccount }) {
  const { t } = useTheme();
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
      style={{
        border: `1px solid ${isDerog ? t.danger : t.line}`,
        borderRadius: 10,
        padding: 12,
        background: isDerog ? t.dangerBg : t.surface,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <strong style={{ fontSize: 13, color: t.ink, flex: 1 }}>{company}</strong>
        <Pill bg={isOpen ? t.profitBg : t.surface2} color={isOpen ? t.profit : t.ink2}>
          {f.account_status ?? "—"}
        </Pill>
        {isDerog ? (
          <Pill bg={t.dangerBg} color={t.danger}>Derogatory</Pill>
        ) : null}
      </div>
      <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8 }}>{accountType} · {f.portfolio_type ?? "—"}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
        <KV label="Balance" value={`$${balance}`} />
        {limit !== "0" && limit !== "—" ? <KV label="Limit" value={`$${limit}`} /> : null}
        {f.monthly_payment_amount ? <KV label="Monthly" value={`$${f.monthly_payment_amount}`} /> : null}
        {f.date_of_opening ? <KV label="Opened" value={f.date_of_opening} /> : null}
        {f.date_reported ? <KV label="Reported" value={f.date_reported} /> : null}
        {f.responsibility ? <KV label="Resp." value={f.responsibility} /> : null}
        {f.past_due && f.past_due !== "N/A" ? <KV label="Past due" value={`$${f.past_due}`} /> : null}
      </div>
      {f.account_rating ? (
        <div style={{ fontSize: 11.5, color: isDerog ? t.danger : t.ink3, marginTop: 6, fontStyle: "italic" }}>
          {f.account_rating}
        </div>
      ) : null}
    </div>
  );
}

function InquiryRow({ inq }: { inq: ParsedInquiry }) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "flex", gap: 12, padding: "8px 12px",
      border: `1px solid ${t.line}`, borderRadius: 8,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, minWidth: 80, fontFeatureSettings: '"tnum"' }}>
        {inq.fields.date ?? "—"}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: t.ink }}>{inq.fields.company ?? "—"}</div>
        <div style={{ fontSize: 11, color: t.ink3 }}>{inq.fields.industry ?? ""}</div>
      </div>
    </div>
  );
}

function pretty(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
