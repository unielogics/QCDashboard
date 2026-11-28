"use client";
import { useFileWorkspace, FileWorkspaceLink } from "@/components/file/FileWorkspaceContext";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationProgramReadiness } from "@/components/application/ApplicationProgramReadiness";
import { EvidenceOverview, type OverviewTarget } from "@/components/application/EvidenceOverview";
import { BankingPanel } from "@/components/application/ApplicationVerificationWorkspace";
import { FinancialWorkspace } from "@/components/application/FinancialWorkspace";
import { ApplicationDebtPayees } from "@/components/application/ApplicationDebtPayees";
import { BankAccountsCard } from "@/components/application/BankAccountsCard";
import { PlaidRequestBar } from "@/components/application/PlaidRequestBar";
import { LockedEvidenceBadge, UnlockedCopyRequestControl } from "@/components/application/LockedEvidenceStatus";
import { EvidenceIdentityWarning } from "@/components/application/EvidenceIdentityWarning";
import { EvidenceReviewDetails } from "@/components/application/EvidenceReviewDetails";
import { EvidenceDecisionBar } from "@/components/application/EvidenceDecisionBar";
import { BusinessNameDecision } from "@/components/application/BusinessNameDecision";
import { QuickReasons } from "@/components/application/QuickReasons";
import { evidenceReviewPresentation } from "@/lib/evidenceReviewPresentation";
import { APPROVE_REASONS, MIN_REASON_LENGTH, REJECT_REASONS, reasonLongEnough, reviewDecisionState, type ReviewChoice } from "@/lib/evidenceReviewDecision";
import { BucketWorkspaceOverlay } from "@/components/buckets/BucketWorkspaceOverlay";
import {
  BucketFileReviewPanel,
  type BucketFileReview,
  type BucketReviewFile,
} from "@/components/buckets/BucketFileReviewPanel";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { Btn, Callout, CellChip, Field, Select, Sub, Textarea, cx } from "@/components/ds";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import type {
  ApplicationEvidenceWorkspace as EvidenceWorkspace,
  ApplicationProgramReadiness as Readiness,
  ApplicationRequirement,
  ApplicationRequirementEvidence,
  EvidenceWorkspaceFile,
  UnlockedCopyRequestResult,
  UnlockedCopyRequestState,
} from "@/lib/applicationProfile";
import {
  aggregateEvidenceDecisions,
  evidenceAnalysisLabel,
  evidenceDecisionLabel,
  evidenceDecisionTone,
  evidenceUsabilityLabel,
} from "@/lib/evidenceDecision";
import { isDocumentRequirement, triageCounts, type TriageExtra, type TriageGroup } from "@/lib/evidenceTriage";
import { formKindsOf } from "@/lib/formAnswers";
import { useDebtScheduleReviewSummary } from "@/hooks/useDebtScheduleReview";
import { lockedEvidencePresentation, unlockedCopyRequest } from "@/lib/lockedEvidence";
import { documentUploadErrorMessage, passwordProtectedPdfUploadNotice, screenPdfUploads } from "@/lib/documentUpload";
import { useProductionCall } from "@/lib/productionTrainingCall";
import type { FundingProgramVertical } from "@/lib/fundingPrograms";
import { validPdfSourcePage } from "@/lib/pdfSourceNavigation";
import { ApiError } from "@/lib/api";
import { DocumentVersionControl } from "@/components/documents/DocumentVersionControl";
import { documentVersionService, latestDocumentFiles } from "@/lib/documentVersions";

type WorkspaceTab = "requirements" | "banking" | "files";
type RequirementFocus = { query: string; requestId: number };
type ReviewActionKind = "reject" | "override" | "reassign" | "unlink" | "verify" | "unverify";
type ReviewAction = {
  kind: ReviewActionKind;
  requirementKey: string;
  targetKey: string;
  reasonCode: string;
  reason: string;
};

const ACCEPTED_UPLOADS = ".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.heic";
const REASON_OPTIONS = [
  ["wrong_document", "Wrong document"],
  ["wrong_entity", "Wrong business"],
  ["wrong_period", "Wrong period"],
  ["incomplete", "Incomplete"],
  ["unreadable", "Unreadable"],
  ["duplicate", "Duplicate"],
  ["other", "Other"],
] as const;

/** What each review action is called on its panel, its button and its confirmation. */
const ACTION_COPY: Record<ReviewActionKind, { title: string; confirm: string; note: string; done: (fileName: string) => string }> = {
  reject: { title: "Reject this file", confirm: "Reject file", note: "The AI's own decision stays in the file's history.", done: (name) => `Rejected ${name}.` },
  override: { title: "Approve this file", confirm: "Approve file", note: "The AI's own decision stays in the file's history.", done: (name) => `Approved ${name}.` },
  verify: { title: "Approve this file", confirm: "Approve file", note: "This checklist item needs a person's approval on top of the AI's, which is why you are asked.", done: (name) => `Approved ${name}.` },
  unverify: { title: "Remove the approval", confirm: "Remove approval", note: "The file stays on the checklist item. Only the person's approval is removed.", done: (name) => `Removed the approval on ${name}.` },
  reassign: { title: "Move to another checklist item", confirm: "Move file", note: "The file itself stays in the room. Only the checklist item it counts for changes.", done: (name) => `Moved ${name}.` },
  unlink: { title: "Remove from this checklist item", confirm: "Remove from item", note: "The file itself stays in the room. Only the checklist item it counts for changes.", done: (name) => `Removed ${name} from the checklist item.` },
};

function requirementComplete(requirement: ApplicationRequirement): boolean {
  return requirement.verified_coverage_complete || ["verified", "waived", "not_applicable"].includes(requirement.status);
}

function evidenceDecisionDetailsMixed(decisions: ApplicationRequirementEvidence[]): boolean {
  return new Set(decisions.map((decision) => JSON.stringify([
    decision.ai_decision,
    decision.decision_actor,
    decision.ai_reason_code,
    decision.ai_explanation,
    decision.ai_confidence,
  ]))).size > 1;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

export function ApplicationEvidenceWorkspace({
  profileId,
  intakeId,
  initialTab = "requirements",
  onUploadFiles,
  uploadBusy = false,
  uploadStatus = "",
  onNotice,
  onRunAiReview,
  aiReviewRunning = false,
  onAddFromDrive,
  onAttachBucket,
  onRequestDocument,
  onVerificationChange,
  onProgramReadinessChange,
  focusRequirement,
  canCreatePrograms = false,
  programVertical = "main_street",
  intakeVariant,
  onOpenFinancials,
  canAddRequirements = false,
}: {
  profileId: string;
  intakeId: string;
  initialTab?: WorkspaceTab;
  onUploadFiles: (files: File[], requestedDocumentId?: string) => Promise<void> | void;
  uploadBusy?: boolean;
  uploadStatus?: string;
  onNotice?: (message: string) => void;
  onRunAiReview?: () => void;
  aiReviewRunning?: boolean;
  onAddFromDrive?: () => void;
  onAttachBucket?: () => void;
  /** Ask the client for something the checklist does not list yet (a custom request on the room). */
  onRequestDocument?: () => void;
  onVerificationChange?: (state: EvidenceWorkspace["verification"]) => void;
  onProgramReadinessChange?: (readiness: Readiness) => void;
  focusRequirement?: RequirementFocus | null;
  canCreatePrograms?: boolean;
  programVertical?: FundingProgramVertical;
  intakeVariant?: string | null;
  /** Programs are chosen on the Financials tab; this opens it. */
  onOpenFinancials?: () => void;
  /** Underwriting roles may add requirements from the library. */
  canAddRequirements?: boolean;
}) {
  const fileWorkspace = useFileWorkspace();
  const apiCall = useAuthedApi();
  const versions = useMemo(() => documentVersionService(apiCall, `/application-profiles/${profileId}/evidence`, { fileUrl: async (fileId, download) => (await apiCall<{ url: string }>(`/application-profiles/${profileId}/evidence/files/${fileId}/url?download=${download}`)).url }), [apiCall, profileId]);
  const productionCall = useProductionCall();
  const confirmAction = useConfirmAction();
  const queryClient = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryKey = useMemo(() => ["application-evidence-workspace", profileId] as const, [profileId]);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [dragging, setDragging] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [openBucketId, setOpenBucketId] = useState<string | null>(null);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedPreviewPage, setSelectedPreviewPage] = useState<number | undefined>();
  const [selectedPreviewHash, setSelectedPreviewHash] = useState<string | undefined>();
  const [previewRequestId, setPreviewRequestId] = useState(0);
  const [selectedRequirementKey, setSelectedRequirementKey] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [identityPending, setIdentityPending] = useState(false);
  const [requestingUnlockedCopyFileId, setRequestingUnlockedCopyFileId] = useState<string | null>(null);
  const [error, setError] = useState("");
  // The review screen covers the page, so what goes wrong inside it is said inside it.
  const [reviewError, setReviewError] = useState("");
  const [businessNameRequest, setBusinessNameRequest] = useState(0);
  const [groupFocus, setGroupFocus] = useState<{ group: TriageGroup; requestId: number } | null>(null);

  const workspace = useQuery({
    queryKey,
    queryFn: () => apiCall<EvidenceWorkspace>(`/application-profiles/${profileId}/evidence-workspace`),
    refetchInterval: (query) => query.state.data?.processing.has_processing ? 4000 : false,
    refetchOnWindowFocus: true,
  });
  const data = workspace.data;

  useEffect(() => setTab(initialTab), [initialTab]);
  useEffect(() => setOpenBucketId(null), [profileId, data?.primary_bucket_id]);
  useEffect(() => {
    if (focusRequirement?.requestId) setTab("requirements");
  }, [focusRequirement?.requestId]);
  useEffect(() => {
    if (data) onVerificationChange?.(data.verification);
  }, [data, onVerificationChange]);
  useEffect(() => {
    if (data?.program_readiness) onProgramReadinessChange?.(data.program_readiness);
  }, [data?.program_readiness, onProgramReadinessChange]);

  const updateReadiness = useCallback((readiness: Readiness) => {
    queryClient.setQueryData<EvidenceWorkspace>(queryKey, (current) => current ? { ...current, program_readiness: readiness } : current);
  }, [queryClient, queryKey]);

  const refresh = useCallback(async () => {
    await workspace.refetch();
  }, [workspace]);

  const upload = useCallback(async (files: File[], requestedDocumentId?: string) => {
    if (!files.length || uploadBusy) return;
    setError("");
    try {
      const screened = await screenPdfUploads(files);
      if (screened.uploadable.length) {
        await onUploadFiles(screened.uploadable, requestedDocumentId ?? data?.supporting_group?.id);
      }
      if (screened.uploadable.length || screened.rejected.length) await refresh();
      if (screened.rejected.length) setError(passwordProtectedPdfUploadNotice(screened.rejected));
    } catch (reason) {
      setError(documentUploadErrorMessage(reason, "Evidence could not be uploaded."));
    } finally {
      setDragging(false);
      if (uploadRef.current) uploadRef.current.value = "";
    }
  }, [data?.supporting_group?.id, onUploadFiles, refresh, uploadBusy]);

  const requirements = useMemo(
    () => data?.program_readiness.requirements ?? [],
    [data?.program_readiness.requirements],
  );
  const documentRequirements = useMemo(() => requirements.filter(isDocumentRequirement), [requirements]);
  const hasDebtRow = documentRequirements.some((item) => formKindsOf(item).includes("debt_schedule"));
  const debtSummary = useDebtScheduleReviewSummary(profileId, hasDebtRow);
  const documentCounts = useMemo(() => triageCounts(documentRequirements, (item: ApplicationRequirement): TriageExtra | undefined => (
    !debtSummary.loading && formKindsOf(item).includes("debt_schedule")
      ? { fillTable: { read: debtSummary.read, onSchedule: debtSummary.onSchedule, missing: debtSummary.missingAnswers, draftReady: debtSummary.draftComplete, publishNeeded: debtSummary.publishNeeded } }
      : undefined
  )), [documentRequirements, debtSummary.loading, debtSummary.missingAnswers, debtSummary.onSchedule, debtSummary.read, debtSummary.draftComplete, debtSummary.publishNeeded]);
  const files = useMemo(() => data?.evidence.files ?? [], [data?.evidence.files]);
  const lockedEvidenceByFileId = useMemo(() => {
    const result = new Map<string, ReturnType<typeof lockedEvidencePresentation>>();
    for (const file of files) {
      let presentation = lockedEvidencePresentation({
        fileName: file.file_name,
        isPasswordProtected: file.is_password_protected,
        analysisStatus: file.analysis_status,
        analysisReasonCode: file.analysis_reason_code,
        analysisDetail: file.analysis_detail,
      });
      if (!presentation && file.is_password_protected == null) {
        const decisions = requirements.flatMap((requirement) => requirement.evidence_files)
          .filter((decision) => decision.file_id === file.id);
        for (const decision of decisions) {
          presentation = lockedEvidencePresentation({
            fileName: file.file_name,
            isPasswordProtected: decision.is_password_protected,
            decisionReasonCode: decision.ai_reason_code,
            decisionExplanation: decision.ai_explanation,
          });
          if (presentation) break;
        }
      }
      result.set(file.id, presentation);
    }
    return result;
  }, [files, requirements]);
  const unlockedCopyRequestByFileId = useMemo(() => {
    const result = new Map<string, UnlockedCopyRequestState | null>();
    for (const file of files) {
      const linkedRequest = requirements
        .flatMap((requirement) => requirement.evidence_files)
        .find((decision) => decision.file_id === file.id && decision.unlocked_copy_request)?.unlocked_copy_request;
      result.set(file.id, file.unlocked_copy_request ?? linkedRequest ?? null);
    }
    return result;
  }, [files, requirements]);
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null;
  const selectedLockedEvidence = selectedFileId ? lockedEvidenceByFileId.get(selectedFileId) ?? null : null;
  const selectedUnlockedCopyRequest = selectedFileId ? unlockedCopyRequestByFileId.get(selectedFileId) ?? null : null;
  const assignments = useMemo(
    () => selectedFileId
      ? requirements.filter((requirement) => requirement.evidence_files.some((file) => file.file_id === selectedFileId))
      : [],
    [requirements, selectedFileId],
  );
  const currentAssignment = assignments.find((item) => item.requirement_key === (action?.requirementKey || selectedRequirementKey)) ?? assignments[0] ?? null;
  const currentDecision = currentAssignment?.evidence_files.find((file) => file.file_id === selectedFileId) ?? null;
  const selectedUnlockedCopyRequirement = assignments.find(
    (requirement) => requirement.client_visible && requirement.requested_document_id && !requirementComplete(requirement),
  ) ?? null;
  const bankRequirement = requirements.find((item) => item.requirement_key === "business_bank_statements_6_months")
    ?? requirements.find((item) => item.category.toLocaleLowerCase().includes("bank") && item.label.toLocaleLowerCase().includes("statement"));
  const statementEvidence = data?.banking.manual_statement_files?.length
    ? data.banking.manual_statement_files
    : bankRequirement?.evidence_files ?? [];
  const reviewFiles: BucketReviewFile[] = files.map((file) => ({
    id: file.id,
    file_name: file.file_name,
    content_type: file.content_type,
    size_bytes: file.size_bytes,
    created_at: file.created_at,
    is_password_protected: Boolean(lockedEvidenceByFileId.get(file.id)),
  }));
  const selectedReviewId = selectedFile?.id ?? "";
  const selectedReviewName = selectedFile?.file_name ?? "";
  const selectedReviewContentType = selectedFile?.content_type ?? "application/octet-stream";
  const selectedReviewSize = selectedFile?.size_bytes;
  const selectedReviewCreatedAt = selectedFile?.created_at;
  const selectedReviewPasswordProtected = Boolean(selectedLockedEvidence);
  const selectedReviewFile = useMemo<BucketReviewFile | null>(() => selectedReviewId ? {
    id: selectedReviewId,
    file_name: selectedReviewName,
    content_type: selectedReviewContentType,
    size_bytes: selectedReviewSize,
    created_at: selectedReviewCreatedAt,
    is_password_protected: selectedReviewPasswordProtected,
  } : null, [selectedReviewContentType, selectedReviewCreatedAt, selectedReviewId, selectedReviewName, selectedReviewPasswordProtected, selectedReviewSize]);

  const setReadinessAndRefresh = useCallback(async (next: Readiness) => {
    updateReadiness(next);
    await refresh();
  }, [refresh, updateReadiness]);

  const mutateRequirement = useCallback(async (requirementKey: string, payload: Record<string, unknown>) => {
    const next = await apiCall<Readiness>(`/application-profiles/${profileId}/requirements/${encodeURIComponent(requirementKey)}`, {
      method: "PATCH",
      body: JSON.stringify({ ...payload, confirmed: true }),
    });
    await setReadinessAndRefresh(next);
  }, [apiCall, profileId, setReadinessAndRefresh]);

  const openEvidenceFile = useCallback((fileId: string, requirementKey?: string, page?: number, expectedContentHash?: string) => {
    if (identityPending) return;
    setSelectedFileId(fileId);
    setSelectedRequirementKey(requirementKey ?? null);
    setSelectedPreviewPage(validPdfSourcePage(page) ?? undefined);
    const identity = files.find((file) => file.id === fileId)?.identity_association ?? requirements.flatMap((requirement) => requirement.evidence_files).find((file) => file.file_id === fileId)?.identity_association;
    setSelectedPreviewHash(expectedContentHash ?? identity?.content_hash ?? undefined);
    setPreviewRequestId((current) => current + 1);
    setAction(null);
    setReviewError("");
  }, [identityPending, files, requirements]);

  const startAction = useCallback((kind: ReviewActionKind) => {
    const requirement = currentAssignment;
    setReviewError("");
    setAction({
      kind,
      requirementKey: requirement?.requirement_key ?? "",
      targetKey: "",
      reasonCode: kind === "override" ? "ai_override" : "wrong_document",
      reason: "",
    });
  }, [currentAssignment]);

  async function applyReviewAction() {
    if (!selectedFile || !action) return;
    const source = requirements.find((item) => item.requirement_key === action.requirementKey);
    if (action.kind !== "reassign" && !source) return;
    if ((action.kind === "reject" || action.kind === "override") && !reasonLongEnough(action.reason)) return;
    if (action.kind === "reassign" && !action.targetKey) return;
    setActionBusy(true);
    setReviewError("");
    try {
      if (action.kind === "reject" || action.kind === "override") {
        const next = await apiCall<Readiness>(
          `/application-profiles/${profileId}/requirements/${encodeURIComponent(action.requirementKey)}/evidence/${selectedFile.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              decision: action.kind === "override" ? "accepted" : "rejected",
              reason_code: action.kind === "override" ? "ai_override" : action.reasonCode,
              reason: action.reason.trim(),
              confirmed: true,
            }),
          },
        );
        await setReadinessAndRefresh(next);
      } else if (action.kind === "reassign") {
        if (source && source.requirement_key !== action.targetKey) {
          await mutateRequirement(source.requirement_key, { action: "unlink_evidence", evidence_file_ids: [selectedFile.id] });
        }
        await mutateRequirement(action.targetKey, { action: "link_evidence", evidence_file_ids: [selectedFile.id] });
      } else {
        await mutateRequirement(source!.requirement_key, {
          action: action.kind === "unlink" ? "unlink_evidence" : action.kind,
          evidence_file_ids: [selectedFile.id],
        });
      }
      onNotice?.(action.kind === "reassign" && !assignments.length ? `Attached ${selectedFile.file_name}.` : ACTION_COPY[action.kind].done(selectedFile.file_name));
      setAction(null);
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : "The decision could not be saved.");
    } finally {
      setActionBusy(false);
    }
  }

  async function retryAnalysis(file: EvidenceWorkspaceFile) {
    setActionBusy(true);
    setReviewError("");
    try {
      await apiCall(`/application-profiles/${profileId}/evidence/${file.id}/reanalyze`, { method: "POST" });
      onNotice?.(`${file.file_name} was queued for AI reanalysis.`);
      await refresh();
    } catch (reason) {
      setReviewError(reason instanceof Error ? reason.message : "The AI could not be asked to read this file again.");
    } finally {
      setActionBusy(false);
    }
  }

  async function requestUnlockedCopy(fileId: string, fileName: string, retryFailed = false, copyRoomLink = false, requirementKey?: string) {
    const requirement = requirementKey ? requirements.find((item) => item.requirement_key === requirementKey) : null;
    if (!copyRoomLink) {
      const confirmed = await confirmAction({
        title: retryFailed ? "Retry the unlocked-copy request?" : "Request an unlocked copy?",
        body: `The client will receive a file-specific secure-room request${requirement ? ` for ${requirement.label}` : ""}. ${fileName} remains in Evidence for the audit trail.`,
        confirmLabel: retryFailed ? "Retry request" : "Send request",
      });
      if (!confirmed) return;
    }
    setRequestingUnlockedCopyFileId(fileId);
    setError("");
    setReviewError("");
    const failed = (message: string) => { setError(message); if (fileId === selectedFileId) setReviewError(message); };
    try {
      const request = unlockedCopyRequest(
        profileId,
        fileId,
        retryFailed,
        copyRoomLink ? "room_link_only" : "email_if_available",
      );
      const call = copyRoomLink ? apiCall : productionCall;
      const receipt = await call<UnlockedCopyRequestResult>(request.path, {
        method: "POST",
        body: JSON.stringify(request.payload),
      });
      if (copyRoomLink) {
        if (!receipt.room_url) throw new Error("The secure room link is unavailable.");
        try {
          await navigator.clipboard.writeText(receipt.room_url);
          onNotice?.(`Secure room link copied for ${fileName}.`);
        } catch {
          failed(`Clipboard access was blocked. Secure room link: ${receipt.room_url}`);
        }
      } else if (!receipt.provider_accepted) {
        failed(receipt.delivery_status === "created"
          ? "The unlocked-copy request is recorded, but no email was sent. Retry email or use Copy room link."
          : receipt.delivery_status === "sending"
            ? "The unlocked-copy request is recorded and email delivery is still processing. You can also use Copy room link."
            : "The unlocked-copy request is recorded, but delivery failed. Retry the request or use Copy room link.");
      } else {
        onNotice?.(`${receipt.deduplicated ? "Unlocked-copy request already active" : "Unlocked copy requested"} for ${fileName}.`);
      }
      await refresh();
    } catch (reason) {
      // The endpoint revalidates the stored bytes before it creates a request.
      // A legacy permission-encrypted PDF can therefore be corrected and
      // rejected as "not locked" in the same call; refresh so that correction
      // immediately clears the stale lock badge instead of waiting for a page
      // reload.
      await refresh().catch(() => undefined);
      failed(reason instanceof Error ? reason.message : "The unlocked-copy request could not be sent.");
    } finally {
      setRequestingUnlockedCopyFileId(null);
    }
  }

  async function copyUnlockedRoomLink(fileId: string, fileName: string, requirementKey?: string) {
    // Always resolve a fresh URL from the idempotent endpoint. A cached room
    // URL can become stale when staff rotate or replace the secure room.
    await requestUnlockedCopy(fileId, fileName, false, true, requirementKey);
  }

  const loadSelectedReview = useCallback(async (): Promise<BucketFileReview> => {
    if (!selectedReviewFile) throw new Error("Evidence file is no longer available.");
    const expectedHash = selectedPreviewHash ? `?expected_content_hash=${encodeURIComponent(selectedPreviewHash)}` : "";
    let signed: { url: string; expires_in: number; sheets?: BucketFileReview["sheets"] };
    try {
      signed = await apiCall<{ url: string; expires_in: number; sheets?: BucketFileReview["sheets"] }>(`/application-profiles/${profileId}/evidence/files/${selectedReviewFile.id}/url${expectedHash}`);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new Error("Source file changed. Review its current version and refresh the analysis before using this reference.");
      throw error;
    }
    return {
      file: selectedReviewFile,
      preview_url: signed.url,
      annotations: [],
      sheets: signed.sheets ?? null,
    };
  }, [apiCall, profileId, selectedReviewFile, selectedPreviewHash]);

  const actionValid = Boolean(action && (
    action.kind === "reassign"
      ? action.targetKey
      : action.kind === "reject" || action.kind === "override"
      ? action.requirementKey && reasonLongEnough(action.reason)
      : action.requirementKey
  ));

  // What the review screen says about the open file, and what the reviewer can do.
  const identityRecord = currentDecision?.identity_association ?? selectedFile?.identity_association ?? null;
  const reviewEvidence = currentDecision && selectedFile ? { ...currentDecision, detected_classification: currentDecision.detected_classification ?? selectedFile.analysis_classification, analysis_confidence: currentDecision.analysis_confidence ?? selectedFile.analysis_confidence } : null;
  const reviewIsDebtSchedule = Boolean(currentAssignment && formKindsOf(currentAssignment).includes("debt_schedule"));
  const reviewPresentation = reviewEvidence ? evidenceReviewPresentation(reviewEvidence, currentAssignment?.label || "Supporting / Other", reviewIsDebtSchedule) : null;
  const reviewState = selectedFile ? reviewDecisionState({
    decision: currentDecision,
    requirementLabel: currentAssignment?.label ?? null,
    verificationRequired: Boolean(currentAssignment?.verification_required),
    locked: selectedLockedEvidence,
    headline: reviewPresentation?.headline,
    explanation: reviewPresentation?.explanation,
    analysisFailed: selectedFile.analysis_status === "failed",
    analysisNote: [
      evidenceAnalysisLabel(selectedFile.analysis_status, selectedFile.analysis_reason_code),
      selectedFile.analysis_detail || selectedFile.analysis_summary,
      selectedFile.analysis_classification ? `Read as ${selectedFile.analysis_classification.replaceAll("_", " ")}${selectedFile.analysis_confidence ? ` (${selectedFile.analysis_confidence} confidence)` : ""}` : null,
    ].filter((part): part is string => Boolean(part)).map((part) => part.trim().replace(/[.\s]+$/, "")).join(". "),
  }) : null;
  const chooseReviewAction = (choice: ReviewChoice) => {
    if (!selectedFile) return;
    if (choice === "retry") { void retryAnalysis(selectedFile); return; }
    startAction(choice === "approve" ? "verify" : choice === "approve_anyway" ? "override" : choice === "attach" ? "reassign" : "reject");
  };
  const actionCopy = action ? ACTION_COPY[action.kind] : null;
  const attaching = action?.kind === "reassign" && !assignments.length;

  if (workspace.isLoading && !data) return <div className="empty">Loading evidence and banking...</div>;
  if (!data) return <Callout tone="bad">{workspace.error instanceof Error ? workspace.error.message : "Evidence and banking are unavailable."}</Callout>;

  return <section className="application-evidence-workspace">
    <header className="evidence-workspace-header">
      <div>
        <span className="lbl">Step 2</span>
        <h2>Evidence &amp; banking</h2>
        <Sub>Everything the client has sent, what the AI made of it, and what is still needed.</Sub>
      </div>
      <div className="evidence-workspace-actions">
        {onAddFromDrive ? <ActionIcon icon="upload" label="Add files from Google Drive" onClick={onAddFromDrive} /> : null}
        {onAttachBucket ? <ActionIcon icon="link" label="Attach an existing bucket to this file" onClick={onAttachBucket} /> : null}
        {onRequestDocument ? <ActionIcon icon="send" label="Request a document from the client" onClick={onRequestDocument} /> : null}
        {data.primary_bucket_id ? <ActionIcon icon="vault" label="Open the file room" onClick={() => setOpenBucketId(data.primary_bucket_id)} /> : null}
        <span title="Fill in, share or download the PDS, debt schedule, P&L and balance sheet">{fileWorkspace && !fileWorkspace.pageMode ? <FileWorkspaceLink tool="forms">Forms</FileWorkspaceLink> : <Btn variant="pri" onClick={() => setFormsOpen(true)}><Icon name="file" size={14} />Forms</Btn>}</span>
      </div>
    </header>

    <input ref={uploadRef} type="file" hidden multiple accept={ACCEPTED_UPLOADS} aria-label="Upload evidence files" onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
    <button
      type="button"
      className={cx("evidence-workspace-dropzone", "compact", dragging && "dragging")}
      disabled={!data.can_upload || uploadBusy}
      onClick={() => uploadRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}
    >
      <span className="evidence-workspace-drop-icon"><Icon name="upload" size={22} /></span>
      <span><strong>{uploadBusy ? uploadStatus || "Uploading evidence..." : "Drop files or ZIP archives here"}</strong><small>PDFs, spreadsheets, images, CSV and ZIP files are classified and read by the AI. Use Versions on an existing file to upload its updated copy.</small></span>
      <span className="btn sm">{uploadBusy ? "Uploading" : "Browse"}</span>
    </button>

    <EvidenceOverview
      counts={documentCounts}
      aiFiles={data.processing.analyzing_files}
      bank={{
        accepted: data.bank_evidence.accepted_statement_months.length,
        required: data.bank_evidence.required_statement_months,
        complete: Boolean(data.bank_evidence.statement_coverage_complete),
        institutions: data.bank_evidence.connected_institutions,
        counted: data.bank_evidence.counted_accounts?.length ?? 0,
      }}
      onJump={(target: OverviewTarget) => {
        if (target === "banking") { setTab("banking"); return; }
        setTab("requirements");
        setGroupFocus({ group: target, requestId: Date.now() });
      }}
    />

    {error ? <Callout tone="bad">{error}</Callout> : null}
    {data.processing.has_processing ? <Callout tone="acc"><span className="spinner" />AI is processing {data.processing.analyzing_files} file{data.processing.analyzing_files === 1 ? "" : "s"}. This workspace refreshes automatically.</Callout> : null}

    <div className="evidence-workspace-tabs" role="tablist" aria-label="Evidence workspace sections">
      {([
        ["requirements", "Documents", documentCounts.you],
        ["banking", "Banking", data.bank_evidence.statement_coverage_complete ? 0 : 1],
        ["files", `All files (${data.evidence.total_files})`, 0],
      ] as const).map(([id, label, attention]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => setTab(id)}>{label}{attention ? <span className="ev-tab-badge" aria-label={id === "requirements" ? `${attention} need you` : "needs attention"}>{id === "requirements" ? attention : "!"}</span> : null}</button>)}
    </div>

    {tab === "requirements" ? <ApplicationProgramReadiness
      section="documents"
      focusGroup={groupFocus}
      onOpenFinancials={onOpenFinancials}
      canAddRequirements={canAddRequirements}
      onOpenForms={() => setFormsOpen(true)}
      profileId={profileId}
      files={files.map((file) => ({
        id: file.id,
        file_name: file.file_name,
        created_at: file.created_at,
        analysis_status: file.analysis_status,
        analysis_reason_code: file.analysis_reason_code,
        analysis_detail: file.analysis_detail,
        is_password_protected: file.is_password_protected,
        unlocked_copy_request: file.unlocked_copy_request,
      }))}
      value={data.program_readiness}
      onValueChange={updateReadiness}
      onRefresh={refresh}
      showUploader={false}
      onNotice={onNotice}
      onRunAiReview={onRunAiReview}
      aiReviewRunning={aiReviewRunning}
      onUploadFiles={upload}
      uploadBusy={uploadBusy}
      onPreviewEvidence={(fileId, requirementKey, page, expectedContentHash) => openEvidenceFile(fileId, requirementKey, page, expectedContentHash)}
      onRequestUnlockedCopy={(fileId, requirementKey, fileName, retryFailed, copyRoomLink) => requestUnlockedCopy(fileId, fileName, retryFailed, copyRoomLink, requirementKey)}
      unlockedCopyRequestingFileId={requestingUnlockedCopyFileId}
      focusRequirementQuery={focusRequirement?.query}
      focusRequestId={focusRequirement?.requestId}
      canCreatePrograms={canCreatePrograms}
      programVertical={programVertical}
      intakeVariant={intakeVariant}
    /> : null}

    {/* Plaid first: the request sits above everything else on the Banking sub-tab. */}
    {tab === "banking" ? <PlaidRequestBar profileId={profileId} state={data.verification} banks={data.banking} onSent={refresh} /> : null}
    {tab === "banking" ? <BankAccountsCard profileId={profileId} canEdit={canCreatePrograms || true} onSaved={refresh} /> : null}
    {tab === "banking" ? <><BankingPanel
      profileId={profileId}
      sourceKind="intake"
      sourceId={intakeId}
      state={data.verification}
      banks={data.banking}
      loading={false}
      onRefresh={refresh}
      showStatementUploader={false}
      statementEvidence={statementEvidence}
      onPreviewEvidence={(fileId) => openEvidenceFile(fileId, bankRequirement?.requirement_key)}
      onRequestUnlockedCopy={(fileId, fileName, retryFailed, copyRoomLink) => requestUnlockedCopy(fileId, fileName, retryFailed, copyRoomLink, bankRequirement?.requirement_key)}
      unlockedCopyRequestingFileId={requestingUnlockedCopyFileId}
    /><ApplicationDebtPayees profileId={profileId} refreshKey={workspace.dataUpdatedAt} onChanged={refresh} /></> : null}

    {tab === "files" ? <div className="evidence-workspace-files">
      <div className="supporting-document-group">
        <div><span className="lbl">General upload destination</span><b>{data.supporting_group?.name || "Supporting / Other"}</b><Sub>Optional supporting files never count as missing and do not trigger reminders or stage changes.</Sub></div>
        <CellChip tone="mut">{data.supporting_group?.file_count ?? 0} supporting</CellChip>
        <Btn onClick={() => uploadRef.current?.click()} disabled={uploadBusy}><Icon name="upload" size={14} />Add files</Btn>
      </div>
      <div className="evidence-workspace-file-list">
        {latestDocumentFiles(files).map((file) => {
          const fileAssignments = requirements.filter((requirement) => requirement.evidence_files.some((item) => item.file_id === file.id));
          const fileDecisions = fileAssignments.flatMap((requirement) => requirement.evidence_files.filter((item) => item.file_id === file.id));
          const aggregate = aggregateEvidenceDecisions(fileDecisions.map((item) => item.ai_decision));
          const decisionSummaryMixed = aggregate.mixed || evidenceDecisionDetailsMixed(fileDecisions);
          const decision = fileDecisions.find((item) => item.ai_decision === aggregate.decision);
          const presentation = decision ? evidenceReviewPresentation({ ...decision, detected_classification: decision.detected_classification ?? file.analysis_classification, analysis_confidence: decision.analysis_confidence ?? file.analysis_confidence }, fileAssignments[0]?.label || "Supporting / Other", Boolean(fileAssignments[0] && formKindsOf(fileAssignments[0]).includes("debt_schedule"))) : null;
          const analysisLabel = evidenceAnalysisLabel(file.analysis_status, file.analysis_reason_code);
          const analysisDetail = file.analysis_detail || file.analysis_summary || (file.analysis_classification ? `Classified as ${file.analysis_classification.replaceAll("_", " ")}` : "Analysis explanation not available");
          const locked = lockedEvidenceByFileId.get(file.id) ?? null;
          const unlockedCopyRequestState = unlockedCopyRequestByFileId.get(file.id) ?? null;
          const unlockedCopyRequirement = fileAssignments.find((requirement) => requirement.client_visible && requirement.requested_document_id && !requirementComplete(requirement));
          return <article key={file.id} className={cx("evidence-workspace-file-row", locked && "password-protected", `decision-${decision?.ai_decision || "unassigned"}`)}>
            <span className={cx("evidence-file-icon", locked && "locked")}><Icon name={locked ? "lock" : "file"} size={16} aria-hidden="true" /></span>
            <div className="grow evidence-file-copy"><b>{file.file_name}</b><Sub>{formatSize(file.size_bytes)} · {formatDate(file.created_at)} · {fileAssignments.map((item) => item.label).join(", ") || "Supporting / Other"}</Sub>{locked ? <Sub><strong>{locked.title}</strong> · {locked.explanation} AI cannot review its contents until an unlocked replacement is uploaded.</Sub> : decision ? decisionSummaryMixed ? <Sub><strong>Multiple requirement decisions</strong> · Preview the file to inspect each assignment.</Sub> : <Sub><strong>{presentation?.headline}</strong>{presentation ? ` · ${presentation.explanation}` : ""}</Sub> : <Sub><strong>{analysisLabel}</strong>{analysisDetail ? ` · ${analysisDetail}` : ""}</Sub>}</div>
            {locked ? <LockedEvidenceBadge presentation={locked} /> : <CellChip tone={decision ? evidenceDecisionTone(decision.ai_decision) : file.analysis_status === "failed" ? "bad" : file.analysis_status === "skipped" ? "warn" : file.analysis_status === "completed" ? "acc" : "mut"}>{decision ? decisionSummaryMixed ? "Mixed decisions" : evidenceDecisionLabel(decision.ai_decision, decision.decision_actor) : analysisLabel}</CellChip>}
            {!locked ? <EvidenceIdentityWarning reasonCode={decision?.ai_reason_code} decision={decision?.ai_decision} /> : null}
            {locked ? <UnlockedCopyRequestControl request={unlockedCopyRequestState} busy={requestingUnlockedCopyFileId === file.id} onRequest={(retryFailed) => requestUnlockedCopy(file.id, file.file_name, retryFailed, false, unlockedCopyRequirement?.requirement_key)} onCopyRoomLink={() => copyUnlockedRoomLink(file.id, file.file_name, unlockedCopyRequirement?.requirement_key)} /> : null}
            <ActionIcon icon="eye" label={`Preview ${file.file_name}`} onClick={() => openEvidenceFile(file.id, fileAssignments[0]?.requirement_key)} />
            <DocumentVersionControl file={file} service={versions} onChanged={refresh} />
          </article>;
        })}
        {!files.length ? <div className="empty">No evidence files have been uploaded.</div> : null}
      </div>
    </div> : null}

    {formsOpen ? <FinancialWorkspace open profileId={profileId} initialKind="debt_schedule" onClose={() => setFormsOpen(false)} onPublished={refresh} onUploadFiles={async (files) => { await upload(files); }} /> : null}

    {selectedFile ? <BucketFileReviewPanel
      title="Evidence review"
      files={reviewFiles}
      activeFileId={selectedFile.id}
      initialPage={selectedPreviewPage}
      pageRequestId={previewRequestId}
      onSelectFile={(fileId) => openEvidenceFile(fileId)}
      reviewKey={`${selectedFile.id}:${selectedPreviewHash || ""}`}
      loadReview={loadSelectedReview}
      annotationsEnabled={false}
      onClose={() => { if (identityPending) return; setSelectedFileId(null); setSelectedRequirementKey(null); setSelectedPreviewPage(undefined); setSelectedPreviewHash(undefined); setAction(null); setReviewError(""); }}
      reviewContext={reviewState ? <EvidenceDecisionBar
        state={reviewState}
        requirementKey={currentAssignment?.requirement_key}
        requirements={assignments.map((requirement) => { const decision = requirement.evidence_files.find((item) => item.file_id === selectedFile.id); return { key: requirement.requirement_key, label: `${requirement.label}${decision ? ` — ${evidenceDecisionLabel(decision.ai_decision, decision.decision_actor)}` : ""}` }; })}
        onSelectRequirement={(key) => { setSelectedRequirementKey(key); setAction(null); setReviewError(""); }}
        busy={actionBusy || identityPending}
        onChoice={chooseReviewAction}
        extraChip={currentDecision?.usability_status === "unsafe" || currentDecision?.usability_status === "needs_replacement" ? <CellChip tone={currentDecision.usability_status === "unsafe" ? "bad" : "warn"}>{evidenceUsabilityLabel(currentDecision.usability_status)}</CellChip> : null}
        error={action ? undefined : reviewError}
      >
        {!selectedLockedEvidence ? <BusinessNameDecision
          review={{ profileId, fileId: selectedFile.id, canEdit: canAddRequirements, expectedContentHash: selectedPreviewHash, requirePreviewBinding: true, initialRecord: identityRecord, onSaved: refresh, onPending: setIdentityPending, externallyBusy: identityPending }}
          reasonCode={currentDecision?.ai_reason_code}
          decision={currentDecision?.ai_decision}
          fileName={selectedFile.file_name}
          openRequest={businessNameRequest}
          onNotice={onNotice}
        /> : null}
        {reviewEvidence && !selectedLockedEvidence ? <EvidenceReviewDetails
          file={reviewEvidence}
          requirementLabel={currentAssignment?.label || "Supporting / Other"}
          isDebtSchedule={reviewIsDebtSchedule}
          usability={reviewEvidence.usability_status ? evidenceUsabilityLabel(reviewEvidence.usability_status) : null}
          alsoReadAs={(reviewEvidence.document_type_candidates ?? []).map((candidate) => candidate.classification).filter((classification) => classification !== reviewEvidence.detected_classification).map((classification) => classification.replaceAll("_", " "))}
        /> : null}
      </EvidenceDecisionBar> : null}
      lockedFileGuidance={<Sub>AI review can resume after the client uploads an unlocked replacement. The original remains in Evidence for the audit trail.</Sub>}
      lockedFileActions={<UnlockedCopyRequestControl request={selectedUnlockedCopyRequest} busy={requestingUnlockedCopyFileId === selectedFile.id} onRequest={(retryFailed) => requestUnlockedCopy(selectedFile.id, selectedFile.file_name, retryFailed, false, selectedUnlockedCopyRequirement?.requirement_key)} onCopyRoomLink={() => copyUnlockedRoomLink(selectedFile.id, selectedFile.file_name, selectedUnlockedCopyRequirement?.requirement_key)} />}
      headerActions={<>
        <DocumentVersionControl file={selectedFile} service={versions} onChanged={refresh} />
        {/* Approve and Reject are labelled buttons in the strip under this
            header; the menu keeps what is done rarely. */}
        <PageActionMenu label={`More actions for ${selectedFile.file_name}`} items={[
          { label: assignments.length ? "Move to another checklist item…" : "Attach to a checklist item…", onSelect: () => startAction("reassign") },
          { label: "Remove from this checklist item", hidden: !currentAssignment, onSelect: () => startAction("unlink") },
          { label: "Remove the approval", hidden: !(currentAssignment?.verification_required && currentDecision?.verified), onSelect: () => startAction("unverify") },
          { label: "Business name on this document…", hidden: Boolean(selectedLockedEvidence) || !identityRecord, onSelect: () => setBusinessNameRequest((value) => value + 1) },
        ]} />
      </>}
    /> : null}

    <Drawer
      open={Boolean(action && selectedFile)}
      onClose={() => { if (!actionBusy) { setAction(null); setReviewError(""); } }}
      title={actionCopy ? attaching ? "Attach to a checklist item" : actionCopy.title : "File decision"}
      sub={selectedFile?.file_name}
      width="md"
      footer={<><Btn onClick={() => { setAction(null); setReviewError(""); }} disabled={actionBusy}>Cancel</Btn><Btn variant={action?.kind === "reject" ? "default" : "pri"} className={action?.kind === "reject" ? "pri-bad" : undefined} disabled={!actionValid || actionBusy} onClick={() => void applyReviewAction()}>{actionBusy ? "Saving..." : actionCopy ? attaching ? "Attach file" : actionCopy.confirm : "Save"}</Btn></>}
    >
      {action && actionCopy ? <div className="grid">
        {reviewError ? <Callout tone="bad">{reviewError}</Callout> : null}
        {assignments.length ? <Field label="Checklist item"><Select aria-label="Checklist item" value={action.requirementKey} onChange={(event) => setAction({ ...action, requirementKey: event.target.value })}>{assignments.map((requirement) => <option key={requirement.requirement_key} value={requirement.requirement_key}>{requirement.label}</option>)}</Select></Field> : null}
        {action.kind === "reassign" ? <Field label={attaching ? "Attach it to" : "Move it to"}><Select aria-label={attaching ? "Attach it to" : "Move it to"} value={action.targetKey} onChange={(event) => setAction({ ...action, targetKey: event.target.value })}><option value="">Choose a checklist item...</option>{requirements.filter((item) => item.requirement_key !== action.requirementKey).map((requirement) => <option key={requirement.requirement_key} value={requirement.requirement_key}>{requirement.label}</option>)}</Select></Field> : null}
        {action.kind === "reject" ? <Field label="What is wrong with it"><Select aria-label="What is wrong with it" value={action.reasonCode} onChange={(event) => setAction({ ...action, reasonCode: event.target.value })}>{REASON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field> : null}
        {(action.kind === "reject" || action.kind === "override") ? <Field
          label={action.kind === "reject" ? "Why" : "Why you are approving it"}
          hint={reasonLongEnough(action.reason) ? undefined : `Pick a reason, or write one of at least ${MIN_REASON_LENGTH} characters.`}
        >
          <QuickReasons reasons={action.kind === "reject" ? [REJECT_REASONS[action.reasonCode]].filter(Boolean) : APPROVE_REASONS} value={action.reason} disabled={actionBusy} onPick={(reason) => setAction({ ...action, reason })} />
          <Textarea aria-label="Reason" rows={4} maxLength={2000} value={action.reason} disabled={actionBusy} onChange={(event) => setAction({ ...action, reason: event.target.value })} placeholder="Pick a reason above or write your own. It is kept in the file's history." />
        </Field> : null}
        <Callout tone={action.kind === "reject" ? "warn" : "mut"}>{actionCopy.note}</Callout>
      </div> : null}
    </Drawer>
    <BucketWorkspaceOverlay bucketId={openBucketId} onClose={() => { setOpenBucketId(null); void refresh(); }} />
  </section>;
}
