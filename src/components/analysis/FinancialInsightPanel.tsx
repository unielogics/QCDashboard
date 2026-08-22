"use client";

import { Callout, Card, Kpi, KpiRow, Lbl, Panel } from "@/components/ds";
import { QC_FMT } from "@/lib/fmt";
import type { AnalysisProduct } from "@/lib/types";
import type { ReactNode } from "react";

type Payload = Record<string, unknown> | null | undefined;

function nested(source: Payload, path: string): unknown {
  if (!source) return undefined;
  return path.split(".").reduce<unknown>((cur, key) => {
    if (!cur || typeof cur !== "object") return undefined;
    return (cur as Record<string, unknown>)[key];
  }, source);
}

function num(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function pick(source: Payload, keys: string[]): number | null {
  for (const key of keys) {
    const found = num(key.includes(".") ? nested(source, key) : source?.[key]);
    if (found != null) return found;
  }
  return null;
}

function fmtMoney(value: number | null, digits = 0): string {
  return value != null ? QC_FMT.usd(value, digits) : "-";
}

function fmtPct(value: number | null, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return "-";
  const pct = Math.abs(value) <= 1.5 ? value * 100 : value;
  return `${pct.toFixed(digits)}%`;
}

function monthlyPayment(principal: number, annualRate: number, months: number): number {
  const r = annualRate / 12;
  if (r <= 0) return principal / months;
  const pow = Math.pow(1 + r, months);
  return principal * ((r * pow) / (pow - 1));
}

function buildAmortization({
  loanAmount,
  annualRate,
  monthlyPI,
  months,
  interestOnly,
}: {
  loanAmount: number | null;
  annualRate: number | null;
  monthlyPI: number | null;
  months: number;
  interestOnly: boolean;
}) {
  if (!loanAmount || !annualRate || loanAmount <= 0 || annualRate <= 0) return [];
  const r = annualRate / 12;
  const payment = interestOnly ? loanAmount * r : monthlyPI && monthlyPI > 0 ? monthlyPI : monthlyPayment(loanAmount, annualRate, months);
  let balance = loanAmount;
  const rows: Array<{ month: number; payment: number; principal: number; interest: number; balance: number }> = [];
  const markers = new Set([1, 2, 3, 6, 9, 12, 24, 36, 60, 120, 180, 240, 300, 360].filter((m) => m <= months));

  for (let month = 1; month <= months; month += 1) {
    const interest = balance * r;
    const principal = interestOnly ? 0 : Math.min(balance, Math.max(0, payment - interest));
    balance = Math.max(0, balance - principal);
    if (markers.has(month)) rows.push({ month, payment, principal, interest, balance });
    if (balance <= 0) break;
  }
  return rows;
}

const AMORT_COLS = ["Month", "Payment", "Principal", "Interest", "Balance"];

export function FinancialInsightPanel({
  product,
  inputs,
  output,
  framed = true,
}: {
  product?: AnalysisProduct | null;
  inputs?: Payload;
  output?: Payload;
  framed?: boolean;
}) {
  const loanAmount = pick(output, ["loan_amount", "loanAmount", "maxLoan"]) ?? pick(inputs, ["loan_amount", "requested_loan_amount", "amount"]);
  const propertyValue = pick(inputs, ["market_value", "property_value", "purchase_price", "arv"]);
  const rate = pick(output, ["final_rate", "rate"]) ?? pick(inputs, ["rate", "base_rate"]);
  const monthlyPI = pick(output, ["monthly_pi", "monthlyPI"]);
  const annualTaxes = pick(inputs, ["annual_taxes"]) ?? 0;
  const annualInsurance = pick(inputs, ["annual_insurance"]) ?? 0;
  const monthlyHoa = pick(inputs, ["monthly_hoa"]) ?? 0;
  const monthlyRent = pick(output, ["effective_rent"]) ?? pick(inputs, ["monthly_rent"]);
  const pitia = pick(output, ["effective_pitia"]) ?? ((monthlyPI ?? 0) + annualTaxes / 12 + annualInsurance / 12 + monthlyHoa);
  const dscr = pick(output, ["dscr"]) ?? (monthlyRent && pitia > 0 ? monthlyRent / pitia : null);
  const ltv = pick(output, ["sizing.ltv", "ltv"]) ?? (loanAmount && propertyValue ? loanAmount / propertyValue : null);
  const cashToClose = pick(output, ["total_cash_to_close", "cash_to_close_pricing", "cashToClose", "estimatedCashToClose"]);
  const hudTotal = pick(output, ["hud_total", "hudTotal"]);
  const interestOnly = product === "fix_flip";
  const termMonths = interestOnly ? 12 : 360;
  const amortization = buildAmortization({ loanAmount, annualRate: rate, monthlyPI, months: termMonths, interestOnly });
  const equity = loanAmount && propertyValue ? Math.max(0, propertyValue - loanAmount) : null;
  const paymentPieces = [
    { label: "P&I", value: monthlyPI ?? 0, color: "var(--petrol)" },
    { label: "Taxes", value: annualTaxes / 12, color: "var(--warn)" },
    { label: "Insurance", value: annualInsurance / 12, color: "var(--accent)" },
    { label: "HOA", value: monthlyHoa, color: "var(--ok)" },
  ].filter((p) => p.value > 0);

  const body = (
    <div className="grid">
      <KpiRow>
        <InsightStat label="Loan amount" value={fmtMoney(loanAmount)} />
        <InsightStat label="Final rate" value={rate != null ? fmtPct(rate, 3) : "-"} />
        <InsightStat label="PITIA" value={fmtMoney(pitia)} />
        <InsightStat label="DSCR" value={dscr != null ? `${dscr.toFixed(2)}x` : "-"} accent={dscr == null ? undefined : dscr >= 1.15 ? "var(--ok)" : dscr >= 1 ? "var(--warn)" : "var(--danger)"} />
        <InsightStat label="LTV" value={fmtPct(ltv)} accent={ltv == null ? undefined : ltv <= 0.75 ? "var(--ok)" : ltv <= 0.82 ? "var(--warn)" : "var(--danger)"} />
        <InsightStat label="Monthly rent" value={fmtMoney(monthlyRent)} />
        <InsightStat label="Cash to close" value={fmtMoney(cashToClose)} />
        <InsightStat label="HUD total" value={fmtMoney(hudTotal)} />
      </KpiRow>

      <div className="grid cols-auto">
        <ChartCard title="Capital stack">
          <StackBar
            items={[
              { label: "Loan", value: loanAmount ?? 0, color: "var(--petrol)" },
              { label: "Equity / gap", value: equity ?? 0, color: "var(--sunken)" },
            ]}
          />
          {/* The equity legend dot is deliberately darker than its bar segment:
              the segment is a light fill inside a tinted track, and the same
              light grey as an 8px dot on a white card is invisible. */}
          <ChartLegend items={[
            { label: "Loan", value: fmtMoney(loanAmount), color: "var(--petrol)" },
            { label: "Equity / gap", value: fmtMoney(equity), color: "var(--muted)" },
          ]} />
        </ChartCard>
        <ChartCard title="Monthly payment stack">
          <StackBar items={paymentPieces} />
          <ChartLegend items={paymentPieces.map((p) => ({ label: p.label, value: fmtMoney(p.value), color: p.color }))} />
        </ChartCard>
      </div>

      <div className="grid g8">
        <Lbl>{interestOnly ? "Interest-only schedule" : "Amortization schedule"}</Lbl>
        {amortization.length ? (
          // Hand-rolled rather than the ds `Table` for the 620px floor: five
          // money columns squeezed into a phone width wrap into mush, and
          // `.tbl` carries no min-width of its own.
          <div className="tblwrap">
            <table className="tbl" style={{ minWidth: 620 }}>
              <caption className="sr-only">{interestOnly ? "Interest-only schedule" : "Amortization schedule"}</caption>
              <thead>
                <tr>
                  {AMORT_COLS.map((h) => (
                    <th key={h} scope="col">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {amortization.map((row) => (
                  <tr key={row.month}>
                    <td className="num">{row.month}</td>
                    <td className="num">{fmtMoney(row.payment)}</td>
                    <td className="num">{fmtMoney(row.principal)}</td>
                    <td className="num">{fmtMoney(row.interest)}</td>
                    <td className="num">{fmtMoney(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Callout tone="acc">Run a calculation with loan amount and rate to generate the schedule.</Callout>
        )}
      </div>
    </div>
  );

  return framed ? (
    <Panel title="Deal analytics">{body}</Panel>
  ) : (
    <div className="grid">
      <Lbl>Deal analytics</Lbl>
      {body}
    </div>
  );
}

function InsightStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Kpi
      label={label}
      // The tone is chosen from the number (DSCR / LTV thresholds), so it is
      // data and stays inline. `.trunc` keeps a long figure inside the tile —
      // `.knum` is nowrap and would otherwise escape it.
      value={<div className="trunc" style={accent ? { color: accent } : undefined}>{value}</div>}
    />
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="grid g10">
      <Lbl>{title}</Lbl>
      {children}
    </Card>
  );
}

function StackBar({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  return (
    // Bespoke: a MULTI-segment stacked bar. `.track`/`.fill` is the single-value
    // meter and `.fill` owns its background, which here is one colour per
    // segment and therefore data.
    <div style={{ height: 14, borderRadius: 999, overflow: "hidden", background: "var(--sunken)", display: "flex", border: "1px solid var(--line2)" }}>
      {total > 0 ? items.map((item) => (
        <div
          key={item.label}
          title={`${item.label}: ${fmtMoney(item.value)}`}
          // Both values are derived from the figures being charted.
          style={{ width: `${Math.max(2, (item.value / total) * 100)}%`, background: item.color }}
        />
      )) : null}
    </div>
  );
}

function ChartLegend({ items }: { items: Array<{ label: string; value: string; color: string }> }) {
  return (
    <div className="grid g6">
      {items.map((item) => (
        <div key={item.label} className="row">
          {/* The swatch colour is the series colour — data. */}
          <span className="repdot" style={{ background: item.color }} />
          <span className="grow sub">{item.label}</span>
          <b className="num">{item.value}</b>
        </div>
      ))}
    </div>
  );
}
