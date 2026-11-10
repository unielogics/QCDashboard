"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, Input, Select, Textarea } from "@/components/ds";
import { FinancialEditorSurface } from "./FinancialEditorSurface";
import { Icon } from "@/components/design-system/Icon";
import { PreparationProgress } from "@/components/design-system/PreparationProgress";
import { useAuthedApi } from "@/hooks/useApi";
import { useDealBudget } from "@/hooks/useDealBudget";
import { useDealBudgetPreview } from "@/hooks/useDealBudgetPreview";
import { dealBudgetPlan } from "@/lib/dealBudgetPlan";
import type { FinancialPlanRead, FinancialPlanWrite } from "@/lib/financialCockpit";
import { DEAL_COST_BASES, DEAL_COST_CATEGORIES, dealBudgetChanged, dealBudgetDraftKey, dealBudgetKey, dealBudgetWrite, newDealCost, type DealBudget, type DealBudgetCalculation, type DealBudgetDraft, type DealBudgetLoan, type DealBudgetWrite, type DealCostRow } from "@/lib/dealBudget";
import { money } from "@/lib/financialCockpit";
import styles from "./DealBudgetSection.module.css";

const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : typeof value === "string" && value.trim() && Number.isFinite(Number(value)) ? Number(value) : null;
function amount(calc: DealBudgetCalculation | undefined, key: string) { return numeric(calc?.[key]); }
function messages(calc: DealBudgetCalculation | undefined, key: string): string[] { const values = calc?.[key]; return Array.isArray(values) ? values.map(value => typeof value === "string" ? value : JSON.stringify(value)) : []; }
function Metric({ label, value, percent = false }: { label: string; value: number | null; percent?: boolean }) { return <div><small>{label}</small><strong>{value == null ? "Not established" : percent ? `${value.toFixed(2)}%` : money(value, 2)}</strong></div>; }

/** One cost and capital record, with one retained staff draft across financing tabs. */
export function DealBudgetSection({ profileId, disabled, onSaved, compact = true, loan, existingFunding, title = "Investment and closing costs", inline = false, onPending, financialPlan, onApplySolvedPrincipal, onFinancingSaved, onGrossAmountChange }: { profileId: string; disabled?: boolean; onSaved?: () => Promise<unknown> | void; compact?: boolean; loan?: DealBudgetLoan | null; existingFunding?: { capital: number | null; minimum: number | null }; title?: string; inline?: boolean; onPending?: (pending: boolean) => void; financialPlan?: FinancialPlanWrite | null; onApplySolvedPrincipal?: (amount: number) => void; onFinancingSaved?: (plan: FinancialPlanRead) => void; onGrossAmountChange?: (amount: number | null) => void }) {
  const api = useAuthedApi(), queryClient = useQueryClient(), query = useDealBudget(profileId);
  const [open, setOpen] = useState(inline), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const liveRef = useRef<HTMLElement | null>(null);
  const applyAttempt = useRef<{ signature: string; key: string } | null>(null);
  useQuery<DealBudgetDraft | null>({ queryKey: dealBudgetDraftKey(profileId), queryFn: async () => null, enabled: false, initialData: null, gcTime: Infinity });
  const [, renderDraft] = useState(0);
  const kept = queryClient.getQueryData<DealBudgetDraft | null>(dealBudgetDraftKey(profileId));
  const saved = query.data, draft = kept?.profileId === profileId ? kept : null;
  const value = draft?.value ?? (saved ? dealBudgetWrite(saved) : null);
  const dirty = Boolean(saved && value && dealBudgetChanged(value, saved));
  const conflict = Boolean(saved && value && value.expected_revision !== saved.revision && dirty);
  const canEdit = Boolean(saved?.can_edit && !disabled && !busy);
  const previewPlan = financialPlan ?? dealBudgetPlan(saved?.financial_plan, loan);
  const live = useDealBudgetPreview(profileId, { enabled: open || dirty, value, loan, financialPlan: previewPlan });
  const preview = live.data?.calculation ?? null, previewing = live.pending;
  const previewError = live.error instanceof Error ? live.error.message : live.error ? "The working budget could not be calculated." : "";
  useEffect(() => { setOpen(inline); setError(""); setNotice(""); setRefreshWarning(""); }, [profileId, inline]);
  useEffect(() => { onPending?.(busy); }, [busy, onPending]);
  useEffect(() => () => onPending?.(false), [onPending]);
  useEffect(() => {
    if (!inline || !open || !liveRef.current) return;
    const tabs = liveRef.current.closest(".drawer-b")?.querySelector<HTMLElement>('[role="tablist"]');
    if (!tabs) return;
    const measure = () => { if (liveRef.current) liveRef.current.style.top = `${tabs.getBoundingClientRect().height}px`; };
    measure(); const observer = new ResizeObserver(measure); observer.observe(tabs); return () => observer.disconnect();
  }, [inline, open, saved]);
  const remember = (next: DealBudgetWrite, removed = draft?.removed ?? []) => {
    queryClient.setQueryData(dealBudgetDraftKey(profileId), { profileId, value: next, removed });
    // Controlled cells must read this event immediately; query observers notify
    // the other financing surfaces on their normal schedule.
    renderDraft(value => value + 1); setError(""); setNotice("");
  };
  const update = (patch: Partial<DealBudgetWrite>) => { if (value && canEdit) remember({ ...value, ...patch }); };
  const rowChange = (id: string, patch: Partial<DealCostRow>) => {
    if (!value) return;
    const rows = value.rows.map(row => { if (row.id !== id) return row; const next = { ...row, ...patch }; if (next.settlement === "financed" && (next.payer !== "borrower" || next.timing !== "closing")) next.settlement = "separate"; return next; });
    const initializeBase = patch.settlement === "financed" && (value.loan_amount_mode ?? "gross_loan") === "gross_loan" && value.base_loan_amount == null && value.target_net_amount == null && !value.rows.some(row => row.settlement === "financed");
    update({ rows, ...(initializeBase ? { loan_amount_mode: "base_loan", base_loan_amount: currentGross } : {}) });
  };
  const reload = async () => {
    const refreshed = await query.refetch();
    if (!refreshed.isError && refreshed.data) { queryClient.setQueryData(dealBudgetDraftKey(profileId), null); setError(""); setNotice("Current saved budget loaded."); }
    else setError("The current budget could not be loaded. Your working changes are retained; retry loading before discarding them.");
  };
  const refreshSavedBudget = async () => {
    await Promise.all([...(["financial-cockpit", "application-client-terms", "application-underwriting", "application-profile", "financial-metrics"].map(key => queryClient.invalidateQueries({ queryKey: [key, profileId] }))), ...["cp-sources", "cp-listing", "cp-listings"].map(key => queryClient.invalidateQueries({ queryKey: [key] }))]);
    await onSaved?.();
    setRefreshWarning("");
  };
  const save = async () => {
    if (!value || !canEdit) return;
    setBusy(true); setError(""); setNotice(""); setRefreshWarning("");
    try {
      const context = saved?.financing_context;
      if (needsPrincipalSave && !context) throw new Error("Reload the current loan context before saving the revised principal.");
      const planTimestamp = previewPlan && "expected_updated_at" in previewPlan ? previewPlan.expected_updated_at ?? null : context?.plan_updated_at ?? null;
      const payload = needsPrincipalSave ? { ...value, ...(previewPlan ? { financial_plan: previewPlan } : {}), expected_plan_updated_at: planTimestamp, expected_terms_ref: context?.terms_ref ?? null } : value;
      const signature = JSON.stringify({ profileId, payload });
      if (needsPrincipalSave && applyAttempt.current?.signature !== signature) applyAttempt.current = { signature, key: crypto.randomUUID() };
      const result = await api<DealBudget>(`/application-profiles/${profileId}/deal-budget${needsPrincipalSave ? "/apply-principal" : ""}`, { method: needsPrincipalSave ? "POST" : "PATCH", body: JSON.stringify(needsPrincipalSave ? { ...payload, idempotency_key: applyAttempt.current!.key } : payload) });
      queryClient.setQueryData(dealBudgetKey(profileId), result); queryClient.setQueryData(dealBudgetDraftKey(profileId), null);
      if (result.financial_plan) { queryClient.setQueryData(["financial-plan", profileId], result.financial_plan); queryClient.setQueryData(["financial-plan-applied", profileId], result.financial_plan); }
      applyAttempt.current = null;
      setNotice(`Deal budget revision ${result.revision}${result.financial_plan ? " and the shared loan were" : ""} saved. Save a new terms version to include these costs in its PDF.`);
      try { if (result.financial_plan) onFinancingSaved?.(result.financial_plan); await refreshSavedBudget(); }
      catch { setRefreshWarning("The budget was saved successfully. Financial summaries could not be refreshed; retry refresh without saving another revision."); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The deal budget could not be saved. Your changes are retained."); }
    finally { setBusy(false); }
  };
  const calc = open ? preview ?? undefined : saved?.calculation;
  const solution = calc?.principal_solution && typeof calc.principal_solution === "object" ? calc.principal_solution as Record<string, unknown> : null;
  const payment = calc?.scheduled_payment && typeof calc.scheduled_payment === "object" ? calc.scheduled_payment as Record<string, unknown> : null;
  const solvedGross = numeric(solution?.gross_loan_amount ?? calc?.gross_loan_amount);
  const currentGross = loan?.amount ?? saved?.financing_context?.current_loan_amount ?? numeric(saved?.calculation.gross_loan_amount);
  const mode = value?.loan_amount_mode ?? "gross_loan";
  const needsPrincipalSave = solution?.status === "calculated" && solvedGross != null && (saved?.financing_context ? saved.financing_context.current_loan_amount == null || Math.abs(solvedGross - saved.financing_context.current_loan_amount) > 0.005 : solution.requires_apply === true);
  const summaryCalc = dirty ? preview ?? undefined : saved?.calculation;
  const warnings = messages(calc, "issues");
  const feeCoverage = calc?.financing_fee_coverage && typeof calc.financing_fee_coverage === "object" ? calc.financing_fee_coverage as Record<string, unknown> : null;
  return <>
    {!inline ? <section className={styles.summary} aria-label={title}>
      <div className={styles.head}><div><strong>{title}</strong><p>{dirty ? "Working cost changes are retained · awaiting Save budget" : "One shared budget for the loan, investor capital and financing costs"}</p></div><Btn size="sm" onClick={() => setOpen(true)} disabled={query.isPending || disabled}><Icon name="calc" size={14} />{saved?.can_edit ? "Edit deal budget" : "View deal budget"}</Btn></div>
      {query.isPending ? <span className={styles.note}>Loading the saved financing budget…</span> : query.isError ? <Callout tone="warn">Budget unavailable. <Btn size="sm" onClick={() => void query.refetch()}>Retry budget</Btn></Callout> : <div className={styles.stats}><Metric label="Gross loan" value={amount(summaryCalc, "gross_loan_amount")} /><Metric label="Capital to raise" value={amount(summaryCalc, "investor_funding_amount")} /><Metric label="Client net proceeds" value={amount(summaryCalc, "net_client_cash")} /><Metric label="Projected investor net profit" value={amount(summaryCalc, "investor_net_income")} />{!compact ? <Metric label="Investor net ROI · full term" value={amount(summaryCalc, "investor_net_roi_pct")} percent /> : null}</div>}
    </section> : null}
    <FinancialEditorSurface inline={inline} open={open} onClose={() => { if (!busy) setOpen(false); }} title="Investment and closing costs" sub="Separate gross loan principal, investor funding, client proceeds and the costs each party pays." width="xl" closeOnBackdrop={false} ariaLabel="Deal budget editor" footer={<div className={styles.footer}>{!inline ? <Btn onClick={() => setOpen(false)} disabled={busy}>Close</Btn> : null}{dirty ? <Btn onClick={() => { queryClient.setQueryData(dealBudgetDraftKey(profileId), null); setError(""); }} disabled={busy}>Discard changes</Btn> : null}<span className={styles.note}>{dirty ? "Draft kept when closed. Save records costs; revised principal saves the loan too." : saved ? `Saved budget · revision ${saved.revision}` : "Loading budget…"}</span>{saved?.can_edit ? <Btn variant="pri" onClick={() => void save()} disabled={!canEdit || !dirty && !needsPrincipalSave || conflict || previewing || Boolean(previewError) || Boolean(solution && solution.status !== "calculated")}>{busy ? "Saving…" : needsPrincipalSave ? "Save budget & loan" : "Save budget"}</Btn> : null}</div>}>
      {!saved || !value ? query.isError ? <Callout tone="warn">The saved budget could not be loaded.<Btn onClick={() => void query.refetch()}>Retry budget load</Btn></Callout> : <PreparationProgress compact title="Loading deal budget" description="Reading the current loan and recorded costs." /> : <div className={styles.grid}>
        {error ? <Callout tone="bad"><span role="alert">{error}</span><Btn size="sm" onClick={() => void query.refetch()}>Check latest saved budget</Btn></Callout> : null}
        {notice ? <Callout tone="ok"><span role="status">{notice}</span></Callout> : null}
        {refreshWarning ? <Callout tone="warn">{refreshWarning}<Btn size="sm" onClick={() => void refreshSavedBudget().catch(() => setRefreshWarning("The saved budget is retained. Refresh is still unavailable; try again."))}>Retry financial refresh</Btn></Callout> : null}
        {conflict ? <Callout tone="warn">A newer budget was saved. Your working rows are preserved. <Btn onClick={() => void reload()}>Discard edits and load current budget</Btn></Callout> : null}
        {existingFunding && saved.revision === 0 ? <Callout tone="warn">The existing listing raises {money(existingFunding.capital)} with a smallest contribution of {money(existingFunding.minimum)}. Review the proposed funding format below before saving this budget. Existing listing terms are retained until you explicitly update the listing.</Callout> : null}
          <div className={styles.liveControls}>
            <label>Loan amount basis<Select aria-label="Loan amount basis" value={mode} disabled={!canEdit} onChange={event => update({ loan_amount_mode: event.target.value as DealBudgetWrite["loan_amount_mode"], ...(event.target.value === "base_loan" && value.base_loan_amount == null ? { base_loan_amount: currentGross } : {}) })}><option value="gross_loan">Fixed gross loan</option><option value="base_loan">Base loan + financed fees</option><option value="target_net">Target client net at funding</option></Select></label>
            <label>{mode === "target_net" ? "Client net target at funding" : mode === "base_loan" ? "Base loan before financed fees" : "Contractual gross loan"}<Input aria-label={mode === "target_net" ? "Target client net at funding" : mode === "base_loan" ? "Base loan before financed fees" : "Contractual gross loan"} type="number" min={0} step="0.01" disabled={!canEdit || mode === "gross_loan" && !onGrossAmountChange} placeholder="Enter an amount" value={mode === "target_net" ? value.target_net_amount ?? "" : mode === "base_loan" ? value.base_loan_amount ?? "" : currentGross ?? ""} onChange={event => { const next = event.target.value === "" ? null : Number(event.target.value); if (mode === "target_net") update({ target_net_amount: next }); else if (mode === "base_loan") update({ base_loan_amount: next }); else onGrossAmountChange?.(next); }} /></label>
          </div>
        <section ref={liveRef} className={styles.live} aria-label="Live financing waterfall" aria-busy={previewing}>
          <div className={styles.waterfall}>
            <Metric label="Required gross loan" value={solvedGross} />
            <Metric label="Client cash at funding" value={amount(calc, "net_client_cash")} />
            <Metric label="Payment / month" value={numeric(payment?.monthly_equivalent)} />
            <div><small>With costs · DSCR</small><strong>{numeric(feeCoverage?.with_financing_fees_dscr)?.toFixed(2) ?? "—"}x</strong></div>
          </div>
          <div className={styles.liveStatus} role="status">{previewing ? "Calculating current inputs…" : previewError ? "Calculation unavailable · retry below" : solution?.status === "impossible" ? "Target cannot be met · review costs" : needsPrincipalSave ? "Revised loan · awaiting Save budget & loan" : "Current draft calculation"}</div>
          {onApplySolvedPrincipal && solvedGross != null && solution?.status === "calculated" && (currentGross == null || Math.abs(solvedGross - currentGross) > 0.005) ? <Btn size="sm" disabled={!canEdit || previewing} onClick={() => onApplySolvedPrincipal(solvedGross)}>Apply gross amount to working loan</Btn> : null}
        </section>
          <p className={styles.note}>{mode === "target_net" ? "The target is cash delivered at funding. Separately paid closing costs are shown afterward." : mode === "base_loan" ? "Financed closing fees are added to this base once. The base remains unchanged when the solved gross is applied." : "The gross loan stays fixed. Costs marked financed are included inside this amount; choose Base loan to add fees on top."}</p>
        <div className={styles.stats} aria-label="Closing cost breakdown"><Metric label="Fees financed" value={numeric(solution?.financed_closing_costs)} /><Metric label="Fees deducted" value={numeric(solution?.withheld_closing_costs)} /><Metric label="Cash after separate closing costs" value={amount(calc, "borrower_cash_after_separate_costs")} /></div>
        <div className={styles.funding}>
          <label>Funding format<Select aria-label="Funding format" value={value.funding_mode} disabled={!canEdit} onChange={event => update({ funding_mode: event.target.value as DealBudgetWrite["funding_mode"], minimum_investor_contribution: null })}><option value="single_investor">One investor funds the loan</option><option value="multiple_investors">Multiple investors</option></Select></label>
          <div><small>Capital to raise from investors</small><strong style={{ display: "block" }}>{money(amount(calc, "investor_funding_amount"), 2)}</strong><p className={styles.note}>Defaults to the full gross loan. Loan principal and investor funding are separate figures.</p></div>
          {value.funding_mode === "multiple_investors" ? <label>Smallest investor contribution<Input aria-label="Smallest investor contribution" type="number" min={0} step="0.01" value={value.minimum_investor_contribution ?? ""} disabled={!canEdit} placeholder="Enter the smallest participation" onChange={event => update({ minimum_investor_contribution: event.target.value === "" ? null : Number(event.target.value) })} /></label> : <p className={styles.note}>One investor contributes the full capital amount; there is no separate minimum participation to configure.</p>}
        </div>
        <details><summary>Advanced · partial investor funding</summary><div className={styles.funding} style={{ marginTop: 10 }}><label>Capital to raise from investors, $<Input aria-label="Capital to raise from investors" type="number" min={0} step="0.01" disabled={!canEdit} value={value.investor_funding_amount ?? ""} placeholder="Blank uses the full gross loan" onChange={event => update({ investor_funding_amount: event.target.value === "" ? null : Number(event.target.value) })} /></label><p className={styles.note}>A partial raise requires another funding source for the remaining principal. It changes investor participation, rather than the client’s gross loan amount.</p></div></details>
        <label className={styles.label}><input type="checkbox" aria-label="Pricing and costs confirmed" checked={value.costs_confirmed} disabled={!canEdit} onChange={event => update({ costs_confirmed: event.target.checked })} /><span><strong>Costs reviewed / no additional fees</strong><br />An empty table confirms no additional fees. Active rows with unknown amounts still need completion.</span></label>
        <div className={styles.actions}><strong>Fee and cost rows</strong><Btn size="sm" disabled={!canEdit} onClick={() => update({ rows: [...value.rows, newDealCost()] })}><Icon name="plus" size={14} />Add cost</Btn><span className={styles.note}>Blank means unknown. Escrow and reserves are not income. Disabled rows stay in this budget but do not count.</span></div>
        <p className={styles.note}>Public cost labels appear in client and investor documents. Keep private recipient names and contact details in the separate recipient field.</p>
        <div className={styles.scroll} tabIndex={0} role="region" aria-label="Financing cost rows"><table className={styles.table}><thead><tr><th>Item / public label</th><th>Type</th><th>Paid by</th><th>Amount / rate</th><th>Basis</th><th>When charged</th><th>How collected</th><th>Calculated cost</th><th>Private recipient / notes</th><th>Cash-flow treatment</th><th>Reserve return</th><th>Remove</th></tr></thead><tbody>{value.rows.map((row, index) => <tr key={row.id}>
          <td><div className={styles.label}><input type="checkbox" aria-label={`Include cost ${index + 1}`} checked={row.enabled} disabled={!canEdit} onChange={event => rowChange(row.id, { enabled: event.target.checked })} /><Textarea rows={2} aria-label={`Cost ${index + 1} label`} value={row.label} disabled={!canEdit} onChange={event => rowChange(row.id, { label: event.target.value })} /></div>{row.legacy_field ? <small className={styles.note}>Linked to the recorded {row.category} fee · counted once</small> : null}</td>
          <td><Select aria-label={`Cost ${index + 1} type`} value={row.category} disabled={!canEdit} onChange={event => rowChange(row.id, { category: event.target.value as DealCostRow["category"], recipient_role: event.target.value === "escrow_reserve" ? "escrow" : ["origination", "consulting", "servicing", "management"].includes(event.target.value) ? "platform" : "third_party" })}>{Object.entries(DEAL_COST_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></td>
          <td><Select aria-label={`Cost ${index + 1} payer`} value={row.payer} disabled={!canEdit} onChange={event => rowChange(row.id, { payer: event.target.value as DealCostRow["payer"] })}><option value="borrower">Borrower</option><option value="investor">Investor</option><option value="sponsor">Sponsor</option></Select></td>
          <td><div className={styles.cell}><Select aria-label={`Cost ${index + 1} method`} value={row.method} disabled={!canEdit} onChange={event => rowChange(row.id, { method: event.target.value as DealCostRow["method"] })}><option value="fixed">Fixed dollars</option><option value="percent">Percentage / points</option></Select><Input aria-label={`Cost ${index + 1} value`} type="number" min={0} step="any" placeholder="Unknown" value={row.value ?? ""} disabled={!canEdit} onChange={event => rowChange(row.id, { value: event.target.value === "" ? null : Number(event.target.value) })} /></div></td>
          <td><Select aria-label={`Cost ${index + 1} basis`} value={row.basis} disabled={!canEdit || row.method === "fixed"} onChange={event => rowChange(row.id, { basis: event.target.value as DealCostRow["basis"] })}>{Object.entries(DEAL_COST_BASES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></td>
          <td><Select aria-label={`Cost ${index + 1} timing`} value={row.timing} disabled={!canEdit} onChange={event => rowChange(row.id, { timing: event.target.value as DealCostRow["timing"] })}><option value="closing">At closing</option><option value="monthly">Per month (accrued with payments)</option><option value="annual">Per year (accrued with payments)</option></Select></td>
          <td><Select aria-label={`Cost ${index + 1} collection`} value={row.settlement} disabled={!canEdit} onChange={event => rowChange(row.id, { settlement: event.target.value as DealCostRow["settlement"] })}><option value="withheld">Deducted from proceeds / distributions</option><option value="separate">Paid separately</option>{row.payer === "borrower" && row.timing === "closing" ? <option value="financed">Add on top / financed</option> : null}</Select></td>
          <td aria-label={`Cost ${index + 1} calculated amount`}><strong>{previewing ? "Calculating…" : money(numeric((Array.isArray(calc?.rows) ? calc.rows as Array<Record<string, unknown>> : []).find(item => item.id === row.id)?.total_amount), 2)}</strong></td>
          <td><div className={styles.cell}><Select aria-label={`Cost ${index + 1} recipient role`} value={row.recipient_role ?? (row.category === "escrow_reserve" ? "escrow" : ["origination", "consulting", "servicing", "management"].includes(row.category) ? "platform" : "third_party")} disabled={!canEdit} onChange={event => rowChange(row.id, { recipient_role: event.target.value as DealCostRow["recipient_role"] })}><option value="platform">Platform</option><option value="lender">Lender</option><option value="third_party">Third party</option><option value="escrow">Escrow / reserve custodian</option></Select><Input aria-label={`Cost ${index + 1} recipient`} value={row.recipient ?? ""} placeholder="Recipient not recorded" disabled={!canEdit} onChange={event => rowChange(row.id, { recipient: event.target.value })} /><Textarea rows={2} aria-label={`Cost ${index + 1} notes`} value={row.notes ?? ""} disabled={!canEdit} onChange={event => rowChange(row.id, { notes: event.target.value })} /></div></td>
          <td>{row.timing !== "closing" && row.category !== "escrow_reserve" ? <div className={styles.cell}><Select aria-label={`Cost ${index + 1} earnings treatment`} value={row.earnings_treatment ?? "financing_cost"} disabled={!canEdit} onChange={event => rowChange(row.id, { earnings_treatment: event.target.value as DealCostRow["earnings_treatment"] })}><option value="financing_cost">Financing cost · coverage / cash</option><option value="operating_expense">Operating expense · NOI / EBITDA</option></Select><Select aria-label={`Cost ${index + 1} baseline treatment`} value={row.coverage_treatment ?? "new_cost"} disabled={!canEdit} onChange={event => rowChange(row.id, { coverage_treatment: event.target.value as DealCostRow["coverage_treatment"] })}><option value="new_cost">New cost</option><option value="already_in_baseline">Already in baseline · count once</option></Select></div> : <span className={styles.note}>Closing cost / reserve</span>}</td>
          <td>{row.category === "escrow_reserve" ? <Select aria-label={`Cost ${index + 1} reserve return`} value={row.reserve_release} disabled={!canEdit} onChange={event => rowChange(row.id, { reserve_release: event.target.value as DealCostRow["reserve_release"] })}><option value="unknown">Return not confirmed</option><option value="maturity">Released at maturity</option></Select> : <span className={styles.note}>Not a reserve</span>}</td>
          <td><Btn size="sm" disabled={!canEdit} aria-label={`Remove cost ${index + 1}`} onClick={() => remember({ ...value, rows: value.rows.filter(item => item.id !== row.id) }, [...draft?.removed ?? [], row])}><Icon name="x" size={14} /></Btn></td>
        </tr>)}</tbody></table>{!value.rows.length ? <p style={{ padding: 12 }} className={styles.note}>No costs have been entered. Add only documented or explicitly proposed fees.</p> : null}</div>
        {draft?.removed.length ? <details><summary>Removed in this draft · {draft.removed.length}</summary>{draft.removed.map(row => <div key={row.id} className={styles.actions}>{row.label || DEAL_COST_CATEGORIES[row.category]}<Btn size="sm" disabled={!canEdit} onClick={() => remember({ ...value, rows: [...value.rows, row] }, draft.removed.filter(item => item.id !== row.id))}>Restore cost</Btn></div>)}</details> : null}
        {saved.suggested_rows?.some(row => !value.rows.some(current => current.id === row.id)) ? <div className={styles.suggestions}><strong>Recorded costs available to adopt</strong>{saved.suggested_rows.filter(row => !value.rows.some(current => current.id === row.id)).map(row => <div key={row.id} className={styles.actions}><span>{row.label} · {row.value == null ? "Amount unknown" : row.method === "percent" ? `${row.value}%` : money(row.value, 2)}</span><Btn size="sm" disabled={!canEdit} onClick={() => update({ rows: [...value.rows, { ...row }] })}>Use recorded cost</Btn></div>)}</div> : null}
        {previewing ? <PreparationProgress compact title="Calculating working costs and returns" description="Using the actual repayment schedule, fee timing and funding participation." /> : null}
        {previewError ? <Callout tone="warn">{previewError}<Btn size="sm" onClick={() => void live.refetch()}>Retry budget calculation</Btn></Callout> : null}
        <div><strong>{previewing ? "Calculating current inputs…" : preview ? "Current draft calculation" : "Current inputs need calculation"}</strong><div className={styles.totals} style={{ marginTop: 10 }}><Metric label="Gross loan principal" value={amount(calc, "gross_loan_amount")} /><Metric label="Capital to raise from investors" value={amount(calc, "investor_funding_amount")} /><Metric label="Borrower fees deducted at closing" value={amount(calc, "borrower_withheld_fees")} /><Metric label="Borrower costs paid separately" value={amount(calc, "borrower_paid_separately")} /><Metric label="Client net proceeds at funding" value={amount(calc, "net_client_cash")} /><Metric label="Client cash after separate closing costs" value={amount(calc, "borrower_cash_after_separate_costs")} /><Metric label="Investor gross interest · full term" value={amount(calc, "investor_gross_interest")} /><Metric label="Investor costs · full term" value={amount(calc, "investor_fees")} /><Metric label="Investor net profit · full term" value={amount(calc, "investor_net_income")} /><Metric label="Investor gross ROI · full term" value={amount(calc, "investor_gross_roi_pct")} percent /><Metric label="Investor net ROI · full term" value={amount(calc, "investor_net_roi_pct")} percent /><Metric label="Projected platform fees · full term" value={amount(calc, "platform_fee_revenue")} /><Metric label="Projected management / servicing fees" value={amount(calc, "management_revenue")} /><Metric label="Escrow / reserve held" value={amount(calc, "escrow_reserves")} /></div></div>
        {feeCoverage ? <div className={styles.summary}><strong>Coverage including recurring financing fees · scenario</strong><div className={styles.stats}><div><small>Coverage plan DSCR</small><strong>{numeric(feeCoverage.base_dscr)?.toFixed(2) ?? "—"}x</strong></div><div><small>With recurring borrower financing fees</small><strong>{numeric(feeCoverage.with_financing_fees_dscr)?.toFixed(2) ?? "—"}x</strong></div><Metric label="Annual borrower financing fees" value={numeric(feeCoverage.annual_borrower_financing_fees)} /></div><p className={styles.note}>{String(feeCoverage.assumption ?? "The recorded financial baseline stays unchanged; this is the fee-inclusive financing scenario.")}{feeCoverage.method === "conservative_sum_of_separate_peaks" ? " Conservative basis: separate peak loan and fee amounts are combined because aligned payment timing is unavailable." : ""}</p></div> : null}
        {warnings.length ? <Callout tone="warn"><strong>Still needs confirmation</strong><ul>{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></Callout> : null}
        {messages(calc, "assumptions").length ? <details><summary>Calculation assumptions</summary>{messages(calc, "assumptions").map((assumption, index) => <p key={index} className={styles.note}>{assumption}</p>)}</details> : null}
        <label className={styles.cell}>Budget explanation<Textarea aria-label="Budget explanation" value={value.note ?? ""} rows={2} disabled={!canEdit} onChange={event => update({ note: event.target.value })} /></label>
        <p className={styles.note}>{loan ? "The illustration uses the loan currently in this editor. Save budget & loan applies a revised principal. Save new terms version creates its updated PDF. " : ""}Returns are schedule-based illustrations before defaults, delays and unrecorded costs. Gross interest, returned principal, net profit and fee revenue are different amounts. Unknown fees or reserve release prevent a complete net return.</p>
      </div>}
    </FinancialEditorSurface>
  </>;
}
