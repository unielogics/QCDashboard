"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Row, Select, Textarea, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import type {
  ApplicationClientTerms,
  ApplicationClientTermsWrite,
  ClientTermsDebtTreatment,
  ClientTermsFunderType,
  ClientTermsRepaymentFrequency,
} from "@/lib/applicationProfile";
import { useActiveProfile } from "@/store/role";
import { STRUCTURE_LABELS, normalizeRepaymentConfig, defaultStructure, describeSchedule, riskProfile, type LoanStructure, type RepaymentConfig } from "@/lib/loanSchedule";
import { applyWorkingLoan, clientDraftLoanFields, loanFromClientDraft, type LoanRefinanceContext, type LoanScenarioPreviewer, type SyncedLoan } from "@/lib/loanTermsSync";
import { AdvancedRepaymentEditor } from "@/components/application/AdvancedRepaymentEditor";
import { applyAmortizationMonths, copyRepaymentConfig, repaymentPreview, repaymentConfigLabel, termsCadenceForPeriods } from "@/lib/repaymentConfig";
import type { FinancialPlanRead, FinancialPlanWrite } from "@/lib/financialCockpit";
import { LoanScheduleTable } from "@/components/application/LoanScheduleTable";
import { LoanScheduleReview } from "@/components/application/LoanScheduleReview";
import { LoanPaymentPhases } from "@/components/application/LoanPaymentPhases";
import scheduleStyles from "./LoanScheduleReview.module.css";
import { CoverageFundingGap } from "./CoverageFundingGap";
import type { OfferSelection } from "@/components/communications/OfferDeliveryComposer";

export type Draft = {
  loan_type: string;
  amount: string;
  apr_pct: string;
  term_months: string;
  funder_type: ClientTermsFunderType | "";
  funder_name: string;
  repayment_frequency: ClientTermsRepaymentFrequency;
  custom_payments_per_year: string;
  custom_repayment_label: string;
  debt_service_treatment: ClientTermsDebtTreatment;
  retained_annual_debt_service: string;
  /** "" = the house default for the term (simple interest under 3 years, amortizing from 3). */
  loan_structure: LoanStructure | "";
  interest_only_months: string;
  repayment_config: RepaymentConfig | null;
  expiration_days: string;
  closing_estimate_days: string;
  co_brand_enabled: boolean;
  sponsor_name: string;
  client_note: string;
  conditions: string;
};

export type ClientTermsWorkingDraft = { profileId: string; draft: Draft; baseVersion: number; savedFingerprint: string; sourceFingerprint: string; editedInEditor: boolean };
export type ClientTermsView = "terms" | "schedule";
const cloneDraft = (draft: Draft): Draft => ({ ...draft, repayment_config: copyRepaymentConfig(draft.repayment_config) });
export function draftWithScenarioLoan(draft: Draft, loan?: SyncedLoan | null, context?: LoanRefinanceContext | null): Draft {
  const fields = loan ? clientDraftLoanFields(loan) : null;
  if (fields?.repayment_frequency === "custom" && draft.repayment_frequency === "custom"
      && loanFromClientDraft(draft).paymentsPerYear === loan?.paymentsPerYear) fields.custom_repayment_label = draft.custom_repayment_label;
  return { ...cloneDraft(draft), ...fields,
    ...(context ? { debt_service_treatment: context.treatment, retained_annual_debt_service: context.retainedAnnualService == null ? "" : String(context.retainedAnnualService) } : {}) };
}

const FUNDER_OPTIONS: Array<[ClientTermsFunderType, string]> = [
  ["bank", "Bank"],
  ["credit_union", "Credit union"],
  ["private_fund", "Private fund"],
  ["private_capital", "Private capital"],
  ["family_office", "Family office"],
  ["balance_sheet", "Balance-sheet lender"],
  ["warehouse", "Warehouse line"],
  ["table_funder", "Table funder"],
  ["other", "Other"],
];

const FREQUENCY_OPTIONS: Array<[ClientTermsRepaymentFrequency, string]> = [
  ["daily", "Daily (business days)"],
  ["weekly", "Weekly"],
  ["biweekly", "Every two weeks"],
  ["monthly", "Monthly"],
  ["custom", "Custom schedule"],
];

const PERIODS: Record<Exclude<ClientTermsRepaymentFrequency, "custom">, number> = {
  daily: 252,
  weekly: 51.96,
  biweekly: 25.98,
  monthly: 12,
};

export function emptyDraft(): Draft {
  return {
    loan_type: "",
    amount: "",
    apr_pct: "",
    term_months: "",
    funder_type: "",
    funder_name: "",
    repayment_frequency: "monthly",
    custom_payments_per_year: "",
    custom_repayment_label: "",
    debt_service_treatment: "additive",
    retained_annual_debt_service: "",
    loan_structure: "",
    interest_only_months: "",
    repayment_config: null,
    expiration_days: "7",
    closing_estimate_days: "5",
    co_brand_enabled: true,
    sponsor_name: "UrChoice",
    client_note: "",
    conditions: "",
  };
}

export function draftFromTerms(terms: ApplicationClientTerms): Draft {
  return {
    loan_type: terms.loan_type ?? terms.loan_type_options[0]?.value ?? "",
    amount: terms.amount == null ? "" : String(terms.amount),
    apr_pct: terms.apr_pct == null ? "" : String(terms.apr_pct),
    term_months: terms.term_months == null ? "" : String(terms.term_months),
    funder_type: terms.funder_type ?? "",
    funder_name: terms.funder_name ?? "",
    repayment_frequency: terms.repayment_frequency ?? "monthly",
    custom_payments_per_year: terms.custom_payments_per_year == null ? "" : String(terms.custom_payments_per_year),
    custom_repayment_label: terms.custom_repayment_label ?? "",
    debt_service_treatment: terms.debt_service_treatment ?? "additive",
    retained_annual_debt_service: terms.retained_annual_debt_service == null ? "" : String(terms.retained_annual_debt_service),
    loan_structure: terms.loan_structure ?? "",
    interest_only_months: terms.loan_structure === "interest_only" ? "" : String(terms.interest_only_months ?? 0),
    repayment_config: copyRepaymentConfig(terms.repayment_config),
    expiration_days: String(terms.expiration_days ?? 7),
    closing_estimate_days: String(terms.closing_estimate_days ?? 5),
    co_brand_enabled: terms.co_brand_enabled,
    sponsor_name: terms.sponsor_name ?? "UrChoice",
    client_note: terms.client_note ?? "",
    conditions: terms.conditions.join("\n"),
  };
}

function finite(value: string): number | null {
  const normalized = value.trim().replace(/[$,%\s]/g, "");
  const number = Number(normalized);
  return normalized && Number.isFinite(number) ? number : null;
}

function money(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "Needs evidence";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function ratio(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "Needs evidence" : `${value.toFixed(2)}x`;
}

/** A proposed payment cannot establish the unknown existing or retained debt burden. */
export function clientTermsCoveragePreview(calculation: ApplicationClientTerms["calculation"] | null | undefined, treatment: ClientTermsDebtTreatment, retainedAnnual: number | null, newAnnual: number | null) {
  const knownService = (value: number | null | undefined) => value != null && Number.isFinite(value) && value >= 0 ? value : null;
  let existingAnnual = knownService(treatment === "refinance" ? retainedAnnual : calculation?.current_annual_debt_service);
  if (treatment === "refinance" && calculation?.dscr_method === "real_estate") {
    const carrying = knownService(calculation.annual_property_carrying_costs);
    existingAnnual = existingAnnual == null || carrying == null ? null : existingAnnual + carrying;
  }
  const proposed = knownService(newAnnual);
  const denominator = existingAnnual == null || proposed == null ? null : existingAnnual + proposed;
  const income = calculation?.cash_flow_value;
  const value = income != null && Number.isFinite(income) && denominator != null && denominator > 0 ? income / denominator : null;
  return { existingAnnual, denominator, value };
}

export function paymentPreview(draft: Draft) {
  const amount = finite(draft.amount);
  const apr = finite(draft.apr_pct);
  const rawMonths = finite(draft.term_months);
  const months = rawMonths;
  const periods = draft.repayment_frequency === "custom"
    ? (() => {
        const custom = finite(draft.custom_payments_per_year);
        return custom;
      })()
    : PERIODS[draft.repayment_frequency];
  if (amount == null || amount <= 0 || apr == null || apr < 0 || months == null || months <= 0 || !Number.isInteger(months) || periods == null || periods <= 0) return null;
  // The same schedule the server prices on save (app/services/loan_schedule.py): the payment and the annual
  // service are the ones coverage stands on, after any interest-only months, so the preview, the saved
  // terms and the Financials tab agree.
  const schedule = repaymentPreview(amount, apr, months, { structure: draft.loan_structure || null, interestOnlyMonths: finite(draft.interest_only_months) ?? 0, periodsPerYear: periods, repaymentConfig: draft.repayment_config }).schedule;
  if (!schedule) return null;
  const payment = schedule.payment_after ?? schedule.payment_io ?? 0;
  return { payment, count: schedule.periods, periods, annual: schedule.coverage_annual_debt_service, total: schedule.total_paid, schedule };
}

export function payloadFromDraft(draft: Draft, expectedVersion: number): ApplicationClientTermsWrite {
  const amount = finite(draft.amount);
  const apr = finite(draft.apr_pct);
  const term = finite(draft.term_months);
  const expiration = finite(draft.expiration_days);
  const close = finite(draft.closing_estimate_days);
  if (!draft.loan_type || !draft.funder_type || amount == null || amount <= 0 || apr == null || apr < 0 || term == null || term < 1 || expiration == null || expiration < 1 || close == null || close < 0) {
    throw new Error("Complete the loan type, amount, APR, time, funder type, and timeline before saving.");
  }
  if (!Number.isInteger(term)) throw new Error("Loan maturity must be a whole number of months.");
  const custom = finite(draft.custom_payments_per_year);
  if (draft.repayment_frequency === "custom" && (custom == null || custom < 1)) throw new Error("Enter how many payments occur per year for the custom schedule.");
  if (draft.repayment_frequency === "custom" && (custom! > 366 || Math.abs(custom! * 1000 - Math.round(custom! * 1000)) > 1e-7)) throw new Error("Custom payments per year must be from 1 to 366, with at most three decimal places.");
  const retained = finite(draft.retained_annual_debt_service);
  if (draft.debt_service_treatment === "refinance" && retained == null) throw new Error("Enter the annual debt service that remains after payoff. Enter 0 for a full payoff.");
  const ioMonths = finite(draft.interest_only_months);
  if (ioMonths != null && !Number.isInteger(ioMonths)) throw new Error("Interest-only duration must be a whole number of months.");
  if (draft.loan_structure !== "interest_only" && ioMonths != null && (ioMonths < 0 || ioMonths > term)) throw new Error("Interest-only months cannot exceed the loan maturity.");
  normalizeRepaymentConfig(draft.repayment_config, Math.round(term), { structure: draft.loan_structure || null, interestOnlyMonths: ioMonths, periodsPerYear: draft.repayment_frequency === "custom" ? custom! : PERIODS[draft.repayment_frequency] });
  const pricing = repaymentPreview(amount, apr, Math.round(term), { structure: draft.loan_structure || null, interestOnlyMonths: ioMonths, periodsPerYear: draft.repayment_frequency === "custom" ? custom! : PERIODS[draft.repayment_frequency], repaymentConfig: draft.repayment_config });
  if (pricing.error) throw new Error(pricing.error);
  return {
    expected_version: expectedVersion,
    repayment_config: copyRepaymentConfig(draft.repayment_config),
    loan_type: draft.loan_type,
    amount,
    apr_pct: apr,
    term_months: Math.round(term),
    funder_type: draft.funder_type,
    funder_name: draft.funder_name.trim() || null,
    repayment_frequency: draft.repayment_frequency,
    custom_payments_per_year: draft.repayment_frequency === "custom" ? custom! : null,
    custom_repayment_label: draft.repayment_frequency === "custom" ? draft.custom_repayment_label.trim() || null : null,
    debt_service_treatment: draft.debt_service_treatment,
    retained_annual_debt_service: draft.debt_service_treatment === "refinance" ? retained : null,
    loan_structure: draft.loan_structure || null,
    interest_only_months: draft.loan_structure === "interest_only" ? null : Math.max(0, Math.round(finite(draft.interest_only_months) ?? 0)) || null,
    expiration_days: Math.round(expiration),
    closing_estimate_days: Math.round(close),
    co_brand_enabled: draft.co_brand_enabled,
    sponsor_name: draft.co_brand_enabled ? draft.sponsor_name.trim() || "UrChoice" : null,
    client_note: draft.client_note.trim() || null,
    conditions: draft.conditions.split("\n").map((line) => line.trim()).filter(Boolean),
  };
}

export function ApplicationClientTermsPanel({
  profileId,
  onSaved,
  selected = false,
  onSelectedChange,
  onOfferReady,
  onCompose,
  compact = false,
  onEdit,
  prefillLoan,
  refinanceContext,
  financialPlanDraft,
  workingDraft,
  onWorkingDraftChange,
  onApplyLoan,
  onPending,
  canEdit = true,
  scenarioPaymentOnly = false,
  previewScenario,
  activeView,
  onViewChange,
}: {
  profileId: string;
  onSaved?: (terms: ApplicationClientTerms, plan?: FinancialPlanRead) => void;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onOfferReady?: (selection: OfferSelection | null) => void;
  onCompose?: () => void;
  /** The Underwriting tab's view: what is on file, select it for delivery, and a way to the editor on Financials. */
  compact?: boolean;
  onEdit?: () => void;
  prefillLoan?: SyncedLoan | null;
  refinanceContext?: LoanRefinanceContext | null;
  financialPlanDraft?: FinancialPlanWrite;
  workingDraft?: ClientTermsWorkingDraft | null;
  onWorkingDraftChange?: (draft: ClientTermsWorkingDraft) => void;
  onApplyLoan?: (loan: SyncedLoan) => void;
  onPending?: (pending: boolean) => void;
  canEdit?: boolean;
  scenarioPaymentOnly?: boolean;
  previewScenario?: LoanScenarioPreviewer;
  activeView?: ClientTermsView;
  onViewChange?: (view: ClientTermsView) => void;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const draftRef = useRef<Draft>(draft);
  const initializedRef = useRef(false);
  const restoredDraftRef = useRef(workingDraft?.profileId === profileId ? workingDraft : null);
  const sourceFingerprint = JSON.stringify({ loan: prefillLoan ?? null, refinance: refinanceContext ?? null });
  const sourceFingerprintRef = useRef(sourceFingerprint);
  const editorEditedRef = useRef(false);
  const onWorkingDraftRef = useRef(onWorkingDraftChange);
  onWorkingDraftRef.current = onWorkingDraftChange;
  const [sourceConflict, setSourceConflict] = useState(false);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const savedFingerprintRef = useRef("");
  const [draftVersion, setDraftVersion] = useState(0);
  const draftVersionRef = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [localView, setLocalView] = useState<ClientTermsView>("terms");
  const view = activeView ?? localView;
  const viewId = useId();
  const workspaceRef = useRef<HTMLElement | null>(null);
  const viewScroll = useRef<Record<ClientTermsView, number>>({ terms: 0, schedule: 0 });
  const changeView = (next: ClientTermsView) => {
    const scrollHost = workspaceRef.current?.closest(".drawer-b");
    if (scrollHost) viewScroll.current[view] = scrollHost.scrollTop;
    setLocalView(next); onViewChange?.(next);
  };
  useEffect(() => { const scrollHost = workspaceRef.current?.closest(".drawer-b"); if (scrollHost) scrollHost.scrollTop = viewScroll.current[view]; }, [view]);
  const query = useQuery({
    queryKey: ["application-client-terms", profileId],
    queryFn: () => api<ApplicationClientTerms>(`/application-profiles/${profileId}/client-terms`),
  });

  function remember(next: Draft) {
    onWorkingDraftRef.current?.({ profileId, draft: cloneDraft(next), baseVersion: draftVersionRef.current,
      savedFingerprint: savedFingerprintRef.current, sourceFingerprint: sourceFingerprintRef.current, editedInEditor: editorEditedRef.current });
  }

  useEffect(() => {
    if (!query.data) return;
    const saved = draftFromTerms(query.data);
    const fingerprint = JSON.stringify(saved);
    if (!initializedRef.current) {
      initializedRef.current = true;
      const restored = restoredDraftRef.current;
      const conflict = !!restored?.editedInEditor && restored.sourceFingerprint !== sourceFingerprint;
      const base = restored ? cloneDraft(restored.draft) : saved;
      const next = restored && (conflict || restored.sourceFingerprint === sourceFingerprint)
        ? base : draftWithScenarioLoan(base, prefillLoan, refinanceContext);
      draftRef.current = next;
      savedFingerprintRef.current = restored?.savedFingerprint ?? fingerprint;
      draftVersionRef.current = restored?.baseVersion ?? query.data.version;
      sourceFingerprintRef.current = conflict ? restored!.sourceFingerprint : sourceFingerprint;
      editorEditedRef.current = restored?.editedInEditor ?? false;
      setSourceConflict(conflict);
      setDraft(next);
      setSavedFingerprint(savedFingerprintRef.current);
      setDraftVersion(draftVersionRef.current);
      remember(next);
    } else {
      const dirtyNow = savedFingerprintRef.current !== JSON.stringify(draftRef.current);
      if (!dirtyNow && query.data.version !== draftVersionRef.current) {
        draftVersionRef.current = query.data.version;
        savedFingerprintRef.current = fingerprint;
        draftRef.current = saved;
        setDraft(saved); setSavedFingerprint(fingerprint); setDraftVersion(query.data.version);
        remember(saved);
      }
      if (sourceFingerprint !== sourceFingerprintRef.current) {
        if (editorEditedRef.current) setSourceConflict(true);
        else {
          const next = draftWithScenarioLoan(draftRef.current, prefillLoan, refinanceContext);
          sourceFingerprintRef.current = sourceFingerprint;
          draftRef.current = next; setDraft(next); remember(next);
        }
      }
    }
    if (query.data.version !== draftVersionRef.current) setError("A newer terms version is available. Your unsaved edits were preserved; review the latest saved version before saving or sending.");
    // Source fingerprints avoid reapplying the loan whenever parent callback identities change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.data, sourceFingerprint]);

  const repaymentIssue = repaymentPreview(finite(draft.amount), finite(draft.apr_pct), finite(draft.term_months), { structure: draft.loan_structure || null, interestOnlyMonths: finite(draft.interest_only_months), periodsPerYear: draft.repayment_frequency === "custom" ? finite(draft.custom_payments_per_year) ?? 0 : PERIODS[draft.repayment_frequency], repaymentConfig: draft.repayment_config }).error;
  const preview = useMemo(() => paymentPreview(draft), [draft]);
  const scenarioCoverage = previewScenario?.(loanFromClientDraft(draft), { treatment: draft.debt_service_treatment, retainedAnnualService: finite(draft.retained_annual_debt_service) });
  const coveragePreview = useMemo(() => clientTermsCoveragePreview(query.data?.calculation, draft.debt_service_treatment, finite(draft.retained_annual_debt_service), preview?.annual ?? null), [draft.debt_service_treatment, draft.retained_annual_debt_service, preview, query.data?.calculation]);
  const afterDscr = previewScenario ? scenarioCoverage?.after ?? null : coveragePreview.value;
  const riskExistingAnnual = previewScenario ? scenarioCoverage?.existingAnnual ?? null : coveragePreview.existingAnnual;
  const riskIncomeAnnual = previewScenario ? scenarioCoverage?.incomeAnnual ?? null : query.data?.calculation.cash_flow_value ?? null;

  const dirty = savedFingerprint !== JSON.stringify(draft);
  const offerSelection = useMemo<OfferSelection | null>(() => {
    const terms = query.data;
    if (!terms?.term_sheet_id || !terms.version || dirty || sourceConflict) return null;
    return {
      key: `application_term_sheet:${terms.term_sheet_id}:${terms.version}`,
      ref: { kind: "application_term_sheet", term_sheet_id: terms.term_sheet_id, expected_version: terms.version },
      label: "Financing terms",
      description: `${money(terms.amount, 0)} at ${terms.apr_pct == null ? "—" : `${terms.apr_pct}% APR`} for ${terms.term_months || "—"} months · version ${terms.version}`,
      fileName: `financing-terms-v${terms.version}.pdf`,
    };
  }, [dirty, query.data, sourceConflict]);

  useEffect(() => {
    onOfferReady?.(offerSelection);
  }, [offerSelection, onOfferReady]);

  const save = useMutation({
    mutationFn: async (submitted: { draft: Draft; version: number; plan?: FinancialPlanWrite }) => {
      const payload = payloadFromDraft(submitted.draft, submitted.version);
      if (submitted.plan) payload.financial_plan = { ...applyWorkingLoan(submitted.plan, loanFromClientDraft(submitted.draft)), expected_updated_at: submitted.plan.expected_updated_at ?? null };
      return api<ApplicationClientTerms>(`/application-profiles/${profileId}/client-terms`, { method: "PUT", body: JSON.stringify(payload) });
    },
    onSuccess: (data, submitted) => {
      const next = draftFromTerms(data);
      const fingerprint = JSON.stringify(next);
      const unchanged = JSON.stringify(draftRef.current) === JSON.stringify(submitted.draft);
      if (unchanged) { draftRef.current = next; setDraft(next); editorEditedRef.current = false; }
      savedFingerprintRef.current = fingerprint;
      draftVersionRef.current = data.version;
      setSavedFingerprint(fingerprint);
      setDraftVersion(data.version);
      setError("");
      setNotice(`Client terms v${data.version} saved.${data.financial_plan ? " The scenario and loan were saved together." : " Payment and DSCR were recalculated from the stored evidence."}${unchanged ? "" : " Further edits remain unsaved."}`);
      queryClient.setQueryData(["application-client-terms", profileId], data);
      for (const key of ["financial-cockpit", "financial-plan", "advances"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      remember(draftRef.current);
      onSaved?.(data, data.financial_plan);
    },
    onError: (reason) => {
      setNotice("");
      setError(reason instanceof Error ? reason.message : "The client terms could not be saved.");
    },
  });

  useEffect(() => { onPending?.(save.isPending || downloading); }, [save.isPending, downloading, onPending]);
  useEffect(() => () => onPending?.(false), [onPending]);

  async function downloadPdf() {
    if (!query.data?.version || dirty || sourceConflict) return;
    setDownloading(true);
    setError("");
    try {
      const token = isSignedIn ? await getToken() : null;
      const issued = query.data.status === "issued";
      const action = issued ? "client-terms.pdf" : "client-terms/issue.pdf";
      const response = await fetch(`${apiBase}/api/v1/application-profiles/${profileId}/${action}?expected_version=${draftVersion}`, {
        method: issued ? "GET" : "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!token && devUser ? { "X-Dev-User": devUser } : {}) },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || "The terms PDF could not be created.");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "financing-terms.pdf";
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`${filename} downloaded.`);
      const fresh = await query.refetch();
      if (fresh.data) onSaved?.(fresh.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The terms PDF could not be created.");
    } finally {
      setDownloading(false);
    }
  }

  function replaceDraft(next: Draft) {
    if (save.isPending || downloading || !canEdit) return;
    editorEditedRef.current = true;
    draftRef.current = next;
    setDraft(next);
    remember(next);
    setNotice("");
  }

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    const next = { ...draftRef.current, [key]: value };
    if (key === "term_months" && !next.loan_structure && next.repayment_config?.amortization_months != null) {
      const months = finite(next.term_months);
      if (months != null && next.repayment_config.amortization_months > months - (finite(next.interest_only_months) ?? 0)) next.loan_structure = "amortizing";
    }
    replaceDraft(next);
  }

  function setAmortization(raw: string) {
    const months = raw.trim() === "" ? null : Number(raw);
    const next = { ...draftRef.current, repayment_config: applyAmortizationMonths(draftRef.current.repayment_config, months) };
    const term = finite(next.term_months);
    if (!next.loan_structure && months != null && Number.isFinite(months) && term != null && months > term - (finite(next.interest_only_months) ?? 0)) next.loan_structure = "amortizing";
    replaceDraft(next);
  }

  function resolveScenarioSource(useScenario: boolean) {
    const next = useScenario ? draftWithScenarioLoan(draftRef.current, prefillLoan, refinanceContext) : draftRef.current;
    sourceFingerprintRef.current = sourceFingerprint;
    editorEditedRef.current = !useScenario;
    draftRef.current = next; setDraft(next); setSourceConflict(false); remember(next);
  }

  if (query.isLoading) return <div className="empty">Loading client terms...</div>;
  if (query.isError || !query.data) return <Callout tone="bad">Client terms are unavailable for this file.</Callout>;
  const terms = query.data;
  const versionConflict = terms.version !== draftVersion;
  const loanCanApply = !!preview && !repaymentIssue && (finite(draft.amount) ?? 0) > 0 && finite(draft.apr_pct) != null
    && finite(draft.apr_pct)! >= 0 && finite(draft.apr_pct)! <= 100 && (finite(draft.term_months) ?? 0) >= 1 && finite(draft.term_months)! <= 480;
  const loanLabel = terms.loan_type_options.find((option) => option.value === draft.loan_type)?.label ?? "Select a loan type";

  if (compact) {
    const onFile = Boolean(terms.version);
    return <section className="client-terms-shell client-terms-compact" aria-label="Client financing terms on file">
      <div className="client-terms-heading">
        <div>
          <span className="lbl">Client terms on file</span>
          <h3>{onFile ? `${terms.loan_type_label ?? loanLabel}: ${money(terms.amount, 0)}${terms.apr_pct != null ? ` at ${terms.apr_pct}%` : ""}${terms.term_months ? ` over ${terms.term_months} months` : ""}${terms.calculation?.structure_label ? ` · ${terms.calculation.structure_label.toLowerCase()}${terms.interest_only_months ? `, ${terms.interest_only_months} interest-only months first` : ""}` : ""}` : "No client terms yet"}</h3>
          <p className="sub">{onFile ? `${terms.status === "issued" ? "Issued" : "Draft"} v${terms.version}${terms.calculation?.periodic_payment != null ? ` · ${money(terms.calculation.periodic_payment, 2)} per payment` : ""}${terms.calculation?.dscr_after != null ? ` · coverage after acceptance ${ratio(terms.calculation.dscr_after)}` : ""}. Structured on the Financials tab; the client accepts here.` : "Structure the terms on the Financials tab; the report is the client's PDF, and the client accepts here."}</p>
        </div>
        <div className="client-terms-heading-actions">
          <CellChip tone={terms.status === "issued" ? "ok" : terms.version ? "warn" : "mut"}>{terms.version ? `${terms.status === "issued" ? "Issued" : "Draft"} · v${terms.version}` : "Not started"}</CellChip>
          {onSelectedChange && onFile ? <button type="button" className={cx("offer-row-select", selected && "on")} role="checkbox" aria-checked={selected} aria-label={`${selected ? "Remove" : "Select"} financing terms for client email`} title={`${selected ? "Remove" : "Select"} financing terms`} onClick={() => onSelectedChange(!selected)}><Icon name={selected ? "check" : "plus"} size={14} /></button> : null}
          {onEdit ? <Btn size="sm" onClick={onEdit}><Icon name="pencil" size={14} />{onFile ? "Edit in Financials" : "Structure in Financials"}</Btn> : null}
        </div>
      </div>
    </section>;
  }

  return <section ref={workspaceRef} className={`client-terms-shell ${scheduleStyles.workspace}`} aria-label="Client financing terms">
    <header className="client-terms-heading">
      <div>
        <span className="lbl">Client-ready financing terms</span>
        <h3>{view === "schedule" ? "Principal, interest, payoff progress and repayment risk." : "Structure the offer once. Payment, DSCR, PDF, and email stay in sync."}</h3>
        <p className="sub">{view === "schedule" ? "This schedule follows the current working terms. Return to Loan terms to edit, apply or save a version." : "APR and time drive the repayment schedule. DSCR is read-only and recalculated from file evidence."}</p>
      </div>
      <div className="client-terms-heading-actions">
        <CellChip tone={terms.status === "issued" ? "ok" : terms.version ? "warn" : "mut"}>{terms.version ? `${terms.status === "issued" ? "Issued" : "Draft"} · v${terms.version}` : "Not started"}</CellChip>
        {onSelectedChange ? <button
          type="button"
          className={cx("offer-row-select", selected && "on")}
          role="checkbox"
          aria-checked={selected}
          aria-label={`${selected ? "Remove" : "Select"} financing terms for client email`}
          title={offerSelection ? `${selected ? "Remove" : "Select"} financing terms` : dirty ? "Save your changes before selecting these terms" : "Save financing terms before selecting them"}
          disabled={!offerSelection}
          onClick={() => onSelectedChange(!selected)}
        ><span aria-hidden="true">{selected ? <Icon name="check" size={13} /> : null}</span><span>Financing terms</span></button> : null}
        <Btn onClick={downloadPdf} disabled={!terms.version || dirty || sourceConflict || save.isPending || downloading || (!canEdit && terms.status !== "issued")}>{downloading ? "Building PDF..." : terms.status === "issued" ? "Download issued PDF" : "Issue & download"}</Btn>
        <IconBtn className="pri" onClick={() => { setError(""); onSelectedChange?.(true); onCompose?.(); }} aria-label="Compose client email with financing terms" title="Add to client offer email" disabled={!offerSelection || terms.direct_client_contact_suppressed}><Icon name="mail" size={15} /></IconBtn>
      </div>
    </header>
    <nav className={scheduleStyles.tabs} role="tablist" aria-label="Loan terms and amortization views" onKeyDown={(event) => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next: ClientTermsView = event.key === "Home" ? "terms" : event.key === "End" ? "schedule" : view === "terms" ? "schedule" : "terms";
      changeView(next); document.getElementById(`${viewId}-${next}-tab`)?.focus();
    }}>
      <button type="button" id={`${viewId}-terms-tab`} role="tab" aria-selected={view === "terms"} aria-controls={`${viewId}-terms-panel`} tabIndex={view === "terms" ? 0 : -1} onClick={() => changeView("terms")}>Loan terms</button>
      <button type="button" id={`${viewId}-schedule-tab`} role="tab" aria-selected={view === "schedule"} aria-controls={`${viewId}-schedule-panel`} tabIndex={view === "schedule" ? 0 : -1} onClick={() => changeView("schedule")}>Amortization &amp; risk</button>
    </nav>
    <div className={scheduleStyles.tabBody} id={`${viewId}-terms-panel`} role="tabpanel" aria-labelledby={`${viewId}-terms-tab`} hidden={view !== "terms"}>
    {terms.direct_client_contact_suppressed ? <Callout tone="warn">Direct client contact is suppressed on this referral-managed file. Download the PDF and route it through the referring professional.</Callout> : null}
    {!terms.loan_type_options.length ? <Callout tone="bad">No active loan type is scoped to this file. Publish or scope a funding program before creating client terms.</Callout> : null}
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {notice ? <Callout tone="ok">{notice}</Callout> : null}
    {sourceConflict ? <Callout tone="warn"><div className="grid g8"><span>The scenario loan changed after this editor draft was kept. Your pending editor fields are preserved. Choose which loan to continue editing.</span><Row><Btn size="sm" disabled={!canEdit || save.isPending} onClick={() => resolveScenarioSource(true)}>Use current scenario loan</Btn><Btn size="sm" disabled={!canEdit || save.isPending} onClick={() => resolveScenarioSource(false)}>Keep editor loan</Btn></Row></div></Callout> : null}
    {onApplyLoan ? <p className="sub">Loan edits stay in this editor until you Apply loan to scenario or Save new version. Closing keeps this editor draft; it does not issue or send terms.</p> : null}
    {scenarioPaymentOnly ? <Callout tone="warn">The scenario has a manually entered monthly payment. It does not establish a principal amount, APR or loan term; enter those details to calculate matching terms.</Callout> : null}
    <fieldset disabled={!canEdit || save.isPending || downloading} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
    <div className="client-terms-layout">
      <div className="client-terms-editor">
        <section className="terms-form-section">
          <div className="terms-section-title"><span>1</span><div><b>Offer basics</b><small>Amount, APR, and time are the calculation anchors.</small></div></div>
          <div className="fldgrid two">
            <Field label="Loan type"><Select aria-label="Loan type" value={draft.loan_type} onChange={(event) => patch("loan_type", event.target.value)}><option value="">Choose from funding catalog</option>{terms.loan_type_options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
            <Field label="Amount"><Input aria-label="Amount" inputMode="decimal" value={draft.amount} onChange={(event) => patch("amount", event.target.value)} placeholder="750,000" /></Field>
            <Field label="APR"><div className="terms-input-suffix"><Input aria-label="APR" inputMode="decimal" value={draft.apr_pct} onChange={(event) => patch("apr_pct", event.target.value)} placeholder="12.99" /><span>%</span></div></Field>
            <Field label="Loan term / maturity"><div className="terms-input-suffix"><Input aria-label="Loan term / maturity in months" inputMode="numeric" value={draft.term_months} onChange={(event) => patch("term_months", event.target.value)} placeholder="24" /><span>months</span></div></Field>
          </div>
        </section>
        <section className="terms-form-section">
          <div className="terms-section-title"><span>2</span><div><b>Funding and repayment</b><small>Define who is funding and how the client pays.</small></div></div>
          <div className="fldgrid two">
            <Field label="Funder type"><Select aria-label="Funder type" value={draft.funder_type} onChange={(event) => patch("funder_type", event.target.value as ClientTermsFunderType)}><option value="">Choose funder type</option>{FUNDER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Funder name (optional)"><Input aria-label="Funder name" value={draft.funder_name} onChange={(event) => patch("funder_name", event.target.value)} placeholder="Capital source or bank" /></Field>
            <Field label="Repayment"><Select aria-label="Repayment frequency" value={draft.repayment_frequency} onChange={(event) => patch("repayment_frequency", event.target.value as ClientTermsRepaymentFrequency)}>{FREQUENCY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Debt-service impact"><Select aria-label="Debt-service impact" value={draft.debt_service_treatment} onChange={(event) => patch("debt_service_treatment", event.target.value as ClientTermsDebtTreatment)}><option value="additive">Add to current obligations</option><option value="refinance">Refinance / payoff current obligations</option></Select></Field>
            <Field label="Structure"><Select aria-label="Loan structure" value={draft.loan_structure} onChange={(event) => patch("loan_structure", event.target.value as LoanStructure | "")}><option value="">{`Automatic for this term: ${STRUCTURE_LABELS[defaultStructure(finite(draft.term_months))].toLowerCase()}`}</option><option value="simple_interest">Simple interest</option><option value="amortizing">Amortizing / declining balance</option><option value="interest_only">Interest-only to maturity</option></Select></Field>
            {draft.loan_structure !== "interest_only" ? <Field label="Interest-only months first"><Input aria-label="Interest-only months first" inputMode="numeric" value={draft.interest_only_months} onChange={(event) => patch("interest_only_months", event.target.value)} placeholder="0" /></Field> : null}
            <Field label="Amortization after interest-only (months)"><Input aria-label="Amortization after interest-only (months)" type="number" inputMode="numeric" min={1} max={1200} value={draft.repayment_config?.amortization_months == null ? "" : String(draft.repayment_config.amortization_months)} disabled={draft.loan_structure === "interest_only"} onChange={(event) => setAmortization(event.target.value)} placeholder="Use remaining loan term" /><small className="sub">Independent of maturity. This period starts after any interest-only months.</small>{draft.loan_structure === "interest_only" && draft.repayment_config?.amortization_months != null ? <Btn size="sm" onClick={() => setAmortization("")}>Remove amortization; keep principal payments</Btn> : null}</Field>
            <div className="grid g4"><span className="sub">Residual balloon at maturity</span><strong className="num">{preview ? money(preview.schedule.balloon, 2) : "Enter loan details to calculate"}</strong><small className="sub">Unpaid principal is due at the loan maturity{finite(draft.term_months) != null ? ` in month ${finite(draft.term_months)}` : ""}. Additional principal payments are set separately below.</small></div>
            {draft.repayment_frequency === "custom" ? <><Field label="Payments per year"><Input aria-label="Payments per year" type="number" inputMode="decimal" min={1} max={366} step="any" value={draft.custom_payments_per_year} onChange={(event) => patch("custom_payments_per_year", event.target.value)} placeholder="18" /></Field><Field label="Custom schedule label"><Input aria-label="Custom schedule label" value={draft.custom_repayment_label} onChange={(event) => patch("custom_repayment_label", event.target.value)} placeholder="Every 20 days" /></Field></> : null}
            {draft.debt_service_treatment === "refinance" ? <Field label="Annual debt service remaining after payoff"><Input aria-label="Annual debt service remaining after payoff" inputMode="decimal" value={draft.retained_annual_debt_service} onChange={(event) => patch("retained_annual_debt_service", event.target.value)} placeholder="0 for a full payoff" /></Field> : null}
          </div>
          <AdvancedRepaymentEditor amortizationAlreadyVisible value={draft.repayment_config} onChange={(config) => patch("repayment_config", config)} amount={finite(draft.amount)} ratePct={finite(draft.apr_pct)} termMonths={finite(draft.term_months)} structure={draft.loan_structure || defaultStructure(finite(draft.term_months))} interestOnlyMonths={finite(draft.interest_only_months)} periodsPerYear={draft.repayment_frequency === "custom" ? finite(draft.custom_payments_per_year) ?? 0 : PERIODS[draft.repayment_frequency]} />
        </section>
        <section className="terms-form-section">
          <div className="terms-section-title"><span>3</span><div><b>Timing and presentation</b><small>Set validity, closing expectation, and co-branding.</small></div></div>
          <div className="fldgrid two">
            <Field label="Time before expiration"><div className="terms-input-suffix"><Input aria-label="Time before expiration in days" inputMode="numeric" value={draft.expiration_days} onChange={(event) => patch("expiration_days", event.target.value)} /><span>days</span></div></Field>
            <Field label="Closing estimate after approval"><div className="terms-input-suffix"><Input aria-label="Closing estimate after approval in business days" inputMode="numeric" value={draft.closing_estimate_days} onChange={(event) => patch("closing_estimate_days", event.target.value)} /><span>business days</span></div></Field>
          </div>
          <label className="terms-check"><input type="checkbox" checked={draft.co_brand_enabled} onChange={(event) => patch("co_brand_enabled", event.target.checked)} /><span><b>Co-brand this PDF</b><small>Show Qualified Commercial with the sponsor partner.</small></span></label>
          {draft.co_brand_enabled ? <Field label="Sponsor partner"><Input aria-label="Sponsor partner" value={draft.sponsor_name} onChange={(event) => patch("sponsor_name", event.target.value)} placeholder="UrChoice" /></Field> : null}
          <Field label="Client note (optional)"><Textarea aria-label="Client note" rows={3} value={draft.client_note} onChange={(event) => patch("client_note", event.target.value)} placeholder="A short, client-facing explanation of this structure." /></Field>
          <Field label="Conditions (one per line)"><Textarea aria-label="Conditions" rows={4} value={draft.conditions} onChange={(event) => patch("conditions", event.target.value)} placeholder={"Final verification of financial information\nSatisfactory closing documentation"} /></Field>
        </section>
        <Row>{onApplyLoan ? <Btn onClick={() => onApplyLoan(loanFromClientDraft(draftRef.current))} disabled={save.isPending || sourceConflict || !loanCanApply}>Apply loan to scenario</Btn> : null}<Btn variant="pri" onClick={() => { setError(""); save.mutate({ draft: cloneDraft(draftRef.current), version: draftVersionRef.current, plan: financialPlanDraft }); }} disabled={save.isPending || !dirty || sourceConflict || versionConflict || !!repaymentIssue}>{save.isPending ? "Recalculating..." : terms.version ? "Save new version" : "Save client terms"}</Btn>{dirty ? <span className="terms-unsaved">Unsaved changes</span> : <span className="sub">Everything shown in the PDF matches version {terms.version || "—"}.</span>}</Row>
      </div>
      <aside className="terms-live-preview" aria-label="Live client terms preview">
        <div className="terms-preview-brand"><div className="qc-mini">QC</div><div><b>Qualified Commercial</b><span>Financing terms</span></div>{draft.co_brand_enabled ? <div className="terms-preview-sponsor"><small>with</small><b>{draft.sponsor_name || "UrChoice"}</b></div> : null}</div>
        <div className="terms-preview-title"><span>Prepared structure</span><h4>{loanLabel}</h4></div>
        <div className="terms-preview-hero"><span>Proposed amount</span><strong>{money(finite(draft.amount), 0)}</strong><div><b>{finite(draft.apr_pct) == null ? "—" : `${finite(draft.apr_pct)!.toFixed(2)}%`}</b><small>APR</small><b>{finite(draft.term_months) == null ? "—" : `${finite(draft.term_months)} mo`}</b><small>Time</small></div></div>
        {preview ? <LoanPaymentPhases schedule={preview.schedule} /> : <div className="terms-preview-payment"><span>Scheduled payments</span><strong>Not available</strong><small>Enter principal, APR, maturity and valid repayment details to calculate.</small></div>}
        {preview ? <LoanScheduleTable schedule={preview.schedule} title={`Schedule: ${describeSchedule(preview.schedule)}`} /> : null}
        {preview ? <p className="terms-preview-source terms-preview-risk"><strong>Principal at risk.</strong> {riskProfile(preview.schedule, riskIncomeAnnual == null ? null : riskIncomeAnnual / 12, riskExistingAnnual == null ? null : riskExistingAnnual / 12, scenarioCoverage?.incomeCurrencyComparable === true)?.words}{riskExistingAnnual == null ? " Existing debt service must be established before calculating coverage." : ""}</p> : null}
        <div className="terms-preview-dscr"><div><span>{previewScenario ? "Current coverage" : "Before acceptance"}</span><strong>{ratio(previewScenario ? scenarioCoverage?.before : terms.calculation.dscr_before)}</strong></div><i>→</i><div className="after"><span>{previewScenario ? "With this working loan" : "After acceptance"}</span><strong>{scenarioCoverage?.noDebtLeft ? "No debt left" : ratio(afterDscr)}</strong></div></div>
        <p className="terms-preview-source">{previewScenario ? `Working scenario · ${scenarioCoverage?.basis ?? "current inputs"}. ${scenarioCoverage?.unavailableReason ?? "Uses the current payoff selections, add-backs and calculation inputs."}` : <>{terms.calculation.dscr_explanation}<br />{terms.calculation.source}</>}</p>
        <CoverageFundingGap value={scenarioCoverage?.coverageReview} basis={scenarioCoverage?.basis ?? "Selected earnings"} />
        {terms.repayment_config ? <p className="terms-preview-source">{repaymentConfigLabel(terms.repayment_config)}</p> : null}
        {terms.plan ? (
          <div className="terms-preview-plan">
            <span className="lbl">Saved financial scenario</span>
            <p className="terms-preview-source">
              {terms.plan.terms_link?.summary ?? "No link to the plan yet."}
              {terms.plan.dscr ? ` Coverage today ${ratio(terms.plan.dscr.before)}${terms.plan.active ? ` → with the plan ${ratio(terms.plan.dscr.after)}` : ""}.` : ""}
            </p>
            {terms.plan.active && terms.plan.modifications.length ? <ul className="terms-preview-plan-list">{terms.plan.modifications.map((m) => <li key={m}>{m}</li>)}</ul> : null}
            {!prefillLoan && terms.plan.loan?.amount && (terms.plan.terms_link?.state === "plan_only" || terms.plan.terms_link?.state === "differs") ? (
              <Btn size="sm" onClick={() => { const loan = terms.plan!.loan!; replaceDraft({ ...draftRef.current, amount: String(loan.amount ?? ""), apr_pct: loan.rate_pct == null ? draftRef.current.apr_pct : String(loan.rate_pct), term_months: loan.term_months == null ? draftRef.current.term_months : String(loan.term_months), loan_structure: (loan.structure === "amortizing" || loan.structure === "simple_interest" || loan.structure === "interest_only" ? loan.structure : loan.interest_only ? "interest_only" : "") as LoanStructure | "", repayment_config: copyRepaymentConfig(loan.repayment_config), ...termsCadenceForPeriods(loan.payments_per_year ?? 12), interest_only_months: loan.interest_only_months == null ? "" : String(loan.interest_only_months) }); }}>
                Use the plan's loan: {money(terms.plan.loan.amount ?? null, 0)}{terms.plan.loan.rate_pct != null ? ` at ${terms.plan.loan.rate_pct}%` : ""}{terms.plan.loan.describe ? ` ${terms.plan.loan.describe}` : terms.plan.loan.interest_only ? " interest-only" : terms.plan.loan.term_months ? ` over ${terms.plan.loan.term_months} mo` : ""}
              </Btn>
            ) : null}
          </div>
        ) : null}
        <div className="terms-preview-timing"><span><small>Valid for</small><b>{draft.expiration_days || "—"} days</b></span><span><small>Estimated close</small><b>{draft.closing_estimate_days || "—"} business days</b></span></div>
        <p className="terms-preview-disclaimer">Indicative terms only. Subject to final underwriting, documentation, and funding-source approval.</p>
      </aside>
    </div>
    </fieldset>
    </div>
    <div className={scheduleStyles.tabBody} id={`${viewId}-schedule-panel`} role="tabpanel" aria-labelledby={`${viewId}-schedule-tab`} hidden={view !== "schedule"}>
      {preview && !repaymentIssue ? <><CoverageFundingGap value={scenarioCoverage?.coverageReview} basis={scenarioCoverage?.basis ?? "Selected earnings"} /><LoanScheduleReview schedule={preview.schedule} incomeMonthly={riskIncomeAnnual == null ? null : riskIncomeAnnual / 12} existingServiceMonthly={riskExistingAnnual == null ? null : riskExistingAnnual / 12} incomeCurrencyComparable={scenarioCoverage?.incomeCurrencyComparable === true} earningsBasis={scenarioCoverage?.basis ?? terms.calculation.source} /></> : <Callout tone="warn">{repaymentIssue ?? "Enter the principal, APR, maturity and repayment details in Loan terms to calculate the amortization schedule."}</Callout>}
    </div>
  </section>;
}
