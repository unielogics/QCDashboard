"use client";

import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import type { AnalysisProduct } from "@/lib/types";
import type { CSSProperties, ReactNode } from "react";

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
  const { t } = useTheme();
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
    { label: "P&I", value: monthlyPI ?? 0, color: t.petrol },
    { label: "Taxes", value: annualTaxes / 12, color: t.warn },
    { label: "Insurance", value: annualInsurance / 12, color: t.brand },
    { label: "HOA", value: monthlyHoa, color: t.profit },
  ].filter((p) => p.value > 0);

  const body = (
    <div style={{ display: "grid", gap: 14 }}>
      <SectionLabel>Deal analytics</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <InsightStat label="Loan amount" value={fmtMoney(loanAmount)} />
        <InsightStat label="Final rate" value={rate != null ? fmtPct(rate, 3) : "-"} />
        <InsightStat label="PITIA" value={fmtMoney(pitia)} />
        <InsightStat label="DSCR" value={dscr != null ? `${dscr.toFixed(2)}x` : "-"} accent={dscr == null ? undefined : dscr >= 1.15 ? t.profit : dscr >= 1 ? t.warn : t.danger} />
        <InsightStat label="LTV" value={fmtPct(ltv)} accent={ltv == null ? undefined : ltv <= 0.75 ? t.profit : ltv <= 0.82 ? t.warn : t.danger} />
        <InsightStat label="Monthly rent" value={fmtMoney(monthlyRent)} />
        <InsightStat label="Cash to close" value={fmtMoney(cashToClose)} />
        <InsightStat label="HUD total" value={fmtMoney(hudTotal)} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 12 }}>
        <ChartCard title="Capital stack">
          <StackBar
            items={[
              { label: "Loan", value: loanAmount ?? 0, color: t.petrol },
              { label: "Equity / gap", value: equity ?? 0, color: t.surface2 },
            ]}
          />
          <ChartLegend items={[
            { label: "Loan", value: fmtMoney(loanAmount), color: t.petrol },
            { label: "Equity / gap", value: fmtMoney(equity), color: t.ink3 },
          ]} />
        </ChartCard>
        <ChartCard title="Monthly payment stack">
          <StackBar items={paymentPieces} />
          <ChartLegend items={paymentPieces.map((p) => ({ label: p.label, value: fmtMoney(p.value), color: p.color }))} />
        </ChartCard>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 8 }}>
          {interestOnly ? "Interest-only schedule" : "Amortization schedule"}
        </div>
        {amortization.length ? (
          <div style={{ overflowX: "auto", border: `1px solid ${t.line}`, borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 620 }}>
              <thead>
                <tr>
                  {["Month", "Payment", "Principal", "Interest", "Balance"].map((h) => (
                    <th key={h} style={th(t)}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {amortization.map((row) => (
                  <tr key={row.month}>
                    <td style={td(t)}>{row.month}</td>
                    <td style={td(t)}>{fmtMoney(row.payment)}</td>
                    <td style={td(t)}>{fmtMoney(row.principal)}</td>
                    <td style={td(t)}>{fmtMoney(row.interest)}</td>
                    <td style={td(t)}>{fmtMoney(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.ink3, border: `1px solid ${t.line}`, borderRadius: 10, padding: 12 }}>
            Run a calculation with loan amount and rate to generate the schedule.
          </div>
        )}
      </div>
    </div>
  );

  return framed ? <Card pad={14}>{body}</Card> : body;
}

function InsightStat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 9, padding: 10, background: t.surface2, minWidth: 0 }}>
      <div style={{ fontSize: 10, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 16, color: accent ?? t.ink, fontWeight: 800, marginTop: 4, fontFeatureSettings: '"tnum"', overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 10, padding: 12, background: t.surface2, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 800, marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

function StackBar({ items }: { items: Array<{ label: string; value: number; color: string }> }) {
  const { t } = useTheme();
  const total = items.reduce((sum, item) => sum + Math.max(0, item.value), 0);
  return (
    <div style={{ height: 14, borderRadius: 999, overflow: "hidden", background: t.line, display: "flex", border: `1px solid ${t.lineStrong}` }}>
      {total > 0 ? items.map((item) => (
        <div
          key={item.label}
          title={`${item.label}: ${fmtMoney(item.value)}`}
          style={{ width: `${Math.max(2, (item.value / total) * 100)}%`, background: item.color }}
        />
      )) : null}
    </div>
  );
}

function ChartLegend({ items }: { items: Array<{ label: string; value: string; color: string }> }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: t.ink2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: item.color, flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{item.label}</span>
          <span style={{ color: t.ink, fontWeight: 800, fontFeatureSettings: '"tnum"' }}>{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function th(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    textAlign: "left",
    padding: "9px 10px",
    fontSize: 10,
    color: t.ink3,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    borderBottom: `1px solid ${t.line}`,
    background: t.surface,
  };
}

function td(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    padding: "9px 10px",
    borderBottom: `1px solid ${t.line}`,
    color: t.ink2,
    fontSize: 12,
    fontFeatureSettings: '"tnum"',
  };
}
