"use client";

// Fix & Flip Deal Analyzer — paginated wizard. Borrower credit +
// experience are DERIVED from the profile (read-only), never typed.
// All math is client-side (src/lib/fixFlip). Hedged language only.

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import {
  useClient,
  useClosingCostTiers,
  useCurrentCredit,
  useFixFlipScenario,
  useFixFlipScenarios,
  useMyClient,
  useSaveFixFlipScenario,
  useUpdateFixFlipScenario,
  type FixFlipScenarioRow,
} from "@/hooks/useApi";
import { US_STATES } from "@/lib/usStates";
import { analyzeFixFlip } from "@/lib/fixFlip/calc";
import type {
  ExperienceTier,
  FixFlipInputs,
  Grade,
  PropertyType,
} from "@/lib/fixFlip/types";

const DISCLAIMER =
  "Estimates only. Final terms, cash to close, and eligibility depend on lender review, credit, title, appraisal, insurance, and the final settlement statement.";
const $ = (x: number) => `$${Math.round(x).toLocaleString()}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

const PROPERTY_TYPES: { v: PropertyType; l: string }[] = [
  { v: "single_family", l: "Single Family" },
  { v: "2_4_unit", l: "2-4 Unit" },
  { v: "multifamily", l: "Multifamily" },
  { v: "mixed_use", l: "Mixed-Use" },
  { v: "commercial", l: "Commercial" },
  { v: "condo", l: "Condo" },
  { v: "townhouse", l: "Townhouse" },
  { v: "other", l: "Other" },
];

const EXP_LABEL: Record<ExperienceTier, string> = {
  "0_flips": "First-time investor",
  "1_2_flips": "1-2 completed flips",
  "3_5_flips": "3-5 completed flips",
  "5_plus_flips": "5+ completed flips",
  pro: "Professional operator",
};

// Map the free-text profile experience → a tier. Best-effort; defaults
// to 1-2 flips when the profile is blank/unstructured.
export function deriveExperienceTier(raw?: string | null): ExperienceTier {
  const s = (raw ?? "").toLowerCase();
  if (/pro\b|professional|operator/.test(s)) return "pro";
  if (/first|brand new|\bnone\b|\b0\b|no experience/.test(s)) return "0_flips";
  if (/\b([5-9]|\d{2,})\b|\b5\s*\+/.test(s)) return "5_plus_flips";
  if (/\b[3-4]\b/.test(s)) return "3_5_flips";
  if (/\b[1-2]\b|\bone\b|\btwo\b/.test(s)) return "1_2_flips";
  return "1_2_flips";
}

const TABS = ["Summary", "Loan Programs", "HUD Forecast", "Profit Breakdown", "Sensitivity", "Make This Deal Work"] as const;
type Tab = (typeof TABS)[number];

const STEPS = ["Property", "Deal Numbers", "Timeline & Cash", "Review", "Results"] as const;
type Step = (typeof STEPS)[number];

const DEFAULTS: FixFlipInputs = {
  address: { street: "", city: "", state: "", zip: "" },
  propertyType: "single_family",
  purchasePrice: 0,
  arv: 0,
  rehabCost: 0,
  rehabContingencyPct: 0.1,
  sellingCostPct: 0.06,
  constructionMonths: 4,
  monthsToSell: 3,
  experience: "1_2_flips",
};

function gradeColor(t: ReturnType<typeof useTheme>["t"], g: string): string {
  if (g === "Excellent" || g === "Good") return t.profit;
  if (g === "Fair" || g === "Thin") return t.warn;
  return t.danger;
}

export default function FixAndFlipAnalyzerPage() {
  const { t } = useTheme();
  const sp = useSearchParams();
  const queryClientId = sp?.get("clientId") ?? null;
  const { data: myClient } = useMyClient();
  // Prefer ?clientId= (agent/operator opening a borrower); else the
  // signed-in client's own profile.
  const profileClientId = queryClientId ?? myClient?.id ?? null;
  const { data: client } = useClient(queryClientId);
  const { data: credit } = useCurrentCredit(profileClientId);

  const profileClient = queryClientId ? client : myClient;
  const derivedCredit =
    credit?.fico ?? profileClient?.fico ?? undefined;
  const derivedExperience = deriveExperienceTier(profileClient?.experience);

  const save = useSaveFixFlipScenario();
  const update = useUpdateFixFlipScenario();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [i, setI] = useState<FixFlipInputs>(DEFAULTS);
  const [stepIdx, setStepIdx] = useState(0);
  const [tab, setTab] = useState<Tab>("Summary");
  const [flash, setFlash] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<"financed" | "self">("financed");
  const step: Step = STEPS[stepIdx];

  // Credit + experience always come from the profile, never the form.
  const inputs: FixFlipInputs = useMemo(
    () => ({ ...i, creditScore: derivedCredit, experience: derivedExperience }),
    [i, derivedCredit, derivedExperience],
  );
  const { data: closingTiers } = useClosingCostTiers();
  const resultFinanced = useMemo(
    () => analyzeFixFlip(inputs, { closingTiers }),
    [inputs, closingTiers],
  );
  const resultSelf = useMemo(
    () => analyzeFixFlip(inputs, { closingTiers, selfFundRehab: true }),
    [inputs, closingTiers],
  );
  // The whole Results view follows the coverage toggle; financed is
  // the canonical one we persist.
  const result =
    coverage === "financed" ? resultFinanced : resultSelf;

  // Operator (super-admin / loan-exec) surface: land on a system-wide
  // table of every user's runs; "+" opens the wizard; a row opens
  // that run read-only. Brokers/clients keep the create wizard.
  const router = useRouter();
  const profile = useActiveProfile();
  const isOperator =
    profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const wantNew = sp?.get("new") === "1";
  const runId = sp?.get("run") ?? null;
  const allRuns = useFixFlipScenarios();
  const inspected = useFixFlipScenario(runId);

  const set = <K extends keyof FixFlipInputs>(k: K, v: FixFlipInputs[K]) =>
    setI((p) => ({ ...p, [k]: v }));
  const setAddr = (k: "street" | "city" | "state" | "zip", v: string) =>
    setI((p) => ({ ...p, address: { ...p.address, [k]: v } }));
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  // Per-step required fields (no county; state via dropdown).
  const stepValid = (s: Step): boolean => {
    if (s === "Property") return !!(inputs.address.street && inputs.address.city && inputs.address.state && inputs.address.zip);
    if (s === "Deal Numbers") return inputs.purchasePrice > 0 && inputs.arv > 0 && inputs.rehabCost >= 0;
    if (s === "Timeline & Cash") return inputs.constructionMonths > 0 && inputs.monthsToSell > 0;
    return true;
  };

  // Auto-save on "Analyze Deal". First analyze creates the run;
  // editing inputs and re-analyzing PATCHes the same row.
  const autoSave = async () => {
    if (resultFinanced.validationErrors.length) return;
    const body = {
      status: "saved",
      payload: { inputs, result: resultFinanced } as unknown as Record<string, unknown>,
      deal_score: resultFinanced.dealScore,
      deal_grade: resultFinanced.dealGrade,
    };
    try {
      if (savedId) {
        await update.mutateAsync({ id: savedId, ...body });
      } else {
        const row = await save.mutateAsync({
          client_id: profileClientId ?? undefined,
          ...body,
        });
        setSavedId(row.id);
      }
      setFlash("Saved.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't save scenario.");
    }
    setTimeout(() => setFlash(null), 3000);
  };

  const inputStyle = {
    width: "100%", marginTop: 4, padding: "9px 11px", borderRadius: 8,
    border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13,
  } as const;
  // JSX-returning helper (NOT a component) so inputs keep focus across
  // re-renders.
  const fld = (label: string, value: string | number, onChange: (s: string) => void, placeholder?: string) => (
    <label style={{ display: "block", marginBottom: 12 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</span>
      <input value={value === 0 ? "" : String(value)} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
    </label>
  );

  if (runId) {
    return (
      <RunInspect
        t={t}
        row={inspected.data}
        loading={inspected.isLoading}
        onBack={() => router.push("/deal-analyzer/fix-and-flip")}
      />
    );
  }
  if (isOperator && !wantNew) {
    return (
      <RunsTable
        t={t}
        rows={allRuns.data ?? []}
        loading={allRuns.isLoading}
        onNew={() => router.push("/deal-analyzer/fix-and-flip?new=1")}
        onOpen={(id) => router.push(`/deal-analyzer/fix-and-flip?run=${id}`)}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 860, margin: "0 auto" }}>
      <div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>Fix &amp; Flip Deal Analyzer</h1>
        <p style={{ fontSize: 13, color: t.ink3, margin: "4px 0 0" }}>
          See if the deal works before you make the offer — profit, cash to close, financing options, and downside risk.
        </p>
      </div>

      {/* Stepper */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {STEPS.map((s, idx) => {
          const active = idx === stepIdx;
          const done = idx < stepIdx;
          return (
            <div key={s} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 999, background: active ? t.petrolSoft : done ? t.profitBg : t.chip, color: active ? t.petrol : done ? t.profit : t.ink3, fontSize: 12, fontWeight: 700 }}>
                <span>{idx + 1}</span><span>{s}</span>
              </div>
              {idx < STEPS.length - 1 ? <span style={{ color: t.ink4 }}>→</span> : null}
            </div>
          );
        })}
      </div>

      {flash ? <div style={{ fontSize: 12.5, color: flash.includes("Couldn") ? t.danger : t.profit, fontWeight: 600 }}>{flash}</div> : null}

      <Card pad={20}>
        {step === "Property" ? (
          <div>
            <SectionLabel>Property</SectionLabel>
            {fld('Street address', inputs.address.street, (s) => setAddr("street", s))}
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 2 }}>{fld('City', inputs.address.city, (s) => setAddr("city", s))}</div>
              <div style={{ flex: 1 }}>
                <label style={{ display: "block", marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>State</span>
                  <select value={inputs.address.state} onChange={(e) => setAddr("state", e.target.value)} style={inputStyle}>
                    <option value="">Select…</option>
                    {US_STATES.map((s) => <option key={s.code} value={s.code}>{s.code} — {s.name}</option>)}
                  </select>
                </label>
              </div>
              <div style={{ flex: 1 }}>{fld('ZIP', inputs.address.zip, (s) => setAddr("zip", s))}</div>
            </div>
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>Property type</span>
              <select value={inputs.propertyType} onChange={(e) => set("propertyType", e.target.value as PropertyType)} style={inputStyle}>
                {PROPERTY_TYPES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </select>
            </label>
          </div>
        ) : null}

        {step === "Deal Numbers" ? (
          <div>
            <SectionLabel>Deal numbers</SectionLabel>
            {fld('Purchase price / BRV', inputs.purchasePrice, (s) => set("purchasePrice", num(s)))}
            {fld('After repair value (ARV)', inputs.arv, (s) => set("arv", num(s)))}
            {fld('Rehab / construction budget', inputs.rehabCost, (s) => set("rehabCost", num(s)))}
            {fld('Rehab contingency %', inputs.rehabContingencyPct * 100, (s) => set("rehabContingencyPct", num(s) / 100), '10')}
            {fld('Selling cost %', inputs.sellingCostPct * 100, (s) => set("sellingCostPct", num(s) / 100), '6')}
            <div style={{ fontSize: 11.5, color: t.ink3 }}>
              Closing % is derived from the firm&apos;s closing-cost tier table; monthly
              carry (interest + taxes + insurance) is system-generated. Neither is entered here.
            </div>
          </div>
        ) : null}

        {step === "Timeline & Cash" ? (
          <div>
            <SectionLabel>Timeline &amp; cash</SectionLabel>
            {fld('Construction months', inputs.constructionMonths, (s) => set("constructionMonths", num(s)))}
            {fld('Months to sell after construction', inputs.monthsToSell, (s) => set("monthsToSell", num(s)))}
            {fld('Cash to work available', inputs.liquidity ?? 0, (s) => set("liquidity", num(s) || undefined))}
            <div style={{ fontSize: 12, color: t.ink3 }}>Total hold: <b style={{ color: t.ink }}>{result.holdMonths} months</b></div>
            <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>Est. monthly carry: <b style={{ color: t.ink }}>{$(result.estimatedMonthlyCarry)}/mo</b> <span style={{ color: t.ink4 }}>(interest + taxes + insurance, system-generated)</span></div>
          </div>
        ) : null}

        {step === "Review" ? (
          <div>
            <SectionLabel>Borrower profile</SectionLabel>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: t.ink3 }}>Credit score</span>
              {derivedCredit != null ? (
                <Pill bg={t.petrolSoft} color={t.petrol}>{derivedCredit}</Pill>
              ) : (
                <Pill bg={t.chip} color={t.ink3}>Not on file</Pill>
              )}
              <span style={{ fontSize: 12, color: t.ink3, marginLeft: 12 }}>Experience</span>
              <Pill bg={t.chip} color={t.ink2}>{EXP_LABEL[derivedExperience]}</Pill>
            </div>
            <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 14 }}>
              Credit &amp; experience are pulled from the borrower&apos;s profile, not entered here.
            </div>
            <SectionLabel>Recap</SectionLabel>
            <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.7 }}>
              {inputs.address.street}, {inputs.address.city} {inputs.address.state} {inputs.address.zip}<br />
              Purchase {$(inputs.purchasePrice)} · ARV {$(inputs.arv)} · Rehab {$(inputs.rehabCost)}<br />
              Hold {result.holdMonths} months · Cash to work {$(inputs.liquidity ?? 0)}
            </div>
          </div>
        ) : null}

        {step === "Results" ? (
          result.validationErrors.length ? (
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>Missing information</div>
              <ul style={{ fontSize: 12.5, color: t.warn, marginTop: 10 }}>
                {result.validationErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <Card pad={14}><KPI label="Deal Grade" value={result.dealGrade} sub={`Score ${result.dealScore}/100`} accent={gradeColor(t, result.dealGrade)} /></Card>
                <Card pad={14}><KPI label="Projected Net Profit" value={$(result.projectedNetProfit)} sub={pct(result.profitMargin)} accent={result.projectedNetProfit > 0 ? t.profit : t.danger} /></Card>
                <Card pad={14}><KPI label="Est. Cash to Close" value={$(result.estimatedCashToClose)} sub={`Cash-on-cash ${pct(result.cashOnCashReturn)}`} /></Card>
                <Card pad={14}><KPI label="Best Program" value={result.bestProgram?.name ?? "Needs review"} sub={result.bestProgram ? "Potential fit" : "Adjust the deal"} /></Card>
                <Card pad={14}><KPI label="Loan Amount" value={$(result.loanAmount)} /></Card>
                <Card pad={14}><KPI label="Max Safe Purchase" value={$(result.maxSafePurchasePrice)} sub={`Purchase: ${result.purchasePriceGrade}`} accent={gradeColor(t, result.purchasePriceGrade)} /></Card>
              </div>
              {/* Coverage toggle — switches EVERY tab/figure below
                  between the two construction scenarios. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>Construction</span>
                <div style={{ display: "inline-flex", border: `1px solid ${t.line}`, borderRadius: 999, overflow: "hidden" }}>
                  {(["financed", "self"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setCoverage(c)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: "6px 14px",
                        fontSize: 12.5,
                        fontWeight: 700,
                        background: coverage === c ? t.petrol : "transparent",
                        color: coverage === c ? "#fff" : t.ink3,
                      }}
                    >
                      {c === "financed" ? "Construction financed" : "You fund construction"}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TABS.map((x) => (
                  <button key={x} onClick={() => setTab(x)} style={{ all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: `1px solid ${tab === x ? t.petrol : t.line}`, background: tab === x ? t.petrolSoft : "transparent", color: tab === x ? t.petrol : t.ink3 }}>{x}</button>
                ))}
              </div>
              <div>
                {tab === "Summary" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div style={{ borderRadius: 10, padding: 12, background: result.withinArvEnvelope ? t.profitBg : t.chip }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: result.withinArvEnvelope ? t.profit : t.danger }}>
                        At {(result.arvUsedPct * 100).toFixed(1)}% of ARV{" "}
                        <span style={{ fontWeight: 600 }}>(lenders cap at 75%)</span>
                      </div>
                      <div style={{ fontSize: 12.5, color: result.withinArvEnvelope ? t.profit : t.danger, marginTop: 3 }}>
                        {result.withinArvEnvelope
                          ? `Borrower protected — up to ${$(result.arvHeadroom)} more can still be pulled before hitting the 75% ceiling.`
                          : `Over the 75% ceiling by ${$(result.arvEnvelopeOverflow)} — that amount is the borrower's liability outside the loan.`}
                      </div>
                    </div>
                    <div>
                      <SectionLabel>Construction coverage · click to switch the whole view</SectionLabel>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 6 }}>
                        <ScenarioCard t={t} title="Construction financed (draws)" sub="Lender draws rehab (≤75% ARV)" s={result.constructionScenarios.financed} accent={t.profit} active={coverage === "financed"} onClick={() => setCoverage("financed")} />
                        <ScenarioCard t={t} title="You fund construction" sub="Construction stays outside the loan" s={result.constructionScenarios.selfFunded} accent={t.ink2} active={coverage === "self"} onClick={() => setCoverage("self")} />
                      </div>
                    </div>
                    <div>
                      <SectionLabel>Where the money comes from</SectionLabel>
                      <CapitalStack t={t} result={result} />
                    </div>
                    <div>
                      <SectionLabel>From sale price to net profit</SectionLabel>
                      <ProfitWaterfall t={t} inputs={inputs} result={result} />
                    </div>
                    <PriceMeter t={t} grade={result.purchasePriceGrade} />
                    <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.55 }}>{result.explanation}</div>
                    {result.warnings.map((w) => <div key={w} style={{ fontSize: 12.5, color: t.warn }}>⚠ {w}</div>)}
                  </div>
                ) : null}
                {tab === "Loan Programs" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <SectionLabel>Potential fits</SectionLabel>
                      {result.eligiblePrograms.length === 0 ? <div style={{ fontSize: 13, color: t.ink3 }}>No program is a clear fit under current rules.</div> : result.eligiblePrograms.map((f) => (
                        <div key={f.program.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.line}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>{f.program.name}{result.bestProgram?.id === f.program.id ? <Pill bg={t.profitBg} color={t.profit}>Best overall</Pill> : null}</div>
                            <div style={{ fontSize: 12, color: t.ink3 }}>{(f.program.interestRate * 100).toFixed(2)}% · {f.program.points} pts · {f.program.termMonths}mo</div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 12 }}><div style={{ color: t.ink, fontWeight: 700 }}>Cash to close: {$(f.estimatedCashToClose)}</div><div style={{ color: t.ink3 }}>{$(f.loanAmount)} loan</div></div>
                        </div>
                      ))}
                    </div>
                    {result.eligiblePrograms.length > 1 ? (
                      <div>
                        <SectionLabel>Compare all</SectionLabel>
                        <CompareTable t={t} result={result} />
                      </div>
                    ) : null}
                    <div>
                      <SectionLabel>Not eligible based on current rules</SectionLabel>
                      {result.ineligiblePrograms.map((f) => (
                        <div key={f.program.id} style={{ padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: t.ink2 }}>{f.program.name}</div>
                          <div style={{ fontSize: 12, color: t.danger }}>{(f.reasons ?? []).join(" · ")}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {tab === "HUD Forecast" ? (
                  <HudForecast t={t} result={result} arv={inputs.arv} />
                ) : null}
                {tab === "Profit Breakdown" ? (
                  <div style={{ fontSize: 13 }}>
                    {[["ARV", inputs.arv], ["− Purchase price", -inputs.purchasePrice], ["− Rehab + contingency", -(inputs.rehabCost + result.rehabContingencyAmount)], ["− Financing (interest + points)", -(result.estimatedInterestPaid + result.lenderPointsCost)], ["− Holding", -result.estimatedHoldingCosts], ["− Closing", -result.estimatedClosingCosts], ["− Selling", -result.estimatedSellingCosts]].map(([k, v]) => (
                      <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
                        <span style={{ color: t.ink2 }}>{k}</span><span style={{ color: (v as number) < 0 ? t.danger : t.ink, fontWeight: 700 }}>{$(v as number)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800 }}><span style={{ color: t.ink }}>= Net profit</span><span style={{ color: result.projectedNetProfit > 0 ? t.profit : t.danger }}>{$(result.projectedNetProfit)}</span></div>
                  </div>
                ) : null}
                {tab === "Sensitivity" ? (
                  <div style={{ fontSize: 13 }}>
                    {result.sensitivity.map((s) => (
                      <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${t.line}` }}>
                        <span style={{ flex: 1, color: t.ink2 }}>{s.label}</span>
                        <span style={{ color: s.netProfit > 0 ? t.ink : t.danger, fontWeight: 700, width: 110, textAlign: "right" }}>{$(s.netProfit)}</span>
                        <span style={{ width: 70, textAlign: "right", color: t.ink3 }}>{pct(s.profitMargin)}</span>
                        <Pill bg={t.chip} color={gradeColor(t, s.grade)}>{s.grade}</Pill>
                      </div>
                    ))}
                  </div>
                ) : null}
                {tab === "Make This Deal Work" ? (
                  <ul style={{ fontSize: 13.5, color: t.ink2, lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
                    {result.recommendations.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                ) : null}
              </div>
              <div style={{ fontSize: 11, color: t.ink3 }}>{DISCLAIMER}</div>
            </div>
          )
        ) : null}
      </Card>

      {/* Wizard nav */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => setStepIdx((x) => Math.max(0, x - 1))} disabled={stepIdx === 0} style={{ ...qcBtn(t), opacity: stepIdx === 0 ? 0.4 : 1 }}>Back</button>
        {step !== "Results" ? (
          <button
            onClick={() => {
              if (!stepValid(step)) return;
              if (step === "Review") autoSave();
              setStepIdx((x) => Math.min(STEPS.length - 1, x + 1));
            }}
            disabled={!stepValid(step)}
            style={{ ...qcBtnPrimary(t), opacity: stepValid(step) ? 1 : 0.5 }}
          >
            {step === "Review" ? "Analyze Deal" : "Next"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

type Th = ReturnType<typeof useTheme>["t"];
type Analysis = ReturnType<typeof analyzeFixFlip>;

function ScenarioCard({
  t,
  title,
  sub,
  s,
  accent,
  active,
  onClick,
}: {
  t: Th;
  title: string;
  sub: string;
  s: {
    loanAmount: number;
    estimatedCashToClose: number;
    constructionOutsideLoan: number;
    projectedNetProfit: number;
    holdMonths: number;
  };
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const row = (k: string, v: string, c?: string, strong?: boolean) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "3px 0" }}>
      <span style={{ flex: 1, fontSize: 12, color: t.ink3 }}>{k}</span>
      <span style={{ flexShrink: 0, textAlign: "right", fontSize: 12.5, fontWeight: strong ? 800 : 600, color: c ?? t.ink }}>{v}</span>
    </div>
  );
  return (
    <Card
      pad={12}
      onClick={onClick}
      style={{
        borderTop: `3px solid ${accent}`,
        border: active ? `2px solid ${accent}` : undefined,
        borderTopWidth: 3,
        cursor: onClick ? "pointer" : undefined,
        opacity: onClick && !active ? 0.7 : 1,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 800, color: t.ink }}>{title}</div>
        {active ? <span style={{ fontSize: 11, fontWeight: 800, color: accent }}>● selected</span> : null}
      </div>
      <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8 }}>{sub}</div>
      {row("Cash to close", `$${Math.round(s.estimatedCashToClose).toLocaleString()}`, t.ink, true)}
      {row("Construction you fund (outside loan)", `$${Math.round(s.constructionOutsideLoan).toLocaleString()}`)}
      {row("Loan amount", `$${Math.round(s.loanAmount).toLocaleString()}`)}
      {row("Net profit", `$${Math.round(s.projectedNetProfit).toLocaleString()}`, s.projectedNetProfit > 0 ? t.profit : t.danger)}
    </Card>
  );
}

function StackBar({ segs }: { segs: { w: number; color: string }[] }) {
  const total = segs.reduce((a, s) => a + Math.max(0, s.w), 0) || 1;
  return (
    <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginTop: 6 }}>
      {segs.map((s, idx) => (
        <div key={idx} style={{ width: `${(Math.max(0, s.w) / total) * 100}%`, background: s.color }} />
      ))}
    </div>
  );
}

function Legend({ t, items }: { t: Th; items: { color: string; label: string; value: string }[] }) {
  return (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
      {items.map((it) => (
        <div key={it.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
          <span style={{ flex: 1, fontSize: 12, color: t.ink3 }}>{it.label}</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: t.ink }}>{it.value}</span>
        </div>
      ))}
    </div>
  );
}

function CapitalStack({ t, result }: { t: Th; result: Analysis }) {
  const m = (x: number) => `$${Math.round(x).toLocaleString()}`;
  return (
    <div>
      <StackBar
        segs={[
          { w: result.loanAmount, color: t.profit },
          { w: result.estimatedCashToClose, color: t.ink2 },
          { w: result.rehabContingencyAmount, color: t.warn },
        ]}
      />
      <Legend
        t={t}
        items={[
          { color: t.profit, label: "Lender funds", value: m(result.loanAmount) },
          { color: t.ink2, label: "Cash to close", value: m(result.estimatedCashToClose) },
          { color: t.warn, label: "Rehab contingency reserve", value: m(result.rehabContingencyAmount) },
        ]}
      />
    </div>
  );
}

function ProfitWaterfall({ t, inputs, result }: { t: Th; inputs: FixFlipInputs; result: Analysis }) {
  const m = (x: number) => `$${Math.round(x).toLocaleString()}`;
  const costs =
    inputs.purchasePrice +
    inputs.rehabCost +
    result.rehabContingencyAmount +
    result.estimatedClosingCosts +
    result.estimatedInterestPaid +
    result.estimatedHoldingCosts +
    result.estimatedSellingCosts;
  return (
    <div>
      <StackBar
        segs={[
          { w: costs, color: t.danger },
          { w: Math.max(0, result.projectedNetProfit), color: t.profit },
        ]}
      />
      <Legend
        t={t}
        items={[
          { color: t.ink3, label: "Sale price (ARV)", value: m(inputs.arv) },
          { color: t.danger, label: "All-in costs", value: m(costs) },
          { color: t.profit, label: "Net profit", value: m(result.projectedNetProfit) },
        ]}
      />
    </div>
  );
}

function CompareTable({ t, result }: { t: Th; result: Analysis }) {
  const m = (x: number) => `$${Math.round(x).toLocaleString()}`;
  const progs = result.eligiblePrograms;
  const rows: { label: string; cell: (f: (typeof progs)[number]) => string }[] = [
    { label: "Loan", cell: (f) => m(f.loanAmount) },
    { label: "Cash to close", cell: (f) => m(f.estimatedCashToClose) },
    { label: "Construction outside loan", cell: (f) => m(f.constructionOutsideLoan) },
    { label: "Rate", cell: (f) => `${(f.program.interestRate * 100).toFixed(2)}%` },
    { label: "Points", cell: (f) => `${f.program.points}` },
    { label: "Term", cell: (f) => `${f.program.termMonths}mo` },
    { label: "Net profit", cell: (f) => m(f.projectedNetProfit) },
  ];
  const cell = { padding: "7px 10px", fontSize: 12.5, borderBottom: `1px solid ${t.line}` } as const;
  return (
    <div style={{ overflowX: "auto", marginTop: 6 }}>
      <table style={{ borderCollapse: "collapse", minWidth: 480 }}>
        <thead>
          <tr>
            <th style={{ ...cell, textAlign: "left", color: t.ink3 }} />
            {progs.map((f) => (
              <th key={f.program.id} style={{ ...cell, textAlign: "left", color: result.bestProgram?.id === f.program.id ? t.profit : t.ink, fontWeight: 800 }}>
                {f.program.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td style={{ ...cell, color: t.ink3 }}>{r.label}</td>
              {progs.map((f) => (
                <td key={f.program.id} style={{ ...cell, color: t.ink, fontWeight: 600 }}>{r.cell(f)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PriceMeter({ t, grade }: { t: ReturnType<typeof useTheme>["t"]; grade: Grade }) {
  const bands: Grade[] = ["Excellent", "Good", "Fair", "Risky", "Poor"];
  return (
    <div>
      <SectionLabel>Purchase price quality</SectionLabel>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {bands.map((b) => {
          const active = b === grade;
          const c = b === "Excellent" || b === "Good" ? t.profit : b === "Fair" ? t.warn : t.danger;
          return (
            <div key={b} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 8, borderRadius: 4, background: active ? c : t.chip }} />
              <div style={{ fontSize: 10.5, marginTop: 4, fontWeight: active ? 800 : 600, color: active ? c : t.ink3 }}>{b}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Operator: system-wide runs table ──────────────────────────────────

type RunPayload = {
  inputs?: { address?: { street?: string; city?: string; state?: string } };
  result?: { estimatedCashToClose?: number; projectedNetProfit?: number };
};

function runAddress(row: FixFlipScenarioRow): string {
  const a = (row.payload as RunPayload | null)?.inputs?.address;
  if (!a) return "—";
  return [a.street, a.city, a.state].filter(Boolean).join(", ") || "—";
}
function runCashToClose(row: FixFlipScenarioRow): number | null {
  const v = (row.payload as RunPayload | null)?.result?.estimatedCashToClose;
  return typeof v === "number" ? v : null;
}
function runCreator(row: FixFlipScenarioRow): string {
  return row.created_by_name || row.created_by_email || "—";
}

function RunsTable({
  t,
  rows,
  loading,
  onNew,
  onOpen,
}: {
  t: Th;
  rows: FixFlipScenarioRow[];
  loading: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  const th = {
    textAlign: "left" as const,
    padding: "12px 14px",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
    color: t.ink3,
    borderBottom: `1px solid ${t.line}`,
  };
  const td = { padding: "11px 14px", fontSize: 13, color: t.ink, borderBottom: `1px solid ${t.line}` };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>Deal Analyzer — all runs</h1>
          <p style={{ fontSize: 13, color: t.ink3, margin: "4px 0 0" }}>
            Every Fix &amp; Flip analysis across all users. Click a run to inspect it read-only.
          </p>
        </div>
        <button
          type="button"
          onClick={onNew}
          style={{
            all: "unset", cursor: "pointer", padding: "10px 16px", borderRadius: 10,
            background: t.petrol, color: "#fff", fontSize: 13, fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 6,
          }}
        >
          <Icon name="plus" size={12} stroke={3} /> New analysis
        </button>
      </div>
      <Card pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead>
              <tr>
                {["User", "Created", "Address", "Grade", "Score", "Cash to close", "Status"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...td, color: t.ink3 }}>Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, color: t.ink3 }}>No runs yet.</td></tr>
              ) : (
                rows.map((r) => {
                  const ctc = runCashToClose(r);
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpen(r.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={td}>{runCreator(r)}</td>
                      <td style={{ ...td, color: t.ink3 }}>{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={td}>{runAddress(r)}</td>
                      <td style={td}>{r.deal_grade ?? "—"}</td>
                      <td style={td}>{r.deal_score ?? "—"}</td>
                      <td style={td}>{ctc != null ? $(ctc) : "—"}</td>
                      <td style={{ ...td, color: t.ink3 }}>{r.status}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function RunInspect({
  t,
  row,
  loading,
  onBack,
}: {
  t: Th;
  row: FixFlipScenarioRow | undefined;
  loading: boolean;
  onBack: () => void;
}) {
  const back = (
    <button
      type="button"
      onClick={onBack}
      style={{ all: "unset", cursor: "pointer", color: t.petrol, fontSize: 13, fontWeight: 700 }}
    >
      ← Back to all runs
    </button>
  );
  if (loading) {
    return <div style={{ maxWidth: 860, margin: "0 auto" }}><Card pad={20}><div style={{ fontSize: 13, color: t.ink3 }}>Loading…</div></Card></div>;
  }
  if (!row) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        {back}
        <Card pad={20}><div style={{ fontSize: 13, color: t.ink2 }}>Run not found.</div></Card>
      </div>
    );
  }
  const p = (row.payload as RunPayload | null) ?? null;
  const result = (p?.result ?? null) as Record<string, unknown> | null;
  const inputs = (p?.inputs ?? null) as Record<string, unknown> | null;
  const num = (v: unknown): string =>
    typeof v === "number" ? $(v) : "—";
  return (
    <div style={{ maxWidth: 860, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {back}
      <div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>
          Viewing {runCreator(row)}&apos;s run
        </h1>
        <p style={{ fontSize: 12.5, color: t.ink3, margin: "4px 0 0" }}>
          {new Date(row.created_at).toLocaleString()} · {runAddress(row)} · read-only
        </p>
      </div>
      {!result ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            This run has no saved result snapshot to display.
          </div>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          <Card pad={14}><KPI label="Deal Grade" value={String(row.deal_grade ?? "—")} sub={`Score ${row.deal_score ?? "—"}/100`} /></Card>
          <Card pad={14}><KPI label="Net Profit" value={num(result["projectedNetProfit"])} /></Card>
          <Card pad={14}><KPI label="Cash to Close" value={num(result["estimatedCashToClose"])} /></Card>
          <Card pad={14}><KPI label="Loan Amount" value={num(result["loanAmount"])} /></Card>
          <Card pad={14}><KPI label="Construction outside loan" value={num(result["constructionOutsideLoan"])} /></Card>
          <Card pad={14}><KPI label="Within 75% ARV" value={result["withinArvEnvelope"] ? "Yes" : "No"} /></Card>
        </div>
      )}
      {inputs ? (
        <Card pad={16}>
          <SectionLabel>Saved inputs</SectionLabel>
          <pre style={{ fontSize: 11.5, color: t.ink2, whiteSpace: "pre-wrap", margin: 0 }}>
            {JSON.stringify(inputs, null, 2)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}

function HudForecast({
  t,
  result,
  arv,
}: {
  t: Th;
  result: Analysis;
  arv: number;
}) {
  type L = { k: string; v: number; kind?: "cost" | "total" | "credit" | "final" };
  const lines: L[] = [
    { k: "Purchase price", v: result.totalProjectCost - result.rehabContingencyAmount, kind: "cost" },
    { k: "Closing costs", v: result.estimatedClosingCosts, kind: "cost" },
    { k: "Origination / points", v: result.lenderPointsCost, kind: "cost" },
    { k: "Rehab safety buffer", v: result.rehabContingencyAmount, kind: "cost" },
    { k: "Holding / carry", v: result.estimatedHoldingCosts, kind: "cost" },
    { k: "Interest (hold period)", v: result.estimatedInterestPaid, kind: "cost" },
    { k: "Selling costs", v: result.estimatedSellingCosts, kind: "cost" },
    { k: "Total fees & costs", v: result.totalFeesAndCosts, kind: "total" },
    { k: "Loan amount (credit)", v: -result.loanAmount, kind: "credit" },
    { k: "Estimated cash to close", v: result.estimatedCashToClose, kind: "final" },
  ];
  const head = { fontSize: 10.5, fontWeight: 700, color: t.ink4, textTransform: "uppercase" as const, letterSpacing: 0.6 };
  return (
    <div style={{ fontSize: 13 }}>
      <div style={{ display: "flex", padding: "0 0 6px" }}>
        <span style={{ flex: 1, ...head }}>Item</span>
        <span style={{ width: 130, textAlign: "right", ...head }}>Amount</span>
        <span style={{ width: 70, textAlign: "right", ...head }}>% ARV</span>
      </div>
      {lines.map((l) => {
        const isTotal = l.kind === "total" || l.kind === "final";
        const credit = l.kind === "credit";
        const pct = arv > 0 ? (Math.abs(l.v) / arv) * 100 : 0;
        return (
          <div
            key={l.k}
            style={{
              display: "flex",
              alignItems: "center",
              padding: l.kind === "final" ? "10px 0 0" : "6px 0",
              borderTop: l.kind === "final" ? `1px solid ${t.line}` : "none",
              borderBottom: l.kind === "final" ? "none" : `1px solid ${t.line}`,
            }}
          >
            <span style={{ flex: 1, color: isTotal ? t.ink : t.ink2, fontWeight: isTotal ? 800 : 400 }}>{l.k}</span>
            <span style={{ width: 130, textAlign: "right", fontWeight: isTotal ? 800 : 700, color: credit ? t.profit : isTotal ? t.ink : t.ink2 }}>
              {credit ? `(${$(Math.abs(l.v))})` : $(l.v)}
            </span>
            <span style={{ width: 70, textAlign: "right", color: t.ink3 }}>({pct.toFixed(1)}%)</span>
          </div>
        );
      })}
      <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 8 }}>
        Cash to close is only the money due at the table — not the total project cost.
        Forecast only; final figures depend on lender approval, title, taxes, insurance,
        draw schedule, and the final settlement statement.
      </div>
    </div>
  );
}
