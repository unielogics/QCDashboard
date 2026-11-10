"use client";

import { AdvancedRepaymentEditor } from "@/components/application/AdvancedRepaymentEditor";
import { adoptRecordedLoan, applyWorkingLoan, mergeAcknowledgedLoan, recordedLoanCadence, recordedRetainedAnnual, releaseAutomaticRefinance, releaseRecordedLoan, workingLoanFromPlan, type LoanRefinanceContext, type LoanScenarioPreviewer, type SyncedLoan } from "@/lib/loanTermsSync";
import { applyAmortizationMonths, copyRepaymentConfig, repaymentPreview } from "@/lib/repaymentConfig";
import type { ApplicationClientTerms } from "@/lib/applicationProfile";
import type { ClientTermsView, ClientTermsWorkingDraft } from "@/components/application/ApplicationClientTermsPanel";
import loanStyles from "@/components/application/LoanScheduleReview.module.css";
import { CoverageFundingGap } from "@/components/application/CoverageFundingGap";
import { LoanPaymentPhases } from "@/components/application/LoanPaymentPhases";
import { coverageCurrencyComparable, coverageReview } from "@/lib/coverageReview";
import { loanScheduleRows } from "@/lib/loanScheduleView";
import { parseIncomeOverride } from "@/lib/incomeOverrideInput";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import { DealBudgetSection } from "@/components/file/DealBudgetSection";
import { useAutomaticFinancedPrincipal } from "@/hooks/useAutomaticFinancedPrincipal";
import { useDealBudgetPreview } from "@/hooks/useDealBudgetPreview";
import { withBudgetEvaluation } from "@/lib/budgetPlanEvaluation";
import { FileCollateralSection } from "@/components/file/FileCollateralSection";

// Coverage and the plan, one card. Today's DSCR on the left, the DSCR with
// the plan on the right, and the plan itself in between: the obligations
// the new loan pays off (their payments stop, their payoffs size the loan),
// the statement payees that are not operating spend, and the payment the
// new loan adds. Every change re-computes the figures at once; saving the
// plan makes the debt service, the offer and the advances read it too. The
// levers list says what would raise coverage, each with its resulting DSCR
// and one click to apply.

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import type { DebtScheduleEditorTarget } from "@/components/application/DebtScheduleReviewPanel";
import { Btn, CellChip, IconBtn, Input, Lbl, Select, StatusLine, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useSaveFinancialPlan } from "@/hooks/useApi";
import { evaluatePlanLocally, isExcludedDscrAddBack } from "@/lib/cockpitSimulation";
import { balanceSheetIsEmpty, profitAndLossIsEmpty } from "@/lib/financialStatementRequests";
import {
  ADD_BACK_KINDS,
  EMPTY_OVERRIDES,
  cadenceLabel,
  compactMoney,
  confidenceLabel,
  confidenceTone,
  dscrLabel,
  dscrTone,
  money,
  monthShort,
  multiple,
  payeeKindTone,
  sourceLabel,
  EMPTY_SCHEDULE,
  declaredBy,
  type CockpitBankSummary,
  type CockpitMonth,
  type FinancialCockpit as Cockpit,
  type FinancialPlanWrite,
  type FinancialPlanRead,
  type PayeeKind,
  type PlanAddBack,
  type PlanAddBackKind,
  type PlanOverrides,
} from "@/lib/financialCockpit";
import { ChartCard, ColumnChart, LineChart, Meter, SERIES, type ChartTable } from "./CockpitCharts";
import { ClientTermsDrawer, ClientTermsStrip } from "./ClientTermsStrip";
import { EbitdaRefinanceComparison } from "./EbitdaRefinanceComparison";
import { RevenueTrendPanel } from "./RevenueTrendPanel";
import { CoverageEbitdaMetric } from "./CoverageEbitdaMetric";
import { CoverageMetric } from "./CoverageMetric";
import { ebitdaIsStaffCorrected } from "@/lib/financialMetrics";
import { FinancialReviewDrawer, type FinancialReviewTab } from "./FinancialReviewDrawer";
import styles from "./FinancialReview.module.css";
import { ObligationPlanRow } from "./ObligationRowEditor";
import { BankReplayNotice } from "./BankReplayNotice";
import { RefinanceSelectionSummary } from "./RefinanceSelectionSummary";
import { refinanceSelectionTotals } from "@/lib/refinanceSelectionTotals";
import { STRUCTURE_LABELS, defaultStructure, type LoanStructure, describeSchedule, riskProfile } from "@/lib/loanSchedule";

const EXCLUDABLE: PayeeKind[] = ["transfer", "owner_draw"];
const meterTone = (status: Parameters<typeof dscrTone>[0]): "ok" | "warn" | "bad" | "mut" => {
  const tone = dscrTone(status);
  return tone === "acc" ? "mut" : tone;
};

const EMPTY_PLAN: FinancialPlanWrite = { retire: [], exclude: [], new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, new_loan_structure: null, new_loan_interest_only_months: null, new_loan_repayment_config: null, new_loan_payments_per_year: null, add_backs: [], overrides: null, terms_ref: null, note: null };

function fromRecord(cockpit: Cockpit): FinancialPlanWrite {
  const r = cockpit.plan?.record;
  if (!r) return EMPTY_PLAN;
  const overrides = r.overrides && (r.overrides.income_annual != null || r.overrides.debt_service_monthly != null || r.overrides.income_note || r.overrides.debt_service_note) ? { ...EMPTY_OVERRIDES, ...r.overrides } : null;
  return {
    expected_updated_at: r.updated_at ?? null,
    retire: [...r.retire],
    exclude: [...r.exclude],
    new_payment_monthly: r.new_payment_monthly,
    new_payment_source: (r.new_payment_source as FinancialPlanWrite["new_payment_source"]) ?? null,
    new_loan_amount: r.new_loan_amount,
    new_loan_rate_pct: r.new_loan_rate_pct,
    new_loan_term_months: r.new_loan_term_months,
    new_loan_interest_only: !!r.new_loan_interest_only,
    new_loan_structure: r.new_loan_structure ?? null,
    new_loan_interest_only_months: r.new_loan_interest_only_months ?? null,
    new_loan_repayment_config: copyRepaymentConfig(r.new_loan_repayment_config),
    new_loan_payments_per_year: recordedLoanCadence(r, cockpit.plan.terms_link?.recorded),
    add_backs: (r.add_backs ?? []).map((a) => ({ ...a })),
    overrides,
    terms_ref: r.terms_ref ?? null,
    note: r.note,
  };
}
const numberValue = (value: number | null | undefined): string => (value == null || !Number.isFinite(value) ? "" : String(value));
const describeOf = (s: { structure: string; term_months: number | null; interest_only_months: number }): string => {
  if (s.structure === "interest_only") return `interest-only${s.term_months ? ` over ${s.term_months} months` : ""}, principal due at maturity`;
  const label = (STRUCTURE_LABELS[s.structure as LoanStructure] ?? s.structure).toLowerCase();
  return s.interest_only_months ? `over ${s.term_months} months, ${s.interest_only_months} interest-only then ${label}` : `over ${s.term_months} months, ${label}`;
};
const change = (before: number | null | undefined, after: number | null | undefined): number | null => (before == null || after == null ? null : Math.round((after - before) * 100) / 100);
const signedMoney = (value: number | null): string => (value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`);
const signedMultiple = (value: number | null): string => (value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}x`);
const same = (a: FinancialPlanWrite, b: FinancialPlanWrite) => JSON.stringify({ ...a, expected_updated_at: undefined, expected_deal_budget_revision: undefined }) === JSON.stringify({ ...b, expected_updated_at: undefined, expected_deal_budget_revision: undefined });
const num = (value: string): number | null => {
  const cleaned = value.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

function Stat({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <div className="fc-stat">
      <span>{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

export function CoverageCard({ cockpit, months, summary, accountLabel, accountKey, businessName, canEdit: requestedCanEdit, canReviewDebt = requestedCanEdit, canCorrectMetrics = false, profileId, canRecordTerms, onRecordTerms, onEconomicsSaved, termsKind = "client", onOpenEvidence, onRefresh, onPreviewSource, onRequestStatement, onWorkingPlanChange, programSelection, setupBudgetSaving = false, reviewRequest = 0, termsRequest = 0, onReviewClose }: { cockpit: Cockpit; months: CockpitMonth[]; summary: CockpitBankSummary; accountLabel: string; accountKey?: string; businessName?: string; canEdit: boolean; canReviewDebt?: boolean; canCorrectMetrics?: boolean; profileId: string; canRecordTerms: boolean; onRecordTerms: () => void; onEconomicsSaved?: () => void; termsKind?: "production" | "client"; onOpenEvidence?: () => void; onRefresh?: () => Promise<unknown> | void; onPreviewSource?: (fileId: string, page?: number) => void; onRequestStatement?: (kind: "profit_and_loss" | "balance_sheet") => void; onWorkingPlanChange?: (value: WorkingFinancing) => void; programSelection?: ReactNode; setupBudgetSaving?: boolean; reviewRequest?: number; termsRequest?: number; onReviewClose?: () => void }) {
  const save = useSaveFinancialPlan(profileId);
  const [termsPending, setTermsPending] = useState(false);
  const canEdit = requestedCanEdit && !termsPending && !save.isPending && !setupBudgetSaving;
  const queryClient = useQueryClient();
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewTab, setReviewTab] = useState<FinancialReviewTab>("schedule");
  const lastReviewRequest = useRef(0);
  useEffect(() => {
    if (lastReviewRequest.current === reviewRequest) return;
    lastReviewRequest.current = reviewRequest;
    if (reviewRequest > 0) { setReviewTab("plan"); setReviewOpen(true); }
  }, [reviewRequest]);
  const [debtEditor, setDebtEditor] = useState<DebtScheduleEditorTarget | null>(null);
  const [clientTermsOpen, setClientTermsOpen] = useState(false);
  const [clientTermsView, setClientTermsView] = useState<ClientTermsView>("terms");
  const [clientTermsDraft, setClientTermsDraft] = useState<ClientTermsWorkingDraft | null>(null);
  const [loanDraftTouched, setLoanDraftTouched] = useState(false);
  const activeProfile = useRef(profileId);
  const [legacySelectionsReviewed, setLegacySelectionsReviewed] = useState(false);
  const legacySelectionKey = JSON.stringify(cockpit.plan.unresolved_previous_selections ?? []);
  useEffect(() => { setLegacySelectionsReviewed(false); }, [legacySelectionKey]);
  const returnToReview = useRef(false);
  const openClientTerms = (view: ClientTermsView) => { if (setupBudgetSaving) return; returnToReview.current = reviewOpen; setClientTermsView(view); setReviewOpen(false); setClientTermsOpen(true); };
  const lastTermsRequest = useRef(0);
  useEffect(() => {
    if (setupBudgetSaving || lastTermsRequest.current === termsRequest) return;
    lastTermsRequest.current = termsRequest;
    if (termsRequest > 0) { returnToReview.current = false; setClientTermsView("terms"); setReviewOpen(false); setClientTermsOpen(true); }
  }, [setupBudgetSaving, termsRequest]);
  const openDebt = (target: DebtScheduleEditorTarget) => { if (setupBudgetSaving) return; returnToReview.current = reviewOpen; setReviewOpen(false); setDebtEditor(target); };
  const refresh = () => onRefresh?.();
  const closeDebt = () => {
    setDebtEditor(null);
    void queryClient.invalidateQueries({ queryKey: ["financial-workspace-summary", profileId] });
    void queryClient.invalidateQueries({ queryKey: ["financial-debt-review", profileId] });
    void refresh();
    if (returnToReview.current) setReviewOpen(true);
    returnToReview.current = false;
  };
  const previewSource = (fileId: string, page?: number) => { if (setupBudgetSaving) return; setReviewOpen(false); onPreviewSource?.(fileId, page); };
  const [plan, setPlan] = useState<FinancialPlanWrite>(() => fromRecord(cockpit));
  const [paymentText, setPaymentText] = useState<string>(() => (cockpit.plan.record.new_payment_monthly == null ? "" : String(cockpit.plan.record.new_payment_monthly)));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (activeProfile.current === profileId) return;
    activeProfile.current = profileId;
    const next = fromRecord(cockpit);
    setPlan(next); setPaymentText(numberValue(next.new_payment_monthly));
    setClientTermsDraft(null); setLoanDraftTouched(false); setClientTermsOpen(false); setReviewOpen(false); setTermsPending(false);
    setError(null); setSaved(null); returnToReview.current = false;
  }, [profileId, cockpit]);
  const savedRecord = useMemo(() => fromRecord(cockpit), [cockpit]);
  const previousSavedRecord = useRef(savedRecord);
  const appliedBudgetPlan = useQuery<FinancialPlanRead | null>({ queryKey: ["financial-plan-applied", profileId], queryFn: async () => null, enabled: false });
  const acknowledgedBudgetPlan = useRef<string | null>(null);
  useEffect(() => {
    const result = appliedBudgetPlan.data, stamp = result?.record.updated_at;
    if (!result || result.profile_id !== profileId || !stamp || acknowledgedBudgetPlan.current === stamp || (savedRecord.expected_updated_at && Date.parse(stamp) < Date.parse(savedRecord.expected_updated_at))) return;
    acknowledgedBudgetPlan.current = stamp;
    const next = fromRecord({ ...cockpit, plan: { ...cockpit.plan, record: result.record } });
    previousSavedRecord.current = next; setPlan(next); setPaymentText(numberValue(next.new_payment_monthly)); setLoanDraftTouched(true);
  }, [appliedBudgetPlan.data, profileId, savedRecord.expected_updated_at, cockpit]);

  const dirty = !same(plan, savedRecord);
  const workingPlanListener = useRef(onWorkingPlanChange);
  workingPlanListener.current = onWorkingPlanChange;
  useEffect(() => {
    // A fresh read of the file (another tab saved, a re-read landed) replaces an untouched draft.
    if (same(plan, previousSavedRecord.current)) {
      setPlan(savedRecord);
      setPaymentText(savedRecord.new_payment_monthly == null ? "" : String(savedRecord.new_payment_monthly));
    }
    previousSavedRecord.current = savedRecord;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRecord]);

  const workingLoan = workingLoanFromPlan(plan, loanDraftTouched || plan.new_payment_source === "manual");
  const budgetLoan = workingLoan ? { amount: workingLoan.amount, rate_pct: workingLoan.ratePct, term_months: workingLoan.termMonths, structure: workingLoan.structure, interest_only_months: workingLoan.interestOnlyMonths, repayment_config: workingLoan.repaymentConfig, payments_per_year: workingLoan.paymentsPerYear } : null;
  const budgetPreview = useDealBudgetPreview(profileId, { enabled: requestedCanEdit || canRecordTerms, loan: budgetLoan, financialPlan: plan });
  const budgetPending = (requestedCanEdit || canRecordTerms) && (budgetPreview.pending || budgetPreview.budget.isPending || budgetPreview.isError || budgetPreview.budget.isError);
  const local = useMemo(() => withBudgetEvaluation(evaluatePlanLocally(cockpit, plan, months), budgetPreview.data?.financial_plan_evaluation, budgetPending), [cockpit, plan, months, budgetPreview.data, budgetPending]);
  const { headline, thresholds, candidates, reason, debt_service_source } = cockpit.dscr;
  const incomeCurrencyComparable = coverageCurrencyComparable(cockpit, plan.overrides?.income_annual != null);
  const currentAnnualService = headline?.annual_debt_service ?? cockpit.dscr.annual_debt_service ?? (cockpit.debt.service.monthly == null ? null : cockpit.debt.service.monthly * 12);
  const coverageBasis = headline ?? candidates.find((candidate) => candidate.numerator != null);
  const noDebt = Boolean(cockpit.dscr.no_debt);
  const schedule = cockpit.debt.schedule ?? EMPTY_SCHEDULE;
  const obligations = cockpit.debt.obligations.filter((obligation) => obligation.kind !== "payee");
  const pendingRetires = plan.retire.filter((id) => !obligations.some((obligation) => obligation.id === id));
  const unresolvedPayoffs = pendingRetires.length > 0 || !legacySelectionsReviewed && Boolean(cockpit.plan.unresolved_previous_selections?.length);
  const fundingReview = coverageReview({ incomeAnnual: local.incomeBefore, debtServiceAnnual: currentAnnualService }, { incomeAnnual: local.incomeAfter, debtServiceAnnual: unresolvedPayoffs ? null : local.serviceAfterAnnual }, { before: coverageCurrencyComparable(cockpit), after: incomeCurrencyComparable });
  const sourceDescription = coverageBasis ? `${coverageBasis.label}${coverageBasis.period ? ` · ${coverageBasis.period}` : ""}` : "Financial evidence needs review";
  useEffect(() => {
    workingPlanListener.current?.({ profileId, plan, dirty, currentDscr: fundingReview.before.dscr, projectedDscr: fundingReview.after.dscr, projectedDebtServiceAnnual: fundingReview.after.debtServiceAnnual, source: sourceDescription, budgetPending, budgetEvaluation: budgetPreview.data?.financial_plan_evaluation });
  }, [profileId, plan, dirty, fundingReview.before.dscr, fundingReview.after.dscr, fundingReview.after.debtServiceAnnual, sourceDescription, budgetPending, budgetPreview.data]);
  const noDebtServiceAfter = !unresolvedPayoffs && local.serviceAfterAnnual === 0;
  const selectionTotals = refinanceSelectionTotals(obligations, plan.retire, local, {
    unresolvedSelections: unresolvedPayoffs,
    debtServiceKnown: plan.overrides?.debt_service_monthly != null || cockpit.debt.service.monthly != null,
  });
  const serviceKnown = plan.overrides?.debt_service_monthly != null || cockpit.debt.service.monthly != null;
  const refinanceContext: LoanRefinanceContext | null = plan.retire.length || plan.terms_ref?.treatment === "refinance"
    ? { treatment: "refinance", retainedAnnualService: serviceKnown && local.serviceBeforeNewPayment != null && !unresolvedPayoffs ? recordedRetainedAnnual(plan) ?? Math.round(local.serviceBeforeNewPayment * 1200) / 100 : null } : null;
  const scenarioPaymentOnly = plan.new_payment_source === "manual" && plan.new_loan_amount == null;
  const previewScenario: LoanScenarioPreviewer = (loan, context) => {
    const before = cockpit.dscr.headline?.value ?? null;
    const basis = coverageBasis ? `${coverageBasis.label}${coverageBasis.period ? ` · ${coverageBasis.period}` : ""}` : "Working scenario inputs";
    const schedule = repaymentPreview(loan.amount, loan.ratePct, loan.termMonths, { structure: loan.structure, interestOnlyMonths: loan.interestOnlyMonths, periodsPerYear: loan.paymentsPerYear ?? 12, repaymentConfig: loan.repaymentConfig }).schedule;
    if (!schedule) return { before, after: null, basis, unavailableReason: "Complete the loan details to calculate scenario coverage." };
    if (context.treatment === "refinance" && context.retainedAnnualService == null) return { before, after: null, basis, unavailableReason: "The annual debt service remaining after payoff is not provided." };
    let previewPlan = applyWorkingLoan(plan, loan);
    if (context.treatment === "refinance") previewPlan = adoptRecordedLoan(previewPlan, {
      kind: "working_preview", id: "local-only", version: 0, label: "working terms preview", amount: loan.amount, rate_pct: loan.ratePct,
      term_months: loan.termMonths, interest_only: loan.structure === "interest_only", structure: loan.structure,
      interest_only_months: loan.interestOnlyMonths ?? 0, repayment_config: copyRepaymentConfig(loan.repaymentConfig), payments_per_year: loan.paymentsPerYear,
      payment_monthly: schedule.coverage_payment_monthly, treatment: "refinance", retained_annual_debt_service: context.retainedAnnualService,
    });
    const evaluation = evaluatePlanLocally(cockpit, previewPlan, months);
    return { before, after: evaluation.headlineAfter, basis, noDebtLeft: evaluation.noDebtLeft,
      incomeAnnual: evaluation.incomeAfter, existingAnnual: context.treatment === "refinance" ? context.retainedAnnualService : evaluation.serviceBeforeNewPayment == null ? null : evaluation.serviceBeforeNewPayment * 12,
      incomeCurrencyComparable,
      coverageReview: coverageReview({ incomeAnnual: local.incomeBefore, debtServiceAnnual: currentAnnualService }, { incomeAnnual: evaluation.incomeAfter, debtServiceAnnual: evaluation.serviceAfterAnnual }, { before: coverageCurrencyComparable(cockpit), after: incomeCurrencyComparable }),
      unavailableReason: evaluation.coverageUnavailableReason };
  };
  function termsSaved(terms: ApplicationClientTerms, savedPlan?: FinancialPlanRead) {
    if (activeProfile.current !== profileId) return;
    if (savedPlan) {
      setPlan((current) => mergeAcknowledgedLoan(current, savedPlan.record));
      setPaymentText(numberValue(savedPlan.record.new_payment_monthly));
      setClientTermsDraft(null); setLoanDraftTouched(false); setSaved(`Client terms v${terms.version} and the scenario loan were saved together.`);
    }
    void refresh();
  }
  function applyTermsLoan(loan: SyncedLoan) {
    setPlan((current) => applyWorkingLoan(current, loan)); setPaymentText(""); setSaved(null); setLoanDraftTouched(true);
    setClientTermsDraft((current) => current ? { ...current, editedInEditor: false } : null);
    setClientTermsOpen(false); if (returnToReview.current) setReviewOpen(true); returnToReview.current = false;
  }
  function updateTermsLoan(loan: SyncedLoan) {
    setPlan(current => applyWorkingLoan(current, loan)); setPaymentText(""); setSaved(null); setLoanDraftTouched(true);
  }
  function financingSaved(result: FinancialPlanRead) {
    const acknowledged = fromRecord({ ...cockpit, plan: { ...cockpit.plan, record: result.record } });
    previousSavedRecord.current = acknowledged;
    setPlan(acknowledged); setPaymentText(numberValue(acknowledged.new_payment_monthly)); setLoanDraftTouched(true);
    setSaved("Budget and shared loan saved. Existing issued terms remain versioned separately.");
  }
  const excludable = cockpit.bank.recurring.payees.filter((p) => EXCLUDABLE.includes(p.kind) && (p.monthly_average ?? 0) >= 500);
  const levers = cockpit.plan?.levers ?? [];
  const risk = useMemo(() => riskProfile(local.schedule, local.incomeAfter == null ? null : local.incomeAfter / 12, local.serviceBeforeNewPayment, incomeCurrencyComparable), [local.schedule, local.incomeAfter, local.serviceBeforeNewPayment, incomeCurrencyComparable]);
  const headlineKey = headline?.key ?? candidates[0]?.key ?? null;
  const headlineConfidence = headline?.confidence ?? candidates[0]?.confidence ?? null;
  const afterStatus = local.noDebtLeft ? "very_strong" : local.headlineAfter == null ? "unavailable" : local.headlineAfter < 1 ? "concerning" : local.headlineAfter < 1.25 ? "acceptable" : local.headlineAfter < 1.5 ? "healthy" : "very_strong";
  const toggleRetire = (id: string) => {
    setSaved(null);
    setPlan((p) => ({ ...p, retire: p.retire.includes(id) ? p.retire.filter((x) => x !== id) : [...p.retire, id] }));
  };
  const toggleExclude = (id: string) => {
    setSaved(null);
    setPlan((p) => ({ ...p, exclude: p.exclude.includes(id) ? p.exclude.filter((x) => x !== id) : [...p.exclude, id] }));
  };
  const setPayment = (text: string) => {
    setSaved(null);
    setLoanDraftTouched(true);
    setPaymentText(text);
    const value = num(text);
    setPlan((p) => ({ ...p, terms_ref: null, overrides: releaseAutomaticRefinance(p), new_payment_monthly: value, new_payment_source: value == null ? null : "manual", ...(value == null ? {} : { new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_structure: null, new_loan_interest_only: false, new_loan_interest_only_months: null, new_loan_repayment_config: null, new_loan_payments_per_year: null }) }));
  };
  const applyLever = (apply: Partial<FinancialPlanWrite>) => {
    setSaved(null);
    const changesLoan = Object.keys(apply).some((key) => key.startsWith("new_loan_"));
    if (changesLoan) setLoanDraftTouched(true);
    setPlan((p) => {
      const next = { ...p, ...apply } as FinancialPlanWrite;
      if (changesLoan) {
        next.terms_ref = null; next.overrides = releaseAutomaticRefinance(p);
        next.new_payment_monthly = null;
        next.new_payment_source = "manual_terms";
      }
      return next;
    });
    if (changesLoan || apply.new_payment_monthly === null) setPaymentText("");
  };
  // The new loan's terms: amount, rate, term and whether it is interest-only. Typing a term wipes a typed payment.
  const setLoan = (field: "amount" | "rate" | "term" | "interest_only" | "structure" | "io_months", raw: string | boolean) => {
    setSaved(null);
    setLoanDraftTouched(true);
    setPaymentText("");
    setPlan((p) => {
      const value = typeof raw === "boolean" ? null : num(raw);
      const next: FinancialPlanWrite = { ...p, new_payment_monthly: null, terms_ref: null, overrides: releaseAutomaticRefinance(p) };
      if (field === "amount") next.new_loan_amount = value;
      else if (field === "rate") next.new_loan_rate_pct = value;
      else if (field === "term") {
        const term = value;
        next.new_loan_term_months = term;
        if (p.new_loan_structure == null && term != null && (p.new_loan_repayment_config?.amortization_months ?? 0) > term - (p.new_loan_interest_only_months ?? 0)) next.new_loan_structure = "amortizing";
      } else if (field === "structure") {
        const structure = raw === "" ? null : String(raw) as LoanStructure;
        next.new_loan_structure = structure;
        next.new_loan_interest_only = structure === "interest_only";
        if (structure === "interest_only") next.new_loan_interest_only_months = null;
      } else if (field === "io_months") {
        next.new_loan_interest_only_months = value;
      } else {
        next.new_loan_interest_only = raw === true;
        next.new_loan_structure = raw === true ? "interest_only" : defaultStructure(p.new_loan_term_months);
      }
      next.new_payment_source = next.new_loan_amount != null ? "manual_terms" : null;
      return next;
    });
  };
  useAutomaticFinancedPrincipal(budgetPreview, plan.new_loan_amount, amount => setLoan("amount", String(amount)), canEdit);
  const targetNetMode = budgetPreview.value?.loan_amount_mode === "target_net";
  const repaymentIssue = plan.new_loan_term_months != null && plan.new_loan_term_months < 1 ? "Loan maturity must be at least one month." : repaymentPreview(plan.new_loan_amount, plan.new_loan_rate_pct, plan.new_loan_term_months, { structure: plan.new_loan_interest_only ? "interest_only" : plan.new_loan_structure, interestOnlyMonths: plan.new_loan_interest_only_months, periodsPerYear: plan.new_loan_payments_per_year ?? 12, repaymentConfig: plan.new_loan_repayment_config }).error;
  const structureNow: LoanStructure = plan.new_loan_interest_only ? "interest_only" : (plan.new_loan_structure ?? defaultStructure(plan.new_loan_term_months));
  const setAmortization = (raw: string) => {
    const months = raw.trim() === "" ? null : Number(raw);
    setSaved(null); setPaymentText(""); setLoanDraftTouched(true);
    setPlan((current) => ({ ...current, terms_ref: null, overrides: releaseAutomaticRefinance(current),
      new_loan_repayment_config: applyAmortizationMonths(current.new_loan_repayment_config, months),
      new_loan_structure: current.new_loan_structure == null && !current.new_loan_interest_only && months != null && Number.isFinite(months)
        && current.new_loan_term_months != null && months > current.new_loan_term_months - (current.new_loan_interest_only_months ?? 0) ? "amortizing" : current.new_loan_structure,
      new_payment_monthly: null, new_payment_source: current.new_loan_amount != null ? "manual_terms" : null }));
  };
  const updateAddBack = (index: number, patch: Partial<PlanAddBack>) => {
    setSaved(null);
    setPlan((p) => ({ ...p, add_backs: p.add_backs.map((a, i) => (i === index ? { ...a, ...patch } : a)) }));
  };
  const addAddBack = (seed: Partial<PlanAddBack> = {}) => {
    setSaved(null);
    setPlan((p) => ({ ...p, add_backs: [...p.add_backs, { kind: "other", label: null, amount_monthly: 0, note: null, source: "desk", ...seed }] }));
  };
  const removeAddBack = (index: number) => {
    setSaved(null);
    setPlan((p) => ({ ...p, add_backs: p.add_backs.filter((_a, i) => i !== index) }));
  };
  const setOverride = (patch: Partial<PlanOverrides>) => {
    setSaved(null);
    setPlan((p) => {
      const next = { ...(p.overrides ?? EMPTY_OVERRIDES), ...patch };
      const empty = next.income_annual == null && next.debt_service_monthly == null && !next.income_note && !next.debt_service_note;
      return { ...p, overrides: empty ? null : next };
    });
  };
  // The plan in words, as it stands on screen (saved or not).
  const planLines: string[] = [
    ...plan.retire.map((id) => { const o = cockpit.debt.obligations.find((x) => x.id === id); return o ? `Pay off ${o.lender} with the new loan (${money(o.monthly)} / mo stops)` : null; }).filter((x): x is string => !!x),
    ...plan.exclude.map((id) => { const p = cockpit.bank.recurring.payees.find((x) => `payee:${x.key}` === id); return p ? `${p.payee} is not operating spend (+${money(p.monthly_average)} / mo income on the bank basis)` : null; }).filter((x): x is string => !!x),
    ...plan.add_backs.filter((a) => a.amount_monthly > 0 && !isExcludedDscrAddBack(a.kind)).map((a) => `Add back ${a.label || ADD_BACK_KINDS[a.kind]} (+${money(a.amount_monthly)} / mo)`),
    ...(plan.overrides?.income_annual != null ? [`Income available for debt service set to ${money(plan.overrides.income_annual)} a year`] : []),
    ...(plan.overrides?.debt_service_monthly != null ? [`Existing debt service set to ${money(plan.overrides.debt_service_monthly)} a month`] : []),
    ...(local.newPayment ? [local.newPaymentSource === "term_sheet" ? `New debt service ${money(local.newPayment)} / mo equivalent from the recorded loan terms${cockpit.dscr.proposed?.label ? ` (${cockpit.dscr.proposed.label})` : ""}` : plan.new_loan_amount ? `New loan ${money(plan.new_loan_amount)} at ${plan.new_loan_rate_pct ?? 0}% ${local.schedule ? describeSchedule(local.schedule) : plan.new_loan_interest_only ? "interest-only" : `over ${plan.new_loan_term_months ?? "—"} months`}: ${local.schedule?.payment_io_monthly != null && local.schedule.payment_after_monthly != null ? `${money(local.schedule.payment_io_monthly)} / mo for ${local.schedule.interest_only_months} months, then ${money(local.schedule.payment_after_monthly)} / mo` : `${money(local.newPayment)} / mo${local.schedule?.repayment_config ? " coverage equivalent (peak actual cash due)" : ""}`}` : `New payment ${money(local.newPayment)} / mo, typed by the desk`] : []),
  ];
  const termsAdopted = (plan.new_payment_source === "term_sheet" && plan.new_payment_monthly == null && !plan.new_loan_amount) || (plan.new_payment_source === "recorded_terms" && !!plan.terms_ref);
  const link = cockpit.plan?.terms_link ?? null;
  const recorded = link?.recorded ?? null;
  const adoptTerms = (on: boolean) => {
    setSaved(null);
    setPaymentText("");
    if (on && recorded) {
      // The recorded terms as the plan's loan, field for field, with where they came from.
      setPlan((p) => adoptRecordedLoan(p, recorded));
      return;
    }
    setPlan((p) => ({ ...releaseRecordedLoan(p), new_payment_source: on ? "term_sheet" : null }));
  };
  // Does the loan on screen still mirror the recorded terms? Checked live, field for field.
  const mirrorNow = (() => {
    if (!recorded) return null;
    const loanAmount = plan.new_loan_amount ?? (termsAdopted ? recorded.amount : null);
    if (!local.newPayment) return "recorded_not_in_plan";
    const diffs: string[] = [];
    const near = (a: number | null | undefined, b: number | null | undefined, tol: number) => (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= tol);
    if (!near(loanAmount, recorded.amount, 0.5)) diffs.push("amount");
    if (!near(plan.new_loan_rate_pct ?? (termsAdopted ? recorded.rate_pct : null), recorded.rate_pct, 0.005)) diffs.push("rate");
    if (!near(plan.new_loan_term_months ?? (termsAdopted ? recorded.term_months : null), recorded.term_months, 0)) diffs.push("term");
    if (!termsAdopted && !near(plan.new_loan_payments_per_year ?? 12, recorded.payments_per_year ?? 12, 0.000001)) diffs.push("payment cadence");
    if (!termsAdopted && recorded.structure && structureNow !== recorded.structure) diffs.push("interest structure");
    if (!termsAdopted && !near(plan.new_loan_interest_only_months ?? 0, recorded.interest_only_months ?? 0, 0)) diffs.push("interest-only period");
    if (!termsAdopted && JSON.stringify(plan.new_loan_repayment_config ?? null) !== JSON.stringify(recorded.repayment_config ?? null)) diffs.push("repayment schedule");
    if (!!plan.new_loan_interest_only !== !!recorded.interest_only && !termsAdopted) diffs.push("structure");
    if (!near(local.newPayment, recorded.payment_monthly, 0.5)) diffs.push("payment");
    return diffs.length ? `differs:${diffs.join(", ")}` : "mirrored";
  })();
  const latestTax = [...(cockpit.tax?.years ?? [])].reverse();
  const officerYear = latestTax.find((y) => (y.officer_compensation ?? 0) > 0) ?? null;
  const hasKind = (kind: PlanAddBackKind) => plan.add_backs.some((a) => a.kind === kind);
  const overrides = plan.overrides ?? EMPTY_OVERRIDES;
  const serviceOriginal = cockpit.debt.service.monthly;
  const clearPlan = () => {
    setSaved(null);
    setLoanDraftTouched(true);
    setPlan({ ...EMPTY_PLAN, expected_updated_at: plan.expected_updated_at ?? null });
    setPaymentText("");
  };
  const submit = async () => {
    setError(null);
    try {
      if (repaymentIssue) throw new Error(repaymentIssue);
      const submitted = { ...plan, expected_deal_budget_revision: await budgetPreview.budget.verifyRevision() };
      const result = await save.mutateAsync(submitted);
      if (activeProfile.current !== profileId) return;
      const acknowledged = fromRecord({ ...cockpit, plan: { ...cockpit.plan, record: result.record } });
      previousSavedRecord.current = acknowledged;
      setPlan((current) => same(current, submitted) ? acknowledged : { ...current, expected_updated_at: result.record.updated_at ?? null });
      setSaved("Plan saved. The debt service, the offer and the advances read it now.");
    } catch (e) {
      setError(errorMessage(e, "The plan could not be saved."));
    }
  };

  const marks = [
    { at: thresholds.acceptable, label: `${thresholds.acceptable.toFixed(2)}x` },
    { at: thresholds.healthy, label: `${thresholds.healthy.toFixed(2)}x` },
    { at: thresholds.very_strong, label: `${thresholds.very_strong.toFixed(2)}x` },
  ];
  const bands = local.rows.map((r) => ({ key: r.month, label: r.label, short: monthShort(r.month) }));
  const replayTable: ChartTable = {
    caption: "Months replayed with the plan",
    cols: ["Month", "Deposits", "Withdrawals", "With the plan", "Net", "Net with the plan", "Ending", "Ending with the plan", "Lowest", "Lowest with the plan (est.)"],
    rows: local.rows.map((r) => ({ key: r.month, cells: [r.label, money(r.deposits), money(r.withdrawals), money(r.withdrawalsAfter), money(r.net), money(r.netAfter), money(r.ending), money(r.endingAfter), money(r.lowest), money(r.lowestAfter)] })),
  };
  const loanTerms = plan.new_loan_amount ? `${money(plan.new_loan_amount)} at ${plan.new_loan_rate_pct ?? 0}%${plan.new_loan_interest_only ? " interest-only" : ` over ${plan.new_loan_term_months ?? "—"} mo`}` : null;
  const savedModifications = cockpit.plan?.modifications ?? [];

  const planContent = (
    <section className="fc-card fc-wide fc-coverage">
      <div className="fc-card-h">
        <div>
          <h4>Debt service coverage and the plan</h4>
          <div className="sub">
            Income available for debt payments against the payments due; lenders usually look for 1.25x. Tick what the new loan pays off, mark transfers that are not spend, set the new payment, and every figure updates. Save the plan and the debt service, the offer and the advances read it too.
          </div>
        </div>
        <span className="sub">Scenario changes are saved from the review header.</span>
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {saved && !dirty ? <StatusLine tone="ok">{saved}</StatusLine> : null}
      {dirty ? <StatusLine tone="acc">Unsaved plan: the figures below already reflect it; save to make the debt service, the offer and the advances follow.</StatusLine> : null}
      {onRequestStatement ? <div className={styles.summaryActions}>{profitAndLossIsEmpty(cockpit.profit_and_loss) ? <Btn size="sm" onClick={() => { if (setupBudgetSaving) return; setReviewOpen(false); onRequestStatement("profit_and_loss"); }}>Request P&amp;L</Btn> : null}{balanceSheetIsEmpty(cockpit.balance_sheet) ? <Btn size="sm" onClick={() => { if (setupBudgetSaving) return; setReviewOpen(false); onRequestStatement("balance_sheet"); }}>Request balance sheet</Btn> : null}</div> : null}

      <CoverageFundingGap value={fundingReview} basis={`${coverageBasis?.label ?? "Selected earnings"}${coverageBasis?.period ? ` · ${coverageBasis.period}` : ""}`} />
      <div className="fc-grid">
        <div className="grid g8">
          <Lbl>Today</Lbl>
          <CoverageMetric incomeAnnual={local.incomeBefore} value={headline?.value ?? null} noDebt={noDebt || currentAnnualService === 0} basis={noDebt ? `declared ${declaredBy(schedule.voided)}` : headline?.label} />
          <div className="fc-chips">
            {noDebt ? <CellChip tone="ok">No debt to cover</CellChip> : <CellChip tone={dscrTone(headline?.status)}>{dscrLabel(headline?.status)}</CellChip>}
            {headlineConfidence ? <CellChip tone={confidenceTone(headlineConfidence)}>{confidenceLabel(headlineConfidence)}</CellChip> : null}
            <CellChip tone={debt_service_source === "none" ? "warn" : "mut"}>Debt service {money(local.serviceBefore)} / mo · {sourceLabel(debt_service_source)}</CellChip>
          </div>
          <CoverageEbitdaMetric value={local.ebitda} side="today" corrected={ebitdaIsStaffCorrected(cockpit.ebitda?.headline, cockpit.metric_review)} />
          {local.incomeBefore == null || local.incomeBefore > 0 ? <Meter value={headline?.value ?? null} tone={meterTone(headline?.status)} marks={marks} label="Debt service coverage today" /> : null}
          {reason ? <StatusLine tone="warn">{reason}</StatusLine> : null}
          {headline?.note ? <div className="sub">{headline.note}</div> : null}
        </div>
        <div className="grid g8">
          <Lbl>With the plan</Lbl>
          <CoverageMetric incomeAnnual={local.incomeAfter} value={local.headlineAfter} noDebt={noDebtServiceAfter} pending={unresolvedPayoffs} basis={headline?.label} />
          <div className="fc-chips">
            <CellChip tone={noDebtServiceAfter && local.incomeAfter != null && local.incomeAfter <= 0 ? "warn" : dscrTone(afterStatus)}>{noDebtServiceAfter ? "No scheduled debt payments" : dscrLabel(afterStatus)}</CellChip>
            <CellChip tone="mut">Underwriting debt-service equivalent {money(local.serviceAfter)} / mo</CellChip>
            {local.retiredMonthly ? <CellChip tone="ok">{money(local.retiredMonthly)} / mo stops</CellChip> : null}
            {local.excludedMonthly ? <CellChip tone="acc">{money(local.excludedMonthly)} / mo not spend</CellChip> : null}
            {local.newPayment ? <CellChip tone="warn">+{money(local.newPayment)} / mo {local.schedule?.repayment_config ? "underwriting stress equivalent" : "coverage basis"}{loanTerms ? ` (${loanTerms})` : local.newPaymentSource === "term_sheet" ? " (recorded loan terms)" : ""}</CellChip> : null}
          </div>
          <CoverageEbitdaMetric value={local.ebitda} side="plan" unsaved={dirty} scenarioActive={Boolean(cockpit.plan.evaluation.active)} corrected={ebitdaIsStaffCorrected(cockpit.ebitda?.headline, cockpit.metric_review)} />
          {local.coverageUnavailableReason ? <StatusLine tone="warn">{local.coverageUnavailableReason}</StatusLine> : null}
          <div className="fc-plan-words">
            <span className="lbl">The plan</span>
            {planLines.length ? (
              <ul className="fc-notes">{planLines.map((line) => <li key={line}>{line}</li>)}</ul>
            ) : (
              <span className="sub">No plan yet: these are today's figures. Tick what the new loan pays off, enter the new loan or add the recorded loan terms, add back income the documents understate, or apply a lever on the right. Nothing is assumed until you choose it.</span>
            )}
          </div>
          {local.incomeAfter == null || local.incomeAfter > 0 ? <Meter value={local.noDebtLeft ? thresholds.very_strong * 2 : (local.headlineAfter ?? null)} tone={meterTone(afterStatus)} marks={marks} label="Debt service coverage with the plan" /> : null}
          {local.schedule?.repayment_config ? <p className="sub">Bank balance and negative-month projections use the regular payment equivalent after interest-only, without matching commencement dates to historical statement months. DSCR separately retains the underwriting stress basis, including principal due.</p> : null}
          <div className="fc-stat-list">
            <BankReplayNotice reason={local.replayUnavailableReason} onReviewEvidence={onOpenEvidence ? () => { if (setupBudgetSaving) return; setReviewOpen(false); onOpenEvidence(); } : undefined} />
            <Stat label="Loan the plan needs">{local.loanAmountNeeded ? `${money(local.loanAmountNeeded)}${local.payoffTotal ? ` (payoffs ${money(local.payoffTotal)}${local.payoffUnknown ? `, ${local.payoffUnknown} unknown` : ""})` : ""}` : "—"}</Stat>
            <Stat label="Net cash flow per month, today → plan">{money(summary.avg_net)} → {money(local.netAfterAverage)}</Stat>
            <Stat label="Ending balance, last month, today → plan">{money(summary.ending_balance)} → {money(local.endingAfterLast)}</Stat>
            <Stat label="Months dipping below zero, today → plan">{local.rows.filter((r) => r.lowest != null && r.lowest < 0).length} → {local.monthsDippingNegativeAfter ?? "—"}</Stat>
          </div>
        </div>
      </div>

      <details className={styles.ebitdaDetails}>
        <summary>EBITDA sources and plan adjustments</summary>
        <EbitdaRefinanceComparison value={local.ebitda} scenarioActive={Boolean(cockpit.plan.evaluation.active)} unsaved={dirty} onPreviewSource={onPreviewSource ? previewSource : undefined} onRequestEvidence={onRequestStatement ? () => { if (setupBudgetSaving) return; setReviewOpen(false); onRequestStatement("profit_and_loss"); } : undefined} />
        <RevenueTrendPanel value={cockpit.ebitda?.revenue_trend} potential={cockpit.ebitda?.potential} planIsCurrent={!dirty} onPreviewSource={onPreviewSource ? (source) => { if (source.file_id) previewSource(source.file_id, source.pages?.[0]); } : undefined} />
      </details>

      <div className="fc-grid">
        <div className="grid g8">
          <div className="row"><Lbl>Saved and documented obligations ({accountLabel})</Lbl><span className="sp" />{canEdit ? <Btn size="sm" onClick={() => openDebt({ view: "form" })}><Icon name="pencil" size={13} />Open financial workspace</Btn> : null}</div>
          {obligations.length ? (
            <div className={styles.obligationsWorkspace}>
            <div className={`tbl-wrap ${styles.obligationsScroll}`} tabIndex={0} role="region" aria-label="Loan obligations, scroll across for origination dates and paid-down percentages">
              <table className={`tbl fc-obligations ${styles.obligationsTable}`}>
                <colgroup><col className={styles.payoffSelectionColumn} /><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 140 }} /><col style={{ width: 85 }} /><col style={{ width: 110 }} /></colgroup>
                <thead>
                  <tr>
                    <th scope="col" className={styles.payoffSelectionCell} title="Select loans to pay off"><span aria-hidden="true">✓</span><span className="sr-only">Select loans to pay off</span></th>
                    <th>Lender</th>
                    <th>Origination date</th>
                    <th className="r">Per month</th>
                    <th className="r">Balance / payoff</th>
                    <th className="r">Paid down</th>
                    <th>In debt service</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => (
                    <ObligationPlanRow key={o.id} o={o} canEdit={canEdit} on={plan.retire.includes(o.id)} onToggleRetire={() => toggleRetire(o.id)} onReviewEvidence={onOpenEvidence ? () => { if (setupBudgetSaving) return; setReviewOpen(false); onOpenEvidence(); } : undefined} />
                  ))}
                </tbody>
              </table>
            </div>
            <RefinanceSelectionSummary totals={selectionTotals} interestOnlyMonths={local.schedule?.interest_only_months ?? 0} hasRepayment={local.schedule?.payment_after != null} coverageEquivalent={Boolean(local.schedule?.repayment_config) || (local.schedule?.periods_per_year != null && local.schedule.periods_per_year !== 12)} />
            </div>
          ) : (
            <div className="fc-empty fc-empty-actions">
              <span>
                {schedule.status === "voided"
                  ? `No debt reported: the business is debt free, ${declaredBy(schedule.voided)}.`
                  : schedule.status === "document"
                    ? "The uploaded schedule was read but none of its lines could be listed. Adopt it, enter the schedule, or ask again."
                    : `No obligations on file. Debt schedule: ${schedule.label.toLowerCase()}. Confirm the business is debt free, or get the schedule on the file.`}
              </span>
              <Btn size="sm" onClick={() => openDebt({ view: "form" })}>Open working debt schedule</Btn>
            </div>
          )}

        </div>
        <div className="grid g8">
          <div className={loanStyles.loanHeader} aria-label="New loan controls"><Lbl>The new loan</Lbl>{termsKind === "client" ? <div className={loanStyles.loanHeaderActions}><IconBtn disabled={termsPending || save.isPending} aria-label="Expand full loan terms" title="Expand full loan terms" onClick={() => openClientTerms("terms")}><Icon name="maximize" size={16} /></IconBtn><IconBtn disabled={termsPending || save.isPending} aria-label="Expand amortization schedule" title="Expand amortization schedule" onClick={() => openClientTerms("schedule")}><Icon name="calc" size={16} /></IconBtn></div> : null}</div>
          <div className="fc-loan-terms">
            <label className="grid g2"><span className="sub">{targetNetMode ? "Net to client, $" : "Total loan amount, $"}</span><Input aria-label={targetNetMode ? "Net to client" : "New loan amount"} type="number" inputMode="decimal" min={0} step="any" value={numberValue(targetNetMode ? budgetPreview.value?.target_net_amount : plan.new_loan_amount)} disabled={!canEdit} onChange={(e) => targetNetMode ? budgetPreview.updateBudget({ target_net_amount: num(e.target.value) }) : setLoan("amount", e.target.value)} />{targetNetMode ? <small>Total loan including fees: {budgetPending ? "Calculating…" : money(plan.new_loan_amount, 2)}</small> : null}</label>
            <label className="grid g2"><span className="sub">Rate, %</span><Input aria-label="New loan rate percent" type="number" inputMode="decimal" min={0} max={100} step="any" value={numberValue(plan.new_loan_rate_pct)} disabled={!canEdit} onChange={(e) => setLoan("rate", e.target.value)} /></label>
            <label className="grid g2"><span className="sub">Loan term / maturity, months</span><Input aria-label="New loan term in months" type="number" inputMode="numeric" min={1} max={600} step={1} value={numberValue(plan.new_loan_term_months)} disabled={!canEdit} onChange={(e) => setLoan("term", e.target.value)} /></label>
            <label className="grid g2"><span className="sub">Payments per year</span><Input aria-label="New loan payments per year" type="number" inputMode="decimal" min={1} max={366} step="any" placeholder="12 (monthly)" value={numberValue(plan.new_loan_payments_per_year)} disabled={!canEdit} onChange={(event) => { setSaved(null); setPaymentText(""); setLoanDraftTouched(true); setPlan((current) => ({ ...current, overrides: releaseAutomaticRefinance(current), new_loan_payments_per_year: event.target.value === "" ? null : Number(event.target.value), new_payment_monthly: null, new_payment_source: current.new_loan_amount != null ? "manual_terms" : null, terms_ref: null })); }} /></label>
            <label className="grid g2"><span className="sub">Structure</span>
              <Select aria-label="New loan structure" value={plan.new_loan_interest_only ? "interest_only" : plan.new_loan_structure ?? ""} disabled={!canEdit} onChange={(e) => setLoan("structure", e.target.value)}>
                <option value="">Automatic for this term ({STRUCTURE_LABELS[defaultStructure(plan.new_loan_term_months)].toLowerCase()})</option>
                {(Object.keys(STRUCTURE_LABELS) as LoanStructure[]).map((k) => <option key={k} value={k}>{k === "amortizing" ? "Amortizing / declining balance" : STRUCTURE_LABELS[k]}</option>)}
              </Select>
            </label>
            {structureNow !== "interest_only" ? (
              <label className="grid g2"><span className="sub">Interest-only months first</span><Input aria-label="Interest-only months at the start of the term" type="number" inputMode="numeric" min={0} max={plan.new_loan_term_months ?? 600} step={1} placeholder="0" value={numberValue(plan.new_loan_interest_only_months)} disabled={!canEdit} onChange={(e) => setLoan("io_months", e.target.value)} /></label>
            ) : null}
            <label className="grid g2"><span className="sub">Amortization after interest-only, months</span><Input aria-label="Amortization after interest-only (months)" type="number" inputMode="numeric" min={1} max={1200} placeholder="Use remaining loan term" value={numberValue(plan.new_loan_repayment_config?.amortization_months)} disabled={!canEdit || structureNow === "interest_only"} onChange={(event) => setAmortization(event.target.value)} /><small className="sub">Independent of maturity; this period begins after any interest-only months.</small>{structureNow === "interest_only" && plan.new_loan_repayment_config?.amortization_months != null ? <Btn size="sm" disabled={!canEdit} onClick={() => setAmortization("")}>Remove amortization; keep principal payments</Btn> : null}</label>
            <div className="grid g2"><span className="sub">Residual balloon at maturity</span><strong className="num">{local.schedule ? money(local.schedule.balloon, 2) : "Enter loan details to calculate"}</strong><small className="sub">Unpaid principal is due at maturity{plan.new_loan_term_months != null ? ` in month ${plan.new_loan_term_months}` : ""}; additional principal payments are set below.</small></div>
          </div>
          {local.schedule ? <LoanPaymentPhases schedule={local.schedule} /> : null}
          <FileCollateralSection profileId={profileId} disabled={!canEdit} compact title="Collateral for this loan" onSaved={refresh} />
          <DealBudgetSection profileId={profileId} disabled={!canEdit} financialPlan={plan} onPending={setTermsPending} onGrossAmountChange={amount => setLoan("amount", amount == null ? "" : String(amount))} onApplySolvedPrincipal={amount => setLoan("amount", String(amount))} onFinancingSaved={financingSaved} onSaved={() => { onEconomicsSaved?.(); return refresh(); }} loan={workingLoan ? { amount: workingLoan.amount, rate_pct: workingLoan.ratePct, term_months: workingLoan.termMonths, structure: workingLoan.structure, interest_only_months: workingLoan.interestOnlyMonths, repayment_config: workingLoan.repaymentConfig, payments_per_year: workingLoan.paymentsPerYear } : null} />
          <AdvancedRepaymentEditor amortizationAlreadyVisible value={plan.new_loan_repayment_config} onChange={(config) => { setSaved(null); setPaymentText(""); setLoanDraftTouched(true); setPlan((current) => ({ ...current, overrides: releaseAutomaticRefinance(current), new_loan_repayment_config: config, new_payment_monthly: null, new_payment_source: current.new_loan_amount != null ? "manual_terms" : null, terms_ref: null })); }} amount={plan.new_loan_amount} ratePct={plan.new_loan_rate_pct} termMonths={plan.new_loan_term_months} structure={structureNow} interestOnlyMonths={plan.new_loan_interest_only_months} periodsPerYear={plan.new_loan_payments_per_year ?? 12} disabled={!canEdit} />
          <span className="sub">Under three years the house default is simple interest (interest on the original principal, principal spread evenly after the interest-only months); from three years, amortizing. Pick the other when the lender prices it that way.</span>
          <span className="sub">
            {local.schedule ? "Scheduled installments, maturity principal and the underwriting stress basis are shown separately above." : plan.new_payment_monthly != null ? `Payment typed by the desk: ${money(plan.new_payment_monthly)} a month.` : termsAdopted ? `In the plan: the recorded loan terms, ${money(local.newPayment)} a month for coverage.` : cockpit.dscr.proposed ? `Recorded loan terms on file: ${money(cockpit.dscr.proposed.monthly_payment)} a month for coverage${cockpit.dscr.proposed.label ? ` (${cockpit.dscr.proposed.label})` : ""}. Not in the plan until you add them.` : "No loan terms yet: enter them, type a payment, or apply a lever."}
            {canRecordTerms ? <> <button type="button" className="linky" onClick={() => { if (setupBudgetSaving) return; setReviewOpen(false); onRecordTerms(); }}>Record loan terms</button></> : null}
          </span>
          {recorded ? (
            <div className="fc-chips" style={{ alignItems: "center" }}>
              {mirrorNow === "mirrored" ? <CellChip tone="ok">Mirrors {recorded.label}</CellChip> : mirrorNow === "recorded_not_in_plan" ? <CellChip tone="mut">{recorded.label} is recorded, not in the plan</CellChip> : mirrorNow ? <CellChip tone="warn">Differs from {recorded.label}: {mirrorNow.slice("differs:".length)}</CellChip> : null}
              {canEdit && mirrorNow !== "mirrored" ? <Btn size="sm" onClick={() => adoptTerms(true)}><Icon name="plus" size={12} /> Use the recorded terms ({money(recorded.payment_monthly)} / mo)</Btn> : null}
              {canEdit && termsAdopted ? <Btn size="sm" onClick={() => adoptTerms(false)}>Take them out of the plan</Btn> : null}
              {canRecordTerms && mirrorNow && mirrorNow.startsWith("differs") ? <Btn size="sm" onClick={() => { if (setupBudgetSaving) return; setReviewOpen(false); onRecordTerms(); }}>Record the term sheet from this loan</Btn> : null}
            </div>
          ) : local.newPayment && canRecordTerms ? (
            <div className="fc-chips" style={{ alignItems: "center" }}>
              <CellChip tone="mut">Not recorded on the Underwriting tab yet</CellChip>
              <Btn size="sm" onClick={() => { if (setupBudgetSaving) return; setReviewOpen(false); onRecordTerms(); }}>Record these terms</Btn>
            </div>
          ) : null}
          {termsKind === "client" ? (
            <ClientTermsStrip
              profileId={profileId}
              loan={workingLoan}
              linkSummary={link?.summary ?? null}
              linkState={link?.state ?? null}
              canEdit={canEdit}
              financialPlanDraft={plan} refinanceContext={refinanceContext} workingDraft={clientTermsDraft} onSaved={termsSaved} onPending={setTermsPending}
              showOpenEditor={false} onOpenEditor={() => openClientTerms("terms")}
            />
          ) : null}
          <Input aria-label="Or type the new monthly payment" inputMode="decimal" placeholder={cockpit.dscr.proposed ? `Or type the payment (term sheet: ${money(cockpit.dscr.proposed.monthly_payment)})` : "Or type the payment"} value={paymentText} disabled={!canEdit} onChange={(e) => setPayment(e.target.value)} />
          <Lbl>Ways to raise coverage</Lbl>
          {levers.length ? (
            <div className="fc-levers">
              {levers.map((lever) => (
                <div key={lever.key} className={cx("fc-lever", lever.improves && "is-good")}>
                  <div>
                    <strong>{lever.label}</strong>
                    <div className="sub">{lever.detail}</div>
                  </div>
                  <div className="fc-lever-side">
                    {lever.dscr_after != null ? <><strong className="num">{multiple(lever.dscr_after)}</strong><CellChip tone={dscrTone(lever.status_after)}>{dscrLabel(lever.status_after).split(" (")[0]}</CellChip></> : <CellChip tone="mut">Needs a document</CellChip>}
                    {lever.apply && canEdit ? <Btn size="sm" onClick={() => applyLever(lever.apply as Partial<FinancialPlanWrite>)}><Icon name="sparkles" size={12} /> Apply</Btn> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="sub">Levers appear once an income figure and the statements' payees are on file.</div>
          )}
        </div>
      </div>

      <div className="fc-grid">
        <div className="grid g8">
          <Lbl>Add-backs: income the documents understate</Lbl>
          <span className="sub">Document discretionary owner pay or one-time operating costs with a note. Interest and depreciation are already accounted for in earnings or bank cash flow and are not added again.</span>
          {plan.add_backs.length ? (
            <div className="grid g6">
              {plan.add_backs.map((item, index) => (
                <div key={item.id ?? index} className="fc-adjust-row">
                  <Select aria-label="Add-back kind" value={item.kind} disabled={!canEdit} onChange={(e) => updateAddBack(index, { kind: e.target.value as PlanAddBackKind, label: item.label && item.label !== ADD_BACK_KINDS[item.kind] ? item.label : null })}>
                    {(Object.keys(ADD_BACK_KINDS) as PlanAddBackKind[]).filter((kind) => !isExcludedDscrAddBack(kind) || kind === item.kind).map((kind) => <option key={kind} value={kind}>{ADD_BACK_KINDS[kind]}{isExcludedDscrAddBack(kind) ? " (not applied)" : ""}</option>)}
                  </Select>
                  <Input aria-label="Add-back label" placeholder={ADD_BACK_KINDS[item.kind]} value={item.label ?? ""} disabled={!canEdit} onChange={(e) => updateAddBack(index, { label: e.target.value || null })} />
                  <Input aria-label="Add-back amount per month" type="number" inputMode="decimal" min={0} step="any" placeholder="$ / month" value={numberValue(item.amount_monthly)} disabled={!canEdit} onChange={(e) => updateAddBack(index, { amount_monthly: num(e.target.value) ?? 0 })} />
                  <Input aria-label="Add-back note" placeholder="Why it is added back" value={item.note ?? ""} disabled={!canEdit} onChange={(e) => updateAddBack(index, { note: e.target.value || null })} />
                  {canEdit ? <button type="button" className="fc-adv-remove" aria-label="Remove this add-back" onClick={() => removeAddBack(index)}><Icon name="x" size={13} /></button> : <span />}
                </div>
              ))}
            </div>
          ) : (
            <div className="fc-empty">No add-backs. The income figure is what the documents show.</div>
          )}
          {local.excludedAddBacks.length ? <StatusLine tone="warn">{local.excludedAddBacks.map((item) => item.label || ADD_BACK_KINDS[item.kind]).join(", ")}: retained for review, excluded from DSCR to avoid counting interest or depreciation twice.</StatusLine> : null}
          {canEdit ? (
            <div className="fc-chips">
              {officerYear && !hasKind("owner_salary") ? <Btn size="sm" onClick={() => addAddBack({ kind: "owner_salary", label: `Officer compensation (tax return ${officerYear.year})`, amount_monthly: Math.round(((officerYear.officer_compensation ?? 0) / 12) * 100) / 100, source: "tax_return" })}><Icon name="plus" size={12} /> Officer compensation {money(officerYear.officer_compensation)} a year</Btn> : null}
              <Btn size="sm" onClick={() => addAddBack()}><Icon name="plus" size={12} /> Add an add-back</Btn>
              {local.addBacksMonthly ? <CellChip tone="ok">+{money(local.addBacksMonthly)} / mo · {money(local.addBacksMonthly * 12)} a year</CellChip> : null}
            </div>
          ) : null}
        </div>
        <div className="grid g8">
          <Lbl>Overrides: set a figure outright</Lbl>
          <span className="sub">Banking control: when the desk knows better than the documents, set the income available for debt service or the existing debt service, and say why. An override replaces the computed figure, add-backs included.</span>
          <div className="fc-loan-terms">
            <label className="grid g2"><span className="sub">Income available for debt service, $ a year</span><Input aria-label="Income override per year" type="number" inputMode="decimal" step="any" placeholder={money(headline?.numerator ?? null)} value={numberValue(overrides.income_annual)} disabled={!canEdit} onChange={(e) => setOverride({ income_annual: parseIncomeOverride(e.target.value) })} /></label>
            <label className="grid g2"><span className="sub">Why</span><Input aria-label="Income override note" placeholder="Per the CPA letter…" value={overrides.income_note ?? ""} disabled={!canEdit} onChange={(e) => setOverride({ income_note: e.target.value || null })} /></label>
            <label className="grid g2"><span className="sub">Existing debt service, $ a month</span><Input aria-label="Existing debt service override per month" type="number" inputMode="decimal" min={0} step="any" placeholder={money(serviceOriginal)} value={numberValue(overrides.debt_service_monthly)} disabled={!canEdit} onChange={(e) => setOverride({ debt_service_monthly: num(e.target.value) })} /></label>
            <label className="grid g2"><span className="sub">Why</span><Input aria-label="Debt service override note" placeholder="Includes the truck lease…" value={overrides.debt_service_note ?? ""} disabled={!canEdit} onChange={(e) => setOverride({ debt_service_note: e.target.value || null })} /></label>
          </div>
          {overrides.income_annual != null || overrides.debt_service_monthly != null ? <StatusLine tone="acc">Overrides in force{overrides.income_annual != null ? `: income ${money(overrides.income_annual)} a year` : ""}{overrides.debt_service_monthly != null ? `${overrides.income_annual != null ? "," : ":"} existing debt service ${money(overrides.debt_service_monthly)} a month` : ""}. They print on the package and the listing with the note.</StatusLine> : null}
        </div>
      </div>

      {termsKind !== "client" && local.schedule ? (
        <ChartCard
          plain
          title={`Amortization schedule: ${money(local.schedule.amount)} at ${local.schedule.rate_pct}% ${describeOf(local.schedule)}`}
          sub={<>
            {local.schedule.repayment_config ? `Regular payment ${money(local.schedule.payment_io ?? local.schedule.payment_after)} per period; peak rolling 12-month actual cash due ${money(local.schedule.coverage_annual_debt_service)}. Residual due at maturity ${money(local.schedule.balloon)}.` : `${local.schedule.payment_io_monthly != null ? `${money(local.schedule.payment_io_monthly)} a month for ${local.schedule.interest_only_months} months, then ` : ""}${local.schedule.payment_after_monthly != null ? `${money(local.schedule.payment_after_monthly)} a month` : `${money(local.schedule.payment_io_monthly)} a month of interest`} · first year ${money(local.schedule.annual_debt_service)} · total interest ${money(local.schedule.total_interest)} · total paid ${money(local.schedule.total_paid)}${local.schedule.balloon ? ` · ${money(local.schedule.balloon)} due at maturity` : ""}.`}
            {risk ? <><br /><strong>Principal at risk.</strong> {risk.words}</> : null}
          </>}
          table={{
            caption: "Payment by period",
            cols: ["Period", "Phase", local.schedule.repayment_config ? "Cash due" : "Payment", "Interest", "Principal", "Balance", "Still out", "Coverage"],
            rows: loanScheduleRows(local.schedule, risk).map((r) => ({ key: String(r.period), muted: r.phase === "interest_only", cells: [String(r.period), r.phase === "interest_only" ? "Interest-only" : r.phase === "amortizing" ? "Amortizing" : "Simple interest", money(r.cash), money(r.interest), money(r.principal), money(r.balance), `${r.principalExposurePct.toFixed(1)}%`, r.coverage == null ? "—" : `${r.coverage.toFixed(2)}x`] })),
          }}
          chart={
            <div className="grid g8">
              <ColumnChart
                ariaLabel="Interest and principal by period"
                bands={local.schedule.rows.map((r) => ({ key: String(r.period), label: `Period ${r.period}`, short: local.schedule!.rows.length > 36 ? (r.period % 12 === 1 ? String(r.period) : "") : String(r.period), muted: r.phase === "interest_only" }))}
                series={[
                  { key: "interest", label: "Interest", color: SERIES.two, values: local.schedule.rows.map((r) => r.interest) },
                  { key: "principal", label: "Principal, including balloons", color: SERIES.one, values: loanScheduleRows(local.schedule).map((r) => r.principal), emphasis: true },
                ]}
                height={180}
              />
              <LineChart
                ariaLabel="Principal still out, as a share of the loan, by period"
                bands={local.schedule.rows.map((r) => ({ key: String(r.period), label: `Period ${r.period}`, short: local.schedule!.rows.length > 36 ? (r.period % 12 === 1 ? String(r.period) : "") : String(r.period) }))}
                series={[
                  { key: "exposure", label: "Principal still outstanding", color: SERIES.two, values: loanScheduleRows(local.schedule).map((r) => r.principalExposurePct), emphasis: true },
                  { key: "cash_at_risk", label: "Original advance not recovered from receipts", color: SERIES.one, values: loanScheduleRows(local.schedule).map((r) => r.cashAtRiskPct) },
                ]}
                format={(v) => (v == null ? "—" : `${v}%`)}
                axisFormat={(v) => `${Math.round(v)}%`}
                height={150}
              />
              {risk && risk.coverage_by_period.length ? (
                <LineChart
                  ariaLabel="Coverage on each payment by period"
                  bands={local.schedule.rows.map((r) => ({ key: String(r.period), label: `Period ${r.period}`, short: local.schedule!.rows.length > 36 ? (r.period % 12 === 1 ? String(r.period) : "") : String(r.period) }))}
                  series={[{ key: "coverage", label: "Coverage on the payment", color: SERIES.one, values: risk.coverage_by_period.map((c) => c.coverage), emphasis: true }]}
                  format={(v) => (v == null ? "—" : `${v.toFixed(2)}x`)}
                  axisFormat={(v) => `${v.toFixed(2)}x`}
                  height={150}
                />
              ) : null}
            </div>
          }
        />
      ) : null}

      <div className="grid g6">
        <Lbl>Original, with the plan, and the difference</Lbl>
        <div className="tbl-wrap">
          <table className="tbl fc-impact">
            <thead>
              <tr>
                <th>Figure</th>
                <th className="r">Original</th>
                <th className="r">With the plan</th>
                <th className="r">Change</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>{fundingReview.hasNonpositiveEarnings ? "Signed DSCR · compare funding shortfall for plan impact" : "Debt service coverage"}{headline ? ` · ${headline.label}` : ""}</td><td className="r num">{multiple(headline?.value)}</td><td className="r num">{unresolvedPayoffs ? "Needs review" : noDebtServiceAfter ? "Not applicable · no debt service" : multiple(local.headlineAfter)}</td><td className="r num">{fundingReview.ratioDeltaDirectionMeaningful ? signedMultiple(change(headline?.value, local.headlineAfter)) : "See funding shortfall"}</td></tr>
              <tr><td>Income available for debt service, a year</td><td className="r num">{money(local.incomeBefore)}</td><td className="r num">{money(local.incomeAfter)}</td><td className="r num">{signedMoney(change(local.incomeBefore, local.incomeAfter))}</td></tr>
              <tr><td>Regular debt service, a month{local.newInterestOnlyPayment != null && local.schedule?.payment_after != null ? " · after interest-only" : ""}</td><td className="r num">{money(serviceOriginal)}</td><td className="r num">{money(local.serviceAfterRegular)}</td><td className="r num">{signedMoney(change(serviceOriginal, local.serviceAfterRegular))}</td></tr>
              {local.newInterestOnlyPayment != null && local.schedule?.payment_after != null ? <tr><td>Debt service, a month · during interest-only</td><td className="r num">{money(serviceOriginal)}</td><td className="r num">{money(local.serviceAfterInterestOnly)}</td><td className="r num">{signedMoney(change(serviceOriginal, local.serviceAfterInterestOnly))}</td></tr> : null}
              {local.schedule?.repayment_config ? <tr><td>Underwriting stress equivalent, a month · DSCR basis</td><td className="r num">{money(serviceOriginal)}</td><td className="r num">{money(local.serviceAfter)}</td><td className="r num">{signedMoney(change(serviceOriginal, local.serviceAfter))}</td></tr> : null}
              <tr><td>Net cash flow, a month ({accountLabel})</td><td className="r num">{money(summary.avg_net)}</td><td className="r num">{money(local.netAfterAverage)}</td><td className="r num">{signedMoney(change(summary.avg_net, local.netAfterAverage))}</td></tr>
              <tr><td>Ending balance, last month</td><td className="r num">{money(summary.ending_balance)}</td><td className="r num">{money(local.endingAfterLast)}</td><td className="r num">{signedMoney(change(summary.ending_balance, local.endingAfterLast))}</td></tr>
              <tr><td>Months dipping below zero</td><td className="r num">{local.rows.filter((r) => r.lowest != null && r.lowest < 0).length}</td><td className="r num">{local.monthsDippingNegativeAfter ?? "—"}</td><td className="r num">{local.monthsDippingNegativeAfter == null ? "—" : local.monthsDippingNegativeAfter - local.rows.filter((r) => r.lowest != null && r.lowest < 0).length}</td></tr>
            </tbody>
          </table>
        </div>
        {savedModifications.length && !dirty ? (
          <div className="grid g4">
            <span className="sub">Saved plan, as the package, the listing and the review read it:</span>
            <ul className="fc-notes">
              {savedModifications.map((m, i) => <li key={`${m.kind}-${i}`}><strong>{m.label}</strong>{m.detail ? ` — ${m.detail}` : ""}</li>)}
            </ul>
          </div>
        ) : dirty ? (
          <span className="sub">Save the plan to carry these figures to the production package, the marketplace listing and the AI review.</span>
        ) : null}
      </div>

      {candidates.length ? (
        <div className="tbl-wrap" role="region" aria-label="Coverage calculation bases" tabIndex={0}>
        <table className="tbl fc-candidates">
          <thead>
            <tr>
              <th>Basis</th>
              <th className="r">Income figure</th>
              <th className="r">Debt service today</th>
              <th className="r">Today</th>
              <th className="r">With the plan</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c) => {
              const after = local.candidates.find((x) => x.key === c.key);
              return (
                <tr key={c.key}>
                  <td>
                    {c.label}
                    <small>{c.numerator_label}{c.period ? ` · ${c.period}` : ""}</small>
                    {c.note ? <small>{c.note}</small> : null}
                  </td>
                  <td className="r num">{money(c.numerator)}{after && after.numerator_after !== after.numerator_before ? <small className="sub" style={{ display: "block" }}>{money(after.numerator_after)} with the plan</small> : null}</td>
                  <td className="r num">{money(c.annual_debt_service)}</td>
                  <td className="r num">{multiple(c.value)} {c.value != null ? <CellChip tone={dscrTone(c.status)}>{dscrLabel(c.status).split(" (")[0]}</CellChip> : null}</td>
                  <td className="r num">{after ? (after.no_debt_left ? <CellChip tone="ok">No debt left</CellChip> : <>{multiple(after.value_after)} {after.value_after != null ? <CellChip tone={dscrTone(after.status_after)}>{dscrLabel(after.status_after).split(" (")[0]}</CellChip> : null}</>) : "—"}</td>
                  <td><CellChip tone={confidenceTone(c.confidence)}>{confidenceLabel(c.confidence)}</CellChip></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : null}

      {months.length ? <BankReplayNotice reason={local.replayUnavailableReason} onReviewEvidence={onOpenEvidence ? () => { if (setupBudgetSaving) return; setReviewOpen(false); onOpenEvidence(); } : undefined} /> : null}
      {months.length ? (
        <ChartCard
          plain
          title="Ending balance, today against the plan"
          sub={`${accountLabel}: lowest balance ${compactMoney(summary.lowest_balance)} today; with the plan the lowest estimated month is ${compactMoney(local.rows.reduce<number | null>((m, r) => (r.lowestAfter == null ? m : m == null ? r.lowestAfter : Math.min(m, r.lowestAfter)), null))}. Cash kept over the period: ${money(local.cashKept)}.`}
          table={replayTable}
          chart={
            <LineChart
              ariaLabel="Ending balance, today and with the plan"
              bands={bands}
              series={[
                { key: "plan", label: "With the plan", color: SERIES.one, values: local.rows.map((r) => r.endingAfter), emphasis: true },
                { key: "today", label: "Today", color: SERIES.two, values: local.rows.map((r) => r.ending) },
              ]}
            />
          }
        />
      ) : null}
    </section>
  );
  const review = cockpit.debt.review;
  const spendContent = excludable.length ? <details className={styles.spend}>
    <summary>Not operating spend · {excludable.length} transfers / owner draws</summary>
    <div className={styles.spendBody}><p className={styles.note}>These are income-estimate adjustments for transfers and owner draws. They do not decide whether a payment is a loan. Changes apply only when you Save plan.</p>
      <div className={styles.spendList}>{excludable.map((payee) => {
        const id = `payee:${payee.key}`;
        return <label key={payee.key} className={cx("fc-sim-pick", plan.exclude.includes(id) && "on")}>
          <input type="checkbox" checked={plan.exclude.includes(id)} disabled={!canEdit} onChange={() => toggleExclude(id)} />
          <span className="fc-sim-pick-name">{payee.payee}</span><CellChip tone={payeeKindTone(payee.kind)}>{payee.kind_label}</CellChip><span className="sub">{money(payee.monthly_average)} / month</span>
        </label>;
      })}</div>
    </div>
  </details> : null;
  const planActions = canEdit ? <><Btn size="sm" onClick={clearPlan} disabled={!dirty && !plan.retire.length && !plan.exclude.length && !plan.new_payment_monthly && !plan.new_loan_amount}>Clear plan</Btn><Btn size="sm" variant="pri" disabled={!dirty && !legacySelectionsReviewed || save.isPending || unresolvedPayoffs || !!repaymentIssue} onClick={() => void submit()}>{save.isPending ? "Saving…" : "Save plan"}</Btn></> : null;
  const planReview = <>{programSelection}{unresolvedPayoffs ? <StatusLine tone="warn">Earlier payoff selections are not confirmed schedule obligations. Review their statement evidence before using this scenario. <Btn size="sm" disabled={!canEdit} onClick={() => { setPlan((current) => ({ ...current, retire: current.retire.filter((id) => obligations.some((obligation) => obligation.id === id)) })); setLegacySelectionsReviewed(true); }}>Remove unconfirmed payoff selections</Btn></StatusLine> : null}{planContent}</>;
  return <>
    <section className={`fc-card ${styles.summaryCard}`} aria-label="Debt coverage and financial review">
      <div className={styles.summaryHead}><div><h4>Debt coverage and financial review</h4><p className={styles.note}>Saved financial figures, the working debt schedule, and observed statement payments stay distinct.</p></div><div className={styles.summaryActions}>
        <Btn variant="pri" size="sm" onClick={() => setReviewOpen(true)}>Advanced review</Btn>
        {canReviewDebt ? <Btn size="sm" onClick={() => openDebt({ view: "form" })}>Edit debt schedule</Btn> : null}
        {profitAndLossIsEmpty(cockpit.profit_and_loss) && onRequestStatement ? <Btn size="sm" onClick={() => onRequestStatement("profit_and_loss")}>Request P&amp;L</Btn> : null}
        {balanceSheetIsEmpty(cockpit.balance_sheet) && onRequestStatement ? <Btn size="sm" onClick={() => onRequestStatement("balance_sheet")}>Request balance sheet</Btn> : null}
      </div></div>
      <div className={styles.metrics}>
        <div><small>Current coverage</small><CoverageMetric compact incomeAnnual={local.incomeBefore} value={headline?.value ?? null} noDebt={noDebt || currentAnnualService === 0} basis={headline ? sourceLabel(headline.key) : "Income basis not available"} /></div>
        <div><small>With the plan</small><CoverageMetric compact incomeAnnual={local.incomeAfter} value={local.headlineAfter} noDebt={noDebtServiceAfter} pending={unresolvedPayoffs} basis={dirty ? "Unsaved scenario preview" : "Saved scenario"} /></div>
        <div><small>{review?.published.complete ? "Saved debt service" : "Current service basis"}</small><strong>{money(review?.published.complete ? review.published.monthly : local.serviceBefore)}</strong><span>{review?.published.complete ? "Complete saved debt schedule / month" : `Provisional / month · ${sourceLabel(debt_service_source)}`}</span></div>
        <div><small>Working schedule</small><strong>{review ? `${review.working.active_rows} obligations` : "Open review"}</strong><span>{review ? review.working.complete ? "Complete · Save version publishes changes" : "Review the required answers" : "Uses the same draft as Evidence & banking"}</span></div>
      </div>
      {local.coverageUnavailableReason ? <StatusLine tone="warn">{local.coverageUnavailableReason}</StatusLine> : null}
      <BankReplayNotice reason={local.replayUnavailableReason} onReviewEvidence={onOpenEvidence} />
      <EbitdaRefinanceComparison value={local.ebitda} compact scenarioActive={Boolean(cockpit.plan.evaluation.active)} unsaved={dirty} onPreviewSource={onPreviewSource ? previewSource : undefined} onRequestEvidence={onRequestStatement ? () => onRequestStatement("profit_and_loss") : undefined} />
      <RevenueTrendPanel value={cockpit.ebitda?.revenue_trend} potential={cockpit.ebitda?.potential} planIsCurrent={!dirty} onPreviewSource={onPreviewSource ? (source) => { if (source.file_id) previewSource(source.file_id, source.pages?.[0]); } : undefined} />
      {repaymentIssue ? <StatusLine tone="bad">Repayment preview is invalid: {repaymentIssue} Resolve it before saving or using these projections.</StatusLine> : null}
      {dirty || legacySelectionsReviewed ? <StatusLine tone="acc">Your scenario changes are kept while reviewing. Save plan applies scenario changes; Save version publishes the debt schedule.</StatusLine> : null}
    </section>
    <FinancialReviewDrawer setupBudgetSaving={setupBudgetSaving} open={reviewOpen} onClose={() => { if (setupBudgetSaving) return; setReviewOpen(false); onReviewClose?.(); }} tab={reviewTab} onTab={setReviewTab} cockpit={cockpit} profileId={profileId} months={months} summary={summary} accountLabel={accountLabel} accountKey={accountKey} businessName={businessName} canEdit={canReviewDebt} canCorrectMetrics={canCorrectMetrics} onRefresh={refresh} onOpenDebt={openDebt} onPreviewSource={onPreviewSource ? previewSource : undefined} onOpenEvidence={() => { if (setupBudgetSaving) return; setReviewOpen(false); onOpenEvidence?.(); }} planContent={planReview} spendContent={spendContent} planActions={planActions} />
    {debtEditor ? <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" initialView={debtEditor.view} initialDebtId={debtEditor.rowId} onClose={closeDebt} onPublished={async () => { await refresh(); }} /> : null}
    <ClientTermsDrawer open={clientTermsOpen} onClose={() => { setClientTermsOpen(false); if (returnToReview.current) setReviewOpen(true); returnToReview.current = false; }} profileId={profileId} onSaved={termsSaved} prefillLoan={workingLoan} financialPlanDraft={plan} refinanceContext={refinanceContext} workingDraft={clientTermsDraft} onWorkingDraftChange={setClientTermsDraft} onApplyLoan={applyTermsLoan} onUpdateLoan={updateTermsLoan} onFinancingSaved={financingSaved} previewScenario={previewScenario} canEdit={requestedCanEdit && !save.isPending} onPending={setTermsPending} scenarioPaymentOnly={scenarioPaymentOnly} initialView={clientTermsView} />
  </>;
}
