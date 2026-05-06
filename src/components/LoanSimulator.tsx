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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {eligibility.banner ? <EligibilityBanner banner={eligibility.banner} /> : null}

        {/* Locked terms — read-only chips that mirror the loan record */}
        <Card pad={20}>
          <SectionLabel>Locked terms</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <LockedChip
              label="Product"
              value={PRODUCT_LABEL[productKey]}
              sub={PRODUCT_TERM[productKey]}
            />
            <LockedChip label="ARV" value={QC_FMT.usd(arvNum, 0)} />
            <LockedChip label="LTV" value={`${ltvPct}%`} sub={ltvLabel(ltvFraction)} />
            <LockedChip
              label="Base rate"
              value={baseRatePct != null ? `${baseRatePct.toFixed(3)}%` : "—"}
              sub={liveRate ? `${liveRate.label} +${liveRate.spread_bps} bps` : "Locked at intake"}
            />
          </div>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 12, lineHeight: 1.5 }}>
            These were set when this loan was started. Your loan executive can adjust them — you'll see
            updates here automatically.
          </div>
        </Card>

        {/* Discount points — the only interactive input */}
        <Card pad={20}>
          <SectionLabel>Discount points</SectionLabel>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <div>
              <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>0–2 pts</div>
              <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>
                {points > 0 ? `−${Math.round(points * 25)} bps off base rate` : "No buy-down · base rate"}
              </div>
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: t.ink,
                fontFeatureSettings: '"tnum"',
                letterSpacing: -0.4,
              }}
            >
              {points.toFixed(2)} pts
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.25}
            value={points}
            onChange={(e) => setPoints(Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol }}
          />
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
            Buying points reduces your rate but adds upfront cost.
          </div>
        </Card>
      </div>

      {/* Result KPIs + HUD breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>Simulated terms</SectionLabel>
          {sim ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ResultRow label="Loan amount" value={QC_FMT.usd(sim.loanAmount, 0)} />
              <ResultRow
                label="Final rate"
                value={`${(sim.rate * 100).toFixed(3)}%`}
                accent={t.brand}
              />
              <ResultRow label="Monthly P&I" value={QC_FMT.usd(sim.monthlyPI, 0)} />
              {productKey === "dscr" && sim.dscr != null ? (
                <ResultRow
                  label="DSCR"
                  value={sim.dscr.toFixed(2)}
                  accent={sim.dscr > 1.25 ? t.profit : sim.dscr > 1 ? t.warn : t.danger}
                />
              ) : null}
              <ResultRow label="Discount points cost" value={QC_FMT.usd(sim.pointsCost, 0)} />
              <ResultRow label="Cash to close" value={QC_FMT.usd(sim.totalToClose, 0)} bold />
            </div>
          ) : (
            <div style={{ fontSize: 12.5, color: t.ink3 }}>
              Loan ARV missing — please contact your loan executive.
            </div>
          )}
        </Card>

        {sim ? (
          <Card pad={0} style={{ overflow: "hidden" }}>
            <div
              style={{
                padding: "12px 16px",
                background: t.surface2,
                borderBottom: `1px solid ${t.line}`,
              }}
            >
              <div
                style={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  letterSpacing: 1.2,
                  color: t.ink3,
                  textTransform: "uppercase",
                }}
              >
                HUD-1 estimated closing
              </div>
              <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                Estimate · subject to verification
              </div>
            </div>
            {[
              { l: "801 · Origination Fee", sub: "0.75% of loan amount", v: sim.origination },
              { l: "802 · Discount Points", sub: `${points.toFixed(2)} pts`, v: sim.pointsCost, hl: true },
              { l: "804 · Appraisal", sub: "Standard residential", v: sim.appraisal },
              { l: "811/812 · Processing + UW", sub: "", v: sim.fixedFees },
              { l: "1108 · Title Insurance", sub: "Lender + owner", v: sim.titleIns },
              { l: "1201 · Recording Fees", sub: "", v: sim.recording },
            ].map((row, i, arr) => (
              <div
                key={row.l}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "10px 16px",
                  borderBottom: i < arr.length - 1 ? `1px solid ${t.line}` : "none",
                  background: row.hl ? t.brandSoft : "transparent",
                }}
              >
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: row.hl ? 700 : 500, color: t.ink }}>
                    {row.l}
                  </div>
                  {row.sub ? (
                    <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>{row.sub}</div>
                  ) : null}
                </div>
                <div style={{ fontSize: 13, fontWeight: 600, color: t.ink }}>
                  {QC_FMT.usd(row.v, 0)}
                </div>
              </div>
            ))}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "14px 16px",
                background: t.surface2,
                borderTop: `1px solid ${t.lineStrong}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  letterSpacing: 0.4,
                  color: t.ink,
                  textTransform: "uppercase",
                }}
              >
                Total to close
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.3, color: t.ink }}>
                {QC_FMT.usd(sim.totalToClose, 0)}
              </div>
            </div>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
}) {
  const { t } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        paddingTop: 4,
        paddingBottom: 4,
        borderBottom: `1px solid ${t.line}`,
      }}
    >
      <div style={{ fontSize: 12.5, color: t.ink2 }}>{label}</div>
      <div
        style={{
          fontSize: bold ? 16 : 14,
          fontWeight: bold ? 800 : 700,
          color: accent ?? t.ink,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function LockedChip({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 11,
        padding: 10,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Icon name="lock" size={10} stroke={2.4} />
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: 0.8,
            color: t.ink3,
            textTransform: "uppercase",
          }}
        >
          {label}
        </div>
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: t.ink,
          marginTop: 4,
          letterSpacing: -0.2,
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </div>
      {sub ? <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>{sub}</div> : null}
    </div>
  );
}
