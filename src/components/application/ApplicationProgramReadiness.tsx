"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Btn, Callout, CellChip, Field, Select, Textarea } from "@/components/ds";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { api, ApiError } from "@/lib/api";
import type {
  ApplicationProgramReadiness as Readiness,
  ApplicationRequirement,
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

function coverageText(requirement: ApplicationRequirement, verified = false): string {
  const coverage = (verified ? requirement.verified_coverage : requirement.coverage) ?? {};
  const fallbackCount = verified
    ? requirement.verified_evidence_count ?? 0
    : requirement.evidence_count ?? Number(Boolean(requirement.evidence_file_id));
  const current = Number(coverage.current ?? fallbackCount);
  const required = Number(coverage.required ?? 1);
  const unit = String(coverage.unit ?? "documents");
  return `${current} of ${required} ${unit}`;
}

export function ApplicationProgramReadiness({
  profileId,
  files,
  onNotice,
}: {
  profileId: string;
  files: EvidenceFile[];
  onNotice?: (message: string) => void;
}) {
  const { getToken } = useAuth();
  const confirmAction = useConfirmAction();
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [evidenceSelections, setEvidenceSelections] = useState<Record<string, string>>({});
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft | null>(null);
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

  useEffect(() => {
    void load();
  }, [load]);

  const selectedSet = useMemo(() => new Set(selectedPrograms), [selectedPrograms]);
  const requirementByKey = useMemo(
    () => new Map((readiness?.requirements ?? []).map((requirement) => [requirement.requirement_key, requirement])),
    [readiness],
  );

  async function savePrograms(returnToAi = false) {
    if (!readiness) return;
    const changed = selectedPrograms.join("|") !== readiness.selections.map((item) => item.program_key).join("|");
    if (!returnToAi && !changed) return;
    const confirmed = await confirmAction({
      title: returnToAi ? "Return program selection to AI?" : "Apply selected funding programs?",
      body: returnToAi
        ? "The highest-confidence eligible published program will be selected once. Future AI suggestions will remain advisory."
        : "Requirements will be recalculated from the pinned published versions. Shared evidence remains linked.",
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
          reason: returnToAi ? "Operator returned selection to published AI criteria" : "Operator reviewed program selection",
        }),
      });
      setReadiness(next);
      setSelectedPrograms(next.selections.map((selection) => selection.program_key));
      onNotice?.(returnToAi ? "Program selection returned to AI criteria." : "Funding programs updated.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function mutateRequirement(
    requirementKey: string,
    payload: Record<string, unknown>,
    notice: string,
  ) {
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
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function reviewRequirementAction(
    requirement: ApplicationRequirement,
    action: "verify" | "unverify" | "restore" | "failed" | "link_evidence" | "unlink_evidence",
    evidenceFileIds: string[] = [],
  ) {
    const labels = {
      verify: "Verify evidence",
      unverify: "Remove verification",
      restore: "Restore requirement",
      failed: "Mark evidence failed",
      link_evidence: "Link evidence",
      unlink_evidence: "Remove evidence link",
    };
    const confirmed = await confirmAction({
      title: `${labels[action]}?`,
      body: `${requirement.label} will be recalculated for every selected program and recorded in the audit trail.`,
      confirmLabel: labels[action],
      tone: action === "failed" ? "danger" : "default",
    });
    if (!confirmed) return;
    const selectedEvidenceId = evidenceSelections[requirement.requirement_key];
    const selectedIds = action === "link_evidence"
      ? selectedEvidenceId ? [selectedEvidenceId] : []
      : evidenceFileIds;
    await mutateRequirement(
      requirement.requirement_key,
      { action, evidence_file_ids: selectedIds },
      `${requirement.label} updated.`,
    );
    if (action === "link_evidence") {
      setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: "" }));
    }
  }

  async function applyOverride() {
    if (!overrideDraft || overrideDraft.reason.trim().length < 8) return;
    const requirement = requirementByKey.get(overrideDraft.requirementKey);
    if (!requirement) return;
    const scope = overrideDraft.allPrograms ? "all selected programs" : `${overrideDraft.programKeys.length} selected program(s)`;
    const confirmed = await confirmAction({
      title: overrideDraft.action === "waive" ? "Waive this requirement?" : "Mark not applicable?",
      body: `${requirement.label} will be overridden for ${scope}. The evidence record itself will not be changed. Reason: ${overrideDraft.reason.trim()}`,
      confirmLabel: overrideDraft.action === "waive" ? "Confirm waiver" : "Confirm not applicable",
      tone: "danger",
    });
    if (!confirmed) return;
    await mutateRequirement(
      requirement.requirement_key,
      {
        action: overrideDraft.action,
        reason: overrideDraft.reason.trim(),
        all_programs: overrideDraft.allPrograms,
        program_keys: overrideDraft.allPrograms ? [] : overrideDraft.programKeys,
      },
      `${requirement.label} override recorded.`,
    );
  }

  async function sendRequest(requirement: ApplicationRequirement, retryFailed = false) {
    setBusy(`request:${requirement.requirement_key}`);
    setError(null);
    try {
      const receipt = await authenticated<RoomDeliveryReceipt>(
        `/application-profiles/${profileId}/requirements/${encodeURIComponent(requirement.requirement_key)}/reminders`,
        { method: "POST", body: JSON.stringify({ channel: "email", retry_failed: retryFailed }) },
      );
      await load();
      onNotice?.(
        receipt.provider_accepted
          ? `Email accepted for ${receipt.recipient_masked || "the client"}.`
          : `Email failed: ${receipt.detail || "provider rejected the request"}`,
      );
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
      body: nextEnabled
        ? "Only the highest-priority eligible missing item is emailed, no more than once every 24 hours and up to three attempts."
        : "Scheduled missing-item messages stop immediately. Existing delivery history is preserved.",
      confirmLabel: nextEnabled ? "Enable automation" : "Disable automation",
    });
    if (!confirmed) return;
    setBusy("automation");
    try {
      const next = await authenticated<Readiness>(`/application-profiles/${profileId}/missing-item-automation`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      setReadiness(next);
      onNotice?.(`Missing-item email automation ${nextEnabled ? "enabled" : "disabled"}.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  if (!readiness && busy === "load") return <div className="empty">Loading program readiness...</div>;
  if (!readiness) return <Callout tone="warn">{error || "Program readiness is unavailable."}</Callout>;

  const originalPrograms = readiness.selections.map((item) => item.program_key).join("|");
  const programsChanged = selectedPrograms.join("|") !== originalPrograms;

  return (
    <div className="program-readiness-workspace">
      {error ? <Callout tone="warn">{error}</Callout> : null}
      <section className="program-readiness-band" aria-labelledby="program-selection-heading">
        <div className="program-readiness-heading">
          <div>
            <span className="lbl">Funding programs</span>
            <h3 id="program-selection-heading">Selected criteria</h3>
            <p>Published playbook versions are pinned to this file. Suggestions remain staff-only.</p>
          </div>
          <div className="program-readiness-actions">
            <CellChip tone={readiness.selection_mode === "manual" ? "warn" : "acc"}>{readiness.selection_mode === "manual" ? "Manual selection" : "AI selection"}</CellChip>
            {readiness.selection_mode === "manual" ? <Btn onClick={() => void savePrograms(true)} disabled={Boolean(busy)}>Return to AI selection</Btn> : null}
            <Btn variant="pri" onClick={() => void savePrograms(false)} disabled={!programsChanged || Boolean(busy)}>{busy === "programs" ? "Applying..." : "Review changes"}</Btn>
          </div>
        </div>
        <div className="program-candidate-grid">
          {readiness.candidates.map((candidate) => (
            <label key={candidate.program_key} className={`program-candidate ${selectedSet.has(candidate.program_key) ? "selected" : ""}`}>
              <input
                type="checkbox"
                checked={selectedSet.has(candidate.program_key)}
                onChange={() => setSelectedPrograms((current) => current.includes(candidate.program_key) ? current.filter((key) => key !== candidate.program_key) : [...current, candidate.program_key])}
              />
              <span>
                <strong>{candidate.program_name}</strong>
                <small>v{candidate.playbook_version} · {candidate.eligible ? `${Math.round(candidate.fit_score)}% fit` : "Not currently eligible"}</small>
              </span>
              <CellChip tone={candidate.eligible ? "ok" : "mut"}>{candidate.eligible ? "Suggested" : "Available"}</CellChip>
            </label>
          ))}
        </div>
        {!readiness.candidates.length ? <div className="empty">{readiness.lending_applicable ? "No published lending playbooks are available. A super admin must publish criteria before selection." : "This enquiry is not a lending request, so lending programs and financial-evidence requirements do not apply."}</div> : null}
      </section>

      {readiness.lending_applicable ? <>
      <section className="program-readiness-band" aria-labelledby="program-progress-heading">
        <div className="program-readiness-heading">
          <div>
            <span className="lbl">Independent readiness</span>
            <h3 id="program-progress-heading">Program completion</h3>
          </div>
          <CellChip tone={readiness.can_advance ? "ok" : "warn"}>{readiness.can_advance ? "At least one program ready" : "Evidence still required"}</CellChip>
        </div>
        <div className="program-progress-grid">
          {readiness.programs.map((program) => (
            <div key={program.selection_id} className={semanticStatusClass(program.complete ? "ready" : program.completion_percent ? "processing" : "missing")}>
              <div><strong>{program.program_name}</strong><span>{program.satisfied_count} of {program.required_count} required items</span></div>
              <div className="program-progress-track" aria-label={`${program.completion_percent}% complete`}><span style={{ width: `${program.completion_percent}%` }} /></div>
              <b>{program.completion_percent}%</b>
            </div>
          ))}
        </div>
      </section>

      <section className="program-readiness-band" aria-labelledby="shared-evidence-heading">
        <div className="program-readiness-heading">
          <div>
            <span className="lbl">Shared evidence</span>
            <h3 id="shared-evidence-heading">Requirements and decisions</h3>
            <p>One verified document can satisfy the same requirement across multiple programs.</p>
          </div>
        </div>
        <div className="requirement-table">
          {readiness.requirements.map((requirement) => {
            const complete = requirementIsComplete(requirement);
            const isBusy = busy.endsWith(requirement.requirement_key);
            const hasOverrides = Object.keys(requirement.program_overrides).length > 0;
            const linkedEvidence = requirement.evidence_files ?? [];
            const availableEvidence = readiness.available_evidence_files ?? [];
            const linkedIds = new Set(linkedEvidence.map((file) => file.file_id));
            const evidenceOptions = (availableEvidence.length
              ? availableEvidence.map((file) => ({ id: file.file_id, file_name: file.file_name }))
              : files
            ).filter((file) => !linkedIds.has(file.id));
            const selectedEvidenceId = evidenceSelections[requirement.requirement_key] || "";
            return (
              <div key={requirement.requirement_key} className={`${semanticStatusClass(complete ? "verified" : requirement.status)} requirement-row`}>
                <div className="requirement-summary">
                  <CellChip tone={semanticChipTone(complete ? "verified" : requirement.status)}>{complete && requirement.status !== "verified" ? "overridden" : requirement.status.replaceAll("_", " ")}</CellChip>
                  <div>
                    <strong>{requirement.label}</strong>
                    <span>{requirement.required_level} · {requirement.source_program_keys.join(", ") || "baseline"}</span>
                    <small>{requirement.state_reason || "No linked evidence"}</small>
                    <small>{coverageText(requirement)} linked · {coverageText(requirement, true)} verified</small>
                  </div>
                </div>
                <div className="requirement-controls">
                  <Select
                    aria-label={`Add evidence for ${requirement.label}`}
                    value={selectedEvidenceId}
                    onChange={(event) => setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: event.target.value }))}
                  >
                    <option value="">Add another document...</option>
                    {evidenceOptions.map((file) => <option key={file.id} value={file.id}>{file.file_name}</option>)}
                  </Select>
                  <Btn disabled={isBusy || !selectedEvidenceId} onClick={() => void reviewRequirementAction(requirement, "link_evidence")}>Add file</Btn>
                  {requirement.can_waive ? <Btn disabled={isBusy} onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "waive", reason: "", allPrograms: true, programKeys: [] })}>Waive</Btn> : null}
                  <Btn disabled={isBusy} onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "not_applicable", reason: "", allPrograms: true, programKeys: [] })}>N/A</Btn>
                  {hasOverrides ? <Btn disabled={isBusy} onClick={() => void reviewRequirementAction(requirement, "restore")}>Restore</Btn> : null}
                  {requirement.client_visible && !complete ? <Btn variant="pri" disabled={isBusy} onClick={() => void sendRequest(requirement, requirement.status === "failed")}>{busy === `request:${requirement.requirement_key}` ? "Sending..." : requirement.last_requested_at ? "Send reminder" : "Request by email"}</Btn> : null}
                </div>
                {linkedEvidence.length ? (
                  <div className="requirement-evidence-files" aria-label={`Linked evidence for ${requirement.label}`}>
                    {linkedEvidence.map((file) => (
                      <div key={file.file_id} className="requirement-evidence-file">
                        <span className="grow trunc">
                          <strong className="trunc">{file.file_name}</strong>
                          <small>{file.source === "operator" ? "Linked by staff" : file.source === "filename_suggestion" ? "Matched from upload name; review required" : "Matched from request or document analysis"}</small>
                        </span>
                        <CellChip tone={file.verified ? "ok" : "warn"}>{file.verified ? "Verified" : "Needs review"}</CellChip>
                        <Btn disabled={isBusy} onClick={() => void reviewRequirementAction(requirement, file.verified ? "unverify" : "verify", [file.file_id])}>{file.verified ? "Unverify" : "Verify"}</Btn>
                        <Btn disabled={isBusy} onClick={() => void reviewRequirementAction(requirement, "unlink_evidence", [file.file_id])}>Remove</Btn>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="requirement-evidence-empty">No documents linked. Uploaded matches will appear here automatically.</div>
                )}
                {overrideDraft?.requirementKey === requirement.requirement_key ? (
                  <div className="requirement-override-editor">
                    <Field label={overrideDraft.action === "waive" ? "Waiver reason" : "Not-applicable reason"}>
                      <Textarea rows={2} value={overrideDraft.reason} onChange={(event) => setOverrideDraft({ ...overrideDraft, reason: event.target.value })} placeholder="Required for the immutable audit trail" />
                    </Field>
                    <label className="checkline"><input type="checkbox" checked={overrideDraft.allPrograms} onChange={(event) => setOverrideDraft({ ...overrideDraft, allPrograms: event.target.checked, programKeys: [] })} />Apply to all selected programs</label>
                    {!overrideDraft.allPrograms ? <div className="override-programs">{requirement.source_program_keys.map((key) => <label key={key} className="checkline"><input type="checkbox" checked={overrideDraft.programKeys.includes(key)} onChange={() => setOverrideDraft({ ...overrideDraft, programKeys: overrideDraft.programKeys.includes(key) ? overrideDraft.programKeys.filter((item) => item !== key) : [...overrideDraft.programKeys, key] })} />{readiness.selections.find((item) => item.program_key === key)?.program_name || key}</label>)}</div> : null}
                    <div className="program-readiness-actions"><Btn onClick={() => setOverrideDraft(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void applyOverride()} disabled={overrideDraft.reason.trim().length < 8 || (!overrideDraft.allPrograms && !overrideDraft.programKeys.length)}>Review override</Btn></div>
                  </div>
                ) : null}
              </div>
            );
          })}
          {!readiness.requirements.length ? <div className="empty">Select a published funding program to materialize its evidence requirements.</div> : null}
        </div>
      </section>

      <section className="program-readiness-band automation-band" aria-labelledby="automation-heading">
        <div>
          <span className="lbl">Communications automation</span>
          <h3 id="automation-heading">Missing-item email follow-up</h3>
          <p>{readiness.automation.stop_reason || `Next: ${readiness.automation.next_requirement_key?.replaceAll("_", " ") || "No item"} · ${when(readiness.automation.next_send_at)}`}</p>
          <small>Last sent {when(readiness.automation.last_sent_at)} · {readiness.automation.attempts} of {readiness.automation.max_attempts} automatic attempts</small>
        </div>
        <div className="program-readiness-actions"><CellChip tone={readiness.automation.enabled && readiness.automation.eligible ? "ok" : readiness.automation.enabled ? "warn" : "mut"}>{readiness.automation.enabled ? readiness.automation.eligible ? "Active" : "Paused by readiness" : "Off"}</CellChip><Btn onClick={() => void toggleAutomation()} disabled={busy === "automation"}>{readiness.automation.enabled ? "Disable" : "Enable"}</Btn></div>
      </section>
      </> : null}
    </div>
  );
}
