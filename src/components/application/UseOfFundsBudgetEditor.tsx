"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, Select } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { ApiError } from "@/lib/api";
import { budgetPreview, budgetRows, budgetShareLabel, USE_OF_FUNDS_CATEGORIES, type UseOfFundsBudget, type UseOfFundsCategory, type UseOfFundsRow } from "@/lib/useOfFunds";
import styles from "./UseOfFundsEditor.module.css";

const dollars = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(cents / 100);

export type BudgetSaveInput = { expected_revision: number; items: UseOfFundsRow[] };
export type BudgetEditorControls = {
  dirty: boolean; busy: boolean; saving: boolean; canSave: boolean; canEdit: boolean;
  save: () => Promise<void>; discard: () => void;
};
export function UseOfFundsBudgetEditor({ loadBudget, saveBudget, onSaved, audience = "staff", initiallyOpen = false, showActions = true, onControlsChange }: {
  loadBudget: () => Promise<UseOfFundsBudget>;
  saveBudget: (input: BudgetSaveInput) => Promise<UseOfFundsBudget>;
  onSaved?: () => Promise<unknown> | void;
  audience?: "staff" | "client";
  initiallyOpen?: boolean;
  showActions?: boolean;
  onControlsChange?: (controls: BudgetEditorControls | null) => void;
}) {
  const heading = useId();
  const [budget, setBudget] = useState<UseOfFundsBudget | null>(null);
  const [rows, setRows] = useState<UseOfFundsRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [conflict, setConflict] = useState(false);
  const [open, setOpen] = useState(initiallyOpen || audience === "client");
  const editState = useRef({ dirty, busy });
  const savePending = useRef(false);
  editState.current = { dirty, busy };
  const apply = useCallback((next: UseOfFundsBudget) => { setBudget(next); setRows(budgetRows(next.items)); setDirty(false); setConflict(false); }, []);
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { apply(await loadBudget()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Use of funds could not be loaded."); }
    finally { setBusy(false); }
  }, [apply, loadBudget]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      if (document.visibilityState === "hidden" || editState.current.dirty || editState.current.busy) return;
      try {
        const next = await loadBudget();
        if (mounted && !editState.current.dirty && !editState.current.busy) apply(next);
      } catch { /* Keep the last saved budget; explicit reload provides retry. */ }
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { mounted = false; window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [apply, loadBudget]);
  const preview = budgetPreview(rows, budget?.requested_amount ?? null);
  const exactAllocationMissing = Boolean(budget?.requires_exact_allocation && !preview.complete);
  const readOnly = budget?.can_edit === false;
  const canSave = Boolean(budget && dirty && !busy && !conflict && !readOnly && !exactAllocationMissing && !Object.keys(preview.errors).length);
  const change = (next: UseOfFundsRow[]) => { setRows(next); setDirty(true); setSaved(""); };
  const update = (id: string, patch: Partial<UseOfFundsRow>) => change(rows.map((row) => row.id === id ? { ...row, ...patch } : row));
  async function save() {
    if (!budget || !canSave || savePending.current) return;
    savePending.current = true;
    setBusy(true); setSaving(true); setError(""); setSaved("");
    try {
      const next = await saveBudget({
        expected_revision: budget.revision,
        items: rows.map((row) => ({ ...row, label: row.label.trim() || USE_OF_FUNDS_CATEGORIES.find(([key]) => key === row.category)![1] })),
      });
      apply(next);
      setSaved(next.complete ? audience === "client" ? "Budget saved and shared with your file team. This is not a financing approval." : "Budget saved. Program recommendations can now use this allocation; existing program selections and approval status are unchanged." : "Partial budget saved. Allocate the full requested amount to complete your budget.");
      try { await onSaved?.(); } catch { setSaved("Budget saved. Refresh the file to see the latest results."); }
    } catch (reason) {
      setConflict(reason instanceof ApiError && reason.status === 409);
      setError(reason instanceof ApiError && reason.status === 409 ? "This budget changed while you were editing. Your entries remain here. Reload the saved budget before making another change." : reason instanceof Error ? reason.message : "Budget could not be saved.");
    } finally { savePending.current = false; setBusy(false); setSaving(false); }
  }
  const actionRef = useRef({ save, discard: () => { if (budget) apply(budget); setError(""); setSaved(""); } });
  actionRef.current = { save, discard: () => { if (budget) apply(budget); setError(""); setSaved(""); } };
  const saveControl = useCallback(() => actionRef.current.save(), []);
  const discardControl = useCallback(() => actionRef.current.discard(), []);
  useEffect(() => {
    onControlsChange?.({ dirty, busy, saving, canSave, canEdit: !readOnly, save: saveControl, discard: discardControl });
  }, [busy, canSave, dirty, discardControl, onControlsChange, readOnly, saveControl, saving]);
  useEffect(() => () => onControlsChange?.(null), [onControlsChange]);
  return <section className="program-readiness-band" aria-labelledby={heading}>
    <div className={styles.layout}>
      <div className={styles.heading}><div><h3 id={heading}>How will the requested funds be used?</h3><p>{audience === "client" ? "Choose a category and amount for each planned use. Your file team sees the same budget." : "Itemize the financing request so program rules can use amounts and percentages."}</p></div>
        <CellChip tone={!dirty && budget?.complete ? "ok" : "warn"}>{dirty ? preview.complete ? "Ready to save" : "Unsaved budget" : budget?.complete ? "Budget complete" : "Budget needed"}</CellChip>
        <Btn disabled={busy} aria-expanded={open} onClick={() => { if (!open && !dirty) void load(); setOpen(!open); }}>{open ? "Hide budget" : budget?.items.length || readOnly ? "Review budget" : "Add use of funds"}</Btn>
      </div>
      {error ? <Callout tone="warn"><span role="alert">{error}</span><Btn disabled={busy} onClick={() => void load()}>{budget ? "Discard edits and reload saved budget" : "Retry"}</Btn></Callout> : null}
      {saved ? <Callout tone="ok"><span role="status">{saved}</span></Callout> : null}
      {open && budget ? <>
        {readOnly ? <p className={styles.hint}>You can review this budget. An authorized file team member can edit it.</p> : null}
        {budget.warnings?.length ? <Callout tone="warn">{budget.warnings.join(" ")}</Callout> : null}
        {budget.payoff_only_alternative ? <p className={styles.hint}>Your file also records a payoff-only alternative. The budget below is the primary request.</p> : null}
        <div className={styles.summary}>
          <span><small>Requested amount</small><strong>{budget.requested_amount === null ? "Not entered" : dollars(Number(budget.requested_amount) * 100)}</strong></span>
          <span><small>Allocated</small><strong>{dollars(preview.total)}</strong></span>
          <span><small>{preview.remaining !== null && preview.remaining < 0 ? "Over budget" : "Still to allocate"}</small><strong>{preview.remaining === null ? "Set requested amount first" : dollars(Math.abs(preview.remaining))}</strong></span>
          <span><small>Real estate + equipment</small><strong title="Rounded down to two decimals; program rules use exact amounts.">{budgetShareLabel(preview)}</strong></span>
        </div>
        {budget.requested_amount === null ? <Callout tone="warn">{audience === "client" ? "Your file does not have a requested loan amount yet. You can save your planned uses now; ask your file team to confirm the requested amount." : "Set the current request in File details using the edit icon. Save its requested amount and use of funds together."}</Callout> : null}
        <fieldset className={styles.fields} disabled={busy || readOnly}>{rows.map((row, index) => <div key={row.id}>
          <div className={styles.row}>
            <Field label={`Use ${index + 1}`}><Select aria-label={`Use ${index + 1}`} disabled={busy} value={row.category} onChange={(event) => update(row.id, { category: event.target.value as UseOfFundsCategory })}>{USE_OF_FUNDS_CATEGORIES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Select></Field>
            <Field label="Description (optional)"><Input aria-label={`Description for use ${index + 1}`} maxLength={160} value={row.label} disabled={busy} onChange={(event) => update(row.id, { label: event.target.value })} placeholder="For example, purchase of premises" /></Field>
            <Field label="Amount ($)"><Input aria-label={`Amount for use ${index + 1}`} inputMode="decimal" value={row.amount} disabled={busy} aria-invalid={Boolean(preview.errors[row.id])} aria-describedby={preview.errors[row.id] ? `${heading}-${row.id}` : undefined} onChange={(event) => update(row.id, { amount: event.target.value })} /></Field>
            <Btn aria-label={`Remove use ${index + 1}`} disabled={busy} onClick={() => change(rows.filter((item) => item.id !== row.id))}><Icon name="x" size={16} /></Btn>
          </div>
          {preview.errors[row.id] ? <p id={`${heading}-${row.id}`} className={styles.error}>{preview.errors[row.id]}</p> : null}
        </div>)}</fieldset>
        {preview.errors.total ? <p className={styles.error} role="alert">{preview.errors.total}</p> : null}
        {!readOnly ? <div><Btn disabled={busy || rows.length >= 50} onClick={() => change([...rows, { id: crypto.randomUUID(), category: "working_capital", label: "", amount: "" }])}><Icon name="plus" size={14} />Add a use</Btn></div> : null}
        <p className={styles.hint}>{audience === "client" ? "Use real estate for premises or property improvements, equipment for business equipment, and inventory for items you will sell. These categories help your team review suitable financing; they do not establish eligibility or guarantee a program." : "A published QC preference can prioritize SBA 504 when the fixed-asset share meets its configured threshold. This is not an SBA eligibility test. Working capital and inventory need another financing structure; equipment suitability, property use, and all lender criteria still require review."}</p>
        <p className={styles.hint}>{budget.requires_exact_allocation ? "Allocate the full current request before saving. Ask your file team if the requested amount needs to change." : "Partial budgets can be saved. Percentage-based recommendations stay off until the allocation exactly matches the requested amount."}</p>
        {!readOnly && showActions ? <div className={styles.actions}><Btn disabled={!dirty || busy} onClick={() => actionRef.current.discard()}>Discard edits</Btn><Btn variant="pri" disabled={!canSave} onClick={() => void save()}>{saving ? "Saving…" : "Save budget"}</Btn></div> : null}
      </> : open && !error ? <p className={styles.hint}>Loading saved budget…</p> : null}
    </div>
  </section>;
}
