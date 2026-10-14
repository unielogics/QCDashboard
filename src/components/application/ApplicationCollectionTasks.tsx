"use client";

import { useCallback, useEffect, useState } from "react";
import { Btn, Callout, CellChip, Field, Textarea } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { collectionTaskStatus, type CollectionTask } from "@/lib/applicationCollection";

export function ApplicationCollectionTasks({ profileId, refreshKey, onChanged }: { profileId: string; refreshKey?: string; onChanged?: () => void | Promise<void> }) {
  const api = useAuthedApi();
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const load = useCallback(async () => {
    const result = await api<{ tasks: CollectionTask[] }>(`/application-profiles/${profileId}/collection-tasks`);
    setTasks(result.tasks);
  }, [api, profileId]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Collection tasks unavailable.")); }, [load, refreshKey]);
  async function collect() {
    setBusy("collect"); setError(""); setNotice("");
    try {
      const result = await api<{ tasks: CollectionTask[] }>(`/application-profiles/${profileId}/collection-tasks/collect-missing`, { method: "POST" });
      setTasks(result.tasks); setNotice("Missing fields, forms, consents, and documents are consolidated in the secure room. Automatic outreach follows the configured communication window and reminder limits.");
      await onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Collection could not be scheduled."); }
    finally { setBusy(""); }
  }
  async function patch(task: CollectionTask, body: object) {
    setBusy(task.id); setError("");
    try {
      await api(`/application-profiles/${profileId}/collection-tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setEditing(null); await load(); await onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Collection task could not be updated."); }
    finally { setBusy(""); }
  }
  async function review(task: CollectionTask, disposition: "accepted" | "needs_more") {
    const responseId = task.config.response?.id;
    if (!responseId) return;
    setBusy(task.id); setError("");
    try {
      await api(`/application-profiles/${profileId}/requirement-responses/${responseId}/review`, { method: "POST", body: JSON.stringify({ disposition, reason: disposition === "accepted" ? "Reviewed structured response against the configured requirement" : "Additional clarification requested by underwriting" }) });
      await load(); await onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Response could not be reviewed."); }
    finally { setBusy(""); }
  }
  const open = tasks.filter((task) => task.status !== "completed");
  return <section className="program-readiness-band" aria-labelledby="collection-tasks-heading">
    <div className="program-readiness-heading"><div><span className="lbl">AI collection</span><h3 id="collection-tasks-heading">Missing information and collection tasks</h3><p>Shared requirements are requested once across the selected programs and lender checklists.</p></div><Btn variant="pri" onClick={() => void collect()} disabled={Boolean(busy)}>{busy === "collect" ? "Scheduling..." : "Collect missing items"}</Btn></div>
    {error ? <Callout tone="warn">{error}</Callout> : null}{notice ? <Callout tone="ok">{notice}</Callout> : null}
    <div className="requirement-table compact">{open.map((task) => <article key={task.id} className="requirement-row" style={{ padding: "12px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}><div><strong>{task.label}</strong><p>{task.description}</p></div><CellChip tone={task.assignee === "internal" ? "warn" : "acc"}>{collectionTaskStatus(task)}</CellChip></div>
      <small>{task.action_type.replaceAll("_", " ")} · {task.assignee === "internal" ? "Internal team" : "Borrower"}{task.attempts ? ` · ${task.attempts}/${task.max_attempts} outreach attempts` : ""}{!task.automation_approved ? " · Staff review required before borrower collection" : ""}</small>
      {task.state_reason ? <p>{task.state_reason}</p> : null}
      {task.config.response ? <pre style={{ whiteSpace: "pre-wrap", maxHeight: 180, overflow: "auto" }}>{JSON.stringify(task.config.response.value, null, 2)}</pre> : null}
      {editing === task.id ? <div><Field label="Request message"><Textarea value={description} maxLength={4000} onChange={(event) => setDescription(event.target.value)} /></Field><div className="program-readiness-actions"><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn onClick={() => void patch(task, { description })} disabled={Boolean(busy)}>Save message</Btn></div></div> : <div className="program-readiness-actions" style={{ marginTop: 8 }}>
        <Btn onClick={() => { setEditing(task.id); setDescription(task.description || ""); }} disabled={Boolean(busy)}>Edit request</Btn>
        <Btn onClick={() => void patch(task, { status: task.status === "paused" ? "open" : "paused" })} disabled={Boolean(busy)}>{task.status === "paused" ? "Resume" : "Pause"}</Btn>
        <Btn onClick={() => void patch(task, { assignee: "internal" })} disabled={Boolean(busy)}>Take over</Btn>
        {task.assignee === "internal" && task.automation_approved ? <Btn onClick={() => void patch(task, { assignee: "borrower", status: "open", assigned_user_id: null })} disabled={Boolean(busy)}>Return to AI</Btn> : null}
        {task.action_type === "internal_review" ? <Btn onClick={() => void patch(task, { status: "completed", reason: "Underwriting completed the required internal review" })} disabled={Boolean(busy)}>Complete review</Btn> : null}
        {task.config.response && ["submitted", "conflict", "unavailable"].includes(task.config.response.review_state) ? <>{task.config.response.review_state !== "unavailable" ? <Btn variant="pri" onClick={() => void review(task, "accepted")} disabled={Boolean(busy)}>Accept response</Btn> : null}<Btn onClick={() => void review(task, "needs_more")} disabled={Boolean(busy)}>Request clarification</Btn></> : null}
      </div>}
    </article>)}{!open.length ? <div className="empty">No open collection tasks.</div> : null}</div>
  </section>;
}
