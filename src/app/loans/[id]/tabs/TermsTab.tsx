"use client";

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { useLoans, useMyCredit } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { EligibilityBanner } from "@/components/EligibilityBanner";
import {
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type SimulatorInputs,
} from "@/lib/eligibility";
import type { Loan } from "@/lib/types";

const COVENANTS = [
  { k: "rate_lock", label: "60-day rate lock" },
  { k: "prepay", label: "Prepayment penalty (3-2-1)" },
  { k: "interest", label: "Interest reserve" },
  { k: "recourse", label: "Full recourse" },
  { k: "release", label: "Partial release" },
  { k: "extension", label: "Extension option (6mo @ 25bps)" },
];

function productKeyFor(loanType: string): SimulatorInputs["productKey"] {
  if (loanType === "dscr") return "dscr";
  if (loanType === "fix_and_flip") return "ff";
  if (loanType === "ground_up") return "gu";
  return "br";
}

export function TermsTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const { data: credit } = useMyCredit();
  const { data: loans = [] } = useLoans();

  const propertyCount = loans.length;
  const hasYearOfOwnership = useMemo(() => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return loans.some(
      (l) => l.stage === "funded" && l.close_date && now - new Date(l.close_date).getTime() >= oneYearMs
    );
  }, [loans]);

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount,
    hasYearOfOwnership,
  });

  const productKey = productKeyFor(loan.type);

  // ARV input — pre-populated from the loan record.
  const [arvText, setArvText] = useState(loan.arv != null ? String(Math.round(Number(loan.arv))) : "");
  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;

  // Discount points slider — 0..2 in 0.25 steps.
  const [points, setPoints] = useState(Math.min(2, Math.max(0, loan.discount_points || 0)));

  // LTV slider — 0.60..0.75 in 1% steps. Gated by eligibility.
  const initialLtvPct = loan.ltv ? Math.round(Number(loan.ltv) * 100) : 65;
  const maxLtvPct = eligibility.maxLTV * 100;
  const [ltvPct, setLtvPct] = useState(
    Math.min(maxLtvPct || 65, Math.max(60, initialLtvPct))
  );

  const isBlocked = eligibility.tier === "blocked";

  const sim = useMemo(() => {
    if (isBlocked || arvNum <= 0) return null;
    return computeSimulator({
      arv: arvNum,
      ltv: ltvPct / 100,
      discountPoints: points,
      productKey,
    });
  }, [isBlocked, arvNum, ltvPct, points, productKey]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {eligibility.banner ? <EligibilityBanner banner={eligibility.banner} /> : null}

        <Card pad={20}>
          <SectionLabel>Property</SectionLabel>
          <ArvField value={arvText} onChange={setArvText} />
        </Card>

        <Card pad={20}>
          <SectionLabel>Discount points</SectionLabel>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>0–2 pts</div>
              <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>
                {points > 0 ? `−${Math.round(points * 25)} bps off base rate` : "No buy-down · base rate"}
              </div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
              {points.toFixed(2)} pts
            </div>
          </div>
          <input
            type="range"
            min={0}
            max={2}
            step={0.25}
            value={points}
            disabled={isBlocked}
            onChange={(e) => setPoints(Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol, opacity: isBlocked ? 0.4 : 1 }}
          />
        </Card>

        <Card pad={20}>
          <SectionLabel>Loan-to-ARV</SectionLabel>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>60–75% range</div>
              <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>{ltvLabel(ltvPct / 100)}</div>
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
              {ltvPct}%
            </div>
          </div>
          <input
            type="range"
            min={60}
            max={isBlocked ? 60 : maxLtvPct}
            step={1}
            value={ltvPct}
            disabled={isBlocked}
            onChange={(e) => setLtvPct(Number(e.target.value))}
            style={{ width: "100%", accentColor: t.petrol, opacity: isBlocked ? 0.4 : 1 }}
          />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
            {[60, 65, 70, 75].map((tick) => {
              const locked = !isBlocked && tick > maxLtvPct;
              return (
                <span
                  key={tick}
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: 0.4,
                    color: locked ? t.ink4 : ltvPct === tick ? t.ink : t.ink3,
                  }}
                >
                  {tick}%{locked ? " 🔒" : ""}
                </span>
              );
            })}
          </div>
          {!isBlocked && eligibility.maxLTV < 0.75 ? (
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
              70% and 75% locked at this tier.
            </div>
          ) : null}
        </Card>

        <Card pad={20}>
          <SectionLabel>Covenants & options</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
            {COVENANTS.map((o) => (
              <label
                key={o.k}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: 10,
                  border: `1px solid ${t.line}`,
                  borderRadius: 9,
                  fontSize: 12.5,
                  color: t.ink,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  defaultChecked={o.k === "rate_lock" || o.k === "recourse"}
                  style={{ accentColor: t.petrol }}
                />
                {o.label}
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card pad={16}>
        <SectionLabel>Simulated terms</SectionLabel>
        {sim ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <KPI label="Loan amount" value={QC_FMT.usd(sim.loanAmount, 0)} />
            <KPI label="Final rate" value={`${(sim.rate * 100).toFixed(3)}%`} accent={t.brand} />
            <KPI label="Monthly P&I" value={QC_FMT.usd(sim.monthlyPI, 0)} />
            {sim.dscr != null ? (
              <KPI
                label="DSCR"
                value={sim.dscr.toFixed(2)}
                accent={sim.dscr > 1.25 ? t.profit : sim.dscr > 1 ? t.warn : t.danger}
              />
            ) : null}
            <KPI label="Cash to close" value={QC_FMT.usd(sim.totalToClose, 0)} />
            <KPI label="Discount points cost" value={QC_FMT.usd(sim.pointsCost, 0)} />
          </div>
        ) : (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>
            {isBlocked
              ? "Resolve the eligibility issue above to run a simulation."
              : "Enter ARV to see simulated terms."}
          </div>
        )}
      </Card>
    </div>
  );
}

function ArvField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTheme();
  const num = Number(value.replace(/[^0-9.]/g, "")) || 0;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.ink3,
          marginBottom: 6,
        }}
      >
        ARV (After Repair Value)
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${t.lineStrong}`,
          borderRadius: 11,
          background: t.surface2,
          padding: "0 12px",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: t.ink3, marginRight: 4 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="500000"
          style={{
            flex: 1,
            padding: "12px 0",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 18,
            fontWeight: 700,
            color: t.ink,
            fontFamily: "inherit",
            fontFeatureSettings: '"tnum"',
          }}
        />
        {num >= 1000 ? (
          <span style={{ fontSize: 12, color: t.ink3, marginLeft: 8, whiteSpace: "nowrap" }}>
            {QC_FMT.short(num)}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
        Loan amount = ARV × LTV.
      </div>
    </div>
  );
}
