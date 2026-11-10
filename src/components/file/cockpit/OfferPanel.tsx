"use client";

// The capital-partners panel, editable in place. An unfunded file is listed
// with suggested terms: the desk picks the products to offer (several if it
// wants), sees the amount, rate, term, payment and the coverage each leaves,
// and can take the system's suggestion (the largest amount the cockpit's
// income covers at 1.25x on the program's longest published term) or type its
// own. Saving writes the listing draft; publishing stays in the marketplace
// editor, where the PPM is attached. Readiness, loan terms on record and the
// package sit above the products so nothing is sent out blind.

import { useEffect, useMemo, useRef, useState } from "react";
import { Btn, CellChip, Input, Lbl, Select, StatusLine, Textarea, cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { LISTING_TONE, errorMessage } from "@/components/marketplace/shared";
import { MarketplacePublishStrip } from "@/components/marketplace/MarketplacePublishStrip";
import { useAuthedApi } from "@/hooks/useApi";
import {
  useCpCreateListing,
  useCpListing,
  useCpPatchListing,
  useCpPrefill,
  useCpSourceLookup,
  useCpSuggestTerms,
  useCpListingAiDraft,
  type CpListingProduct,
  type CpListingStatus,
  type CpOfferSuggestion,
  type CpOfferSuggestions,
} from "@/hooks/useCapitalPartners";
import type { ApplicationProgramReadiness, ApplicationTermSheetState } from "@/lib/applicationProfile";
import { compactMoney, dscrLabel, dscrStatusOf, dscrTone, dscrWithPayment, money, multiple, scheduleStatusShort, scheduleStatusTone, sourceLabel, type FinancialCockpit as Cockpit } from "@/lib/financialCockpit";
import { STRUCTURE_LABELS, defaultStructure, type LoanScheduleSummary, type LoanStructure, type RepaymentConfig } from "@/lib/loanSchedule";
import { LoanPaymentPhases } from "@/components/application/LoanPaymentPhases";
import { AdvancedRepaymentEditor } from "@/components/application/AdvancedRepaymentEditor";
import { copyRepaymentConfig, repaymentPreview } from "@/lib/repaymentConfig";
import type { CockpitPackageState } from "./FinancialCockpit";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import { workingLoanFromPlan } from "@/lib/loanTermsSync";
import { sharedFinancingOfferFields } from "@/lib/sharedFinancingOffer";
import { DealBudgetSection } from "@/components/file/DealBudgetSection";
import { useDealBudget } from "@/hooks/useDealBudget";
import { PreparationProgress } from "@/components/design-system/PreparationProgress";

type Props = {
  profileId: string;
  canPublish: boolean;
  canRecordTerms: boolean;
  programReadiness: ApplicationProgramReadiness | null;
  termSheet: ApplicationTermSheetState | null;
  packageState: CockpitPackageState;
  onRecordTerms: () => void;
  onOpenEvidence: () => void;
  onOpenPackage: () => void;
  onStructureLoan?: () => void;
};

type ProductDraft = {
  financing_source?: "canonical_financing" | null;
  key: string;
  program_key: string | null;
  label: string;
  amount: string;
  rate_pct: string;
  factor_rate: number | null;
  term_months: string;
  interest_only: boolean;
  structure: LoanStructure | null;
  interest_only_months: string;
  repayment_config: RepaymentConfig | null;
  payment_frequency: "monthly" | "weekly" | "biweekly" | "daily" | "custom" | null;
  payments_per_year: string;
  primary: boolean;
  notes: string | null;
  eligible: boolean | null;
};

let counter = 0;
const nextKey = () => `offer-${++counter}`;
const num = (value: string | number | null | undefined): number | null => {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(String(value).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value: number | string | null | undefined) => (value == null ? "" : String(value));

function fromListing(product: CpListingProduct): ProductDraft {
  return { financing_source: product.financing_source, key: nextKey(), program_key: product.program_key, label: product.label, amount: text(product.amount), rate_pct: text(product.rate_pct), factor_rate: num(product.factor_rate ?? null), term_months: text(product.term_months), interest_only: !!product.interest_only, structure: (product.structure as LoanStructure | null) ?? (product.interest_only ? "interest_only" : null), interest_only_months: text(product.interest_only_months ?? null), repayment_config: copyRepaymentConfig(product.repayment_config), payment_frequency: product.payment_frequency, payments_per_year: text(product.payments_per_year), primary: product.primary, notes: product.notes, eligible: null };
}
function fromSuggestion(item: CpOfferSuggestion, primary: boolean): ProductDraft {
  return { key: nextKey(), program_key: item.program_key, label: item.label, amount: text(item.amount), rate_pct: text(item.rate_pct), factor_rate: item.factor_rate, term_months: text(item.term_months), interest_only: !!item.interest_only, structure: (item.structure as LoanStructure | null) ?? null, interest_only_months: text(item.interest_only_months ?? null), repayment_config: copyRepaymentConfig(item.repayment_config), payment_frequency: (["daily", "weekly", "biweekly", "custom"].includes(item.payment_frequency) ? item.payment_frequency : "monthly") as ProductDraft["payment_frequency"], payments_per_year: text(item.payments_per_year), primary, notes: item.reading, eligible: item.eligible };
}
function toProduct(draft: ProductDraft, payment: number | null, dscr: number | null, coveragePayment: number | null, schedule: LoanScheduleSummary | null): CpListingProduct {
  return {
    financing_source: draft.financing_source,
    program_key: draft.program_key,
    label: draft.label.trim() || "Loan",
    amount: num(draft.amount),
    rate_pct: num(draft.rate_pct),
    factor_rate: draft.factor_rate,
    term_months: num(draft.term_months),
    interest_only: draft.interest_only || draft.structure === "interest_only",
    structure: draft.structure ?? defaultStructure(num(draft.term_months)),
    interest_only_months: draft.structure === "interest_only" ? null : num(draft.interest_only_months),
    repayment_config: copyRepaymentConfig(draft.repayment_config),
    payments_per_year: draft.payment_frequency === "custom" ? num(draft.payments_per_year) : null,
    payment_frequency: draft.payment_frequency ?? "monthly",
    monthly_payment: payment,
    coverage_payment_monthly: coveragePayment,
    interest_only_payment_monthly: schedule?.payment_io_monthly ?? null,
    repayment_payment_monthly: schedule?.payment_after_monthly ?? null,
    maturity_balance: schedule?.balloon ?? null,
    dscr,
    notes: draft.notes,
    primary: draft.primary,
  };
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function OfferPanel({ cockpit, props, innerRef, embedded = false, workingFinancing }: { cockpit: Cockpit; props: Props; innerRef: React.Ref<HTMLElement>; embedded?: boolean; workingFinancing?: WorkingFinancing | null }) {
  const { profileId, programReadiness, termSheet, packageState, canPublish, canRecordTerms, onRecordTerms, onOpenEvidence, onOpenPackage } = props;
  const api = useAuthedApi();
  const lookup = useCpSourceLookup({ profile_id: profileId }, canPublish);
  const listingId = lookup.data?.listing?.id ?? null;
  const listing = useCpListing(canPublish ? listingId : null);
  const suggestions = useCpSuggestTerms(profileId, null, canPublish);
  const prefill = useCpPrefill();
  const create = useCpCreateListing();
  const patch = useCpPatchListing();
  const budget = useDealBudget(profileId);
  const aiDraft = useCpListingAiDraft();
  const sectionRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [draftChoice, setDraftChoice] = useState({ title: true, summary: true });
  const [appliedDraft, setAppliedDraft] = useState<{ id: string; fingerprint: string } | null>(null);
  const touched = useRef({ title: false, summary: false });
  const autoRequested = useRef(false);
  const activeProfile = useRef(profileId);
  activeProfile.current = profileId;

  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [head, setHead] = useState({ name: "", offered_amount: "", minimum_investment: "", summary: "" });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const generateListingDraft = () => {
    const requestedProfile = profileId;
    aiDraft.mutate({ profile_id: profileId, ...(listingId ? { listing_id: listingId } : {}), expected_deal_budget_revision: budget.data?.revision, current_title: head.name, current_summary: head.summary, preserve_title: true, preserve_summary: true }, { onSuccess: () => { if (activeProfile.current === requestedProfile) setDraftChoice({ title: !touched.current.title, summary: !touched.current.summary }); } });
  };
  const generateRef = useRef(generateListingDraft); generateRef.current = generateListingDraft;
  useEffect(() => { autoRequested.current = false; touched.current = { title: false, summary: false }; setAppliedDraft(null); aiDraft.reset(); }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const element = sectionRef.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting && entry.target.getClientRects().length > 0)), { threshold: 0.01 });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!canPublish || !visible || lookup.isLoading || listingId || !budget.data || autoRequested.current) return;
    autoRequested.current = true; generateRef.current();
  }, [canPublish, visible, lookup.isLoading, listingId, budget.data]);
  const applyListingDraft = () => {
    if (!aiDraft.data || aiDraft.data.profile_id && aiDraft.data.profile_id !== profileId) return;
    if (budget.data && aiDraft.data.deal_budget_revision !== budget.data.revision) { setError("The budget changed after this listing draft was prepared. Regenerate the draft before applying it."); return; }
    setHead(current => ({ ...current, ...(draftChoice.title ? { name: aiDraft.data!.draft.name } : {}), ...(draftChoice.summary ? { summary: aiDraft.data!.draft.summary } : {}) }));
    setAppliedDraft({ id: aiDraft.data.draft_id, fingerprint: aiDraft.data.source_fingerprint }); setDirty(true);
    setNotice("The reviewed text was applied to this working listing. Save the listing draft when ready.");
  };

  // Seed from the listing when there is one, else from the suggestions, until the desk edits.
  useEffect(() => {
    if (dirty) return;
    if (listing.data) {
      setProducts(listing.data.products.map(fromListing));
      setHead({ name: listing.data.name ?? "", offered_amount: text(listing.data.offered_amount), minimum_investment: text(listing.data.minimum_investment), summary: listing.data.summary ?? "" });
    } else if (!listingId && suggestions.data) {
      const selected = new Set(programReadiness?.selections?.map((row) => row.program_key) ?? []);
      const first = suggestions.data.products.find((item) => item.program_key != null && selected.has(item.program_key));
      setProducts(first ? [fromSuggestion(first, true)] : []);
    }
  }, [dirty, listing.data, listingId, suggestions.data, programReadiness]);

  // The plan's income (add-backs, exclusions, overrides) and its debt service after retirements are what the offer stands on.
  const evaluation = cockpit.plan?.evaluation;
  const planIncome = evaluation?.active && evaluation.income_after_annual != null ? evaluation.income_after_annual : null;
  const income = suggestions.data?.income_annual ?? planIncome ?? cockpit.dscr.headline?.numerator ?? cockpit.dscr.candidates[0]?.numerator ?? null;
  const existingMonthly = suggestions.data?.existing_debt_service_monthly ?? evaluation?.debt_service_before_new_payment_monthly ?? cockpit.debt.service.monthly ?? null;
  const incomeLabel = suggestions.data?.income_label ?? (planIncome != null ? `${cockpit.dscr.headline?.numerator_label ?? "Income"} with the desk's plan` : cockpit.dscr.headline?.numerator_label ?? null);
  const incomeBasis = suggestions.data?.income_basis ?? cockpit.dscr.headline?.key ?? null;
  const sharedLoan = workingFinancing?.profileId === profileId ? workingLoanFromPlan(workingFinancing.plan) : null;
  const recordedReferenceOnly = !sharedLoan && cockpit.proposed_terms?.active_proposal === false;
  const canonicalProgram = cockpit.proposed_terms?.program_key ?? null;
  const canonicalProgramName = cockpit.proposed_terms?.program_name ?? null;
  const mirroredProducts = useMemo(() => {
    if (!sharedLoan) return products;
    const existing = canonicalProgram ? products.find((row) => row.program_key === canonicalProgram) : products.find((row) => row.primary) ?? products[0];
    const base: ProductDraft = existing ?? { key: `canonical-${profileId}`, program_key: canonicalProgram, label: canonicalProgramName || "Loan in coverage plan", amount: "", rate_pct: "", factor_rate: null, term_months: "", interest_only: false, structure: null, interest_only_months: "", repayment_config: null, payment_frequency: "monthly", payments_per_year: "", primary: true, notes: null, eligible: null };
    const primary = { ...base, ...sharedFinancingOfferFields(sharedLoan), program_key: canonicalProgram ?? base.program_key, label: canonicalProgramName || base.label, primary: true, financing_source: "canonical_financing" as const };
    return [primary, ...products.filter((row) => row.key !== existing?.key).map((row) => ({ ...row, primary: false, financing_source: null }))];
  }, [products, sharedLoan, canonicalProgram, canonicalProgramName, profileId]);
  const openPrograms = () => { const section = document.getElementById("fc-programs"); if (section instanceof HTMLDetailsElement) section.open = true; section?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  const computed = useMemo(
    () =>
      mirroredProducts.map((draft) => {
        const amount = num(draft.amount);
        const term = num(draft.term_months);
        const preview = repaymentPreview(amount, num(draft.rate_pct), term, { structure: draft.interest_only ? "interest_only" : draft.structure, interestOnlyMonths: num(draft.interest_only_months), periodsPerYear: draft.payment_frequency === "custom" ? num(draft.payments_per_year) ?? 0 : draft.payment_frequency === "daily" ? 252 : draft.payment_frequency === "weekly" ? 51.96 : draft.payment_frequency === "biweekly" ? 25.98 : 12, repaymentConfig: draft.repayment_config });
        const cadenceError = draft.payment_frequency === "custom" && (!(num(draft.payments_per_year)! >= 1) || num(draft.payments_per_year)! > 366) ? "Enter custom payments per year from 1 to 366." : null;
        const repaymentError = cadenceError ?? (draft.factor_rate && draft.repayment_config ? "Advanced repayment is unavailable for factor-priced offers. Reset it or use an APR-based offer." : preview.error);
        const factorPayment = draft.factor_rate && amount && term ? Math.round(((amount * draft.factor_rate) / term) * 100) / 100 : null;
        const payment = repaymentError ? null : factorPayment ?? preview.schedule?.payment_after_monthly ?? preview.schedule?.payment_io_monthly ?? null;
        const coveragePayment = repaymentError ? null : factorPayment ?? preview.schedule?.coverage_payment_monthly ?? null;
        // Do not round the annual underwriting basis through its displayed
        // monthly equivalent; maturity principal remains part of stress DSCR.
        const coverageMonthlyExact = repaymentError ? null : factorPayment ?? (preview.schedule ? preview.schedule.coverage_annual_debt_service / 12 : null);
        const dscr = sharedLoan && draft.primary ? workingFinancing?.projectedDscr ?? null : dscrWithPayment(income, existingMonthly, coverageMonthlyExact);
        return { draft, payment, coveragePayment, dscr, schedule: preview.schedule, repaymentError };
      }),
    [mirroredProducts, income, existingMonthly, sharedLoan, workingFinancing?.projectedDscr],
  );

  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const rows: Array<{ key: string; name: string; eligible: boolean | null; selected: boolean }> = [];
    for (const sel of programReadiness?.selections ?? []) {
      if (seen.has(sel.program_key)) continue;
      seen.add(sel.program_key);
      const cand = programReadiness?.candidates?.find((c) => c.program_key === sel.program_key);
      rows.push({ key: sel.program_key, name: sel.program_name, eligible: cand ? cand.eligible : null, selected: true });
    }
    for (const cand of programReadiness?.candidates ?? []) {
      if (seen.has(cand.program_key)) continue;
      seen.add(cand.program_key);
      rows.push({ key: cand.program_key, name: cand.program_name, eligible: cand.eligible, selected: false });
    }
    if (!seen.has("private_loan_bridge")) rows.push({ key: "private_loan_bridge", name: "Private Loan / Bridge", eligible: null, selected: false });
    return rows;
  }, [programReadiness]);

  const update = (key: string, patchDraft: Partial<ProductDraft>) => {
    setDirty(true);
    setProducts((current) => current.map((p) => (p.key === key ? { ...p, ...patchDraft } : p)));
  };
  const makePrimary = (key: string) => {
    setDirty(true);
    setProducts((current) => current.map((p) => ({ ...p, primary: p.key === key, financing_source: p.key === key ? p.financing_source : null })));
  };
  const remove = (key: string) => {
    setDirty(true);
    setProducts((current) => {
      const next = current.filter((p) => p.key !== key);
      if (next.length && !next.some((p) => p.primary)) next[0] = { ...next[0], primary: true };
      return next;
    });
  };
  const addProgram = async (programKey: string, name: string, eligible: boolean | null) => {
    setDirty(true);
    setError(null);
    let suggestion = suggestions.data?.products.find((p) => p.program_key === programKey) ?? null;
    if (!suggestion) {
      try {
        const fetched = await api<CpOfferSuggestions>(`/capital/admin/sources/suggest-terms?profile_id=${encodeURIComponent(profileId)}&program_keys=${encodeURIComponent(programKey)}`);
        suggestion = fetched.products[0] ?? null;
      } catch {
        suggestion = null;
      }
    }
    setProducts((current) => [
      ...current,
      suggestion
        ? { ...fromSuggestion(suggestion, current.length === 0), eligible }
        : { key: nextKey(), program_key: programKey, label: name, amount: "", rate_pct: "16", factor_rate: null, term_months: "120", interest_only: false, structure: null, interest_only_months: "", repayment_config: null, payment_frequency: "monthly", payments_per_year: "", primary: current.length === 0, notes: null, eligible },
    ]);
  };
  const suggestAll = async () => {
    setError(null);
    const keys = products.map((p) => p.program_key).filter((k): k is string => !!k);
    if (!keys.length) return;
    try {
      const fetched = await api<CpOfferSuggestions>(`/capital/admin/sources/suggest-terms?profile_id=${encodeURIComponent(profileId)}&program_keys=${encodeURIComponent(keys.join(","))}`);
      setDirty(true);
      setProducts((current) =>
        current.map((p) => {
          const item = fetched.products.find((s) => s.program_key === p.program_key);
          if (!item) return p;
          return { ...p, amount: text(item.amount), rate_pct: text(item.rate_pct), factor_rate: item.factor_rate, term_months: text(item.term_months), interest_only: !!item.interest_only, structure: (item.structure as LoanStructure | null) ?? p.structure, interest_only_months: text(item.interest_only_months ?? null) || p.interest_only_months, repayment_config: copyRepaymentConfig(item.repayment_config ?? p.repayment_config), notes: item.reading, eligible: item.eligible };
        }),
      );
      setNotice("Suggested terms applied. Each line reads the amount the income supports at 1.25x on the program's longest term, capped by the program and the request.");
    } catch (e) {
      setError(errorMessage(e, "Suggestions are not available right now."));
    }
  };

  const repaymentError = computed.find((item) => item.repaymentError)?.repaymentError;
  const payload = () => { if (repaymentError) throw new Error(repaymentError); return computed.map(({ draft, payment, dscr, coveragePayment, schedule }) => toProduct(draft, payment, dscr, coveragePayment, schedule)); };
  const primary = computed.find(({ draft }) => draft.primary) ?? computed[0] ?? null;
  const listedPrimary = listing.data?.products.find((product) => product.primary) ?? listing.data?.products[0];
  const unreviewedExistingFunding = Boolean(listing.data && budget.data?.revision === 0);
  const loanFingerprint = (product: Partial<CpListingProduct> | null | undefined) => JSON.stringify(product ? [product.program_key, num(product.amount), num(product.rate_pct), num(product.term_months), product.structure, num(product.interest_only_months) ?? 0, product.payment_frequency, num(product.payments_per_year), product.repayment_config ?? null, product.dscr] : null);
  const sharedProposalChanged = Boolean(sharedLoan && primary && listing.data && loanFingerprint(toProduct(primary.draft, primary.payment, primary.dscr, primary.coveragePayment, primary.schedule)) !== loanFingerprint(listedPrimary));
  const headlinePatch = () => ({
    expected_deal_budget_revision: budget.data?.revision,
    ...(appliedDraft ? { ai_draft_id: appliedDraft.id, expected_source_fingerprint: appliedDraft.fingerprint } : {}),
    products: payload(),
    // Decimals travel as strings on the listing API.
    ...(primary
      ? {
          program_label: primary.draft.label.trim() || undefined,
          note_rate_pct: num(primary.draft.rate_pct) == null ? undefined : String(num(primary.draft.rate_pct)),
          term_months: num(primary.draft.term_months) == null ? undefined : num(primary.draft.term_months) as number,
          loan_amount: num(primary.draft.amount) == null ? undefined : String(num(primary.draft.amount)),
          ...(!unreviewedExistingFunding ? { offered_amount: num(budget.data?.calculation.investor_funding_amount as number | string | null) == null ? undefined : String(budget.data?.calculation.investor_funding_amount) } : {}),
        }
      : {}),
    ...(head.name.trim() ? { name: head.name.trim() } : {}),
    ...(!unreviewedExistingFunding && num(budget.data?.calculation.minimum_investor_contribution as number | string | null) != null ? { minimum_investment: String(budget.data?.calculation.minimum_investor_contribution) } : {}),
    ...(head.summary.trim() ? { summary: head.summary.trim() } : {}),
  });

  const save = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await budget.verifyRevision();
      if (workingFinancing?.dirty) throw new Error("Save the shared coverage plan or terms before updating the marketplace proposal.");
      if (recordedReferenceOnly) throw new Error("The active coverage loan was cleared. Structure and save a new proposal before updating the marketplace listing; the old terms remain a historical reference.");
      if (!primary) throw new Error("Choose a primary product before creating its marketplace proposal.");
      if (!listingId && (!packageState.generated || !packageState.inSync)) throw new Error("Generate a current investor package before creating its marketplace listing.");
      if (listingId) {
        await patch.mutateAsync({ id: listingId, ...headlinePatch() });
        setDirty(false);
        setNotice("Saved to the listing draft.");
      } else {
        const draft = await prefill.mutateAsync({ profile_id: profileId });
        if (draft.existing_listing) {
          await patch.mutateAsync({ id: draft.existing_listing.id, ...headlinePatch() });
        } else {
          const { existing_listing: _existing, ...rest } = draft;
          const created = await create.mutateAsync({ ...rest, ...headlinePatch() });
          setNotice(`Listing draft ${created.ref} started. Attach the PPM and publish from the marketplace editor.`);
        }
        setDirty(false);
        await lookup.refetch();
      }
    } catch (e) {
      setError(errorMessage(e, "The listing could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const selection = programReadiness?.selections?.[0] ?? null;
  const candidate = selection ? programReadiness?.candidates?.find((c) => c.program_key === selection.program_key) ?? null : null;
  const eligibility: { tone: ChipTone; label: string } = !selection
    ? { tone: "mut", label: "No program selected" }
    : candidate?.eligible
      ? { tone: "ok", label: candidate.requires_review ? "Eligible on estimates" : "Eligible" }
      : candidate
        ? { tone: "bad", label: "Not eligible" }
        : { tone: "mut", label: "Eligibility unknown" };
  const coverage = cockpit.coverage;
  const sheet = termSheet?.current ?? null;
  const status = (lookup.data?.listing?.status ?? null) as CpListingStatus | null;
  const editable = canPublish && (!status || status === "draft" || status === "open");

  return (
    <section className={embedded ? "grid g12" : "fc-card fc-wide"} id="fc-marketplace" ref={node => { sectionRef.current = node; if (typeof innerRef === "function") innerRef(node); else if (innerRef) (innerRef as { current: HTMLElement | null }).current = node; }}>
      <div className="fc-card-h">
        <div>
          <h4>{embedded ? "Offering terms & marketplace listing" : "Investor package & capital partners"}</h4>
          <div className="sub">
            The primary offer uses the loan in the coverage plan. Choose its product here; program qualification stays with the file’s evidence and criteria.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {props.onStructureLoan ? <Btn size="sm" variant="pri" onClick={props.onStructureLoan}><Icon name="pencil" size={13} />Structure loan / Coverage plan</Btn> : null}
          {lookup.data?.listing ? (
            <>
              <CellChip tone={LISTING_TONE[lookup.data.listing.status] ?? "mut"}>{lookup.data.listing.ref} · {lookup.data.listing.status.replace(/_/g, " ")}</CellChip>
              <Btn size="sm" onClick={() => window.location.assign(`/admin/marketplace/${lookup.data?.listing?.id}`)}>
                Documents and publish <Icon name="arrowR" size={13} />
              </Btn>
            </>
          ) : null}
          {!canPublish ? <span className="sub">A super admin publishes listings.</span> : null}
        </div>
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {notice ? <StatusLine tone="ok">{notice}</StatusLine> : null}

      <div className="fc-listing-grid">
        <div className="fc-listing-item">
          <Lbl>Program on the file</Lbl>
          <strong>{selection?.program_name ?? "None selected"}</strong>
          <div className="fc-chips"><CellChip tone={eligibility.tone}>{eligibility.label}</CellChip> <button type="button" className="linky" onClick={openPrograms}>Review program criteria</button></div>
        </div>
        <div className="fc-listing-item">
          <Lbl>Evidence</Lbl>
          <strong>{coverage.bank_months_accepted} of {coverage.bank_months_required} statement months accepted</strong>
          <div className="fc-chips">
            <CellChip tone={coverage.tax_years.length ? "ok" : "warn"}>{coverage.tax_years.length ? `Tax years ${coverage.tax_years.join(", ")}` : "No tax return"}</CellChip>
            <CellChip tone={scheduleStatusTone(coverage.debt_schedule_status ?? "missing")}>Debt schedule · {scheduleStatusShort(coverage.debt_schedule_status ?? "missing", coverage.debt_rows)}</CellChip>
          </div>
          <Btn size="sm" onClick={onOpenEvidence}>Open the evidence room</Btn>
        </div>
        <div className="fc-listing-item">
          <Lbl>Loan terms on record</Lbl>
          <strong>{sharedLoan ? `${money(sharedLoan.amount)} at ${sharedLoan.ratePct ?? "—"}% for ${sharedLoan.termMonths ?? "—"} mo` : sheet ? `${money(sheet.approved_amount)} at ${sheet.rate_pct}% for ${sheet.term_months} mo` : cockpit.proposed_terms ? `${money(cockpit.proposed_terms.amount)} at ${cockpit.proposed_terms.rate_pct ?? "—"}%` : "Not recorded"}</strong>
          <div className="sub">{sharedLoan ? workingFinancing?.dirty ? "Working loan · save before updating the listing" : "Mirrored from the saved coverage plan" : recordedReferenceOnly ? "Historical terms reference · no active proposal" : sheet ? `${sheet.funding_party_name} · v${sheet.version}` : "Structure the shared loan before preparing its offering."}</div>
          {canRecordTerms && !props.onStructureLoan ? <Btn size="sm" onClick={onRecordTerms}>{sheet ? "Update loan terms" : "Record loan terms"}</Btn> : null}
        </div>
        <div className="fc-listing-item">
          <Lbl>Package</Lbl>
          <strong>{packageState.generated ? `Summary v${packageState.summaryVersion ?? "?"} · packet v${packageState.packetVersion ?? "?"}` : "Not generated"}</strong>
          <div className="fc-chips"><CellChip tone={!packageState.generated ? "mut" : packageState.inSync ? "ok" : "warn"}>{!packageState.generated ? "Generate before creating a listing" : packageState.inSync ? "Current" : "Needs a refresh"}</CellChip></div>
          <Btn size="sm" onClick={onOpenPackage}>Package readiness</Btn>
        </div>
        {cockpit.plan?.evaluation?.active ? (
          <div className="fc-listing-item">
            <Lbl>The plan</Lbl>
            <strong>{cockpit.plan.evaluation.retired_count} obligation{cockpit.plan.evaluation.retired_count === 1 ? "" : "s"} paid off · needs {money(cockpit.plan.evaluation.loan_amount_needed)}</strong>
            <div className="sub">Debt service after payoffs {money(cockpit.plan.evaluation.debt_service_before_new_payment_monthly)} / mo; the suggestions below size the loan to cover the payoffs.</div>
          </div>
        ) : null}
        <div className="fc-listing-item">
          <Lbl>Coverage basis</Lbl>
          <strong>{income == null ? "No income figure yet" : `${compactMoney(income)} a year`}</strong>
          <div className="sub">{income == null ? "A tax return, a P&L or three months of statements gives one." : `${incomeLabel ?? sourceLabel(incomeBasis)} · today's debt service ${money(existingMonthly)} / mo (${sourceLabel(cockpit.debt.service.source)})`}</div>
        </div>
      </div>

      {canPublish ? (
        <>
          <DealBudgetSection profileId={profileId} disabled={!editable} compact={false} existingFunding={listing.data ? { capital: num(listing.data.offered_amount), minimum: num(listing.data.minimum_investment) } : undefined} />
          <div className="grid g8" aria-label="Selected offering product">
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}><Lbl>Product to offer</Lbl><strong>{primary?.draft.label || "Choose a product"}</strong>{primary ? <span className="sub">{money(num(primary.draft.amount))} · {multiple(primary.dscr)} projected DSCR</span> : null}{sharedLoan ? <CellChip tone="acc">Shared coverage loan</CellChip> : null}{sharedProposalChanged ? <CellChip tone="warn">Listing needs the current proposal</CellChip> : null}</div>
            <details>
              <summary>Choose product / add an alternative</summary>
              <div className="grid g8" style={{ paddingTop: 8, maxWidth: 620 }}>
                <Input aria-label="Search offering products" placeholder="Search products…" value={productSearch} onChange={(event) => setProductSearch(event.target.value)} />
                <Select aria-label="Add offering product" value="" disabled={!editable || mirroredProducts.length >= (sharedLoan ? 9 : 8)} onChange={(event) => { const candidate = candidates.find((row) => row.key === event.target.value); if (candidate) void addProgram(candidate.key, candidate.name, candidate.eligible); }}>
                  <option value="">{primary ? "Add an alternative product…" : "Choose the primary product…"}</option>
                  {candidates.filter((row) => !mirroredProducts.some((product) => product.program_key === row.key) && row.name.toLowerCase().includes(productSearch.toLowerCase())).map((row) => <option key={row.key} value={row.key}>{row.name}{row.eligible === false ? " · criteria not met" : row.eligible == null ? " · qualification unconfirmed" : ""}</option>)}
                </Select>
                <p className="sub">Choosing a product does not establish program eligibility. Private Loan / Bridge is reviewed individually. Choose the primary product in the shared loan terms; alternatives keep their own terms here.</p>
                {!sharedLoan && products.length ? <Btn size="sm" onClick={() => void suggestAll()} disabled={!editable || suggestions.isLoading}>Suggest alternative terms</Btn> : null}
              </div>
            </details>
          </div>
          <details>
            <summary>Product details and alternative terms · {computed.length} product{computed.length === 1 ? "" : "s"}</summary>
          {computed.length ? (
            <div className="tbl-wrap">
              <table className="tbl fc-adv-table fc-offer-table">
                <thead>
                  <tr>
                    <th>Primary</th>
                    <th>Product</th>
                    <th className="r">Amount</th>
                    <th className="r">{computed.some(({ draft }) => draft.factor_rate) ? "Rate % / factor" : "Rate %"}</th>
                    <th className="r">Maturity (mo)</th>
                    <th>Structure</th>
                    <th className="r">Regular monthly equivalent</th>
                    <th>Coverage</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {computed.map(({ draft, payment, coveragePayment, dscr, schedule }) => {
                    const status = dscrStatusOf(dscr);
                    return (
                      <tr key={draft.key}>
                        <td><input type="radio" name="primary-product" aria-label={`Make ${draft.label} the primary product`} checked={draft.primary} disabled={!editable || Boolean(sharedLoan && canonicalProgram)} onChange={() => makePrimary(draft.key)} /></td>
                        <td>
                          <Input aria-label="Product label" value={draft.label} disabled={!editable || Boolean(sharedLoan && draft.primary)} onChange={(e) => update(draft.key, { label: e.target.value })} />
                          {draft.eligible === false ? <small className="sub" style={{ display: "block" }}>Not eligible on today's facts</small> : null}
                          {draft.notes ? <small className="sub" style={{ display: "block" }}>{draft.notes}</small> : null}
                        </td>
                        <td className="r num"><Input aria-label="Amount" inputMode="decimal" value={draft.amount} disabled={!editable || Boolean(sharedLoan && draft.primary)} onChange={(e) => update(draft.key, { amount: e.target.value })} /></td>
                        <td className="r num">{draft.factor_rate ? <span>{draft.factor_rate.toFixed(2)} factor</span> : <Input aria-label="Rate percent" inputMode="decimal" value={draft.rate_pct} disabled={!editable || Boolean(sharedLoan && draft.primary)} onChange={(e) => update(draft.key, { rate_pct: e.target.value })} />}</td>
                        <td className="r num"><Input aria-label="Term in months" inputMode="numeric" value={draft.term_months} disabled={!editable || Boolean(sharedLoan && draft.primary)} onChange={(e) => update(draft.key, { term_months: e.target.value })} /></td>
                        <td>
                          {draft.factor_rate ? <span className="sub">Factor</span> : (
                            <div className="grid g2">
                              <Select aria-label="Loan structure" value={draft.interest_only ? "interest_only" : (draft.structure ?? defaultStructure(num(draft.term_months)))} disabled={!editable || Boolean(sharedLoan && draft.primary)} onChange={(e) => update(draft.key, { structure: e.target.value as LoanStructure, interest_only: e.target.value === "interest_only" })}>
                                {(Object.keys(STRUCTURE_LABELS) as LoanStructure[]).map((k) => <option key={k} value={k}>{STRUCTURE_LABELS[k]}</option>)}
                              </Select>
                              {!(draft.interest_only || draft.structure === "interest_only") ? <Input aria-label="Interest-only months first" inputMode="numeric" placeholder="IO months first" value={draft.interest_only_months} disabled={!editable || Boolean(sharedLoan && draft.primary)} onChange={(e) => update(draft.key, { interest_only_months: e.target.value })} /> : null}
                            </div>
                          )}
                        </td>
                        <td className="r num"><strong>{money(payment, 2)}</strong>{schedule?.payment_io_monthly != null && schedule.payment_after_monthly != null ? <small className="sub" style={{ display: "block" }}>{money(schedule.payment_io_monthly, 2)} / mo interest-only first</small> : null}{draft.interest_only ? <small className="sub" style={{ display: "block" }}>interest; principal at maturity</small> : null}{coveragePayment != null && payment != null && Math.abs(coveragePayment - payment) > 0.01 ? <small className="sub" style={{ display: "block" }}>Underwriting stress {money(coveragePayment, 2)} / mo</small> : null}</td>
                        <td>
                          <span className={cx("fc-chips")}>
                            <strong className="num">{multiple(dscr)}</strong>
                            <CellChip tone={dscrTone(status)}>{dscrLabel(status).split(" (")[0]}</CellChip>
                          </span>
                        </td>
                        <td>{editable && !(sharedLoan && draft.primary) ? <button type="button" className="fc-adv-remove" aria-label={`Remove ${draft.label}`} onClick={() => remove(draft.key)}><Icon name="x" size={13} /></button> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fc-empty">{suggestions.isLoading ? "Working out what the income supports…" : "No products yet. Add one above; the suggestion fills in the terms the income supports."}</div>
          )}
          {computed.filter(({ draft }) => !(sharedLoan && draft.primary)).map(({ draft, schedule, repaymentError: issue }) => <section key={draft.key} aria-label={`${draft.label} repayment details`}><span className="sub">{draft.label || "Loan"} repayment</span><Select aria-label={`${draft.label} payment frequency`} value={draft.payment_frequency ?? "monthly"} disabled={!editable} onChange={(event) => update(draft.key, { payment_frequency: event.target.value as ProductDraft["payment_frequency"] })}><option value="monthly">Monthly</option><option value="weekly">Weekly</option><option value="biweekly">Every two weeks</option><option value="daily">Daily (business days)</option><option value="custom">Custom</option></Select>{draft.payment_frequency === "custom" ? <label>Payments per year<Input aria-label={`${draft.label} custom payments per year`} type="number" min={1} max={366} step="any" value={draft.payments_per_year} disabled={!editable} onChange={(event) => update(draft.key, { payments_per_year: event.target.value })} /></label> : null}<AdvancedRepaymentEditor value={draft.repayment_config} onChange={(config) => update(draft.key, { repayment_config: config })} amount={num(draft.amount)} ratePct={num(draft.rate_pct)} termMonths={num(draft.term_months)} structure={draft.interest_only ? "interest_only" : draft.structure ?? defaultStructure(num(draft.term_months))} interestOnlyMonths={num(draft.interest_only_months)} periodsPerYear={draft.payment_frequency === "custom" ? num(draft.payments_per_year) ?? 0 : draft.payment_frequency === "daily" ? 252 : draft.payment_frequency === "weekly" ? 51.96 : draft.payment_frequency === "biweekly" ? 25.98 : 12} disabled={!editable} unsupportedReason={draft.factor_rate ? "Advanced repayment requires an APR-based offer; factor pricing keeps its stated repayment." : null} />{schedule && !issue && !draft.factor_rate ? <LoanPaymentPhases schedule={schedule} /> : null}</section>)}
          </details>
          {workingFinancing?.dirty ? <StatusLine tone="warn">The shared loan has unsaved changes. Save the coverage plan or terms before updating the marketplace listing.</StatusLine> : null}
          {recordedReferenceOnly ? <StatusLine tone="warn">No active loan proposal. The earlier terms are retained for history; structure and save a loan in the coverage plan before updating the listing.</StatusLine> : null}
          <div className="fc-listing-grid">
            <div className="fc-listing-item">
              <Lbl>Deal title</Lbl>
              <Input aria-label="Deal title" value={head.name} disabled={!editable} placeholder="Review the title drafted from this file" onChange={(e) => { touched.current.title = true; setDraftChoice(current => ({ ...current, title: false })); setDirty(true); setHead({ ...head, name: e.target.value }); }} />
            </div>
            <div className="fc-listing-item">
              <Lbl>Capital to raise from investors</Lbl>
              <strong>{money(unreviewedExistingFunding ? num(listing.data?.offered_amount) : num(budget.data?.calculation.investor_funding_amount as number | string | null))}</strong><small className="sub">{unreviewedExistingFunding ? "Existing listing capital · review the budget before changing its funding." : "Shared deal budget · full loan funding by default."}</small>
            </div>
            <div className="fc-listing-item">
              <Lbl>{unreviewedExistingFunding || budget.data?.funding_mode === "multiple_investors" ? "Smallest investor contribution" : "One investor contributes"}</Lbl>
              <strong>{money(unreviewedExistingFunding ? num(listing.data?.minimum_investment) : num(budget.data?.calculation.minimum_investor_contribution as number | string | null))}</strong><small className="sub">{unreviewedExistingFunding ? "Existing listing minimum is preserved until you review and save the budget." : "Choose Multiple investors in the deal budget to split the raise."}</small>
            </div>
          </div>
          <div className="grid g4">
            <Lbl>Summary members read</Lbl>
            <Textarea rows={2} aria-label="Listing summary" value={head.summary} disabled={!editable} placeholder="Review the investor summary drafted from this file." onChange={(e) => { touched.current.summary = true; setDraftChoice(current => ({ ...current, summary: false })); setDirty(true); setHead({ ...head, summary: e.target.value }); }} />
          </div>
          <section className="grid g8" aria-label="AI listing draft">
            <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}><strong>Listing draft from the file</strong><Btn size="sm" disabled={!editable || aiDraft.isPending || !budget.data} onClick={generateListingDraft}><Icon name="sparkles" size={13} />{aiDraft.isPending ? "Preparing draft…" : aiDraft.data ? "Regenerate listing draft" : "Draft listing from file"}</Btn></div>
            {aiDraft.isPending ? <PreparationProgress compact title="Preparing the investor listing" description="Reading the structured loan, reviewed budget and financial evidence. Nothing is published." /> : null}
            {aiDraft.error ? <StatusLine tone="warn">{errorMessage(aiDraft.error, "The listing draft could not be prepared. Your edits are retained.")}<Btn size="sm" onClick={generateListingDraft}>Retry listing draft</Btn></StatusLine> : null}
            {aiDraft.data && (!aiDraft.data.profile_id || aiDraft.data.profile_id === profileId) ? <div className="grid g8" style={{ border: "1px solid var(--line)", borderRadius: 10, padding: 12 }}>
              <div className="fc-chips"><CellChip tone="acc">{aiDraft.data.status === "ai_draft" ? "AI text draft · review before saving" : "File-based draft · review before saving"}</CellChip><span className="sub">Budget revision {aiDraft.data.deal_budget_revision}</span></div>
              <label className="row"><input type="checkbox" aria-label="Use drafted deal title" checked={draftChoice.title} onChange={event => setDraftChoice(current => ({ ...current, title: event.target.checked }))} /><strong>{aiDraft.data.draft.name}</strong></label>
              <label style={{ display: "flex", gap: 8, alignItems: "start" }}><input type="checkbox" aria-label="Use drafted listing summary" checked={draftChoice.summary} onChange={event => setDraftChoice(current => ({ ...current, summary: event.target.checked }))} /><span style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{aiDraft.data.draft.summary}</span></label>
              <p className="sub">Your manual title and summary are retained. Select a drafted field explicitly to replace it. Investor funding and costs come from the shared budget.</p>
              {budget.data && aiDraft.data.deal_budget_revision !== budget.data.revision ? <StatusLine tone="warn">The budget changed after this draft was prepared. Regenerate it before applying or saving its text.</StatusLine> : null}
              {[...aiDraft.data.missing, ...aiDraft.data.warnings].length ? <StatusLine tone="warn">{[...aiDraft.data.missing, ...aiDraft.data.warnings].join(" · ")}</StatusLine> : null}
              <details><summary>Sources used for this draft</summary>{aiDraft.data.field_provenance.map((source, index) => <p key={index} className="sub"><strong>{source.field}</strong> · {source.source}: {source.explanation}</p>)}</details>
              <Btn size="sm" onClick={applyListingDraft} disabled={!editable || !draftChoice.title && !draftChoice.summary || Boolean(budget.data && aiDraft.data.deal_budget_revision !== budget.data.revision)}>Apply selected draft text</Btn>
            </div> : null}
          </section>
          {repaymentError ? <StatusLine tone="bad">{repaymentError} Resolve the repayment schedule before saving.</StatusLine> : null}
          {listingId && !embedded ? <MarketplacePublishStrip profileId={profileId} packageInSync={packageState.inSync} canPublish={canPublish} compact /> : null}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn variant="pri" size="sm" onClick={() => void save()} disabled={busy || !editable || !primary || recordedReferenceOnly || !!repaymentError || !!workingFinancing?.dirty || (!!listingId && !dirty && !sharedProposalChanged) || (!listingId && (!packageState.generated || !packageState.inSync))}>
              {busy ? "Saving…" : listingId ? "Save terms to the listing" : "Create marketplace listing draft"}
            </Btn>
            {dirty ? <span className="sub">Unsaved changes.</span> : null}
            {status && status !== "draft" ? <span className="sub">The listing is {status.replace(/_/g, " ")}; saved terms go live for members immediately.</span> : null}
            {listingId ? <span className="sub">Publishing (and the PPM) happens in the marketplace editor.</span> : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
