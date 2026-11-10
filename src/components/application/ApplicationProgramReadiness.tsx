"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Select, Textarea, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { FundingProgramPicker } from "./FundingProgramPicker";
import { UseOfFundsEditor } from "./UseOfFundsEditor";
import { UseOfFundsDrawer } from "./UseOfFundsDrawer";
import { DocumentReviewChecks } from "./DocumentReviewChecks";
import { ApplicationCollectionTasks, RequirementRequest, useCollectionTasks } from "./ApplicationCollectionTasks";
import { AddRequirementDrawer } from "@/components/application/AddRequirementDrawer";
import { DebtScheduleReviewPanel } from "@/components/application/DebtScheduleReviewPanel";
import { EvidenceReviewDetails } from "@/components/application/EvidenceReviewDetails";
import { evidenceReviewPresentation } from "@/lib/evidenceReviewPresentation";
import { useDebtScheduleReviewSummary } from "@/hooks/useDebtScheduleReview";
import { FormAnswersDrawer } from "@/components/application/FormAnswersDrawer";
import pickerStyles from "./FundingProgramPicker.module.css";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { LockedEvidenceBadge, UnlockedCopyRequestControl } from "@/components/application/LockedEvidenceStatus";
import { EvidenceIdentityWarning } from "@/components/application/EvidenceIdentityWarning";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { evidenceCoverageLabel, evidenceDecisionLabel } from "@/lib/evidenceDecision";
import { lockedEvidencePresentation } from "@/lib/lockedEvidence";
import { findRequirementKey } from "@/lib/reviewNavigation";
import type {
  ApplicationProgramReadiness as Readiness,
  ApplicationRequirement,
  ApplicationRequirementEvidence,
  EvidenceDecisionStatus,
  RoomDeliveryReceipt,
  UnlockedCopyRequestState,
} from "@/lib/applicationProfile";
import { collectionTaskReadModelKey, type CollectionTask } from "@/lib/applicationCollection";
import { groupRequirements, isDocumentRequirement, requirementIsComplete, type Triage, type TriageExtra, type TriageGroup } from "@/lib/evidenceTriage";
import { formKindsOf, formLabel, type FormKind } from "@/lib/formAnswers";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { semanticStatusClass } from "@/lib/semanticStatus";
import { manualProgramDraftMatches, programSelectionChanged, type FundingProgramCatalogItem, type FundingProgramVersion, type FundingProgramVertical } from "@/lib/fundingPrograms";
import { requirementCanBeRemoved, updateRequirementLifecycle } from "@/lib/requirementLifecycle";
import { requirementOverridePayload, validRequirementOverride, type RequirementOverrideDraft as OverrideDraft } from "@/lib/requirementOverride";
import { RequirementOverrideEditor } from "./RequirementOverrideEditor";
import { requirementAllowsClientRequest, requirementCreditCollection } from "@/lib/requirementCredit";
import { RequirementCreditEvidence } from "./RequirementCreditEvidence";
import { RequirementCollectionActions } from "./RequirementCollectionActions";
import { RequirementUseOfFundsActions } from "./RequirementUseOfFundsActions";
import { isUseOfProceedsRequirement, readUseOfFundsCollectionSummary, supportingUseOfFundsReviewIds } from "@/lib/requirementUseOfFunds";
import { requirementQualification } from "@/lib/requirementCollectionCompletion";

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

function decisionTone(decision: EvidenceDecisionStatus): "ok" | "acc" | "warn" | "bad" | "mut" {
  if (decision === "accepted") return "ok";
  if (decision === "rejected" || decision === "failed") return "bad";
  if (decision === "needs_more") return "warn";
  return "acc";
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
  canEditPrograms = true,
  programVertical = "main_street",
  intakeVariant,
  section = "documents",
  focusGroup = null,
  onOpenFinancials,
  canAddRequirements = false,
  onOpenForms,
  onPreviewFinancialEvidence,
  onRequestFinancialEvidence,
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
  onPreviewEvidence?: (fileId: string, requirementKey: string, page?: number, expectedContentHash?: string) => void;
  onRequestUnlockedCopy?: (fileId: string, requirementKey: string, fileName: string, retryFailed?: boolean, copyRoomLink?: boolean) => Promise<void> | void;
  unlockedCopyRequestingFileId?: string | null;
  focusRequirementQuery?: string | null;
  focusRequestId?: number;
  canCreatePrograms?: boolean;
  canEditPrograms?: boolean;
  programVertical?: FundingProgramVertical;
  intakeVariant?: string | null;
  /** Which half to show: the documents the file needs, or the programs and use of funds that decide them. */
  section?: "documents" | "setup" | "programs";
  /** Open and scroll to one group of documents (from the overview tiles). */
  focusGroup?: { group: TriageGroup; requestId: number } | null;
  /** Programs are chosen on the Financials tab; the Documents list links there. */
  onOpenFinancials?: () => void;
  /** Underwriting roles may add requirements from the library to this file's checklist. */
  canAddRequirements?: boolean;
  /** Opens the financial forms (fill one in yourself). */
  onOpenForms?: () => void;
  onPreviewFinancialEvidence?: (fileId: string, page?: number) => void;
  onRequestFinancialEvidence?: () => void;
}) {
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const confirmAction = useConfirmAction();
  const selectionHeadingId = useId();
  const uploadRef = useRef<HTMLInputElement>(null);
  const lastFocusRequestRef = useRef(0);
  const controlled = value !== undefined;
  const [readiness, setReadiness] = useState<Readiness | null>(value ?? null);
  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);
  const [programReason, setProgramReason] = useState("");
  const [programPickerOpen, setProgramPickerOpen] = useState(false);
  const programPickerOpenRef = useRef(false);
  const [evidenceSelections, setEvidenceSelections] = useState<Record<string, string>>({});
  const [linkingRequirementKey, setLinkingRequirementKey] = useState<string | null>(null);
  const [selectedRequestKeys, setSelectedRequestKeys] = useState<string[]>([]);
  const [expandedRequirements, setExpandedRequirements] = useState<string[]>([]);
  const [overrideDraft, setOverrideDraft] = useState<OverrideDraft | null>(null);
  const activeProfile = useRef(profileId);
  activeProfile.current = profileId;
  const overridePending = useRef(new Set<string>());
  const requirementPending = useRef(new Set<string>());
  const [removalDraft, setRemovalDraft] = useState<{ requirementKey: string; reason: string } | null>(null);
  const [evidenceOverride, setEvidenceOverride] = useState<EvidenceOverrideDraft | null>(null);
  const [reassignDraft, setReassignDraft] = useState<ReassignDraft | null>(null);
  const [dragTarget, setDragTarget] = useState<string | null>(null);
  const [uploadDragging, setUploadDragging] = useState(false);
  const [busy, setBusy] = useState("");
  const [proceedsEditorProfile, setProceedsEditorProfile] = useState<string | null>(null);
  const [identityPending, setIdentityPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setOverrideDraft(null); setBusy(""); setError(null); setProceedsEditorProfile(null); }, [profileId]);
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
      if (!programPickerOpenRef.current) setSelectedPrograms(next.selections.map((selection) => selection.program_key));
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }, [authenticated, controlled, onRefresh, profileId, storeReadiness]);

  const reloadAfterUseOfFunds = useCallback(async () => {
    if (activeProfile.current !== profileId) return;
    await load();
    if (activeProfile.current !== profileId) return;
    for (const key of ["application-evidence-workspace", "application-profile-verification", "application-profile-audit", "application-intelligence", "financial-cockpit", "application-collection-tasks"]) {
      void queryClient.invalidateQueries({ queryKey: [key, profileId] });
    }
  }, [load, profileId, queryClient]);

  useEffect(() => { if (!controlled) void load(); }, [controlled, load]);
  useEffect(() => {
    if (!controlled) return;
    setReadiness(value ?? null);
    if (value && !programPickerOpenRef.current) setSelectedPrograms(value.selections.map((selection) => selection.program_key));
  }, [controlled, value]);
  useEffect(() => {
    if (!customProgramOpen) setCustomProgram((current) => ({ ...current, vertical: programVertical }));
  }, [customProgramOpen, programVertical]);
  useEffect(() => {
    if (controlled) return;
    const refreshAfterAnalysis = () => void load();
    window.addEventListener("qc-ai-review-completed", refreshAfterAnalysis);
    return () => window.removeEventListener("qc-ai-review-completed", refreshAfterAnalysis);
  }, [controlled, load]);

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
        && requirementAllowsClientRequest(requirement)
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

  const taskRefreshKey = collectionTaskReadModelKey(readiness?.requirements ?? []);
  const taskController = useCollectionTasks(profileId, taskRefreshKey, load, section === "documents");
  const [openGroups, setOpenGroups] = useState<Partial<Record<TriageGroup, boolean>>>({});
  const [answersFor, setAnswersFor] = useState<{ kind: FormKind; requirementKey: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const hasDebtRow = (readiness?.requirements ?? []).some((item) => formKindsOf(item).includes("debt_schedule"));
  const debtSummary = useDebtScheduleReviewSummary(profileId, section === "documents" && hasDebtRow);
  const extrasFor = useCallback((requirement: ApplicationRequirement): TriageExtra | undefined => (
    !debtSummary.loading && formKindsOf(requirement).includes("debt_schedule")
      ? { fillTable: { read: debtSummary.read, onSchedule: debtSummary.onSchedule, missing: debtSummary.missingAnswers, draftReady: debtSummary.draftComplete, publishNeeded: debtSummary.publishNeeded } }
      : undefined
  ), [debtSummary.loading, debtSummary.missingAnswers, debtSummary.onSchedule, debtSummary.read, debtSummary.draftComplete, debtSummary.publishNeeded]);
  const debtAutoExpanded = useRef(false);
  const expansionSeeded = useRef(false);
  const lastGroupRequestRef = useRef(0);

  // First time the list opens, show the items that need a person; the rest stay folded.
  useEffect(() => {
    if (!readiness || section !== "documents" || expansionSeeded.current) return;
    expansionSeeded.current = true;
    const needsYou = groupRequirements(readiness.requirements.filter(isDocumentRequirement)).find((item) => item.group === "you");
    if (needsYou) setExpandedRequirements(needsYou.items.slice(0, 3).map((item) => item.requirement.requirement_key));
  }, [readiness, section]);

  useEffect(() => {
    if (!readiness || section !== "documents" || debtAutoExpanded.current || debtSummary.loading) return;
    if (debtSummary.read <= 0 && debtSummary.missingAnswers <= 0) return;
    const debtRow = readiness.requirements.find((item) => !requirementIsComplete(item) && formKindsOf(item).includes("debt_schedule"));
    if (!debtRow) return;
    debtAutoExpanded.current = true;
    setExpandedRequirements((current) => current.includes(debtRow.requirement_key) ? current : [...current, debtRow.requirement_key]);
  }, [readiness, section, debtSummary.loading, debtSummary.read, debtSummary.missingAnswers]);

  useEffect(() => {
    if (!focusGroup || focusGroup.requestId === lastGroupRequestRef.current) return;
    lastGroupRequestRef.current = focusGroup.requestId;
    setOpenGroups((current) => ({ ...current, [focusGroup.group]: true }));
    const frame = window.requestAnimationFrame(() => document.getElementById(`ev-group-${focusGroup.group}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
    return () => window.cancelAnimationFrame(frame);
  }, [focusGroup]);

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

  const manualSince = useMemo(() => {
    if (!readiness || readiness.selection_mode !== "manual") return null;
    const staffPicks = readiness.selections.filter((item) => item.source === "operator").map((item) => item.selected_at).sort();
    return staffPicks[0] ? new Date(staffPicks[0]).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  }, [readiness]);

  async function savePrograms(returnToAi = false) {
    if (!readiness || !canEditPrograms || busy) return;
    const changed = programSelectionChanged(selectedPrograms, readiness.selections, readiness.candidates);
    if (!returnToAi && !changed) return;
    // Applying the reviewed picker is the confirmation for a manual selection.
    // Avoid stacking a second focus-trapping dialog over the program picker.
    if (returnToAi && !await confirmAction({
      title: "Return program selection to AI?",
      body: "The highest-confidence eligible published program will be selected once. Future AI suggestions remain advisory.",
      confirmLabel: "Return to AI selection",
    })) return;
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
      programPickerOpenRef.current = false;
      setProgramPickerOpen(false);
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
    const requestedProfile = profileId;
    if (requirementPending.current.has(requestedProfile)) return null;
    requirementPending.current.add(requestedProfile);
    setBusy(`requirement:${requirementKey}`);
    setError(null);
    try {
      const next = await authenticated<Readiness>(
        `/application-profiles/${profileId}/requirements/${encodeURIComponent(requirementKey)}`,
        { method: "PATCH", body: JSON.stringify({ ...payload, confirmed: true }) },
      );
      if (activeProfile.current !== requestedProfile) return next;
      storeReadiness(next);
      onNotice?.(notice);
      return next;
    } catch (reason) {
      if (activeProfile.current === requestedProfile) setError(`${errorMessage(reason)}${payload.action === "waive" || payload.action === "not_applicable" ? " Your override reason and scope are retained. Review the error, then retry." : ""}`);
      return null;
    } finally {
      requirementPending.current.delete(requestedProfile);
      if (activeProfile.current === requestedProfile) setBusy("");
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
    const confirmed = action === "link_evidence" || await confirmAction({
      title: `${labels[action]}?`,
      body: action === "verify" && requirement.review_checks?.length
        ? `Confirm you reviewed the source evidence against these criteria: ${requirement.review_checks.map((check) => check.label).join("; ")}. File readability alone is not enough. Your verification is recorded in the audit trail.`
        : `${requirement.label} will be recalculated and recorded in the audit trail. Unlinked evidence stays in its bucket.`,
      confirmLabel: labels[action],
    });
    if (!confirmed) return;
    const selectedEvidenceId = evidenceSelections[requirement.requirement_key];
    const selectedIds = action === "link_evidence" ? selectedEvidenceId ? [selectedEvidenceId] : [] : evidenceFileIds;
    const next = await mutateRequirement(requirement.requirement_key, { action, evidence_file_ids: selectedIds }, `${requirement.label} updated.`);
    if (!next || activeProfile.current !== profileId) return;
    if (action === "link_evidence") {
      setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: "" }));
      setLinkingRequirementKey(null);
      setExpandedRequirements((current) => [...new Set([...current, requirement.requirement_key])]);
    }
  }

  async function applyOverride() {
    if (!overrideDraft || !validRequirementOverride(overrideDraft) || overridePending.current.has(profileId) || busy || identityPending) return;
    const submitted = overrideDraft;
    const requestedProfile = profileId;
    const requirement = requirementByKey.get(submitted.requirementKey);
    if (!requirement) return;
    overridePending.current.add(requestedProfile);
    setBusy(`requirement:${requirement.requirement_key}`);
    try {
      const scope = submitted.allPrograms ? requirement.source_program_keys.length ? "all selected programs" : "this evidence requirement" : `${submitted.programKeys.length} selected program(s)`;
      const policyNote = requirement.source_program_keys.length && requirement.source_policy_keys.some((key) => key !== "staff_added") ? " Independent policy requirements remain in effect." : "";
      const confirmed = await confirmAction({ title: submitted.action === "waive" ? "Waive this requirement?" : "Mark not applicable?", body: `${requirement.label} will be overridden for ${scope}.${policyNote} Reason: ${submitted.reason.trim()}`, confirmLabel: submitted.action === "waive" ? "Confirm waiver" : "Confirm not applicable", tone: "danger" });
      if (!confirmed || activeProfile.current !== requestedProfile) return;
      const next = await mutateRequirement(requirement.requirement_key, requirementOverridePayload(submitted), `${requirement.label} override recorded.`);
      if (next && activeProfile.current === requestedProfile) setOverrideDraft((current) => current === submitted ? null : current);
    } finally { overridePending.current.delete(requestedProfile); if (activeProfile.current === requestedProfile) setBusy(""); }
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

  async function emailFormLink(kind: FormKind) {
    const confirmed = await confirmAction({
      title: `Email the client a link to fill in the ${formLabel(kind)}?`,
      body: "One email goes to the client's verified address with a link that needs no sign-in, and the secure room as the way to upload a file instead. The form is added to the checklist if it is not there yet.",
      confirmLabel: "Send the email",
    });
    if (!confirmed) return;
    setBusy(`formlink:${kind}`);
    setError(null);
    try {
      const receipt = await authenticated<RoomDeliveryReceipt>(`/application-profiles/${profileId}/financial-forms/${kind}/email-link`, { method: "POST" });
      await load();
      onNotice?.(receipt.provider_accepted
        ? `Link to fill in the ${formLabel(kind)} sent to ${receipt.recipient_masked || "the client"}.`
        : `The email was not sent: ${receipt.detail || "the provider rejected it"}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function copyFormLink(kind: FormKind) {
    setBusy(`formlink:${kind}`);
    setError(null);
    try {
      const result = await authenticated<{ url: string; expires_at: string | null }>(`/application-profiles/${profileId}/financial-forms/${kind}/link`, { method: "POST" });
      try {
        await navigator.clipboard.writeText(result.url);
        onNotice?.(`Link to fill in the ${formLabel(kind)} copied. It needs no sign-in.`);
      } catch {
        setError(`Clipboard access was blocked. The link is ${result.url}`);
      }
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function changeRequirementLifecycle(requirement: ApplicationRequirement, action: "remove" | "restore") {
    setBusy(`${action}:${requirement.requirement_key}`);
    setError(null);
    try {
      const next = await updateRequirementLifecycle(authenticated, profileId, requirement.requirement_key, action, action === "remove" ? removalDraft?.reason : "");
      storeReadiness(next);
      setRemovalDraft(null);
      setSelectedRequestKeys((current) => current.filter((key) => key !== requirement.requirement_key));
      for (const key of ["application-evidence-workspace", "application-collection-tasks", "financial-cockpit"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] });
      onNotice?.(action === "remove" ? `${requirement.label} removed from the checklist. Uploaded files and financial rows are preserved.` : `${requirement.label} restored to the checklist.`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  async function emailReminder(requirement: ApplicationRequirement) {
    const confirmed = await confirmAction({
      title: `Email the client about ${requirement.label}?`,
      body: "One email with the secure-room link goes to the client's verified address.",
      confirmLabel: "Send the email",
    });
    if (!confirmed) return;
    setBusy(`reminder:${requirement.requirement_key}`);
    setError(null);
    try {
      // The same route the combined email uses, with one item: it accepts every
      // requirement the checklist can ask for, including those no program blocks.
      const receipt = await authenticated<RoomDeliveryReceipt>(`/application-profiles/${profileId}/requirements/batch-request`, {
        method: "POST",
        body: JSON.stringify({ requirement_keys: [requirement.requirement_key], channel: "email", retry_failed: requirement.status === "failed" }),
      });
      await load();
      onNotice?.(receipt.provider_accepted
        ? `Email about ${requirement.label} accepted for ${receipt.recipient_masked || "the client"}.`
        : `The email was not sent: ${receipt.detail || "the provider rejected it"}`);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
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

  const programsChanged = programSelectionChanged(selectedPrograms, readiness.selections, readiness.candidates);
  const topRecommended = readiness.candidates.find((candidate) => candidate.recommendation_status === "recommended");
  const preferredAlternative = topRecommended && (topRecommended.preference_score ?? 0) > 0 && !readiness.selections.some((selection) => selection.program_key === topRecommended.program_key) ? topRecommended : null;
  const selectedRequestSet = new Set(selectedRequestKeys);
  const selectedRequestCount = requestableRequirements.filter((item) => selectedRequestSet.has(item.requirement_key)).length;
  const allRequestableSelected = requestableRequirements.length > 0 && requestableRequirements.every((item) => selectedRequestSet.has(item.requirement_key));
  const openProgramPicker = () => {
    setSelectedPrograms(readiness.selections.map((selection) => selection.program_key));
    setProgramReason("");
    setError(null);
    programPickerOpenRef.current = true;
    setProgramPickerOpen(true);
  };
  const closeProgramPicker = () => {
    if (busy === "programs") return;
    setSelectedPrograms(readiness.selections.map((selection) => selection.program_key));
    setProgramReason("");
    programPickerOpenRef.current = false;
    setProgramPickerOpen(false);
  };


  const documentRequirements = readiness.requirements.filter(isDocumentRequirement);
  const triageSections = groupRequirements(documentRequirements, extrasFor);
  const shownKeys = new Set(documentRequirements.map((item) => item.requirement_key));
  const openTasks = taskController.tasks.filter((task) => !["completed", "cancelled"].includes(task.status));
  const tasksByRequirement = new Map<string, CollectionTask>();
  for (const task of openTasks) {
    for (const key of task.requirement_keys ?? []) if (shownKeys.has(key) && !tasksByRequirement.has(key)) tasksByRequirement.set(key, task);
  }
  const mappedTaskIds = new Set([...tasksByRequirement.values()].map((task) => task.id));
  const otherTasks = openTasks.filter((task) => !mappedTaskIds.has(task.id));
  const checklistCaption = readiness.evidence_policies.length
    ? `From ${readiness.evidence_policies.map((policy) => `${policy.policy_name} v${policy.playbook_version}`).join(" · ")}${readiness.selections.length ? " and the selected programs" : ""}.`
    : "From the selected programs.";

  const renderRequirementRow = (requirement: ApplicationRequirement, triage: Triage) => {
    const isBusy = busy.endsWith(requirement.requirement_key);
    const hasOverrides = Object.keys(requirement.program_overrides).length > 0;
    const linkedEvidence = requirement.evidence_files ?? [];
    const creditCollection = requirementCreditCollection(requirement);
    const collection = requirement.collection_completion;
    const isUseOfProceeds = isUseOfProceedsRequirement(requirement);
    const allocation = readUseOfFundsCollectionSummary(requirement);
    const qualification = requirementQualification(requirement);
    const currentEvidence = collection?.source === "files" ? linkedEvidence.filter((file) => collection.eligible_file_ids.includes(file.file_id)) : linkedEvidence;
    const otherEvidence = collection?.source === "files" ? linkedEvidence.filter((file) => !collection.eligible_file_ids.includes(file.file_id)) : [];
    const availableEvidence = readiness.available_evidence_files ?? [];
    const linkedIds = new Set(linkedEvidence.map((file) => file.file_id));
    const evidenceOptions = (availableEvidence.length ? availableEvidence.map((file) => ({ id: file.file_id, file_name: file.file_name })) : files).filter((file) => !linkedIds.has(file.id));
    const selectedEvidenceId = evidenceSelections[requirement.requirement_key] || "";
    const requestable = requestableRequirements.some((item) => item.requirement_key === requirement.requirement_key);
    const expanded = expandedRequirements.includes(requirement.requirement_key);
    const acceptedCount = linkedEvidence.filter((file) => file.ai_decision === "accepted").length;
    const task = tasksByRequirement.get(requirement.requirement_key) ?? null;
    const formKinds = formKindsOf(requirement);
    const unsignedFileIds = linkedEvidence.filter((file) => file.ai_decision === "accepted" && !file.verified).map((file) => file.file_id);
    const supportingReviewFileIds = allocation ? supportingUseOfFundsReviewIds(requirement) : [];
    const askClient = triage.group === "client" && requirementAllowsClientRequest(requirement);
    const staffAdded = requirement.source_policy_keys.includes("staff_added");
    const isDebt = formKinds.includes("debt_schedule");
    const debtHasWork = isDebt && (linkedEvidence.length > 0 || debtSummary.hasSource || debtSummary.hasDraft || debtSummary.onSchedule > 0);
    const reasonNote = (requirement.state_reason ?? "").trim();
    const showReason = Boolean(reasonNote) && !/^AI accepted \d+ of \d+/i.test(reasonNote) && !/^Accepted by /i.test(reasonNote) && !/^Awaiting client evidence/i.test(reasonNote);
    return <div key={requirement.requirement_key} className={cx("requirement-row", "ev-row", expanded && "expanded", focusedRequirementKey === requirement.requirement_key && "navigation-target", dragTarget === requirement.requirement_key && "drop-target")} data-group={triage.group} onDragEnter={(event) => { if (onUploadFiles) { event.preventDefault(); setDragTarget(requirement.requirement_key); } }} onDragOver={(event) => { if (onUploadFiles) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragTarget(null); }} onDrop={(event) => { if (onUploadFiles) { event.preventDefault(); void upload(Array.from(event.dataTransfer.files), requirement.requested_document_id || undefined); } }}>
      <button id={`requirement-${requirement.requirement_key}`} type="button" className="requirement-summary-toggle" disabled={identityPending || isBusy} aria-expanded={expanded} onClick={() => setExpandedRequirements((current) => current.includes(requirement.requirement_key) ? current.filter((key) => key !== requirement.requirement_key) : [...current, requirement.requirement_key])}>
        <span className="requirement-state-stack">{requestable ? <input type="checkbox" aria-label={`Include ${requirement.label} in combined email`} checked={selectedRequestSet.has(requirement.requirement_key)} onClick={(event) => event.stopPropagation()} onChange={(event) => setSelectedRequestKeys((current) => event.target.checked ? [...new Set([...current, requirement.requirement_key])] : current.filter((key) => key !== requirement.requirement_key))} /> : null}<CellChip tone={triage.tone} title={triage.next}>{triage.label}</CellChip></span>
        <span className="requirement-title"><strong>{requirement.label}{requirement.required_level !== "required" ? <em className="ev-optional">{requirement.required_level === "optional" ? "Optional" : "Recommended"}</em> : null}{staffAdded ? <em className="ev-optional">Added by your team</em> : null}</strong><small>{triage.short}</small></span>
        <span className="requirement-coverage"><strong>{allocation ? allocation.allocation : triage.progress ? triage.progress.text : linkedEvidence.length ? `${linkedEvidence.length} ${linkedEvidence.length === 1 ? "file" : "files"}` : "Nothing yet"}</strong><small>{allocation ? collection?.complete ? "Use of proceeds collection complete" : allocation.detail : creditCollection ? "Linked owner reports · any single bureau" : collection ? collection.complete ? "Document collection complete" : collection.eligible_file_ids.length ? "Evidence on file · ready for collection review" : "Link an eligible current document" : linkedEvidence.length ? `${acceptedCount} of ${linkedEvidence.length} accepted by the AI` : "No file attached"}</small></span><Icon name={expanded ? "chevU" : "chevD"} size={15} />
      </button>
      {expanded ? <div className="requirement-expanded-body ev-row-body">
        {creditCollection || (triage.kind === "fill" && debtHasWork) ? null : <p className="ev-next">{triage.next}</p>}
        <div className="ev-actions" role="group" aria-label={`Next steps for ${requirement.label}`}>
          {isUseOfProceeds ? <RequirementUseOfFundsActions key={`proceeds:${profileId}:${requirement.requirement_key}`} profileId={profileId} canEdit={canAddRequirements} disabled={Boolean(busy) || identityPending} onFill={() => setProceedsEditorProfile(profileId)} /> : null}
          {collection ? <RequirementCollectionActions key={`${profileId}:${requirement.requirement_key}`} profileId={profileId} requirement={requirement} canEdit={canAddRequirements} externallyBusy={Boolean(busy) || identityPending} onPending={(pending) => { if (activeProfile.current === profileId) setBusy(pending ? `collection:${requirement.requirement_key}` : ""); }} onSaved={(next) => { if (activeProfile.current !== profileId) return; storeReadiness(next); for (const key of ["application-evidence-workspace", "application-profile-verification", "application-profile-audit", "application-intelligence", "financial-cockpit"]) void queryClient.invalidateQueries({ queryKey: [key, profileId] }); onNotice?.(`${requirement.label}: document collection complete. Program conditions remain separate.`); }} onReload={load} onPreview={onPreviewEvidence ? (fileId) => onPreviewEvidence(fileId, requirement.requirement_key) : undefined} /> : null}
          {canAddRequirements && !creditCollection ? <Btn size="sm" disabled={Boolean(busy) || identityPending} onClick={() => setLinkingRequirementKey((current) => current === requirement.requirement_key ? null : requirement.requirement_key)}><Icon name="link" size={14} />Link existing file</Btn> : null}
          {canAddRequirements ? requirementCanBeRemoved(requirement) ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => setRemovalDraft({ requirementKey: requirement.requirement_key, reason: "" })}><Icon name="trash" size={14} />Remove requirement</Btn> : <Btn size="sm" disabled={Boolean(busy)} title="Record why this requirement should be set aside for this file." onClick={() => setOverrideDraft({ requirementKey: requirement.requirement_key, action: requirement.can_waive ? "waive" : "not_applicable", reason: "", allPrograms: true, programKeys: [] })}>Set requirement aside</Btn> : null}
          {!collection && !creditCollection && triage.kind === "signoff" && unsignedFileIds.length ? <span title="Confirm the AI's acceptance so this item counts toward readiness"><Btn variant="pri" size="sm" disabled={isBusy} onClick={() => void reviewRequirementAction(requirement, "verify", unsignedFileIds)}><Icon name="shieldChk" size={14} />Sign off</Btn></span> : null}
          {allocation && canAddRequirements && supportingReviewFileIds.length ? <span title="Review the supporting files against the program conditions; this does not complete budget collection"><Btn size="sm" disabled={Boolean(busy) || identityPending} onClick={() => void reviewRequirementAction(requirement, "verify", supportingReviewFileIds)}><Icon name="shieldChk" size={14} />Sign off supporting evidence</Btn></span> : null}
          {askClient && !isDebt ? formKinds.map((kind) => <span key={`email-${kind}`} title={`Emails the client a link to fill in the ${formLabel(kind)} online, with the secure room as the way to upload a file instead`}><Btn variant="pri" size="sm" disabled={Boolean(busy)} onClick={() => void emailFormLink(kind)}><Icon name="mail" size={14} />{busy === `formlink:${kind}` ? "Working..." : formKinds.length === 1 ? "Email the link to fill it in" : `Email the ${formLabel(kind)} link`}</Btn></span>) : null}
          {askClient && !isDebt ? formKinds.map((kind) => <ActionIcon key={`copy-${kind}`} icon="link" label={`Copy the link to fill in the ${formLabel(kind)} (needs no sign-in)`} disabled={Boolean(busy)} onClick={() => void copyFormLink(kind)} />) : null}
          {askClient && !formKinds.length && requestable ? <span title="Emails the client the secure-room link for this item"><Btn variant="pri" size="sm" disabled={Boolean(busy)} onClick={() => void emailReminder(requirement)}><Icon name="mail" size={14} />Email the client</Btn></span> : null}
          {askClient && !isDebt && formKinds.length && !debtHasWork && onOpenForms ? <span title="Open the forms and type it in yourself"><Btn size="sm" onClick={onOpenForms}><Icon name="pencil" size={14} />Fill it in yourself</Btn></span> : null}
          {linkedEvidence.length && !(isDebt && debtHasWork) ? formKinds.map((kind) => <ActionIcon key={`answers-${kind}`} icon="docCheck" label={`See the ${formLabel(kind)}: what was filled in`} onClick={() => setAnswersFor({ kind, requirementKey: requirement.requirement_key })} />) : null}
        </div>
        {linkingRequirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><Field label={`Link a file to ${requirement.label}`}><Select aria-label={`Link existing evidence for ${requirement.label}`} value={selectedEvidenceId} disabled={Boolean(busy)} onChange={(event) => setEvidenceSelections((current) => ({ ...current, [requirement.requirement_key]: event.target.value }))}><option value="">Choose an existing document…</option>{evidenceOptions.map((file) => <option key={file.id} value={file.id}>{file.file_name}</option>)}</Select></Field><div className="program-readiness-actions"><Btn size="sm" disabled={Boolean(busy)} onClick={() => setLinkingRequirementKey(null)}>Cancel linking</Btn><Btn size="sm" variant="pri" disabled={Boolean(busy) || !selectedEvidenceId} onClick={() => void reviewRequirementAction(requirement, "link_evidence")}>Link selected file</Btn></div></div> : null}
        {removalDraft?.requirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><strong>Remove {requirement.label} from this checklist?</strong><p className="sub">Client to-dos and reminders for this item stop. Uploaded files and financial rows stay available. Restore it below when needed.</p><Field label="Removal reason"><Textarea aria-label="Removal reason" autoFocus rows={2} value={removalDraft.reason} onChange={(event) => setRemovalDraft({ ...removalDraft, reason: event.target.value })} placeholder="Explain why this item is no longer needed" /></Field><div className="program-readiness-actions"><Btn disabled={Boolean(busy)} onClick={() => setRemovalDraft(null)}>Cancel removal</Btn><Btn disabled={Boolean(busy) || removalDraft.reason.trim().length < 8} onClick={() => void changeRequirementLifecycle(requirement, "remove")}>Confirm removal</Btn></div></div> : null}
        {isDebt ? <DebtScheduleReviewPanel profileId={profileId} compact onSaved={() => void load()} /> : null}
        {creditCollection ? <RequirementCreditEvidence key={`${profileId}:${requirement.requirement_key}`} profileId={profileId} credit={creditCollection} requirementKey={requirement.requirement_key} programNames={requirement.source_program_keys.map((key) => readiness.selections.find((item) => item.program_key === key)?.program_name || key)} onRefresh={load} onOpenPrograms={onOpenFinancials} /> : <DocumentReviewChecks checks={qualification?.checks ?? requirement.review_checks} verified={requirement.provenance?.review_checks_status === "verified"} staffRequired={requirement.verification_required} assessment={requirement.provenance?.ai_document_review} qualification={qualification} collectionComplete={collection?.complete} onPreview={onPreviewEvidence ? (fileId, page, expectedContentHash) => onPreviewEvidence(fileId, requirement.requirement_key, page, expectedContentHash) : undefined} />}
        {currentEvidence.length ? <div className="requirement-evidence-files" aria-label={allocation ? "Supporting evidence for program review" : `Current evidence for ${requirement.label}`}>{allocation ? <p className="ev-block-title">Supporting evidence for program review</p> : null}{currentEvidence.map((file) => {
                  const fileBusy = busy === `evidence:${file.file_id}`;
                  const coverageContribution = evidenceCoverageLabel(file.coverage_contribution);
                  const review = !allocation && collection?.complete && file.ai_decision === "accepted" ? { headline: "Document collection accepted", explanation: "This file completes collection. Review the separate program conditions above." } : evidenceReviewPresentation(file, requirement.label, isDebt);
                  const reason = review.headline;
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
                    {!locked ? <EvidenceIdentityWarning reasonCode={file.ai_reason_code} decision={file.ai_decision} detail review={{ profileId, fileId: file.file_id, canEdit: canAddRequirements, initialRecord: file.identity_association, onSaved: load, onPending: setIdentityPending, externallyBusy: identityPending, onPreview: onPreviewEvidence ? () => onPreviewEvidence(file.file_id, requirement.requirement_key) : undefined }} /> : null}
                    <div className={cx("requirement-evidence-file", locked && "password-protected", `decision-${file.ai_decision}`)}><span className="grow evidence-file-copy"><strong className="evidence-locked-title">{locked ? <Icon name="lock" size={14} aria-hidden="true" /> : null}<span>{file.file_name}</span></strong><small>{locked ? <><b>{locked.title}</b>{` · ${locked.explanation} AI cannot review its contents until an unlocked replacement is uploaded.`}</> : <><b>{reason}</b>{` · ${review.explanation}`}{coverageContribution ? ` · Coverage: ${coverageContribution}` : ""}</>}</small></span>{locked ? <LockedEvidenceBadge presentation={locked} /> : <CellChip tone={decisionTone(file.ai_decision)}>{evidenceDecisionLabel(file.ai_decision, file.decision_actor)}</CellChip>}{onPreviewEvidence ? <ActionIcon icon="eye" label={`Preview ${file.file_name}`} disabled={fileBusy} onClick={() => onPreviewEvidence(file.file_id, requirement.requirement_key)} /> : null}{locked ? <UnlockedCopyRequestControl request={unlockedCopyRequest} busy={unlockedCopyRequestingFileId === file.file_id} onRequest={onRequestUnlockedCopy ? (retryFailed) => onRequestUnlockedCopy(file.file_id, requirement.requirement_key, file.file_name, retryFailed, false) : undefined} onCopyRoomLink={onRequestUnlockedCopy ? () => onRequestUnlockedCopy(file.file_id, requirement.requirement_key, file.file_name, false, true) : undefined} /> : null}<PageActionMenu label={`More actions for ${file.file_name}`} items={[
                    { label: "Accept this file anyway (override the AI)", hidden: Boolean(locked) || file.ai_decision === "accepted", onSelect: () => setEvidenceOverride({ requirementKey: requirement.requirement_key, fileId: file.file_id, decision: "accepted", reasonCode: "ai_override", reason: "" }) },
                    { label: file.verified ? "Remove human verification" : "Sign off: confirm the AI's acceptance", hidden: !requirement.verification_required || Boolean(creditCollection), onSelect: () => void reviewRequirementAction(requirement, file.verified ? "unverify" : "verify", [file.file_id]) },
                    { label: "Retry the AI's reading of this file", hidden: Boolean(locked) || file.ai_decision !== "failed", onSelect: () => void retryAnalysis(file) },
                    { label: "Reject this file", tone: "danger", onSelect: () => setEvidenceOverride({ requirementKey: requirement.requirement_key, fileId: file.file_id, decision: "rejected", reasonCode: "wrong_document", reason: "" }) },
                    { label: "Move to another requirement...", onSelect: () => setReassignDraft({ requirementKey: requirement.requirement_key, fileId: file.file_id, targetKey: "" }) },
                    { label: "Unlink from this requirement", onSelect: () => void reviewRequirementAction(requirement, "unlink_evidence", [file.file_id]) },
                  ]} /></div>
                    {!locked ? <EvidenceReviewDetails file={file} requirementLabel={requirement.label} isDebtSchedule={isDebt} onPreview={onPreviewEvidence ? () => onPreviewEvidence(file.file_id, requirement.requirement_key) : undefined} /> : null}
                    {editingThisFile ? <div className="requirement-override-editor requirement-evidence-action-editor"><div className="fldgrid two"><Field label="Decision"><Select value={evidenceOverride.decision} onChange={(event) => { const decision = event.target.value as EvidenceOverrideDraft["decision"]; setEvidenceOverride({ ...evidenceOverride, decision, reasonCode: decision === "accepted" ? "ai_override" : evidenceOverride.reasonCode === "ai_override" ? decision === "needs_more" ? "incomplete" : "wrong_document" : evidenceOverride.reasonCode }); }}><option value="rejected">Reject evidence</option><option value="needs_more">Needs more</option><option value="accepted">Override AI and accept</option></Select></Field><Field label="Reason code"><Select value={evidenceOverride.reasonCode} disabled={evidenceOverride.decision === "accepted"} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, reasonCode: event.target.value as EvidenceOverrideDraft["reasonCode"] })}>{evidenceOverride.decision === "accepted" ? <option value="ai_override">AI override</option> : <><option value="wrong_document">Wrong document</option><option value="wrong_entity">Wrong entity</option><option value="wrong_period">Wrong period</option><option value="incomplete">Incomplete</option><option value="unreadable">Unreadable</option><option value="duplicate">Duplicate</option><option value="other">Other</option></>}</Select></Field></div><Field label="Reviewed reason"><Textarea autoFocus rows={2} value={evidenceOverride.reason} onChange={(event) => setEvidenceOverride({ ...evidenceOverride, reason: event.target.value })} placeholder={evidenceOverride.decision === "accepted" ? "Explain why this file should be accepted" : evidenceOverride.decision === "needs_more" ? "Explain what additional evidence is needed" : "Explain why this file should be rejected"} /></Field><div className="program-readiness-actions"><Btn onClick={() => setEvidenceOverride(null)}>Cancel</Btn><Btn variant="pri" onClick={() => void applyEvidenceOverride()} disabled={fileBusy || evidenceOverride.reason.trim().length < 8}>{fileBusy ? "Saving..." : "Review decision"}</Btn></div></div> : null}
                  </Fragment>;
                })}</div> : creditCollection ? null : <div className="requirement-evidence-empty">{allocation ? allocation.item_count ? "The saved allocation is the collection source. Review any supporting documents separately for program conditions." : "Fill in the planned uses and amounts, or share the client link above." : "No eligible current evidence is assigned. Link an existing document or upload the required file."}</div>}
        {otherEvidence.length ? <details className="ev-more"><summary>Other linked files ({otherEvidence.length}) · not used for this collection item</summary><div className="ev-more-body">{otherEvidence.map((file) => <div key={file.file_id} className="requirement-evidence-file"><span className="grow evidence-file-copy"><strong>{file.file_name}</strong><small>Retained on file. A personal, prior-period or otherwise ineligible source does not complete this current business requirement.</small></span>{onPreviewEvidence ? <Btn size="sm" onClick={() => onPreviewEvidence(file.file_id, requirement.requirement_key)}>View file</Btn> : null}{canAddRequirements ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => void reviewRequirementAction(requirement, "unlink_evidence", [file.file_id])}>Unlink</Btn> : null}</div>)}</div></details> : null}
        <details className="ev-more">
          <summary>More options</summary>
          <div className="ev-more-body">

        {task ? <RequirementRequest task={task} controller={taskController} /> : null}
        <div className="ev-block"><span className="ev-block-title">{creditCollection ? "Requirement review options" : "Requirement exceptions"}</span><div className="requirement-controls"><PageActionMenu label={`More actions for ${requirement.label}`} items={[{ label: "Waive this requirement", hidden: !requirement.can_waive, onSelect: () => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "waive", reason: "", allPrograms: true, programKeys: [] }) }, { label: "Mark not applicable", onSelect: () => setOverrideDraft({ requirementKey: requirement.requirement_key, action: "not_applicable", reason: "", allPrograms: true, programKeys: [] }) }, { label: "Restore the original requirement", hidden: !hasOverrides, onSelect: () => void reviewRequirementAction(requirement, "restore") }]} /></div></div>
        {showReason ? <small className="ev-reason">System note: {reasonNote}</small> : null}
          </div>
        </details>
        {overrideDraft?.requirementKey === requirement.requirement_key ? <RequirementOverrideEditor draft={overrideDraft} programs={requirement.source_program_keys.map((key) => ({ key, label: readiness.selections.find((item) => item.program_key === key)?.program_name || key }))} hasPolicy={requirement.source_policy_keys.some((key) => key !== "staff_added")} busy={Boolean(busy) || identityPending} onDraft={setOverrideDraft} onCancel={() => setOverrideDraft(null)} onReview={() => void applyOverride()} /> : null}
                {reassignDraft?.requirementKey === requirement.requirement_key ? <div className="requirement-override-editor"><Field label="Reassign to"><Select value={reassignDraft.targetKey} onChange={(event) => setReassignDraft({ ...reassignDraft, targetKey: event.target.value })}><option value="">Select another requirement...</option>{readiness.requirements.filter((item) => item.requirement_key !== requirement.requirement_key).map((item) => <option key={item.requirement_key} value={item.requirement_key}>{item.label}</option>)}</Select></Field><div className="program-readiness-actions"><Btn onClick={() => setReassignDraft(null)}>Cancel</Btn><Btn variant="pri" disabled={!reassignDraft.targetKey} onClick={() => void applyReassignment()}>Review reassignment</Btn></div></div> : null}
      </div> : null}
    </div>;
  };

  return <div className="program-readiness-workspace">
    {error ? <Callout tone="warn">{error}</Callout> : null}
    {section === "setup" || section === "programs" ? <>
    {section === "setup" && readiness.lending_applicable ? <UseOfFundsEditor key={profileId} profileId={profileId} onSaved={load} /> : null}
    <details className="program-readiness-programs" open>
      <summary>
        <span><strong>Programs and criteria</strong><small>{readiness.selections.length ? readiness.selections.map((item) => item.program_name).join(", ") : "Choose a catalog program or add one manually"}</small></span>
        <CellChip tone={readiness.selection_mode === "manual" ? "warn" : "acc"}>{readiness.selection_mode === "manual" ? "Manual selection" : "AI selection"}</CellChip>
      </summary>
    <section className="program-readiness-band" aria-labelledby={selectionHeadingId}>
      <div className="program-readiness-heading"><div><span className="lbl">Funding programs</span><h3 id={selectionHeadingId}>Program selection</h3><p>{readiness.selections.length ? `${readiness.selections.length} selected. Review fit and compare other programs when needed.` : "Choose a funding program to build this file’s evidence checklist."}</p></div><div className="program-readiness-actions">{canCreatePrograms && canEditPrograms ? <Btn onClick={() => setCustomProgramOpen(true)} disabled={Boolean(busy)}><Icon name="plus" size={14} />Add program</Btn> : null}{readiness.selection_mode === "manual" && canEditPrograms ? <Btn onClick={() => void savePrograms(true)} disabled={Boolean(busy)}>Return to AI selection</Btn> : null}<Btn variant="pri" onClick={openProgramPicker} disabled={!canEditPrograms || Boolean(busy)} aria-haspopup="dialog"><Icon name="search" size={14} />{readiness.selections.length ? "Manage programs" : "Choose programs"}</Btn></div></div>
      {readiness.selections.length ? <div className={pickerStyles.summary} aria-label="Selected funding programs">{readiness.selections.map((selection) => <span key={selection.id} className={pickerStyles.selection}><strong>{selection.program_name}</strong><small>{selection.playbook_version ? `Criteria v${selection.playbook_version}` : "Criteria unavailable"} · {selection.source === "ai_auto" ? "AI selected" : "Staff selected"}{selection.program_retired ? " · retired" : ""}</small></span>)}</div> : null}
      {preferredAlternative ? <Callout tone="acc"><strong>Consider {preferredAlternative.program_name}</strong><p>{preferredAlternative.preference_reasons?.join(" · ") || "Matches a published program preference."} Your existing selection has not changed. Review the fit before switching; this is not an approval.</p><Btn onClick={openProgramPicker} disabled={!canEditPrograms || Boolean(busy)}>Review suggested program</Btn></Callout> : null}
      {readiness.selection_mode === "manual" ? <Callout tone="warn"><strong>Manual selection is on for this file.</strong><p>Staff chose these programs{manualSince ? ` on ${manualSince}` : ""}. The AI will not add, remove or re-rank them, and new published programs will not be suggested here, until the file returns to AI selection.</p>{canEditPrograms ? <Btn onClick={() => void savePrograms(true)} disabled={Boolean(busy)}>Return to AI selection</Btn> : null}</Callout> : null}
      {readiness.selections.some((selection) => selection.needs_scope_review) ? <Callout tone="warn">A staff-selected program is outside the AI fit or file scope. The manual override is active and remains flagged for underwriting review.</Callout> : null}
      {readiness.selections.some((selection) => selection.program_retired) ? <Callout tone="warn"><strong>{readiness.selections.filter((selection) => selection.program_retired).map((selection) => selection.program_name).join(", ")} {readiness.selections.filter((selection) => selection.program_retired).length === 1 ? "has" : "have"} been retired from the catalog.</strong><p>This file keeps the criteria version it was selected on, so nothing has changed for the client. New files cannot choose it. Swap or remove it when you are ready.</p><Btn onClick={openProgramPicker} disabled={!canEditPrograms || Boolean(busy)}>Manage programs</Btn></Callout> : null}
      {!readiness.candidates.length ? <div className="empty">{readiness.lending_applicable ? canCreatePrograms ? "No published program matches this file yet. Add a program manually or update the file classification." : "No in-scope program has published criteria yet. Ask a super admin to add one, or update the file classification." : "This enquiry is not a lending request, so lending programs do not apply."}</div> : null}
    </section>
    </details>

    {programPickerOpen ? <FundingProgramPicker candidates={readiness.candidates} selections={readiness.selections} selectedKeys={selectedPrograms} onSelectionChange={setSelectedPrograms} reason={programReason} onReasonChange={setProgramReason} requiresOverride={ineligibleSelected.length > 0} changed={programsChanged} busy={busy === "programs"} error={error} onClose={closeProgramPicker} onApply={() => void savePrograms(false)} selectionMode={readiness.selection_mode} onPreviewSource={onPreviewFinancialEvidence ? (fileId, page) => { closeProgramPicker(); onPreviewFinancialEvidence(fileId, page); } : undefined} onRequestEvidence={onRequestFinancialEvidence ? () => { closeProgramPicker(); onRequestFinancialEvidence(); } : undefined} /> : null}

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
    {section === "setup" && readiness.lending_applicable ? <>
      <section className="program-readiness-band" aria-labelledby="program-progress-heading"><div className="program-readiness-heading"><div><span className="lbl">Independent readiness</span><h3 id="program-progress-heading">Program completion</h3></div><CellChip tone={readiness.can_advance ? "ok" : "warn"}>{readiness.can_advance ? "Ready for underwriting" : readiness.programs.some((program) => program.qualification_blocking_requirement_keys?.length) ? "Program conditions need review" : readiness.selections.length ? "Evidence still required" : "No program selected"}</CellChip></div><div className="program-progress-grid">{readiness.programs.map((program) => <div key={program.selection_id} className={semanticStatusClass(program.complete ? "ready" : program.completion_percent ? "processing" : "missing")}><div><strong>{program.program_name}</strong><span>{program.satisfied_count} of {program.required_count} required items collected</span></div><div className="program-progress-track" aria-label={`${program.completion_percent}% complete`}><span style={{ width: `${program.completion_percent}%` }} /></div><b>{program.completion_percent}%</b>{program.qualification_blocking_requirement_keys?.length ? <small className="sub">Document collection and qualification are separate · {program.qualification_blocking_requirement_keys.length} program condition{program.qualification_blocking_requirement_keys.length === 1 ? " needs" : "s need"} review</small> : null}</div>)}{!readiness.programs.length ? <div className="empty">No real product is selected. AI will select the highest-confidence eligible program after sufficient facts are available.</div> : null}</div></section>
    </> : null}
    </> : null}

    {section === "documents" ? (readiness.lending_applicable ? <>
      <header className="ev-doc-head">
        <div><h3 id="shared-evidence-heading" tabIndex={-1}>Documents this file needs</h3><p>{checklistCaption}{onOpenFinancials ? <> <button type="button" className="linky" onClick={onOpenFinancials}>Choose programs in Financials</button></> : null}</p></div>
        <div className="program-readiness-actions requirement-bulk-actions">
          {onRunAiReview ? <ActionIcon icon="refresh" label="Re-read the intake with the AI" disabled={Boolean(busy) || aiReviewRunning} busy={aiReviewRunning} onClick={onRunAiReview} /> : null}
          {canAddRequirements ? <span title="Add a document or a form from the library to this file's checklist"><Btn onClick={() => setAddOpen(true)}><Icon name="plus" size={14} />Add a requirement</Btn></span> : null}
          <span title="The AI asks the client for everything that is missing, following the communication window and reminder limits"><Btn onClick={() => void taskController.collect()} disabled={Boolean(taskController.busy)}>{taskController.busy === "collect" ? "Scheduling..." : "Let the AI ask for what is missing"}</Btn></span>
          {requestableRequirements.length ? <label className="checkline requirement-select-all"><input type="checkbox" checked={allRequestableSelected} onChange={(event) => setSelectedRequestKeys(event.target.checked ? requestableRequirements.map((item) => item.requirement_key) : [])} />Select all open</label> : null}<Btn variant="pri" onClick={() => void sendSelectedRequests()} disabled={!selectedRequestCount || Boolean(busy)}>{busy === "batch-request" ? "Sending one email..." : `Email selected (${selectedRequestCount})`}</Btn>
        </div>
      </header>
      {taskController.error ? <Callout tone="warn">{taskController.error}</Callout> : null}
      {taskController.notice ? <Callout tone="ok">{taskController.notice}</Callout> : null}
      {showUploader && onUploadFiles ? <div className={cx("readiness-upload-dropzone", uploadDragging && "dragging")} role="button" tabIndex={0} onClick={() => uploadRef.current?.click()} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); uploadRef.current?.click(); } }} onDragEnter={(event) => { event.preventDefault(); setUploadDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setUploadDragging(false); }} onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}><input ref={uploadRef} type="file" hidden multiple accept={ACCEPTED_UPLOADS} onChange={(event) => void upload(Array.from(event.target.files ?? []))} /><Icon name="upload" size={20} /><span><strong>{uploadBusy ? "Uploading and queuing analysis..." : "Drop evidence files or ZIP archives"}</strong><small>PDF, spreadsheet, image, document, and ZIP files are extracted, classified, and reviewed automatically.</small></span><span className="btn sm">Browse</span></div> : null}
      {triageSections.map((group) => {
        const forceOpen = group.items.some((item) => item.requirement.requirement_key === focusedRequirementKey);
        const groupOpen = forceOpen || (openGroups[group.group] ?? (group.group !== "done" || triageSections.length === 1));
        return <section key={group.group} id={`ev-group-${group.group}`} className="ev-group" data-group={group.group} aria-label={group.title}>
          <header className="ev-group-head">
            <h4><button type="button" className="ev-group-toggle" aria-expanded={groupOpen} onClick={() => setOpenGroups((current) => ({ ...current, [group.group]: !groupOpen }))}><Icon name={groupOpen ? "chevU" : "chevD"} size={14} />{group.title}<span className="ev-count">{group.items.length}</span></button></h4>
            <p>{group.blurb}</p>
          </header>
          {groupOpen ? <div className="requirement-table compact">{group.items.map(({ requirement, triage }) => renderRequirementRow(requirement, triage))}</div> : null}
        </section>;
      })}
      {!documentRequirements.length ? <div className="empty">No evidence policy or selected program currently requires documents.</div> : null}
      {canAddRequirements && readiness.inactive_requirements?.length ? <details className="ev-more"><summary>Removed checklist items ({readiness.inactive_requirements.length})</summary><div className="ev-more-body">{readiness.inactive_requirements.map((requirement) => <div className="row" key={requirement.requirement_key}><div className="grow grid g4"><strong>{requirement.label}</strong><span className="sub">{requirement.removal_reason || "Removed by your team. Files and financial rows are preserved."}</span></div><Btn size="sm" disabled={Boolean(busy)} onClick={() => void changeRequirementLifecycle(requirement, "restore")}>Restore {requirement.label}</Btn></div>)}</div></details> : null}
      <ApplicationCollectionTasks profileId={profileId} controller={taskController} tasks={otherTasks} requirements={readiness.requirements} onCreditRefresh={load} programNames={Object.fromEntries(readiness.selections.map((item) => [item.program_key, item.program_name]))} onOpenPrograms={onOpenFinancials} onPreviewEvidence={onPreviewEvidence ? (fileId, requirementKey) => onPreviewEvidence(fileId, requirementKey) : undefined} onVerifyRequirement={(requirement, fileIds) => reviewRequirementAction(requirement, "verify", fileIds)} />
      <section className="program-readiness-band automation-band ev-reminders" aria-labelledby="automation-heading"><div><h4 id="automation-heading">Automatic reminders</h4><p>{readiness.automation.stop_reason || `Next: ${readiness.automation.next_requirement_key?.replaceAll("_", " ") || "nothing"} · ${when(readiness.automation.next_send_at)}`}</p><small>One combined email at most every 24 hours, up to {readiness.automation.max_attempts} attempts. Last sent {when(readiness.automation.last_sent_at)} · {readiness.automation.attempts} of {readiness.automation.max_attempts} used.</small></div><div className="program-readiness-actions"><CellChip tone={readiness.automation.enabled && readiness.automation.eligible ? "ok" : readiness.automation.enabled ? "warn" : "mut"}>{readiness.automation.enabled ? readiness.automation.eligible ? "Active" : "Paused by readiness" : "Off"}</CellChip><Btn onClick={() => void toggleAutomation()} disabled={busy === "automation"}>{readiness.automation.enabled ? "Turn off" : "Turn on"}</Btn></div></section>
      <FormAnswersDrawer
        profileId={profileId}
        kind={answersFor?.kind ?? null}
        open={Boolean(answersFor)}
        onClose={() => setAnswersFor(null)}
        onPreviewFile={onPreviewEvidence && answersFor ? (fileId) => onPreviewEvidence(fileId, answersFor.requirementKey) : undefined}
      />
      {canAddRequirements ? <AddRequirementDrawer
        profileId={profileId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdded={(next, addedKey) => {
          storeReadiness(next);
          setAddOpen(false);
          const added = addedKey ? next.requirements.find((item) => item.requirement_key === addedKey) : null;
          onNotice?.(added ? `Added ${added.label} to the checklist.` : "Added to the checklist.");
          if (addedKey) {
            setExpandedRequirements((current) => current.includes(addedKey) ? current : [...current, addedKey]);
            window.requestAnimationFrame(() => window.requestAnimationFrame(() => document.getElementById(`requirement-${addedKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" })));
          }
        }}
      /> : null}
    </> : <div className="empty">This enquiry is not a lending request, so it has no evidence checklist.</div>) : null}
    {proceedsEditorProfile === profileId && canAddRequirements ? <UseOfFundsDrawer key={profileId} profileId={profileId} onClose={() => setProceedsEditorProfile(null)} onSaved={reloadAfterUseOfFunds} /> : null}
  </div>;
}
