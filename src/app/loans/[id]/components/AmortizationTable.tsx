"use client";

// Shared amortization schedule + P&I breakdown. Renders a full
// month-by-month schedule with cumulative interest, equity, and
// remaining balance. Used on both the standalone Simulator page and
// the loan-detail Criteria tab.
//
// For interest-only products the borrower pays only the interest each
// month with the full principal ballooning at maturity — the table
// collapses to a single recurring row + balloon note.

import { useMemo, useState } from "react";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { qcBtn } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";

export type AmortizationStyle = "fully_amortizing" | "interest_only";

export function AmortizationTable({
  loanAmount,
  annualRate,
  termMonths,
  monthlyPI,
  style,
}: {
  loanAmount: number;
  annualRate: number;
  termMonths: number;
  monthlyPI: number;
  style?: AmortizationStyle;
}) {
  const { t } = useTheme();
  const [showAll, setShowAll] = useState(false);

  const isIO = style === "interest_only" || termMonths === 0;

  const rows = useMemo(() => {
    const r = annualRate / 12;
    if (isIO) {
      return [{
        n: 1,
        principal: 0,
        interest: loanAmount * r,
        balance: loanAmount,
        cumulativePrincipal: 0,
        cumulativeInterest: loanAmount * r,
      }];
    }
    let balance = loanAmount;
    let cumPrin = 0;
    let cumInt = 0;
    const out: Array<{
      n: number; principal: number; interest: number; balance: number;
      cumulativePrincipal: number; cumulativeInterest: number;
    }> = [];
    for (let n = 1; n <= termMonths; n++) {
      const interest = balance * r;
      const principal = Math.max(0, monthlyPI - interest);
      balance = Math.max(0, balance - principal);
      cumPrin += principal;
      cumInt += interest;
      out.push({ n, principal, interest, balance, cumulativePrincipal: cumPrin, cumulativeInterest: cumInt });
    }
    return out;
  }, [loanAmount, annualRate, termMonths, monthlyPI, isIO]);

  const totalInterest = isIO
    ? loanAmount * (annualRate / 12) * 12
    : rows[rows.length - 1]?.cumulativeInterest ?? 0;

  const visibleRows = isIO
    ? rows
    : showAll
      ? rows
      : [...rows.slice(0, 12), ...rows.slice(-12)];

  return (
    <Card pad={16}>
      <SectionLabel>Amortization & P&I breakdown</SectionLabel>
      {isIO ? (
        <div>
          <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.55, marginBottom: 12 }}>
            This is an <strong style={{ color: t.ink }}>interest-only</strong> product — the borrower
            pays interest each month and the full principal balloons at maturity.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <Stat t={t} label="Monthly interest" value={QC_FMT.usd(rows[0].interest, 2)} />
            <Stat t={t} label="Months to maturity" value={termMonths ? String(termMonths) : "—"} />
            <Stat t={t} label="Balloon principal" value={QC_FMT.usd(loanAmount, 0)} accent={t.warn} />
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Stat t={t} label="Total interest (life of loan)" value={QC_FMT.usd(totalInterest, 0)} accent={t.warn} />
            <Stat t={t} label="Total principal" value={QC_FMT.usd(loanAmount, 0)} />
            <Stat t={t} label="Total paid" value={QC_FMT.usd(loanAmount + totalInterest, 0)} />
          </div>
          <div
            style={{
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              overflow: "hidden",
              fontFeatureSettings: '"tnum"',
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "52px 1fr 1fr 1fr 1fr 60px 1fr",
                background: t.surface2,
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: t.ink3,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                gap: 6,
              }}
            >
              <div>Month</div>
              <div>Principal</div>
              <div>Interest</div>
              <div>Interest paid</div>
              <div>Equity $</div>
              <div>Equity %</div>
              <div>Balance</div>
            </div>
            {visibleRows.map((row, idx) => {
              const prevRow = idx > 0 ? visibleRows[idx - 1] : null;
              const isGap = prevRow && row.n - prevRow.n > 1;
              const equityPct = loanAmount > 0 ? (row.cumulativePrincipal / loanAmount) * 100 : 0;
              return (
                <div key={row.n}>
                  {isGap ? (
                    <div
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        color: t.ink3,
                        background: t.surface2,
                        borderTop: `1px dashed ${t.line}`,
                        borderBottom: `1px dashed ${t.line}`,
                        textAlign: "center",
                      }}
                    >
                      … {prevRow ? row.n - prevRow.n - 1 : 0} months …
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "52px 1fr 1fr 1fr 1fr 60px 1fr",
                      padding: "8px 12px",
                      fontSize: 11.5,
                      color: t.ink2,
                      borderTop: idx === 0 ? "none" : `1px solid ${t.line}`,
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: t.ink }}>{row.n}</div>
                    <div>{QC_FMT.usd(row.principal, 2)}</div>
                    <div>{QC_FMT.usd(row.interest, 2)}</div>
                    <div style={{ color: t.warn }}>{QC_FMT.usd(row.cumulativeInterest, 0)}</div>
                    <div style={{ color: t.profit }}>{QC_FMT.usd(row.cumulativePrincipal, 0)}</div>
                    <div style={{ color: t.profit, fontWeight: 600 }}>{equityPct.toFixed(1)}%</div>
                    <div>{QC_FMT.usd(row.balance, 0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {!showAll && rows.length > 24 ? (
            <button
              onClick={() => setShowAll(true)}
              style={{
                ...qcBtn(t),
                marginTop: 10,
                width: "100%",
                fontSize: 12,
              }}
            >
              Show all {rows.length} months
            </button>
          ) : null}
          {showAll && rows.length > 24 ? (
            <button
              onClick={() => setShowAll(false)}
              style={{
                ...qcBtn(t),
                marginTop: 10,
                width: "100%",
                fontSize: 12,
              }}
            >
              Collapse schedule
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Stat({
  t,
  label,
  value,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div style={{ background: t.surface2, padding: "10px 12px", borderRadius: 9 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: accent ?? t.ink, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}
