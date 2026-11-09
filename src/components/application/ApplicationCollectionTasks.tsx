"use client";

// The requests the AI makes of the client, and what the team does about them.
//
// A request ("collection task") is how a requirement or a missing answer is
// asked for: a document, a typed answer, a form, a consent, or an internal
// review. Most requests are for a document the requirement list already shows,
// so those are folded into the requirement's own row (see RequirementRequest);
// this file keeps the data hook they share, the controls, and the card for the
// requests that have no document row (missing fields, forms, consents, internal
// reviews).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { requirementCreditCollection } from "@/lib/requirementCredit";
import { RequirementCreditEvidence } from "./RequirementCreditEvidence";

const FILES_SHOWN = 3;

type TaskFile = { file: ApplicationRequirementEvidence; requirement: ApplicationRequirement };

/** The answer a client typed, as lines a person reads rather than JSON. */
export function ResponseView({ value }: { value: unknown }) {
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

export type CollectionController = {
  tasks: CollectionTask[];
  busy: string;
  error: string;
  notice: string;
  collect: () => Promise<void>;
  patch: (task: CollectionTask, body: object) => Promise<boolean>;
  review: (task: CollectionTask, disposition: "accepted" | "needs_more") => Promise<void>;
};

/** One copy of the file's requests, shared by every requirement row and the
 *  list of requests that have no row. */
export function useCollectionTasks(profileId: string, refreshKey?: string, onChanged?: () => void | Promise<void>, enabled = true): CollectionController {
  const api = useAuthedApi();
  const [tasks, setTasks] = useState<CollectionTask[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const currentProfile = useRef(profileId);
  currentProfile.current = profileId;
  const readRequest = useRef(0);
  useEffect(() => { setTasks([]); setError(""); setNotice(""); }, [profileId]);
  const load = useCallback(async () => {
    const request = ++readRequest.current;
    const result = await api<{ tasks: CollectionTask[] }>(`/application-profiles/${profileId}/collection-tasks`);
    if (currentProfile.current === profileId && request === readRequest.current) setTasks(result.tasks);
  }, [api, profileId]);
  useEffect(() => {
    if (!enabled) return;
    void load().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Collection tasks unavailable."));
  }, [enabled, load, refreshKey]);

  const collect = useCallback(async () => {
    setBusy("collect"); setError(""); setNotice("");
    try {
      const result = await api<{ tasks: CollectionTask[] }>(`/application-profiles/${profileId}/collection-tasks/collect-missing`, { method: "POST" });
      setTasks(result.tasks); setNotice("Missing fields, forms, consents, and documents are consolidated in the secure room. Automatic outreach follows the configured communication window and reminder limits.");
      await onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Collection could not be scheduled."); }
    finally { setBusy(""); }
  }, [api, onChanged, profileId]);

  const patch = useCallback(async (task: CollectionTask, body: object) => {
    setBusy(task.id); setError("");
    try {
      await api(`/application-profiles/${profileId}/collection-tasks/${task.id}`, { method: "PATCH", body: JSON.stringify(body) });
      await load(); await onChanged?.();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Collection task could not be updated."); return false; }
    finally { setBusy(""); }
  }, [api, load, onChanged, profileId]);

  const review = useCallback(async (task: CollectionTask, disposition: "accepted" | "needs_more") => {
    const responseId = task.config.response?.id;
    if (!responseId) return;
    setBusy(task.id); setError("");
    try {
      await api(`/application-profiles/${profileId}/requirement-responses/${responseId}/review`, { method: "POST", body: JSON.stringify({ disposition, reason: disposition === "accepted" ? "Reviewed structured response against the configured requirement" : "Additional clarification requested by underwriting" }) });
      await load(); await onChanged?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Response could not be reviewed."); }
    finally { setBusy(""); }
  }, [api, load, onChanged, profileId]);

  return useMemo(() => ({ tasks, busy, error, notice, collect, patch, review }), [tasks, busy, error, notice, collect, patch, review]);
}

/** "upload documents · Borrower · 1/3 outreach attempts", in words. */
export function taskMeta(task: CollectionTask): string {
  const kind = ({ answer_fields: "Questions for the client", upload_documents: "Documents", complete_form: "A form to complete", sign_consent: "A consent to sign", internal_review: "Internal review" } as Record<string, string>)[task.action_type] ?? task.action_type.replaceAll("_", " ");
  return `${kind} · ${task.assignee === "internal" ? "Internal team" : "Asked of the client"}${task.attempts ? ` · ${task.attempts} of ${task.max_attempts} outreach attempts used` : ""}${!task.automation_approved ? " · Staff review required before the AI contacts the client" : ""}`;
}

/** What the team can do to one request: edit its message, pause it, take it
 *  over from the AI, close an internal review, accept or question a typed
 *  answer. The same controls sit on a requirement's row and on the card for a
 *  request that has no row. */
export function CollectionTaskControls({ task, controller, extra }: { task: CollectionTask; controller: CollectionController; extra?: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const working = controller.busy === task.id || controller.busy === "collect";
  const response = task.config.response;
  const needsResponseReview = Boolean(response && ["submitted", "conflict", "unavailable"].includes(response.review_state));
  return (
    <>
      <div className="icon-actions" role="group" aria-label={`Actions for the request: ${task.label}`}>
        {extra}
        <ActionIcon icon="pencil" label="Edit the message the client receives" disabled={working} pressed={editing} onClick={() => { setEditing(true); setDescription(task.description || ""); }} />
        <ActionIcon icon={task.status === "paused" ? "play" : "pause"} label={task.status === "paused" ? "Resume asking the client" : "Pause asking the client"} disabled={working} onClick={() => void controller.patch(task, { status: task.status === "paused" ? "open" : "paused" })} />
        {task.assignee === "internal" && task.automation_approved
          ? <ActionIcon icon="ai" label="Hand it back to the AI" disabled={working} onClick={() => void controller.patch(task, { assignee: "borrower", status: "open", assigned_user_id: null })} />
          : <ActionIcon icon="user" label="Take it over from the AI" disabled={working || task.assignee === "internal"} onClick={() => void controller.patch(task, { assignee: "internal" })} />}
        {task.action_type === "internal_review" ? <ActionIcon icon="check" tone="ok" label="Mark the internal review complete" disabled={working} onClick={() => void controller.patch(task, { status: "completed", reason: "Underwriting completed the required internal review" })} /> : null}
        {needsResponseReview && response?.review_state !== "unavailable" ? <ActionIcon icon="check" tone="ok" label="Accept the client's answer" disabled={working} onClick={() => void controller.review(task, "accepted")} /> : null}
        {needsResponseReview ? <ActionIcon icon="comment" label="Ask the client to clarify" disabled={working} onClick={() => void controller.review(task, "needs_more")} /> : null}
      </div>
      {editing ? (
        <div className="collection-task-edit">
          <Field label="Message the client receives"><Textarea value={description} maxLength={4000} onChange={(event) => setDescription(event.target.value)} /></Field>
          <div className="program-readiness-actions">
            <Btn onClick={() => setEditing(false)}>Cancel</Btn>
            <Btn variant="pri" disabled={Boolean(controller.busy)} onClick={() => void controller.patch(task, { description }).then((ok) => { if (ok) setEditing(false); })}>Save message</Btn>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** The part of a requirement's row that is about asking the client: what was
 *  asked, how often, whether the AI or the team owns it, and the controls. */
export function RequirementRequest({ task, controller }: { task: CollectionTask; controller: CollectionController }) {
  const response = task.config.response;
  return (
    <div className="ev-request" aria-label={`Request to the client: ${task.label}`}>
      <span className="ev-block-title">Request to the client</span>
      {task.description ? <p className="ev-request-message">{task.description}</p> : null}
      <small className="collection-task-meta">{taskMeta(task)}{task.status === "paused" ? " · Paused" : ""}</small>
      {task.state_reason ? <p className="collection-task-hint">{task.state_reason}</p> : null}
      {response ? <ResponseView value={response.value} /> : null}
      <CollectionTaskControls task={task} controller={controller} />
    </div>
  );
}

/** Requests that have no document row: missing answers, forms, consents and internal reviews. */
export function ApplicationCollectionTasks({
  profileId,
  controller,
  tasks,
  requirements = [],
  onPreviewEvidence,
  onVerifyRequirement,
  onCreditRefresh,
  onOpenPrograms,
  programNames = {},
  title = "Other things we are collecting",
}: {
  profileId: string;
  controller: CollectionController;
  /** Only these requests are listed; the rest already sit on a requirement's row. */
  tasks: CollectionTask[];
  /** The file's requirements with their evidence, so each request can show what arrived and what it is waiting on. */
  requirements?: ApplicationRequirement[];
  onPreviewEvidence?: (fileId: string, requirementKey: string) => void;
  onVerifyRequirement?: (requirement: ApplicationRequirement, fileIds: string[]) => void | Promise<void>;
  onCreditRefresh?: () => Promise<unknown> | void;
  onOpenPrograms?: () => void;
  programNames?: Record<string, string>;
  title?: string;
}) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [answersFor, setAnswersFor] = useState<{ kind: FormKind; requirementKey: string } | null>(null);
  const requirementByKey = useMemo(() => new Map(requirements.map((item) => [item.requirement_key, item])), [requirements]);
  const working = (task: CollectionTask) => controller.busy === task.id || controller.busy === "collect";
  if (!tasks.length) return null;
  return <section className="ev-other" aria-labelledby="collection-tasks-heading">
    <header className="ev-group-head">
      <h4 id="collection-tasks-heading">{title}<span className="ev-count">{tasks.length}</span></h4>
      <p>Questions, forms, consents and reviews that are not a document on the list above.</p>
    </header>
    <div className="requirement-table compact collection-task-list">{tasks.map((task) => {
      const linked = (task.requirement_keys ?? []).map((key) => requirementByKey.get(key)).filter((item): item is ApplicationRequirement => Boolean(item));
      const waiting: RequirementWaiting | null = task.assignee !== "internal" && task.status === "in_review"
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
      const verifyTarget = waiting?.kind === "needs_signoff" ? linked.find((item) => item.status === "received_unverified" && item.verification_required && !requirementCreditCollection(item)) : undefined;
      const response = task.config.response;
      return <article key={task.id} className="requirement-row collection-task" data-status={task.status}>
        <div className="collection-task-head">
          <div className="grow">
            <strong>{task.label}</strong>
            {task.description ? <p>{task.description}</p> : null}
          </div>
          <CellChip tone={statusTone} title={waiting?.hint}>{waiting ? waiting.label : collectionTaskStatus(task)}</CellChip>
        </div>
        <CollectionTaskControls
          task={task}
          controller={controller}
          extra={<>
            {verifyTarget && onVerifyRequirement ? <ActionIcon icon="shieldChk" tone="ok" label="Sign off: confirm the AI's acceptance" disabled={working(task)} onClick={() => void onVerifyRequirement(verifyTarget, (verifyTarget.evidence_files ?? []).filter((file) => file.ai_decision === "accepted" && !file.verified).map((file) => file.file_id))} /> : null}
            {kinds.map(({ kind, requirementKey }) => <ActionIcon key={kind} icon="docCheck" label={`See the ${formLabel(kind)}: what was filled in`} onClick={() => setAnswersFor({ kind, requirementKey })} />)}
          </>}
        />
        <small className="collection-task-meta">{taskMeta(task)}</small>
        {waiting ? <p className="collection-task-hint">{waiting.hint}</p> : null}
        {task.state_reason && !waiting ? <p className="collection-task-hint">{task.state_reason}</p> : null}
        {linked.map((requirement) => { const credit = requirementCreditCollection(requirement); return credit ? <RequirementCreditEvidence key={requirement.requirement_key} profileId={profileId} credit={credit} requirementKey={requirement.requirement_key} programNames={requirement.source_program_keys.map((key) => programNames[key] || key)} onOpenPrograms={onOpenPrograms} onRefresh={onCreditRefresh} /> : null; })}
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
      </article>;
    })}</div>
    <FormAnswersDrawer
      profileId={profileId}
      kind={answersFor?.kind ?? null}
      open={Boolean(answersFor)}
      onClose={() => setAnswersFor(null)}
      onPreviewFile={onPreviewEvidence && answersFor ? (fileId) => onPreviewEvidence(fileId, answersFor.requirementKey) : undefined}
    />
  </section>;
}
