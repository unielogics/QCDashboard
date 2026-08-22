"use client";

// LoanSimulator — DP-only client view for a started loan.
//
// CLIENTs see the loan's persisted ARV, LTV, product, and base rate as
// read-only chips. The only interactive control is the discount-points
// slider; the rate, monthly P&I, DSCR, and HUD-1 totals re-render live.
//
// Used in:
//   • Desktop Simulator → "My Loans" segment → tap loan
//   • Desktop loan-detail TermsTab when user.role === CLIENT (role gate)
//
// Operators get the existing TermsTab editor (full edit including ARV/LTV
// sliders + covenants + Save).
//
// Styling is the shared class system (globals.css + app-extras.css):
//   • the two-column split is `.withrail` — the results column is the rail,
//     so it stays in view while the left column scrolls and it collapses
//     under the form on a narrow window;
//   • the locked terms are a `.kpis` band of prose KPIs (the values are
//     phrases and short figures, not 26px headline numbers);
//   • the slider is the vendored `.scen` scenario-studio pattern, which owns
//     the accent colour and the full-width track;
//   • the simulated terms are `.kv` rows and the HUD-1 is a real `.tbl`.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CellChip,
  Kpi,
  KpiRow,
  Lbl,
  Panel,
  StatusLine,
  Table,
  Td,
  Tr,
  type ChipTone,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { useFredSeries, useLoans, useMyCredit } from "@/hooks/useApi";
import { EligibilityBanner } from "@/components/EligibilityBanner";
import {
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type SimulatorInputs,
} from "@/lib/eligibility";
import type { Loan } from "@/lib/types";

const PRODUCT_LABEL: Record<SimulatorInputs["productKey"], string> = {
  dscr: "DSCR Rental",
  ff:   "Fix & Flip",
  gu:   "Ground Up",
  br:   "Bridge",
};
const PRODUCT_TERM: Record<SimulatorInputs["productKey"], string> = {
  dscr: "30 yr amortized",
  ff:   "12 mo IO",
  gu:   "18 mo IO",
  br:   "24 mo IO",
};
const PRODUCT_TO_FRED: Record<SimulatorInputs["productKey"], string> = {
  dscr: "DGS10",
  ff:   "DPRIME",
  gu:   "DPRIME",
  br:   "SOFR",
};

function productKeyFor(loanType: string): SimulatorInputs["productKey"] {
  if (loanType === "dscr") return "dscr";
  if (loanType === "fix_and_flip") return "ff";
  if (loanType === "ground_up") return "gu";
  return "br";
}

export function LoanSimulator({ loan }: { loan: Loan }) {
  const router = useRouter();
  const { data: credit } = useMyCredit();
  const { data: loans = [] } = useLoans();
  const { data: fred } = useFredSeries();

  const propertyCount = loans.length;
  const hasYearOfOwnership = useMemo(() => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return loans.some(
      (l) => l.stage === "funded" && l.close_date && now - new Date(l.close_date).getTime() >= oneYearMs,
    );
  }, [loans]);

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount,
    hasYearOfOwnership,
    creditExpired: credit?.is_expired ?? false,
    creditExpiringSoon: credit?.expiring_soon ?? false,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  const productKey = productKeyFor(loan.type);
  const arvNum = loan.arv != null ? Number(loan.arv) : 0;
  const ltvFraction = loan.ltv != null ? Number(loan.ltv) : 0.65;
  const ltvPct = Math.round(ltvFraction * 100);

  const [points, setPoints] = useState(Math.min(2, Math.max(0, loan.discount_points || 0)));

  const liveRate = fred?.find((s) => s.series_id === PRODUCT_TO_FRED[productKey]);
  const baseRatePct =
    loan.base_rate != null ? Number(loan.base_rate) * 100 : liveRate?.estimated_rate ?? undefined;

  const sim = useMemo(() => {
    if (arvNum <= 0) return null;
    return computeSimulator({
      arv: arvNum,
      ltv: ltvFraction,
      discountPoints: points,
      productKey,
      baseRatePct,
    });
  }, [arvNum, ltvFraction, points, productKey, baseRatePct]);

  return (
    <div className="withrail">
      <div className="grid">
        {eligibility.banner ? <EligibilityBanner banner={eligibility.banner} /> : null}

        {/* Locked terms — read-only figures that mirror the loan record.
            The padlock moved from each of the four tiles to one chip in the
            band header: it says the same thing once instead of four times,
            and `.cellchip` is a flex box so the glyph sits on the text. */}
        <div>
          <div className="row">
            <Lbl>Locked terms</Lbl>
            <CellChip tone="mut" title="Set when this loan was started. Only your loan executive can change them.">
              <Icon name="lock" size={11} stroke={2.4} />
              Locked
            </CellChip>
          </div>
          <KpiRow className="mt">
            <Kpi
              label="Product"
              value={PRODUCT_LABEL[productKey]}
              sub={PRODUCT_TERM[productKey]}
              prose
            />
            <Kpi label="ARV" value={QC_FMT.usd(arvNum, 0)} prose />
            <Kpi label="LTV" value={`${ltvPct}%`} sub={ltvLabel(ltvFraction)} prose />
            <Kpi
              label="Base rate"
              value={baseRatePct != null ? `${baseRatePct.toFixed(3)}%` : "—"}
              sub={liveRate ? `${liveRate.label} +${liveRate.spread_bps} bps` : "Locked at intake"}
              prose
            />
          </KpiRow>
          <div className="sub mt">
            These were set when this loan was started. Your loan executive can adjust them — you&apos;ll
            see updates here automatically.
          </div>
        </div>

        {/* Discount points — the only interactive input */}
        <Panel title="Discount points">
          <div className="scen">
            <div className="sl">
              <div className="slh">
                <span>0–2 pts</span>
                <b>{points.toFixed(2)} pts</b>
              </div>
              <input
                type="range"
                min={0}
                max={2}
                step={0.25}
                value={points}
                aria-label="Discount points"
                onChange={(e) => setPoints(Number(e.target.value))}
              />
            </div>
          </div>
          <div className="sub mt">
            {points > 0 ? `−${Math.round(points * 25)} bps off base rate` : "No buy-down · base rate"}
          </div>
          <div className="sub">Buying points reduces your rate but adds upfront cost.</div>
        </Panel>
      </div>

      {/* Result KPIs + HUD breakdown */}
      <div className="railcol">
        <Panel title="Simulated terms">
          {sim ? (
            <div>
              <ResultRow label="Loan amount" value={QC_FMT.usd(sim.loanAmount, 0)} />
              <ResultRow label="Final rate" value={`${(sim.rate * 100).toFixed(3)}%`} tone="acc" />
              <ResultRow label="Monthly P&I" value={QC_FMT.usd(sim.monthlyPI, 0)} />
              {productKey === "dscr" && sim.dscr != null ? (
                <ResultRow
                  label="DSCR"
                  value={sim.dscr.toFixed(2)}
                  // Tone is read off the ratio — the one thing on this panel
                  // that is genuinely data-derived. It picks a class, not a
                  // colour, so the palette stays in the stylesheet.
                  tone={sim.dscr > 1.25 ? "ok" : sim.dscr > 1 ? "warn" : "bad"}
                />
              ) : null}
              <ResultRow label="Discount points cost" value={QC_FMT.usd(sim.pointsCost, 0)} />
              <ResultRow label="Cash to close" value={QC_FMT.usd(sim.totalToClose, 0)} bold />
            </div>
          ) : (
            <StatusLine tone="warn">
              Loan ARV missing — please contact your loan executive.
            </StatusLine>
          )}
        </Panel>

        {sim ? (
          <Panel title="HUD-1 estimated closing" sub="Estimate · subject to verification" noPad>
            <Table
              cols={[{ label: "Line item" }, { label: "Amount", align: "r" }]}
              caption="Estimated closing costs"
            >
              {[
                { l: "801 · Origination Fee", sub: "0.75% of loan amount", v: sim.origination },
                { l: "802 · Discount Points", sub: `${points.toFixed(2)} pts`, v: sim.pointsCost, hl: true },
                { l: "804 · Appraisal", sub: "Standard residential", v: sim.appraisal },
                { l: "811/812 · Processing + UW", sub: "", v: sim.fixedFees },
                { l: "1108 · Title Insurance", sub: "Lender + owner", v: sim.titleIns },
                { l: "1201 · Recording Fees", sub: "", v: sim.recording },
              ].map((row) => (
                <Tr key={row.l}>
                  {/* The buy-down line is the one the slider moves — it keeps
                      the tint the old highlighted row had, as a tone class. */}
                  <Td className={row.hl ? "c-acc" : undefined}>
                    <div>{row.hl ? <b>{row.l}</b> : row.l}</div>
                    {row.sub ? <div className="sub">{row.sub}</div> : null}
                  </Td>
                  <Td align="r" className={row.hl ? "c-acc num" : "num"}>
                    {QC_FMT.usd(row.v, 0)}
                  </Td>
                </Tr>
              ))}
              <Tr>
                <Td>
                  <Lbl>Total to close</Lbl>
                </Td>
                <Td align="r" className="num">
                  <b>{QC_FMT.usd(sim.totalToClose, 0)}</b>
                </Td>
              </Tr>
            </Table>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}

/** One label/figure line of the simulated-terms panel. `.kv` owns the split,
 *  the hairline and the type size; `tone` (when set) renders the figure as a
 *  chip instead of plain bold text. */
function ResultRow({
  label,
  value,
  tone,
  bold,
}: {
  label: string;
  value: string;
  tone?: ChipTone;
  bold?: boolean;
}) {
  return (
    <div className="kv">
      <span>{bold ? <b>{label}</b> : label}</span>
      {tone ? (
        <CellChip tone={tone}>{value}</CellChip>
      ) : (
        <b className="num">{value}</b>
      )}
    </div>
  );
}
