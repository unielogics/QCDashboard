"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Btn, Callout, CellChip, Field, Textarea } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { Icon } from "@/components/design-system/Icon";
import { FormAnswersDrawer } from "@/components/application/FormAnswersDrawer";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationRequirement, ApplicationRequirementEvidence } from "@/lib/applicationProfile";
import { collectionTaskStatus, type CollectionTask } from "@/lib/applicationCollection";
import { evidenceDecisionLabel, evidenceDecisionTone } from "@/lib/evidenceDecision";
import { formKindsOf, formLabel, type FormKind } from "@/lib/formAnswers";
import { evidenceOriginLabel, mostUrgentWaiting, requirementWaiting, type RequirementWaiting } from "@/lib/requirementWaiting";

const FILES_SHOWN = 3;

type TaskFile = { file: ApplicationRequirementEvidence; requirement: ApplicationRequirement };

/** The answer a client typed, as lines a person reads rather than JSON. */
function ResponseView({ value }: { value: unknown }) {
  const answer = value && typeof value === "object" && "answer" in (value as Record<string, unknown>) ? (value as Record<string, unknown>).answer : value;
  if (answer && typeof answer === "object" && !Array.isArray(answer)) {
    return (
      <dl className="collection-response">
        {Object.entries(answer as Record<string, unknown>).map(([key, item]) => (
          <div key={key}>
            <dt>{key.replaceAll("_", " ")}</dt>
            <dd>{typeof item === "object" ? JSON.stringify(item) : String(item ?? "")}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <p className="collection-response-text">{Array.isArray(answer) ? answer.join(", ") : String(answer ?? "")}</p>;
}

export function ApplicationCollectionTasks({
  profileId,
  refreshKey,
  onChanged,
  requirements = [],
  onPreviewEvidence,
  onVerifyRequirement,
}: {
  profileId: string;
  refreshKey?: string;
  onChanged?: () => void | Promise<void>;
  /** The file's requirements with their evidence, so each task can show what arrived and what it is waiting on. */
  requirements?: ApplicationRequirement[];
  onPreviewEvidence?: (fileId: string, requirementKey: string) => void;
  onVerifyRequirement?: (requirement: ApplicationRequirement, fileIds: string[]) => void | Promise<void>;
}) {
  const api = useAuthedApi();
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [expanded, setExpanded] = useState<string[]>([]);
  const [answersFor, setAnswersFor] = useState<{ kind: FormKind; requirementKey: string } | null>(null);
  const load = useCallback(async () => {
    const result = await api<{ tasks: CollectionTask[] }>(`/application-profiles/${profileId}/collection-tasks`);
    setTasks(result.tasks);
  }, [api, profileId]);
  useEffect(() => { void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Collection tasks unavailable.")); }, [load, refreshKey]);
  const requirementByKey = useMemo(() => new Map(requirements.map((item) => [item.requirement_key, item])), [requirements]);

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
    <div className="requirement-table compact collection-task-list">{open.map((task) => {
      const linked = (task.requirement_keys ?? []).map((key) => requirementByKey.get(key)).filter((item): item is ApplicationRequirement => Boolean(item));
      const waiting: RequirementWaiting | null = task.status === "in_review"
        ? mostUrgentWaiting(linked.filter((item) => item.status === "received_unverified").map(requirementWaiting))
        : null;
      const seen = new Set<string>();
      const taskFiles: TaskFile[] = linked.flatMap((requirement) => (requirement.evidence_files ?? []).map((file) => ({ file, requirement }))).filter(({ file }) => {
        if (seen.has(file.file_id)) return false;
        seen.add(file.file_id);
        return true;
      });
      const isExpanded = expanded.includes(task.id);
      const shownFiles = isExpanded ? taskFiles : taskFiles.slice(0, FILES_SHOWN);
      const kinds = [...new Set(linked.flatMap((requirement) => formKindsOf(requirement).map((kind) => `${kind}|${requirement.requirement_key}`)))].map((value) => {
        const [kind, requirementKey] = value.split("|");
        return { kind: kind as FormKind, requirementKey };
      }).filter((item, index, all) => all.findIndex((other) => other.kind === item.kind) === index);
      const statusTone = waiting ? waiting.tone : task.assignee === "internal" ? "warn" : "acc";
      const verifyTarget = waiting?.kind === "needs_signoff" ? linked.find((item) => item.status === "received_unverified" && item.verification_required) : undefined;
      const response = task.config.response;
      const needsResponseReview = Boolean(response && ["submitted", "conflict", "unavailable"].includes(response.review_state));
      const working = busy === task.id || busy === "collect";
      return <article key={task.id} className="requirement-row collection-task" data-status={task.status}>
        <div className="collection-task-head">
          <div className="grow">
            <strong>{task.label}</strong>
            {task.description ? <p>{task.description}</p> : null}
          </div>
          <CellChip tone={statusTone} title={waiting?.hint}>{waiting ? waiting.label : collectionTaskStatus(task)}</CellChip>
          <div className="icon-actions" role="group" aria-label={`Actions for ${task.label}`}>
            {verifyTarget && onVerifyRequirement ? <ActionIcon icon="shieldChk" tone="ok" label="Verify: confirm the AI's acceptance" disabled={working} onClick={() => void onVerifyRequirement(verifyTarget, (verifyTarget.evidence_files ?? []).filter((file) => file.ai_decision === "accepted" && !file.verified).map((file) => file.file_id))} /> : null}
            {kinds.map(({ kind, requirementKey }) => <ActionIcon key={kind} icon="docCheck" label={`See the ${formLabel(kind)}: what was filled in`} onClick={() => setAnswersFor({ kind, requirementKey })} />)}
            <ActionIcon icon="pencil" label="Edit the request message" disabled={working} pressed={editing === task.id} onClick={() => { setEditing(task.id); setDescription(task.description || ""); }} />
            <ActionIcon icon={task.status === "paused" ? "play" : "pause"} label={task.status === "paused" ? "Resume this request" : "Pause this request"} disabled={working} onClick={() => void patch(task, { status: task.status === "paused" ? "open" : "paused" })} />
            {task.assignee === "internal" && task.automation_approved
              ? <ActionIcon icon="ai" label="Hand it back to the AI" disabled={working} onClick={() => void patch(task, { assignee: "borrower", status: "open", assigned_user_id: null })} />
              : <ActionIcon icon="user" label="Take it over from the AI" disabled={working || task.assignee === "internal"} onClick={() => void patch(task, { assignee: "internal" })} />}
            {task.action_type === "internal_review" ? <ActionIcon icon="check" tone="ok" label="Mark the internal review complete" disabled={working} onClick={() => void patch(task, { status: "completed", reason: "Underwriting completed the required internal review" })} /> : null}
            {needsResponseReview && response?.review_state !== "unavailable" ? <ActionIcon icon="check" tone="ok" label="Accept the client's response" disabled={working} onClick={() => void review(task, "accepted")} /> : null}
            {needsResponseReview ? <ActionIcon icon="comment" label="Ask the client to clarify" disabled={working} onClick={() => void review(task, "needs_more")} /> : null}
          </div>
        </div>
        <small className="collection-task-meta">{task.action_type.replaceAll("_", " ")} · {task.assignee === "internal" ? "Internal team" : "Borrower"}{task.attempts ? ` · ${task.attempts}/${task.max_attempts} outreach attempts` : ""}{!task.automation_approved ? " · Staff review required before borrower collection" : ""}</small>
        {waiting ? <p className="collection-task-hint">{waiting.hint}</p> : null}
        {task.state_reason && !waiting ? <p className="collection-task-hint">{task.state_reason}</p> : null}
        {taskFiles.length ? <ul className="collection-files" aria-label={`Files for ${task.label}`}>
          {shownFiles.map(({ file, requirement }) => <li key={file.file_id} className={`decision-${file.ai_decision}`}>
            <Icon name={file.origin === "filled_form" ? "docCheck" : "file"} size={15} />
            <span className="grow trunc">
              <b className="trunc">{file.file_name}</b>
              <small>{evidenceOriginLabel(file.origin, file.form_kind)}{file.ai_explanation && file.ai_decision !== "accepted" ? ` · ${file.ai_explanation}` : ""}</small>
            </span>
            <CellChip tone={evidenceDecisionTone(file.ai_decision)}>{evidenceDecisionLabel(file.ai_decision, file.decision_actor)}</CellChip>
            {onPreviewEvidence ? <ActionIcon icon="eye" label={`Preview ${file.file_name}`} onClick={() => onPreviewEvidence(file.file_id, requirement.requirement_key)} /> : null}
          </li>)}
          {taskFiles.length > FILES_SHOWN ? <li className="collection-files-more"><button type="button" className="linky" onClick={() => setExpanded((current) => isExpanded ? current.filter((id) => id !== task.id) : [...current, task.id])}>{isExpanded ? "Show fewer files" : `Show ${taskFiles.length - FILES_SHOWN} more file${taskFiles.length - FILES_SHOWN === 1 ? "" : "s"}`}</button></li> : null}
        </ul> : null}
        {response ? <ResponseView value={response.value} /> : null}
        {editing === task.id ? <div className="collection-task-edit"><Field label="Request message"><Textarea value={description} maxLength={4000} onChange={(event) => setDescription(event.target.value)} /></Field><div className="program-readiness-actions"><Btn onClick={() => setEditing(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void patch(task, { description })} disabled={Boolean(busy)}>Save message</Btn></div></div> : null}
      </article>;
    })}{!open.length ? <div className="empty">No open collection tasks.</div> : null}</div>
    <FormAnswersDrawer
      profileId={profileId}
      kind={answersFor?.kind ?? null}
      open={Boolean(answersFor)}
      onClose={() => setAnswersFor(null)}
      onPreviewFile={onPreviewEvidence && answersFor ? (fileId) => onPreviewEvidence(fileId, answersFor.requirementKey) : undefined}
    />
  </section>;
}
