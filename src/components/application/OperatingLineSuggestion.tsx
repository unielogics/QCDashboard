"use client";
import { useEffect, useRef, useState } from "react";
import { metricAmountLabel } from "@/lib/financialMetrics";
import type { OperatingPlanBody } from "@/lib/operatingPlan";
import type { OperatingSuggestionClient, OperatingSuggestionReply } from "@/lib/operatingSuggestions";
import styles from "./OperatingLineSuggestion.module.css";
export function OperatingLineSuggestion({ client, value, expenseId, goalRevision, onChange, disabled, onReview, onPreviewSource }: { onPreviewSource?: (id: string) => void; client?: OperatingSuggestionClient; value: OperatingPlanBody; expenseId: string; goalRevision?: number; onChange: (body: OperatingPlanBody) => void; disabled?: boolean; onReview?: () => void }) {
  const signature = JSON.stringify([client?.scope, goalRevision, value]), live = useRef(signature); live.current = signature;
  const [selectedId, setSelectedId] = useState("");
  const request = useRef<AbortController | null>(null), busyRef = useRef(false);
  const [state, setState] = useState<{ signature: string; reply: OperatingSuggestionReply | null; error: string; busy: boolean; notice: string }>({ signature, reply: null, error: "", busy: false, notice: "" });
  useEffect(() => () => { request.current?.abort(); busyRef.current = false; }, [client?.scope, expenseId]);
  useEffect(() => { if (state.signature !== signature && request.current) { request.current.abort(); request.current = null; busyRef.current = false; setState(before => ({ ...before, busy: false })); } }, [signature, state.signature]);
  if (!client) return null;
  const current = state.signature === signature, candidate = current ? state.reply?.suggestions.find(row => row.id === selectedId) || state.reply?.suggestions[0] : null;
  const run = async (apply = false) => {
    if (busyRef.current || disabled) return;
    if (apply && (!candidate || candidate.status !== "ready" || !state.reply || state.reply.goal_revision !== goalRevision)) return;
    request.current?.abort(); const controller = new AbortController(); request.current = controller; busyRef.current = true;
    setState(before => ({ ...before, signature, reply: apply ? before.reply : null, error: "", busy: true, notice: "" }));
    try {
      if (apply && candidate && state.reply) {
        const reply = await client.apply(value, expenseId, candidate.id, state.reply.context_stamp, controller.signal);
        if (controller.signal.aborted || live.current !== signature) return;
        if (reply.status !== "proposed") throw new Error("This suggestion was not applied. Review the current line and try again.");
        onChange(reply.body); setState({ signature: JSON.stringify([client.scope, goalRevision, reply.body]), reply: null, error: "", busy: false, notice: "Proposal applied. Review its setup and support before saving." });
      } else {
        const reply = await client.suggest(value, expenseId, controller.signal);
        if (controller.signal.aborted || live.current !== signature) return;
        if (reply.expense_row_id !== expenseId || goalRevision != null && reply.goal_revision !== goalRevision) throw new Error("The goal or line changed. Ask for a current suggestion.");
        setSelectedId(reply.suggestions[0]?.id || "");
        setState({ signature, reply, error: "", busy: false, notice: reply.suggestions.length ? "" : "No supported change is available for this line yet." });
      }
    } catch (error) { if (!controller.signal.aborted && live.current === signature) setState({ signature, reply: null, error: error instanceof Error ? error.message : "A suggestion could not be loaded. Try again.", busy: false, notice: "" }); }
    finally { if (request.current === controller) { busyRef.current = false; setState(before => ({ ...before, busy: false })); } }
  };
  const calculation = candidate?.calculation;
  const calculationRows = [
    ["current_annual_cost", "Current annual cost", true], ["proposed_annual_cost", "Proposed annual cost", true],
    ["annual_effect_before_setup", "Annual effect before setup", true], ["net_annual_effect", "Conditional net annual effect", true],
    ["annual_noi_goal_gap", "Annual NOI goal gap", true], ["current_contribution_per_unit", "Contribution per business unit", true],
    ["current_units_annual", "Current annual business units", false], ["additional_units_needed", "Additional units to validate", false],
  ] as const;
  return <div className={styles.line} aria-label={`AI suggestion ${expenseId}`}><button type="button" className={styles.action} disabled={disabled || state.busy} onClick={() => void run()}>{state.busy ? "Checking…" : "AI suggestion"}</button>{candidate ? <><span>{candidate.title}</span>{candidate.status === "ready" ? <button type="button" disabled={disabled || state.busy} onClick={() => void run(true)}>Apply proposal</button> : <button type="button" disabled={disabled} onClick={onReview}>{candidate.status === "already_planned" ? "Review planned change" : "Review line inputs"}</button>}<details><summary>Why</summary>{(state.reply?.suggestions.length || 0) > 1 ? <label>Suggestion<select aria-label={`Suggestion for ${expenseId}`} disabled={state.busy} value={candidate.id} onChange={event => setSelectedId(event.target.value)}>{state.reply?.suggestions.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label> : null}<p>{candidate.why}</p>{typeof calculation?.formula === "string" ? <p>{calculation.formula}</p> : null}<dl>{calculationRows.filter(([key]) => calculation && key in calculation).map(([key, label, money]) => { const amount = typeof calculation?.[key] === "number" ? calculation[key] as number : null; return <div key={key}><dt>{label}</dt><dd>{money ? metricAmountLabel(amount, value.currency) : amount == null ? "Unknown" : amount.toLocaleString()}</dd></div>; })}</dl>{candidate.source_refs.map(source => <button type="button" key={source.file_id} disabled={!onPreviewSource} onClick={() => onPreviewSource?.(source.file_id)}>View {source.file_name || "supporting source"} ↗</button>)}{candidate.assumptions.map(note => <p key={note}>{note}</p>)}{candidate.missing.length ? <p>Still needed: {candidate.missing.join(", ")}</p> : null}<small>Applying creates a proposed change; it does not approve or save a version.</small></details></> : !current && state.reply ? <small>The line or goal changed. Ask again.</small> : null}{current && (state.error || state.notice) ? <small className={state.error ? styles.error : undefined} role={state.error ? "alert" : "status"}>{state.error || state.notice}</small> : null}</div>;
}
