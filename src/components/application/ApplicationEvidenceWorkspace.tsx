"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApplicationProgramReadiness } from "@/components/application/ApplicationProgramReadiness";
import { BankingPanel } from "@/components/application/ApplicationVerificationWorkspace";
import { FinancialFormsPanel } from "@/components/application/FinancialFormsPanel";
import {
  BucketFileReviewPanel,
  type BucketFileAnnotation,
  type BucketFileReview,
  type BucketReviewFile,
} from "@/components/buckets/BucketFileReviewPanel";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Field, IconBtn, Select, Sub, Textarea, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import type {
  ApplicationEvidenceWorkspace as EvidenceWorkspace,
  ApplicationProgramReadiness as Readiness,
  ApplicationRequirement,
  EvidenceWorkspaceFile,
} from "@/lib/applicationProfile";

type WorkspaceTab = "requirements" | "banking" | "files";
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

function decisionLabel(decision?: string): string {
  if (decision === "accepted") return "Accepted by AI";
  if (decision === "needs_more") return "Needs more";
  if (decision === "rejected") return "Rejected by AI";
  if (decision === "failed") return "Analysis failed";
  if (decision === "processing") return "Processing";
  return "Unassigned evidence";
}

function decisionTone(decision?: string): "ok" | "acc" | "warn" | "bad" | "mut" {
  if (decision === "accepted") return "ok";
  if (decision === "rejected" || decision === "failed") return "bad";
  if (decision === "needs_more") return "warn";
  if (decision === "processing") return "acc";
  return "mut";
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
}) {
  const apiCall = useAuthedApi();
  const queryClient = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const queryKey = useMemo(() => ["application-evidence-workspace", profileId] as const, [profileId]);
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [dragging, setDragging] = useState(false);
  const [formsOpen, setFormsOpen] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [action, setAction] = useState<ReviewAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
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
    if (data) onVerificationChange?.(data.verification);
  }, [data, onVerificationChange]);

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
      await onUploadFiles(files, requestedDocumentId ?? data?.supporting_group?.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Evidence could not be uploaded.");
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
  const files = data?.evidence.files ?? [];
  const selectedFile = files.find((file) => file.id === selectedFileId) ?? null;
  const assignments = useMemo(
    () => selectedFileId
      ? requirements.filter((requirement) => requirement.evidence_files.some((file) => file.file_id === selectedFileId))
      : [],
    [requirements, selectedFileId],
  );
  const currentAssignment = assignments.find((item) => item.requirement_key === action?.requirementKey) ?? assignments[0] ?? null;
  const currentDecision = currentAssignment?.evidence_files.find((file) => file.file_id === selectedFileId) ?? null;
  const reviewFiles: BucketReviewFile[] = files.map((file) => ({
    id: file.id,
    file_name: file.file_name,
    content_type: file.content_type,
    size_bytes: file.size_bytes,
    created_at: file.created_at,
  }));

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

  const startAction = useCallback((kind: ReviewActionKind) => {
    const requirement = assignments[0];
    setAction({
      kind,
      requirementKey: requirement?.requirement_key ?? "",
      targetKey: "",
      reasonCode: kind === "override" ? "ai_override" : "wrong_document",
      reason: "",
    });
  }, [assignments]);

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

  async function loadReview(file: EvidenceWorkspaceFile): Promise<BucketFileReview> {
    return apiCall<BucketFileReview>(`/buckets/admin/${file.bucket_id}/files/${file.id}/review`);
  }

  async function saveAnnotation(
    file: EvidenceWorkspaceFile,
    payload: { page_number: number; x: number; y: number; width: number; height: number; comment: string },
  ): Promise<BucketFileAnnotation> {
    return apiCall<BucketFileAnnotation>(`/buckets/admin/${file.bucket_id}/files/${file.id}/annotations`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

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
      <div><span>Processing</span><b>{data.processing.analyzing_files}</b><small>{data.processing.failed_files ? `${data.processing.failed_files} failed` : `${data.processing.total_files} total files`}</small></div>
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
      files={files.map((file) => ({ id: file.id, file_name: file.file_name, created_at: file.created_at }))}
      value={data.program_readiness}
      onValueChange={updateReadiness}
      onRefresh={refresh}
      showUploader={false}
      onNotice={onNotice}
      onRunAiReview={onRunAiReview}
      aiReviewRunning={aiReviewRunning}
      onUploadFiles={upload}
      uploadBusy={uploadBusy}
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
          const decision = fileAssignments.flatMap((requirement) => requirement.evidence_files).find((item) => item.file_id === file.id);
          return <article key={file.id} className={cx("evidence-workspace-file-row", `decision-${decision?.ai_decision || "unassigned"}`)}>
            <span className="evidence-file-icon"><Icon name="file" size={16} /></span>
            <div className="grow trunc"><b className="trunc">{file.file_name}</b><Sub>{formatSize(file.size_bytes)} · {formatDate(file.created_at)} · {fileAssignments.map((item) => item.label).join(", ") || "Supporting / Other"}</Sub></div>
            <CellChip tone={decisionTone(decision?.ai_decision)}>{decisionLabel(decision?.ai_decision)}</CellChip>
            <Btn onClick={() => setSelectedFileId(file.id)}><Icon name="eye" size={14} />View</Btn>
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
      onSelectFile={setSelectedFileId}
      loadReview={() => loadReview(selectedFile)}
      saveAnnotation={(payload) => saveAnnotation(selectedFile, payload)}
      onClose={() => { setSelectedFileId(null); setAction(null); }}
      headerActions={<>
        <CellChip tone={decisionTone(currentDecision?.ai_decision)}>{assignments.length > 1 ? `${assignments.length} assignments` : decisionLabel(currentDecision?.ai_decision)}</CellChip>
        {currentDecision?.ai_decision === "failed" ? <Btn disabled={actionBusy} onClick={() => void retryAnalysis(selectedFile)}><Icon name="refresh" size={14} />Retry AI</Btn> : null}
        {currentDecision && currentDecision.ai_decision !== "accepted" ? <Btn disabled={actionBusy} onClick={() => startAction("override")}>Override AI</Btn> : null}
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
