"use client";

// Shared amortization schedule + P&I breakdown. Renders a full
// month-by-month schedule with cumulative interest, equity, and
// remaining balance. Used on both the standalone Simulator page and
// the loan-detail Criteria tab.
//
// For interest-only products the borrower pays only the interest each
// month with the full principal ballooning at maturity — the table
// collapses to a single recurring row + balloon note.
//
// Restyled onto the plain-CSS design system. The schedule is now a real
// `<table class="tbl">` rather than a seven-track grid pretending to be
// one, so the column headers are actually headers.

import { Fragment, useMemo, useState } from "react";
import { Btn, KpiRow, Panel, Table, Td, Tr } from "@/components/ds";
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
    <Panel title="Amortization & P&I breakdown" bodyClass="grid g10">
      {isIO ? (
        <>
          <div>
            This is an <strong>interest-only</strong> product — the borrower
            pays interest each month and the full principal balloons at maturity.
          </div>
          <KpiRow>
            <Stat label="Monthly interest" value={QC_FMT.usd(rows[0].interest, 2)} />
            <Stat label="Months to maturity" value={termMonths ? String(termMonths) : "—"} />
            <Stat label="Balloon principal" value={QC_FMT.usd(loanAmount, 0)} accent="var(--warn)" />
          </KpiRow>
        </>
      ) : (
        <>
          <KpiRow>
            <Stat label="Total interest (life of loan)" value={QC_FMT.usd(totalInterest, 0)} accent="var(--warn)" />
            <Stat label="Total principal" value={QC_FMT.usd(loanAmount, 0)} />
            <Stat label="Total paid" value={QC_FMT.usd(loanAmount + totalInterest, 0)} />
          </KpiRow>

          <Table
            caption="Amortization schedule"
            cols={[
              { label: "Month", width: 62 },
              { label: "Principal", align: "r" },
              { label: "Interest", align: "r" },
              { label: "Interest paid", align: "r" },
              { label: "Equity $", align: "r" },
              { label: "Equity %", align: "r", width: 74 },
              { label: "Balance", align: "r" },
            ]}
          >
            {visibleRows.map((row, idx) => {
              const prevRow = idx > 0 ? visibleRows[idx - 1] : null;
              const isGap = prevRow && row.n - prevRow.n > 1;
              const equityPct = loanAmount > 0 ? (row.cumulativePrincipal / loanAmount) * 100 : 0;
              return (
                <Fragment key={row.n}>
                  {isGap ? (
                    <Tr className="sub">
                      <Td colSpan={7}>
                        {/* A skipped-months marker sits under the whole row. */}
                        <span style={{ display: "block", textAlign: "center" }}>
                          … {prevRow ? row.n - prevRow.n - 1 : 0} months …
                        </span>
                      </Td>
                    </Tr>
                  ) : null}
                  <Tr>
                    <Td><strong>{row.n}</strong></Td>
                    <Td align="r" className="num">{QC_FMT.usd(row.principal, 2)}</Td>
                    <Td align="r" className="num">{QC_FMT.usd(row.interest, 2)}</Td>
                    {/* Data-derived: interest is the cost side of the ledger,
                        equity is the gain. Nothing in `.tbl td` owns colour. */}
                    <Td align="r" className="num"><span style={{ color: "var(--warn)" }}>{QC_FMT.usd(row.cumulativeInterest, 0)}</span></Td>
                    <Td align="r" className="num"><span style={{ color: "var(--ok)" }}>{QC_FMT.usd(row.cumulativePrincipal, 0)}</span></Td>
                    <Td align="r" className="num"><span style={{ color: "var(--ok)" }}>{equityPct.toFixed(1)}%</span></Td>
                    <Td align="r" className="num">{QC_FMT.usd(row.balance, 0)}</Td>
                  </Tr>
                </Fragment>
              );
            })}
          </Table>

          {!showAll && rows.length > 24 ? (
            <Btn className="ctrl-block" onClick={() => setShowAll(true)}>
              Show all {rows.length} months
            </Btn>
          ) : null}
          {showAll && rows.length > 24 ? (
            <Btn className="ctrl-block" onClick={() => setShowAll(false)}>
              Collapse schedule
            </Btn>
          ) : null}
        </>
      )}
    </Panel>
  );
}

/**
 * One stat tile.
 *
 * `.kpi` markup rather than the `Kpi` component because the figure carries a
 * tint on two of the five tiles — amber for the cost side of the ledger — and
 * `Kpi` only tones its delta chip. `.kpi .knum` owns everything except colour,
 * so the accent is the single inline value here.
 */
function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="knum num" style={accent ? { color: accent } : undefined}>{value}</div>
    </div>
  );
}
