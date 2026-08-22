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

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Btn,
  CG,
  Card,
  CellChip,
  Field,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Linky,
  PageHeader,
  Panel,
  Seg,
  Select,
  Table,
  Td,
  Tr,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { ClientSearchBlock, type ClientPickResult } from "@/components/ClientSearchBlock";
import { AnalysisActionsMenu, AnalysisFloatingAction, AnalysisRunInspect, AnalysisRunsTable } from "@/components/analysis/AnalysisRunsWorkspace";
import { FinancialInsightPanel } from "@/components/analysis/FinancialInsightPanel";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import {
  useAdminLoanScenarios,
  useAnalysisRun,
  useAnalysisRuns,
  useConvertAnalysisRunToPrequal,
  useCreateAnalysisRun,
  useCurrentUser,
  useCurrentCredit,
  useFreeCalc,
  useFredSeries,
  useLoans,
  useMyCredit,
  useMyPrequalRequests,
  useRecalc,
  useShareAnalysisRun,
  useSettings,
  useUpdateAnalysisRun,
  type AdminLoanScenarioRow,
} from "@/hooks/useApi";
import { PreQualRequestList } from "@/components/PreQualRequestList";
import { PreQualRequestModal } from "@/components/PreQualRequestModal";
import { LoanPurpose, LoanType, PropertyType, Role } from "@/lib/enums.generated";
import { QC_FMT } from "@/lib/fmt";
import type { AddressParts, AnalysisProduct, AnalysisRun, FredSeriesSummary, RecalcResponse, SimulatorSettings } from "@/lib/types";
import { EligibilityBanner } from "@/components/EligibilityBanner";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { useCreditSummary } from "@/hooks/useApi";
import { RangeGauge } from "@/components/RangeGauge";
import {
  DSCR_MAX_LTV_CASH_OUT,
  DSCR_MAX_LTV_PURCHASE,
  FF_MAX_ARV_LTV,
  FF_MAX_LTC,
  bindingConstraintLabel,
  cappedReasonLabel,
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type BindingConstraint,
  type SimulatorInputs,
  type TransactionType,
} from "@/lib/eligibility";
import { isLoanTypeEnabled, isProductKeyEnabled } from "@/lib/products";
import { LoanSimulator } from "@/components/LoanSimulator";
import type { Loan } from "@/lib/types";
import { AmortizationTable } from "@/app/loans/[id]/components/AmortizationTable";

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
].filter((o) => isLoanTypeEnabled(o.value));

type Mode = "free" | "loan";

export default function SimulatorPage() {
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: settings } = useSettings();
  const sim: SimulatorSettings = settings?.data?.simulator ?? DEFAULT_SIM;

  const isClient = user?.role === Role.CLIENT;
  const [mode, setMode] = useState<Mode>("free");

  const router = useRouter();
  const spq = useSearchParams();
  const isOperator =
    user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  const isBroker = user?.role === Role.BROKER;
  const isListFirstRole = isBroker || isOperator;
  const wantNew = spq?.get("new") === "1";
  const showRuns = spq?.get("view") === "runs";
  const startType = spq?.get("type") ?? "";
  const runId = spq?.get("run") ?? null;
  const analysisRunId = spq?.get("analysisRun") ?? null;
  const adminRuns = useAdminLoanScenarios(!!isOperator);
  const { data: inspectedAnalysisRun, isLoading: inspectedAnalysisRunLoading } = useAnalysisRun(analysisRunId);
  const recentSince = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const { data: simulatorRuns = [], isLoading: simulatorRunsLoading } = useAnalysisRuns({
    tool_source: "simulator",
    updated_since: recentSince,
    limit: 50,
  });
  const { data: recalcRuns = [], isLoading: recalcRunsLoading } = useAnalysisRuns({
    tool_source: "loan_recalc",
    updated_since: recentSince,
    limit: 50,
  });
  const recentRuns = useMemo(
    () =>
      [...simulatorRuns, ...recalcRuns]
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .slice(0, 50),
    [recalcRuns, simulatorRuns],
  );

  useEffect(() => {
    if (!wantNew) return;
    setMode(startType === "file" ? "loan" : "free");
  }, [startType, wantNew]);

  // CLIENT view — same gated, ARV-driven simulator as mobile.
  if (isClient) {
    return <ClientSimulatorPage />;
  }

  if (isListFirstRole && analysisRunId) {
    return (
      <AnalysisRunInspect
        run={inspectedAnalysisRun}
        loading={inspectedAnalysisRunLoading}
        onBack={() => router.push("/simulator")}
      />
    );
  }

  // Preserve legacy operator scenario inspection links while the default
  // simulator landing moves to analysis_runs below.
  if (isOperator && runId) {
    return (
      <SimInspect
        row={(adminRuns.data ?? []).find((r) => r.id === runId)}
        loading={adminRuns.isLoading}
        onBack={() => router.push("/simulator")}
      />
    );
  }

  if (isListFirstRole && !wantNew && showRuns) {
    const actions = [
      {
        label: "New broker calculator",
        description: "Run pricing math from scratch.",
        icon: "calc",
        onClick: () => router.push("/simulator?new=1&type=calculator"),
      },
      {
        label: "New client estimate",
        description: "Link a client and save/share the estimate.",
        icon: "clients",
        onClick: () => router.push("/simulator?new=1&type=client"),
      },
      {
        label: "Recalculate from funding file",
        description: "Recalculate an existing file.",
        icon: "layers",
        onClick: () => router.push("/simulator?new=1&type=file"),
      },
    ];
    return (
      <>
        <AnalysisRunsTable
          title="Simulate"
          description="Saved simulator and funding-file recalculation runs from the last 30 days."
          emptyText="No saved simulations or file recalculations in the last 30 days."
          runs={recentRuns}
          loading={simulatorRunsLoading || recalcRunsLoading}
          onOpen={(id) => router.push(`/simulator?view=runs&analysisRun=${id}`)}
          actions={isBroker ? actions : undefined}
        />
        {!isBroker ? <AnalysisFloatingAction label="Start a new simulation" actions={actions} /> : null}
      </>
    );
  }

  // OPERATOR view — full advanced flow against the backend.
  return (
    <div className="grid">
      <PageHeader
        title="Simulate"
        lede="Run pricing math from scratch or against any loan in your pipeline. Operators set the allowed ranges in Settings → Simulator."
        actions={
          <>
            <Seg<Mode>
              value={mode}
              onChange={setMode}
              ariaLabel="Simulator mode"
              options={[
                { value: "free", label: <><Icon name="calc" size={12} /> Free calculation</> },
                { value: "loan", label: <><Icon name="layers" size={12} /> From a loan</> },
              ]}
            />
            {isListFirstRole ? (
              <IconBtn onClick={() => router.push("/simulator")} aria-label="Close" title="Close">
                <Icon name="x" size={15} />
              </IconBtn>
            ) : null}
          </>
        }
      />

      {mode === "free" ? <FreeCalcMode sim={sim} /> : <FromLoanMode sim={sim} loans={loans} />}
    </div>
  );
}

// ── Client simulator page wrapper ──────────────────────────────────────
// Owns the page header (Simulate + subhead) AND the Request
// Pre-Qualification CTA so the button sits on the same line as the
// header text — top-right, always accessible regardless of which
// inner tab the borrower is on. The modal state lives here too so
// the button hoist works without prop-drilling through ClientSimulator.

function ClientSimulatorPage() {
  const [prequalOpen, setPrequalOpen] = useState(false);
  return (
    <div className="grid">
      <PageHeader
        title="Simulate"
        lede="Model what a deal looks like at different points and LTV tiers. Higher LTVs unlock as you verify credit and add experience to your investor profile."
        actions={
          <Btn variant="pri" onClick={() => setPrequalOpen(true)}>
            <Icon name="plus" size={13} /> Request Pre-Qualification
          </Btn>
        }
      />
      <ClientSimulator />
      <PreQualRequestModal open={prequalOpen} onClose={() => setPrequalOpen(false)} />
    </div>
  );
}

// ── Client simulator — ARV + DP slider + LTV slider (gated) ────────────────

function ClientSimulator() {
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);
  const { data: loans = [] } = useLoans();
  const { data: fred } = useFredSeries();

  // Segmented-control state — Free Simulate | My Loans.
  const [simTab, setSimTab] = useState<"free" | "started">("free");
  const [pickedLoanId, setPickedLoanId] = useState<string | null>(null);
  const pickedLoan = pickedLoanId ? loans.find((l) => l.id === pickedLoanId) ?? null : null;

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
    creditExpired: credit?.is_expired ?? false,
    creditExpiringSoon: credit?.expiring_soon ?? false,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  const [productKey, setProductKey] = useState<SimulatorInputs["productKey"]>("dscr");
  const [transactionType, setTransactionType] = useState<TransactionType>("purchase");
  const [arvText, setArvText] = useState("500000");
  const [brvText, setBrvText] = useState("400000");
  const [rehabText, setRehabText] = useState("80000");
  const [payoffText, setPayoffText] = useState("0");
  const [points, setPoints] = useState(1);
  const initialLtvPct = Math.min(eligibility.maxLTV * 100 || 65, 65);
  const [ltvPct, setLtvPct] = useState(initialLtvPct);
  // Manual loan-amount override. null = derive from LTV slider.
  const [requestedLoanText, setRequestedLoanText] = useState<string | null>(null);
  // DSCR — borrower's actual monthly rent. Empty string falls back to the
  // 0.85% of loan-amount estimate inside computeSimulator.
  const [monthlyRentText, setMonthlyRentText] = useState("");
  // HUD detail expander — opens when the borrower clicks "Estimated cash to close".
  const [showHud, setShowHud] = useState(false);

  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  const brvNum = Number(brvText.replace(/[^0-9.]/g, "")) || 0;
  const rehabNum = Number(rehabText.replace(/[^0-9.]/g, "")) || 0;
  const payoffNum = Number(payoffText.replace(/[^0-9.]/g, "")) || 0;
  const monthlyRentNum = Number(monthlyRentText.replace(/[^0-9.]/g, "")) || 0;
  const requestedLoanNum =
    requestedLoanText != null ? Number(requestedLoanText.replace(/[^0-9.]/g, "")) || 0 : null;
  const isBlocked = eligibility.tier === "blocked";
  const maxLtvPct = eligibility.maxLTV * 100;
  const reno = productKey === "ff" || productKey === "gu";
  const isRefi = productKey === "dscr" && transactionType === "refi";
  const propertyLabel = reno
    ? "ARV (After Repair Value)"
    : isRefi
      ? "Property Value"
      : "Market Value";

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
      transactionType: productKey === "dscr" ? transactionType : undefined,
      payoff: isRefi ? payoffNum : undefined,
      brv: reno ? brvNum : undefined,
      rehabBudget: reno ? rehabNum : undefined,
      requestedLoanAmount: requestedLoanNum ?? undefined,
      ltvTierCap: eligibility.maxLTV > 0 ? eligibility.maxLTV : undefined,
      monthlyRent: productKey === "dscr" && monthlyRentNum > 0 ? monthlyRentNum : undefined,
    });
  }, [
    isBlocked,
    arvNum,
    ltvPct,
    points,
    productKey,
    baseRatePct,
    transactionType,
    isRefi,
    payoffNum,
    reno,
    brvNum,
    rehabNum,
    requestedLoanNum,
    monthlyRentNum,
    eligibility.maxLTV,
  ]);

  // When the loan amount is manually entered and clamps, snap the LTV
  // slider to match — otherwise the slider lies about what the borrower
  // is actually getting.
  useEffect(() => {
    if (!result || requestedLoanText == null || arvNum <= 0) return;
    const matchedLtv = Math.round((result.loanAmount / arvNum) * 100);
    if (Math.abs(matchedLtv - ltvPct) > 0) setLtvPct(matchedLtv);
  }, [result?.loanAmount, requestedLoanText, arvNum]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid">
      {/* Segmented control — Free Simulate | My Loans */}
      <div>
        <Seg<"free" | "started">
          value={simTab}
          ariaLabel="Simulator tab"
          onChange={(next) => {
            setSimTab(next);
            setPickedLoanId(null);
          }}
          options={[
            { value: "free", label: "Free Simulate" },
            { value: "started", label: `My Loans${loans.length ? ` (${loans.length})` : ""}` },
          ]}
        />
      </div>

      {simTab === "started" ? (
        pickedLoan ? (
          <div className="grid">
            <div>
              <Linky onClick={() => setPickedLoanId(null)}>‹ My Loans</Linky>
            </div>
            <LoanSimulator loan={pickedLoan} />
          </div>
        ) : (
          <div className="grid">
            <PrequalRequestsSection />
            <DesktopMyLoansList
              loans={loans}
              onPick={setPickedLoanId}
              onSwitchToFree={() => setSimTab("free")}
            />
          </div>
        )
      ) : (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 20 }}>
      {/* LEFT — calculator, controls, results, amortization. The focal area. */}
      <div className="grid" style={{ minWidth: 0 }}>
        {/* Slim 2-line results header with DP slider attached, cash-to-close clickable. */}
        <SlimTermsHeader
          result={result}
          isBlocked={isBlocked}
          productKey={productKey}
          points={points}
          setPoints={setPoints}
          showHud={showHud}
          setShowHud={setShowHud}
        />

        {/* Amortization at the bottom of the focal column. */}
        {result && result.loanAmount > 0 && result.rate > 0 ? (
          <AmortizationTable
            loanAmount={result.loanAmount}
            annualRate={result.rate}
            termMonths={productKey === "dscr" ? 360 : 12}
            monthlyPI={result.monthlyPI}
            style={productKey === "dscr" ? "fully_amortizing" : "interest_only"}
          />
        ) : null}

        {/* AI / projections disclaimer — Disclosure §5 + Terms §4 require
            preliminary projections to be labeled as not a rate lock or
            commitment to lend. */}
        <div className="sub">
          <em>
            Preliminary estimate. Not a rate lock or commitment to lend — final
            terms, pricing, and approval are set by the lender at underwriting.
          </em>
        </div>
      </div>

      {/* RIGHT — controls panel: credit (compact) → product → property+sizing.
          Stacked vertically so the borrower reads identity → product →
          deal inputs in one column. */}
      <div className="grid" style={{ minWidth: 0 }}>
        <CollapsibleCreditSummary
          summary={creditSummary ?? null}
          fico={credit?.fico ?? null}
          propertyCount={propertyCount}
          hasYearOfOwnership={hasYearOfOwnership}
          banner={eligibility.banner ?? null}
        />

        {/* Product selector — directly under the credit pill. */}
        <Card>
          {/* The rail is 380px; four product pills are wider than that, so the
              strip scrolls inside the card instead of widening the column. */}
          <div style={{ overflowX: "auto" }}>
          <Seg<SimulatorInputs["productKey"]>
            value={productKey}
            onChange={setProductKey}
            as="filter"
            ariaLabel="Loan product"
            options={(
              [
                { id: "dscr", label: "DSCR Rental",   sub: "30 yr" },
                { id: "ff",   label: "Fix & Flip",    sub: "12 mo" },
                { id: "gu",   label: "Ground Up",     sub: "18 mo" },
                { id: "br",   label: "Bridge",        sub: "24 mo" },
              ] as const
            )
              .filter((p) => isProductKeyEnabled(p.id))
              .map((p) => ({
                value: p.id,
                label: (
                  <>
                    {p.label} <span className="sub">{p.sub}</span>
                  </>
                ),
              }))}
          />
          </div>
        </Card>

        {/* Merged Property + Rent + Loan amount + LTV card. Loan amount
            sits directly under the property values so the borrower reads
            "property worth → loan" as one unit. */}
        <Panel title={reno ? "Property values & loan sizing" : "Property & loan sizing"}>
          {productKey === "dscr" ? (
            <div style={{ marginBottom: 12 }}>
              <Seg<TransactionType>
                value={transactionType}
                onChange={setTransactionType}
                as="filter"
                ariaLabel="Transaction type"
                options={[
                  { value: "purchase", label: "Purchase" },
                  { value: "refi", label: "Refinance" },
                ]}
              />
            </div>
          ) : null}

          {/* Property values — single column in the narrow right rail. */}
          {reno ? (
            <div className="grid">
              <ArvField label="Purchase price (BRV)" value={brvText} onChange={setBrvText} hint="As-is purchase" />
              <ArvField label="Rehab budget" value={rehabText} onChange={setRehabText} hint="Repair cost" />
              <ArvField label={propertyLabel} value={arvText} onChange={setArvText} hint="After repair value" />
            </div>
          ) : (
            <div className="grid">
              <ArvField label={propertyLabel} value={arvText} onChange={setArvText} hint={isRefi ? "Today's appraised value" : "Loan = Market Value × LTV"} />
              {/* Loan amount sits directly beneath Market Value. */}
              <ArvField
                label={`Loan amount${result ? ` · max ${QC_FMT.usd(result.maxLoan, 0)}` : ""}`}
                value={
                  requestedLoanText ??
                  (result ? Math.round(result.loanAmount).toString() : "")
                }
                onChange={(v) => setRequestedLoanText(v)}
                hint={
                  result?.clamped
                    ? cappedReasonLabel(result.bindingConstraint, result.maxLoan)
                    : "Type to override; will clamp to cap on blur"
                }
              />
              {isRefi ? (
                <ArvField label="Existing payoff" value={payoffText} onChange={setPayoffText} hint="Mortgage balance to pay off" />
              ) : null}
              {productKey === "dscr" ? (
                <ArvField
                  label="Monthly rent"
                  value={monthlyRentText}
                  onChange={setMonthlyRentText}
                  hint={
                    monthlyRentNum > 0
                      ? "Drives DSCR + cash flow"
                      : "Auto ≈ 0.85% of loan if blank"
                  }
                />
              ) : null}
            </div>
          )}

          {reno ? (
            // For reno, loan-amount lives under the renovation grid for
            // the same "property → loan" reading order.
            <div className="mt">
              <ArvField
                label={`Loan amount${result ? ` · max ${QC_FMT.usd(result.maxLoan, 0)}` : ""}`}
                value={
                  requestedLoanText ??
                  (result ? Math.round(result.loanAmount).toString() : "")
                }
                onChange={(v) => setRequestedLoanText(v)}
                hint={
                  result?.clamped
                    ? cappedReasonLabel(result.bindingConstraint, result.maxLoan)
                    : "Type to override; will clamp to cap on blur"
                }
              />
            </div>
          ) : null}

          {liveRate?.estimated_rate != null ? (
            <div className="sub mt">
              Today's base rate · {liveRate.label} +{liveRate.spread_bps} bps · <strong>{liveRate.estimated_rate.toFixed(3)}%</strong>
            </div>
          ) : null}

          {/* LTV section. */}
          <div className="mt" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div>
              <div className="lbl">{reno ? "Loan sizing" : "Loan-to-value"}</div>
              <div className="sub">
                {result ? bindingConstraintLabel(result.bindingConstraint) : ltvLabel(ltvPct / 100)}
              </div>
            </div>
            <div className="num" style={{ fontSize: 20, fontWeight: 800 }}>
              {result ? `${(result.effectiveLtv * 100).toFixed(0)}%` : `${ltvPct}%`}
            </div>
          </div>

          {result && arvNum > 0 ? (
            <div className="mt">
              <RangeGauge
                current={result.effectiveLtv}
                max={reno ? Math.max(0.001, result.maxLoan / Math.max(arvNum, 1)) : result.effectiveLtvCap ?? eligibility.maxLTV}
                tiers={[0.6, 0.65, 0.7, 0.75]}
                lockedAbove={eligibility.maxLTV}
                binding={result.clamped ? result.bindingConstraint as ("ltv" | "ltc" | "arv" | "refi-cap") : undefined}
                markers={
                  isRefi && payoffNum > 0 && arvNum > 0
                    ? [{ at: payoffNum / arvNum, label: "payoff", tone: "muted" }]
                    : undefined
                }
                secondaryCap={
                  reno && arvNum > 0
                    ? { at: 0.7, label: "ARV cap" }
                    : undefined
                }
              />
            </div>
          ) : null}

          {!reno ? (
            <div className="scen">
              <input
                type="range"
                min={60}
                max={isBlocked ? 60 : Math.min(maxLtvPct, isRefi ? 75 : 80)}
                step={1}
                value={ltvPct}
                disabled={isBlocked}
                onChange={(e) => {
                  setLtvPct(Number(e.target.value));
                  setRequestedLoanText(null);
                }}
                style={{ opacity: isBlocked ? 0.4 : 1 }}
              />
              <div className="row" style={{ justifyContent: "space-between" }}>
                {[60, 65, 70, 75].map((tick) => {
                  const locked = !isBlocked && tick > maxLtvPct;
                  return (
                    <span
                      key={tick}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        color: locked ? "var(--faint)" : ltvPct === tick ? "var(--ink)" : "var(--muted)",
                      }}
                    >
                      {tick}%{locked ? " 🔒" : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          ) : null}

          {!isBlocked && eligibility.maxLTV < 0.75 && !reno ? (
            <div className="sub mt">70% and 75% locked at this tier.</div>
          ) : null}
        </Panel>
      </div>
    </div>
      )}
    </div>
  );
}

function DesktopMyLoansList({
  loans,
  onPick,
  onSwitchToFree,
}: {
  loans: Loan[];
  onPick: (loanId: string) => void;
  onSwitchToFree: () => void;
}) {
  if (loans.length === 0) {
    return (
      <Card>
        <h3>No started loans yet</h3>
        <p className="sub mt">
          Once a loan is started, you'll see it here with a locked-terms view. Until then, use Free
          Simulate to model what a deal could look like.
        </p>
        <div className="mt">
          <Btn variant="pri" onClick={onSwitchToFree}>
            Open Free Simulate
          </Btn>
        </div>
      </Card>
    );
  }
  return (
    <div className="grid">
      {loans.map((loan) => {
        const arvNum = loan.arv != null ? Number(loan.arv) : 0;
        const ltvPct = loan.ltv != null ? Math.round(Number(loan.ltv) * 100) : null;
        return (
          <button
            key={loan.id}
            type="button"
            className="card"
            onClick={() => onPick(loan.id)}
            style={{ display: "block", width: "100%", textAlign: "left", font: "inherit", cursor: "pointer" }}
          >
            <div className="row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div><strong>{loan.address || "Unnamed loan"}</strong></div>
                <div className="sub">
                  {loan.type.replace(/_/g, " ")} · {loan.stage.replace(/_/g, " ")}
                </div>
              </div>
              <div className="align-r">
                <div className="num"><strong>{arvNum > 0 ? QC_FMT.short(arvNum) : "—"}</strong></div>
                <div className="sub num">{ltvPct != null ? `${ltvPct}% LTV` : "—"}</div>
              </div>
            </div>
          </button>
        );
      })}
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
  const num = Number(value.replace(/[^0-9.]/g, "")) || 0;
  return (
    <Field label={label} hint={hint}>
      <div className="field" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--muted)" }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="500000"
          className="num"
          style={{
            flex: 1,
            minWidth: 0,
            padding: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 18,
            fontWeight: 700,
            color: "var(--ink)",
            fontFamily: "inherit",
          }}
        />
        {num >= 1000 ? (
          <span className="sub num" style={{ whiteSpace: "nowrap" }}>
            {QC_FMT.short(num)}
          </span>
        ) : null}
      </div>
    </Field>
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

type LoanAmountCap = {
  max: number;
  binding: BindingConstraint | "configured";
  basisLabel: string;
  capLabel: string;
};

function roundDollar(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function computeLoanAmountCap({
  type,
  marketValue,
  brv,
  arv,
  configuredMax,
}: {
  type: LoanType;
  marketValue: number;
  brv: number;
  arv: number;
  configuredMax: number;
}): LoanAmountCap {
  const globalMax = Number.isFinite(configuredMax) && configuredMax > 0 ? configuredMax : Number.POSITIVE_INFINITY;

  if (isReno(type)) {
    const ltcMax = FF_MAX_LTC * Math.max(0, brv);
    const arvMax = FF_MAX_ARV_LTV * Math.max(0, arv);
    const productMax = Math.min(ltcMax, arvMax);
    const max = roundDollar(Math.min(productMax, globalMax));
    const binding: BindingConstraint =
      productMax <= 0 || Math.abs(arvMax - productMax) < 1 ? "arv" : "ltc";
    return {
      max,
      binding,
      basisLabel: binding === "arv" ? "ARV" : "BRV",
      capLabel: binding === "arv" ? "70% ARV cap" : "85% LTC cap",
    };
  }

  const value = Math.max(0, marketValue);
  const ltvCap = type === LoanType.CASH_OUT_REFI ? DSCR_MAX_LTV_CASH_OUT : DSCR_MAX_LTV_PURCHASE;
  const productMax = value * ltvCap;
  const max = roundDollar(Math.min(productMax, globalMax));
  const binding: BindingConstraint = type === LoanType.CASH_OUT_REFI ? "refi-cap" : "ltv";
  return {
    max,
    binding,
    basisLabel: "market value",
    capLabel: `${(ltvCap * 100).toFixed(0)}% LTV cap`,
  };
}

function analysisProductFor(type: LoanType): AnalysisProduct | null {
  if (type === LoanType.DSCR) return "dscr_purchase";
  if (type === LoanType.FIX_AND_FLIP) return "fix_flip";
  return null;
}

function FreeCalcMode({ sim }: { sim: SimulatorSettings }) {
  const calc = useFreeCalc();
  const { data: fred } = useFredSeries();
  const createAnalysis = useCreateAnalysisRun();
  const updateAnalysis = useUpdateAnalysisRun();
  const shareAnalysis = useShareAnalysisRun();
  const convertAnalysis = useConvertAnalysisRunToPrequal();
  const [type, setType] = useState<LoanType>(LoanType.DSCR);
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.SFR);
  const [selectedClient, setSelectedClient] = useState<ClientPickResult | null>(null);
  const [addressParts, setAddressParts] = useState<AddressParts | null>(null);
  const [address, setAddress] = useState("");
  const [savedRun, setSavedRun] = useState<AnalysisRun | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [overrideFicoText, setOverrideFicoText] = useState("");
  const lastAutosaveKey = useRef<string | null>(null);
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
  const credit = useCurrentCredit(selectedClient?.id);
  const borrowerFico = credit.data?.fico ?? null;
  const overrideFico = (() => {
    const n = Number(overrideFicoText.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n >= 300 && n <= 850 ? n : null;
  })();
  const effectiveFico = borrowerFico ?? overrideFico;

  const isDscr = type === LoanType.DSCR;
  const reno = isReno(type);
  const analysisProduct = analysisProductFor(type);

  const { rate: baseRate, source: rateSource, series: rateSeries } = pickRate(type, fred);
  const loanAmountCap = useMemo(
    () => computeLoanAmountCap({
      type,
      marketValue,
      brv,
      arv,
      configuredMax: sim.amount_max,
    }),
    [arv, brv, marketValue, sim.amount_max, type],
  );
  const cappedAmount = loanAmountCap.max > 0 ? Math.min(amount, loanAmountCap.max) : amount;
  const cappedLoanAmount = roundDollar(cappedAmount);
  const loanAmountWasCapped = amount > cappedLoanAmount;
  const loanCapHint = loanAmountCap.max > 0
    ? `Maximum ${QC_FMT.usd(loanAmountCap.max, 0)} · ${loanAmountCap.capLabel} from ${loanAmountCap.basisLabel}`
    : "Enter property value to calculate the maximum loan amount";
  useEffect(() => {
    if (loanAmountCap.max > 0 && amount > loanAmountCap.max) {
      setAmount(loanAmountCap.max);
    }
  }, [amount, loanAmountCap.max]);
  // Effective rate after points buy-down (matches backend pricing_quote): each
  // discount point trims 25 bps off the base rate, capped at the floor.
  const finalRate = Math.max(0.04, baseRate - (points * 25) / 10_000);
  // HUD impact: discount points line item = points% × loan amount.
  const pointsCost = (points / 100) * cappedLoanAmount;
  // Reno LTV reference (FF/GU typically priced off ARV).
  const arvLtv = reno && arv > 0 ? cappedLoanAmount / arv : null;
  const marketLtv = !reno && marketValue > 0 ? cappedLoanAmount / marketValue : null;
  const freeCalcPayload = useMemo(
    () => ({
      type,
      property_type: propertyType,
      loan_amount: cappedLoanAmount,
      base_rate: baseRate,
      discount_points: points,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: isDscr ? monthlyRent : null,
      purpose: type === LoanType.CASH_OUT_REFI ? LoanPurpose.CASH_OUT_REFI : LoanPurpose.PURCHASE,
      arv: reno ? arv : marketValue,
      brv: reno ? brv : null,
      rehab_budget: reno ? 0 : null,
    }),
    [annualInsurance, annualTaxes, arv, baseRate, brv, cappedLoanAmount, isDscr, marketValue, monthlyHoa, monthlyRent, points, propertyType, reno, type],
  );

  const submit = () => {
    calc.mutate(freeCalcPayload);
  };

  useEffect(() => {
    setSavedRun(null);
    setActionMessage(null);
  }, [type, selectedClient?.id, address, marketValue, brv, arv, cappedLoanAmount, points, annualTaxes, annualInsurance, monthlyHoa, monthlyRent, effectiveFico]);

  const ensureSavedRun = async (opts?: { quiet?: boolean }) => {
    if (!opts?.quiet) setActionMessage(null);
    if (!analysisProduct) {
      setActionMessage("Save/share is currently available for DSCR and Fix & Flip calculations.");
      return null;
    }
    const output = await calc.mutateAsync(freeCalcPayload);
    const targetAddress = address.trim() || "Property TBD";
    const inputs: Record<string, unknown> = {
      address: targetAddress,
      property_type: propertyType,
      requested_loan_amount: cappedLoanAmount,
      loan_amount: cappedLoanAmount,
      max_loan_amount: loanAmountCap.max,
      loan_amount_cap: loanAmountCap.capLabel,
      rate: baseRate,
      discount_points: points,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: isDscr ? monthlyRent : null,
      fico: effectiveFico,
      purchase_price: isDscr ? marketValue : brv,
      market_value: marketValue,
      brv,
      arv,
    };
    const payload = {
      product: analysisProduct,
      tool_source: "simulator" as const,
      title: `${analysisProduct === "fix_flip" ? "Fix & Flip" : "DSCR"} simulator - ${targetAddress}`,
      client_id: selectedClient?.id ?? null,
      target_property_address: targetAddress,
      inputs,
      calculator_output: output as unknown as Record<string, unknown>,
    };
    const row = savedRun
      ? await updateAnalysis.mutateAsync({ id: savedRun.id, patch: payload })
      : await createAnalysis.mutateAsync(payload);
    setSavedRun(row);
    if (!opts?.quiet) setActionMessage("Simulation saved.");
    return row;
  };

  const shareToClient = async () => {
    if (!selectedClient) {
      setActionMessage("Link a client before sharing this simulation.");
      return;
    }
    const row = await ensureSavedRun();
    if (!row) return;
    const shared = await shareAnalysis.mutateAsync(row.id);
    setSavedRun(shared.analysis_run);
    setActionMessage("Simulation shared to the client portal.");
  };

  const createPrequal = async () => {
    if (!selectedClient) {
      setActionMessage("Link a client before creating a prequalification.");
      return;
    }
    if (!effectiveFico) {
      setActionMessage("Add borrower FICO or an analyzer-only override before creating a prequalification.");
      return;
    }
    const row = await ensureSavedRun();
    if (!row) return;
    const converted = await convertAnalysis.mutateAsync({
      runId: row.id,
      payload: {
        notes: "Created from Simulator.",
        manual_credit_override: {
          fico: effectiveFico,
          property_count: 0,
          has_year_of_ownership: false,
        },
      },
    });
    setSavedRun(converted.analysis_run);
    setActionMessage("Pending prequalification created for funding review.");
  };

  const actionBusy =
    createAnalysis.isPending ||
    updateAnalysis.isPending ||
    shareAnalysis.isPending ||
    convertAnalysis.isPending;
  const analysisInputs = useMemo<Record<string, unknown>>(
    () => ({
      address: address.trim() || "Property TBD",
      property_type: propertyType,
      requested_loan_amount: cappedLoanAmount,
      loan_amount: cappedLoanAmount,
      max_loan_amount: loanAmountCap.max,
      loan_amount_cap: loanAmountCap.capLabel,
      rate: baseRate,
      discount_points: points,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: isDscr ? monthlyRent : null,
      fico: effectiveFico,
      purchase_price: isDscr ? marketValue : brv,
      market_value: marketValue,
      brv,
      arv,
    }),
    [address, annualInsurance, annualTaxes, arv, baseRate, brv, cappedLoanAmount, effectiveFico, isDscr, loanAmountCap.capLabel, loanAmountCap.max, marketValue, monthlyHoa, monthlyRent, points, propertyType],
  );
  const autosaveKey = useMemo(
    () => JSON.stringify({ type, selectedClientId: selectedClient?.id ?? null, ...analysisInputs }),
    [analysisInputs, selectedClient?.id, type],
  );

  useEffect(() => {
    if (!calc.data || !analysisProduct || actionBusy) return;
    if (lastAutosaveKey.current === autosaveKey) return;
    lastAutosaveKey.current = autosaveKey;
    void ensureSavedRun({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionBusy, analysisProduct, autosaveKey, calc.data]);

  const workflowActions = [
    {
      label: calc.data ? "Refresh and autosave" : "Calculate and autosave",
      description: "Runs simulator pricing and saves this file.",
      icon: "refresh",
      onClick: () => { void ensureSavedRun(); },
      disabled: calc.isPending || actionBusy,
    },
    {
      label: "Share to client",
      description: "Auto-saves first, then shares the client report.",
      icon: "send",
      onClick: () => { void shareToClient(); },
      disabled: calc.isPending || actionBusy,
    },
    {
      label: "Create prequalification",
      description: "Auto-saves first, then creates funding review.",
      icon: "flag",
      onClick: () => { void createPrequal(); },
      disabled: calc.isPending || actionBusy,
    },
  ];

  return (
    <>
      <div className="pagebar">
        <span className="spacer" />
        <AnalysisActionsMenu actions={workflowActions} />
      </div>

      <Panel title="Client and property">
        {selectedClient ? (
          <div className="row">
            <div>
              <div><strong>{selectedClient.name}</strong></div>
              <div className="sub">{selectedClient.email ?? selectedClient.phone ?? "Client linked"}</div>
            </div>
            <span className="sp" />
            <Btn onClick={() => setSelectedClient(null)}>
              <Icon name="x" size={13} /> Clear
            </Btn>
          </div>
        ) : (
          <ClientSearchBlock
            onPick={setSelectedClient}
            label="Search client"
            helperText="Required before sharing to client or creating a pending prequalification."
          />
        )}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 180px", gap: 12, marginTop: 12 }}>
          <GoogleAddressInput
            value={addressParts}
            onChange={(next) => {
              setAddressParts(next);
              setAddress(formatAddressParts(next));
            }}
            helperText="Select a Google suggestion to split the address automatically, or enter the address manually if it is not listed."
          />
          <Field label="Borrower FICO">
            {borrowerFico ? (
              <div><CellChip tone="pet">FICO {borrowerFico}</CellChip></div>
            ) : (
              <Input
                value={overrideFicoText}
                onChange={(e) => setOverrideFicoText(e.target.value)}
                inputMode="numeric"
                placeholder="720"
              />
            )}
          </Field>
        </div>
      </Panel>

      <Panel title="Loan parameters">
        <CG>
          <Field className="s6" label="Loan type">
            <Select value={type} onChange={(e) => setType(e.target.value as LoanType)}>
              {LOAN_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          <Field className="s6" label="Property type">
            <Select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
            >
              <option value={PropertyType.SFR}>Single family</option>
              <option value={PropertyType.UNITS_2_4}>2-4 units</option>
              <option value={PropertyType.UNITS_5_8}>5-8 units</option>
              <option value={PropertyType.MIXED_USE}>Mixed use</option>
              <option value={PropertyType.COMMERCIAL}>Commercial</option>
            </Select>
          </Field>
        </CG>

        <div className="lbl mt">{reno ? "Property values" : "Property"}</div>
        <CG className="mt">
          {reno ? (
            <>
              <CurrencyField className="s6" label="Before Repair Value (BRV)" value={brv} onChange={setBrv} />
              <CurrencyField className="s6" label="After Repair Value (ARV)" value={arv} onChange={setArv} />
            </>
          ) : (
            <CurrencyField className="s6" label="Market Value" value={marketValue} onChange={setMarketValue} />
          )}
          <CurrencyField
            className="s6"
            label="Loan amount"
            value={amount}
            onChange={(next) => setAmount(loanAmountCap.max > 0 ? Math.min(next, loanAmountCap.max) : next)}
            max={loanAmountCap.max > 0 ? loanAmountCap.max : undefined}
            hint={
              reno
                ? arvLtv != null
                  ? `${(arvLtv * 100).toFixed(1)}% loan-to-ARV · ${loanCapHint}`
                  : undefined
                : marketLtv != null
                  ? `${(marketLtv * 100).toFixed(1)}% LTV · ${loanCapHint}`
                  : loanCapHint
            }
          />
        </CG>
        <div
          className="scen mt"
          style={{
            padding: "12px 14px",
            borderRadius: 11,
            border: `1px solid ${loanAmountWasCapped ? "var(--warn)" : "var(--line)"}`,
            background: loanAmountWasCapped ? "var(--warn-tint)" : "var(--sunken2)",
          }}
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="lbl">Maximum loan available</div>
              <div className="num" style={{ fontSize: 18, fontWeight: 800 }}>
                {loanAmountCap.max > 0 ? QC_FMT.usd(loanAmountCap.max, 0) : "Enter property value"}
              </div>
              {loanAmountWasCapped ? (
                <div>
                  <CellChip tone="warn">{`Requested amount was capped to ${QC_FMT.usd(cappedLoanAmount, 0)}.`}</CellChip>
                </div>
              ) : (
                <div className="sub">{`${loanAmountCap.capLabel} based on ${loanAmountCap.basisLabel}.`}</div>
              )}
            </div>
            <Btn
              onClick={() => setAmount(loanAmountCap.max)}
              disabled={loanAmountCap.max <= 0}
            >
              Use max
            </Btn>
          </div>
          <input
            type="range"
            min={0}
            max={Math.max(loanAmountCap.max, 0)}
            step={Math.max(1000, sim.amount_step)}
            value={loanAmountCap.max > 0 ? Math.min(amount, loanAmountCap.max) : 0}
            onChange={(e) => setAmount(Number(e.target.value))}
            disabled={loanAmountCap.max <= 0}
          />
          <div className="row sub num" style={{ justifyContent: "space-between" }}>
            <span>$0</span>
            <span>{loanAmountCap.max > 0 ? QC_FMT.usd(loanAmountCap.max, 0) : "$0"}</span>
          </div>
        </div>

        <div className="lbl mt">Today's rate</div>
        <RateCard
          baseRate={baseRate}
          finalRate={finalRate}
          points={points}
          source={rateSource}
          series={rateSeries}
        />

        <div className="lbl mt">Discount points (alters HUD)</div>
        <PointsSlider
          value={points}
          onChange={setPoints}
          min={sim.points_min}
          max={sim.points_max}
          step={sim.points_step}
          loanAmount={cappedLoanAmount}
          pointsCost={pointsCost}
        />

        <div className="lbl mt">Carrying costs (monthly P&I and DSCR)</div>
        <CG className="mt">
          {sim.show_taxes && (
            <NumberField className="s3" label="Annual taxes ($)" value={annualTaxes} onChange={setAnnualTaxes} step={100} />
          )}
          {sim.show_insurance && (
            <NumberField className="s3" label="Annual insurance ($)" value={annualInsurance} onChange={setAnnualInsurance} step={100} />
          )}
          {sim.show_hoa && (
            <NumberField className="s3" label="Monthly HOA ($)" value={monthlyHoa} onChange={setMonthlyHoa} step={25} />
          )}
          {isDscr && (
            <NumberField className="s3" label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} step={50} />
          )}
        </CG>
      </Panel>

      {calc.error && (
        <div>
          <CellChip tone="bad">{calcErrorMessage(calc.error)}</CellChip>
        </div>
      )}
      {calc.data && <ResultsCard result={calc.data} />}
      {calc.data && (
        <FinancialInsightPanel
          product={analysisProduct}
          inputs={analysisInputs}
          output={calc.data as unknown as Record<string, unknown>}
        />
      )}
      {calc.data && (
        <Panel title="Status">
          <div className="sub">
            Simulations auto-save after calculation. Use the top-right Actions menu to refresh, share, or create a pending prequalification.
          </div>
          {actionMessage ? (
            <div className="mt">
              <CellChip tone={/saved|shared|created/i.test(actionMessage) ? "ok" : "warn"}>
                {actionMessage}
              </CellChip>
            </div>
          ) : null}
          {savedRun ? (
            <div className="row mt">
              <CellChip tone="mut">Status {savedRun.status.replace(/_/g, " ")}</CellChip>
              {savedRun.shared_at ? <CellChip tone="ok">Shared</CellChip> : null}
              {savedRun.prequal_request_id ? <CellChip tone="pet">Prequal queued</CellChip> : null}
            </div>
          ) : null}
        </Panel>
      )}
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
  sim,
  loans,
}: {
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
      <Panel title="Pick a loan">
        <div className="row">
          {(loans ?? []).length === 0 && (
            <div className="sub">
              No loans yet. Switch to <strong>Free calculation</strong> above, or create one from
              the <strong>Pipeline</strong> page.
            </div>
          )}
          {(loans ?? []).map((l) => {
            const active = activeLoanId === l.id;
            return (
              <Btn
                key={l.id}
                variant={active ? "pri" : "default"}
                aria-pressed={active}
                onClick={() => setActiveLoanId(l.id)}
              >
                {l.deal_id} · {l.type.replace("_", " ")}
              </Btn>
            );
          })}
        </div>
      </Panel>

      {activeLoan && (
        <Panel title="Discount points">
          <div className="row">
            {pointsOptions.map((p) => {
              const active = points === p;
              return (
                <Btn
                  key={p}
                  size="sm"
                  className="num"
                  variant={active ? "pri" : "default"}
                  aria-pressed={active}
                  onClick={() => setPoints(p)}
                >
                  {p.toFixed(2)}
                </Btn>
              );
            })}
          </div>
        </Panel>
      )}

      {activeLoan && (
        <div className="pagebar">
          <span className="spacer" />
          <Btn variant="pri" onClick={submit} disabled={recalc.isPending}>
            <Icon name="refresh" size={13} /> {recalc.isPending ? "Recalculating…" : "Recalculate"}
          </Btn>
        </div>
      )}

      {recalc.error && (
        <div>
          <CellChip tone="bad">
            {recalc.error instanceof Error ? recalc.error.message : "Recalc failed"}
          </CellChip>
        </div>
      )}
      {recalc.data && <ResultsCard result={recalc.data} />}
    </>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function ResultsCard({ result }: { result: RecalcResponse }) {
  const fullCashToClose = result.total_cash_to_close ?? result.cash_to_close_pricing;
  return (
    <Panel title="Results">
      <KpiRow>
        <Kpi label="Final rate" value={`${(result.final_rate * 100).toFixed(3)}%`} />
        <Kpi label="Monthly P&I" value={QC_FMT.usd(result.monthly_pi)} />
        {result.dscr != null ? <Kpi label="DSCR" value={result.dscr.toFixed(2)} /> : null}
        <Kpi label="Cash to close" value={QC_FMT.usd(fullCashToClose)} />
        <Kpi label="Pricing cash" value={QC_FMT.usd(result.cash_to_close_pricing)} />
        <Kpi label="HUD-1 total" value={QC_FMT.usd(result.hud_total)} />
      </KpiRow>
      {result.warnings && result.warnings.length > 0 && (
        <div className="grid mt">
          {result.warnings.map((w, i) => {
            const isBlock = w.severity === "block";
            return (
              <div key={(w.code ?? `w-${i}`) as string}>
                <CellChip tone={isBlock ? "bad" : "warn"}>{w.message}</CellChip>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

function NumberField({
  className,
  label,
  value,
  onChange,
  step,
}: {
  className?: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
}) {
  return (
    <Field className={className} label={label}>
      <Input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </Field>
  );
}

function CurrencyField({
  className,
  label,
  value,
  onChange,
  hint,
  max,
}: {
  className?: string;
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
  max?: number;
}) {
  // Render the digits formatted with thousands separators while editing —
  // operators size up loan amounts in chunks of $25k, raw "500000" is hard
  // to scan.
  const display = Number.isFinite(value) ? value.toLocaleString("en-US") : "";
  return (
    <Field className={className} label={label} hint={hint}>
      <div className="field" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: "var(--muted)" }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          className="num"
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            const next = raw === "" ? 0 : Number(raw);
            onChange(max != null ? Math.min(next, max) : next);
          }}
          style={{
            flex: 1,
            minWidth: 0,
            padding: 0,
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 16,
            fontWeight: 700,
            color: "var(--ink)",
            fontFamily: "inherit",
          }}
        />
        {value >= 1000 ? (
          <span className="sub num" style={{ whiteSpace: "nowrap" }}>
            {QC_FMT.short(value)}
          </span>
        ) : null}
      </div>
    </Field>
  );
}

function RateCard({
  baseRate,
  finalRate,
  points,
  source,
  series,
}: {
  baseRate: number;
  finalRate: number;
  points: number;
  source: "live" | "fallback";
  series?: FredSeriesSummary;
}) {
  const isLive = source === "live";
  return (
    <div className="kpi row" style={{ justifyContent: "space-between" }}>
      <div>
        <div className="lbl">
          {isLive && series ? `${series.label} + ${series.spread_bps} bps` : "Fallback (FRED unavailable)"}
        </div>
        <div className="sub">
          {isLive && series?.current_date
            ? `As of ${new Date(series.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · index ${series.current_value?.toFixed(3)}%`
            : "Backend isn't returning today's rate yet — using a sensible default."}
        </div>
      </div>
      <div className="align-r">
        <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>
          {(finalRate * 100).toFixed(3)}%
        </div>
        <div className="sub num">
          {points > 0
            ? `Base ${(baseRate * 100).toFixed(3)}% · −${Math.round(points * 25)} bps`
            : `Base rate · no buy-down`}
        </div>
      </div>
    </div>
  );
}

function PointsSlider({
  value,
  onChange,
  min,
  max,
  step,
  loanAmount,
  pointsCost,
}: {
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  loanAmount: number;
  pointsCost: number;
}) {
  return (
    <div className="scen">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="sub">
            {min}–{max} pts · step {step}
          </div>
          <div className="sub">
            {value > 0
              ? `−${Math.round(value * 25)} bps off base · adds ${QC_FMT.usd(pointsCost, 0)} to HUD line 802`
              : "No buy-down · base rate · no HUD impact"}
          </div>
        </div>
        <div className="num" style={{ fontSize: 22, fontWeight: 800 }}>
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
      />
      <div className="row num" style={{ justifyContent: "space-between" }}>
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
                color: active ? "var(--ink)" : "var(--muted)",
              }}
            >
              {tick}
            </span>
          );
        })}
      </div>
      <div className="sub mt">
        Loan amount × points% = HUD line 802. {QC_FMT.usd(loanAmount, 0)} × {value.toFixed(2)}% = {QC_FMT.usd(pointsCost, 0)}.
      </div>
    </div>
  );
}

// ── Slim 2-line terms header with attached DP slider + HUD expander ────
// Replaces the previous tall "Simulated terms" Card. Line 1: 4 headline
// metrics (loan amount / rate / monthly P&I / DSCR-or-cash-to-close).
// Line 2: discount-points slider inline. Cash-to-close is a button that
// reveals the full HUD-style breakdown beneath the card.
function SlimTermsHeader({
  result,
  isBlocked,
  productKey,
  points,
  setPoints,
  showHud,
  setShowHud,
}: {
  result: import("@/lib/eligibility").SimulatorOutputs | null;
  isBlocked: boolean;
  productKey: "dscr" | "ff" | "gu" | "br";
  points: number;
  setPoints: (n: number) => void;
  showHud: boolean;
  setShowHud: (v: boolean) => void;
}) {
  if (!result) {
    return (
      <Card>
        <div className="sub">
          {isBlocked
            ? "Resolve the eligibility issue in the right panel to run a simulation."
            : "Enter ARV to see simulated terms."}
        </div>
      </Card>
    );
  }
  const isDscr = productKey === "dscr";
  const dscrAccent =
    result.dscr == null
      ? "var(--ink2)"
      : result.dscr > 1.25
        ? "var(--ok)"
        : result.dscr > 1
          ? "var(--warn)"
          : "var(--danger)";
  return (
    <Panel noPad>
      {/* Line 1: 4 headline KPIs in a single row. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isDscr ? "1.1fr 0.9fr 0.9fr 0.9fr 0.9fr" : "1.1fr 0.9fr 0.9fr 0.9fr",
          alignItems: "stretch",
          padding: "14px 18px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <SlimStat label="Loan amount" value={QC_FMT.usd(result.loanAmount, 0)} />
        <SlimStat label="Final rate" value={`${(result.rate * 100).toFixed(3)}%`} accent="var(--accent)" />
        <SlimStat label="Monthly P&I" value={QC_FMT.usd(result.monthlyPI, 0)} />
        {isDscr && result.dscr != null ? (
          <SlimStat label="DSCR" value={result.dscr.toFixed(2)} accent={dscrAccent} />
        ) : null}
        <button
          type="button"
          onClick={() => setShowHud(!showHud)}
          aria-expanded={showHud}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "0 10px",
            borderLeft: "1px solid var(--line)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div className="lbl">
            Cash to close <Icon name={showHud ? "chevU" : "chevD"} size={10} />
          </div>
          <div className="num" style={{ fontSize: 18, fontWeight: 800 }}>
            {QC_FMT.usd(result.totalToClose, 0)}
          </div>
        </button>
      </div>

      {/* Line 2: DP slider + binding pill inline. */}
      <div className="scen row" style={{ padding: "10px 18px 12px" }}>
        <div className="row" style={{ minWidth: 140 }}>
          <span className="lbl">DP</span>
          <span className="num" style={{ fontSize: 14, fontWeight: 700 }}>
            {points.toFixed(2)}
          </span>
          <span className="sub">
            {points > 0 ? `−${Math.round(points * 25)} bps` : "no buy-down"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.25}
          value={points}
          disabled={isBlocked}
          onChange={(e) => setPoints(Number(e.target.value))}
          style={{ flex: 1, opacity: isBlocked ? 0.4 : 1 }}
        />
        <div className="row">
          <CellChip tone="mut">{bindingConstraintLabel(result.bindingConstraint)}</CellChip>
          {result.clamped ? <CellChip tone="warn">capped</CellChip> : null}
        </div>
      </div>

      {/* Inline HUD breakdown — expands below when cash-to-close is clicked. */}
      {showHud ? <HudBreakdown result={result} /> : null}
    </Panel>
  );
}

function SlimStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 14, minWidth: 0 }}>
      <div className="lbl">{label}</div>
      <div
        className="num"
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: accent ?? "var(--ink)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// HUD-1 style breakdown — the line items rolled up into Cash to Close.
// Hidden by default; revealed when the user clicks the Cash-to-close stat.
function HudBreakdown({
  result,
}: {
  result: import("@/lib/eligibility").SimulatorOutputs;
}) {
  const rows: Array<{ label: string; value: number; muted?: boolean }> = [
    { label: "Discount points", value: result.pointsCost },
    { label: "Origination (0.75%)", value: result.origination },
    { label: "Processing + underwriting", value: result.fixedFees },
    { label: "Title insurance (0.5%)", value: result.titleIns },
    { label: "Appraisal", value: result.appraisal },
    { label: "Recording + filing", value: result.recording },
  ];
  const sum = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div style={{ borderTop: "1px solid var(--line)", background: "var(--sunken2)", padding: "12px 18px" }}>
      <div className="lbl">Cash-to-close breakdown</div>
      <div className="num">
        {rows.map((r) => (
          <div key={r.label} className="kv">
            <span>{r.label}</span>
            <span>{QC_FMT.usd(r.value, 0)}</span>
          </div>
        ))}
        <div className="kv">
          <span><strong>Estimated cash to close</strong></span>
          <span><strong>{QC_FMT.usd(sum, 0)}</strong></span>
        </div>
        {result.cashToBorrower != null ? (
          <div
            className="kv"
            style={{ color: result.cashToBorrower >= 0 ? "var(--ok)" : "var(--danger)" }}
          >
            <span>{result.cashToBorrower >= 0 ? "Cash to borrower (refi)" : "Cash to close (refi gap)"}</span>
            <span>
              {result.cashToBorrower >= 0 ? "+" : ""}
              {QC_FMT.usd(result.cashToBorrower, 0)}
            </span>
          </div>
        ) : null}
        {result.cashToClose != null ? (
          <div className="kv">
            <span>Borrower equity into deal</span>
            <span>{QC_FMT.usd(result.cashToClose, 0)}</span>
          </div>
        ) : null}
        {result.totalCost != null ? (
          <div className="kv">
            <span>Total project cost</span>
            <span>{QC_FMT.usd(result.totalCost, 0)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Collapsible credit + experience header ───────────────────────────────
// One compact pill at the top of the right column showing FICO + tier +
// experience signal + (if present) the eligibility banner — all clickable
// to expand into the full summary. Replaces the previous wider banner +
// CreditSummaryCard stack so the page can focus on the calculator.
function CollapsibleCreditSummary({
  summary,
  fico,
  propertyCount,
  hasYearOfOwnership,
  banner,
}: {
  summary: import("@/lib/types").CreditSummary | null;
  fico: number | null;
  propertyCount: number;
  hasYearOfOwnership: boolean;
  banner: import("@/lib/eligibility").EligibilityBanner | null;
}) {
  const [open, setOpen] = useState(false);

  // Compact experience label: "5 properties" / "2 properties · 1+ yr held"
  // / "no experience yet". Single-line, lives next to the credit tier.
  const expLabel =
    propertyCount === 0
      ? "no experience yet"
      : `${propertyCount} ${propertyCount === 1 ? "property" : "properties"}${
          hasYearOfOwnership ? " · 1+ yr held" : ""
        }`;

  const tierLabel = summary?.tier ?? (fico == null ? "no pull" : "tier unknown");
  const hasBanner = banner != null;

  // The whole header row is the toggle target — chevron sits inside the
  // same Card so it never visually escapes the container.
  return (
    <Panel noPad>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="row"
        style={{
          border: 0,
          background: "transparent",
          font: "inherit",
          textAlign: "left",
          cursor: "pointer",
          width: "100%",
          padding: "12px 14px",
        }}
      >
        <div
          className="num"
          style={{
            fontSize: 20,
            textAlign: "center",
            fontWeight: 800,
            color: fico == null ? "var(--muted)" : "var(--ink)",
            minWidth: 36,
          }}
        >
          {fico ?? "—"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="lbl">Credit · {tierLabel}</div>
          <div
            className="sub"
            style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {expLabel}
            {hasBanner ? <strong style={{ color: "var(--warn)" }}>  ·  ⚠ action</strong> : null}
          </div>
        </div>
        <Icon name={open ? "chevU" : "chevD"} size={14} color="var(--muted)" />
      </button>
      {open ? (
        <div className="panel-b grid" style={{ borderTop: "1px solid var(--line)" }}>
          {hasBanner ? <EligibilityBanner banner={banner} /> : null}
          {summary ? <CreditSummaryCard summary={summary} /> : (
            <div className="sub">No credit summary yet. Run a soft pull to see your file.</div>
          )}
        </div>
      ) : null}
    </Panel>
  );
}

// Amortization schedule + P&I breakdown moved into a shared component
// at /loans/[id]/components/AmortizationTable.tsx so the Criteria tab
// can render the same table inline. Imported above as AmortizationTable.

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="kpi">
      <div className="lbl">{label}</div>
      <div className="knum num" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

// ── Borrower's Pre-Qualification requests block ─────────────────────────
// Lives at the top of the My Loans tab. Shows the borrower's recent
// requests with their status badges. The primary "Request
// Pre-Qualification" CTA used to live in this section header — we
// hoisted it up to the page header (top-right of the Simulate row) so
// it's always accessible regardless of which tab the borrower is on.
function PrequalRequestsSection() {
  const { data: requests = [], isLoading } = useMyPrequalRequests();
  return (
    <div className="grid">
      <div>
        <h3>Pre-qualification letters</h3>
        <div className="sub">
          Submit a target property → an underwriter reviews → letter PDF arrives here.
        </div>
      </div>
      <PreQualRequestList
        requests={requests}
        isLoading={isLoading}
        emptyState="No pre-qualification requests yet. Use 'Request Pre-Qualification' at the top to start your first one."
      />
    </div>
  );
}

// ── Operator: system-wide simulator runs ──────────────────────────────

const rate3 = (v: number | null | undefined) =>
  typeof v === "number" ? `${(v * 100).toFixed(3)}%` : "—";
const usd0 = (v: number | null | undefined) =>
  typeof v === "number" ? QC_FMT.usd(v, 0) : "—";

function SimRunsTable({
  rows,
  loading,
  onNew,
  onOpen,
}: {
  rows: AdminLoanScenarioRow[];
  loading: boolean;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="grid">
      <PageHeader
        title="Simulate — all runs"
        lede="Every saved simulator scenario across all users. Click a run to inspect it read-only."
        actions={
          <Btn variant="pri" onClick={onNew}>
            <Icon name="plus" size={12} stroke={3} /> New simulation
          </Btn>
        }
      />
      <Panel noPad>
        <Table
          cols={[
            { label: "User" },
            { label: "Created" },
            { label: "Scenario" },
            { label: "Loan" },
            { label: "Loan amount", align: "r" },
            { label: "Points", align: "r" },
            { label: "Rate", align: "r" },
            { label: "Monthly P&I", align: "r" },
          ]}
        >
          {loading ? (
            <Tr><Td colSpan={8}><span className="sub">Loading…</span></Td></Tr>
          ) : rows.length === 0 ? (
            <Tr><Td colSpan={8}><span className="sub">No runs yet.</span></Td></Tr>
          ) : (
            rows.map((r) => (
              <Tr key={r.id} onClick={() => onOpen(r.id)}>
                <Td>{r.created_by_name || r.created_by_email || "—"}</Td>
                <Td><span className="sub">{new Date(r.created_at).toLocaleDateString()}</span></Td>
                <Td>{r.name}</Td>
                <Td>{r.loan_deal_id ?? "—"}{r.loan_address ? ` · ${r.loan_address}` : ""}</Td>
                <Td align="r" className="num">{usd0(r.loan_amount)}</Td>
                <Td align="r" className="num">{r.discount_points}</Td>
                <Td align="r" className="num">{rate3(r.recalc_snapshot?.final_rate)}</Td>
                <Td align="r" className="num">{usd0(r.recalc_snapshot?.monthly_pi)}</Td>
              </Tr>
            ))
          )}
        </Table>
      </Panel>
    </div>
  );
}

function SimInspect({
  row,
  loading,
  onBack,
}: {
  row: AdminLoanScenarioRow | undefined;
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
      <Card>
        <div className="sub">Loading…</div>
      </Card>
    );
  }
  if (!row) {
    return (
      <div className="grid">
        <div className="pagebar">
          <span className="spacer" />
          {close}
        </div>
        <Card>
          <div className="sub">Run not found.</div>
        </Card>
      </div>
    );
  }
  const s = row.recalc_snapshot ?? {};
  return (
    <div className="grid">
      <PageHeader
        title={`${row.name} · ${row.created_by_name || row.created_by_email || "—"}`}
        lede={`${new Date(row.created_at).toLocaleString()} · ${row.loan_deal_id ?? "—"}${row.loan_address ? ` · ${row.loan_address}` : ""} · read-only`}
        actions={close}
      />
      <KpiRow>
        <Kpi label="Loan amount" value={usd0(row.loan_amount)} />
        <Kpi label="Discount points" value={String(row.discount_points)} />
        <Kpi label="Base rate" value={rate3(row.base_rate)} />
        <Kpi label="Final rate" value={rate3(s.final_rate)} />
        <Kpi label="Monthly P&I" value={usd0(s.monthly_pi)} />
        <Kpi label="Cash to close" value={usd0(s.total_cash_to_close ?? s.cash_to_close_pricing)} />
        <Kpi label="DSCR" value={typeof s.dscr === "number" ? s.dscr.toFixed(2) : "—"} />
        <Kpi label="LTV" value={typeof row.ltv === "number" ? `${(row.ltv * 100).toFixed(1)}%` : "—"} />
      </KpiRow>
    </div>
  );
}
