"use client";

import { useRef, useState } from "react";
import { Btn, Callout, CellChip } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type { ApplicationProgramReadiness, ApplicationRequirement } from "@/lib/applicationProfile";
import { collectionCompletionDraft, completeRequirementCollection, type CollectionCompletionDraft } from "@/lib/requirementCollectionCompletion";
import styles from "./RequirementCollectionActions.module.css";

export function RequirementCollectionActions({ profileId, requirement, canEdit, externallyBusy = false, onPending, onSaved, onReload, onPreview }: {
  profileId: string; requirement: ApplicationRequirement; canEdit: boolean; externallyBusy?: boolean;
  onPending: (busy: boolean) => void; onSaved: (readiness: ApplicationProgramReadiness) => Promise<unknown> | void; onReload: () => Promise<unknown> | void;
  onPreview?: (fileId: string) => void;
}) {
  const api = useAuthedApi();
  const [draft, setDraft] = useState<CollectionCompletionDraft | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const activeProfile = useRef(profileId); activeProfile.current = profileId;
  const collection = requirement.collection_completion;
  if (!collection) return null;
  const currentDraft = draft?.profileId === profileId && draft.requirementKey === requirement.requirement_key ? draft : null;
  const selected = currentDraft?.fileIds ?? collection.suggested_file_ids;
  const stale = conflict || !!currentDraft && currentDraft.fingerprint !== collection.fingerprint;
  const disabled = busy || externallyBusy;
  const choose = (fileId: string, include: boolean) => {
    const next = currentDraft ?? collectionCompletionDraft(profileId, requirement);
    setDraft({ ...next, fileIds: include ? [...new Set([...next.fileIds, fileId])] : next.fileIds.filter((id) => id !== fileId), idempotencyKey: crypto.randomUUID() });
    setError("");
  };
  const save = async () => {
    if (disabled || stale || !canEdit || !collection.can_complete) return;
    const nextDraft = currentDraft ?? collectionCompletionDraft(profileId, requirement);
    setDraft(nextDraft); setBusy(true); onPending(true); setError("");
    try {
      const next = await completeRequirementCollection(api, profileId, requirement, nextDraft);
      if (activeProfile.current !== profileId) return;
      setDraft(null);
      try { await onSaved(next); }
      catch { setError("Collection was completed, but the view could not refresh. Reload the evidence to see the saved status."); setConflict(true); }
    } catch (problem) {
      if (activeProfile.current !== profileId) return;
      setError(problem instanceof Error ? problem.message : "The checklist could not be completed. Your evidence selection is retained.");
      if (problem && typeof problem === "object" && "status" in problem && problem.status === 409) setConflict(true);
    } finally { setBusy(false); onPending(false); }
  };
  return <div className={styles.controls} aria-label={`Collection actions for ${requirement.label}`}>
    {collection.complete ? <CellChip tone="ok">Collection complete</CellChip> : canEdit ? <Btn variant="pri" size="sm" disabled={disabled || stale || !collection.can_complete || collection.source === "files" && !selected.length} title={collection.reason || "Complete document collection using the selected evidence"} onClick={() => void save()}>{busy ? "Completing…" : "Mark complete"}</Btn> : null}
    {!collection.complete && collection.source === "files" && collection.eligible_file_ids.length ? <details className={styles.review}><summary>{selected.length} {selected.length === 1 ? "file selected" : "files selected"} for collection{selected.length === 1 ? ` · ${requirement.evidence_files.find((file) => file.file_id === selected[0])?.file_name || "Linked evidence"}` : ""}</summary><div className={styles.choices}>{collection.eligible_file_ids.map((fileId) => <div className={styles.choice} key={fileId}><label><input type="checkbox" checked={selected.includes(fileId)} aria-label={`Use ${requirement.evidence_files.find((file) => file.file_id === fileId)?.file_name || "linked evidence"} to complete collection`} disabled={!canEdit || disabled || stale} onChange={(event) => choose(fileId, event.target.checked)} /><span>{requirement.evidence_files.find((file) => file.file_id === fileId)?.file_name || "Linked evidence"}</span></label>{onPreview ? <Btn size="sm" disabled={disabled} onClick={() => onPreview(fileId)}>View</Btn> : null}</div>)}<p className={styles.note}>This completes document collection. Program earnings, credit and other qualification conditions remain separate.</p></div></details> : null}
    {!collection.complete && collection.reason ? <p className={styles.note}>{collection.reason}</p> : null}
    {stale ? <Callout tone="warn">The evidence changed. Review the latest files before completing collection.<Btn size="sm" disabled={disabled} onClick={() => { setDraft(null); setConflict(false); setError(""); void onReload(); }}>Reload evidence</Btn></Callout> : null}
    {error ? <div className={styles.error}><Callout tone="bad">{error}</Callout></div> : null}
  </div>;
}
