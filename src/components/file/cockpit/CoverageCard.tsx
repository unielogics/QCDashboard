"use client";

// Coverage and the plan, one card. Today's DSCR on the left, the DSCR with
// the plan on the right, and the plan itself in between: the obligations
// the new loan pays off (their payments stop, their payoffs size the loan),
// the statement payees that are not operating spend, and the payment the
// new loan adds. Every change re-computes the figures at once; saving the
// plan makes the debt service, the offer and the advances read it too. The
// levers list says what would raise coverage, each with its resulting DSCR
// and one click to apply.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Btn, CellChip, Input, Lbl, Select, StatusLine, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { errorMessage } from "@/components/marketplace/shared";
import { useSaveFinancialPlan } from "@/hooks/useApi";
import { evaluatePlanLocally } from "@/lib/cockpitSimulation";
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
  type PayeeKind,
  type PlanAddBack,
  type PlanAddBackKind,
  type PlanOverrides,
} from "@/lib/financialCockpit";
import { ChartCard, LineChart, Meter, SERIES, type ChartTable } from "./CockpitCharts";

const EXCLUDABLE: PayeeKind[] = ["transfer", "owner_draw"];
const meterTone = (status: Parameters<typeof dscrTone>[0]): "ok" | "warn" | "bad" | "mut" => {
  const tone = dscrTone(status);
  return tone === "acc" ? "mut" : tone;
};

const EMPTY_PLAN: FinancialPlanWrite = { retire: [], exclude: [], new_payment_monthly: null, new_payment_source: null, new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null, new_loan_interest_only: false, add_backs: [], overrides: null, note: null };

function fromRecord(cockpit: Cockpit): FinancialPlanWrite {
  const r = cockpit.plan?.record;
  if (!r) return EMPTY_PLAN;
  const overrides = r.overrides && (r.overrides.income_annual != null || r.overrides.debt_service_monthly != null || r.overrides.income_note || r.overrides.debt_service_note) ? { ...EMPTY_OVERRIDES, ...r.overrides } : null;
  return {
    retire: [...r.retire],
    exclude: [...r.exclude],
    new_payment_monthly: r.new_payment_monthly,
    new_payment_source: (r.new_payment_source as FinancialPlanWrite["new_payment_source"]) ?? null,
    new_loan_amount: r.new_loan_amount,
    new_loan_rate_pct: r.new_loan_rate_pct,
    new_loan_term_months: r.new_loan_term_months,
    new_loan_interest_only: !!r.new_loan_interest_only,
    add_backs: (r.add_backs ?? []).map((a) => ({ ...a })),
    overrides,
    note: r.note,
  };
}
const numberValue = (value: number | null | undefined): string => (value == null || !Number.isFinite(value) ? "" : String(value));
const change = (before: number | null | undefined, after: number | null | undefined): number | null => (before == null || after == null ? null : Math.round((after - before) * 100) / 100);
const signedMoney = (value: number | null): string => (value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${money(Math.abs(value))}`);
const signedMultiple = (value: number | null): string => (value == null ? "—" : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}x`);
const same = (a: FinancialPlanWrite, b: FinancialPlanWrite) => JSON.stringify(a) === JSON.stringify(b);
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

export function CoverageCard({ cockpit, months, summary, accountLabel, canEdit, profileId, canRecordTerms, onRecordTerms }: { cockpit: Cockpit; months: CockpitMonth[]; summary: CockpitBankSummary; accountLabel: string; canEdit: boolean; profileId: string; canRecordTerms: boolean; onRecordTerms: () => void }) {
  const save = useSaveFinancialPlan(profileId);
  const [plan, setPlan] = useState<FinancialPlanWrite>(() => fromRecord(cockpit));
  const [paymentText, setPaymentText] = useState<string>(() => (cockpit.plan.record.new_payment_monthly == null ? "" : String(cockpit.plan.record.new_payment_monthly)));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const savedRecord = useMemo(() => fromRecord(cockpit), [cockpit]);
  const dirty = !same(plan, savedRecord);
  useEffect(() => {
    // A fresh read of the file (another tab saved, a re-read landed) replaces an untouched draft.
    if (!dirty) {
      setPlan(savedRecord);
      setPaymentText(savedRecord.new_payment_monthly == null ? "" : String(savedRecord.new_payment_monthly));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedRecord]);

  const local = useMemo(() => evaluatePlanLocally(cockpit, plan, months), [cockpit, plan, months]);
  const { headline, thresholds, candidates, reason, debt_service_source } = cockpit.dscr;
  const noDebt = Boolean(cockpit.dscr.no_debt);
  const schedule = cockpit.debt.schedule ?? EMPTY_SCHEDULE;
  const obligations = cockpit.debt.obligations;
  const excludable = cockpit.bank.recurring.payees.filter((p) => EXCLUDABLE.includes(p.kind) && (p.monthly_average ?? 0) >= 500);
  const levers = cockpit.plan?.levers ?? [];
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
    setPaymentText(text);
    const value = num(text);
    setPlan((p) => ({ ...p, new_payment_monthly: value, new_payment_source: value == null ? null : "manual", ...(value == null ? {} : { new_loan_amount: null, new_loan_rate_pct: null, new_loan_term_months: null }) }));
  };
  const applyLever = (apply: Partial<FinancialPlanWrite>) => {
    setSaved(null);
    setPlan((p) => {
      const next = { ...p, ...apply } as FinancialPlanWrite;
      if (apply.new_loan_amount != null || apply.new_loan_interest_only) {
        next.new_payment_monthly = null;
        next.new_payment_source = "manual_terms";
      }
      return next;
    });
    if (apply.new_loan_amount != null || apply.new_payment_monthly === null) setPaymentText("");
  };
  // The new loan's terms: amount, rate, term and whether it is interest-only. Typing a term wipes a typed payment.
  const setLoan = (field: "amount" | "rate" | "term" | "interest_only", raw: string | boolean) => {
    setSaved(null);
    setPaymentText("");
    setPlan((p) => {
      const value = typeof raw === "boolean" ? null : num(raw);
      const next: FinancialPlanWrite = { ...p, new_payment_monthly: null };
      if (field === "amount") next.new_loan_amount = value;
      else if (field === "rate") next.new_loan_rate_pct = value;
      else if (field === "term") next.new_loan_term_months = value == null ? null : Math.max(1, Math.round(value));
      else next.new_loan_interest_only = raw === true;
      next.new_payment_source = next.new_loan_amount ? "manual_terms" : null;
      return next;
    });
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
  const latestTax = [...(cockpit.tax?.years ?? [])].reverse();
  const officerYear = latestTax.find((y) => (y.officer_compensation ?? 0) > 0) ?? null;
  const interestYear = latestTax.find((y) => (y.interest ?? 0) > 0) ?? null;
  const hasKind = (kind: PlanAddBackKind) => plan.add_backs.some((a) => a.kind === kind);
  const overrides = plan.overrides ?? EMPTY_OVERRIDES;
  const serviceOriginal = cockpit.debt.service.monthly ?? 0;
  const clearPlan = () => {
    setSaved(null);
    setPlan(EMPTY_PLAN);
    setPaymentText("");
  };
  const submit = async () => {
    setError(null);
    try {
      await save.mutateAsync(plan);
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

  return (
    <section className="fc-card fc-wide fc-coverage">
      <div className="fc-card-h">
        <div>
          <h4>Debt service coverage and the plan</h4>
          <div className="sub">
            Income available for debt payments against the payments due; lenders usually look for 1.25x. Tick what the new loan pays off, mark transfers that are not spend, set the new payment, and every figure updates. Save the plan and the debt service, the offer and the advances read it too.
          </div>
        </div>
        <div className="row" style={{ gap: 8, alignItems: "center" }}>
          {canEdit ? (
            <>
              <Btn size="sm" onClick={clearPlan} disabled={!plan.retire.length && !plan.exclude.length && plan.new_payment_monthly == null && !plan.new_loan_amount}>Clear</Btn>
              <Btn size="sm" variant="pri" onClick={() => void submit()} disabled={!dirty || save.isPending}>{save.isPending ? "Saving…" : "Save plan"}</Btn>
            </>
          ) : null}
        </div>
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {saved && !dirty ? <StatusLine tone="ok">{saved}</StatusLine> : null}
      {dirty ? <StatusLine tone="acc">Unsaved plan: the figures below already reflect it; save to make the debt service, the offer and the advances follow.</StatusLine> : null}

      <div className="fc-grid">
        <div className="grid g8">
          <Lbl>Today</Lbl>
          <div className="fc-hero">
            {noDebt ? "No debt" : multiple(headline?.value)}
            <small>{noDebt ? `declared ${declaredBy(schedule.voided)}` : headline ? headline.label : "not available"}</small>
          </div>
          <div className="fc-chips">
            {noDebt ? <CellChip tone="ok">No debt to cover</CellChip> : <CellChip tone={dscrTone(headline?.status)}>{dscrLabel(headline?.status)}</CellChip>}
            {headlineConfidence ? <CellChip tone={confidenceTone(headlineConfidence)}>{confidenceLabel(headlineConfidence)}</CellChip> : null}
            <CellChip tone={debt_service_source === "none" ? "warn" : "mut"}>Debt service {money(local.serviceBefore)} / mo · {sourceLabel(debt_service_source)}</CellChip>
          </div>
          <Meter value={headline?.value ?? null} tone={meterTone(headline?.status)} marks={marks} label="Debt service coverage today" />
          {reason ? <StatusLine tone="warn">{reason}</StatusLine> : null}
          {headline?.note ? <div className="sub">{headline.note}</div> : null}
        </div>
        <div className="grid g8">
          <Lbl>With the plan</Lbl>
          <div className="fc-hero">
            {local.noDebtLeft ? "No debt" : multiple(local.headlineAfter)}
            <small>{local.noDebtLeft ? "service left" : headline ? headline.label : ""}</small>
          </div>
          <div className="fc-chips">
            <CellChip tone={dscrTone(afterStatus)}>{local.noDebtLeft ? "Nothing left to cover" : dscrLabel(afterStatus)}</CellChip>
            <CellChip tone="mut">Debt service {money(local.serviceAfter)} / mo</CellChip>
            {local.retiredMonthly ? <CellChip tone="ok">{money(local.retiredMonthly)} / mo stops</CellChip> : null}
            {local.excludedMonthly ? <CellChip tone="acc">{money(local.excludedMonthly)} / mo not spend</CellChip> : null}
            {local.newPayment ? <CellChip tone="warn">+{money(local.newPayment)} / mo new payment{loanTerms ? ` (${loanTerms})` : local.newPaymentSource === "term_sheet" ? " (term sheet)" : ""}</CellChip> : null}
          </div>
          <Meter value={local.noDebtLeft ? thresholds.very_strong * 2 : (local.headlineAfter ?? null)} tone={meterTone(afterStatus)} marks={marks} label="Debt service coverage with the plan" />
          <div className="fc-stat-list">
            <Stat label="Loan the plan needs">{local.loanAmountNeeded ? `${money(local.loanAmountNeeded)}${local.payoffTotal ? ` (payoffs ${money(local.payoffTotal)}${local.payoffUnknown ? `, ${local.payoffUnknown} unknown` : ""})` : ""}` : "—"}</Stat>
            <Stat label="Net cash flow per month, today → plan">{money(summary.avg_net)} → {money(local.netAfterAverage)}</Stat>
            <Stat label="Ending balance, last month, today → plan">{money(summary.ending_balance)} → {money(local.endingAfterLast)}</Stat>
            <Stat label="Months dipping below zero, today → plan">{local.rows.filter((r) => r.lowest != null && r.lowest < 0).length} → {local.monthsDippingNegativeAfter}</Stat>
          </div>
        </div>
      </div>

      <div className="fc-grid">
        <div className="grid g8">
          <Lbl>Obligations: what the business pays lenders ({accountLabel})</Lbl>
          {obligations.length ? (
            <div className="tbl-wrap">
              <table className="tbl fc-obligations">
                <thead>
                  <tr>
                    <th>Pay off with the new loan</th>
                    <th>Lender</th>
                    <th className="r">Per month</th>
                    <th className="r">Balance / payoff</th>
                    <th>Statements</th>
                    <th>In debt service</th>
                  </tr>
                </thead>
                <tbody>
                  {obligations.map((o) => {
                    const on = plan.retire.includes(o.id);
                    return (
                      <tr key={o.id} className={cx(!o.in_debt_service && "is-muted", on && "is-on")}>
                        <td><input type="checkbox" checked={on} disabled={!canEdit} aria-label={`Pay off ${o.lender} with the new loan`} onChange={() => toggleRetire(o.id)} /></td>
                        <td>
                          <strong>{o.lender}</strong>
                          <div className="fc-chips" style={{ marginTop: 2 }}>
                            <CellChip tone={payeeKindTone(o.category as PayeeKind)}>{o.is_mca ? "Merchant cash advance" : o.category.replace(/_/g, " ")}</CellChip>
                            <CellChip tone="mut">{o.kind === "row" ? (o.origin === "admin" ? "Recorded by the desk" : o.origin === "borrower" || o.origin === "client" ? "Typed by the client" : "On the schedule") : o.kind === "document" ? "Advance terms" : "Seen in statements"}</CellChip>
                          </div>
                        </td>
                        <td className="r num">{money(o.monthly)}{o.cadence ? <small className="sub" style={{ display: "block" }}>{cadenceLabel(o.cadence)}</small> : null}</td>
                        <td className="r num">{o.payoff != null ? money(o.payoff) : o.balance != null ? money(o.balance) : <span className="sub">unknown</span>}</td>
                        <td>{o.linked_payee ? <span className="sub">{o.linked_payee} · {money(o.observed_monthly)} / mo</span> : <span className="sub">not seen</span>}</td>
                        <td>{o.in_debt_service ? <CellChip tone="ok">Yes</CellChip> : <CellChip tone="mut">No</CellChip>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="fc-empty">
              {schedule.status === "voided"
                ? `No debt on the business: the desk voided the debt schedule, ${declaredBy(schedule.voided)}.`
                : `No obligations found yet. Debt schedule: ${schedule.label.toLowerCase()}. Record the advances, enter the schedule below, or re-read the statements.`}
            </div>
          )}
          {excludable.length ? (
            <div className="grid g4">
              <Lbl>Not operating spend</Lbl>
              <div className="fc-chips">
                {excludable.map((p) => {
                  const id = `payee:${p.key}`;
                  const on = plan.exclude.includes(id);
                  return (
                    <label key={p.key} className={cx("fc-sim-pick", on && "on")}>
                      <input type="checkbox" checked={on} disabled={!canEdit} onChange={() => toggleExclude(id)} />
                      <span className="fc-sim-pick-name">{p.payee}</span>
                      <CellChip tone={payeeKindTone(p.kind)}>{p.kind_label}</CellChip>
                      <span className="sub">{money(p.monthly_average)} / mo · counts as income if it is the owner's own money</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
        <div className="grid g8">
          <Lbl>The new loan</Lbl>
          <div className="fc-loan-terms">
            <label className="grid g2"><span className="sub">Amount, $</span><Input aria-label="New loan amount" type="number" inputMode="decimal" min={0} step="any" value={numberValue(plan.new_loan_amount)} disabled={!canEdit} onChange={(e) => setLoan("amount", e.target.value)} /></label>
            <label className="grid g2"><span className="sub">Rate, %</span><Input aria-label="New loan rate percent" type="number" inputMode="decimal" min={0} max={100} step="any" value={numberValue(plan.new_loan_rate_pct)} disabled={!canEdit} onChange={(e) => setLoan("rate", e.target.value)} /></label>
            <label className="grid g2"><span className="sub">Term, months</span><Input aria-label="New loan term in months" type="number" inputMode="numeric" min={1} max={600} step={1} value={numberValue(plan.new_loan_term_months)} disabled={!canEdit || plan.new_loan_interest_only} onChange={(e) => setLoan("term", e.target.value)} /></label>
            <label className={cx("fc-sim-pick", plan.new_loan_interest_only && "on")} style={{ alignSelf: "end" }}>
              <input type="checkbox" checked={plan.new_loan_interest_only} disabled={!canEdit} onChange={(e) => setLoan("interest_only", e.target.checked)} />
              <span className="fc-sim-pick-name">Interest-only</span>
            </label>
          </div>
          <span className="sub">
            {loanTerms ? `${loanTerms}: ${money(local.newPayment)} a month${plan.new_loan_interest_only ? " of interest; the principal is due at maturity" : ""}.` : plan.new_payment_monthly != null ? `Payment typed by the desk: ${money(plan.new_payment_monthly)} a month.` : cockpit.dscr.proposed ? `Recorded loan terms: ${money(cockpit.dscr.proposed.monthly_payment)} a month.` : "No loan terms yet: enter them, type a payment, or apply a lever."}
            {canRecordTerms ? <> <button type="button" className="linky" onClick={onRecordTerms}>Record loan terms</button></> : null}
          </span>
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
          <span className="sub">Owner pay that is discretionary, interest the refinance removes, depreciation, one-time costs: each raises the income available for debt service on every basis, with a note that says why.</span>
          {plan.add_backs.length ? (
            <div className="grid g6">
              {plan.add_backs.map((item, index) => (
                <div key={item.id ?? index} className="fc-adjust-row">
                  <Select aria-label="Add-back kind" value={item.kind} disabled={!canEdit} onChange={(e) => updateAddBack(index, { kind: e.target.value as PlanAddBackKind, label: item.label && item.label !== ADD_BACK_KINDS[item.kind] ? item.label : null })}>
                    {(Object.keys(ADD_BACK_KINDS) as PlanAddBackKind[]).map((kind) => <option key={kind} value={kind}>{ADD_BACK_KINDS[kind]}</option>)}
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
          {canEdit ? (
            <div className="fc-chips">
              {officerYear && !hasKind("owner_salary") ? <Btn size="sm" onClick={() => addAddBack({ kind: "owner_salary", label: `Officer compensation (tax return ${officerYear.year})`, amount_monthly: Math.round(((officerYear.officer_compensation ?? 0) / 12) * 100) / 100, source: "tax_return" })}><Icon name="plus" size={12} /> Officer compensation {money(officerYear.officer_compensation)} a year</Btn> : null}
              {interestYear && plan.retire.length && !hasKind("interest_refinanced") ? <Btn size="sm" onClick={() => addAddBack({ kind: "interest_refinanced", label: `Interest on refinanced debt (tax return ${interestYear.year})`, amount_monthly: Math.round(((interestYear.interest ?? 0) / 12) * 100) / 100, source: "tax_return" })}><Icon name="plus" size={12} /> Interest {money(interestYear.interest)} a year</Btn> : null}
              <Btn size="sm" onClick={() => addAddBack()}><Icon name="plus" size={12} /> Add an add-back</Btn>
              {local.addBacksMonthly ? <CellChip tone="ok">+{money(local.addBacksMonthly)} / mo · {money(local.addBacksMonthly * 12)} a year</CellChip> : null}
            </div>
          ) : null}
        </div>
        <div className="grid g8">
          <Lbl>Overrides: set a figure outright</Lbl>
          <span className="sub">Banking control: when the desk knows better than the documents, set the income available for debt service or the existing debt service, and say why. An override replaces the computed figure, add-backs included.</span>
          <div className="fc-loan-terms">
            <label className="grid g2"><span className="sub">Income available for debt service, $ a year</span><Input aria-label="Income override per year" type="number" inputMode="decimal" min={0} step="any" placeholder={money(headline?.numerator ?? null)} value={numberValue(overrides.income_annual)} disabled={!canEdit} onChange={(e) => setOverride({ income_annual: num(e.target.value) })} /></label>
            <label className="grid g2"><span className="sub">Why</span><Input aria-label="Income override note" placeholder="Per the CPA letter…" value={overrides.income_note ?? ""} disabled={!canEdit} onChange={(e) => setOverride({ income_note: e.target.value || null })} /></label>
            <label className="grid g2"><span className="sub">Existing debt service, $ a month</span><Input aria-label="Existing debt service override per month" type="number" inputMode="decimal" min={0} step="any" placeholder={money(serviceOriginal)} value={numberValue(overrides.debt_service_monthly)} disabled={!canEdit} onChange={(e) => setOverride({ debt_service_monthly: num(e.target.value) })} /></label>
            <label className="grid g2"><span className="sub">Why</span><Input aria-label="Debt service override note" placeholder="Includes the truck lease…" value={overrides.debt_service_note ?? ""} disabled={!canEdit} onChange={(e) => setOverride({ debt_service_note: e.target.value || null })} /></label>
          </div>
          {overrides.income_annual != null || overrides.debt_service_monthly != null ? <StatusLine tone="acc">Overrides in force{overrides.income_annual != null ? `: income ${money(overrides.income_annual)} a year` : ""}{overrides.debt_service_monthly != null ? `${overrides.income_annual != null ? "," : ":"} existing debt service ${money(overrides.debt_service_monthly)} a month` : ""}. They print on the package and the listing with the note.</StatusLine> : null}
        </div>
      </div>

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
              <tr><td>Debt service coverage{headline ? ` · ${headline.label}` : ""}</td><td className="r num">{multiple(headline?.value)}</td><td className="r num">{local.noDebtLeft ? "No debt left" : multiple(local.headlineAfter)}</td><td className="r num">{signedMultiple(change(headline?.value, local.headlineAfter))}</td></tr>
              <tr><td>Income available for debt service, a year</td><td className="r num">{money(local.incomeBefore)}</td><td className="r num">{money(local.incomeAfter)}</td><td className="r num">{signedMoney(change(local.incomeBefore, local.incomeAfter))}</td></tr>
              <tr><td>Debt service, a month</td><td className="r num">{money(serviceOriginal)}</td><td className="r num">{money(local.serviceAfter)}</td><td className="r num">{signedMoney(change(serviceOriginal, local.serviceAfter))}</td></tr>
              <tr><td>Net cash flow, a month ({accountLabel})</td><td className="r num">{money(summary.avg_net)}</td><td className="r num">{money(local.netAfterAverage)}</td><td className="r num">{signedMoney(change(summary.avg_net, local.netAfterAverage))}</td></tr>
              <tr><td>Ending balance, last month</td><td className="r num">{money(summary.ending_balance)}</td><td className="r num">{money(local.endingAfterLast)}</td><td className="r num">{signedMoney(change(summary.ending_balance, local.endingAfterLast))}</td></tr>
              <tr><td>Months dipping below zero</td><td className="r num">{local.rows.filter((r) => r.lowest != null && r.lowest < 0).length}</td><td className="r num">{local.monthsDippingNegativeAfter}</td><td className="r num">{local.monthsDippingNegativeAfter - local.rows.filter((r) => r.lowest != null && r.lowest < 0).length}</td></tr>
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
      ) : null}

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
}
