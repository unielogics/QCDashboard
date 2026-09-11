"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Field, IconBtn, Select, Textarea, cx } from "@/components/ds";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { api, ApiError } from "@/lib/api";
import type {
  ApplicationProgramReadiness as Readiness,
  ApplicationRequirement,
  ApplicationRequirementEvidence,
  EvidenceDecisionStatus,
  ProgramFitCandidate,
  RoomDeliveryReceipt,
} from "@/lib/applicationProfile";
import { semanticChipTone, semanticStatusClass } from "@/lib/semanticStatus";

type EvidenceFile = { id: string; file_name: string; created_at?: string };
type OverrideDraft = {
  requirementKey: string;
  action: "waive" | "not_applicable";
  reason: string;
  allPrograms: boolean;
  programKeys: string[];
};
type EvidenceOverrideDraft = {
  requirementKey: string;
  fileId: string;
  decision: "accepted" | "rejected" | "needs_more";
  reasonCode: "wrong_document" | "wrong_entity" | "wrong_period" | "incomplete" | "unreadable" | "duplicate" | "other" | "ai_override";
  reason: string;
};
type ReassignDraft = { requirementKey: string; fileId: string; targetKey: string };

const ACCEPTED_UPLOADS = ".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,image/*";
const DECISION_LABELS: Record<EvidenceDecisionStatus, string> = {
  processing: "Processing",
  accepted: "Accepted by AI",
  needs_more: "Needs more",
  rejected: "Rejected by AI",
  failed: "Analysis failed",
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "The readiness workspace could not be updated.";
}

function when(value: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function requirementIsComplete(requirement: ApplicationRequirement): boolean {
  if (["verified", "waived", "not_applicable"].includes(requirement.status)) return true;
  return requirement.source_program_keys.length > 0
    && requirement.source_program_keys.every((key) => ["waived", "not_applicable"].includes(requirement.program_overrides[key] || ""));
}

function coverageText(requirement: ApplicationRequirement, accepted = false): string {
  const coverage = (accepted ? requirement.verified_coverage : requirement.coverage) ?? {};
  const fallbackCount = accepted
    ? requirement.verified_evidence_count ?? 0
    : requirement.evidence_count ?? Number(Boolean(requirement.evidence_file_id));
  const current = Number(coverage.current ?? fallbackCount);
  const required = Number(coverage.required ?? 1);
  const unit = String(coverage.unit ?? "documents");
  return `${current} of ${required} ${unit}`;
}

function decisionTone(decision: EvidenceDecisionStatus): "ok" | "acc" | "warn" | "bad" | "mut" {
  if (decision === "accepted") return "ok";
  if (decision === "rejected" || decision === "failed") return "bad";
  if (decision === "needs_more") return "warn";
  return "acc";
}

function candidateLabel(candidate: ProgramFitCandidate): string {
  if (candidate.recommendation_status === "recommended") return "Recommended";
  if (candidate.recommendation_status === "needs_information") return "Needs information";
  if (candidate.recommendation_status === "criteria_unavailable") return "Criteria unavailable";
  return "Not eligible";
}

function candidateTone(candidate: ProgramFitCandidate): "ok" | "acc" | "warn" | "bad" | "mut" {
  if (candidate.recommendation_status === "recommended") return "ok";
  if (candidate.recommendation_status === "needs_information") return "warn";
  if (candidate.recommendation_status === "not_eligible") return "bad";
  return "mut";
}

export function ApplicationProgramReadiness({
  profileId,
  files,
  onNotice,
  onRunAiReview,
  aiReviewRunning = false,
  onUploadFiles,
  uploadBusy = false,
}: {
  profileId: string;
  files: EvidenceFile[];
  onNotice?: (message: string) => void;
  onRunAiReview?: () => void;
  aiReviewRunning?: boolean;
  onUploadFiles?: (files: File[], requestedDocumentId?: string) => Promise<void> | void;
  uploadBusy?: boolean;
}) {
  const { getToken } = useAuth();
  const confirmAction = useConfirmAction();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [programReason, setProgramReason] = useState("");
  const [evidenceSelections, setEvidenceSelections] = useState<Record<string, string>>({});
  const [selectedRequestKeys, setSelectedRequestKeys] = useState<string[]>([]);
  const [expandedRequirements, setExpandedRequirements] = useState<string[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft | null>(null);
  const [evidenceOverride, setEvidenceOverride] = useState<EvidenceOverrideDraft | null>(null);
  const [reassignDraft, setReassignDraft] = useState<ReassignDraft | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authenticated = useCallback(async function authenticated<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }, [getToken]);

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const next = await authenticated<Readiness>(`/application-profiles/${profileId}/program-readiness`);
      setReadiness(next);
      setSelectedPrograms(next.selections.map((selection) => selection.program_key));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }, [authenticated, profileId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refreshAfterAnalysis = () => void load();
    window.addEventListener("qc-ai-review-completed", refreshAfterAnalysis);
    return () => window.removeEventListener("qc-ai-review-completed", refreshAfterAnalysis);
  }, [load]);

  const selectedSet = useMemo(() => new Set(selectedPrograms), [selectedPrograms]);
  const requirementByKey = useMemo(
    () => new Map((readiness?.requirements ?? []).map((requirement) => [requirement.requirement_key, requirement])),
    [readiness],
  );
  const blockingKeys = useMemo(
    () => new Set((readiness?.programs ?? []).flatMap((program) => program.blocking_requirement_keys)),
    [readiness],
  );
  const requestableRequirements = useMemo(
    () => (readiness?.requirements ?? []).filter(
      (requirement) => requirement.client_visible
        && !requirementIsComplete(requirement)
        && (requirement.status === "stale" || requirement.status === "failed" || !requirement.verified_coverage_complete)
        && (blockingKeys.has(requirement.requirement_key) || requirement.source_policy_keys.length > 0),
    ),
    [blockingKeys, readiness],
  );
  const ineligibleSelected = useMemo(() => {
    if (!readiness) return [];
    return readiness.candidates.filter((candidate) => selectedSet.has(candidate.program_key) && !candidate.eligible);
  }, [readiness, selectedSet]);

  async function savePrograms(returnToAi = false) {
    if (!readiness) return;
    const changed = selectedPrograms.join("|") !== readiness.selections.map((item) => item.program_key).join("|");
    if (!returnToAi && !changed) return;
    if (!returnToAi && ineligibleSelected.length && programReason.trim().length < 8) {
      setError("Explain why the reviewed file should use an AI-ineligible program.");
      return;
    }
    const confirmed = await confirmAction({
      title: returnToAi ? "Return program selection to AI?" : "Apply selected funding programs?",
      body: returnToAi
        ? "The highest-confidence eligible published program will be selected once. Future AI suggestions remain advisory."
        : `Requirements will be recalculated from pinned published versions.${ineligibleSelected.length ? ` Override reason: ${programReason.trim()}` : ""}`,
      confirmLabel: returnToAi ? "Return to AI selection" : "Apply programs",
    });
    if (!confirmed) return;
    setBusy("programs");
    setError(null);
    try {
      const next = await authenticated<Readiness>(`/application-profiles/${profileId}/programs`, {
        method: "PATCH",
        body: JSON.stringify({
          program_keys: returnToAi ? [] : selectedPrograms,
          return_to_ai: returnToAi,
          confirmed: true,
          reason: returnToAi ? "Operator returned selection to published AI criteria" : programReason.trim() || "Operator reviewed program selection",
        }),
      });
      setReadiness(next);
      setSelectedPrograms(next.selections.map((selection) => selection.program_key));
      setProgramReason("");
      onNotice?.(returnToAi ? "Program selection returned to AI criteria." : "Funding programs updated.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function mutateRequirement(requirementKey: string, payload: Record<string, unknown>, notice: string) {
    setBusy(`requirement:${requirementKey}`);
    setError(null);
    try {
      const next = await authenticated<Readiness>(
        `/application-profiles/${profileId}/requirements/${encodeURIComponent(requirementKey)}`,
        { method: "PATCH", body: JSON.stringify({ ...payload, confirmed: true }) },
      );
      setReadiness(next);
      setOverrideDraft(null);
      onNotice?.(notice);
      return next;
    } catch (reason) {
      setError(errorMessage(reason));
      return null;
    } finally {
      setBusy("");
    }
  }

  async function reviewRequirementAction(
    requirement: ApplicationRequirement,
    action: "verify" | "unverify" | "restore" | "link_evidence" | "unlink_evidence",
    evidenceFileIds: string[] = [],
  ) {
    const labels = {
      verify: "Verify human-governed evidence",
      unverify: "Remove human verification",
      restore: "Restore requirement",
      link_evidence: "Propose evidence assignment",
      unlink_evidence: "Unlink evidence",
    };
    const confirmed = await confirmAction({
      title: `${labels[action]}?`,
      body: `${requirement.label} will be recalculated and recorded in the audit trail. Unlinked evidence stays in its bucket.`,
      confirmLabel: labels[action],
    });
    if (!confirmed) return;
    const selectedEvidenceId = evidenceSelections[requirement.requirement_key];
    const selectedIds = action === "link_evidence" ? selectedEvidenceId ? [selectedEvidenceId] : [] : evidenceFileIds;
    await mutateRequirement(requirement.requirement_key, { action, evidence_file_ids: selectedIds }, `${requirement.label} updated.`);
    if (action === "link_evidence") {
      setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: "" }));
      setExpandedRequirements((current) => [...new Set([...current, requirement.requirement_key])]);
    }
  }

  async function applyOverride() {
    if (!overrideDraft || overrideDraft.reason.trim().length < 8) return;
    const requirement = requirementByKey.get(overrideDraft.requirementKey);
    if (!requirement) return;
    const scope = overrideDraft.allPrograms ? "all selected programs" : `${overrideDraft.programKeys.length} selected program(s)`;
    const confirmed = await confirmAction({
      title: overrideDraft.action === "waive" ? "Waive this requirement?" : "Mark not applicable?",
      body: `${requirement.label} will be overridden for ${scope}. Reason: ${overrideDraft.reason.trim()}`,
      confirmLabel: overrideDraft.action === "waive" ? "Confirm waiver" : "Confirm not applicable",
      tone: "danger",
    });
    if (!confirmed) return;
    await mutateRequirement(requirement.requirement_key, {
      action: overrideDraft.action,
      reason: overrideDraft.reason.trim(),
      all_programs: overrideDraft.allPrograms,
      program_keys: overrideDraft.allPrograms ? [] : overrideDraft.programKeys,
    }, `${requirement.label} override recorded.`);
  }

  async function applyEvidenceOverride() {
    if (!evidenceOverride || evidenceOverride.reason.trim().length < 8) return;
    const file = requirementByKey.get(evidenceOverride.requirementKey)?.evidence_files.find((item) => item.file_id === evidenceOverride.fileId);
    if (!file) return;
    const confirmed = await confirmAction({
      title: evidenceOverride.decision === "accepted" ? "Override AI and accept evidence?" : "Reject this evidence?",
      body: `${file.file_name}: ${evidenceOverride.reason.trim()}. The original AI decision remains in immutable history.`,
      confirmLabel: evidenceOverride.decision === "accepted" ? "Accept evidence" : "Reject evidence",
      tone: evidenceOverride.decision === "accepted" ? "default" : "danger",
    });
    if (!confirmed) return;
    setBusy(`evidence:${evidenceOverride.fileId}`);
    setError(null);
    try {
      const next = await authenticated<Readiness>(
        `/application-profiles/${profileId}/requirements/${encodeURIComponent(evidenceOverride.requirementKey)}/evidence/${evidenceOverride.fileId}`,
        { method: "PATCH", body: JSON.stringify({ decision: evidenceOverride.decision, reason_code: evidenceOverride.reasonCode, reason: evidenceOverride.reason.trim(), confirmed: true }) },
      );
      setReadiness(next);
      setEvidenceOverride(null);
      onNotice?.(`${file.file_name} decision updated.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function applyReassignment() {
    if (!reassignDraft?.targetKey) return;
    const source = requirementByKey.get(reassignDraft.requirementKey);
    const target = requirementByKey.get(reassignDraft.targetKey);
    const file = source?.evidence_files.find((item) => item.file_id === reassignDraft.fileId);
    if (!source || !target || !file) return;
    const confirmed = await confirmAction({
      title: "Reassign evidence?",
      body: `${file.file_name} will move from ${source.label} to ${target.label}. AI must validate the new assignment.`,
      confirmLabel: "Reassign evidence",
    });
    if (!confirmed) return;
    setBusy(`evidence:${file.file_id}`);
    setError(null);
    try {
      await authenticated<Readiness>(`/application-profiles/${profileId}/requirements/${encodeURIComponent(source.requirement_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "unlink_evidence", evidence_file_ids: [file.file_id], confirmed: true }),
      });
      const next = await authenticated<Readiness>(`/application-profiles/${profileId}/requirements/${encodeURIComponent(target.requirement_key)}`, {
        method: "PATCH",
        body: JSON.stringify({ action: "link_evidence", evidence_file_ids: [file.file_id], confirmed: true }),
      });
      setReadiness(next);
      setReassignDraft(null);
      setExpandedRequirements((current) => [...new Set([...current, target.requirement_key])]);
      onNotice?.(`${file.file_name} was reassigned for AI validation.`);
    } catch (reason) {
      setError(errorMessage(reason));
      await load();
    } finally {
      setBusy("");
    }
  }

  async function retryAnalysis(file: ApplicationRequirementEvidence) {
    setBusy(`evidence:${file.file_id}`);
    setError(null);
    try {
      await authenticated(`/application-profiles/${profileId}/evidence/${file.file_id}/reanalyze`, { method: "POST" });
      onNotice?.(`${file.file_name} was queued for AI reanalysis.`);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function sendSelectedRequests() {
    const selected = requestableRequirements.filter((item) => selectedRequestKeys.includes(item.requirement_key));
    if (!selected.length) return;
    const confirmed = await confirmAction({
      title: `Email ${selected.length} requested item${selected.length === 1 ? "" : "s"}?`,
      body: `One email will contain one secure-room link and these items: ${selected.map((item) => item.label).join(", ")}.`,
      confirmLabel: "Send one email",
    });
    if (!confirmed) return;
    setBusy("batch-request");
    setError(null);
    try {
      const receipt = await authenticated<RoomDeliveryReceipt>(`/application-profiles/${profileId}/requirements/batch-request`, {
        method: "POST",
        body: JSON.stringify({ requirement_keys: selected.map((item) => item.requirement_key), channel: "email", retry_failed: selected.some((item) => item.status === "failed") }),
      });
      setSelectedRequestKeys([]);
      await load();
      onNotice?.(receipt.provider_accepted
        ? `One email for ${receipt.requirement_keys?.length || selected.length} item${selected.length === 1 ? "" : "s"} was accepted for ${receipt.recipient_masked || "the client"}.`
        : `Combined email failed: ${receipt.detail || "provider rejected the request"}`);
    } catch (reason) {
      setError(errorMessage(reason));
      setBusy("");
    }
  }

  async function toggleAutomation() {
    if (!readiness) return;
    const nextEnabled = !readiness.automation.enabled;
    const confirmed = await confirmAction({
      title: `${nextEnabled ? "Enable" : "Disable"} missing-item emails?`,
      body: nextEnabled ? "Open requirements are consolidated into one email, no more than once every 24 hours and up to three attempts." : "Scheduled messages stop immediately. Existing history is preserved.",
      confirmLabel: nextEnabled ? "Enable automation" : "Disable automation",
    });
    if (!confirmed) return;
    setBusy("automation");
    try {
      const next = await authenticated<Readiness>(`/application-profiles/${profileId}/missing-item-automation`, { method: "PATCH", body: JSON.stringify({ enabled: nextEnabled }) });
      setReadiness(next);
      onNotice?.(`Missing-item email automation ${nextEnabled ? "enabled" : "disabled"}.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function upload(filesToUpload: File[], requestedDocumentId?: string) {
    if (!filesToUpload.length || !onUploadFiles) return;
    try {
      await onUploadFiles(filesToUpload, requestedDocumentId);
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setUploadDragging(false);
      setDragTarget(null);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }

  if (!readiness && busy === "load") return <div className="empty">Loading program readiness...</div>;
  if (!readiness) return <Callout tone="warn">{error || "Program readiness is unavailable."}</Callout>;

  const originalPrograms = readiness.selections.map((item) => item.program_key).join("|");
  const programsChanged = selectedPrograms.join("|") !== originalPrograms;
  const selectedRequestSet = new Set(selectedRequestKeys);
  const allRequestableSelected = requestableRequirements.length > 0 && requestableRequirements.every((item) => selectedRequestSet.has(item.requirement_key));
  const primaryKey = readiness.selections.find((item) => item.source === "ai_auto")?.program_key || readiness.candidates.find((item) => item.recommendation_status === "recommended")?.program_key;
  const recommended = readiness.candidates.filter((item) => item.recommendation_status === "recommended");
  const alternatives = readiness.candidates.filter((item) => item.recommendation_status === "needs_information" || item.recommendation_status === "criteria_unavailable");
  const notEligible = readiness.candidates.filter((item) => item.recommendation_status === "not_eligible");

  const candidateCard = (candidate: ProgramFitCandidate) => (
    <label key={candidate.program_key} className={cx("program-candidate", selectedSet.has(candidate.program_key) && "selected")}>
      <input type="checkbox" checked={selectedSet.has(candidate.program_key)} disabled={!candidate.playbook_id} onChange={() => setSelectedPrograms((current) => current.includes(candidate.program_key) ? current.filter((key) => key !== candidate.program_key) : [...current, candidate.program_key])} />
      <span><strong>{candidate.program_name}</strong><small>{candidate.playbook_version ? `v${candidate.playbook_version}` : "No published criteria"}{candidate.recommendation_status === "recommended" ? ` · ${Math.round(candidate.fit_score)}% fit` : candidate.reasons[0] ? ` · ${candidate.reasons[0]}` : ""}</small></span>
      <CellChip tone={candidateTone(candidate)}>{candidate.program_key === primaryKey && candidate.recommendation_status === "recommended" ? "Primary" : candidateLabel(candidate)}</CellChip>
    </label>
  );

  return <div className="program-readiness-workspace">
    {error ? <Callout tone="warn">{error}</Callout> : null}
    <section className="program-readiness-band" aria-labelledby="program-selection-heading">
      <div className="program-readiness-heading"><div><span className="lbl">Funding programs</span><h3 id="program-selection-heading">Scoped program fit</h3><p>Only products scoped to this file appear. Published playbook versions are pinned to the selection.</p></div><div className="program-readiness-actions"><CellChip tone={readiness.selection_mode === "manual" ? "warn" : "acc"}>{readiness.selection_mode === "manual" ? "Manual selection" : "AI selection"}</CellChip>{readiness.selection_mode === "manual" ? <Btn onClick={() => void savePrograms(true)} disabled={Boolean(busy)}>Return to AI selection</Btn> : null}<Btn variant="pri" onClick={() => void savePrograms(false)} disabled={!programsChanged || Boolean(busy)}>{busy === "programs" ? "Applying..." : "Review changes"}</Btn></div></div>
      {recommended.length ? <div className="program-candidate-group"><span className="lbl">Recommended</span><div className="program-candidate-grid">{recommended.map(candidateCard)}</div></div> : null}
      {alternatives.length ? <div className="program-candidate-group"><span className="lbl">Alternatives</span><div className="program-candidate-grid">{alternatives.map(candidateCard)}</div></div> : null}
      {notEligible.length ? <details className="program-candidate-collapsed"><summary>Not eligible ({notEligible.length})</summary><div className="program-candidate-grid">{notEligible.map(candidateCard)}</div></details> : null}
      {ineligibleSelected.length ? <Field label="Required program-override reason"><Textarea rows={2} value={programReason} onChange={(event) => setProgramReason(event.target.value)} placeholder="Explain why these reviewed facts support the selected program" /></Field> : null}
      {!readiness.candidates.length ? <div className="empty">{readiness.lending_applicable ? "No in-scope program has published criteria yet. Keep collecting evidence; the system will not force a placeholder product." : "This enquiry is not a lending request, so lending programs do not apply."}</div> : null}
    </section>

    {readiness.lending_applicable ? <>
      {readiness.evidence_policies.length ? <section className="program-readiness-band initial-evidence-policy" aria-labelledby="initial-checklist-heading"><div className="program-readiness-heading"><div><span className="lbl">Evidence policy</span><h3 id="initial-checklist-heading">Initial evidence checklist</h3><p>{readiness.evidence_policies.map((policy) => `${policy.policy_name} v${policy.playbook_version}`).join(" · ")}</p></div><CellChip tone="mut">Not a funding product</CellChip></div></section> : null}
      <section className="program-readiness-band" aria-labelledby="program-progress-heading"><div className="program-readiness-heading"><div><span className="lbl">Independent readiness</span><h3 id="program-progress-heading">Program completion</h3></div><CellChip tone={readiness.can_advance ? "ok" : "warn"}>{readiness.can_advance ? "Ready for underwriting" : readiness.selections.length ? "Evidence still required" : "No program selected"}</CellChip></div><div className="program-progress-grid">{readiness.programs.map((program) => <div key={program.selection_id} className={semanticStatusClass(program.complete ? "ready" : program.completion_percent ? "processing" : "missing")}><div><strong>{program.program_name}</strong><span>{program.satisfied_count} of {program.required_count} required items accepted</span></div><div className="program-progress-track" aria-label={`${program.completion_percent}% complete`}><span style={{ width: `${program.completion_percent}%` }} /></div><b>{program.completion_percent}%</b></div>)}{!readiness.programs.length ? <div className="empty">No real product is selected. AI will select the highest-confidence eligible program after sufficient facts are available.</div> : null}</div></section>
      <section className="program-readiness-band" aria-labelledby="shared-evidence-heading">
        <div className="program-readiness-heading"><div><span className="lbl">Shared evidence</span><h3 id="shared-evidence-heading">Requirements and AI decisions</h3><p>AI reviews every uploaded file. Staff intervene only for exceptions, overrides, and policy decisions.</p></div><div className="program-readiness-actions requirement-bulk-actions">{onRunAiReview ? <Btn onClick={onRunAiReview} disabled={Boolean(busy) || aiReviewRunning}>{aiReviewRunning ? "Refreshing..." : "Refresh intake analysis"}</Btn> : null}{requestableRequirements.length ? <label className="checkline requirement-select-all"><input type="checkbox" checked={allRequestableSelected} onChange={(event) => setSelectedRequestKeys(event.target.checked ? requestableRequirements.map((item) => item.requirement_key) : [])} />Select all open</label> : null}<Btn variant="pri" onClick={() => void sendSelectedRequests()} disabled={!selectedRequestKeys.length || Boolean(busy)}>{busy === "batch-request" ? "Sending one email..." : `Email selected (${selectedRequestKeys.length})`}</Btn></div></div>
        {onUploadFiles ? <div className={cx("readiness-upload-dropzone", uploadDragging && "dragging")} role="button" tabIndex={0} onClick={() => uploadRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); uploadRef.current?.click(); } }} onDragEnter={(event) => { event.preventDefault(); setUploadDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setUploadDragging(false); }} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}><input ref={uploadRef} type="file" hidden multiple accept={ACCEPTED_UPLOADS} onChange={(event) => void upload(Array.from(event.target.files ?? []))} /><Icon name="upload" size={20} /><span><strong>{uploadBusy ? "Uploading and queuing analysis..." : "Drop evidence files or ZIP archives"}</strong><small>PDF, spreadsheet, image, document, and ZIP files are extracted, classified, and reviewed automatically.</small></span><span className="btn sm">Browse</span></div> : null}
        <div className="requirement-table compact">
          {readiness.requirements.map((requirement) => {
            const complete = requirementIsComplete(requirement);
            const isBusy = busy.endsWith(requirement.requirement_key);
            const hasOverrides = Object.keys(requirement.program_overrides).length > 0;
            const linkedEvidence = requirement.evidence_files ?? [];
            const availableEvidence = readiness.available_evidence_files ?? [];
            const linkedIds = new Set(linkedEvidence.map((file) => file.file_id));
            const evidenceOptions = (availableEvidence.length ? availableEvidence.map((file) => ({ id: file.file_id, file_name: file.file_name })) : files).filter((file) => !linkedIds.has(file.id));
            const selectedEvidenceId = evidenceSelections[requirement.requirement_key] || "";
            const requestable = requestableRequirements.some((item) => item.requirement_key === requirement.requirement_key);
            const expanded = expandedRequirements.includes(requirement.requirement_key);
            const acceptedCount = linkedEvidence.filter((file) => file.ai_decision === "accepted").length;
            return <div key={requirement.requirement_key} className={cx(semanticStatusClass(complete ? "verified" : requirement.status), "requirement-row", expanded && "expanded", dragTarget === requirement.requirement_key && "drop-target")} onDragEnter={(event) => { if (onUploadFiles) { event.preventDefault(); setDragTarget(requirement.requirement_key); } }} onDragOver={(event) => { if (onUploadFiles) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null); }} onDrop={(event) => { if (onUploadFiles) { event.preventDefault(); void upload(Array.from(event.dataTransfer.files), requirement.requested_document_id || undefined); } }}>
              <button type="button" className="requirement-summary-toggle" aria-expanded={expanded} onClick={() => setExpandedRequirements((current) => current.includes(requirement.requirement_key) ? current.filter((key) => key !== requirement.requirement_key) : [...current, requirement.requirement_key])}>
                <span className="requirement-state-stack">{requestable ? <input type="checkbox" aria-label={`Include ${requirement.label} in combined email`} checked={selectedRequestSet.has(requirement.requirement_key)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedRequestKeys((current) => event.target.checked ? [...new Set([...current, requirement.requirement_key])] : current.filter((key) => key !== requirement.requirement_key))} /> : null}<CellChip tone={semanticChipTone(complete ? "verified" : requirement.status)}>{complete && requirement.status !== "verified" ? "Overridden" : requirement.status.replaceAll("_", " ")}</CellChip></span>
                <span className="requirement-title"><strong>{requirement.label}</strong><small>{requirement.source_policy_keys.length ? "Initial evidence checklist" : requirement.source_program_keys.join(", ") || "Shared requirement"}</small></span>
                <span className="requirement-coverage"><strong>{coverageText(requirement, true)} accepted</strong><small>{acceptedCount} accepted file{acceptedCount === 1 ? "" : "s"} · {linkedEvidence.length} linked</small></span><Icon name={expanded ? "chevU" : "chevD"} size={15} />
              </button>
              {expanded ? <div className="requirement-expanded-body">
                <div className="requirement-controls"><Select aria-label={`Add evidence for ${requirement.label}`} value={selectedEvidenceId} onChange={(event) => setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: event.target.value }))}><option value="">Add an existing document...</option>{evidenceOptions.map((file) => <option key={file.id} value={file.id}>{file.file_name}</option>)}</Select><Btn disabled={isBusy || !selectedEvidenceId} onClick={() => void reviewRequirementAction(requirement, "link_evidence")}>Propose assignment</Btn>{requirement.can_waive ? <Btn disabled={isBusy} onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "waive", reason: "", allPrograms: true, programKeys: [] })}>Waive</Btn> : null}<Btn disabled={isBusy} onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "not_applicable", reason: "", allPrograms: true, programKeys: [] })}>N/A</Btn>{hasOverrides ? <Btn disabled={isBusy} onClick={() => void reviewRequirementAction(requirement, "restore")}>Restore</Btn> : null}</div>
                <p className="requirement-state-reason">{requirement.state_reason || "AI is waiting for qualifying evidence."}</p>
                {linkedEvidence.length ? <div className="requirement-evidence-files" aria-label={`Linked evidence for ${requirement.label}`}>{linkedEvidence.map((file) => {
                  const fileBusy = busy === `evidence:${file.file_id}`;
                  const coverageContribution = Object.values(file.coverage_contribution || {}).flat().filter(Boolean).join(", ");
                  return <div key={file.file_id} className={cx("requirement-evidence-file", `decision-${file.ai_decision}`)}><span className="grow trunc"><strong className="trunc">{file.file_name}</strong><small>{file.ai_explanation || "AI decision pending"}{coverageContribution ? ` · Coverage: ${coverageContribution}` : ""}</small></span><CellChip tone={decisionTone(file.ai_decision)}>{DECISION_LABELS[file.ai_decision]}</CellChip>{file.ai_decision === "failed" ? <Btn disabled={fileBusy} onClick={() => void retryAnalysis(file)}><Icon name="refresh" size={13} />Retry</Btn> : null}{file.ai_decision !== "accepted" ? <Btn disabled={fileBusy} onClick={() => setEvidenceOverride({ requirementKey: requirement.requirement_key, fileId: file.file_id, decision: "accepted", reasonCode: "ai_override", reason: "" })}>Override AI</Btn> : null}<Btn disabled={fileBusy} onClick={() => setReassignDraft({ requirementKey: requirement.requirement_key, fileId: file.file_id, targetKey: "" })}>Reassign</Btn><Btn disabled={fileBusy} onClick={() => void reviewRequirementAction(requirement, "unlink_evidence", [file.file_id])}>Unlink</Btn><IconBtn className="danger" disabled={fileBusy} aria-label={`Reject evidence ${file.file_name}`} title="Reject evidence" onClick={() => setEvidenceOverride({ requirementKey: requirement.requirement_key, fileId: file.file_id, decision: "rejected", reasonCode: "wrong_document", reason: "" })}><Icon name="x" size={14} /></IconBtn>{requirement.verification_required ? <Btn disabled={fileBusy} onClick={() => void reviewRequirementAction(requirement, file.verified ? "unverify" : "verify", [file.file_id])}>{file.verified ? "Remove human verification" : "Human verify"}</Btn> : null}</div>;
                })}</div> : <div className="requirement-evidence-empty">No evidence is assigned. Drop files on this requirement or choose an existing bucket file.</div>}
                {overrideDraft?.requirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><Field label={overrideDraft.action === "waive" ? "Waiver reason" : "Not-applicable reason"}><Textarea rows={2} value={overrideDraft.reason} onChange={(event) => setOverrideDraft({ ...overrideDraft, reason: event.target.value })} placeholder="Required for the immutable audit trail" /></Field><label className="checkline"><input type="checkbox" checked={overrideDraft.allPrograms} onChange={(event) => setOverrideDraft({ ...overrideDraft, allPrograms: event.target.checked, programKeys: [] })} />Apply to all selected programs and policies</label>{!overrideDraft.allPrograms ? <div className="override-programs">{requirement.source_program_keys.map((key) => <label key={key} className="checkline"><input type="checkbox" checked={overrideDraft.programKeys.includes(key)} onChange={() => setOverrideDraft({ ...overrideDraft, programKeys: overrideDraft.programKeys.includes(key) ? overrideDraft.programKeys.filter((item) => item !== key) : [...overrideDraft.programKeys, key] })} />{readiness.selections.find((item) => item.program_key === key)?.program_name || key}</label>)}</div> : null}<div className="program-readiness-actions"><Btn onClick={() => setOverrideDraft(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void applyOverride()} disabled={overrideDraft.reason.trim().length < 8 || (!overrideDraft.allPrograms && !overrideDraft.programKeys.length)}>Review override</Btn></div></div> : null}
                {evidenceOverride?.requirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><div className="fldgrid two"><Field label="Decision"><Select value={evidenceOverride.decision} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, decision: event.target.value as EvidenceOverrideDraft["decision"], reasonCode: event.target.value === "accepted" ? "ai_override" : evidenceOverride.reasonCode })}><option value="rejected">Reject evidence</option><option value="needs_more">Needs more</option><option value="accepted">Override AI and accept</option></Select></Field><Field label="Reason code"><Select value={evidenceOverride.reasonCode} disabled={evidenceOverride.decision === "accepted"} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, reasonCode: event.target.value as EvidenceOverrideDraft["reasonCode"] })}><option value="wrong_document">Wrong document</option><option value="wrong_entity">Wrong entity</option><option value="wrong_period">Wrong period</option><option value="incomplete">Incomplete</option><option value="unreadable">Unreadable</option><option value="duplicate">Duplicate</option><option value="other">Other</option><option value="ai_override">AI override</option></Select></Field></div><Field label="Reviewed reason"><Textarea rows={2} value={evidenceOverride.reason} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, reason: event.target.value })} placeholder="Explain the evidence decision" /></Field><div className="program-readiness-actions"><Btn onClick={() => setEvidenceOverride(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void applyEvidenceOverride()} disabled={evidenceOverride.reason.trim().length < 8}>Review decision</Btn></div></div> : null}
                {reassignDraft?.requirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><Field label="Reassign to"><Select value={reassignDraft.targetKey} onChange={(event) => setReassignDraft({ ...reassignDraft, targetKey: event.target.value })}><option value="">Select another requirement...</option>{readiness.requirements.filter((item) => item.requirement_key !== requirement.requirement_key).map((item) => <option key={item.requirement_key} value={item.requirement_key}>{item.label}</option>)}</Select></Field><div className="program-readiness-actions"><Btn onClick={() => setReassignDraft(null)}>Cancel</Btn><Btn variant="pri" disabled={!reassignDraft.targetKey} onClick={() => void applyReassignment()}>Review reassignment</Btn></div></div> : null}
              </div> : null}
            </div>;
          })}
          {!readiness.requirements.length ? <div className="empty">No evidence policy or selected program currently requires documents.</div> : null}
        </div>
      </section>
      <section className="program-readiness-band automation-band" aria-labelledby="automation-heading"><div><span className="lbl">Communications automation</span><h3 id="automation-heading">Combined missing-item follow-up</h3><p>{readiness.automation.stop_reason || `Next: ${readiness.automation.next_requirement_key?.replaceAll("_", " ") || "No item"} · ${when(readiness.automation.next_send_at)}`}</p><small>Last sent {when(readiness.automation.last_sent_at)} · {readiness.automation.attempts} of {readiness.automation.max_attempts} automatic attempts</small></div><div className="program-readiness-actions"><CellChip tone={readiness.automation.enabled && readiness.automation.eligible ? "ok" : readiness.automation.enabled ? "warn" : "mut"}>{readiness.automation.enabled ? readiness.automation.eligible ? "Active" : "Paused by readiness" : "Off"}</CellChip><Btn onClick={() => void toggleAutomation()} disabled={busy === "automation"}>{readiness.automation.enabled ? "Disable" : "Enable"}</Btn></div></section>
    </> : null}
  </div>;
}
