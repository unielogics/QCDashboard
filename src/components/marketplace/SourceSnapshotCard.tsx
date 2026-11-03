"use client";

// "Where the draft came from": the snapshot the prefill stored when the desk
// cut the listing from a file. It used to print raw JSON; it now reads as the
// file's readiness, its financial cockpit figures, the loan terms and the
// package, with the raw snapshot one click away for the curious.

import { CellChip, Lbl, Panel, type ChipTone } from "@/components/ds";
import { dscrLabel, dscrTone, money, multiple, signedPct, sourceLabel, type DscrStatus } from "@/lib/financialCockpit";

type Snapshot = Record<string, unknown>;

function section(snapshot: Snapshot, key: string): Record<string, unknown> | null {
  const value = snapshot[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))) return Number(value);
  return null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="fc-listing-item">
      <Lbl>{label}</Lbl>
      <div>{children}</div>
    </div>
  );
}

const ELIGIBILITY_TONE: Record<string, ChipTone> = { true: "ok", false: "bad", null: "mut" };

export function SourceSnapshotCard({ snapshot }: { snapshot: Snapshot | null | undefined }) {
  if (!snapshot || !Object.keys(snapshot).length) return null;
  const unified = section(snapshot, "unified");
  const readiness = section(snapshot, "readiness");
  const financials = section(snapshot, "financials");
  const sheet = section(snapshot, "term_sheet");
  const pkg = section(snapshot, "production_package");
  const loan = section(snapshot, "loan");
  const programs = Array.isArray(readiness?.programs) ? (readiness!.programs as Record<string, unknown>[]) : [];
  const dscr = num(financials?.dscr);
  const dscrStatus = (text(financials?.dscr_status) ?? "unavailable") as DscrStatus;
  const netProfit = num(financials?.net_profit);
  return (
    <Panel title="Where the draft came from" sub="Read from the file when the draft was cut; the numbers above are what members see, these are for the desk.">
      <div className="fc-listing-grid">
        <Item label="File">
          <strong>{text(snapshot.unified_title) ?? "—"}</strong>
          <div className="sub num">{text(snapshot.unified_ref) ?? text(snapshot.profile_id) ?? text(snapshot.loan_id) ?? "—"}{unified?.status ? ` · ${String(unified.status).replace(/_/g, " ")}` : ""}</div>
        </Item>
        {readiness ? (
          <Item label="Program readiness">
            {programs.length ? programs.map((program) => (
              <div key={String(program.key)} className="row" style={{ gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                <span>{String(program.name)}</span>
                <CellChip tone={ELIGIBILITY_TONE[String(program.eligible)] ?? "mut"}>{program.eligible === true ? "Eligible" : program.eligible === false ? "Not eligible" : "Unknown"}</CellChip>
                {program.requires_review ? <CellChip tone="warn">Review estimates</CellChip> : null}
              </div>
            )) : <span className="sub">No program selected.</span>}
            <div className="sub">Statements {String(readiness.bank_months_accepted ?? 0)} of {String(readiness.bank_months_required ?? 6)} accepted · tax years {Array.isArray(readiness.tax_years) && readiness.tax_years.length ? (readiness.tax_years as string[]).join(", ") : "none"} · debt schedule {readiness.has_debt_schedule ? "on file" : "missing"}</div>
          </Item>
        ) : null}
        {financials ? (
          <Item label="Financial cockpit">
            <div className="fc-stat-list">
              <div className="fc-stat"><span>Average monthly deposits</span><strong>{money(num(financials.avg_monthly_deposits))}</strong></div>
              <div className="fc-stat"><span>Annualized deposits</span><strong>{money(num(financials.annualized_deposits))}</strong></div>
              <div className="fc-stat"><span>Deposit trend</span><strong>{signedPct(num(financials.deposit_trend_pct))}</strong></div>
              <div className="fc-stat"><span>DSCR ({sourceLabel(text(financials.dscr_basis))})</span><strong>{multiple(dscr)} <CellChip tone={dscrTone(dscrStatus)}>{dscrLabel(dscrStatus)}</CellChip></strong></div>
              <div className="fc-stat"><span>Net profit ({sourceLabel(text(financials.net_profit_basis))}{text(financials.net_profit_period) ? `, ${text(financials.net_profit_period)}` : ""})</span><strong>{money(netProfit)}</strong></div>
              <div className="fc-stat"><span>NSF count</span><strong>{String(financials.nsf_total ?? "—")}</strong></div>
            </div>
          </Item>
        ) : null}
        {sheet ? (
          <Item label="Recorded loan terms">
            <strong>{money(num(sheet.approved_amount))}</strong> at {num(sheet.rate_pct) ?? "—"}% for {num(sheet.term_months) ?? "—"} months
            <div className="sub">{text(sheet.facility_type)?.replace(/_/g, " ") ?? ""}{text(sheet.maturity_date) ? ` · matures ${text(sheet.maturity_date)}` : ""}</div>
          </Item>
        ) : null}
        {pkg ? (
          <Item label="Production package">
            Stage {String(pkg.stage)} · {String(pkg.status).replace(/_/g, " ")} · version {String(pkg.version)}
          </Item>
        ) : null}
        {loan ? (
          <Item label="Loan">
            {text(loan.type)?.replace(/_/g, " ") ?? "Loan"} · {money(num(loan.amount))}{num(loan.final_rate) ?? num(loan.base_rate) ? ` at ${num(loan.final_rate) ?? num(loan.base_rate)}%` : ""}
            <div className="sub">{[text(loan.address), text(loan.city), text(loan.state)].filter(Boolean).join(", ")}</div>
          </Item>
        ) : null}
      </div>
      <details style={{ marginTop: 10 }}>
        <summary className="sub" style={{ cursor: "pointer" }}>Raw snapshot</summary>
        <pre className="msg-b" style={{ fontSize: 12, overflow: "auto" }}>{JSON.stringify(snapshot, null, 2)}</pre>
      </details>
    </Panel>
  );
}
