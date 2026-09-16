"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationProgramReadiness } from "@/components/application/ApplicationProgramReadiness";
import { BankingPanel } from "@/components/application/ApplicationVerificationWorkspace";
import { FinancialFormsPanel } from "@/components/application/FinancialFormsPanel";
import { LockedEvidenceBadge, UnlockedCopyRequestControl } from "@/components/application/LockedEvidenceStatus";
import {
  BucketFileReviewPanel,
  type BucketFileReview,
  type BucketReviewFile,
} from "@/components/buckets/BucketFileReviewPanel";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { Btn, Callout, CellChip, Field, IconBtn, Select, Sub, Textarea, cx } from "@/components/ds";
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
  evidenceActorLabel,
  evidenceCoverageLabel,
  evidenceDecisionLabel,
  evidenceDecisionTone,
  evidenceReasonLabel,
} from "@/lib/evidenceDecision";
import { lockedEvidencePresentation, unlockedCopyRequest } from "@/lib/lockedEvidence";
import { documentUploadErrorMessage, passwordProtectedPdfUploadNotice, screenPdfUploads } from "@/lib/documentUpload";
import { useProductionCall } from "@/lib/productionTrainingCall";
import type { FundingProgramVertical } from "@/lib/fundingPrograms";

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
  ["wrong_entity", "Wrong entity"],
  ["wrong_period", "Wrong period"],
  ["incomplete", "Incomplete"],
  ["unreadable", "Unreadable"],
  ["duplicate", "Duplicate"],
  ["other", "Other"],
] as const;

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
  onVerificationChange,
  onProgramReadinessChange,
  focusRequirement,
  canCreatePrograms = false,
  programVertical = "main_street",
  intakeVariant,
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
  onVerificationChange?: (state: EvidenceWorkspace["verification"]) => void;
  onProgramReadinessChange?: (readiness: Readiness) => void;
  focusRequirement?: RequirementFocus | null;
  canCreatePrograms?: boolean;
  programVertical?: FundingProgramVertical;
  intakeVariant?: string | null;
}) {
  const apiCall = useAuthedApi();
  const productionCall = useProductionCall();
  const confirmAction = useConfirmAction();
  const queryClient = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryKey = useMemo(() => ["application-evidence-workspace", profileId] as const, [profileId]);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [dragging, setDragging] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedRequirementKey, setSelectedRequirementKey] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [requestingUnlockedCopyFileId, setRequestingUnlockedCopyFileId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const workspace = useQuery({
    queryKey,
    queryFn: () => apiCall<EvidenceWorkspace>(`/application-profiles/${profileId}/evidence-workspace`),
    refetchInterval: (query) => query.state.data?.processing.has_processing ? 4000 : false,
    refetchOnWindowFocus: true,
  });
  const data = workspace.data;

  useEffect(() => setTab(initialTab), [initialTab]);
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

  // AI review completion updates evidence decisions and canonical readiness
  // without changing this component's query key. Refetch the mounted evidence
  // workspace so accepted uploads disappear from Still needed immediately.
  useEffect(() => {
    const refreshAfterReview = (event: Event) => {
      const completedIntakeId = (event as CustomEvent<{ intakeId?: string }>).detail?.intakeId;
      if (completedIntakeId !== intakeId) return;
      void refresh();
    };
    window.addEventListener("qc-ai-review-completed", refreshAfterReview);
    return () => window.removeEventListener("qc-ai-review-completed", refreshAfterReview);
  }, [intakeId, refresh]);

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
  const requiredRequirements = requirements.filter((item) => item.required_level === "required");
  const completeRequirements = requiredRequirements.filter(requirementComplete);
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
  const assignmentDecisions = assignments.flatMap((requirement) => requirement.evidence_files.filter((file) => file.file_id === selectedFileId));
  const assignmentAggregate = aggregateEvidenceDecisions(assignmentDecisions.map((decision) => decision.ai_decision));
  const assignmentSummaryMixed = assignmentAggregate.mixed || evidenceDecisionDetailsMixed(assignmentDecisions);
  const aggregateDecision = assignmentDecisions.find((decision) => decision.ai_decision === assignmentAggregate.decision) ?? currentDecision;
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

  const openEvidenceFile = useCallback((fileId: string, requirementKey?: string) => {
    setSelectedFileId(fileId);
    setSelectedRequirementKey(requirementKey ?? null);
    setAction(null);
  }, []);

  const startAction = useCallback((kind: ReviewActionKind) => {
    const requirement = currentAssignment;
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
    if ((action.kind === "reject" || action.kind === "override") && action.reason.trim().length < 8) return;
    if (action.kind === "reassign" && !action.targetKey) return;
    setActionBusy(true);
    setError("");
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
      onNotice?.(`${selectedFile.file_name} evidence decision updated.`);
      setAction(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The evidence decision could not be saved.");
    } finally {
      setActionBusy(false);
    }
  }

  async function retryAnalysis(file: EvidenceWorkspaceFile) {
    setActionBusy(true);
    setError("");
    try {
      await apiCall(`/application-profiles/${profileId}/evidence/${file.id}/reanalyze`, { method: "POST" });
      onNotice?.(`${file.file_name} was queued for AI reanalysis.`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "AI reanalysis could not be queued.");
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
          setError(`Clipboard access was blocked. Secure room link: ${receipt.room_url}`);
        }
      } else if (!receipt.provider_accepted) {
        setError(receipt.delivery_status === "created"
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
      setError(reason instanceof Error ? reason.message : "The unlocked-copy request could not be sent.");
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
    const signed = await apiCall<{ url: string; expires_in: number }>(`/application-profiles/${profileId}/evidence/files/${selectedReviewFile.id}/url`);
    return {
      file: selectedReviewFile,
      preview_url: signed.url,
      annotations: [],
    };
  }, [apiCall, profileId, selectedReviewFile]);

  const actionValid = Boolean(action && (
    action.kind === "reassign"
      ? action.targetKey
      : action.kind === "reject" || action.kind === "override"
      ? action.requirementKey && action.reason.trim().length >= 8
      : action.requirementKey
  ));

  if (workspace.isLoading && !data) return <div className="empty">Loading evidence and banking...</div>;
  if (!data) return <Callout tone="bad">{workspace.error instanceof Error ? workspace.error.message : "Evidence and banking are unavailable."}</Callout>;

  return <section className="application-evidence-workspace">
    <header className="evidence-workspace-header">
      <div>
        <span className="lbl">Step 2</span>
        <h2>Evidence &amp; banking</h2>
        <Sub>One live snapshot controls evidence decisions, statement coverage, Plaid, forms, and readiness.</Sub>
      </div>
      <div className="evidence-workspace-actions">
        {onAddFromDrive ? <Btn onClick={onAddFromDrive}><Icon name="upload" size={14} />Add from Drive</Btn> : null}
        {onAttachBucket ? <Btn onClick={onAttachBucket}><Icon name="link" size={14} />Attach bucket</Btn> : null}
        {data.primary_bucket_id ? <Link className="btn" href={`/admin/buckets?bucket=${data.primary_bucket_id}`}><Icon name="vault" size={14} />Open bucket</Link> : null}
        <Btn variant="pri" onClick={() => setFormsOpen(true)}><Icon name="file" size={14} />Forms</Btn>
      </div>
    </header>

    <input ref={uploadRef} type="file" hidden multiple accept={ACCEPTED_UPLOADS} aria-label="Upload evidence files" onChange={(event) => void upload(Array.from(event.target.files ?? []))} />
    <button
      type="button"
      className={cx("evidence-workspace-dropzone", dragging && "dragging")}
      disabled={!data.can_upload || uploadBusy}
      onClick={() => uploadRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
      onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={(event) => { event.preventDefault(); void upload(Array.from(event.dataTransfer.files)); }}
    >
      <span className="evidence-workspace-drop-icon"><Icon name="upload" size={22} /></span>
      <span><strong>{uploadBusy ? uploadStatus || "Uploading evidence..." : "Drop files or ZIP archives here"}</strong><small>PDFs, spreadsheets, documents, images, CSV files, and ZIP archives are sent to Supporting / Other, classified, and reviewed by AI.</small></span>
      <span className="btn sm">{uploadBusy ? "Uploading" : "Browse"}</span>
    </button>

    <div className="evidence-workspace-metrics" aria-label="Evidence and banking status">
      <div><span>Requirements</span><b>{completeRequirements.length} / {requiredRequirements.length}</b><small>accepted or overridden</small></div>
      <div><span>Bank statements</span><b>{data.bank_evidence.accepted_statement_months.length} / {data.bank_evidence.required_statement_months}</b><small>{data.bank_evidence.statement_coverage_complete ? "coverage complete" : "distinct months accepted"}</small></div>
      <div><span>Plaid</span><b>{data.bank_evidence.connected_institutions}</b><small>{data.bank_evidence.connected_institutions ? "connected institutions" : data.bank_evidence.statement_coverage_complete ? "optional" : "not connected"}</small></div>
      <div><span>Processing</span><b>{data.processing.analyzing_files}</b><small>{data.processing.failed_files || data.processing.skipped_files ? [data.processing.failed_files ? `${data.processing.failed_files} failed` : "", data.processing.skipped_files ? `${data.processing.skipped_files} skipped` : ""].filter(Boolean).join(" · ") : `${data.processing.total_files} total files`}</small></div>
    </div>

    {error ? <Callout tone="bad">{error}</Callout> : null}
    {data.processing.has_processing ? <Callout tone="acc"><span className="spinner" />AI is processing {data.processing.analyzing_files} file{data.processing.analyzing_files === 1 ? "" : "s"}. This workspace refreshes automatically.</Callout> : null}

    <div className="evidence-workspace-tabs" role="tablist" aria-label="Evidence workspace sections">
      {([[
        "requirements", "Requirements",
      ], ["banking", "Banking"], ["files", `All files (${data.evidence.total_files})`]] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : undefined} onClick={() => setTab(id)}>{label}</button>)}
    </div>

    {tab === "requirements" ? <ApplicationProgramReadiness
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
      onPreviewEvidence={(fileId, requirementKey) => openEvidenceFile(fileId, requirementKey)}
      onRequestUnlockedCopy={(fileId, requirementKey, fileName, retryFailed, copyRoomLink) => requestUnlockedCopy(fileId, fileName, retryFailed, copyRoomLink, requirementKey)}
      unlockedCopyRequestingFileId={requestingUnlockedCopyFileId}
      focusRequirementQuery={focusRequirement?.query}
      focusRequestId={focusRequirement?.requestId}
      canCreatePrograms={canCreatePrograms}
      programVertical={programVertical}
      intakeVariant={intakeVariant}
    /> : null}

    {tab === "banking" ? <BankingPanel
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
    /> : null}

    {tab === "files" ? <div className="evidence-workspace-files">
      <div className="supporting-document-group">
        <div><span className="lbl">General upload destination</span><b>{data.supporting_group?.name || "Supporting / Other"}</b><Sub>Optional supporting files never count as missing and do not trigger reminders or stage changes.</Sub></div>
        <CellChip tone="mut">{data.supporting_group?.file_count ?? 0} supporting</CellChip>
        <Btn onClick={() => uploadRef.current?.click()} disabled={uploadBusy}><Icon name="upload" size={14} />Add files</Btn>
      </div>
      <div className="evidence-workspace-file-list">
        {files.map((file) => {
          const fileAssignments = requirements.filter((requirement) => requirement.evidence_files.some((item) => item.file_id === file.id));
          const fileDecisions = fileAssignments.flatMap((requirement) => requirement.evidence_files.filter((item) => item.file_id === file.id));
          const aggregate = aggregateEvidenceDecisions(fileDecisions.map((item) => item.ai_decision));
          const decisionSummaryMixed = aggregate.mixed || evidenceDecisionDetailsMixed(fileDecisions);
          const decision = fileDecisions.find((item) => item.ai_decision === aggregate.decision);
          const analysisLabel = evidenceAnalysisLabel(file.analysis_status, file.analysis_reason_code);
          const analysisDetail = file.analysis_detail || file.analysis_summary || (file.analysis_classification ? `Classified as ${file.analysis_classification.replaceAll("_", " ")}` : "Analysis explanation not available");
          const locked = lockedEvidenceByFileId.get(file.id) ?? null;
          const unlockedCopyRequestState = unlockedCopyRequestByFileId.get(file.id) ?? null;
          const unlockedCopyRequirement = fileAssignments.find((requirement) => requirement.client_visible && requirement.requested_document_id && !requirementComplete(requirement));
          return <article key={file.id} className={cx("evidence-workspace-file-row", locked && "password-protected", `decision-${decision?.ai_decision || "unassigned"}`)}>
            <span className={cx("evidence-file-icon", locked && "locked")}><Icon name={locked ? "lock" : "file"} size={16} aria-hidden="true" /></span>
            <div className="grow trunc"><b className="trunc">{file.file_name}</b><Sub>{formatSize(file.size_bytes)} · {formatDate(file.created_at)} · {fileAssignments.map((item) => item.label).join(", ") || "Supporting / Other"}</Sub>{locked ? <Sub><strong>{locked.title}</strong> · {locked.explanation} AI cannot review its contents until an unlocked replacement is uploaded.</Sub> : decision ? decisionSummaryMixed ? <Sub><strong>Multiple requirement decisions</strong> · Preview the file to inspect each assignment.</Sub> : <Sub><strong>{evidenceReasonLabel(decision.ai_reason_code, decision.ai_decision)}</strong>{decision.ai_explanation ? ` · ${decision.ai_explanation}` : " · Decision explanation not available"}</Sub> : <Sub><strong>{analysisLabel}</strong>{analysisDetail ? ` · ${analysisDetail}` : ""}</Sub>}</div>
            {locked ? <LockedEvidenceBadge presentation={locked} /> : <CellChip tone={decision ? evidenceDecisionTone(decision.ai_decision) : file.analysis_status === "failed" ? "bad" : file.analysis_status === "skipped" ? "warn" : file.analysis_status === "completed" ? "acc" : "mut"}>{decision ? decisionSummaryMixed ? "Mixed decisions" : evidenceDecisionLabel(decision.ai_decision, decision.decision_actor) : analysisLabel}</CellChip>}
            {locked ? <UnlockedCopyRequestControl request={unlockedCopyRequestState} busy={requestingUnlockedCopyFileId === file.id} onRequest={(retryFailed) => requestUnlockedCopy(file.id, file.file_name, retryFailed, false, unlockedCopyRequirement?.requirement_key)} onCopyRoomLink={() => copyUnlockedRoomLink(file.id, file.file_name, unlockedCopyRequirement?.requirement_key)} /> : null}
            <Btn onClick={() => openEvidenceFile(file.id, fileAssignments[0]?.requirement_key)}><Icon name="eye" size={14} />Preview</Btn>
          </article>;
        })}
        {!files.length ? <div className="empty">No evidence files have been uploaded.</div> : null}
      </div>
    </div> : null}

    <Drawer open={formsOpen} fullscreen closeOnBackdrop={false} onClose={() => setFormsOpen(false)} title="Financial forms" sub="Complete the form in this focused workspace. Evidence refreshes after every save." footer={<Btn onClick={() => setFormsOpen(false)}>Close</Btn>}>
      <FinancialFormsPanel profileId={profileId} intakeId={intakeId} nested onChange={() => void refresh()} />
    </Drawer>

    {selectedFile ? <BucketFileReviewPanel
      title="Evidence review"
      files={reviewFiles}
      activeFileId={selectedFile.id}
      onSelectFile={(fileId) => openEvidenceFile(fileId)}
      reviewKey={selectedFile.id}
      loadReview={loadSelectedReview}
      annotationsEnabled={false}
      onClose={() => { setSelectedFileId(null); setSelectedRequirementKey(null); setAction(null); }}
      reviewContext={<>
        <div><b>{currentAssignment?.label || "Supporting / Other"}</b>{assignments.length > 1 ? <Select aria-label="Evidence requirement decision" value={currentAssignment?.requirement_key || ""} onChange={(event) => { setSelectedRequirementKey(event.target.value); setAction(null); }}>{assignments.map((requirement) => { const decision = requirement.evidence_files.find((item) => item.file_id === selectedFile.id); return <option key={requirement.requirement_key} value={requirement.requirement_key}>{requirement.label}{decision ? ` — ${evidenceDecisionLabel(decision.ai_decision, decision.decision_actor)}` : ""}</option>; })}</Select> : null}<Sub>{currentDecision ? `${evidenceActorLabel(currentDecision.decision_actor)}${currentDecision.ai_confidence ? ` · ${currentDecision.ai_confidence} confidence` : ""}${currentDecision.verified ? " · Human verified" : ""}` : `${evidenceAnalysisLabel(selectedFile.analysis_status, selectedFile.analysis_reason_code)} · This file is not assigned to a requirement.`}</Sub></div>
        {selectedLockedEvidence ? <Callout tone="warn" icon={<Icon name="lock" size={16} aria-hidden="true" />}><div className="grid g4"><b>{selectedLockedEvidence.title}</b><span>{selectedLockedEvidence.explanation} AI cannot review its contents.</span><small>This file cannot satisfy {currentAssignment?.label || "an evidence requirement"} until an unlocked replacement is uploaded.</small></div></Callout> : currentDecision ? <Callout tone={evidenceDecisionTone(currentDecision.ai_decision)}><div className="grid g4"><b>{evidenceReasonLabel(currentDecision.ai_reason_code, currentDecision.ai_decision)}</b><span>{currentDecision.ai_explanation || "Decision explanation not available."}</span>{evidenceCoverageLabel(currentDecision.coverage_contribution) ? <small>Coverage: {evidenceCoverageLabel(currentDecision.coverage_contribution)}</small> : null}</div></Callout> : null}
        {!selectedLockedEvidence && !currentDecision ? <Callout tone={selectedFile.analysis_status === "failed" ? "bad" : selectedFile.analysis_status === "skipped" ? "warn" : "mut"}><div className="grid g4"><b>{evidenceAnalysisLabel(selectedFile.analysis_status, selectedFile.analysis_reason_code)}</b><span>{selectedFile.analysis_detail || selectedFile.analysis_summary || "Analysis explanation not available."}</span>{selectedFile.analysis_classification ? <small>Classification: {selectedFile.analysis_classification.replaceAll("_", " ")}{selectedFile.analysis_confidence ? ` · ${selectedFile.analysis_confidence} confidence` : ""}</small> : null}</div></Callout> : null}
      </>}
      lockedFileGuidance={<Sub>AI review can resume after the client uploads an unlocked replacement. The original remains in Evidence for the audit trail.</Sub>}
      lockedFileActions={<UnlockedCopyRequestControl request={selectedUnlockedCopyRequest} busy={requestingUnlockedCopyFileId === selectedFile.id} onRequest={(retryFailed) => requestUnlockedCopy(selectedFile.id, selectedFile.file_name, retryFailed, false, selectedUnlockedCopyRequirement?.requirement_key)} onCopyRoomLink={() => copyUnlockedRoomLink(selectedFile.id, selectedFile.file_name, selectedUnlockedCopyRequirement?.requirement_key)} />}
      headerActions={<>
        {selectedLockedEvidence ? <LockedEvidenceBadge presentation={selectedLockedEvidence} /> : <CellChip tone={evidenceDecisionTone(assignmentAggregate.decision)}>{assignmentSummaryMixed ? "Mixed decisions" : evidenceDecisionLabel(assignmentAggregate.decision, aggregateDecision?.decision_actor)}</CellChip>}
        {assignments.length > 1 ? <CellChip tone="mut">{assignments.length} requirements</CellChip> : null}
        {!selectedLockedEvidence && (currentDecision?.ai_decision === "failed" || (!currentDecision && selectedFile.analysis_status === "failed")) ? <Btn disabled={actionBusy} onClick={() => void retryAnalysis(selectedFile)}><Icon name="refresh" size={14} />Retry AI</Btn> : null}
        {!selectedLockedEvidence && currentDecision && currentDecision.ai_decision !== "accepted" ? <Btn disabled={actionBusy} onClick={() => startAction("override")}>Override AI</Btn> : null}
        <Btn disabled={actionBusy} onClick={() => startAction("reassign")}>{assignments.length ? "Reassign" : "Assign"}</Btn>
        {currentAssignment ? <Btn disabled={actionBusy} onClick={() => startAction("unlink")}>Unlink</Btn> : null}
        {currentAssignment?.verification_required ? <Btn disabled={actionBusy} onClick={() => startAction(currentDecision?.verified ? "unverify" : "verify")}>{currentDecision?.verified ? "Remove verification" : "Human verify"}</Btn> : null}
        {currentAssignment ? <IconBtn className="danger" disabled={actionBusy} aria-label={`Reject evidence ${selectedFile.file_name}`} title="Reject evidence" onClick={() => startAction("reject")}><Icon name="x" size={14} /></IconBtn> : null}
      </>}
    /> : null}

    <Drawer
      open={Boolean(action && selectedFile)}
      onClose={() => { if (!actionBusy) setAction(null); }}
      title={action ? action.kind === "reject" ? "Reject evidence" : action.kind === "override" ? "Override AI decision" : action.kind === "reassign" ? "Assign evidence" : action.kind === "unlink" ? "Unlink evidence" : action.kind === "verify" ? "Human verification" : "Remove human verification" : "Evidence action"}
      sub={selectedFile?.file_name}
      footer={<><Btn onClick={() => setAction(null)} disabled={actionBusy}>Cancel</Btn><Btn variant="pri" disabled={!actionValid || actionBusy} onClick={() => void applyReviewAction()}>{actionBusy ? "Saving..." : "Confirm reviewed action"}</Btn></>}
    >
      {action ? <div className="grid">
        {assignments.length ? <Field label="Current requirement"><Select value={action.requirementKey} onChange={(event) => setAction({ ...action, requirementKey: event.target.value })}>{assignments.map((requirement) => <option key={requirement.requirement_key} value={requirement.requirement_key}>{requirement.label}</option>)}</Select></Field> : null}
        {action.kind === "reassign" ? <Field label="Assign to requirement"><Select value={action.targetKey} onChange={(event) => setAction({ ...action, targetKey: event.target.value })}><option value="">Select a requirement...</option>{requirements.filter((item) => item.requirement_key !== action.requirementKey).map((requirement) => <option key={requirement.requirement_key} value={requirement.requirement_key}>{requirement.label}</option>)}</Select></Field> : null}
        {action.kind === "reject" ? <Field label="Reason"><Select value={action.reasonCode} onChange={(event) => setAction({ ...action, reasonCode: event.target.value })}>{REASON_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field> : null}
        {(action.kind === "reject" || action.kind === "override") ? <Field label="Reviewed explanation"><Textarea rows={4} value={action.reason} onChange={(event) => setAction({ ...action, reason: event.target.value })} placeholder="Required for the immutable audit trail" /></Field> : null}
        <Callout tone={action.kind === "reject" ? "warn" : "mut"}>{action.kind === "unlink" || action.kind === "reassign" ? "The source file stays in its bucket. Only its requirement assignment changes." : action.kind === "reject" || action.kind === "override" ? "The original AI decision remains in immutable history." : "This control appears only because the published requirement requires human verification."}</Callout>
      </div> : null}
    </Drawer>
  </section>;
}
