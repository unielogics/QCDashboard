// The term sheet: loan terms a super admin or underwriter records on the file
// before the final can be drafted. Versioned; the current row is what "Draft
// final package" consumes. Lives on the profile, not the package.
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { computePaymentSummary, defaultProgramCoverage, effectiveAnnualRate } from "./termSheetStructure";
import { Callout, KV, MoneySplit, Overlay, PBtn, PChip, Picks, emptyUseOfFunds } from "./ui";
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
  periodic_payment: string;
  lender_payment_override: boolean;
  custom_payment_description: string;
  monthly_program_coverage_amount: string;
  monthly_program_coverage_basis: ProgramCoverageBasis;
  debt_service_treatment: DebtServiceTreatment;
  retained_annual_debt_service: string;
  expected_funding_date: string;
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
    periodic_payment: str(extraValue(src, extra, "periodic_payment")) || str(src.monthly_debt_service),
    lender_payment_override: Boolean(extraValue(src, extra, "lender_payment_override")) || Boolean(sheet && !sheet.debt_service_is_level_payment),
    custom_payment_description: str(extraValue(src, extra, "custom_payment_description")),
    monthly_program_coverage_amount: str(extraValue(src, extra, "monthly_program_coverage_amount")) || str(src.monthly_debt_service),
    monthly_program_coverage_basis: isCoverageBasis(extraValue(src, extra, "monthly_program_coverage_basis"))
      ? extraValue(src, extra, "monthly_program_coverage_basis") as ProgramCoverageBasis
      : defaultCoverage,
    debt_service_treatment: extraValue(src, extra, "debt_service_treatment") === "refinance" ? "refinance" : "additive",
    retained_annual_debt_service: str(extraValue(src, extra, "retained_annual_debt_service")),
    expected_funding_date: str(src.expected_funding_date).slice(0, 10),
    first_payment_date: str(extraValue(src, extra, "first_payment_date")).slice(0, 10),
    activation_date: str(src.activation_date).slice(0, 10),
    commencement_date: str(src.commencement_date).slice(0, 10),
    maturity_date: str(src.maturity_date).slice(0, 10),
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
    && form.payment_frequency === "monthly"
    && form.rate_structure === "fixed"
    && !form.lender_payment_override
    && (maybeNumber(form.amortization_months) ?? maybeNumber(form.term_months)) === maybeNumber(form.term_months);
  const structured: TermSheetStructuredFields = {
    structure_version: 1,
    facility_kind: form.facility_kind,
    facility_catalog_key: form.facility_catalog_key,
    funder_type: form.funder_type || null,
    repayment_structure: form.repayment_structure,
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
    interest_only_months: ["interest_only", "interest_only_then_amortizing", "revolving_interest_only"].includes(form.repayment_structure)
      ? (form.repayment_structure === "interest_only_then_amortizing" ? maybeNumber(form.interest_only_months) : maybeNumber(form.term_months))
      : 0,
    amortization_months: ["fully_amortizing", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure)
      ? maybeNumber(form.amortization_months)
      : null,
    balloon_amount: summary.balloon_amount,
    periodic_payment: summary.periodic_payment,
    post_io_payment: summary.post_io_payment,
    monthly_equivalent_payment: summary.monthly_equivalent_payment,
    monthly_program_coverage_amount: roundedMoney(programCoverage),
    monthly_program_coverage_basis: form.monthly_program_coverage_basis,
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
    maturity_date: form.maturity_date || null,
    use_of_funds: any ? uof : null,
    conditions: form.conditions.trim() || null,
    notes: form.notes.trim() || null,
    ...structured,
    extra,
  };
}

export function TermSheetDrawer({ client, profileId, open, onClose, pkg, onSaved }: {
  client: PackageClient;
  profileId: string;
  open: boolean;
  onClose: () => void;
  pkg?: ProductionPackage | null;
  onSaved?: (result: TermSheetResult) => void;
}) {
  const [state, setState] = useState<TermSheetState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [withdrawAsk, setWithdrawAsk] = useState(false);
  const [withdrawReason, setWithdrawReason] = useState("");

  const load = useCallback(async () => {
    if (!client.termSheet) { setLoadError("The term sheet is recorded from the desk."); return; }
    setLoadError(null);
    try {
      const next = await client.termSheet(profileId);
      setState(next);
      setForm(formFrom(next.current, next.defaults));
    } catch (err) {
      setLoadError(errorMessage(err, "The term sheet could not be loaded."));
    }
  }, [client, profileId]);

  useEffect(() => { if (open) { setDone(null); setErrors([]); load().catch(() => undefined); } }, [open, load]);

  const fail = (err: unknown, fallback: string) => {
    const detail = errorDetail(err);
    if (errorStatus(err) === 422 && detail?.code === "term_sheet_invalid" && Array.isArray(detail.errors)) {
      setErrors((detail.errors as unknown[]).map(String));
    } else {
      setErrors([typeof detail?.message === "string" ? detail.message : errorMessage(err, fallback)]);
    }
  };

  const current = state?.current ?? null;
  const dscrBefore = storedNumber(current?.dscr_before ?? current?.extra?.dscr_before);
  const dscrAfter = storedNumber(current?.dscr_after ?? current?.extra?.dscr_after);
  const dscrStatus = current?.dscr_status ?? current?.extra?.dscr_status;
  const dscrExplanation = current?.dscr_explanation ?? current?.extra?.dscr_explanation;
  const canEdit = Boolean(state?.can_edit);
  const nextVersion = (current?.version ?? Math.max(0, ...(state?.history ?? []).map((history) => history.version))) + 1;
  const src = (key: string) => (current ? null : state?.defaults_source[key] ?? null);
  const SrcChip = ({ k }: { k: string }) => {
    if (current) return null;
    const source = src(k);
    return source ? <PChip tone="acc" title={`Prefilled: ${SOURCE_LABELS[source] ?? source}`}>{SOURCE_LABELS[source] ?? source}</PChip> : null;
  };
  const upd = (patch: Partial<FormState>) => setForm((value) => value ? { ...value, ...patch } : value);

  const approved = form ? toNumber(form.approved_amount) : 0;
  const initialDraw = form ? maybeNumber(form.initial_draw_amount) : null;
  const revolvingFacility = Boolean(form && (form.facility_kind === "revolving_loc" || form.facility_kind === "heloc"));
  const isRevolving = Boolean(form && (revolvingFacility || form.repayment_structure === "revolving_interest_only"));
  const usesPaymentBasis = Boolean(form && (isRevolving || ["interest_only", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure)));
  const paymentBasis = form ? ((usesPaymentBasis ? maybeNumber(form.payment_basis_amount) : null) ?? (isRevolving ? initialDraw : null) ?? approved) : 0;
  const annualRate = form ? effectiveAnnualRate({
    structure: form.rate_structure,
    fixedOrCustomRatePct: toNumber(form.rate_pct),
    indexRatePct: maybeNumber(form.rate_index_rate_pct),
    marginPct: maybeNumber(form.rate_margin_pct),
    floorPct: maybeNumber(form.rate_floor_pct),
    capPct: maybeNumber(form.rate_cap_pct),
  }) : 0;
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
    periodicPaymentOverride: form.lender_payment_override || form.repayment_structure === "fixed_payment" || form.repayment_structure === "custom" ? maybeNumber(form.periodic_payment) : null,
  }) : null, [annualRate, approved, form, paymentBasis]);

  const programCoverage = useMemo(() => {
    if (!form || !summary) return 0;
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
    if (["fully_amortizing", "interest_only_then_amortizing", "balloon"].includes(form.repayment_structure) && (!amortization || amortization <= 0)) issues.push("Enter the amortization period.");
    if (form.repayment_structure === "interest_only_then_amortizing" && io && amortization && amortization < term - io) issues.push("The amortization period cannot be shorter than the remaining term after the interest-only phase.");
    if (form.repayment_structure === "fully_amortizing" && amortization && amortization !== term) issues.push("Principal-and-interest terms must amortize over the facility term. Choose amortizing + balloon for a longer schedule.");
    if (form.repayment_structure === "balloon" && amortization && amortization <= term) issues.push("Balloon structures need an amortization period longer than the facility term.");
    if (isRevolving && maybeNumber(form.draw_period_months) !== null && toNumber(form.draw_period_months) > term) issues.push("The draw period cannot exceed the facility term.");
    if (form.repayment_structure === "custom" && !form.custom_payment_description.trim()) issues.push("Describe the custom payment schedule.");
    if (!summary.monthly_equivalent_payment || summary.monthly_equivalent_payment <= 0) issues.push("Enter terms that produce a positive lender payment, or use the lender-stated payment override.");
    if (!programCoverage || programCoverage <= 0) issues.push("Enter a positive monthly program coverage amount.");
    if (form.debt_service_treatment === "refinance" && maybeNumber(form.retained_annual_debt_service) === null) issues.push("Enter annual debt service that remains after payoff; use 0 when all existing debt is replaced.");
    if (toNumber(form.expiration_days) <= 0) issues.push("Term validity must be at least one day.");
    if (toNumber(form.closing_estimate_days) < 0) issues.push("Closing estimate cannot be negative.");
    if (form.expected_funding_date && form.activation_date && form.activation_date < form.expected_funding_date) issues.push("Program activation cannot be before expected funding or opening.");
    if (form.expected_funding_date && form.commencement_date && form.commencement_date < form.expected_funding_date) issues.push("Production commencement cannot be before expected funding or opening.");
    if (form.expected_funding_date && form.first_payment_date && form.first_payment_date < form.expected_funding_date) issues.push("The first payment cannot be before expected funding or opening.");
    if (form.activation_date && form.commencement_date && form.activation_date > form.commencement_date) issues.push("Program activation cannot be after production commencement.");
    if (form.maturity_date && form.expected_funding_date && form.maturity_date <= form.expected_funding_date) issues.push("Maturity must be after expected funding or opening.");
    if (form.maturity_date && form.activation_date && form.maturity_date <= form.activation_date) issues.push("Maturity must be after program activation.");
    if (form.maturity_date && form.commencement_date && form.maturity_date <= form.commencement_date) issues.push("Maturity must be after production commencement.");
    if (form.maturity_date && form.first_payment_date && form.first_payment_date > form.maturity_date) issues.push("The first payment cannot be after maturity.");
    return issues;
  }, [form, isRevolving, paymentBasis, programCoverage, summary]);

  const save = async () => {
    if (!form || !summary || !client.saveTermSheet || validationErrors.length) return;
    setBusy("save"); setErrors([]); setDone(null);
    try {
      const result = await client.saveTermSheet(profileId, toBody(form, summary, annualRate, programCoverage));
      setState(result.state);
      setForm(formFrom(result.state.current, result.state.defaults));
      const version = result.state.current?.version;
      setDone(`Term sheet v${version ?? ""} recorded.${result.final ? " The draft final was re-applied with these terms." : ""}`);
      onSaved?.(result);
    } catch (err) {
      fail(err, "The term sheet could not be recorded.");
    } finally { setBusy(null); }
  };

  const withdraw = async () => {
    if (!client.withdrawTermSheet) return;
    setBusy("withdraw"); setErrors([]); setDone(null);
    try {
      const next = await client.withdrawTermSheet(profileId, withdrawReason.trim());
      setState(next);
      setForm(formFrom(next.current, next.defaults));
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
      : "";
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
    <Overlay open={open} onClose={onClose} title={current ? `Term sheet · v${current.version}` : "Record the term sheet"} wide>
      {loadError ? <div className="pp-notice t-warn"><span>{loadError}</span><PBtn size="sm" onClick={() => load()}>Try again</PBtn></div> : null}
      {!state || !form || !summary ? (!loadError ? <p className="pp-sub">Loading…</p> : null) : (
        <div className="pp-ts-form">
          <p className="pp-sub">
            Choose the approved product, rate and repayment schedule. We calculate the lender payment and its monthly equivalent; if the dealer program uses a different monthly coverage amount, record it separately below.
          </p>
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
              <div><span>DSCR with these terms</span><b>{dscrAfter == null ? "—" : `${dscrAfter.toFixed(2)}×`}</b></div>
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
                  <label className="pp-field"><span className="pp-lbl">{isRevolving ? "Credit limit" : "Approved amount"} <SrcChip k="approved_amount" /></span>
                    <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.approved_amount} onChange={(event) => upd({ approved_amount: decimal(event.target.value) })} /></span></label>
                  <label className="pp-field"><span className="pp-lbl">{isRevolving ? "Minimum initial draw / activation" : "Minimum activation amount"} <SrcChip k="min_activation_amount" /></span>
                    <span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.min_activation_amount} onChange={(event) => upd({ min_activation_amount: decimal(event.target.value) })} /></span></label>
                  <label className="pp-field"><span className="pp-lbl">Facility term <SrcChip k="term_months" /></span>
                    <span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.term_months} onChange={(event) => { const termMonths = integer(event.target.value); upd({ term_months: termMonths, ...(form.repayment_structure === "fully_amortizing" ? { amortization_months: termMonths } : {}) }); }} /><span className="pp-affix">months</span></span></label>
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
                  {REPAYMENT_STRUCTURES.map((option) => <button key={option.value} type="button" className={`pp-ts-choice${form.repayment_structure === option.value ? " on" : ""}`} role="radio" aria-checked={form.repayment_structure === option.value} onClick={() => repaymentChanged(option.value)}><b>{option.label}</b><span>{option.detail}</span></button>)}
                </div>
                <div className="pp-grid">
                  <label className="pp-field"><span className="pp-lbl">Payment frequency</span><select className="pp-input" value={form.payment_frequency} onChange={(event) => upd({ payment_frequency: event.target.value as PaymentFrequency })}>{PAYMENT_FREQUENCIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                  {form.payment_frequency === "custom" ? <>
                    <label className="pp-field"><span className="pp-lbl">Payments per year</span><input className="pp-input" inputMode="decimal" value={form.payments_per_year} onChange={(event) => upd({ payments_per_year: decimal(event.target.value) })} placeholder="18" /></label>
                    <label className="pp-field"><span className="pp-lbl">Cadence description</span><input className="pp-input" value={form.custom_payment_frequency} onChange={(event) => upd({ custom_payment_frequency: event.target.value })} placeholder="Every 20 days" /></label>
                  </> : null}
                  {form.repayment_structure === "interest_only_then_amortizing" ? <label className="pp-field"><span className="pp-lbl">Interest-only period</span><span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.interest_only_months} onChange={(event) => upd({ interest_only_months: integer(event.target.value) })} /><span className="pp-affix">months</span></span></label> : null}
                  {showAmortization ? <label className="pp-field"><span className="pp-lbl">Amortization period</span><span className="pp-num u-unit"><input className="pp-input" inputMode="numeric" value={form.amortization_months} onChange={(event) => upd({ amortization_months: integer(event.target.value) })} /><span className="pp-affix">months</span></span></label> : null}
                  {showPaymentBasis && !isRevolving ? <label className="pp-field"><span className="pp-lbl">Balance used for payment estimate</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.payment_basis_amount} onChange={(event) => upd({ payment_basis_amount: decimal(event.target.value) })} placeholder="Defaults to approved amount" /></span></label> : null}
                  {form.repayment_structure === "custom" ? <label className="pp-field span-3"><span className="pp-lbl">Custom payment schedule</span><textarea className="pp-input" rows={3} value={form.custom_payment_description} onChange={(event) => upd({ custom_payment_description: event.target.value })} placeholder="Describe each phase, payment rule, maturity obligation and any lender minimum." /></label> : null}
                </div>
                {form.repayment_structure !== "fixed_payment" && form.repayment_structure !== "custom" ? <label className="pp-check pp-ts-override"><input type="checkbox" checked={form.lender_payment_override} onChange={(event) => upd({ lender_payment_override: event.target.checked, periodic_payment: event.target.checked && !maybeNumber(form.periodic_payment) ? str(summary.periodic_payment ?? "") : form.periodic_payment })} /><span><b>Use the lender-stated payment</b><small>Override the formula preview when the lender&apos;s quote includes conventions or fees this estimate cannot reproduce.</small></span></label> : null}
                {manualPayment ? <div className="pp-grid"><label className="pp-field"><span className="pp-lbl">Lender-stated {frequencyLabel(form.payment_frequency).toLowerCase()} payment</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={form.periodic_payment} onChange={(event) => upd({ periodic_payment: decimal(event.target.value) })} /></span></label></div> : null}

                <div className="pp-ts-payment-summary" aria-live="polite">
                  <header><div><span className="pp-eyebrow">Payment preview</span><h5>{repaymentLabel(form.repayment_structure)}</h5></div><PChip tone={manualPayment ? "warn" : "acc"}>{manualPayment ? "Lender stated" : "Calculated"}</PChip></header>
                  <div className="pp-ts-payment-values">
                    <div><span>{frequencyLabel(form.payment_frequency)} payment</span><b>{summary.periodic_payment ? money(summary.periodic_payment, 2) : "—"}</b></div>
                    <div><span>Monthly equivalent</span><b>{summary.monthly_equivalent_payment ? money(summary.monthly_equivalent_payment, 2) : "—"}</b></div>
                    <div><span>After interest-only</span><b>{summary.post_io_payment ? money(summary.post_io_payment, 2) : "—"}</b></div>
                    <div><span>Estimated balloon / principal due</span><b>{summary.balloon_amount ? money(summary.balloon_amount, 2) : "$0.00"}</b></div>
                  </div>
                  {summary.lines.length ? <ul>{summary.lines.map((line) => <li key={line}>{line}</li>)}</ul> : <p>Complete the amount, rate, term and payment fields to calculate.</p>}
                  {summary.assumptions.map((assumption) => <p className="pp-ts-assumption" key={assumption}>{assumption}</p>)}
                </div>

                <div className="pp-ts-coverage">
                  <div><b>Program monthly coverage amount</b><p>This is the monthly amount used by the production build and 125% remittance covenant. It is separate from a changing LOC or HELOC payment.</p></div>
                  <label className="pp-field"><span className="pp-lbl">Coverage basis</span><select className="pp-input" value={form.monthly_program_coverage_basis} onChange={(event) => upd({ monthly_program_coverage_basis: event.target.value as ProgramCoverageBasis })}>{COVERAGE_OPTIONS.map(([value, label]) => <option key={value} value={value} disabled={value === "post_io_payment" && !summary.post_io_monthly_equivalent}>{label}</option>)}</select></label>
                  <label className="pp-field"><span className="pp-lbl">Monthly amount</span><span className="pp-num u-money"><span className="pp-affix">$</span><input className="pp-input" inputMode="decimal" value={manualCoverage ? form.monthly_program_coverage_amount : roundedMoney(programCoverage) ?? ""} disabled={!manualCoverage} onChange={(event) => upd({ monthly_program_coverage_amount: decimal(event.target.value) })} /></span></label>
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
                  <label className="pp-field"><span className="pp-lbl">Expected funding / opening <SrcChip k="expected_funding_date" /></span><input type="date" className="pp-input" value={form.expected_funding_date} onChange={(event) => upd({ expected_funding_date: event.target.value })} /></label>
                  <label className="pp-field"><span className="pp-lbl">First payment</span><input type="date" className="pp-input" value={form.first_payment_date} onChange={(event) => upd({ first_payment_date: event.target.value })} /></label>
                  <label className="pp-field"><span className="pp-lbl">Maturity <SrcChip k="maturity_date" /></span><input type="date" className="pp-input" value={form.maturity_date} onChange={(event) => upd({ maturity_date: event.target.value })} /></label>
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
              {errors.length ? <ul className="pp-errors">{errors.map((error) => <li key={error}>{error}</li>)}</ul> : null}
              {done ? <Callout tone="ok">{done}</Callout> : null}
              <div className="pp-row">
                <PBtn variant="pri" onClick={save} busy={busy === "save"} disabled={Boolean(validationErrors.length)} title={validationErrors[0]}>Record term sheet v{nextVersion}</PBtn>
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
    </Overlay>
  );
}
