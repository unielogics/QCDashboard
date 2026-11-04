"use client";

// The capital-partners panel, editable in place. An unfunded file is listed
// with suggested terms: the desk picks the products to offer (several if it
// wants), sees the amount, rate, term, payment and the coverage each leaves,
// and can take the system's suggestion (the largest amount the cockpit's
// income covers at 1.25x on the program's longest published term) or type its
// own. Saving writes the listing draft; publishing stays in the marketplace
// editor, where the PPM is attached. Readiness, loan terms on record and the
// package sit above the products so nothing is sent out blind.

import { useEffect, useMemo, useState } from "react";
import { Btn, CellChip, Input, Lbl, StatusLine, Textarea, cx, type ChipTone } from "@/components/ds";
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
  type CpListingProduct,
  type CpListingStatus,
  type CpOfferSuggestion,
  type CpOfferSuggestions,
} from "@/hooks/useCapitalPartners";
import type { ApplicationProgramReadiness, ApplicationTermSheetState } from "@/lib/applicationProfile";
import { compactMoney, dscrLabel, dscrStatusOf, dscrTone, dscrWithPayment, loanPayment, money, multiple, scheduleStatusShort, scheduleStatusTone, sourceLabel, type FinancialCockpit as Cockpit } from "@/lib/financialCockpit";
import type { CockpitPackageState } from "./FinancialCockpit";

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
};

type ProductDraft = {
  key: string;
  program_key: string | null;
  label: string;
  amount: string;
  rate_pct: string;
  factor_rate: number | null;
  term_months: string;
  interest_only: boolean;
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
  return { key: nextKey(), program_key: product.program_key, label: product.label, amount: text(product.amount), rate_pct: text(product.rate_pct), factor_rate: num(product.factor_rate ?? null), term_months: text(product.term_months), interest_only: !!product.interest_only, primary: product.primary, notes: product.notes, eligible: null };
}
function fromSuggestion(item: CpOfferSuggestion, primary: boolean): ProductDraft {
  return { key: nextKey(), program_key: item.program_key, label: item.label, amount: text(item.amount), rate_pct: text(item.rate_pct), factor_rate: item.factor_rate, term_months: text(item.term_months), interest_only: !!item.interest_only, primary, notes: item.reading, eligible: item.eligible };
}
function toProduct(draft: ProductDraft, payment: number | null, dscr: number | null): CpListingProduct {
  return {
    program_key: draft.program_key,
    label: draft.label.trim() || "Loan",
    amount: num(draft.amount),
    rate_pct: num(draft.rate_pct),
    factor_rate: draft.factor_rate,
    term_months: num(draft.term_months) == null ? null : Math.round(num(draft.term_months) as number),
    interest_only: draft.interest_only,
    payment_frequency: "monthly",
    monthly_payment: payment,
    dscr,
    notes: draft.notes,
    primary: draft.primary,
  };
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

export function OfferPanel({ cockpit, props, innerRef }: { cockpit: Cockpit; props: Props; innerRef: React.Ref<HTMLElement> }) {
  const { profileId, programReadiness, termSheet, packageState, canPublish, canRecordTerms, onRecordTerms, onOpenEvidence, onOpenPackage } = props;
  const api = useAuthedApi();
  const lookup = useCpSourceLookup({ profile_id: profileId }, canPublish);
  const listingId = lookup.data?.listing?.id ?? null;
  const listing = useCpListing(canPublish ? listingId : null);
  const suggestions = useCpSuggestTerms(profileId, null, canPublish);
  const prefill = useCpPrefill();
  const create = useCpCreateListing();
  const patch = useCpPatchListing();

  const [products, setProducts] = useState<ProductDraft[]>([]);
  const [head, setHead] = useState({ name: "", offered_amount: "", minimum_investment: "", summary: "" });
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed from the listing when there is one, else from the suggestions, until the desk edits.
  useEffect(() => {
    if (dirty) return;
    if (listing.data) {
      setProducts(listing.data.products.map(fromListing));
      setHead({ name: listing.data.name ?? "", offered_amount: text(listing.data.offered_amount), minimum_investment: text(listing.data.minimum_investment), summary: listing.data.summary ?? "" });
    } else if (!listingId && suggestions.data) {
      setProducts(suggestions.data.products.map((item, index) => fromSuggestion(item, index === 0)));
    }
  }, [dirty, listing.data, listingId, suggestions.data]);

  // The plan's income (add-backs, exclusions, overrides) and its debt service after retirements are what the offer stands on.
  const evaluation = cockpit.plan?.evaluation;
  const planIncome = evaluation?.active && evaluation.income_after_annual != null ? evaluation.income_after_annual : null;
  const income = suggestions.data?.income_annual ?? planIncome ?? cockpit.dscr.headline?.numerator ?? cockpit.dscr.candidates[0]?.numerator ?? null;
  const existingMonthly = suggestions.data?.existing_debt_service_monthly ?? evaluation?.debt_service_before_new_payment_monthly ?? cockpit.debt.service.monthly ?? 0;
  const incomeLabel = suggestions.data?.income_label ?? (planIncome != null ? `${cockpit.dscr.headline?.numerator_label ?? "Income"} with the desk's plan` : cockpit.dscr.headline?.numerator_label ?? null);
  const incomeBasis = suggestions.data?.income_basis ?? cockpit.dscr.headline?.key ?? null;
  const planLoan = cockpit.plan?.impact?.loan ?? null;

  const computed = useMemo(
    () =>
      products.map((draft) => {
        const payment = loanPayment(num(draft.amount), num(draft.rate_pct), num(draft.term_months), draft.interest_only, draft.factor_rate);
        const dscr = dscrWithPayment(income, existingMonthly, payment);
        return { draft, payment, dscr };
      }),
    [products, income, existingMonthly],
  );
  const usePlanLoan = () => {
    if (!planLoan) return;
    setDirty(true);
    setProducts((current) => {
      const index = current.findIndex((p) => p.primary);
      const base = index >= 0 ? current[index] : { key: nextKey(), program_key: null, label: "Loan", amount: "", rate_pct: "", factor_rate: null, term_months: "", interest_only: false, primary: true, notes: null, eligible: null };
      const next = { ...base, amount: text(planLoan.amount), rate_pct: text(planLoan.rate_pct), term_months: text(planLoan.term_months), interest_only: planLoan.interest_only, factor_rate: null, notes: "From the desk's plan on the file." };
      return index >= 0 ? current.map((p, i) => (i === index ? next : p)) : [...current, next];
    });
  };

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
    return rows;
  }, [programReadiness]);

  const update = (key: string, patchDraft: Partial<ProductDraft>) => {
    setDirty(true);
    setProducts((current) => current.map((p) => (p.key === key ? { ...p, ...patchDraft } : p)));
  };
  const makePrimary = (key: string) => {
    setDirty(true);
    setProducts((current) => current.map((p) => ({ ...p, primary: p.key === key })));
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
        : { key: nextKey(), program_key: programKey, label: name, amount: "", rate_pct: "16", factor_rate: null, term_months: "120", interest_only: false, primary: current.length === 0, notes: null, eligible },
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
          return { ...p, amount: text(item.amount), rate_pct: text(item.rate_pct), factor_rate: item.factor_rate, term_months: text(item.term_months), interest_only: !!item.interest_only, notes: item.reading, eligible: item.eligible };
        }),
      );
      setNotice("Suggested terms applied. Each line reads the amount the income supports at 1.25x on the program's longest term, capped by the program and the request.");
    } catch (e) {
      setError(errorMessage(e, "Suggestions are not available right now."));
    }
  };

  const payload = () => computed.map(({ draft, payment, dscr }) => toProduct(draft, payment, dscr));
  const primary = computed.find(({ draft }) => draft.primary) ?? computed[0] ?? null;
  const headlinePatch = () => ({
    products: payload(),
    // Decimals travel as strings on the listing API.
    ...(primary
      ? {
          program_label: primary.draft.label.trim() || undefined,
          note_rate_pct: num(primary.draft.rate_pct) == null ? undefined : String(num(primary.draft.rate_pct)),
          term_months: num(primary.draft.term_months) == null ? undefined : Math.round(num(primary.draft.term_months) as number),
          loan_amount: num(primary.draft.amount) == null ? undefined : String(num(primary.draft.amount)),
          offered_amount: (num(head.offered_amount) ?? num(primary.draft.amount)) == null ? undefined : String(num(head.offered_amount) ?? num(primary.draft.amount)),
        }
      : {}),
    ...(head.name.trim() ? { name: head.name.trim() } : {}),
    ...(num(head.minimum_investment) != null ? { minimum_investment: String(num(head.minimum_investment)) } : {}),
    ...(head.summary.trim() ? { summary: head.summary.trim() } : {}),
  });

  const save = async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
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
    <section className="fc-card fc-wide" id="fc-marketplace" ref={innerRef}>
      <div className="fc-card-h">
        <div>
          <h4>Send the file to capital partners</h4>
          <div className="sub">
            Pick the products to offer and the terms to publish. For a file that is not funded yet these are suggested terms: the system proposes the amount the income covers at {suggestions.data?.target_dscr?.toFixed(2) ?? "1.25"}x on each program's longest published term, and the desk changes anything before publishing.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
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
          <div className="fc-chips"><CellChip tone={eligibility.tone}>{eligibility.label}</CellChip></div>
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
          <strong>{sheet ? `${money(sheet.approved_amount)} at ${sheet.rate_pct}% for ${sheet.term_months} mo` : "Not recorded"}</strong>
          <div className="sub">{sheet ? `${sheet.funding_party_name} · v${sheet.version}` : "Without a term sheet the listing carries the suggested terms below."}</div>
          {canRecordTerms ? <Btn size="sm" onClick={onRecordTerms}>{sheet ? "Update loan terms" : "Record loan terms"}</Btn> : null}
        </div>
        <div className="fc-listing-item">
          <Lbl>Package</Lbl>
          <strong>{packageState.generated ? `Summary v${packageState.summaryVersion ?? "?"} · packet v${packageState.packetVersion ?? "?"}` : "Not generated"}</strong>
          <div className="fc-chips"><CellChip tone={!packageState.generated ? "mut" : packageState.inSync ? "ok" : "warn"}>{!packageState.generated ? "Optional for a listing" : packageState.inSync ? "Current" : "Needs a refresh"}</CellChip></div>
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
          <div className="grid g6">
            <Lbl>Products to offer</Lbl>
            <div className="fc-chips">
              {candidates.map((c) => {
                const already = products.some((p) => p.program_key === c.key);
                return (
                  <Btn key={c.key} size="sm" disabled={already || !editable} onClick={() => void addProgram(c.key, c.name, c.eligible)} aria-label={`${already ? "Offered: " : "Offer "}${c.name}${c.eligible === false ? ", not eligible on today's facts" : ""}`}>
                    <Icon name={already ? "check" : "plus"} size={12} /> {c.name}
                    {c.eligible === false ? " · not eligible" : c.selected ? " · on the file" : ""}
                  </Btn>
                );
              })}
              {!candidates.length ? <span className="sub">No programs on the file yet; select one on Evidence &amp; banking.</span> : null}
              <Btn size="sm" variant="pri" onClick={() => void suggestAll()} disabled={!products.length || !editable || suggestions.isLoading}>
                <Icon name="sparkles" size={12} /> Suggest terms
              </Btn>
              {planLoan ? (
                <Btn size="sm" onClick={usePlanLoan} disabled={!editable}>
                  <Icon name="copy" size={12} /> Use the plan's loan: {money(planLoan.amount)} at {planLoan.rate_pct}%{planLoan.interest_only ? " interest-only" : ` over ${planLoan.term_months} mo`}
                </Btn>
              ) : null}
            </div>
          </div>
          {computed.length ? (
            <div className="tbl-wrap">
              <table className="tbl fc-adv-table fc-offer-table">
                <thead>
                  <tr>
                    <th>Primary</th>
                    <th>Product</th>
                    <th className="r">Amount</th>
                    <th className="r">{computed.some(({ draft }) => draft.factor_rate) ? "Rate % / factor" : "Rate %"}</th>
                    <th className="r">Term (mo)</th>
                    <th>Structure</th>
                    <th className="r">Payment / mo</th>
                    <th>Coverage</th>
                    <th aria-label="Remove" />
                  </tr>
                </thead>
                <tbody>
                  {computed.map(({ draft, payment, dscr }) => {
                    const status = dscrStatusOf(dscr);
                    return (
                      <tr key={draft.key}>
                        <td><input type="radio" name="primary-product" aria-label={`Make ${draft.label} the primary product`} checked={draft.primary} disabled={!editable} onChange={() => makePrimary(draft.key)} /></td>
                        <td>
                          <Input aria-label="Product label" value={draft.label} disabled={!editable} onChange={(e) => update(draft.key, { label: e.target.value })} />
                          {draft.eligible === false ? <small className="sub" style={{ display: "block" }}>Not eligible on today's facts</small> : null}
                          {draft.notes ? <small className="sub" style={{ display: "block" }}>{draft.notes}</small> : null}
                        </td>
                        <td className="r num"><Input aria-label="Amount" inputMode="decimal" value={draft.amount} disabled={!editable} onChange={(e) => update(draft.key, { amount: e.target.value })} /></td>
                        <td className="r num">{draft.factor_rate ? <span>{draft.factor_rate.toFixed(2)} factor</span> : <Input aria-label="Rate percent" inputMode="decimal" value={draft.rate_pct} disabled={!editable} onChange={(e) => update(draft.key, { rate_pct: e.target.value })} />}</td>
                        <td className="r num"><Input aria-label="Term in months" inputMode="numeric" value={draft.term_months} disabled={!editable} onChange={(e) => update(draft.key, { term_months: e.target.value })} /></td>
                        <td>
                          {draft.factor_rate ? <span className="sub">Factor</span> : (
                            <label className={cx("fc-sim-pick", draft.interest_only && "on")}>
                              <input type="checkbox" checked={draft.interest_only} disabled={!editable} onChange={(e) => update(draft.key, { interest_only: e.target.checked })} />
                              <span className="fc-sim-pick-name">{draft.interest_only ? "Interest-only" : "Amortizing"}</span>
                            </label>
                          )}
                        </td>
                        <td className="r num"><strong>{money(payment)}</strong>{draft.interest_only ? <small className="sub" style={{ display: "block" }}>interest; principal at maturity</small> : null}</td>
                        <td>
                          <span className={cx("fc-chips")}>
                            <strong className="num">{multiple(dscr)}</strong>
                            <CellChip tone={dscrTone(status)}>{dscrLabel(status).split(" (")[0]}</CellChip>
                          </span>
                        </td>
                        <td>{editable ? <button type="button" className="fc-adv-remove" aria-label={`Remove ${draft.label}`} onClick={() => remove(draft.key)}><Icon name="x" size={13} /></button> : null}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fc-empty">{suggestions.isLoading ? "Working out what the income supports…" : "No products yet. Add one above; the suggestion fills in the terms the income supports."}</div>
          )}
          <div className="fc-listing-grid">
            <div className="fc-listing-item">
              <Lbl>Listing name (never the borrower's name)</Lbl>
              <Input aria-label="Listing name" value={head.name} disabled={!editable} placeholder={listing.data?.name ?? "Set on save from the program and location"} onChange={(e) => { setDirty(true); setHead({ ...head, name: e.target.value }); }} />
            </div>
            <div className="fc-listing-item">
              <Lbl>Offered to members, $</Lbl>
              <Input aria-label="Offered amount" inputMode="decimal" value={head.offered_amount} disabled={!editable} placeholder={primary ? text(num(primary.draft.amount)) : ""} onChange={(e) => { setDirty(true); setHead({ ...head, offered_amount: e.target.value }); }} />
            </div>
            <div className="fc-listing-item">
              <Lbl>Minimum subscription, $</Lbl>
              <Input aria-label="Minimum subscription" inputMode="decimal" value={head.minimum_investment} disabled={!editable} placeholder="1% of the offer, at least 10,000" onChange={(e) => { setDirty(true); setHead({ ...head, minimum_investment: e.target.value }); }} />
            </div>
          </div>
          <div className="grid g4">
            <Lbl>Summary members read</Lbl>
            <Textarea rows={2} aria-label="Listing summary" value={head.summary} disabled={!editable} placeholder="Operating business and what the statements show; the prefill writes a first line." onChange={(e) => { setDirty(true); setHead({ ...head, summary: e.target.value }); }} />
          </div>
          {listingId ? <MarketplacePublishStrip profileId={profileId} packageInSync={packageState.inSync} canPublish={canPublish} compact /> : null}
          <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <Btn variant="pri" size="sm" onClick={() => void save()} disabled={busy || !editable || (!!listingId && !dirty)}>
              {busy ? "Saving…" : listingId ? "Save terms to the listing" : "Start the listing draft with these terms"}
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
