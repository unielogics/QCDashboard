import { useFileWorkspace } from "@/components/file/FileWorkspaceContext";
import { FinancialEditorSurface } from "@/components/file/FinancialEditorSurface";
// The term sheet: loan terms a super admin or underwriter records on the file
// before the final can be drafted. Versioned; the current row is what "Draft
// final package" consumes. Lives on the profile, not the package.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { PackageClient } from "./client";
import { dateLabel, errorDetail, errorMessage, errorStatus, money, pct, toNumber, whenLabel } from "./format";
import {
  FACILITY_CATALOG,
  FACILITY_TYPES,
  FUNDER_TYPES,
  FUNDING_PARTIES,
  PAYMENT_FREQUENCIES,
  RATE_INDEXES,
  RATE_STRUCTURES,
  REPAYMENT_STRUCTURES,
  USE_OF_FUNDS_KEYS,
} from "./options";
import { computePaymentSummary, defaultProgramCoverage, effectiveAnnualRate, periodsPerYear } from "./termSheetStructure";
import type { RepaymentConfig } from "@/lib/loanSchedule";
import { repaymentPreview, copyRepaymentConfig } from "@/lib/repaymentConfig";
import { AdvancedRepaymentEditor } from "@/components/application/AdvancedRepaymentEditor";
import { LoanDateFields } from "@/components/application/LoanDateFields";
import { loanDateProblem, resolveLoanDates, savedLoanDates } from "@/lib/loanDates";
import { FileCollateralSection } from "@/components/file/FileCollateralSection";
import { useTermsCollateral } from "@/hooks/useTermsCollateral";
import { useDealBudget } from "@/hooks/useDealBudget";
import { dealBudgetPlan } from "@/lib/dealBudgetPlan";
import { useAutomaticFinancedPrincipal } from "@/hooks/useAutomaticFinancedPrincipal";
import { termsSaveIntent } from "@/lib/termsSaveIntent";
import { acknowledgeTermsBudget } from "@/lib/acknowledgeTermsBudget";
import type { DealBudget } from "@/lib/dealBudget";
import { useDealBudgetPreview } from "@/hooks/useDealBudgetPreview";
import type { FinancialPlanWrite } from "@/lib/financialCockpit";
import { DealBudgetSection } from "@/components/file/DealBudgetSection";
import { PrincipalBudgetNotice } from "@/components/file/PrincipalBudgetNotice";
import { hasPrincipalBudgetMismatch, isPrincipalBudgetError } from "@/lib/principalBudget";
import { dealBudgetChanged } from "@/lib/dealBudget";
import { Drawer } from "@/components/ds/Drawer";
import workspaceStyles from "@/components/application/LoanScheduleReview.module.css";
import { LoanScheduleTable } from "@/components/application/LoanScheduleTable";
import { LoanPaymentPhases } from "@/components/application/LoanPaymentPhases";
import { SavedTermsDownload } from "@/components/application/SavedTermsDownload";
import { Callout, KV, MoneySplit, PBtn, PChip, Picks, emptyUseOfFunds } from "./ui";
import type {
  DebtServiceTreatment,
  FacilityKind,
  FunderType,
  FundingPartyKind,
  PaymentFrequency,
  ProductionPackage,
  ProgramCoverageBasis,
  RateStructure,
  RepaymentStructure,
  TermSheet,
  TermSheetBody,
  TermSheetExtra,
  TermSheetPaymentSummary,
  TermSheetResult,
  TermSheetState,
  TermSheetStructuredFields,
  UseOfFunds,
} from "./types";

type FormState = {
  funding_party_kind: FundingPartyKind;
  lender_id: string;
  funding_party_name: string;
  funder_type: FunderType | "";
  facility_type: string;
  facility_catalog_key: string;
  facility_kind: FacilityKind;
  approved_amount: string;
  min_activation_amount: string;
  initial_draw_amount: string;
  payment_basis_amount: string;
  rate_pct: string;
  apr_pct: string;
  rate_structure: RateStructure;
  rate_index: string;
  rate_index_rate_pct: string;
  rate_margin_pct: string;
  rate_floor_pct: string;
  rate_cap_pct: string;
  rate_as_of: string;
  custom_rate_description: string;
  term_months: string;
  draw_period_months: string;
  repayment_structure: RepaymentStructure;
  payment_frequency: PaymentFrequency;
  payments_per_year: string;
  custom_payment_frequency: string;
  interest_only_months: string;
  amortization_months: string;
  repayment_config: RepaymentConfig | null;
  periodic_payment: string;
  lender_payment_override: boolean;
  custom_payment_description: string;
  monthly_program_coverage_amount: string;
  monthly_program_coverage_basis: ProgramCoverageBasis;
  debt_service_treatment: DebtServiceTreatment;
  retained_annual_debt_service: string;
  expected_funding_date: string;
  maturity_date_mode: "automatic" | "manual";
  first_payment_date: string;
  activation_date: string;
  commencement_date: string;
  maturity_date: string;
  expiration_days: string;
  closing_estimate_days: string;
  use_of_funds: UseOfFunds;
  conditions: string;
  notes: string;
  extra: TermSheetExtra;
};

const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));
const decimal = (v: string): string => v.replace(/[^0-9.]/g, "");
const signedDecimal = (v: string): string => `${v.trimStart().startsWith("-") ? "-" : ""}${v.replace(/[^0-9.]/g, "")}`;
const integer = (v: string): string => v.replace(/[^0-9]/g, "");
const maybeNumber = (v: string): number | null => {
  const trimmed = v.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
};
const roundedMoney = (value: number | null | undefined): number | null => value === null || value === undefined || !Number.isFinite(value) ? null : Math.round((value + Number.EPSILON) * 100) / 100;
const storedNumber = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const SOURCE_LABELS: Record<string, string> = {
  underwriting: "From underwriting", stage_one: "From stage one", level_payment: "Level payment", today: "Today",
  funding: "From the funding date", dealer: "From the dealer file",
};

const COVERAGE_OPTIONS: Array<[ProgramCoverageBasis, string]> = [
  ["monthly_equivalent", "Scheduled monthly equivalent"],
  ["post_io_payment", "Post-interest-only payment"],
  ["full_limit_interest", "Interest at the full credit limit"],
  ["initial_draw_interest", "Interest at the initial draw"],
  ["underwriting_budget", "Underwriting budget"],
  ["manual", "Manual coverage amount"],
];

function usesInitialIo(repayment: RepaymentStructure, _config: RepaymentConfig | null): boolean { return ["interest_only_then_amortizing", "fully_amortizing", "balloon", "simple_interest"].includes(repayment); }

function isKind(v: string): v is FundingPartyKind { return (FUNDING_PARTIES as readonly string[]).includes(v); }
function isFacilityKind(v: unknown): v is FacilityKind { return ["term_loan", "revolving_loc", "heloc", "hybrid", "other"].includes(String(v)); }
function isRepayment(v: unknown): v is RepaymentStructure { return REPAYMENT_STRUCTURES.some((option) => option.value === v); }
function isFrequency(v: unknown): v is PaymentFrequency { return PAYMENT_FREQUENCIES.some((option) => option.value === v); }
function isRateStructure(v: unknown): v is RateStructure { return RATE_STRUCTURES.some((option) => option.value === v); }
function isFunderType(v: unknown): v is FunderType { return FUNDER_TYPES.some((option) => option.value === v); }
function isCoverageBasis(v: unknown): v is ProgramCoverageBasis { return COVERAGE_OPTIONS.some(([value]) => value === v); }

function inferredFacilityKind(label: string): FacilityKind {
  const normalized = label.toLowerCase();
  if (normalized.includes("heloc")) return "heloc";
  if (normalized.includes("line") || normalized.includes("revolving") || normalized.includes("floorplan")) return "revolving_loc";
  if (normalized.includes("hybrid")) return "hybrid";
  return label ? "term_loan" : "other";
}

function defaultCoverageBasis(repayment: RepaymentStructure, kind: FacilityKind): ProgramCoverageBasis {
  if (repayment === "interest_only_then_amortizing") return "post_io_payment";
  if (kind === "revolving_loc" || kind === "heloc" || repayment === "revolving_interest_only") return "full_limit_interest";
  return "monthly_equivalent";
}

function extraValue(src: Record<string, unknown>, extra: TermSheetExtra, key: keyof TermSheetExtra): unknown {
  return extra[key] ?? src[key];
}

function formFrom(sheet: TermSheet | null, defaults: Record<string, unknown>): FormState {
  const src: Record<string, unknown> = sheet ? { ...sheet } : defaults;
  const rawExtra = (src.extra && typeof src.extra === "object" ? src.extra : sheet?.extra ?? {}) as TermSheetExtra;
  const extra = { ...rawExtra };
  const uof = (src.use_of_funds && typeof src.use_of_funds === "object" ? src.use_of_funds : {}) as Record<string, unknown>;
  const kind = str(src.funding_party_kind);
  const split: UseOfFunds = { ...emptyUseOfFunds(), other_label: str(uof.other_label) };
  USE_OF_FUNDS_KEYS.forEach(([key]) => { split[key] = uof[key] === null || uof[key] === undefined || uof[key] === "" ? "" : Number(uof[key]); });

  const facilityType = str(src.facility_type) || FACILITY_TYPES[0];
  const matched = FACILITY_CATALOG.find((option) => option.key === extraValue(src, extra, "facility_catalog_key") || option.label === facilityType);
  const facilityKind = isFacilityKind(extraValue(src, extra, "facility_kind"))
    ? extraValue(src, extra, "facility_kind") as FacilityKind
    : matched?.kind ?? inferredFacilityKind(facilityType);
  const legacyRepayment: RepaymentStructure = sheet
    ? sheet.debt_service_is_level_payment ? "fully_amortizing" : "fixed_payment"
    : matched?.repayment ?? "fully_amortizing";
  const repayment = isRepayment(extraValue(src, extra, "repayment_structure"))
    ? extraValue(src, extra, "repayment_structure") as RepaymentStructure
    : legacyRepayment;
  const frequency = isFrequency(extraValue(src, extra, "payment_frequency"))
    ? extraValue(src, extra, "payment_frequency") as PaymentFrequency
    : "monthly";
  const rateStructure = isRateStructure(extraValue(src, extra, "rate_structure"))
    ? extraValue(src, extra, "rate_structure") as RateStructure
    : "fixed";
  const defaultCoverage = defaultCoverageBasis(repayment, facilityKind);
  const existingFacilityKey = str(extraValue(src, extra, "facility_catalog_key"));
  const catalogKey = existingFacilityKey || matched?.key || "other";
  const customFacility = catalogKey === "other" && facilityType === FACILITY_CATALOG.find((option) => option.key === "other")?.label ? "" : facilityType;
  const term = str(src.term_months);

  return {
    funding_party_kind: isKind(kind) ? kind : "Lender",
    lender_id: str(src.lender_id),
    funding_party_name: str(src.funding_party_name),
    funder_type: isFunderType(extraValue(src, extra, "funder_type")) ? extraValue(src, extra, "funder_type") as FunderType : "",
    facility_type: customFacility,
    facility_catalog_key: catalogKey,
    facility_kind: facilityKind,
    approved_amount: str(src.approved_amount),
    min_activation_amount: str(src.min_activation_amount),
    initial_draw_amount: str(extraValue(src, extra, "initial_draw_amount")),
    payment_basis_amount: str(extraValue(src, extra, "payment_basis_amount")),
    rate_pct: str(src.rate_pct),
    apr_pct: str(extraValue(src, extra, "apr_pct")),
    rate_structure: rateStructure,
    rate_index: str(extraValue(src, extra, "rate_index")) || RATE_INDEXES[0],
    rate_index_rate_pct: str(extraValue(src, extra, "rate_index_rate_pct")),
    rate_margin_pct: str(extraValue(src, extra, "rate_margin_pct")),
    rate_floor_pct: str(extraValue(src, extra, "rate_floor_pct")),
    rate_cap_pct: str(extraValue(src, extra, "rate_cap_pct")),
    rate_as_of: str(extraValue(src, extra, "rate_as_of")).slice(0, 10),
    custom_rate_description: str(extraValue(src, extra, "custom_rate_description")),
    term_months: term,
    draw_period_months: str(extraValue(src, extra, "draw_period_months")),
    repayment_structure: repayment,
    payment_frequency: frequency,
    payments_per_year: str(extraValue(src, extra, "payments_per_year")),
    custom_payment_frequency: str(extraValue(src, extra, "custom_payment_frequency")),
    interest_only_months: str(extraValue(src, extra, "interest_only_months")) || (repayment === "interest_only_then_amortizing" ? "12" : ""),
    amortization_months: str(extraValue(src, extra, "amortization_months")) || term,
    repayment_config: copyRepaymentConfig(extraValue(src, extra, "repayment_config") as RepaymentConfig | null | undefined),
    periodic_payment: str(extraValue(src, extra, "periodic_payment")) || str(src.monthly_debt_service),
    lender_payment_override: Boolean(extraValue(src, extra, "lender_payment_override")) || Boolean(sheet && !sheet.debt_service_is_level_payment && !extraValue(src, extra, "repayment_config")),
    custom_payment_description: str(extraValue(src, extra, "custom_payment_description")),
    monthly_program_coverage_amount: str(extraValue(src, extra, "monthly_program_coverage_amount")) || str(src.monthly_debt_service),
    monthly_program_coverage_basis: isCoverageBasis(extraValue(src, extra, "monthly_program_coverage_basis"))
      ? extraValue(src, extra, "monthly_program_coverage_basis") as ProgramCoverageBasis
      : defaultCoverage,
    debt_service_treatment: extraValue(src, extra, "debt_service_treatment") === "refinance" ? "refinance" : "additive",
    retained_annual_debt_service: str(extraValue(src, extra, "retained_annual_debt_service")),
    ...savedLoanDates({ expected_funding_date: str(src.expected_funding_date).slice(0, 10), maturity_date: str(src.maturity_date).slice(0, 10), maturity_date_mode: str(src.maturity_date_mode) || str(extra.maturity_date_mode) || null }, maybeNumber(str(src.term_months))),
    first_payment_date: str(extraValue(src, extra, "first_payment_date")).slice(0, 10),
    activation_date: str(src.activation_date).slice(0, 10),
    commencement_date: str(src.commencement_date).slice(0, 10),
    expiration_days: str(extraValue(src, extra, "expiration_days")) || "7",
    closing_estimate_days: str(extraValue(src, extra, "closing_estimate_days")) || "5",
    use_of_funds: split,
    conditions: str(src.conditions),
    notes: str(src.notes),
    extra,
  };
}

function repaymentLabel(value: RepaymentStructure | string | null | undefined): string {
  return REPAYMENT_STRUCTURES.find((option) => option.value === value)?.label ?? (str(value).replace(/_/g, " ") || "Payment structure not recorded");
}

function frequencyLabel(value: PaymentFrequency | string | null | undefined): string {
  return PAYMENT_FREQUENCIES.find((option) => option.value === value)?.label ?? (str(value).replace(/_/g, " ") || "Monthly");
}

function sheetLine(sheet: TermSheet): string {
  const repayment = sheet.repayment_structure ?? sheet.extra?.repayment_structure;
  return `${money(sheet.approved_amount)} · ${sheet.facility_type} · ${repayment ? repaymentLabel(repayment) : `${pct(sheet.rate_pct, 2)} for ${sheet.term_months} mo`}`;
}

function toBody(form: FormState, summary: TermSheetPaymentSummary, annualRatePct: number, programCoverage: number): TermSheetBody {
  const uof: TermSheetBody["use_of_funds"] = { other_label: form.use_of_funds.other_label || null };
  let any = false;
  USE_OF_FUNDS_KEYS.forEach(([key]) => {
    const value = form.use_of_funds[key];
    if (value !== "" && value !== null && value !== undefined) { uof[key] = Number(value); any = true; }
  });
  const monthlySnapshot = roundedMoney(summary.monthly_equivalent_payment) ?? 0;
  const level = form.repayment_structure === "fully_amortizing"
    && !(maybeNumber(form.interest_only_months) ?? 0)
    && form.payment_frequency === "monthly"
    && form.rate_structure === "fixed"
    && !form.lender_payment_override
    && !form.repayment_config
    && (maybeNumber(form.amortization_months) ?? maybeNumber(form.term_months)) === maybeNumber(form.term_months);
  const structured: TermSheetStructuredFields = {
    structure_version: 1,
    repayment_config: copyRepaymentConfig(form.repayment_config),
    facility_kind: form.facility_kind,
    facility_catalog_key: form.facility_catalog_key,
    funder_type: form.funder_type || null,
    repayment_structure: form.repayment_structure === "fully_amortizing" && (maybeNumber(form.interest_only_months) ?? 0) > 0 ? "interest_only_then_amortizing" : form.repayment_structure,
    payment_frequency: form.payment_frequency,
    payments_per_year: summary.payments_per_year,
    custom_payment_frequency: form.payment_frequency === "custom" ? form.custom_payment_frequency.trim() || null : null,
    rate_structure: form.rate_structure,
    apr_pct: maybeNumber(form.apr_pct),
    rate_index: form.rate_structure === "variable" ? form.rate_index || null : null,
    rate_index_rate_pct: form.rate_structure === "variable" ? maybeNumber(form.rate_index_rate_pct) : null,
    rate_margin_pct: form.rate_structure === "variable" ? maybeNumber(form.rate_margin_pct) : null,
    rate_floor_pct: form.rate_structure === "variable" ? maybeNumber(form.rate_floor_pct) : null,
    rate_cap_pct: form.rate_structure === "variable" ? maybeNumber(form.rate_cap_pct) : null,
    rate_as_of: form.rate_structure === "variable" ? form.rate_as_of || null : null,
    custom_rate_description: form.rate_structure === "custom" || form.rate_index === "Other" ? form.custom_rate_description.trim() || null : null,
    initial_draw_amount: maybeNumber(form.initial_draw_amount),
    payment_basis_amount: summary.payment_basis_amount,
    draw_period_months: ["revolving_loc", "heloc", "hybrid"].includes(form.facility_kind) ? maybeNumber(form.draw_period_months) : null,
    interest_only_months: ["interest_only", "interest_only_then_amortizing", "revolving_interest_only"].includes(form.repayment_structure) || usesInitialIo(form.repayment_structure, form.repayment_config)
      ? (usesInitialIo(form.repayment_structure, form.repayment_config) ? maybeNumber(form.interest_only_months) : maybeNumber(form.term_months))
      : 0,
    amortization_months: ["fully_amortizing", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure)
      ? form.repayment_config ? form.repayment_config.amortization_months ?? null : maybeNumber(form.amortization_months)
      : null,
    balloon_amount: summary.balloon_amount,
    periodic_payment: summary.periodic_payment,
    post_io_payment: summary.post_io_payment,
    monthly_equivalent_payment: summary.monthly_equivalent_payment,
    monthly_program_coverage_amount: roundedMoney(programCoverage),
    monthly_program_coverage_basis: form.repayment_config ? "monthly_equivalent" : form.monthly_program_coverage_basis,
    debt_service_treatment: form.debt_service_treatment,
    retained_annual_debt_service: form.debt_service_treatment === "refinance" ? maybeNumber(form.retained_annual_debt_service) : null,
    lender_payment_override: form.lender_payment_override || form.repayment_structure === "fixed_payment" || form.repayment_structure === "custom",
    custom_payment_description: form.repayment_structure === "custom" ? form.custom_payment_description.trim() || null : null,
    first_payment_date: form.first_payment_date || null,
    expiration_days: maybeNumber(form.expiration_days),
    closing_estimate_days: maybeNumber(form.closing_estimate_days),
  };
  const extra: TermSheetExtra = {
    ...form.extra,
    ...structured,
    maturity_date_mode: form.maturity_date_mode,
    payment_summary: summary,
  };
  return {
    funding_party_kind: form.funding_party_kind,
    lender_id: form.funding_party_kind === "Lender" && form.lender_id ? form.lender_id : null,
    funding_party_name: form.funding_party_name.trim(),
    facility_type: form.facility_type.trim(),
    approved_amount: toNumber(form.approved_amount),
    min_activation_amount: toNumber(form.min_activation_amount),
    rate_pct: annualRatePct,
    term_months: Math.round(toNumber(form.term_months)),
    monthly_debt_service: monthlySnapshot,
    debt_service_is_level_payment: level,
    expected_funding_date: form.expected_funding_date || null,
    activation_date: form.activation_date || null,
    commencement_date: form.commencement_date || null,
    maturity_date: resolveLoanDates(form, toNumber(form.term_months)).maturity_date || null,
    use_of_funds: any ? uof : null,
    conditions: form.conditions.trim() || null,
    notes: form.notes.trim() || null,
    ...structured,
    extra,
  };
}

export function TermSheetDrawer({ client, profileId, open, onClose, pkg, onSaved, financialPlanDraft, inline = false }: {
  client: Pick<PackageClient, "termSheet" | "saveTermSheet" | "withdrawTermSheet">;
  profileId: string;
  open: boolean;
  onClose: () => void;
  pkg?: ProductionPackage | null;
  onSaved?: (result: TermSheetResult) => void;
  financialPlanDraft?: FinancialPlanWrite;
  inline?: boolean;
}) {
  const fileWorkspace = useFileWorkspace();
  const collateral = useTermsCollateral(profileId);
  const dealBudget = useDealBudget(profileId);
  const queryClient = useQueryClient();
  const [view, setView] = useState<"terms" | "collateral" | "budget">("terms");
  const [expanded, setExpanded] = useState(true);
  const [collateralPending, setCollateralPending] = useState(false), [budgetPending, setBudgetPending] = useState(false);
  const supportingPending = collateralPending || budgetPending;
  const viewId = useId();
  const [draftBaseVersion, setDraftBaseVersion] = useState(0);
  const draftKey = ["production-terms-draft", profileId] as const;
  const activeProfile = useRef(profileId); activeProfile.current = profileId;
  const loadRequest = useRef(0);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);
  const [state, setState] = useState<TermSheetState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const load = useCallback(async () => {
    const requestedProfile = profileId, request = ++loadRequest.current;
    if (!client.termSheet) { setLoadError("The term sheet is recorded from the desk."); return; }
    setLoadError(null);
    try {
      const next = await client.termSheet(profileId);
      if (activeProfile.current !== requestedProfile || loadRequest.current !== request) return;
      setLoadedProfileId(requestedProfile);
      setState(next);
      queryClient.setQueryDefaults(["production-terms-draft", profileId], { gcTime: Infinity });
      const kept = queryClient.getQueryData<{ form: FormState; baseVersion: number }>(["production-terms-draft", profileId]);
      setForm(kept?.form ?? formFrom(next.current, next.defaults));
      setDraftBaseVersion(kept?.baseVersion ?? next.current?.version ?? 0);
    } catch (err) {
      if (activeProfile.current === requestedProfile && loadRequest.current === request) setLoadError(errorMessage(err, "The term sheet could not be loaded."));
    }
  }, [client, profileId, queryClient]);

  useEffect(() => { if (open) { setDone(null); setErrors([]); setView("terms"); setExpanded(true); load().catch(() => undefined); } }, [open, load]);
  useEffect(() => {
    if (loadedProfileId !== profileId || !state || !form || JSON.stringify(form) === JSON.stringify(formFrom(state.current, state.defaults))) return;
    queryClient.setQueryData(["production-terms-draft", profileId], { form, baseVersion: draftBaseVersion });
  }, [state, form, profileId, loadedProfileId, draftBaseVersion, queryClient]);
  const viewScroll = useRef<Record<"terms" | "collateral" | "budget", number>>({ terms: 0, collateral: 0, budget: 0 });
  const viewAnchor = useRef<HTMLDivElement>(null);
  useEffect(() => { viewScroll.current = { terms: 0, collateral: 0, budget: 0 }; }, [profileId]);
  const changeView = (next: typeof view) => { const host = viewAnchor.current?.closest(".drawer-b"); if (host) viewScroll.current[view] = host.scrollTop; setView(next); };
  useEffect(() => { const host = viewAnchor.current?.closest(".drawer-b"); if (host) host.scrollTop = viewScroll.current[view]; }, [view]);

  const fail = (err: unknown, fallback: string) => {
    const detail = errorDetail(err);
    if (errorStatus(err) === 422 && detail?.code === "term_sheet_invalid" && Array.isArray(detail.errors)) {
      setErrors((detail.errors as unknown[]).map(String));
    } else {
      setErrors([typeof detail?.message === "string" ? detail.message : errorMessage(err, fallback)]);
    }
  };

  const current = loadedProfileId === profileId ? state?.current ?? null : null;
  const versionConflict = Boolean(loadedProfileId === profileId && state && draftBaseVersion !== (current?.version ?? 0));
  const dscrBefore = storedNumber(current?.dscr_before ?? current?.extra?.dscr_before);
  const recordedDscrAfter = storedNumber(current?.dscr_after ?? current?.extra?.dscr_after);
  const dscrStatus = current?.dscr_status ?? current?.extra?.dscr_status;
  const dscrExplanation = current?.dscr_explanation ?? current?.extra?.dscr_explanation;
  const canEdit = Boolean(loadedProfileId === profileId && state?.can_edit);
  const nextVersion = (current?.version ?? Math.max(0, ...(state?.history ?? []).map((history) => history.version))) + 1;
  const src = (key: string) => (current ? null : state?.defaults_source[key] ?? null);
  const SrcChip = ({ k }: { k: string }) => {
    if (current) return null;
    const source = src(k);
    return source ? <PChip tone="acc" title={`Prefilled: ${SOURCE_LABELS[source] ?? source}`}>{SOURCE_LABELS[source] ?? source}</PChip> : null;
  };
  const upd = (patch: Partial<FormState>) => setForm((value) => {
    if (!value) return value;
    const next = { ...value, ...patch };
    return { ...next, ...resolveLoanDates(next, maybeNumber(next.term_months)) };
  });

  const approved = form ? toNumber(form.approved_amount) : 0;
  const initialDraw = form ? maybeNumber(form.initial_draw_amount) : null;
  const explicitBasis = form ? maybeNumber(form.payment_basis_amount) : null;
  const independentlyLimitedKind = Boolean(form && ["revolving_loc", "heloc", "hybrid"].includes(form.facility_kind));
  const independentDraw = Boolean((initialDraw != null && Math.abs(initialDraw - approved) > 0.005) || (explicitBasis != null && Math.abs(explicitBasis - approved) > 0.005) || independentlyLimitedKind && (initialDraw != null || explicitBasis != null));
  const fundedPrincipal = independentDraw ? explicitBasis ?? initialDraw ?? approved : approved;
  const partialNeedsReview = independentDraw && (!independentlyLimitedKind || Boolean(form?.lender_payment_override) || ["fixed_payment", "custom"].includes(form?.repayment_structure ?? "") || explicitBasis != null && initialDraw != null && Math.abs(explicitBasis - initialDraw) > 0.005);
  const revolvingFacility = Boolean(form && (form.facility_kind === "revolving_loc" || form.facility_kind === "heloc"));
  const isRevolving = Boolean(form && (revolvingFacility || form.repayment_structure === "revolving_interest_only"));
  const usesPaymentBasis = Boolean(form && (isRevolving || ["interest_only", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure)));
  const paymentBasis = independentDraw ? fundedPrincipal : form ? ((usesPaymentBasis ? maybeNumber(form.payment_basis_amount) : null) ?? (isRevolving ? initialDraw : null) ?? approved) : 0;
  const annualRate = form ? effectiveAnnualRate({
    structure: form.rate_structure,
    fixedOrCustomRatePct: toNumber(form.rate_pct),
    indexRatePct: maybeNumber(form.rate_index_rate_pct),
    marginPct: maybeNumber(form.rate_margin_pct),
    floorPct: maybeNumber(form.rate_floor_pct),
    capPct: maybeNumber(form.rate_cap_pct),
  }) : 0;
  const editorLoan = loadedProfileId === profileId && form ? { amount: fundedPrincipal, rate_pct: annualRate, term_months: toNumber(form.term_months), structure: ["interest_only", "revolving_interest_only"].includes(form.repayment_structure) ? "interest_only" : form.repayment_structure === "simple_interest" ? "simple_interest" : "amortizing", interest_only_months: usesInitialIo(form.repayment_structure, form.repayment_config) ? maybeNumber(form.interest_only_months) : 0, repayment_config: form.repayment_config ?? (maybeNumber(form.amortization_months) != null ? { amortization_months: maybeNumber(form.amortization_months)! } : null), payments_per_year: periodsPerYear(form.payment_frequency, maybeNumber(form.payments_per_year)) } : null;
  const editorPlan = dealBudgetPlan(financialPlanDraft ?? dealBudget.data?.financial_plan, editorLoan);
  const costPreview = useDealBudgetPreview(profileId, { enabled: open && loadedProfileId === profileId, loan: editorLoan, financialPlan: editorPlan });
  const principalCalculation = costPreview.isError ? undefined : costPreview.data?.calculation;
  const budgetDirty = Boolean(dealBudget.data && costPreview.value && dealBudgetChanged(costPreview.value, dealBudget.data));
  const principalPending = costPreview.pending || costPreview.isFetching || dealBudget.isPending;
  const principalMismatch = hasPrincipalBudgetMismatch(principalCalculation, fundedPrincipal);
  const principalSolution = principalCalculation?.principal_solution as { status?: string; gross_loan_amount?: number } | undefined;
  const principalUnresolved = costPreview.isError || Boolean(principalSolution && principalSolution.status !== "calculated");
  const calculatedGross = typeof principalSolution?.gross_loan_amount === "number" ? principalSolution.gross_loan_amount : null;
  const partialLimitExceeded = independentDraw && calculatedGross != null && calculatedGross > approved + 0.005;
  const principalBlocked = principalPending || principalMismatch || principalUnresolved || partialNeedsReview || partialLimitExceeded;
  const principalError = errors.some(isPrincipalBudgetError);
  const visibleErrors = errors.filter(error => !isPrincipalBudgetError(error));
  const applyCalculatedPrincipal = (amount: number) => {
    if (partialNeedsReview || independentDraw && amount > approved + 0.005) return;
    upd(independentDraw ? { payment_basis_amount: String(amount), initial_draw_amount: String(amount) } : { approved_amount: String(amount) });
    setErrors(previous => previous.filter(error => !isPrincipalBudgetError(error)));
    setDone(null);
  };
  const reviewPrincipalBudget = () => {
    changeView("budget");
    requestAnimationFrame(() => document.getElementById(`${viewId}-budget-panel`)?.querySelector<HTMLElement>('[aria-label="Loan amount basis"]')?.focus());
  };
  useAutomaticFinancedPrincipal(costPreview, fundedPrincipal, applyCalculatedPrincipal, canEdit && !busy && !supportingPending && !partialNeedsReview && !partialLimitExceeded);
  const targetNetMode = costPreview.value?.loan_amount_mode === "target_net";
  const enteredAmount = targetNetMode ? costPreview.value?.target_net_amount ?? null : fundedPrincipal;
  const changeEnteredAmount = (raw: string) => {
    if (targetNetMode) costPreview.updateBudget({ target_net_amount: maybeNumber(raw) });
    else upd(independentDraw ? { payment_basis_amount: raw, initial_draw_amount: raw } : { approved_amount: raw });
  };
  const summary = useMemo(() => form ? computePaymentSummary({
    amount: approved,
    termMonths: toNumber(form.term_months),
    annualRatePct: annualRate,
    repaymentStructure: form.repayment_structure,
    paymentFrequency: form.payment_frequency,
    paymentsPerYear: maybeNumber(form.payments_per_year),
    paymentBasisAmount: paymentBasis,
    interestOnlyMonths: maybeNumber(form.interest_only_months),
    amortizationMonths: maybeNumber(form.amortization_months),
    repaymentConfig: form.repayment_config,
    periodicPaymentOverride: form.lender_payment_override || form.repayment_structure === "fixed_payment" || form.repayment_structure === "custom" ? maybeNumber(form.periodic_payment) : null,
  }) : null, [annualRate, approved, form, paymentBasis]);
  // The period-by-period schedule, on the same engine as the Financials tab and the client terms, for the
  // structures it can express: amortizing over the term, interest-only months then amortizing over the rest,
  // or interest-only to maturity. A separate amortization period (a balloon) or a lender-stated payment has
  // no schedule to show.
  const schedule = useMemo(() => {
    if (!form || form.lender_payment_override) return null;
    const term = toNumber(form.term_months);
    const io = maybeNumber(form.interest_only_months) ?? 0;
    const amortization = maybeNumber(form.amortization_months);
    const structure = ["fully_amortizing", "balloon", "simple_interest"].includes(form.repayment_structure) && (form.repayment_config || amortization == null || amortization === term) ? "amortizing"
      : form.repayment_structure === "interest_only_then_amortizing" && (form.repayment_config || amortization == null || amortization === term - io) ? "amortizing"
      : ["interest_only", "revolving_interest_only"].includes(form.repayment_structure) ? "interest_only" : null;
    if (!structure) return null;
    const engineStructure = form.repayment_structure === "simple_interest" ? "simple_interest" : structure;
    return repaymentPreview(paymentBasis || approved, annualRate, term, { structure: engineStructure, interestOnlyMonths: usesInitialIo(form.repayment_structure, form.repayment_config) ? io : 0, periodsPerYear: periodsPerYear(form.payment_frequency, maybeNumber(form.payments_per_year)) ?? 12, repaymentConfig: form.repayment_config }).schedule;
  }, [annualRate, approved, form, paymentBasis]);

  const programCoverage = useMemo(() => {
    if (!form || !summary) return 0;
    if (form.repayment_config) return summary.coverage_monthly_equivalent_payment ?? defaultProgramCoverage(summary) ?? 0;
    const fullLimitInterest = approved * annualRate / 100 / 12;
    const drawInterest = (initialDraw ?? paymentBasis) * annualRate / 100 / 12;
    switch (form.monthly_program_coverage_basis) {
      case "post_io_payment": return summary.post_io_monthly_equivalent ?? defaultProgramCoverage(summary) ?? 0;
      case "full_limit_interest": return fullLimitInterest || defaultProgramCoverage(summary) || 0;
      case "initial_draw_interest": return drawInterest || summary.monthly_equivalent_payment || 0;
      case "underwriting_budget":
      case "manual": return maybeNumber(form.monthly_program_coverage_amount) ?? 0;
      default: return summary.monthly_equivalent_payment ?? 0;
    }
  }, [annualRate, approved, form, initialDraw, paymentBasis, summary]);

  const validationErrors = useMemo(() => {
    if (!form || !summary) return [] as string[];
    const issues: string[] = [];
    const advanced = repaymentPreview(paymentBasis || approved, annualRate, toNumber(form.term_months), { structure: ["interest_only", "revolving_interest_only"].includes(form.repayment_structure) ? "interest_only" : form.repayment_structure === "simple_interest" ? "simple_interest" : "amortizing", interestOnlyMonths: usesInitialIo(form.repayment_structure, form.repayment_config) ? maybeNumber(form.interest_only_months) : 0, periodsPerYear: periodsPerYear(form.payment_frequency, maybeNumber(form.payments_per_year)) ?? 0, repaymentConfig: form.repayment_config });
    if (form.repayment_config && (form.lender_payment_override || ["fixed_payment", "custom"].includes(form.repayment_structure))) issues.push("Advanced repayment cannot be combined with a lender-stated or custom payment override. Reset advanced repayment or use a calculated structure.");
    if (advanced.error) issues.push(advanced.error);
    if (form.repayment_structure === "simple_interest" && !form.repayment_config) issues.push("Simple interest requires advanced repayment. Set the amortization or a scheduled principal payment.");
    const amount = toNumber(form.approved_amount);
    const minimum = toNumber(form.min_activation_amount);
    const term = toNumber(form.term_months);
    const draw = maybeNumber(form.initial_draw_amount);
    const basis = paymentBasis;
    const io = maybeNumber(form.interest_only_months);
    const amortization = maybeNumber(form.amortization_months);
    const floor = maybeNumber(form.rate_floor_pct);
    const cap = maybeNumber(form.rate_cap_pct);
    const apr = maybeNumber(form.apr_pct);
    if (!form.funding_party_name.trim()) issues.push("Name the funding party.");
    if (!form.funder_type) issues.push("Choose the funder type.");
    if (!form.facility_type.trim()) issues.push("Choose a product or enter the custom product name.");
    if (amount <= 0) issues.push(`${isRevolving ? "Credit limit" : "Approved amount"} must be above zero.`);
    if (minimum <= 0) issues.push("Minimum activation amount must be above zero.");
    if (amount > 0 && minimum > amount) issues.push("Minimum activation amount cannot exceed the approved amount or credit limit.");
    if (term <= 0) issues.push("Facility term must be at least one month.");
    if (draw !== null && (draw < 0 || draw > amount)) issues.push("Initial draw cannot exceed the credit limit.");
    if (basis > amount && amount > 0) issues.push("The payment-estimate balance cannot exceed the approved amount or credit limit.");
    if (form.rate_structure === "variable") {
      if (!form.rate_index.trim()) issues.push("Choose the variable-rate index.");
      if (maybeNumber(form.rate_index_rate_pct) === null) issues.push("Enter the current index rate.");
      if (maybeNumber(form.rate_margin_pct) === null) issues.push("Enter the lender margin.");
      if (!form.rate_as_of) issues.push("Enter the date of the variable-rate snapshot.");
      if (floor !== null && cap !== null && floor > cap) issues.push("The rate floor cannot exceed the cap.");
    }
    if (form.rate_structure === "custom" && !form.custom_rate_description.trim()) issues.push("Describe the custom pricing.");
    if (apr !== null && (apr < 0 || apr > 100)) issues.push("APR must be between 0% and 100%.");
    if (form.payment_frequency === "custom" && (!(maybeNumber(form.payments_per_year) && toNumber(form.payments_per_year) > 0) || !form.custom_payment_frequency.trim())) issues.push("Describe the custom cadence and enter payments per year.");
    if (form.repayment_structure === "interest_only_then_amortizing" && (!io || io >= term)) issues.push("Interest-only months must be above zero and shorter than the facility term.");
    if (!form.repayment_config && ["fully_amortizing", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure) && (!amortization || amortization <= 0)) issues.push("Enter the amortization period.");
    if (!form.repayment_config && form.repayment_structure === "interest_only_then_amortizing" && io && amortization && amortization < term - io) issues.push("The amortization period cannot be shorter than the remaining term after the interest-only phase.");
    if (!form.repayment_config && form.repayment_structure === "fully_amortizing" && amortization && amortization !== term) issues.push("Principal-and-interest terms must amortize over the facility term. Choose amortizing + balloon for a longer schedule.");
    if (!form.repayment_config && form.repayment_structure === "balloon" && amortization && amortization <= term) issues.push("Balloon structures need an amortization period longer than the facility term.");
    if (isRevolving && maybeNumber(form.draw_period_months) !== null && toNumber(form.draw_period_months) > term) issues.push("The draw period cannot exceed the facility term.");
    if (form.repayment_structure === "custom" && !form.custom_payment_description.trim()) issues.push("Describe the custom payment schedule.");
    if (!summary.monthly_equivalent_payment || summary.monthly_equivalent_payment <= 0) issues.push("Enter terms that produce a positive lender payment, or use the lender-stated payment override.");
    if (!programCoverage || programCoverage <= 0) issues.push("Enter a positive monthly program coverage amount.");
    if (form.debt_service_treatment === "refinance" && maybeNumber(form.retained_annual_debt_service) === null) issues.push("Enter annual debt service that remains after payoff; use 0 when all existing debt is replaced.");
    if (toNumber(form.expiration_days) <= 0) issues.push("Term validity must be at least one day.");
    if (toNumber(form.closing_estimate_days) < 0) issues.push("Closing estimate cannot be negative.");
    const dateIssue = loanDateProblem(form, maybeNumber(form.term_months));
    if (dateIssue) issues.push(dateIssue);
    if (form.expected_funding_date && form.activation_date && form.activation_date < form.expected_funding_date) issues.push("Program activation cannot be before expected funding or opening.");
    if (form.expected_funding_date && form.commencement_date && form.commencement_date < form.expected_funding_date) issues.push("Production commencement cannot be before expected funding or opening.");
    if (form.expected_funding_date && form.first_payment_date && form.first_payment_date < form.expected_funding_date) issues.push("The first payment cannot be before expected funding or opening.");
    if (form.activation_date && form.commencement_date && form.activation_date > form.commencement_date) issues.push("Program activation cannot be after production commencement.");
    if (form.maturity_date && form.expected_funding_date && form.maturity_date <= form.expected_funding_date) issues.push("Maturity must be after expected funding or opening.");
    if (form.maturity_date && form.activation_date && form.maturity_date <= form.activation_date) issues.push("Maturity must be after program activation.");
    if (form.maturity_date && form.commencement_date && form.maturity_date <= form.commencement_date) issues.push("Maturity must be after production commencement.");
    if (form.maturity_date && form.first_payment_date && form.first_payment_date > form.maturity_date) issues.push("The first payment cannot be after maturity.");
    return issues;
  }, [annualRate, approved, form, isRevolving, paymentBasis, programCoverage, summary]);

  const saveAttempt = useRef<{ signature: string; intent: string; payload: TermSheetBody } | null>(null);
  const retryableSave = Boolean(errors.length && saveAttempt.current && saveAttempt.current.intent === termsSaveIntent(form, editorPlan, costPreview.value));
  const pageDirty = Boolean(form && state && JSON.stringify(form) !== JSON.stringify(formFrom(state.current, state.defaults)));
  useEffect(() => { if (!inline) return; const warn = (event: BeforeUnloadEvent) => { if (pageDirty || busy || supportingPending) { event.preventDefault(); event.returnValue = ""; } }; window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn); }, [inline, pageDirty, busy, supportingPending]);
  const save = async (retry = false) => {
    if (loadedProfileId !== profileId || !form || !summary || !client.saveTermSheet || validationErrors.length || supportingPending || !retry && (versionConflict || principalBlocked) || retry && !retryableSave) return;
    setBusy("save"); setErrors([]); setDone(null);
    try {
      const submittedBudget = costPreview.value ?? undefined;
      const signature = JSON.stringify({ profileId, form, version: draftBaseVersion, plan: editorPlan, budget: submittedBudget });
      let payload = retry || saveAttempt.current?.signature === signature ? saveAttempt.current?.payload ?? null : null;
      if (!payload) {
        const expectedCollateralRevision = await collateral.verifyRevision();
        payload = { ...toBody(form, summary, annualRate, programCoverage), expected_version: draftBaseVersion, expected_collateral_revision: expectedCollateralRevision,
          ...(submittedBudget ? { deal_budget: submittedBudget, expected_deal_budget_revision: submittedBudget.expected_revision, idempotency_key: crypto.randomUUID(), financial_plan: editorPlan ?? undefined, expected_plan_updated_at: editorPlan?.expected_updated_at ?? null } : { expected_deal_budget_revision: await dealBudget.verifyRevision() }) };
        saveAttempt.current = { signature, intent: termsSaveIntent(form, editorPlan, submittedBudget), payload };
      }
      const result = await client.saveTermSheet(profileId, payload);
      const frozenBudget = result.state.current?.extra?.deal_budget_snapshot as Partial<DealBudget> | undefined;
      const frozenRevision = result.state.current?.extra?.deal_budget_revision;
      acknowledgeTermsBudget(queryClient, profileId, payload.deal_budget, result.deal_budget ?? frozenBudget, result.deal_budget?.revision ?? (typeof frozenRevision === "number" ? frozenRevision : undefined), result.deal_budget?.calculation ?? costPreview.data?.calculation, result.financial_plan);
      if (result.financial_plan) { queryClient.setQueryData(["financial-plan", profileId], result.financial_plan); queryClient.setQueryData(["financial-plan-applied", profileId], result.financial_plan); }
      saveAttempt.current = null;
      void queryClient.invalidateQueries({ queryKey: ["file-deal-budget", profileId] });
      if (activeProfile.current !== profileId) { queryClient.removeQueries({ queryKey: draftKey }); return; }
      setState(result.state);
      setForm(formFrom(result.state.current, result.state.defaults));
      setDraftBaseVersion(result.state.current?.version ?? 0); queryClient.removeQueries({ queryKey: draftKey });
      const version = result.state.current?.version;
      setDone(`Term sheet v${version ?? ""} recorded.${result.final ? " The draft final was re-applied with these terms." : ""}`);
      fileWorkspace?.saved();
      onSaved?.(result);
    } catch (err) {
      fail(err, "The term sheet could not be recorded.");
      if (isPrincipalBudgetError(errorMessage(err, ""))) {
        void dealBudget.refetch();
        void costPreview.refetch();
      }
      if (errorStatus(err) === 409) void load();
    } finally { setBusy(null); }
  };

  const withdraw = async () => {
    if (!client.withdrawTermSheet) return;
    setBusy("withdraw"); setErrors([]); setDone(null);
    try {
      const next = await client.withdrawTermSheet(profileId, withdrawReason.trim());
      if (activeProfile.current !== profileId) { queryClient.removeQueries({ queryKey: draftKey }); return; }
      setState(next);
      setForm(formFrom(next.current, next.defaults));
      setDraftBaseVersion(next.current?.version ?? 0); queryClient.removeQueries({ queryKey: draftKey });
      setWithdrawAsk(false); setWithdrawReason("");
      setDone("Term sheet withdrawn.");
    } catch (err) {
      fail(err, "The term sheet could not be withdrawn.");
    } finally { setBusy(null); }
  };

  const kindChanged = (kind: FundingPartyKind) => {
    if (!form) return;
    const lender = state?.lenders.find((option) => option.id === form.lender_id);
    const name = kind === "Qualified Commercial LLC" ? "Qualified Commercial LLC" : kind === "Sponsor" ? (pkg?.sponsor?.name ?? "") : (lender?.name ?? "");
    const funderType: FunderType | "" = kind === "Qualified Commercial LLC" ? "nonbank_lender" : kind === "Sponsor" ? "sponsor" : "";
    upd({ funding_party_kind: kind, funding_party_name: name || form.funding_party_name, funder_type: funderType });
  };

  const facilityChanged = (key: string) => {
    if (!form) return;
    const option = FACILITY_CATALOG.find((item) => item.key === key);
    if (option) {
      const wasRevolving = form.facility_kind === "revolving_loc" || form.facility_kind === "heloc" || form.repayment_structure === "revolving_interest_only";
      const nextRevolving = option.kind === "revolving_loc" || option.kind === "heloc" || option.repayment === "revolving_interest_only";
      const term = Math.max(1, toNumber(form.term_months));
      const existingAmortization = maybeNumber(form.amortization_months);
      const nextInterestOnlyMonths = option.repayment === "interest_only_then_amortizing"
        ? str(Math.max(1, Math.min(maybeNumber(form.interest_only_months) ?? 12, Math.max(1, term - 1))))
        : "";
      const remainingTerm = Math.max(1, term - Number(nextInterestOnlyMonths || 0));
      const nextAmortizationMonths = option.repayment === "fully_amortizing"
        ? str(term)
        : option.repayment === "balloon"
          ? str(existingAmortization && existingAmortization > term ? existingAmortization : Math.max(term + 12, 120))
          : option.repayment === "interest_only_then_amortizing"
            ? str(Math.max(existingAmortization ?? 0, remainingTerm))
            : "";
      upd({
        facility_catalog_key: option.key,
        facility_kind: option.kind,
        facility_type: option.key === "other" ? "" : option.label,
        repayment_structure: option.repayment,
        rate_structure: option.kind === "revolving_loc" || option.kind === "heloc" ? "variable" : form.rate_structure,
        monthly_program_coverage_basis: defaultCoverageBasis(option.repayment, option.kind),
        lender_payment_override: option.repayment === "custom",
        initial_draw_amount: nextRevolving && wasRevolving ? form.initial_draw_amount : "",
        payment_basis_amount: nextRevolving && wasRevolving ? form.payment_basis_amount : "",
        draw_period_months: nextRevolving ? (wasRevolving ? form.draw_period_months : form.term_months) : "",
        interest_only_months: nextInterestOnlyMonths,
        amortization_months: nextAmortizationMonths,
      });
      return;
    }
    if (key.startsWith("configured:")) {
      const label = key.slice("configured:".length);
      const kind = inferredFacilityKind(label);
      const nextRevolving = kind === "revolving_loc" || kind === "heloc";
      upd({
        facility_catalog_key: key,
        facility_kind: kind,
        facility_type: label,
        monthly_program_coverage_basis: defaultCoverageBasis(form.repayment_structure, kind),
        initial_draw_amount: nextRevolving ? form.initial_draw_amount : "",
        payment_basis_amount: nextRevolving ? form.payment_basis_amount : "",
        draw_period_months: nextRevolving ? form.draw_period_months : "",
      });
    }
  };

  const repaymentChanged = (repayment: RepaymentStructure) => {
    if (!form) return;
    const term = Math.max(1, toNumber(form.term_months));
    const existingAmortization = maybeNumber(form.amortization_months);
    const nextRevolving = revolvingFacility || repayment === "revolving_interest_only";
    const nextUsesPaymentBasis = nextRevolving || ["interest_only", "interest_only_then_amortizing", "balloon"].includes(repayment);
    const nextInterestOnlyMonths = repayment === "interest_only_then_amortizing"
      ? str(Math.max(1, Math.min(maybeNumber(form.interest_only_months) ?? 12, Math.max(1, term - 1))))
      : form.repayment_config && ["fully_amortizing", "balloon", "simple_interest"].includes(repayment) ? form.interest_only_months : "";
    const remainingTerm = Math.max(1, term - Number(nextInterestOnlyMonths || 0));
    const nextAmortizationMonths = repayment === "fully_amortizing"
      ? str(term)
      : repayment === "balloon"
        ? str(existingAmortization && existingAmortization > term ? existingAmortization : Math.max(term + 12, 120))
        : repayment === "interest_only_then_amortizing"
          ? str(Math.max(existingAmortization ?? 0, remainingTerm))
          : "";
    upd({
      repayment_structure: repayment,
      lender_payment_override: repayment === "fixed_payment" || repayment === "custom",
      monthly_program_coverage_basis: defaultCoverageBasis(repayment, form.facility_kind),
      initial_draw_amount: nextRevolving ? form.initial_draw_amount : "",
      payment_basis_amount: nextUsesPaymentBasis ? form.payment_basis_amount : "",
      draw_period_months: nextRevolving ? form.draw_period_months : "",
      interest_only_months: nextInterestOnlyMonths,
      amortization_months: nextAmortizationMonths,
    });
  };

  const configuredFacilities = (state?.facility_types ?? []).filter((label) => !FACILITY_CATALOG.some((option) => option.label === label));
  const catalogGroups = Array.from(new Set(FACILITY_CATALOG.map((option) => option.group)));
  const uofNote = str(state?.defaults.use_of_funds_note);
  const uofAgainst = isRevolving ? initialDraw ?? approved : approved;
  const consumedByThis = Boolean(pkg && current && current.consumed_by_package_id === pkg.id);
  const manualCoverage = form?.monthly_program_coverage_basis === "manual" || form?.monthly_program_coverage_basis === "underwriting_budget";
  const manualPayment = Boolean(form && (form.lender_payment_override || form.repayment_structure === "fixed_payment" || form.repayment_structure === "custom"));
  const showAmortization = Boolean(form && ["fully_amortizing", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure));
  const showPaymentBasis = Boolean(form && (["interest_only", "interest_only_then_amortizing", "balloon", "revolving_interest_only"].includes(form.repayment_structure) || isRevolving));

  return (
    <FinancialEditorSurface inline={inline} open={open} fullscreen={expanded} headerActions={inline ? undefined : <PBtn size="sm" onClick={() => setExpanded(value => !value)}>{expanded ? "Restore" : "Expand"}</PBtn>} onClose={() => { if (!busy && !supportingPending) onClose(); }} title={current ? `Term sheet · v${current.version}` : "Record the term sheet"} width="xl" bodyClass="pp-root" closeOnBackdrop={false} ariaLabel="Production loan terms">
      <div ref={viewAnchor} />
      <SavedTermsDownload profileId={profileId} kind="production_term_sheet" version={loadedProfileId === profileId ? current?.version : 0} disabled={Boolean(busy) || supportingPending} onDealerTermsRefreshed={setState} />
      <nav className={workspaceStyles.tabs} role="tablist" aria-label="Production financing workspace sections" onKeyDown={event => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        event.preventDefault(); const views = ["terms", "collateral", "budget"] as const;
        const next = event.key === "Home" ? views[0] : event.key === "End" ? views[2] : views[(views.indexOf(view) + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length];
        changeView(next); document.getElementById(`${viewId}-${next}-tab`)?.focus();
      }}>
        {([['terms','Loan terms'],['collateral','Collateral'],['budget','Investment & closing costs']] as const).map(([key,label]) => <button type="button" key={key} role="tab" id={`${viewId}-${key}-tab`} aria-selected={view === key} aria-controls={`${viewId}-${key}-panel`} tabIndex={view === key ? 0 : -1} onClick={() => changeView(key)}>{label}</button>)}
      </nav>
      {retryableSave ? <Callout tone="warn">The save result is not confirmed. Retry the identical save to check its recorded version without creating another.<PBtn onClick={() => void save(true)} disabled={Boolean(busy) || supportingPending}>Retry this save</PBtn></Callout> : null}
      {partialNeedsReview || partialLimitExceeded ? <Callout tone="warn"><section aria-label="Independent facility draw review"><strong>Review the independently approved facility</strong><p>The approved limit remains {money(approved, 2)}. {partialNeedsReview ? "The funded draw and payment-estimate balance must agree, and automatic fee funding requires a rate-based line, HELOC or hybrid facility. Resolve the draw or repayment structure before saving." : "The total funded draw including fees exceeds that limit. Revise the client net target or explicitly review the approved limit before saving."}</p></section></Callout> : null}
      <PrincipalBudgetNotice automatic calculation={principalCalculation} currentAmount={fundedPrincipal} pending={principalPending} budgetDirty={budgetDirty} canApply={canEdit && !busy && !supportingPending && !principalUnresolved && !partialNeedsReview && !partialLimitExceeded} onApply={applyCalculatedPrincipal} onReview={reviewPrincipalBudget} fallback={principalError || principalUnresolved} />
      {versionConflict ? <Callout tone="warn">A newer terms version is available. Your working loan was preserved.<PBtn onClick={() => { queryClient.removeQueries({ queryKey: draftKey }); void load(); }}>Discard draft and load current terms</PBtn></Callout> : null}
      <div role="tabpanel" id={`${viewId}-terms-panel`} aria-labelledby={`${viewId}-terms-tab`} hidden={view !== "terms"}>
      {loadError ? <div className="pp-notice t-warn"><span>{loadError}</span><PBtn size="sm" onClick={() => load()}>Try again</PBtn></div> : null}
      {loadedProfileId !== profileId || !state || !form || !summary ? (!loadError ? <p className="pp-sub">Loading…</p> : null) : (
        <div className="pp-ts-form">
          <p className="pp-sub">
            Choose the approved product, rate and repayment schedule. We calculate the lender payment and its monthly equivalent; if the dealer program uses a different monthly coverage amount, record it separately below.
          </p>
          {current && collateral.data?.revision != null && storedNumber(current.extra?.collateral_revision) !== collateral.data.revision ? <Callout tone="warn">The current collateral differs from this saved term sheet. Review its properties and assets, then record a new version to include them in the terms PDF.</Callout> : null}

          {current && dealBudget.data?.revision != null && storedNumber(current.extra?.deal_budget_revision) !== dealBudget.data.revision ? <Callout tone="warn">The funding or cost budget has changed. The existing terms PDF retains its recorded budget; record a new terms version after reviewing the current costs.</Callout> : null}
          {current ? (
            <div className="pp-row">
              <PChip tone="ok">Current · v{current.version}</PChip>
              <span className="pp-sub">{sheetLine(current)} · recorded by {current.entered_by_name ?? "the desk"} {whenLabel(current.entered_at)}</span>
              {current.consumed_by_package_id ? <PChip tone="gold" title={consumedByThis ? "This final was drafted from it" : undefined}>Used by the final</PChip> : null}
            </div>
          ) : <Callout tone="mut">No term sheet on this file yet. Prefilled figures are starting points; confirm the product and repayment structure before recording.</Callout>}
          {current ? (
            <div className={`pp-ts-dscr${dscrStatus === "ready" ? " ready" : ""}`}>
              <div><span>DSCR before</span><b>{dscrBefore == null ? "—" : `${dscrBefore.toFixed(2)}×`}</b></div>
              <div><span>DSCR with these terms</span><b>{costPreview.pending || costPreview.isError ? "Calculating…" : costPreview.data?.financial_plan_evaluation ? costPreview.data.financial_plan_evaluation.headline_after?.toFixed(2) ?? "—" : recordedDscrAfter == null ? "—" : `${recordedDscrAfter.toFixed(2)}×`}</b></div>
              <p>{typeof dscrExplanation === "string" && dscrExplanation ? dscrExplanation : "Add the required cash-flow and existing-debt evidence to calculate before-and-after DSCR."}</p>
            </div>
          ) : null}

          {!canEdit ? (
            <>
              <Callout tone="mut">Only a super admin or underwriter records loan terms. Shown as recorded.</Callout>
              {current ? (
                <div className="pp-grid">
                  <KV label="Funding party" value={`${current.funding_party_kind} · ${current.funding_party_name}`} />
                  <KV label="Product" value={current.facility_type} />
                  <KV label={(current.facility_kind ?? current.extra?.facility_kind) === "revolving_loc" || (current.facility_kind ?? current.extra?.facility_kind) === "heloc" ? "Credit limit" : "Approved amount"} value={money(current.approved_amount)} />
                  {(current.initial_draw_amount ?? current.extra?.initial_draw_amount) != null ? <KV label="Initial draw" value={money(Number(current.initial_draw_amount ?? current.extra?.initial_draw_amount))} /> : null}
                  <KV label="Rate" value={`${pct(current.rate_pct, 2)}${(current.rate_structure ?? current.extra?.rate_structure) === "variable" ? " current all-in" : ""}`} />
                  <KV label="Repayment" value={`${repaymentLabel(current.repayment_structure ?? current.extra?.repayment_structure)} · ${frequencyLabel(current.payment_frequency ?? current.extra?.payment_frequency)}`} />
                  <KV label="Monthly-equivalent payment" value={money(Number(current.monthly_equivalent_payment ?? current.extra?.monthly_equivalent_payment ?? current.monthly_debt_service), 2)} />
                  {(current.post_io_payment ?? current.extra?.post_io_payment) != null ? <KV label="Post-IO payment" value={money(Number(current.post_io_payment ?? current.extra?.post_io_payment), 2)} /> : null}
                  {(current.balloon_amount ?? current.extra?.balloon_amount) != null ? <KV label="Estimated balloon" value={money(Number(current.balloon_amount ?? current.extra?.balloon_amount), 2)} /> : null}
                  <KV label="Term" value={`${current.term_months} months`} />
                  <KV label="Expected funding" value={dateLabel(current.expected_funding_date)} />
                  <KV label="Maturity" value={dateLabel(current.maturity_date)} />
                  {current.conditions ? <KV label="Conditions" value={current.conditions} /> : null}
                  {current.notes ? <KV label="Internal notes" value={current.notes} /> : null}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <section className="pp-ts-section">
                <div className="pp-ts-section-head"><span>1</span><div><h4>Funding source</h4><p>Who is providing the capital and how that source is classified.</p></div></div>
                <div className="pp-row">
                  <Picks options={(state.funding_party_kinds.length ? state.funding_party_kinds : [...FUNDING_PARTIES]).filter(isKind).map((value) => [value, value] as [FundingPartyKind, string])} value={form.funding_party_kind} onChange={kindChanged} />
                  <SrcChip k="funding_party_kind" />
                </div>
                <div className="pp-grid">
                  {form.funding_party_kind === "Lender" ? (
                    <label className="pp-field"><span className="pp-lbl">Lender</span>
                      <select className="pp-input" value={form.lender_id} onChange={(event) => { const lender = state.lenders.find((option) => option.id === event.target.value); upd({ lender_id: event.target.value, funding_party_name: lender ? lender.name : form.funding_party_name }); }}>
                        <option value="">Choose a lender…</option>
                        {state.lenders.map((lender) => <option key={lender.id} value={lender.id}>{lender.name}</option>)}
                      </select>
                      {!state.lenders.length ? <span className="pp-hint">No active lenders — name the funding party by hand.</span> : null}
                    </label>
                  ) : null}
                  <label className="pp-field"><span className="pp-lbl">Funder type</span>
                    <select className="pp-input" value={form.funder_type} onChange={(event) => upd({ funder_type: event.target.value as FunderType | "" })}>
                      <option value="">Choose a type…</option>
                      {FUNDER_TYPES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                  <label className={`pp-field${form.funding_party_kind === "Lender" ? "" : " span-2"}`}><span className="pp-lbl">Funding party legal name</span>
                    <input className="pp-input" value={form.funding_party_name} onChange={(event) => upd({ funding_party_name: event.target.value })} placeholder="As it prints on Schedule 1 and the certificate" />
                  </label>
                </div>
              </section>

              <section className="pp-ts-section">
                <div className="pp-ts-section-head"><span>2</span><div><h4>Product and availability</h4><p>Choose the commercial product first; the drawer reveals the terms that product needs.</p></div></div>
                <div className="pp-grid">
                  <label className="pp-field span-2"><span className="pp-lbl">Commercial product <SrcChip k="facility_type" /></span>
                    <select className="pp-input" value={form.facility_catalog_key} onChange={(event) => facilityChanged(event.target.value)}>
                      {catalogGroups.map((group) => <optgroup key={group} label={group}>{FACILITY_CATALOG.filter((option) => option.group === group).map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</optgroup>)}
                      {configuredFacilities.length ? <optgroup label="Configured products">{configuredFacilities.map((label) => <option key={label} value={`configured:${label}`}>{label}</option>)}</optgroup> : null}
                    </select>
                  </label>
                  <div className="pp-field"><span className="pp-lbl">Facility family</span><div className="pp-static">{form.facility_kind.replace(/_/g, " ")}</div></div>
                  {form.facility_catalog_key === "other" ? <label className="pp-field span-3"><span className="pp-lbl">Custom product name</span><input className="pp-input" value={form.facility_type} onChange={(event) => upd({ facility_type: event.target.value })} placeholder="Describe the facility as it should print" /></label> : null}
                  {independentDraw ? <label className="pp-field"><span className="pp-lbl">Independently approved facility limit</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" aria-label="Approved facility limit" inputMode="decimal" value={form.approved_amount} onChange={event => upd({ approved_amount: decimal(event.target.value) })} /></span></label> : null}
                  <label className="pp-field"><span className="pp-lbl">{targetNetMode ? "Net to client at funding" : independentDraw ? "Funded draw amount" : isRevolving ? "Credit limit" : "Total loan amount"} <SrcChip k="approved_amount" /></span>
                    <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" aria-label={targetNetMode ? "Net to client" : "Total loan amount"} value={enteredAmount == null ? "" : String(enteredAmount)} onChange={(event) => changeEnteredAmount(decimal(event.target.value))} /></span>{targetNetMode ? <small>Total loan including fees: {principalPending ? "Calculating…" : money(fundedPrincipal, 2)}</small> : null}</label>
                  <label className="pp-field"><span className="pp-lbl">{isRevolving ? "Minimum initial draw / activation" : "Minimum activation amount"} <SrcChip k="min_activation_amount" /></span>
                    <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.min_activation_amount} onChange={(event) => upd({ min_activation_amount: decimal(event.target.value) })} /></span></label>
                  <label className="pp-field"><span className="pp-lbl">Facility term <SrcChip k="term_months" /></span>
                    <span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.term_months} onChange={(event) => { const termMonths = integer(event.target.value); upd({ term_months: termMonths, ...(form.repayment_structure === "fully_amortizing" && !form.repayment_config ? { amortization_months: termMonths } : {}) }); }} /><span className="pp-affix">months</span></span></label>
                  {isRevolving ? <>
                    <label className="pp-field"><span className="pp-lbl">Expected initial draw</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.initial_draw_amount} onChange={(event) => upd({ initial_draw_amount: decimal(event.target.value) })} placeholder="Optional" /></span></label>
                    <label className="pp-field"><span className="pp-lbl">Draw / availability period</span><span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.draw_period_months} onChange={(event) => upd({ draw_period_months: integer(event.target.value) })} /><span className="pp-affix">months</span></span></label>
                    <label className="pp-field"><span className="pp-lbl">Balance used for payment estimate</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.payment_basis_amount} onChange={(event) => upd({ payment_basis_amount: decimal(event.target.value) })} placeholder={initialDraw ? String(initialDraw) : "Defaults to credit limit"} /></span></label>
                  </> : null}
                </div>
                {form.facility_kind === "heloc" ? <Callout tone="warn"><b>Commercial-purpose HELOC only.</b> Use this workflow for documented business-purpose or investment-property credit. Do not present an owner-occupied consumer HELOC as a commercial facility; confirm purpose, property use and the funding source&apos;s classification before recording.</Callout> : null}
              </section>

              <section className="pp-ts-section">
                <div className="pp-ts-section-head"><span>3</span><div><h4>Rate</h4><p>Fixed pricing uses the stated rate. Variable pricing preserves the index, margin and dated all-in snapshot.</p></div></div>
                <div className="pp-row"><Picks options={RATE_STRUCTURES.map((option) => [option.value, option.label] as [RateStructure, string])} value={form.rate_structure} onChange={(value) => upd({ rate_structure: value })} /></div>
                {form.rate_structure === "variable" ? (
                  <div className="pp-grid">
                    <label className="pp-field"><span className="pp-lbl">Index</span><select className="pp-input" value={form.rate_index} onChange={(event) => upd({ rate_index: event.target.value })}>{RATE_INDEXES.map((index) => <option key={index}>{index}</option>)}</select></label>
                    <label className="pp-field"><span className="pp-lbl">Current index rate</span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.rate_index_rate_pct} onChange={(event) => upd({ rate_index_rate_pct: decimal(event.target.value) })} /><span className="pp-affix">%</span></span></label>
                    <label className="pp-field"><span className="pp-lbl">Margin</span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.rate_margin_pct} onChange={(event) => upd({ rate_margin_pct: signedDecimal(event.target.value) })} /><span className="pp-affix">%</span></span></label>
                    <label className="pp-field"><span className="pp-lbl">Floor (optional)</span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.rate_floor_pct} onChange={(event) => upd({ rate_floor_pct: decimal(event.target.value) })} /><span className="pp-affix">%</span></span></label>
                    <label className="pp-field"><span className="pp-lbl">Cap (optional)</span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.rate_cap_pct} onChange={(event) => upd({ rate_cap_pct: decimal(event.target.value) })} /><span className="pp-affix">%</span></span></label>
                    <label className="pp-field"><span className="pp-lbl">Rate as of</span><input type="date" className="pp-input" value={form.rate_as_of} onChange={(event) => upd({ rate_as_of: event.target.value })} /></label>
                    <div className="pp-field span-3"><span className="pp-lbl">Current all-in rate</span><div className="pp-static pp-ts-rate-result">{pct(annualRate, 2)} <PChip tone="acc">{form.rate_index} + {form.rate_margin_pct || "0"}%</PChip></div></div>
                    {form.rate_index === "Other" ? <label className="pp-field span-3"><span className="pp-lbl">Index / pricing description</span><input className="pp-input" value={form.custom_rate_description} onChange={(event) => upd({ custom_rate_description: event.target.value })} placeholder="Name the lender index and reset convention" /></label> : null}
                    <label className="pp-field"><span className="pp-lbl">Lender-disclosed APR (optional)</span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.apr_pct} onChange={(event) => upd({ apr_pct: decimal(event.target.value) })} placeholder="Not auto-calculated" /><span className="pp-affix">%</span></span></label>
                  </div>
                ) : (
                  <div className="pp-grid">
                    <label className="pp-field"><span className="pp-lbl">{form.rate_structure === "fixed" ? "Fixed interest rate" : "Current rate snapshot"} <SrcChip k="rate_pct" /></span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.rate_pct} onChange={(event) => upd({ rate_pct: decimal(event.target.value) })} /><span className="pp-affix">%</span></span></label>
                    <label className="pp-field"><span className="pp-lbl">Lender-disclosed APR (optional)</span><span className="pp-num u-pct"><input className="pp-input" inputMode="decimal" value={form.apr_pct} onChange={(event) => upd({ apr_pct: decimal(event.target.value) })} placeholder="Not auto-calculated" /><span className="pp-affix">%</span></span></label>
                    {form.rate_structure === "custom" ? <label className="pp-field span-2"><span className="pp-lbl">Custom pricing description</span><input className="pp-input" value={form.custom_rate_description} onChange={(event) => upd({ custom_rate_description: event.target.value })} placeholder="Formula, tiers, resets or other pricing terms" /></label> : null}
                  </div>
                )}
                <p className="pp-sub">APR is stored only when the funding source supplies it. Fees and timing can make APR different from the interest rate, so the system does not infer one from the other.</p>
              </section>

              <section className="pp-ts-section">
                <div className="pp-ts-section-head"><span>4</span><div><h4>Repayment structure</h4><p>Payment structure is independent of product type. Choose it explicitly, then confirm the calculated schedule.</p></div></div>
                <div className="pp-ts-choice-grid" role="radiogroup" aria-label="Repayment structure">
                  {REPAYMENT_STRUCTURES.map((option) => <button key={option.value} type="button" className={`pp-ts-choice${form.repayment_structure === option.value ? " on" : ""}`} role="radio" aria-checked={form.repayment_structure === option.value} onClick={() => repaymentChanged(option.value)}><b>{form.repayment_config && option.value === "fully_amortizing" ? "Amortizing" : option.label}</b><span>{form.repayment_config && option.value === "fully_amortizing" ? "Declining-balance principal and interest; principal payments and maturity set below." : option.detail}</span></button>)}
                </div>
                <div className="pp-grid">
                  <label className="pp-field"><span className="pp-lbl">Payment frequency</span><select className="pp-input" value={form.payment_frequency} onChange={(event) => upd({ payment_frequency: event.target.value as PaymentFrequency })}>{PAYMENT_FREQUENCIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  {form.payment_frequency === "custom" ? <>
                    <label className="pp-field"><span className="pp-lbl">Payments per year</span><input className="pp-input" inputMode="decimal" value={form.payments_per_year} onChange={(event) => upd({ payments_per_year: decimal(event.target.value) })} placeholder="18" /></label>
                    <label className="pp-field"><span className="pp-lbl">Cadence description</span><input className="pp-input" value={form.custom_payment_frequency} onChange={(event) => upd({ custom_payment_frequency: event.target.value })} placeholder="Every 20 days" /></label>
                  </> : null}
                  {usesInitialIo(form.repayment_structure, form.repayment_config) ? <label className="pp-field"><span className="pp-lbl">Interest-only period</span><span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.interest_only_months} onChange={(event) => upd({ interest_only_months: integer(event.target.value) })} /><span className="pp-affix">months</span></span></label> : null}
                  {showAmortization && !form.repayment_config ? <label className="pp-field"><span className="pp-lbl">Amortization period</span><span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.amortization_months} onChange={(event) => upd({ amortization_months: integer(event.target.value) })} /><span className="pp-affix">months</span></span></label> : null}
                  <div style={{ gridColumn: "1 / -1", minWidth: 0 }}><AdvancedRepaymentEditor value={form.repayment_config} onChange={(config) => upd({ repayment_config: config })} amount={paymentBasis || approved} ratePct={annualRate} termMonths={toNumber(form.term_months)} structure={["interest_only", "revolving_interest_only"].includes(form.repayment_structure) ? "interest_only" : form.repayment_structure === "simple_interest" ? "simple_interest" : "amortizing"} interestOnlyMonths={usesInitialIo(form.repayment_structure, form.repayment_config) ? maybeNumber(form.interest_only_months) : 0} periodsPerYear={periodsPerYear(form.payment_frequency, maybeNumber(form.payments_per_year)) ?? 0} disabled={!state?.can_edit} unsupportedReason={form.lender_payment_override || ["fixed_payment", "custom"].includes(form.repayment_structure) ? "Advanced repayment requires a calculated loan structure without a lender-stated payment override." : null} /></div>
                  {showPaymentBasis && !isRevolving ? <label className="pp-field"><span className="pp-lbl">Balance used for payment estimate</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.payment_basis_amount} onChange={(event) => upd({ payment_basis_amount: decimal(event.target.value) })} placeholder="Defaults to approved amount" /></span></label> : null}
                  {form.repayment_structure === "custom" ? <label className="pp-field span-3"><span className="pp-lbl">Custom payment schedule</span><textarea className="pp-input" rows={3} value={form.custom_payment_description} onChange={(event) => upd({ custom_payment_description: event.target.value })} placeholder="Describe each phase, payment rule, maturity obligation and any lender minimum." /></label> : null}
                </div>
                {form.repayment_structure !== "fixed_payment" && form.repayment_structure !== "custom" ? <label className="pp-check pp-ts-override"><input type="checkbox" checked={form.lender_payment_override} onChange={(event) => upd({ lender_payment_override: event.target.checked, periodic_payment: event.target.checked && !maybeNumber(form.periodic_payment) ? str(summary.periodic_payment ?? "") : form.periodic_payment })} /><span><b>Use the lender-stated payment</b><small>Override the formula preview when the lender&apos;s quote includes conventions or fees this estimate cannot reproduce.</small></span></label> : null}
                {manualPayment ? <div className="pp-grid"><label className="pp-field"><span className="pp-lbl">Lender-stated {frequencyLabel(form.payment_frequency).toLowerCase()} payment</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.periodic_payment} onChange={(event) => upd({ periodic_payment: decimal(event.target.value) })} /></span></label></div> : null}

                <div className="pp-ts-payment-summary" aria-live="polite">
                  <header><div><span className="pp-eyebrow">Payment preview</span><h5>{repaymentLabel(form.repayment_structure)}</h5></div><PChip tone={manualPayment ? "warn" : "acc"}>{manualPayment ? "Lender stated" : "Calculated"}</PChip></header>
                  <div className="pp-ts-payment-values">
                    <div><span>{frequencyLabel(form.payment_frequency)} payment</span><b>{summary.periodic_payment ? money(summary.periodic_payment, 2) : "—"}</b></div>
                    <div><span>{(maybeNumber(form.interest_only_months) ?? 0) > 0 && usesInitialIo(form.repayment_structure, form.repayment_config) ? "Initial IO monthly equivalent" : "Regular monthly equivalent"}</span><b>{summary.monthly_equivalent_payment != null ? money(summary.monthly_equivalent_payment, 2) : "—"}</b></div>
                    {(maybeNumber(form.interest_only_months) ?? 0) > 0 && summary.post_io_payment != null ? <div><span>Principal and interest after IO</span><b>{money(summary.post_io_payment, 2)}</b></div> : null}
                    <div><span>Estimated balloon / principal due</span><b>{summary.balloon_amount ? money(summary.balloon_amount, 2) : "$0.00"}</b></div>
                  </div>
                  {schedule ? <LoanPaymentPhases schedule={schedule} /> : summary.lines.length ? <ul>{summary.lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p>Complete the amount, rate, term and payment fields to calculate.</p>}
                  {summary.assumptions.map((assumption) => <p className="pp-ts-assumption" key={assumption}>{assumption}</p>)}
                  {schedule ? <LoanScheduleTable schedule={schedule} title="Amortization schedule" /> : null}
                </div>

                <div className="pp-ts-coverage">
                  <div><b>Program monthly coverage amount</b><p>This is the monthly amount used by the production build and 125% remittance covenant. It is separate from a changing LOC or HELOC payment.</p></div>
                  <label className="pp-field"><span className="pp-lbl">Coverage basis</span><select className="pp-input" value={form.repayment_config ? "monthly_equivalent" : form.monthly_program_coverage_basis} disabled={!!form.repayment_config} onChange={(event) => upd({ monthly_program_coverage_basis: event.target.value as ProgramCoverageBasis })}>{COVERAGE_OPTIONS.map(([value, label]) => <option key={value} value={value} disabled={value === "post_io_payment" && !summary.post_io_monthly_equivalent}>{label}</option>)}</select></label>
                  <label className="pp-field"><span className="pp-lbl">Monthly amount</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={manualCoverage && !form.repayment_config ? form.monthly_program_coverage_amount : roundedMoney(programCoverage) ?? ""} disabled={!manualCoverage || !!form.repayment_config} onChange={(event) => upd({ monthly_program_coverage_amount: decimal(event.target.value) })} /></span></label>
                </div>

                <div className="pp-ts-coverage">
                  <div><b>Effect on DSCR</b><p>Tell the calculator whether this facility adds debt or replaces debt being paid off. This changes projected DSCR; it does not change the lender payment.</p></div>
                  <label className="pp-field"><span className="pp-lbl">Debt-service treatment</span><select className="pp-input" value={form.debt_service_treatment} onChange={(event) => upd({ debt_service_treatment: event.target.value as DebtServiceTreatment, retained_annual_debt_service: event.target.value === "refinance" ? form.retained_annual_debt_service : "" })}><option value="additive">Adds to existing debt</option><option value="refinance">Replaces / pays off debt</option></select></label>
                  {form.debt_service_treatment === "refinance" ? <label className="pp-field"><span className="pp-lbl">Annual debt service remaining after payoff</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.retained_annual_debt_service} onChange={(event) => upd({ retained_annual_debt_service: decimal(event.target.value) })} placeholder="0 if all existing debt is replaced" /></span></label> : <div className="pp-field"><span className="pp-lbl">Projected calculation</span><div className="pp-static">Existing annual debt service + this facility</div></div>}
                </div>
              </section>

              <section className="pp-ts-section">
                <div className="pp-ts-section-head"><span>5</span><div><h4>Timeline</h4><p>Keep facility timing separate from production-program activation.</p></div></div>
                <div className="pp-grid">
                  <div style={{ gridColumn: "1 / -1" }}><LoanDateFields value={form} termMonths={maybeNumber(form.term_months)} disabled={!canEdit || Boolean(busy)} onChange={upd} /></div>
                  <label className="pp-field"><span className="pp-lbl">First payment</span><input type="date" className="pp-input" value={form.first_payment_date} onChange={(event) => upd({ first_payment_date: event.target.value })} /></label>
                  <label className="pp-field"><span className="pp-lbl">Program activation <SrcChip k="activation_date" /></span><input type="date" className="pp-input" value={form.activation_date} onChange={(event) => upd({ activation_date: event.target.value })} /></label>
                  <label className="pp-field"><span className="pp-lbl">Production commencement <SrcChip k="commencement_date" /></span><input type="date" className="pp-input" value={form.commencement_date} onChange={(event) => upd({ commencement_date: event.target.value })} /></label>
                  <div className="pp-field"><span className="pp-lbl">Offer timing</span><div className="pp-ts-inline-fields"><label><input className="pp-input" inputMode="numeric" value={form.expiration_days} onChange={(event) => upd({ expiration_days: integer(event.target.value) })} /><span>valid days</span></label><label><input className="pp-input" inputMode="numeric" value={form.closing_estimate_days} onChange={(event) => upd({ closing_estimate_days: integer(event.target.value) })} /><span>business days to close</span></label></div></div>
                </div>
                <p className="pp-sub">Funding/opening ≤ activation ≤ production commencement &lt; maturity. Draw and interest-only periods are shown in the payment summary and client PDF. Term validity is a financing term; the offer-email workflow has its own separate 48-hour response window.</p>
              </section>

              <section className="pp-ts-section">
                <div className="pp-ts-section-head"><span>6</span><div><h4>Use of funds, conditions and notes</h4><p>Allocate the first funded amount for a revolver, or the approved principal for a term facility.</p></div></div>
                <MoneySplit id="ts-use-of-funds" value={form.use_of_funds} onChange={(next) => upd({ use_of_funds: next })} against={uofAgainst || null} againstLabel={isRevolving && initialDraw ? "expected initial draw" : isRevolving ? "credit limit" : "approved amount"} />
                {uofNote ? <p className="pp-sub">Dealer file: {uofNote}</p> : null}
                <div className="pp-grid">
                  <label className="pp-field span-3"><span className="pp-lbl">Client-facing conditions</span><textarea className="pp-input" rows={3} value={form.conditions} onChange={(event) => upd({ conditions: event.target.value })} placeholder="Conditions precedent to funding, if any" /></label>
                  <label className="pp-field span-3"><span className="pp-lbl">Internal notes — never printed on the client PDF</span><textarea className="pp-input" rows={2} value={form.notes} onChange={(event) => upd({ notes: event.target.value })} placeholder="Internal underwriting notes" /></label>
                </div>
              </section>

              {validationErrors.length ? <div className="pp-ts-validation"><b>Complete these terms before recording</b><ul>{validationErrors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
              {visibleErrors.length ? <ul className="pp-errors">{visibleErrors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
              {done ? <Callout tone="ok">{done}</Callout> : null}
              <div className="pp-row">
                <PBtn variant="pri" onClick={() => void save()} busy={busy === "save"} disabled={Boolean(validationErrors.length) || supportingPending || versionConflict || principalBlocked} title={validationErrors[0]}>Record term sheet v{nextVersion}</PBtn>
                {current && !withdrawAsk ? <PBtn variant="danger" size="sm" onClick={() => setWithdrawAsk(true)} disabled={Boolean(current.consumed_by_package_id)} title={current.consumed_by_package_id ? "Void the final that uses this term sheet first" : undefined}>Withdraw v{current.version}</PBtn> : null}
              </div>
              {withdrawAsk ? (
                <div className="pp-inline">
                  <b>Withdraw term sheet v{current?.version}?</b>
                  <p className="pp-sub">The file goes back to having no term sheet; a new version can be recorded afterwards. Refused while a final uses it.</p>
                  <input className="pp-input" placeholder="Reason (kept in the audit trail)" value={withdrawReason} onChange={(event) => setWithdrawReason(event.target.value)} />
                  <div className="pp-row"><PBtn variant="danger" onClick={withdraw} busy={busy === "withdraw"} disabled={withdrawReason.trim().length < 3}>Withdraw</PBtn><PBtn onClick={() => setWithdrawAsk(false)}>Cancel</PBtn></div>
                </div>
              ) : null}
            </>
          )}

          <h4 className="pp-sect">History</h4>
          {state.history.length ? (
            <ul className="pp-ts-hist">
              {state.history.map((history) => (
                <li key={history.id} className={history.status === "current" ? "current" : ""}>
                  <b>v{history.version}</b>
                  <PChip tone={history.status === "current" ? "ok" : history.status === "withdrawn" ? "bad" : "mut"}>{history.status === "current" ? "Current" : history.status === "withdrawn" ? "Withdrawn" : "Superseded"}</PChip>
                  <span>{sheetLine(history)}</span>
                  <span className="pp-sub">{history.entered_by_name ?? "the desk"} · {whenLabel(history.entered_at)}{history.superseded_at ? ` · superseded ${whenLabel(history.superseded_at)}` : ""}{history.withdrawn_at ? ` · withdrawn ${whenLabel(history.withdrawn_at)}` : ""}</span>
                  {history.consumed_by_package_id ? <PChip tone="gold">Used by a final</PChip> : null}
                </li>
              ))}
            </ul>
          ) : <p className="pp-sub">No versions yet.</p>}
        </div>
      )}
      </div>
      <div role="tabpanel" id={`${viewId}-collateral-panel`} aria-labelledby={`${viewId}-collateral-tab`} hidden={view !== "collateral"}>
        <FileCollateralSection inline onPending={setCollateralPending} profileId={profileId} disabled={!canEdit || Boolean(busy)} title="Collateral for these terms" />
      </div>
      <div role="tabpanel" id={`${viewId}-budget-panel`} aria-labelledby={`${viewId}-budget-tab`} hidden={view !== "budget"}>
        <DealBudgetSection inline saveWithTerms financialPlan={editorPlan} onGrossAmountChange={amount => upd(independentDraw ? { payment_basis_amount: amount == null ? "" : String(amount), initial_draw_amount: amount == null ? "" : String(amount) } : { approved_amount: amount == null ? "" : String(amount) })} onApplySolvedPrincipal={applyCalculatedPrincipal} onFinancingSaved={result => { if (result.record.new_loan_amount != null) applyCalculatedPrincipal(result.record.new_loan_amount); }} onPending={setBudgetPending} profileId={profileId} disabled={!canEdit || Boolean(busy)} loan={loadedProfileId === profileId && form ? { amount: fundedPrincipal, rate_pct: annualRate, term_months: toNumber(form.term_months), structure: ["interest_only", "revolving_interest_only"].includes(form.repayment_structure) ? "interest_only" : form.repayment_structure === "simple_interest" ? "simple_interest" : "amortizing", interest_only_months: usesInitialIo(form.repayment_structure, form.repayment_config) ? maybeNumber(form.interest_only_months) : 0, repayment_config: form.repayment_config ?? (maybeNumber(form.amortization_months) != null ? { amortization_months: maybeNumber(form.amortization_months)! } : null), payments_per_year: periodsPerYear(form.payment_frequency, maybeNumber(form.payments_per_year)) } : null} />
      </div>
      {view !== "terms" && canEdit ? <div className="pp-row" style={{ paddingTop: 16 }}><PBtn variant="pri" onClick={() => void save()} busy={busy === "save"} disabled={Boolean(validationErrors.length) || supportingPending || versionConflict || principalBlocked}>Record term sheet v{nextVersion}</PBtn><span className="pp-sub">One Save records these terms, the fee budget and shared loan together.</span></div> : null}
      {view !== "terms" && visibleErrors.length ? <ul className="pp-errors" role="alert">{visibleErrors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
    </FinancialEditorSurface>
  );
}
