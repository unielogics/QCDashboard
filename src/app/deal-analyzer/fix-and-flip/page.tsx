"use client";

// Fix & Flip Deal Analyzer — paginated wizard. Borrower credit +
// experience are DERIVED from the profile (read-only), never typed.
// All math is client-side (src/lib/fixFlip). Hedged language only.

import { Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  Card,
  CellChip,
  Field,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Lbl,
  Note,
  PageHeader,
  Panel,
  Seg,
  Select,
  Sub,
  Table,
  Td,
  Tr,
  WarnLine,
  type ChipTone,
} from "@/components/ds";
import { ClientSearchBlock } from "@/components/ClientSearchBlock";
import { RecentAnalysisRunsCard } from "@/components/analysis/RecentAnalysisRunsCard";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import {
  useClient,
  useAnalysisRuns,
  useClosingCostTiers,
  useConvertAnalysisRunToPrequal,
  useCreateAnalysisRun,
  useCurrentCredit,
  useFixFlipScenario,
  useFixFlipScenarios,
  useMyClient,
  useSaveFixFlipScenario,
  useShareAnalysisRun,
  useUpdateAnalysisRun,
  useUpdateFixFlipScenario,
  type FixFlipScenarioRow,
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

/** Data-derived tint on a figure — what the retired `accent` prop used to carry. */
const tinted = (value: ReactNode, color: string) => <span style={{ color }}>{value}</span>;

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
function deriveExperienceTier(raw?: string | null): ExperienceTier {
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

/** Grade → the palette variable it reads as. */
function gradeColor(g: string): string {
  if (g === "Excellent" || g === "Good") return "var(--ok)";
  if (g === "Fair" || g === "Thin") return "var(--warn)";
  return "var(--danger)";
}
/** Same scale, as a chip tone. */
function gradeTone(g: string): ChipTone {
  if (g === "Excellent" || g === "Good") return "ok";
  if (g === "Fair" || g === "Thin") return "warn";
  return "bad";
}

export default function FixAndFlipAnalyzerPage() {
  // Still read for ClientSearchBlock, which takes `t` and is shared with routes
  // that have not migrated yet.
  const { t } = useTheme();
  const sp = useSearchParams();
  const queryClientId = sp?.get("clientId") ?? null;
  const { data: myClient } = useMyClient();
  const profile = useActiveProfile();
  const canLinkClient =
    profile.role === Role.BROKER ||
    profile.role === Role.SUPER_ADMIN ||
    profile.role === Role.LOAN_EXEC;
  const canCreatePrequal = canLinkClient;
  const [selectedClientId, setSelectedClientId] = useState<string | null>(queryClientId);
  const [overrideFicoText, setOverrideFicoText] = useState("");
  useEffect(() => {
    if (queryClientId) setSelectedClientId(queryClientId);
  }, [queryClientId]);
  useEffect(() => {
    setOverrideFicoText("");
  }, [selectedClientId]);
  // Prefer ?clientId= (agent/operator opening a borrower); else the
  // signed-in client's own profile.
  const profileClientId = selectedClientId ?? myClient?.id ?? null;
  const { data: client } = useClient(selectedClientId);
  const { data: credit } = useCurrentCredit(profileClientId);

  const profileClient = selectedClientId ? client : myClient;
  const derivedCredit =
    credit?.fico ?? profileClient?.fico ?? undefined;
  const overrideFico = (() => {
    const n = Number(overrideFicoText.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n >= 300 && n <= 850 ? n : undefined;
  })();
  const effectiveCredit = derivedCredit ?? (canLinkClient ? overrideFico : undefined);
  const derivedExperience = deriveExperienceTier(profileClient?.experience);

  const save = useSaveFixFlipScenario();
  const update = useUpdateFixFlipScenario();
  const createAnalysis = useCreateAnalysisRun();
  const updateAnalysis = useUpdateAnalysisRun();
  const convertAnalysis = useConvertAnalysisRunToPrequal();
  const shareAnalysis = useShareAnalysisRun();
  const [savedId, setSavedId] = useState<string | null>(null);
  const [analysisRunId, setAnalysisRunId] = useState<string | null>(null);
  const [i, setI] = useState<FixFlipInputs>(DEFAULTS);
  const [stepIdx, setStepIdx] = useState(0);
  const [tab, setTab] = useState<Tab>("Summary");
  const [flash, setFlash] = useState<string | null>(null);
  const [prequalFlash, setPrequalFlash] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<"financed" | "self">("financed");
  const step: Step = STEPS[stepIdx];

  // Credit + experience always come from the profile, never the form.
  const inputs: FixFlipInputs = useMemo(
    () => ({ ...i, creditScore: effectiveCredit, experience: derivedExperience }),
    [i, effectiveCredit, derivedExperience],
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
  const isOperator =
    profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const wantNew = sp?.get("new") === "1";
  const runId = sp?.get("run") ?? null;
  const allRuns = useFixFlipScenarios();
  const inspected = useFixFlipScenario(runId);
  const recentSince = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const { data: recentRuns = [] } = useAnalysisRuns({
    tool_source: "deal_analyzer",
    updated_since: recentSince,
    limit: 50,
  });

  const set = <K extends keyof FixFlipInputs>(k: K, v: FixFlipInputs[K]) =>
    setI((p) => ({ ...p, [k]: v }));
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
      client_id: profileClientId ?? null,
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

  const analysisPayload = (propertyAddress: string, notes: string) => ({
    product: "fix_flip" as const,
    tool_source: "deal_analyzer" as const,
    title: `Fix & Flip - ${propertyAddress}`,
    client_id: selectedClientId ?? null,
    target_property_address: propertyAddress,
    inputs: {
      ...inputs,
      address: propertyAddress,
      purchase_price: inputs.purchasePrice,
      brv: inputs.purchasePrice,
      arv: inputs.arv,
      rehab_cost: inputs.rehabCost,
      requested_loan_amount: Math.max(1, Math.round(result.loanAmount)),
      loan_amount: Math.max(1, Math.round(result.loanAmount)),
      fico: effectiveCredit,
      notes,
      construction_coverage: coverage,
    } as unknown as Record<string, unknown>,
    calculator_output: result as unknown as Record<string, unknown>,
  });

  const ensureAnalysisRun = async (propertyAddress: string, notes: string) => {
    const payload = analysisPayload(propertyAddress, notes);
    const row = analysisRunId
      ? await updateAnalysis.mutateAsync({ id: analysisRunId, patch: payload })
      : await createAnalysis.mutateAsync(payload);
    setAnalysisRunId(row.id);
    return row;
  };

  const shareToClient = async () => {
    setPrequalFlash(null);
    if (!selectedClientId) {
      setPrequalFlash("Link one of your clients before sharing this analysis.");
      return;
    }
    if (result.validationErrors.length) {
      setPrequalFlash("Resolve the analyzer errors before sharing.");
      return;
    }

    const propertyAddress = formatAddressParts(inputs.address, "Property TBD") || "Property TBD";
    const notes = [
      "Created from Fix & Flip Deal Analyzer.",
      `Construction scenario: ${coverage === "financed" ? "construction financed" : "borrower-funded construction"}.`,
      `Deal grade: ${result.dealGrade}; score ${result.dealScore}/100.`,
      `Estimated cash to close: ${$(result.estimatedCashToClose)}.`,
      `Projected net profit: ${$(result.projectedNetProfit)}.`,
    ].join(" ");
    try {
      const row = await ensureAnalysisRun(propertyAddress, notes);
      await shareAnalysis.mutateAsync(row.id);
      setPrequalFlash("Analysis shared to the client portal.");
    } catch (e) {
      setPrequalFlash(e instanceof Error ? e.message : "Could not share analysis.");
    }
  };

  const createPrequalification = async () => {
    setPrequalFlash(null);
    if (!selectedClientId) {
      setPrequalFlash("Link one of your clients before creating a prequalification.");
      return;
    }
    if (effectiveCredit == null) {
      setPrequalFlash("Add a borrower FICO before creating a prequalification.");
      return;
    }
    if (result.validationErrors.length) {
      setPrequalFlash("Resolve the analyzer errors before creating a prequalification.");
      return;
    }

    const propertyAddress = formatAddressParts(inputs.address, "Property TBD") || "Property TBD";
    const notes = [
      "Created from Fix & Flip Deal Analyzer.",
      `Construction scenario: ${coverage === "financed" ? "construction financed" : "borrower-funded construction"}.`,
      `Deal grade: ${result.dealGrade}; score ${result.dealScore}/100.`,
      `Estimated cash to close: ${$(result.estimatedCashToClose)}.`,
      `Projected net profit: ${$(result.projectedNetProfit)}.`,
    ].join(" ");

    try {
      const run = await ensureAnalysisRun(propertyAddress, notes);
      const converted = await convertAnalysis.mutateAsync({
        runId: run.id,
        payload: {
          notes,
          manual_credit_override: {
            fico: effectiveCredit,
            property_count: 0,
            has_year_of_ownership: false,
          },
        },
      });
      setAnalysisRunId(converted.analysis_run.id);
      setPrequalFlash("Pending prequalification created for funding review.");
      if (savedId) {
        try {
          await update.mutateAsync({ id: savedId, status: "converted_to_prequal" });
        } catch {
          // Non-critical: the prequalification is already in the queue.
        }
      }
    } catch (e) {
      setPrequalFlash(e instanceof Error ? e.message : "Could not create prequalification.");
    }
  };

  // JSX-returning helper (NOT a component) so inputs keep focus across
  // re-renders.
  const fld = (label: string, value: string | number, onChange: (s: string) => void, placeholder?: string) => (
    <Field label={label}>
      <Input value={value === 0 ? "" : String(value)} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </Field>
  );

  if (runId) {
    return (
      <RunInspect
        row={inspected.data}
        loading={inspected.isLoading}
        onBack={() => router.push("/deal-analyzer/fix-and-flip")}
      />
    );
  }
  if (isOperator && !wantNew) {
    return (
      <RunsTable
        rows={allRuns.data ?? []}
        loading={allRuns.isLoading}
        onNew={() => router.push("/deal-analyzer/fix-and-flip?new=1")}
        onOpen={(id) => router.push(`/deal-analyzer/fix-and-flip?run=${id}`)}
      />
    );
  }

  const busyPrequal = convertAnalysis.isPending || createAnalysis.isPending || updateAnalysis.isPending;
  const busyShare = shareAnalysis.isPending || createAnalysis.isPending || updateAnalysis.isPending;

  return (
    <div className="grid" style={{ maxWidth: 860, margin: "0 auto" }}>
      <PageHeader
        title="Fix & Flip Deal Analyzer"
        lede="See if the deal works before you make the offer — profit, cash to close, financing options, and downside risk."
      />

      <RecentAnalysisRunsCard
        runs={recentRuns}
        title="Saved analyzer runs - last 30 days"
        emptyText="Saved Deal Analyzer runs will appear here after you save, share, or create a prequalification."
      />

      {/* Stepper */}
      <div className="row">
        {STEPS.map((s, idx) => {
          const active = idx === stepIdx;
          const done = idx < stepIdx;
          return (
            <Fragment key={s}>
              <CellChip tone={active ? "pet" : done ? "ok" : "mut"}>
                <span>{idx + 1}</span>
                <span>{s}</span>
              </CellChip>
              {idx < STEPS.length - 1 ? <Sub>→</Sub> : null}
            </Fragment>
          );
        })}
      </div>

      {flash ? (
        flash.includes("Couldn") ? <WarnLine>{flash}</WarnLine> : <Note>{flash}</Note>
      ) : null}

      {canLinkClient ? (
        <Panel title="Borrower link">
          {selectedClientId ? (
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700 }}>{profileClient?.name ?? "Linked client"}</div>
                <Sub>{profileClient?.email ?? profileClient?.phone ?? "Borrower profile linked"}</Sub>
              </div>
              <Btn onClick={() => setSelectedClientId(null)}>
                <Icon name="x" size={13} /> Clear
              </Btn>
            </div>
          ) : (
            <ClientSearchBlock
              t={t}
              onPick={(c) => setSelectedClientId(c.id)}
              label="Search client"
              helperText="Credit and experience come from the linked borrower profile."
            />
          )}
          <div className="row mt">
            <Sub>Credit</Sub>
            {derivedCredit != null ? (
              <CellChip tone="pet">FICO {derivedCredit}</CellChip>
            ) : overrideFico != null ? (
              <CellChip tone="warn">FICO {overrideFico} override</CellChip>
            ) : (
              <CellChip tone="mut">Not on file</CellChip>
            )}
            {derivedCredit == null ? (
              <Field label="Analyzer FICO override">
                <Input
                  value={overrideFicoText}
                  onChange={(e) => setOverrideFicoText(e.target.value)}
                  placeholder="720"
                  inputMode="numeric"
                />
              </Field>
            ) : null}
            <Sub>Override is used only for this analyzer/prequal request.</Sub>
          </div>
        </Panel>
      ) : null}

      <Card>
        {step === "Property" ? (
          <div className="grid">
            <Lbl>Property</Lbl>
            <GoogleAddressInput
              value={inputs.address}
              onChange={(next) =>
                setI((p) => ({
                  ...p,
                  address: {
                    ...p.address,
                    street: next.street ?? "",
                    city: next.city ?? "",
                    state: next.state ?? "",
                    zip: next.zip ?? "",
                  },
                }))
              }
              helperText="Select a Google suggestion to split the address automatically, or use manual entry when the property is not listed."
            />
            <Field label="Property type">
              <Select value={inputs.propertyType} onChange={(e) => set("propertyType", e.target.value as PropertyType)}>
                {PROPERTY_TYPES.map((p) => <option key={p.v} value={p.v}>{p.l}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}

        {step === "Deal Numbers" ? (
          <div className="grid">
            <Lbl>Deal numbers</Lbl>
            {fld('Purchase price / BRV', inputs.purchasePrice, (s) => set("purchasePrice", num(s)))}
            {fld('After repair value (ARV)', inputs.arv, (s) => set("arv", num(s)))}
            {fld('Rehab / construction budget', inputs.rehabCost, (s) => set("rehabCost", num(s)))}
            {fld('Rehab contingency %', inputs.rehabContingencyPct * 100, (s) => set("rehabContingencyPct", num(s) / 100), '10')}
            {fld('Selling cost %', inputs.sellingCostPct * 100, (s) => set("sellingCostPct", num(s) / 100), '6')}
            <Sub>
              Closing % is derived from the firm&apos;s closing-cost tier table; monthly
              carry (interest + taxes + insurance) is system-generated. Neither is entered here.
            </Sub>
          </div>
        ) : null}

        {step === "Timeline & Cash" ? (
          <div className="grid">
            <Lbl>Timeline &amp; cash</Lbl>
            {fld('Construction months', inputs.constructionMonths, (s) => set("constructionMonths", num(s)))}
            {fld('Months to sell after construction', inputs.monthsToSell, (s) => set("monthsToSell", num(s)))}
            {fld('Cash to work available', inputs.liquidity ?? 0, (s) => set("liquidity", num(s) || undefined))}
            <div>
              <Sub>Total hold: <b style={{ color: "var(--ink)" }}>{result.holdMonths} months</b></Sub>
              <div>
                <Sub>Est. monthly carry: <b style={{ color: "var(--ink)" }}>{$(result.estimatedMonthlyCarry)}/mo</b> (interest + taxes + insurance, system-generated)</Sub>
              </div>
            </div>
          </div>
        ) : null}

        {step === "Review" ? (
          <div className="grid">
            <div>
              <Lbl>Borrower profile</Lbl>
              <div className="row mt">
                <Sub>Credit score</Sub>
                {effectiveCredit != null ? (
                  <CellChip tone={derivedCredit != null ? "pet" : "warn"}>
                    {effectiveCredit}{derivedCredit == null ? " override" : ""}
                  </CellChip>
                ) : (
                  <CellChip tone="mut">Not on file</CellChip>
                )}
                <Sub>Experience</Sub>
                <CellChip tone="mut">{EXP_LABEL[derivedExperience]}</CellChip>
              </div>
            </div>
            <Sub>
              Credit &amp; experience are pulled from the borrower&apos;s profile. Broker/operator FICO override applies only to this analysis and pending prequal request.
            </Sub>
            <div>
              <Lbl>Recap</Lbl>
              <div className="mt">
                {inputs.address.street}, {inputs.address.city} {inputs.address.state} {inputs.address.zip}<br />
                Purchase {$(inputs.purchasePrice)} · ARV {$(inputs.arv)} · Rehab {$(inputs.rehabCost)}<br />
                Hold {result.holdMonths} months · Cash to work {$(inputs.liquidity ?? 0)}
              </div>
            </div>
          </div>
        ) : null}

        {step === "Results" ? (
          result.validationErrors.length ? (
            <WarnLine>
              <b>Missing information</b>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                {result.validationErrors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </WarnLine>
          ) : (
            <div className="grid">
              <KpiRow>
                <Kpi label="Deal Grade" value={tinted(result.dealGrade, gradeColor(result.dealGrade))} sub={`Score ${result.dealScore}/100`} />
                <Kpi label="Projected Net Profit" value={tinted($(result.projectedNetProfit), result.projectedNetProfit > 0 ? "var(--ok)" : "var(--danger)")} sub={pct(result.profitMargin)} />
                <Kpi label="Est. Cash to Close" value={$(result.estimatedCashToClose)} sub={`Cash-on-cash ${pct(result.cashOnCashReturn)}`} />
                <Kpi label="Best Program" value={result.bestProgram?.name ?? "Needs review"} sub={result.bestProgram ? "Potential fit" : "Adjust the deal"} />
                <Kpi label="Loan Amount" value={$(result.loanAmount)} />
                <Kpi label="Max Safe Purchase" value={tinted($(result.maxSafePurchasePrice), gradeColor(result.purchasePriceGrade))} sub={`Purchase: ${result.purchasePriceGrade}`} />
              </KpiRow>
              {/* Coverage toggle — switches EVERY tab/figure below
                  between the two construction scenarios. */}
              <div className="row">
                <Lbl>Construction</Lbl>
                <Seg
                  as="filter"
                  ariaLabel="Construction coverage"
                  value={coverage}
                  onChange={setCoverage}
                  options={[
                    { value: "financed", label: "Construction financed" },
                    { value: "self", label: "You fund construction" },
                  ]}
                />
              </div>
              {canCreatePrequal ? (
                <div className="card row">
                  <Btn onClick={shareToClient} disabled={busyShare}>
                    {shareAnalysis.isPending ? "Sharing..." : "Share to client"}
                  </Btn>
                  <Btn variant="pri" onClick={createPrequalification} disabled={busyPrequal}>
                    {convertAnalysis.isPending ? "Creating..." : "Create pending prequalification"}
                  </Btn>
                  <span className="sub" style={{ flex: 1, minWidth: 220 }}>
                    Requires a linked client and borrower FICO. Funding team approval is still required.
                  </span>
                  {prequalFlash ? (
                    <div style={{ width: "100%" }}>
                      {prequalFlash.includes("created") ? (
                        <Note>{prequalFlash}</Note>
                      ) : (
                        <WarnLine>{prequalFlash}</WarnLine>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {/* `.seg` does not wrap, so the six-tab strip scrolls inside its
                  own box rather than widening the card on a narrow viewport. */}
              <div style={{ overflowX: "auto" }}>
                <Seg
                  ariaLabel="Analysis view"
                  value={tab}
                  onChange={setTab}
                  options={TABS.map((x) => ({ value: x, label: x }))}
                />
              </div>
              <div>
                {tab === "Summary" ? (
                  <div className="grid">
                    {result.withinArvEnvelope ? (
                      <Note>
                        <div style={{ minWidth: 0 }}>
                          <b>At {(result.arvUsedPct * 100).toFixed(1)}% of ARV</b> <span>(lenders cap at 75%)</span>
                          <div>{`Borrower protected — up to ${$(result.arvHeadroom)} more can still be pulled before hitting the 75% ceiling.`}</div>
                        </div>
                      </Note>
                    ) : (
                      <WarnLine>
                        <b>At {(result.arvUsedPct * 100).toFixed(1)}% of ARV</b> <span>(lenders cap at 75%)</span>
                        <div>{`Over the 75% ceiling by ${$(result.arvEnvelopeOverflow)} — that amount is the borrower's liability outside the loan.`}</div>
                      </WarnLine>
                    )}
                    <div>
                      <Lbl>Construction coverage · click to switch the whole view</Lbl>
                      <div className="cg mt">
                        {/* Wrapped so the two cards are not `.pick + .pick`
                            siblings, which would offset the second by 7px. */}
                        <div className="s6">
                          <ScenarioCard title="Construction financed (draws)" sub="Lender draws rehab (≤75% ARV)" s={result.constructionScenarios.financed} active={coverage === "financed"} onClick={() => setCoverage("financed")} />
                        </div>
                        <div className="s6">
                          <ScenarioCard title="You fund construction" sub="Construction stays outside the loan" s={result.constructionScenarios.selfFunded} active={coverage === "self"} onClick={() => setCoverage("self")} />
                        </div>
                      </div>
                    </div>
                    <div>
                      <Lbl>Where the money comes from</Lbl>
                      <CapitalStack result={result} />
                    </div>
                    <div>
                      <Lbl>From sale price to net profit</Lbl>
                      <ProfitWaterfall inputs={inputs} result={result} />
                    </div>
                    <PriceMeter grade={result.purchasePriceGrade} />
                    <div>{result.explanation}</div>
                    {result.warnings.map((w) => <WarnLine key={w}>⚠ {w}</WarnLine>)}
                  </div>
                ) : null}
                {tab === "Loan Programs" ? (
                  <div className="grid">
                    <div>
                      <Lbl>Potential fits</Lbl>
                      {result.eligiblePrograms.length === 0 ? <div className="mt"><Sub>No program is a clear fit under current rules.</Sub></div> : result.eligiblePrograms.map((f) => (
                        <div key={f.program.id} className="filerow">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>
                              {f.program.name}{result.bestProgram?.id === f.program.id ? <> <CellChip tone="ok">Best overall</CellChip></> : null}
                            </div>
                            <Sub>{(f.program.interestRate * 100).toFixed(2)}% · {f.program.points} pts · {f.program.termMonths}mo</Sub>
                          </div>
                          <div className="align-r">
                            <div style={{ fontWeight: 700 }}>Cash to close: {$(f.estimatedCashToClose)}</div>
                            <Sub>{$(f.loanAmount)} loan</Sub>
                          </div>
                        </div>
                      ))}
                    </div>
                    {result.eligiblePrograms.length > 1 ? (
                      <div>
                        <Lbl>Compare all</Lbl>
                        <CompareTable result={result} />
                      </div>
                    ) : null}
                    <div>
                      <Lbl>Not eligible based on current rules</Lbl>
                      {result.ineligiblePrograms.map((f) => (
                        <div key={f.program.id} className="filerow">
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 700 }}>{f.program.name}</div>
                            <div style={{ fontSize: 12, color: "var(--danger)" }}>{(f.reasons ?? []).join(" · ")}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {tab === "HUD Forecast" ? (
                  <HudForecast result={result} arv={inputs.arv} />
                ) : null}
                {tab === "Profit Breakdown" ? (
                  <div>
                    {([["ARV", inputs.arv], ["− Purchase price", -inputs.purchasePrice], ["− Rehab + contingency", -(inputs.rehabCost + result.rehabContingencyAmount)], ["− Financing (interest + points)", -(result.estimatedInterestPaid + result.lenderPointsCost)], ["− Holding", -result.estimatedHoldingCosts], ["− Closing", -result.estimatedClosingCosts], ["− Selling", -result.estimatedSellingCosts]] as [string, number][]).map(([k, v]) => (
                      <div key={k} className="kv">
                        <span>{k}</span>
                        <b style={v < 0 ? { color: "var(--danger)" } : undefined}>{$(v)}</b>
                      </div>
                    ))}
                    <div className="kv mt">
                      <span><b>= Net profit</b></span>
                      <b style={{ color: result.projectedNetProfit > 0 ? "var(--ok)" : "var(--danger)" }}>{$(result.projectedNetProfit)}</b>
                    </div>
                  </div>
                ) : null}
                {tab === "Sensitivity" ? (
                  <Table
                    caption="Sensitivity scenarios"
                    cols={[{ label: "Scenario" }, { label: "Net profit", align: "r" }, { label: "Margin", align: "r" }, { label: "Grade" }]}
                  >
                    {result.sensitivity.map((s) => (
                      <Tr key={s.key}>
                        <Td>{s.label}</Td>
                        <Td align="r">
                          <b style={s.netProfit > 0 ? undefined : { color: "var(--danger)" }}>{$(s.netProfit)}</b>
                        </Td>
                        <Td align="r">{pct(s.profitMargin)}</Td>
                        <Td><CellChip tone={gradeTone(s.grade)}>{s.grade}</CellChip></Td>
                      </Tr>
                    ))}
                  </Table>
                ) : null}
                {tab === "Make This Deal Work" ? (
                  <ul style={{ margin: 0, paddingLeft: 18 }}>
                    {result.recommendations.map((r) => <li key={r}>{r}</li>)}
                  </ul>
                ) : null}
              </div>
              <Sub>{DISCLAIMER}</Sub>
            </div>
          )
        ) : null}
      </Card>

      {/* Wizard nav */}
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Btn onClick={() => setStepIdx((x) => Math.max(0, x - 1))} disabled={stepIdx === 0}>Back</Btn>
        {step !== "Results" ? (
          <Btn
            variant="pri"
            onClick={() => {
              if (!stepValid(step)) return;
              if (step === "Review") autoSave();
              setStepIdx((x) => Math.min(STEPS.length - 1, x + 1));
            }}
            disabled={!stepValid(step)}
          >
            {step === "Review" ? "Analyze Deal" : "Next"}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}

type Analysis = ReturnType<typeof analyzeFixFlip>;

function ScenarioCard({
  title,
  sub,
  s,
  active,
  onClick,
  className,
}: {
  title: string;
  sub: string;
  s: {
    loanAmount: number;
    estimatedCashToClose: number;
    constructionOutsideLoan: number;
    projectedNetProfit: number;
    holdMonths: number;
  };
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const row = (k: string, v: string, color?: string) => (
    <div className="kv">
      <span>{k}</span>
      <b style={color ? { color } : undefined}>{v}</b>
    </div>
  );
  return (
    <div
      className={["pick", active ? "on" : "", className].filter(Boolean).join(" ")}
      onClick={onClick}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="row">
          <div style={{ flex: 1, minWidth: 0, fontWeight: 800 }}>{title}</div>
          {active ? <CellChip tone="acc">● selected</CellChip> : null}
        </div>
        <Sub>{sub}</Sub>
        {row("Cash to close", `$${Math.round(s.estimatedCashToClose).toLocaleString()}`)}
        {row("Construction you fund (outside loan)", `$${Math.round(s.constructionOutsideLoan).toLocaleString()}`)}
        {row("Loan amount", `$${Math.round(s.loanAmount).toLocaleString()}`)}
        {row("Net profit", `$${Math.round(s.projectedNetProfit).toLocaleString()}`, s.projectedNetProfit > 0 ? "var(--ok)" : "var(--danger)")}
      </div>
    </div>
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

function Legend({ items }: { items: { color: string; label: string; value: string }[] }) {
  return (
    <div className="mt">
      {items.map((it) => (
        <div key={it.label} className="kv">
          <span className="row">
            <i style={{ width: 10, height: 10, borderRadius: 3, background: it.color, flex: "0 0 auto" }} />
            {it.label}
          </span>
          <b>{it.value}</b>
        </div>
      ))}
    </div>
  );
}

function CapitalStack({ result }: { result: Analysis }) {
  const m = (x: number) => `$${Math.round(x).toLocaleString()}`;
  return (
    <div>
      <StackBar
        segs={[
          { w: result.loanAmount, color: "var(--ok)" },
          { w: result.estimatedCashToClose, color: "var(--ink2)" },
          { w: result.rehabContingencyAmount, color: "var(--warn)" },
        ]}
      />
      <Legend
        items={[
          { color: "var(--ok)", label: "Lender funds", value: m(result.loanAmount) },
          { color: "var(--ink2)", label: "Cash to close", value: m(result.estimatedCashToClose) },
          { color: "var(--warn)", label: "Rehab contingency reserve", value: m(result.rehabContingencyAmount) },
        ]}
      />
    </div>
  );
}

function ProfitWaterfall({ inputs, result }: { inputs: FixFlipInputs; result: Analysis }) {
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
          { w: costs, color: "var(--danger)" },
          { w: Math.max(0, result.projectedNetProfit), color: "var(--ok)" },
        ]}
      />
      <Legend
        items={[
          { color: "var(--muted)", label: "Sale price (ARV)", value: m(inputs.arv) },
          { color: "var(--danger)", label: "All-in costs", value: m(costs) },
          { color: "var(--ok)", label: "Net profit", value: m(result.projectedNetProfit) },
        ]}
      />
    </div>
  );
}

function CompareTable({ result }: { result: Analysis }) {
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
  return (
    <Table
      className="mt"
      caption="Eligible loan programs compared"
      cols={[
        { label: "" },
        ...progs.map((f) => ({
          label:
            result.bestProgram?.id === f.program.id
              ? <span style={{ color: "var(--ok)" }}>{f.program.name}</span>
              : f.program.name,
        })),
      ]}
    >
      {rows.map((r) => (
        <Tr key={r.label}>
          <Td>{r.label}</Td>
          {progs.map((f) => (
            <Td key={f.program.id}>{r.cell(f)}</Td>
          ))}
        </Tr>
      ))}
    </Table>
  );
}

function PriceMeter({ grade }: { grade: Grade }) {
  const bands: Grade[] = ["Excellent", "Good", "Fair", "Risky", "Poor"];
  return (
    <div>
      <Lbl>Purchase price quality</Lbl>
      <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
        {bands.map((b) => {
          const active = b === grade;
          const c = b === "Excellent" || b === "Good" ? "var(--ok)" : b === "Fair" ? "var(--warn)" : "var(--danger)";
          return (
            <div key={b} style={{ flex: 1, textAlign: "center" }}>
              <div style={{ height: 8, borderRadius: 4, background: active ? c : "var(--sunken)" }} />
              <div style={{ fontSize: 10.5, marginTop: 4, fontWeight: active ? 800 : 600, color: active ? c : "var(--muted)" }}>{b}</div>
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
  rows,
  loading,
  onNew,
  onOpen,
}: {
  rows: FixFlipScenarioRow[];
  loading: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid" style={{ maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader
        title="Deal Analyzer — all runs"
        lede="Every Fix & Flip analysis across all users. Click a run to inspect it read-only."
        actions={
          <Btn variant="pri" onClick={onNew}>
            <Icon name="plus" size={12} stroke={3} /> New analysis
          </Btn>
        }
      />
      <Panel noPad>
        <Table
          caption="All Fix & Flip runs"
          cols={[
            { label: "User" },
            { label: "Created" },
            { label: "Address" },
            { label: "Grade" },
            { label: "Score" },
            { label: "Cash to close" },
            { label: "Status" },
          ]}
        >
          {loading ? (
            <Tr><Td colSpan={7}><Sub>Loading…</Sub></Td></Tr>
          ) : rows.length === 0 ? (
            <Tr><Td colSpan={7}><Sub>No runs yet.</Sub></Td></Tr>
          ) : (
            rows.map((r) => {
              const ctc = runCashToClose(r);
              return (
                <Tr key={r.id} onClick={() => onOpen(r.id)}>
                  <Td>{runCreator(r)}</Td>
                  <Td><Sub>{new Date(r.created_at).toLocaleDateString()}</Sub></Td>
                  <Td>{runAddress(r)}</Td>
                  <Td>{r.deal_grade ?? "—"}</Td>
                  <Td>{r.deal_score ?? "—"}</Td>
                  <Td>{ctc != null ? $(ctc) : "—"}</Td>
                  <Td><Sub>{r.status}</Sub></Td>
                </Tr>
              );
            })
          )}
        </Table>
      </Panel>
    </div>
  );
}

function RunInspect({
  row,
  loading,
  onBack,
}: {
  row: FixFlipScenarioRow | undefined;
  loading: boolean;
  onBack: () => void;
}) {
  const close = (
    <IconBtn onClick={onBack} aria-label="Close" title="Close">
      <Icon name="x" size={15} />
    </IconBtn>
  );
  if (loading) {
    return (
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <Card><Sub>Loading…</Sub></Card>
      </div>
    );
  }
  if (!row) {
    return (
      <div className="grid" style={{ maxWidth: 860, margin: "0 auto" }}>
        <div className="row" style={{ justifyContent: "flex-end" }}>{close}</div>
        <Card>Run not found.</Card>
      </div>
    );
  }
  const p = (row.payload as RunPayload | null) ?? null;
  const result = (p?.result ?? null) as Record<string, unknown> | null;
  const inputs = (p?.inputs ?? null) as Record<string, unknown> | null;
  const num = (v: unknown): string =>
    typeof v === "number" ? $(v) : "—";
  return (
    <div className="grid" style={{ maxWidth: 860, margin: "0 auto" }}>
      <PageHeader
        title={`Viewing ${runCreator(row)}'s run`}
        lede={`${new Date(row.created_at).toLocaleString()} · ${runAddress(row)} · read-only`}
        actions={close}
      />
      {!result ? (
        <Card>This run has no saved result snapshot to display.</Card>
      ) : (
        <KpiRow>
          <Kpi label="Deal Grade" value={String(row.deal_grade ?? "—")} sub={`Score ${row.deal_score ?? "—"}/100`} />
          <Kpi label="Net Profit" value={num(result["projectedNetProfit"])} />
          <Kpi label="Cash to Close" value={num(result["estimatedCashToClose"])} />
          <Kpi label="Loan Amount" value={num(result["loanAmount"])} />
          <Kpi label="Construction outside loan" value={num(result["constructionOutsideLoan"])} />
          <Kpi label="Within 75% ARV" value={result["withinArvEnvelope"] ? "Yes" : "No"} />
        </KpiRow>
      )}
      {inputs ? (
        <Panel title="Saved inputs">
          <pre className="sub" style={{ whiteSpace: "pre-wrap", margin: 0 }}>
            {JSON.stringify(inputs, null, 2)}
          </pre>
        </Panel>
      ) : null}
    </div>
  );
}

function HudForecast({
  result,
  arv,
}: {
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
  return (
    <div>
      <Table
        caption="HUD forecast"
        cols={[{ label: "Item" }, { label: "Amount", align: "r" }, { label: "% ARV", align: "r" }]}
      >
        {lines.map((l) => {
          const isTotal = l.kind === "total" || l.kind === "final";
          const credit = l.kind === "credit";
          const share = arv > 0 ? (Math.abs(l.v) / arv) * 100 : 0;
          const amount = credit ? `(${$(Math.abs(l.v))})` : $(l.v);
          return (
            <Tr key={l.k}>
              <Td>{isTotal ? <b>{l.k}</b> : l.k}</Td>
              <Td align="r">
                <b style={credit ? { color: "var(--ok)" } : undefined}>{amount}</b>
              </Td>
              <Td align="r"><Sub>({share.toFixed(1)}%)</Sub></Td>
            </Tr>
          );
        })}
      </Table>
      <div className="mt">
        <Sub>
          Cash to close is only the money due at the table — not the total project cost.
          Forecast only; final figures depend on lender approval, title, taxes, insurance,
          draw schedule, and the final settlement statement.
        </Sub>
      </div>
    </div>
  );
}
