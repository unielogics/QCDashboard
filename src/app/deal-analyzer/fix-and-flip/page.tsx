"use client";

// Fix & Flip Deal Analyzer — decision engine, not a calculator.
// Two-panel: collapsible left inputs, right results with tabs.
// All math is client-side (src/lib/fixFlip). Hedged language only —
// never "approved"/"guaranteed"/"will qualify".

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useClient,
  useCurrentCredit,
  useSaveFixFlipScenario,
} from "@/hooks/useApi";
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
const EXPERIENCE: { v: ExperienceTier; l: string }[] = [
  { v: "0_flips", l: "First-time investor" },
  { v: "1_2_flips", l: "1-2 completed flips" },
  { v: "3_5_flips", l: "3-5 completed flips" },
  { v: "5_plus_flips", l: "5+ completed flips" },
  { v: "pro", l: "Professional operator" },
];

const TABS = ["Summary", "Loan Programs", "HUD Forecast", "Profit Breakdown", "Sensitivity", "Make This Deal Work"] as const;
type Tab = (typeof TABS)[number];

const DEFAULTS: FixFlipInputs = {
  address: { street: "", city: "", state: "", zip: "" },
  propertyType: "single_family",
  purchasePrice: 0,
  arv: 0,
  rehabCost: 0,
  rehabContingencyPct: 0.1,
  monthlyHoldingCost: 0,
  sellingCostPct: 0.06,
  closingCostPct: 0.02,
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
  const clientId = sp?.get("clientId") ?? null;
  const { data: client } = useClient(clientId);
  const { data: credit } = useCurrentCredit(clientId);
  const save = useSaveFixFlipScenario();

  const [i, setI] = useState<FixFlipInputs>(DEFAULTS);
  const [collapsed, setCollapsed] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [tab, setTab] = useState<Tab>("Summary");
  const [flash, setFlash] = useState<string | null>(null);

  // Prefill borrower/credit when arriving with ?clientId=.
  const prefilled = useMemo(() => {
    if (!client) return i;
    return {
      ...i,
      creditScore: i.creditScore ?? credit?.fico ?? client.fico ?? undefined,
    };
  }, [client, credit]); // eslint-disable-line react-hooks/exhaustive-deps

  const inputs = prefilled;
  const result = useMemo(() => analyzeFixFlip(inputs), [inputs]);
  const ready = result.validationErrors.length === 0;

  const set = <K extends keyof FixFlipInputs>(k: K, v: FixFlipInputs[K]) =>
    setI((p) => ({ ...p, [k]: v }));
  const setAddr = (k: keyof FixFlipInputs["address"], v: string) =>
    setI((p) => ({ ...p, address: { ...p.address, [k]: v } }));
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  const onSave = async () => {
    try {
      await save.mutateAsync({
        client_id: clientId ?? undefined,
        status: "saved",
        payload: { inputs, result } as unknown as Record<string, unknown>,
        deal_score: result.dealScore,
        deal_grade: result.dealGrade,
      });
      setFlash("Scenario saved.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't save scenario.");
    }
    setTimeout(() => setFlash(null), 3500);
  };

  const field = (
    label: string,
    value: string | number,
    onChange: (s: string) => void,
    placeholder?: string,
  ) => (
    <label style={{ display: "block", marginBottom: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </span>
      <input
        value={value === 0 ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8,
          border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13,
        }}
      />
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>
            Fix &amp; Flip Deal Analyzer
          </h1>
          <p style={{ fontSize: 13, color: t.ink3, margin: "4px 0 0" }}>
            See if the deal works before you make the offer — profit, cash to
            close, financing options, and downside risk in one place.
          </p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {ready ? (
            <button onClick={() => setCollapsed((c) => !c)} style={qcBtn(t)}>
              {collapsed ? "Edit inputs" : "Collapse inputs"}
            </button>
          ) : null}
          <button onClick={onSave} disabled={!ready || save.isPending} style={{ ...qcBtnPrimary(t), opacity: !ready || save.isPending ? 0.5 : 1 }}>
            {save.isPending ? "Saving…" : "Save Scenario"}
          </button>
        </div>
      </div>
      {flash ? (
        <div style={{ fontSize: 12.5, color: flash.includes("Couldn") ? t.danger : t.profit, fontWeight: 600 }}>{flash}</div>
      ) : null}

      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        {/* LEFT — inputs */}
        {!collapsed ? (
          <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
            <Card pad={16}>
              <SectionLabel>Property</SectionLabel>
              {field("Street address", inputs.address.street, (s) => setAddr("street", s))}
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 2 }}>{field("City", inputs.address.city, (s) => setAddr("city", s))}</div>
                <div style={{ flex: 1 }}>{field("State", inputs.address.state, (s) => setAddr("state", s.toUpperCase().slice(0, 2)))}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>{field("ZIP", inputs.address.zip, (s) => setAddr("zip", s))}</div>
                <div style={{ flex: 1 }}>{field("County", inputs.address.county ?? "", (s) => setAddr("county" as never, s))}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>{field("Unit", inputs.address.unit ?? "", (s) => setAddr("unit" as never, s))}</div>
                <div style={{ flex: 1 }}>{field("Parcel ID", inputs.address.parcelId ?? "", (s) => setAddr("parcelId" as never, s))}</div>
              </div>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>Property type</span>
                <select
                  value={inputs.propertyType}
                  onChange={(e) => set("propertyType", e.target.value as PropertyType)}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13 }}
                >
                  {PROPERTY_TYPES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
                </select>
              </label>
            </Card>

            <Card pad={16}>
              <SectionLabel>Deal numbers</SectionLabel>
              {field("Purchase price / BRV", inputs.purchasePrice, (s) => set("purchasePrice", num(s)))}
              {field("After repair value (ARV)", inputs.arv, (s) => set("arv", num(s)))}
              {field("Rehab / construction budget", inputs.rehabCost, (s) => set("rehabCost", num(s)))}
              {field("Rehab contingency %", inputs.rehabContingencyPct * 100, (s) => set("rehabContingencyPct", num(s) / 100), "10")}
              {field("Monthly holding cost", inputs.monthlyHoldingCost, (s) => set("monthlyHoldingCost", num(s)))}
              {field("Selling cost %", inputs.sellingCostPct * 100, (s) => set("sellingCostPct", num(s) / 100), "6")}
              {field("Closing cost %", inputs.closingCostPct * 100, (s) => set("closingCostPct", num(s) / 100), "2")}
            </Card>

            <Card pad={16}>
              <SectionLabel>Timeline</SectionLabel>
              {field("Construction months", inputs.constructionMonths, (s) => set("constructionMonths", num(s)))}
              {field("Months to sell after construction", inputs.monthsToSell, (s) => set("monthsToSell", num(s)))}
              <div style={{ fontSize: 12, color: t.ink3 }}>Total hold: <b style={{ color: t.ink }}>{result.holdMonths} months</b></div>
            </Card>

            <Card pad={16}>
              <SectionLabel>Borrower / credit</SectionLabel>
              {field("Credit score", inputs.creditScore ?? 0, (s) => set("creditScore", num(s) || undefined))}
              <label style={{ display: "block", marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.6 }}>Experience</span>
                <select
                  value={inputs.experience}
                  onChange={(e) => set("experience", e.target.value as ExperienceTier)}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface, color: t.ink, fontSize: 13 }}
                >
                  {EXPERIENCE.map((x) => <option key={x.v} value={x.v}>{x.l}</option>)}
                </select>
              </label>
              {field("Liquidity available", inputs.liquidity ?? 0, (s) => set("liquidity", num(s) || undefined))}
            </Card>

            <Card pad={16}>
              <button onClick={() => setShowAdvanced((a) => !a)} style={{ all: "unset", cursor: "pointer", fontSize: 12, fontWeight: 700, color: t.petrol }}>
                {showAdvanced ? "− Hide" : "+ Show"} advanced assumptions
              </button>
              {showAdvanced ? (
                <div style={{ marginTop: 10 }}>
                  {field("Interest rate override %", (inputs.interestRateOverride ?? 0) * 100, (s) => set("interestRateOverride", num(s) / 100 || undefined))}
                  {field("Points override", inputs.pointsOverride ?? 0, (s) => set("pointsOverride", num(s) || undefined))}
                  {field("Origination fee", inputs.originationFee ?? 0, (s) => set("originationFee", num(s)))}
                  {field("Title / legal estimate", inputs.titleLegalEstimate ?? 0, (s) => set("titleLegalEstimate", num(s)))}
                  {field("Insurance estimate", inputs.insuranceEstimate ?? 0, (s) => set("insuranceEstimate", num(s)))}
                  {field("ARV haircut %", (inputs.arvHaircutPct ?? 0) * 100, (s) => set("arvHaircutPct", num(s) / 100))}
                  {field("Rehab overrun %", (inputs.rehabOverrunPct ?? 0) * 100, (s) => set("rehabOverrunPct", num(s) / 100))}
                </div>
              ) : null}
            </Card>
          </div>
        ) : null}

        {/* RIGHT — results */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {!ready ? (
            <Card pad={24}>
              <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>Enter the deal to see results</div>
              <div style={{ fontSize: 13, color: t.ink3, marginTop: 6 }}>
                Add the property address and deal numbers to see projected
                profit, cash needed, loan options, and your max safe offer.
              </div>
              <ul style={{ fontSize: 12.5, color: t.warn, marginTop: 10 }}>
                {result.validationErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </Card>
          ) : (
            <>
              {/* Summary cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <Card pad={14}><KPI label="Deal Grade" value={result.dealGrade} sub={`Score ${result.dealScore}/100`} accent={gradeColor(t, result.dealGrade)} /></Card>
                <Card pad={14}><KPI label="Projected Net Profit" value={$(result.projectedNetProfit)} sub={pct(result.profitMargin)} accent={result.projectedNetProfit > 0 ? t.profit : t.danger} /></Card>
                <Card pad={14}><KPI label="Est. Cash to Close" value={$(result.estimatedCashToClose)} sub={`Cash-on-cash ${pct(result.cashOnCashReturn)}`} /></Card>
                <Card pad={14}><KPI label="Best Program" value={result.bestProgram?.name ?? "Needs review"} sub={result.bestProgram ? "Potential fit" : "Adjust the deal"} /></Card>
                <Card pad={14}><KPI label="Loan Amount" value={$(result.loanAmount)} /></Card>
                <Card pad={14}><KPI label="Max Safe Purchase" value={$(result.maxSafePurchasePrice)} sub={`Purchase: ${result.purchasePriceGrade}`} accent={gradeColor(t, result.purchasePriceGrade)} /></Card>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TABS.map((x) => (
                  <button key={x} onClick={() => setTab(x)} style={{ all: "unset", cursor: "pointer", padding: "6px 12px", borderRadius: 999, fontSize: 12.5, fontWeight: 700, border: `1px solid ${tab === x ? t.petrol : t.line}`, background: tab === x ? t.petrolSoft : "transparent", color: tab === x ? t.petrol : t.ink3 }}>{x}</button>
                ))}
              </div>

              <Card pad={18}>
                {tab === "Summary" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <PriceMeter t={t} grade={result.purchasePriceGrade} />
                    <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.55 }}>{result.explanation}</div>
                    {result.warnings.length ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {result.warnings.map((w) => (
                          <div key={w} style={{ fontSize: 12.5, color: t.warn }}>⚠ {w}</div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {tab === "Loan Programs" ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    <div>
                      <SectionLabel>Potential fits</SectionLabel>
                      {result.eligiblePrograms.length === 0 ? (
                        <div style={{ fontSize: 13, color: t.ink3 }}>No program is a clear fit under current rules.</div>
                      ) : result.eligiblePrograms.map((f) => (
                        <div key={f.program.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${t.line}` }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13.5, fontWeight: 700, color: t.ink }}>
                              {f.program.name}
                              {result.bestProgram?.id === f.program.id ? <Pill bg={t.profitBg} color={t.profit}>Best overall</Pill> : null}
                            </div>
                            <div style={{ fontSize: 12, color: t.ink3 }}>{(f.program.interestRate * 100).toFixed(2)}% · {f.program.points} pts · {f.program.termMonths}mo</div>
                          </div>
                          <div style={{ textAlign: "right", fontSize: 12 }}>
                            <div style={{ color: t.ink }}>{$(f.loanAmount)} loan</div>
                            <div style={{ color: t.ink3 }}>{$(f.estimatedCashToClose)} cash</div>
                          </div>
                        </div>
                      ))}
                    </div>
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
                  <div style={{ fontSize: 13 }}>
                    {[
                      ["Purchase price", -inputs.purchasePrice],
                      ["Loan amount", result.loanAmount],
                      ["Origination / points", -result.lenderPointsCost],
                      ["Closing costs", -result.estimatedClosingCosts],
                      ["Interest (hold period)", -result.estimatedInterestPaid],
                      ["Holding costs", -result.estimatedHoldingCosts],
                      ["Selling costs", -result.estimatedSellingCosts],
                    ].map(([k, v]) => (
                      <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
                        <span style={{ color: t.ink2 }}>{k}</span>
                        <span style={{ color: (v as number) < 0 ? t.danger : t.ink, fontWeight: 700 }}>{$(v as number)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800 }}>
                      <span style={{ color: t.ink }}>Estimated cash to close</span>
                      <span style={{ color: t.ink }}>{$(result.estimatedCashToClose)}</span>
                    </div>
                    <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 8 }}>
                      This is a forecast only. Final cash to close depends on
                      lender approval, title, taxes, insurance, draw schedule,
                      and the final settlement statement.
                    </div>
                  </div>
                ) : null}

                {tab === "Profit Breakdown" ? (
                  <div style={{ fontSize: 13 }}>
                    {[
                      ["ARV", inputs.arv],
                      ["− Purchase price", -inputs.purchasePrice],
                      ["− Rehab + contingency", -(inputs.rehabCost + result.rehabContingencyAmount)],
                      ["− Financing (interest + points)", -(result.estimatedInterestPaid + result.lenderPointsCost)],
                      ["− Holding", -result.estimatedHoldingCosts],
                      ["− Closing", -result.estimatedClosingCosts],
                      ["− Selling", -result.estimatedSellingCosts],
                    ].map(([k, v]) => (
                      <div key={k as string} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${t.line}` }}>
                        <span style={{ color: t.ink2 }}>{k}</span>
                        <span style={{ color: (v as number) < 0 ? t.danger : t.ink, fontWeight: 700 }}>{$(v as number)}</span>
                      </div>
                    ))}
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: 10, fontWeight: 800 }}>
                      <span style={{ color: t.ink }}>= Net profit</span>
                      <span style={{ color: result.projectedNetProfit > 0 ? t.profit : t.danger }}>{$(result.projectedNetProfit)}</span>
                    </div>
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
              </Card>

              <div style={{ fontSize: 11, color: t.ink3 }}>{DISCLAIMER}</div>
            </>
          )}
        </div>
      </div>
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
