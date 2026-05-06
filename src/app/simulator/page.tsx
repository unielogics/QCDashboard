"use client";

// Standalone Simulator — role-aware:
//
//   CLIENT  → ARV-driven "ClientSimulator" with credit + experience gating.
//             Mirrors the mobile app, so the borrower experience is identical
//             across platforms. No backend recalc — instant client-side math.
//
//   !CLIENT → advanced "Free calc" + "From loan" modes that hit the backend
//             pricing engine (POST /loans/calc and /loans/{id}/recalc). All
//             the operator wiggle-room: product, property type, base rate,
//             taxes / insurance / HOA, raw loan amount, full HUD-1 detail.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useCurrentUser,
  useFreeCalc,
  useFredSeries,
  useLoans,
  useMyCredit,
  useRecalc,
  useSettings,
} from "@/hooks/useApi";
import { LoanType, PropertyType, Role } from "@/lib/enums.generated";
import { QC_FMT } from "@/components/design-system/tokens";
import type { FredSeriesSummary, RecalcResponse, SimulatorSettings } from "@/lib/types";
import { EligibilityBanner } from "@/components/EligibilityBanner";
import {
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type SimulatorInputs,
} from "@/lib/eligibility";

const DEFAULT_SIM: SimulatorSettings = {
  points_min: 0,
  points_max: 3,
  points_step: 0.5,
  amount_min: 100_000,
  amount_max: 5_000_000,
  amount_step: 25_000,
  ltv_min: 0.5,
  ltv_max: 0.9,
  ltv_step: 0.05,
  advanced_mode_enabled: true,
  show_taxes: true,
  show_insurance: true,
  show_hoa: true,
  show_ltv_toggle: true,
};

const LOAN_TYPE_OPTIONS: { value: LoanType; label: string }[] = [
  { value: LoanType.DSCR, label: "DSCR Rental (30-yr)" },
  { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip (12-mo)" },
  { value: LoanType.GROUND_UP, label: "Ground Up (18-mo)" },
  { value: LoanType.BRIDGE, label: "Bridge (24-mo)" },
];

type Mode = "free" | "loan";

export default function SimulatorPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: settings } = useSettings();
  const sim: SimulatorSettings = settings?.data?.simulator ?? DEFAULT_SIM;

  const isClient = user?.role === Role.CLIENT;
  const [mode, setMode] = useState<Mode>("free");

  // CLIENT view — same gated, ARV-driven simulator as mobile.
  if (isClient) {
    return (
      <div style={{ padding: 24, maxWidth: 920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Simulate</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Model what a deal looks like at different points and LTV tiers. Higher LTVs unlock as you
            verify credit and add experience to your investor profile.
          </div>
        </div>
        <ClientSimulator />
      </div>
    );
  }

  // OPERATOR view — full advanced flow against the backend.
  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Simulate</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Run pricing math from scratch or against any loan in your pipeline. Operators set the
            allowed ranges in Settings → Simulator.
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 4 }}>
          <ModeButton t={t} active={mode === "free"} onClick={() => setMode("free")}>
            <Icon name="calc" size={12} /> Free calculation
          </ModeButton>
          <ModeButton t={t} active={mode === "loan"} onClick={() => setMode("loan")}>
            <Icon name="layers" size={12} /> From a loan
          </ModeButton>
        </div>
      </div>

      {mode === "free" ? <FreeCalcMode t={t} sim={sim} /> : <FromLoanMode t={t} sim={sim} loans={loans} />}
    </div>
  );
}

// ── Client simulator — ARV + DP slider + LTV slider (gated) ────────────────

function ClientSimulator() {
  const { t } = useTheme();
  const { data: credit } = useMyCredit();
  const { data: loans = [] } = useLoans();
  const { data: fred } = useFredSeries();

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

  const [productKey, setProductKey] = useState<SimulatorInputs["productKey"]>("dscr");
  const [arvText, setArvText] = useState("500000");
  const [brvText, setBrvText] = useState("400000");
  const [points, setPoints] = useState(1);
  const initialLtvPct = Math.min(eligibility.maxLTV * 100 || 65, 65);
  const [ltvPct, setLtvPct] = useState(initialLtvPct);

  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  const brvNum = Number(brvText.replace(/[^0-9.]/g, "")) || 0;
  const isBlocked = eligibility.tier === "blocked";
  const maxLtvPct = eligibility.maxLTV * 100;
  const reno = productKey === "ff" || productKey === "gu";
  const propertyLabel = reno ? "ARV (After Repair Value)" : "Market Value";

  // Map the client-simulator product key to a FRED series and use today's
  // rate (index + spread). Falls back to the hardcoded table inside
  // computeSimulator when FRED isn't available.
  const clientSeriesId = ((): string => {
    switch (productKey) {
      case "dscr": return "DGS10";
      case "ff":   return "DPRIME";
      case "gu":   return "DPRIME";
      case "br":   return "SOFR";
    }
  })();
  const liveRate = fred?.find((s) => s.series_id === clientSeriesId);
  const baseRatePct = liveRate?.estimated_rate ?? undefined;

  const result = useMemo(() => {
    if (isBlocked || arvNum <= 0) return null;
    return computeSimulator({
      arv: arvNum,
      ltv: ltvPct / 100,
      discountPoints: points,
      productKey,
      baseRatePct,
    });
  }, [isBlocked, arvNum, ltvPct, points, productKey, baseRatePct]);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {eligibility.banner ? <EligibilityBanner banner={eligibility.banner} /> : null}

        <Card pad={20}>
          <SectionLabel>Product</SectionLabel>
          <div style={{ display: "flex", gap: 4, background: t.chip, borderRadius: 11, padding: 3 }}>
            {(
              [
                { id: "dscr", label: "DSCR Rental",   sub: "30 yr" },
                { id: "ff",   label: "Fix & Flip",    sub: "12 mo" },
                { id: "gu",   label: "Ground Up",     sub: "18 mo" },
                { id: "br",   label: "Bridge",        sub: "24 mo" },
              ] as const
            ).map((p) => {
              const active = productKey === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setProductKey(p.id)}
                  style={{
                    all: "unset",
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 9,
                    background: active ? t.surface : "transparent",
                    color: active ? t.ink : t.ink3,
                    fontSize: 12.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {p.label}
                  <div style={{ fontSize: 10, fontWeight: 600, color: active ? t.ink3 : t.ink4, marginTop: 2 }}>{p.sub}</div>
                </button>
              );
            })}
          </div>
        </Card>

        <Card pad={20}>
          <SectionLabel>Property</SectionLabel>
          {reno ? (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ArvField label="BRV (Before Repair Value)" value={brvText} onChange={setBrvText} hint="As-is purchase value" />
              <ArvField label={propertyLabel} value={arvText} onChange={setArvText} hint="Loan sized off ARV × LTV" />
            </div>
          ) : (
            <ArvField label={propertyLabel} value={arvText} onChange={setArvText} hint="Loan amount = Market Value × LTV" />
          )}
          {liveRate?.estimated_rate != null ? (
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 10 }}>
              Today's base rate · {liveRate.label} +{liveRate.spread_bps} bps · <strong>{liveRate.estimated_rate.toFixed(3)}%</strong>
            </div>
          ) : null}
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
          <SectionLabel>{reno ? "Loan-to-ARV" : "Loan-to-value (LTV)"}</SectionLabel>
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
      </div>

      <Card pad={16}>
        <SectionLabel>Simulated terms</SectionLabel>
        {result ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <KPI label="Loan amount" value={QC_FMT.usd(result.loanAmount, 0)} />
            <KPI label="Final rate" value={`${(result.rate * 100).toFixed(3)}%`} accent={t.brand} />
            <KPI label="Monthly P&I" value={QC_FMT.usd(result.monthlyPI, 0)} />
            {result.dscr != null ? (
              <KPI
                label="DSCR"
                value={result.dscr.toFixed(2)}
                accent={result.dscr > 1.25 ? t.profit : result.dscr > 1 ? t.warn : t.danger}
              />
            ) : null}
            {result.cashFlow != null ? (
              <KPI
                label="Est. cash flow"
                value={`${result.cashFlow > 0 ? "+" : ""}${QC_FMT.usd(result.cashFlow, 0)}`}
                accent={result.cashFlow > 0 ? t.profit : t.danger}
              />
            ) : null}
            <KPI label="Discount points cost" value={QC_FMT.usd(result.pointsCost, 0)} />
            <KPI label="Estimated cash to close" value={QC_FMT.usd(result.totalToClose, 0)} />
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

function ArvField({
  value,
  onChange,
  label = "ARV (After Repair Value)",
  hint = "Loan amount = ARV × LTV.",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
}) {
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
        {label}
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
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>{hint}</div>
    </div>
  );
}

// ── Free-calc mode (no loan record) ────────────────────────────────────────

// Mirrors backend `PRODUCT_SERIES_MAP` in services/fred.py — keep in sync.
// The base rate fed to /loans/calc comes from the FRED card for whichever
// series this loan type is benchmarked against, plus the active lender spread.
const LOAN_TYPE_TO_SERIES: Record<LoanType, string> = {
  [LoanType.DSCR]: "DGS10",
  [LoanType.FIX_AND_FLIP]: "DPRIME",
  [LoanType.GROUND_UP]: "DPRIME",
  [LoanType.BRIDGE]: "SOFR",
  [LoanType.PORTFOLIO]: "DGS5",
  [LoanType.CASH_OUT_REFI]: "DGS10",
};

const FALLBACK_RATE_BY_TYPE: Record<LoanType, number> = {
  [LoanType.DSCR]: 0.0775,
  [LoanType.FIX_AND_FLIP]: 0.1075,
  [LoanType.GROUND_UP]: 0.1125,
  [LoanType.BRIDGE]: 0.0925,
  [LoanType.PORTFOLIO]: 0.0825,
  [LoanType.CASH_OUT_REFI]: 0.0825,
};

function pickRate(type: LoanType, fred: FredSeriesSummary[] | undefined): {
  rate: number;
  source: "live" | "fallback";
  series?: FredSeriesSummary;
} {
  const seriesId = LOAN_TYPE_TO_SERIES[type];
  const match = fred?.find((s) => s.series_id === seriesId);
  if (match && match.estimated_rate != null) {
    return { rate: match.estimated_rate / 100, source: "live", series: match };
  }
  return { rate: FALLBACK_RATE_BY_TYPE[type], source: "fallback" };
}

function isReno(type: LoanType): boolean {
  return type === LoanType.FIX_AND_FLIP || type === LoanType.GROUND_UP;
}

function FreeCalcMode({ t, sim }: { t: ReturnType<typeof useTheme>["t"]; sim: SimulatorSettings }) {
  const calc = useFreeCalc();
  const { data: fred } = useFredSeries();
  const [type, setType] = useState<LoanType>(LoanType.DSCR);
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.SFR);
  // Property values — Market Value for stabilized products, BRV+ARV for reno.
  const [marketValue, setMarketValue] = useState(650_000);
  const [brv, setBrv] = useState(450_000);
  const [arv, setArv] = useState(750_000);
  const [amount, setAmount] = useState(500_000);
  const [points, setPoints] = useState(0);
  const [annualTaxes, setAnnualTaxes] = useState(6000);
  const [annualInsurance, setAnnualInsurance] = useState(1800);
  const [monthlyHoa, setMonthlyHoa] = useState(0);
  const [monthlyRent, setMonthlyRent] = useState(4500);

  const isDscr = type === LoanType.DSCR;
  const reno = isReno(type);

  const { rate: baseRate, source: rateSource, series: rateSeries } = pickRate(type, fred);
  // Effective rate after points buy-down (matches backend pricing_quote): each
  // discount point trims 25 bps off the base rate, capped at the floor.
  const finalRate = Math.max(0.04, baseRate - (points * 25) / 10_000);
  // HUD impact: discount points line item = points% × loan amount.
  const pointsCost = (points / 100) * amount;
  // Reno LTV reference (FF/GU typically priced off ARV).
  const arvLtv = reno && arv > 0 ? amount / arv : null;
  const marketLtv = !reno && marketValue > 0 ? amount / marketValue : null;

  const submit = () => {
    calc.mutate({
      type,
      property_type: propertyType,
      loan_amount: amount,
      base_rate: baseRate,
      discount_points: points,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: isDscr ? monthlyRent : null,
    });
  };

  return (
    <>
      <Card pad={16}>
        <SectionLabel>Loan parameters</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          <Field t={t} label="Loan type">
            <select value={type} onChange={(e) => setType(e.target.value as LoanType)} style={inputStyle(t)}>
              {LOAN_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field t={t} label="Property type">
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
              style={inputStyle(t)}
            >
              <option value={PropertyType.SFR}>Single family</option>
              <option value={PropertyType.UNITS_2_4}>2-4 units</option>
              <option value={PropertyType.UNITS_5_8}>5-8 units</option>
              <option value={PropertyType.MIXED_USE}>Mixed use</option>
              <option value={PropertyType.COMMERCIAL}>Commercial</option>
            </select>
          </Field>
        </div>

        <div style={{ height: 14 }} />
        <SectionLabel>{reno ? "Property values" : "Property"}</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: reno ? "1fr 1fr" : "1fr 1fr", gap: 12 }}>
          {reno ? (
            <>
              <CurrencyField t={t} label="Before Repair Value (BRV)" value={brv} onChange={setBrv} />
              <CurrencyField t={t} label="After Repair Value (ARV)" value={arv} onChange={setArv} />
            </>
          ) : (
            <CurrencyField t={t} label="Market Value" value={marketValue} onChange={setMarketValue} />
          )}
          <CurrencyField
            t={t}
            label="Loan amount"
            value={amount}
            onChange={setAmount}
            hint={
              reno
                ? arvLtv != null
                  ? `${(arvLtv * 100).toFixed(1)}% loan-to-ARV`
                  : undefined
                : marketLtv != null
                  ? `${(marketLtv * 100).toFixed(1)}% LTV`
                  : undefined
            }
          />
        </div>

        <div style={{ height: 14 }} />
        <SectionLabel>Today's rate</SectionLabel>
        <RateCard
          t={t}
          baseRate={baseRate}
          finalRate={finalRate}
          points={points}
          source={rateSource}
          series={rateSeries}
        />

        <div style={{ height: 14 }} />
        <SectionLabel>Discount points (alters HUD)</SectionLabel>
        <PointsSlider
          t={t}
          value={points}
          onChange={setPoints}
          min={sim.points_min}
          max={sim.points_max}
          step={sim.points_step}
          loanAmount={amount}
          pointsCost={pointsCost}
        />

        <div style={{ height: 14 }} />
        <SectionLabel>Carrying costs (monthly P&I and DSCR)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {sim.show_taxes && (
            <NumberField t={t} label="Annual taxes ($)" value={annualTaxes} onChange={setAnnualTaxes} step={100} />
          )}
          {sim.show_insurance && (
            <NumberField t={t} label="Annual insurance ($)" value={annualInsurance} onChange={setAnnualInsurance} step={100} />
          )}
          {sim.show_hoa && (
            <NumberField t={t} label="Monthly HOA ($)" value={monthlyHoa} onChange={setMonthlyHoa} step={25} />
          )}
          {isDscr && (
            <NumberField t={t} label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} step={50} />
          )}
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={submit} disabled={calc.isPending} style={qcBtnPrimary(t)}>
          <Icon name="refresh" size={13} /> {calc.isPending ? "Calculating…" : "Calculate"}
        </button>
      </div>

      {calc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {calcErrorMessage(calc.error)}
        </Pill>
      )}
      {calc.data && <ResultsCard t={t} result={calc.data} />}
    </>
  );
}

// 405/404 from /loans/calc means the backend route isn't on this environment
// yet — surface a friendlier message than the raw status text.
function calcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Calculation failed";
  if (/\b(404|405)\b/.test(msg)) {
    return "Pricing engine isn't deployed on this environment yet. Redeploy qcbackend to enable Calculate.";
  }
  return msg;
}

// ── From-loan mode (existing pipeline loan) ────────────────────────────────

function FromLoanMode({
  t,
  sim,
  loans,
}: {
  t: ReturnType<typeof useTheme>["t"];
  sim: SimulatorSettings;
  loans: ReturnType<typeof useLoans>["data"];
}) {
  const recalc = useRecalc();
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [points, setPoints] = useState(0);

  const activeLoan = useMemo(() => loans?.find((l) => l.id === activeLoanId) ?? null, [loans, activeLoanId]);

  useEffect(() => {
    if (activeLoan) setPoints(Number(activeLoan.discount_points ?? 0));
  }, [activeLoan]);

  const pointsOptions = useMemo(() => {
    const out: number[] = [];
    for (let p = sim.points_min; p <= sim.points_max + 1e-9; p += sim.points_step) {
      out.push(+p.toFixed(2));
    }
    return out;
  }, [sim.points_min, sim.points_max, sim.points_step]);

  const submit = () => {
    if (!activeLoanId) return;
    recalc.mutate({ loanId: activeLoanId, discount_points: points });
  };

  return (
    <>
      <Card pad={16}>
        <SectionLabel>Pick a loan</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(loans ?? []).length === 0 && (
            <div style={{ fontSize: 13, color: t.ink3 }}>
              No loans yet. Switch to <strong>Free calculation</strong> above, or create one from
              the <strong>Pipeline</strong> page.
            </div>
          )}
          {(loans ?? []).map((l) => {
            const active = activeLoanId === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setActiveLoanId(l.id)}
                style={{
                  ...qcBtn(t),
                  background: active ? t.ink : t.surface,
                  color: active ? t.inverse : t.ink2,
                  border: active ? "none" : `1px solid ${t.lineStrong}`,
                }}
              >
                {l.deal_id} · {l.type.replace("_", " ")}
              </button>
            );
          })}
        </div>
      </Card>

      {activeLoan && (
        <Card pad={16}>
          <SectionLabel>Discount points</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pointsOptions.map((p) => {
              const active = points === p;
              return (
                <button
                  key={p}
                  onClick={() => setPoints(p)}
                  style={{
                    ...qcBtn(t),
                    minWidth: 60,
                    justifyContent: "center",
                    padding: "5px 10px",
                    fontSize: 12,
                    background: active ? t.petrol : t.surface,
                    color: active ? "#fff" : t.ink2,
                    border: active ? "none" : `1px solid ${t.lineStrong}`,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {p.toFixed(2)}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {activeLoan && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} disabled={recalc.isPending} style={qcBtnPrimary(t)}>
            <Icon name="refresh" size={13} /> {recalc.isPending ? "Recalculating…" : "Recalculate"}
          </button>
        </div>
      )}

      {recalc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {recalc.error instanceof Error ? recalc.error.message : "Recalc failed"}
        </Pill>
      )}
      {recalc.data && <ResultsCard t={t} result={recalc.data} />}
    </>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function ResultsCard({ t, result }: { t: ReturnType<typeof useTheme>["t"]; result: RecalcResponse }) {
  return (
    <Card pad={20}>
      <SectionLabel>Results</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <ResultStat t={t} label="Final rate" value={`${(result.final_rate * 100).toFixed(3)}%`} />
        <ResultStat t={t} label="Monthly P&I" value={QC_FMT.usd(result.monthly_pi)} />
        {result.dscr != null ? (
          <ResultStat t={t} label="DSCR" value={result.dscr.toFixed(2)} />
        ) : (
          <div />
        )}
        <ResultStat t={t} label="Cash to close" value={QC_FMT.usd(result.cash_to_close_pricing)} />
        <ResultStat t={t} label="HUD-1 total" value={QC_FMT.usd(result.hud_total)} />
      </div>
      {result.warnings && result.warnings.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {result.warnings.map((w, i) => {
            const isBlock = w.severity === "block";
            return (
              <Pill
                key={(w.code ?? `w-${i}`) as string}
                bg={isBlock ? t.dangerBg : t.warnBg}
                color={isBlock ? t.danger : t.warn}
              >
                {w.message}
              </Pill>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ModeButton({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 9,
        background: active ? t.ink : t.surface,
        color: active ? t.inverse : t.ink2,
        border: active ? "none" : `1px solid ${t.lineStrong}`,
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function ResultStat({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  t,
  label,
  value,
  onChange,
  step,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
}) {
  return (
    <Field t={t} label={label}>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={inputStyle(t)}
      />
    </Field>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    fontFeatureSettings: '"tnum"',
  };
}

function CurrencyField({
  t,
  label,
  value,
  onChange,
  hint,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  // Render the digits formatted with thousands separators while editing —
  // operators size up loan amounts in chunks of $25k, raw "500000" is hard
  // to scan.
  const display = Number.isFinite(value) ? value.toLocaleString("en-US") : "";
  return (
    <Field t={t} label={label}>
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
        <span style={{ fontSize: 16, fontWeight: 700, color: t.ink3, marginRight: 4 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            onChange(raw === "" ? 0 : Number(raw));
          }}
          style={{
            flex: 1,
            padding: "11px 0",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 16,
            fontWeight: 700,
            color: t.ink,
            fontFamily: "inherit",
            fontFeatureSettings: '"tnum"',
          }}
        />
        {value >= 1000 ? (
          <span style={{ fontSize: 11, color: t.ink3, marginLeft: 8, whiteSpace: "nowrap" }}>
            {QC_FMT.short(value)}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 6, fontFeatureSettings: '"tnum"' }}>{hint}</div>
      ) : null}
    </Field>
  );
}

function RateCard({
  t,
  baseRate,
  finalRate,
  points,
  source,
  series,
}: {
  t: ReturnType<typeof useTheme>["t"];
  baseRate: number;
  finalRate: number;
  points: number;
  source: "live" | "fallback";
  series?: FredSeriesSummary;
}) {
  const isLive = source === "live";
  return (
    <div
      style={{
        border: `1px solid ${t.lineStrong}`,
        borderRadius: 12,
        padding: "14px 16px",
        background: t.surface2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
          {isLive && series ? `${series.label} + ${series.spread_bps} bps` : "Fallback (FRED unavailable)"}
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 3 }}>
          {isLive && series?.current_date
            ? `As of ${new Date(series.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · index ${series.current_value?.toFixed(3)}%`
            : "Backend isn't returning today's rate yet — using a sensible default."}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
          {(finalRate * 100).toFixed(3)}%
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
          {points > 0
            ? `Base ${(baseRate * 100).toFixed(3)}% · −${Math.round(points * 25)} bps`
            : `Base rate · no buy-down`}
        </div>
      </div>
    </div>
  );
}

function PointsSlider({
  t,
  value,
  onChange,
  min,
  max,
  step,
  loanAmount,
  pointsCost,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  loanAmount: number;
  pointsCost: number;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>
            {min}–{max} pts · step {step}
          </div>
          <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>
            {value > 0
              ? `−${Math.round(value * 25)} bps off base · adds ${QC_FMT.usd(pointsCost, 0)} to HUD line 802`
              : "No buy-down · base rate · no HUD impact"}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
          {value.toFixed(2)} pts
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: t.petrol }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {Array.from({ length: Math.floor((max - min) / step) + 1 }).map((_, i) => {
          const tick = +(min + i * step).toFixed(2);
          const active = Math.abs(value - tick) < step / 2;
          return (
            <span
              key={tick}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: active ? t.ink : t.ink3,
                fontFeatureSettings: '"tnum"',
              }}
            >
              {tick}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
        Loan amount × points% = HUD line 802. {QC_FMT.usd(loanAmount, 0)} × {value.toFixed(2)}% = {QC_FMT.usd(pointsCost, 0)}.
      </div>
    </div>
  );
}
