"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Select, Textarea, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { LockedEvidenceBadge, UnlockedCopyRequestControl } from "@/components/application/LockedEvidenceStatus";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { evidenceCoverageLabel, evidenceDecisionLabel, evidenceReasonLabel } from "@/lib/evidenceDecision";
import { lockedEvidencePresentation } from "@/lib/lockedEvidence";
import { findRequirementKey } from "@/lib/reviewNavigation";
import type {
  ApplicationProgramReadiness as Readiness,
  ApplicationRequirement,
  ApplicationRequirementEvidence,
  EvidenceDecisionStatus,
  ProgramFitCandidate,
  RoomDeliveryReceipt,
  UnlockedCopyRequestState,
} from "@/lib/applicationProfile";
import { manualProgramDraftMatches, type FundingProgramCatalogItem, type FundingProgramVersion, type FundingProgramVertical } from "@/lib/fundingPrograms";
import { semanticChipTone, semanticStatusClass } from "@/lib/semanticStatus";

type EvidenceFile = {
  id: string;
  file_name: string;
  created_at?: string;
  analysis_status?: string | null;
  analysis_reason_code?: string | null;
  analysis_detail?: string | null;
  is_password_protected?: boolean;
  unlocked_copy_request?: UnlockedCopyRequestState | null;
};
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
type CustomProgramDraft = {
  name: string;
  programKey: string;
  description: string;
  vertical: FundingProgramVertical;
  requirements: string;
  reason: string;
};

const ACCEPTED_UPLOADS = ".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,image/*";
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

function programKey(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64);
}

function requirementKey(program: string, label: string, index: number): string {
  const suffix = programKey(label).slice(0, 66) || "document";
  return `${programKey(program).slice(0, 40)}_${suffix}_${index + 1}`.slice(0, 120);
}

export function ApplicationProgramReadiness({
  profileId,
  files,
  onNotice,
  onRunAiReview,
  aiReviewRunning = false,
  onUploadFiles,
  uploadBusy = false,
  value,
  onValueChange,
  onRefresh,
  showUploader = true,
  onPreviewEvidence,
  onRequestUnlockedCopy,
  unlockedCopyRequestingFileId,
  focusRequirementQuery,
  focusRequestId = 0,
  canCreatePrograms = false,
  programVertical = "main_street",
  intakeVariant,
}: {
  profileId: string;
  files: EvidenceFile[];
  onNotice?: (message: string) => void;
  onRunAiReview?: () => void;
  aiReviewRunning?: boolean;
  onUploadFiles?: (files: File[], requestedDocumentId?: string) => Promise<void> | void;
  uploadBusy?: boolean;
  value?: Readiness | null;
  onValueChange?: (readiness: Readiness) => void;
  onRefresh?: () => Promise<unknown> | void;
  showUploader?: boolean;
  onPreviewEvidence?: (fileId: string, requirementKey: string) => void;
  onRequestUnlockedCopy?: (fileId: string, requirementKey: string, fileName: string, retryFailed?: boolean, copyRoomLink?: boolean) => Promise<void> | void;
  unlockedCopyRequestingFileId?: string | null;
  focusRequirementQuery?: string | null;
  focusRequestId?: number;
  canCreatePrograms?: boolean;
  programVertical?: FundingProgramVertical;
  intakeVariant?: string | null;
}) {
  const apiCall = useAuthedApi();
  const confirmAction = useConfirmAction();
  const uploadRef = useRef<HTMLInputElement>(null);
  const lastFocusRequestRef = useRef(0);
  const controlled = value !== undefined;
  const [readiness, setReadiness] = useState<Readiness | null>(value ?? null);
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
  const [customProgramOpen, setCustomProgramOpen] = useState(false);
  const [customProgram, setCustomProgram] = useState<CustomProgramDraft>({ name: "", programKey: "", description: "", vertical: programVertical, requirements: "", reason: "" });

  const authenticated = useCallback(async function authenticated<T>(path: string, init: RequestInit = {}): Promise<T> {
    return apiCall<T>(path, init);
  }, [apiCall]);

  const storeReadiness = useCallback((next: Readiness) => {
    setReadiness(next);
    onValueChange?.(next);
  }, [onValueChange]);

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      if (controlled) {
        await onRefresh?.();
        return;
      }
      const next = await authenticated<Readiness>(`/application-profiles/${profileId}/program-readiness`);
      storeReadiness(next);
      setSelectedPrograms(next.selections.map((selection) => selection.program_key));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }, [authenticated, controlled, onRefresh, profileId, storeReadiness]);

  useEffect(() => { if (!controlled) void load(); }, [controlled, load]);
  useEffect(() => {
    if (!controlled) return;
    setReadiness(value ?? null);
    if (value) setSelectedPrograms(value.selections.map((selection) => selection.program_key));
  }, [controlled, value]);
  useEffect(() => {
    if (!customProgramOpen) setCustomProgram((current) => ({ ...current, vertical: programVertical }));
  }, [customProgramOpen, programVertical]);
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
  const focusedRequirementKey = useMemo(() => findRequirementKey(
    focusRequirementQuery || "",
    (readiness?.requirements ?? []).map((requirement) => ({
      requirement_key: requirement.requirement_key,
      label: requirement.label,
      category: requirement.category,
      complete: requirementIsComplete(requirement),
    })),
  ), [focusRequirementQuery, readiness]);
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

  useEffect(() => {
    if (!focusRequirementQuery || !focusRequestId || !readiness) return;
    if (lastFocusRequestRef.current === focusRequestId) return;
    lastFocusRequestRef.current = focusRequestId;
    if (focusedRequirementKey) {
      setExpandedRequirements((current) => current.includes(focusedRequirementKey)
        ? current
        : [...current, focusedRequirementKey]);
    }
    let nestedFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      nestedFrame = window.requestAnimationFrame(() => {
        const target = document.getElementById(focusedRequirementKey
          ? `requirement-${focusedRequirementKey}`
          : "shared-evidence-heading");
        target?.scrollIntoView({ behavior: "smooth", block: "center" });
        target?.focus({ preventScroll: true });
      });
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (nestedFrame) window.cancelAnimationFrame(nestedFrame);
    };
  }, [focusRequestId, focusRequirementQuery, focusedRequirementKey, readiness]);

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
      storeReadiness(next);
      setSelectedPrograms(next.selections.map((selection) => selection.program_key));
      setProgramReason("");
      onNotice?.(returnToAi ? "Program selection returned to AI criteria." : "Funding programs updated.");
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function createAndSelectProgram() {
    const key = programKey(customProgram.programKey || customProgram.name);
    const labels = [...new Set(customProgram.requirements.split(/\r?\n/).map((item) => item.trim()).filter(Boolean))];
    if (customProgram.name.trim().length < 2 || key.length < 2) {
      setError("Enter a program name and a stable program key.");
      return;
    }
    if (customProgram.reason.trim().length < 8) {
      setError("Enter a review reason of at least eight characters.");
      return;
    }
    const confirmed = await confirmAction({
      title: `Create and select ${customProgram.name.trim()}?`,
      body: `This creates a published catalog program for ${customProgram.vertical.replaceAll("_", " ")}, pins it to this file, and records the review reason. ${labels.length ? `${labels.length} evidence requirement${labels.length === 1 ? "" : "s"} will be included.` : "No additional evidence requirements will be added."}`,
      confirmLabel: "Create and select program",
    });
    if (!confirmed) return;
    setBusy("create-program");
    setError(null);
    try {
      const catalogPath = "/admin/funding-programs";
      let catalog = await authenticated<FundingProgramCatalogItem[]>(catalogPath);
      let program = catalog.find((item) => item.program_key === key);
      if (!program) {
        try {
          catalog = await authenticated<FundingProgramCatalogItem[]>(catalogPath, {
            method: "POST",
            body: JSON.stringify({
              program_key: key,
              public_slug: key.replaceAll("_", "-"),
              name: customProgram.name.trim(),
              short_description: customProgram.description.trim() || null,
              aliases: [],
              display_order: 1000,
              scopes: [{
                vertical: customProgram.vertical,
                scope_key: `manual_${programKey(intakeVariant || "default")}`.slice(0, 80),
                intake_variants: intakeVariant ? [intakeVariant] : [],
                intent_keys: [],
                naics_prefixes: [],
                industry_keys: [],
                required_fact_keys: [],
              }],
              confirmed: true,
            }),
          });
        } catch (reason) {
          if (!(reason instanceof ApiError) || reason.status !== 409) throw reason;
          // A previous attempt may have committed the catalog row before a
          // later step failed. Reload it and resume instead of stranding the
          // program or forcing the operator to invent a new key.
          catalog = await authenticated<FundingProgramCatalogItem[]>(catalogPath);
        }
        program = catalog.find((item) => item.program_key === key);
      }
      if (!program) throw new Error("The catalog program could not be created or recovered.");
      if (
        program.name.trim().toLowerCase() !== customProgram.name.trim().toLowerCase()
        || !program.scopes.some((scope) => scope.vertical === customProgram.vertical)
      ) {
        throw new Error(`The key “${key}” already belongs to a different catalog program. Choose another key or edit that program in Catalog.`);
      }

      if (!program.published_version) {
        let draft: FundingProgramVersion | undefined = [...program.draft_versions]
          .filter((version) => manualProgramDraftMatches(version, customProgram.vertical, labels))
          .sort((a, b) => b.version - a.version)[0];
        if (!draft) {
          const versionRows = await authenticated<FundingProgramCatalogItem[]>(`/admin/funding-programs/${key}/versions`, {
            method: "POST",
            body: JSON.stringify({
              name: customProgram.name.trim(),
              description: customProgram.description.trim() || null,
              rules: { priority: 0, fit: { field: "vertical", op: "eq", value: customProgram.vertical } },
              requirements: labels.map((label, index) => ({
                requirement_key: requirementKey(key, label, index),
                label,
                category: "financials",
                required_level: "required",
                blocks_stage: "underwriting",
                visibility: ["borrower", "underwriter"],
                can_underwriter_waive: true,
                verification_required: false,
                display_order: index,
                objective_text: `Collect and review ${label}.`,
                completion_criteria: `A current, readable ${label} is accepted for underwriting.`,
                completion_mode: "ai_can_complete",
              })),
              reason: customProgram.reason.trim(),
              confirmed: true,
            }),
          });
          draft = versionRows.find((item) => item.program_key === key)?.draft_versions
            .filter((version) => manualProgramDraftMatches(version, customProgram.vertical, labels))
            .sort((a, b) => b.version - a.version)[0];
        }
        if (!draft) throw new Error("The program exists, but its criteria draft could not be recovered.");
        await authenticated<FundingProgramCatalogItem[]>(`/admin/funding-programs/${key}/versions/${draft.playbook_id}/publish`, {
          method: "POST",
          body: JSON.stringify({ reason: customProgram.reason.trim(), confirmed: true }),
        });
      }
      // Do not GET readiness between publish and selection. In automatic mode
      // that read can itself auto-select the new program and incorrectly audit
      // this operator action as an AI selection. The screen already carries
      // the reviewed selection set; PATCH it directly so the new row is pinned
      // to the just-published version with source="operator".
      const nextKeys = [...new Set([...(readiness?.selections ?? []).map((item) => item.program_key), key])];
      const selected = await authenticated<Readiness>(`/application-profiles/${profileId}/programs`, {
        method: "PATCH",
        body: JSON.stringify({ program_keys: nextKeys, return_to_ai: false, confirmed: true, reason: customProgram.reason.trim() }),
      });
      storeReadiness(selected);
      setSelectedPrograms(selected.selections.map((selection) => selection.program_key));
      setCustomProgramOpen(false);
      setCustomProgram({ name: "", programKey: "", description: "", vertical: programVertical, requirements: "", reason: "" });
      onNotice?.(`${customProgram.name.trim()} was published and added to this file.`);
      await onRefresh?.();
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
      storeReadiness(next);
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
    const confirmation = evidenceOverride.decision === "accepted"
      ? { title: "Override AI and accept evidence?", label: "Accept evidence", tone: "default" as const }
      : evidenceOverride.decision === "needs_more"
        ? { title: "Mark this evidence as needing more?", label: "Mark needs more", tone: "default" as const }
        : { title: "Reject this evidence?", label: "Reject evidence", tone: "danger" as const };
    const confirmed = await confirmAction({
      title: confirmation.title,
      body: `${file.file_name}: ${evidenceOverride.reason.trim()}. The original AI decision remains in immutable history.`,
      confirmLabel: confirmation.label,
      tone: confirmation.tone,
    });
    if (!confirmed) return;
    setBusy(`evidence:${evidenceOverride.fileId}`);
    setError(null);
    try {
      const next = await authenticated<Readiness>(
        `/application-profiles/${profileId}/requirements/${encodeURIComponent(evidenceOverride.requirementKey)}/evidence/${evidenceOverride.fileId}`,
        { method: "PATCH", body: JSON.stringify({ decision: evidenceOverride.decision, reason_code: evidenceOverride.reasonCode, reason: evidenceOverride.reason.trim(), confirmed: true }) },
      );
      storeReadiness(next);
      setEvidenceOverride(null);
      onNotice?.(`${file.file_name} decision updated.`);
      try {
        await onRefresh?.();
      } catch {
        setError("The evidence decision was saved, but the combined Evidence & Banking view could not refresh. Reload the page to see the latest totals.");
      }
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
      storeReadiness(next);
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
      storeReadiness(next);
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
    <details className="program-readiness-programs" open>
      <summary>
        <span><strong>Programs and criteria</strong><small>{readiness.selections.length ? readiness.selections.map((item) => item.program_name).join(", ") : "Choose a catalog program or add one manually"}</small></span>
        <CellChip tone={readiness.selection_mode === "manual" ? "warn" : "acc"}>{readiness.selection_mode === "manual" ? "Manual selection" : "AI selection"}</CellChip>
      </summary>
    <section className="program-readiness-band" aria-labelledby="program-selection-heading">
      <div className="program-readiness-heading"><div><span className="lbl">Funding programs</span><h3 id="program-selection-heading">Program selection</h3><p>Select any published program below. AI fit is advisory: staff may override an ineligible recommendation with an audited reason.</p></div><div className="program-readiness-actions">{canCreatePrograms ? <Btn onClick={() => setCustomProgramOpen(true)} disabled={Boolean(busy)}><Icon name="plus" size={14} />Add program</Btn> : null}{readiness.selection_mode === "manual" ? <Btn onClick={() => void savePrograms(true)} disabled={Boolean(busy)}>Return to AI selection</Btn> : null}<Btn variant="pri" onClick={() => void savePrograms(false)} disabled={!programsChanged || Boolean(busy)}>{busy === "programs" ? "Applying..." : "Apply manual selection"}</Btn></div></div>
      {recommended.length ? <div className="program-candidate-group"><span className="lbl">Recommended</span><div className="program-candidate-grid">{recommended.map(candidateCard)}</div></div> : null}
      {alternatives.length ? <div className="program-candidate-group"><span className="lbl">Alternatives</span><div className="program-candidate-grid">{alternatives.map(candidateCard)}</div></div> : null}
      {notEligible.length ? <details className="program-candidate-collapsed"><summary>Not eligible ({notEligible.length})</summary><div className="program-candidate-grid">{notEligible.map(candidateCard)}</div></details> : null}
      {readiness.selections.some((selection) => selection.needs_scope_review) ? <Callout tone="warn">A staff-selected program is outside the AI fit or file scope. The manual override is active and remains flagged for underwriting review.</Callout> : null}
      {ineligibleSelected.length ? <Field label="Required program-override reason"><Textarea rows={2} value={programReason} onChange={(event) => setProgramReason(event.target.value)} placeholder="Explain why these reviewed facts support the selected program" /></Field> : null}
      {!readiness.candidates.length ? <div className="empty">{readiness.lending_applicable ? canCreatePrograms ? "No published program matches this file yet. Add a program manually or update the file classification." : "No in-scope program has published criteria yet. Ask a super admin to add one, or update the file classification." : "This enquiry is not a lending request, so lending programs do not apply."}</div> : null}
    </section>
    </details>

    <Drawer open={customProgramOpen} onClose={() => { if (busy !== "create-program") setCustomProgramOpen(false); }} title="Add a funding program" sub="Create a reviewed catalog program, publish its first criteria version, and select it on this file." width="md" closeOnBackdrop={busy !== "create-program"} footer={<><Btn onClick={() => setCustomProgramOpen(false)} disabled={busy === "create-program"}>Cancel</Btn><span className="sp" /><Btn variant="pri" onClick={() => void createAndSelectProgram()} disabled={busy === "create-program" || customProgram.name.trim().length < 2 || programKey(customProgram.programKey || customProgram.name).length < 2 || customProgram.reason.trim().length < 8}>{busy === "create-program" ? "Creating and selecting..." : "Create and select"}</Btn></>}>
      <div className="grid g12">
        <Callout tone="warn">This is a reusable catalog program, not a temporary label. It will be scoped to this intake type and can be managed later in Funding Program settings.</Callout>
        <div className="fldgrid two"><Field label="Program name"><Input autoFocus value={customProgram.name} onChange={(event) => setCustomProgram((current) => ({ ...current, name: event.target.value, programKey: programKey(event.target.value) }))} placeholder="Business-purpose HELOC" /></Field><Field label="Program key"><Input value={customProgram.programKey} onChange={(event) => setCustomProgram((current) => ({ ...current, programKey: programKey(event.target.value) }))} placeholder="business_purpose_heloc" /></Field></div>
        <Field label="Description"><Textarea rows={3} value={customProgram.description} onChange={(event) => setCustomProgram((current) => ({ ...current, description: event.target.value }))} placeholder="When this program should be considered and what it is designed to finance." /></Field>
        <Field label="Program vertical"><Input value={customProgram.vertical.replaceAll("_", " ")} readOnly aria-readonly="true" /></Field>
        <Field label="Required evidence (optional, one item per line)"><Textarea rows={5} value={customProgram.requirements} onChange={(event) => setCustomProgram((current) => ({ ...current, requirements: event.target.value }))} placeholder={"Current rent roll\nTrailing 12-month operating statement\nPayoff statement"} /></Field>
        <Field label="Required review reason"><Textarea rows={3} value={customProgram.reason} onChange={(event) => setCustomProgram((current) => ({ ...current, reason: event.target.value }))} placeholder="Explain why this program is being added and applied to the file." /></Field>
      </div>
    </Drawer>

    {readiness.lending_applicable ? <>
      {readiness.evidence_policies.length ? <section className="program-readiness-band initial-evidence-policy" aria-labelledby="initial-checklist-heading"><div className="program-readiness-heading"><div><span className="lbl">Evidence policy</span><h3 id="initial-checklist-heading">Initial evidence checklist</h3><p>{readiness.evidence_policies.map((policy) => `${policy.policy_name} v${policy.playbook_version}`).join(" · ")}</p></div><CellChip tone="mut">Not a funding product</CellChip></div></section> : null}
      <section className="program-readiness-band" aria-labelledby="program-progress-heading"><div className="program-readiness-heading"><div><span className="lbl">Independent readiness</span><h3 id="program-progress-heading">Program completion</h3></div><CellChip tone={readiness.can_advance ? "ok" : "warn"}>{readiness.can_advance ? "Ready for underwriting" : readiness.selections.length ? "Evidence still required" : "No program selected"}</CellChip></div><div className="program-progress-grid">{readiness.programs.map((program) => <div key={program.selection_id} className={semanticStatusClass(program.complete ? "ready" : program.completion_percent ? "processing" : "missing")}><div><strong>{program.program_name}</strong><span>{program.satisfied_count} of {program.required_count} required items accepted</span></div><div className="program-progress-track" aria-label={`${program.completion_percent}% complete`}><span style={{ width: `${program.completion_percent}%` }} /></div><b>{program.completion_percent}%</b></div>)}{!readiness.programs.length ? <div className="empty">No real product is selected. AI will select the highest-confidence eligible program after sufficient facts are available.</div> : null}</div></section>
      <section className="program-readiness-band" aria-labelledby="shared-evidence-heading">
        <div className="program-readiness-heading"><div><span className="lbl">Shared evidence</span><h3 id="shared-evidence-heading" tabIndex={-1}>Requirements and AI decisions</h3><p>AI reviews every uploaded file. Staff intervene only for exceptions, overrides, and policy decisions.</p></div><div className="program-readiness-actions requirement-bulk-actions">{onRunAiReview ? <Btn onClick={onRunAiReview} disabled={Boolean(busy) || aiReviewRunning}>{aiReviewRunning ? "Refreshing..." : "Refresh intake analysis"}</Btn> : null}{requestableRequirements.length ? <label className="checkline requirement-select-all"><input type="checkbox" checked={allRequestableSelected} onChange={(event) => setSelectedRequestKeys(event.target.checked ? requestableRequirements.map((item) => item.requirement_key) : [])} />Select all open</label> : null}<Btn variant="pri" onClick={() => void sendSelectedRequests()} disabled={!selectedRequestKeys.length || Boolean(busy)}>{busy === "batch-request" ? "Sending one email..." : `Email selected (${selectedRequestKeys.length})`}</Btn></div></div>
        {showUploader && onUploadFiles ? <div className={cx("readiness-upload-dropzone", uploadDragging && "dragging")} role="button" tabIndex={0} onClick={() => uploadRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); uploadRef.current?.click(); } }} onDragEnter={(event) => { event.preventDefault(); setUploadDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setUploadDragging(false); }} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}><input ref={uploadRef} type="file" hidden multiple accept={ACCEPTED_UPLOADS} onChange={(event) => void upload(Array.from(event.target.files ?? []))} /><Icon name="upload" size={20} /><span><strong>{uploadBusy ? "Uploading and queuing analysis..." : "Drop evidence files or ZIP archives"}</strong><small>PDF, spreadsheet, image, document, and ZIP files are extracted, classified, and reviewed automatically.</small></span><span className="btn sm">Browse</span></div> : null}
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
            return <div key={requirement.requirement_key} className={cx(semanticStatusClass(complete ? "verified" : requirement.status), "requirement-row", expanded && "expanded", focusedRequirementKey === requirement.requirement_key && "navigation-target", dragTarget === requirement.requirement_key && "drop-target")} onDragEnter={(event) => { if (onUploadFiles) { event.preventDefault(); setDragTarget(requirement.requirement_key); } }} onDragOver={(event) => { if (onUploadFiles) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null); }} onDrop={(event) => { if (onUploadFiles) { event.preventDefault(); void upload(Array.from(event.dataTransfer.files), requirement.requested_document_id || undefined); } }}>
              <button id={`requirement-${requirement.requirement_key}`} type="button" className="requirement-summary-toggle" aria-expanded={expanded} onClick={() => setExpandedRequirements((current) => current.includes(requirement.requirement_key) ? current.filter((key) => key !== requirement.requirement_key) : [...current, requirement.requirement_key])}>
                <span className="requirement-state-stack">{requestable ? <input type="checkbox" aria-label={`Include ${requirement.label} in combined email`} checked={selectedRequestSet.has(requirement.requirement_key)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedRequestKeys((current) => event.target.checked ? [...new Set([...current, requirement.requirement_key])] : current.filter((key) => key !== requirement.requirement_key))} /> : null}<CellChip tone={semanticChipTone(complete ? "verified" : requirement.status)}>{complete && requirement.status !== "verified" ? "Overridden" : requirement.status.replaceAll("_", " ")}</CellChip></span>
                <span className="requirement-title"><strong>{requirement.label}</strong><small>{requirement.source_policy_keys.length ? "Initial evidence checklist" : requirement.source_program_keys.join(", ") || "Shared requirement"}</small></span>
                <span className="requirement-coverage"><strong>{coverageText(requirement, true)} accepted</strong><small>{acceptedCount} accepted file{acceptedCount === 1 ? "" : "s"} · {linkedEvidence.length} linked</small></span><Icon name={expanded ? "chevU" : "chevD"} size={15} />
              </button>
              {expanded ? <div className="requirement-expanded-body">
                <div className="requirement-controls"><Select aria-label={`Add evidence for ${requirement.label}`} value={selectedEvidenceId} onChange={(event) => setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: event.target.value }))}><option value="">Add an existing document...</option>{evidenceOptions.map((file) => <option key={file.id} value={file.id}>{file.file_name}</option>)}</Select><Btn disabled={isBusy || !selectedEvidenceId} onClick={() => void reviewRequirementAction(requirement, "link_evidence")}>Propose assignment</Btn>{requirement.can_waive ? <Btn disabled={isBusy} onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "waive", reason: "", allPrograms: true, programKeys: [] })}>Waive</Btn> : null}<Btn disabled={isBusy} onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "not_applicable", reason: "", allPrograms: true, programKeys: [] })}>N/A</Btn>{hasOverrides ? <Btn disabled={isBusy} onClick={() => void reviewRequirementAction(requirement, "restore")}>Restore</Btn> : null}</div>
                <p className="requirement-state-reason">{requirement.state_reason || "AI is waiting for qualifying evidence."}</p>
                {linkedEvidence.length ? <div className="requirement-evidence-files" aria-label={`Linked evidence for ${requirement.label}`}>{linkedEvidence.map((file) => {
                  const fileBusy = busy === `evidence:${file.file_id}`;
                  const coverageContribution = evidenceCoverageLabel(file.coverage_contribution);
                  const reason = evidenceReasonLabel(file.ai_reason_code, file.ai_decision);
                  const sourceFile = files.find((item) => item.id === file.file_id);
                  const locked = lockedEvidencePresentation({
                    fileName: file.file_name,
                    isPasswordProtected: file.is_password_protected ?? sourceFile?.is_password_protected,
                    analysisStatus: sourceFile?.analysis_status,
                    analysisReasonCode: sourceFile?.analysis_reason_code,
                    analysisDetail: sourceFile?.analysis_detail,
                    decisionReasonCode: file.ai_reason_code,
                    decisionExplanation: file.ai_explanation,
                  });
                  const unlockedCopyRequest = file.unlocked_copy_request ?? sourceFile?.unlocked_copy_request ?? null;
                  const editingThisFile = evidenceOverride?.requirementKey === requirement.requirement_key && evidenceOverride.fileId === file.file_id;
                  return <Fragment key={file.file_id}>
                    <div className={cx("requirement-evidence-file", locked && "password-protected", `decision-${file.ai_decision}`)}><span className="grow trunc"><strong className="trunc evidence-locked-title">{locked ? <Icon name="lock" size={14} aria-hidden="true" /> : null}<span>{file.file_name}</span></strong><small>{locked ? <><b>{locked.title}</b>{` · ${locked.explanation} AI cannot review its contents until an unlocked replacement is uploaded.`}</> : <><b>{reason}</b>{file.ai_explanation ? ` · ${file.ai_explanation}` : " · Decision explanation not available"}{coverageContribution ? ` · Coverage: ${coverageContribution}` : ""}</>}</small></span>{locked ? <LockedEvidenceBadge presentation={locked} /> : <CellChip tone={decisionTone(file.ai_decision)}>{evidenceDecisionLabel(file.ai_decision, file.decision_actor)}</CellChip>}{onPreviewEvidence ? <Btn disabled={fileBusy} onClick={() => onPreviewEvidence(file.file_id, requirement.requirement_key)}><Icon name="eye" size={13} />Preview</Btn> : null}{locked ? <UnlockedCopyRequestControl request={unlockedCopyRequest} busy={unlockedCopyRequestingFileId === file.file_id} onRequest={onRequestUnlockedCopy ? (retryFailed) => onRequestUnlockedCopy(file.file_id, requirement.requirement_key, file.file_name, retryFailed, false) : undefined} onCopyRoomLink={onRequestUnlockedCopy ? () => onRequestUnlockedCopy(file.file_id, requirement.requirement_key, file.file_name, false, true) : undefined} /> : null}{!locked && file.ai_decision === "failed" ? <Btn disabled={fileBusy} onClick={() => void retryAnalysis(file)}><Icon name="refresh" size={13} />Retry</Btn> : null}{!locked && file.ai_decision !== "accepted" ? <Btn disabled={fileBusy} aria-expanded={editingThisFile} onClick={() => setEvidenceOverride({ requirementKey: requirement.requirement_key, fileId: file.file_id, decision: "accepted", reasonCode: "ai_override", reason: "" })}>Override AI</Btn> : null}<Btn disabled={fileBusy} onClick={() => setReassignDraft({ requirementKey: requirement.requirement_key, fileId: file.file_id, targetKey: "" })}>Reassign</Btn><Btn disabled={fileBusy} onClick={() => void reviewRequirementAction(requirement, "unlink_evidence", [file.file_id])}>Unlink</Btn><IconBtn className="danger" disabled={fileBusy} aria-label={`Reject evidence ${file.file_name}`} title="Reject evidence" onClick={() => setEvidenceOverride({ requirementKey: requirement.requirement_key, fileId: file.file_id, decision: "rejected", reasonCode: "wrong_document", reason: "" })}><Icon name="x" size={14} /></IconBtn>{requirement.verification_required ? <Btn disabled={fileBusy} onClick={() => void reviewRequirementAction(requirement, file.verified ? "unverify" : "verify", [file.file_id])}>{file.verified ? "Remove human verification" : "Human verify"}</Btn> : null}</div>
                    {editingThisFile ? <div className="requirement-override-editor requirement-evidence-action-editor"><div className="fldgrid two"><Field label="Decision"><Select value={evidenceOverride.decision} onChange={(event) => { const decision = event.target.value as EvidenceOverrideDraft["decision"]; setEvidenceOverride({ ...evidenceOverride, decision, reasonCode: decision === "accepted" ? "ai_override" : evidenceOverride.reasonCode === "ai_override" ? decision === "needs_more" ? "incomplete" : "wrong_document" : evidenceOverride.reasonCode }); }}><option value="rejected">Reject evidence</option><option value="needs_more">Needs more</option><option value="accepted">Override AI and accept</option></Select></Field><Field label="Reason code"><Select value={evidenceOverride.reasonCode} disabled={evidenceOverride.decision === "accepted"} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, reasonCode: event.target.value as EvidenceOverrideDraft["reasonCode"] })}>{evidenceOverride.decision === "accepted" ? <option value="ai_override">AI override</option> : <><option value="wrong_document">Wrong document</option><option value="wrong_entity">Wrong entity</option><option value="wrong_period">Wrong period</option><option value="incomplete">Incomplete</option><option value="unreadable">Unreadable</option><option value="duplicate">Duplicate</option><option value="other">Other</option></>}</Select></Field></div><Field label="Reviewed reason"><Textarea autoFocus rows={2} value={evidenceOverride.reason} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, reason: event.target.value })} placeholder={evidenceOverride.decision === "accepted" ? "Explain why this file should be accepted" : evidenceOverride.decision === "needs_more" ? "Explain what additional evidence is needed" : "Explain why this file should be rejected"} /></Field><div className="program-readiness-actions"><Btn onClick={() => setEvidenceOverride(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void applyEvidenceOverride()} disabled={fileBusy || evidenceOverride.reason.trim().length < 8}>{fileBusy ? "Saving..." : "Review decision"}</Btn></div></div> : null}
                  </Fragment>;
                })}</div> : <div className="requirement-evidence-empty">No evidence is assigned. Drop files on this requirement or choose an existing bucket file.</div>}
                {overrideDraft?.requirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><Field label={overrideDraft.action === "waive" ? "Waiver reason" : "Not-applicable reason"}><Textarea rows={2} value={overrideDraft.reason} onChange={(event) => setOverrideDraft({ ...overrideDraft, reason: event.target.value })} placeholder="Required for the immutable audit trail" /></Field><label className="checkline"><input type="checkbox" checked={overrideDraft.allPrograms} onChange={(event) => setOverrideDraft({ ...overrideDraft, allPrograms: event.target.checked, programKeys: [] })} />Apply to all selected programs and policies</label>{!overrideDraft.allPrograms ? <div className="override-programs">{requirement.source_program_keys.map((key) => <label key={key} className="checkline"><input type="checkbox" checked={overrideDraft.programKeys.includes(key)} onChange={() => setOverrideDraft({ ...overrideDraft, programKeys: overrideDraft.programKeys.includes(key) ? overrideDraft.programKeys.filter((item) => item !== key) : [...overrideDraft.programKeys, key] })} />{readiness.selections.find((item) => item.program_key === key)?.program_name || key}</label>)}</div> : null}<div className="program-readiness-actions"><Btn onClick={() => setOverrideDraft(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void applyOverride()} disabled={overrideDraft.reason.trim().length < 8 || (!overrideDraft.allPrograms && !overrideDraft.programKeys.length)}>Review override</Btn></div></div> : null}
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
