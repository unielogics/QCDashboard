"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { FileSection, useSectionState } from "./FileSection";
import Link from "next/link";
import { Card, useToast, Toast } from "@/components/design-system/primitives";
import { Btn, Callout, CellChip, cx, Field, IconBtn, Input, Lbl, Linky, Panel, Row, Seg, Select, StatusLine, Textarea, WarnLine } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { ActionIcon } from "@/components/ds/ActionIcon";
import { PageActionMenu } from "@/components/ds/PageActionMenu";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { Icon } from "@/components/design-system/Icon";
import { PreparationProgress } from "@/components/design-system/PreparationProgress";
import { writePreparationPreview } from "@/lib/preparationPreview";
import { FileTeamStrip } from "@/components/file/FileTeamStrip";
import { FileTimeline } from "@/components/file/FileTimeline";
import { MerchantOfferStrip } from "@/components/admin/MerchantOfferStrip";
import { DealerTermSheetDocumentActions } from "@/components/admin/DealerTermSheetDocumentActions";
import { api } from "@/lib/api";
import { isStaleRequestedDocumentError } from "@/lib/clientRoomDocuments";
import { assertPdfUploadUnlocked, documentUploadErrorMessage, isPasswordProtectedPdfUploadError, passwordProtectedPdfUploadNotice } from "@/lib/documentUpload";
import { Role } from "@/lib/enums.generated";
import { MarketplacePublishStrip } from "@/components/marketplace/MarketplacePublishStrip";
import { marketplacePublicationLabel, type MarketplacePublicationState } from "@/lib/marketplacePublication";
import { useCurrentUser, useBookingLink, useDriveFiles, type DriveFile, useClientTermsSummary, useIntakeCommunicationUnread } from "@/hooks/useApi";
import { LeadCockpit, type LeadCockpitAdapter, type ClientThreadMessage, type ClientThreadResponse } from "@/components/admin/LeadCockpit";
import { LeadCreditPanel } from "@/components/admin/LeadCreditPanel";
import { LeadContractsPanel } from "@/components/admin/LeadContractsPanel";
import { LeadProgramFitPanel } from "@/components/admin/LeadProgramFitPanel";
import { LeadDscrPanel } from "@/components/admin/LeadDscrPanel";
import { BankerSubmissionModal } from "@/components/admin/BankerSubmissionModal";
import { IntakeNotificationRoutingDrawer } from "@/components/admin/IntakeNotificationRoutingDrawer";
import { ApplicationVerificationWorkspace } from "@/components/application/ApplicationVerificationWorkspace";
import { ApplicationEvidenceWorkspace } from "@/components/application/ApplicationEvidenceWorkspace";
import { ApplicationClassificationPanel } from "@/components/application/ApplicationClassificationPanel";
import { ApplicationIntelligencePanel } from "@/components/application/ApplicationIntelligencePanel";
import { CapitalReadinessPanel } from "@/components/application/CapitalReadinessPanel";
import { ExtractedFactsReview } from "@/components/application/ExtractedFactsReview";
import { ApplicationAuditTimeline } from "@/components/application/ApplicationAuditTimeline";
import { ProductionPackageTab } from "@/components/admin/ProductionPackageTab";
import { ApplicationMissingItemCommunications } from "@/components/application/ApplicationMissingItemCommunications";
import { ApplicationClientTermsPanel } from "@/components/application/ApplicationClientTermsPanel";
import { FundingRequestControl } from "@/components/application/FundingRequestControl";
import { UnderwritingFlow, type TermsOnFile } from "@/components/file/UnderwritingFlow";
import { FinancingProposalSummary } from "@/components/file/FinancingProposalSummary";
import type { WorkingFinancing } from "@/lib/workingFinancing";
import { UnifiedThreadConversation } from "@/components/communications/UnifiedThreadConversation";
import { AIIntakeClientConversation, AIIntakeEmailWorkspace } from "@/components/communications/AIIntakeClientCommunications";
import { CommunicationUnreadBadge, CommunicationUnreadBar } from "@/components/communications/CommunicationUnreadBadge";
import { EmailContact, PhoneContact } from "@/components/file/ContactActions";
import { BusinessContactDetails, BusinessContactFields, businessContactChanges, businessContactDraft } from "@/components/file/BusinessContactDetails";
import { OfferDeliveryComposer, type OfferDeliveryReceipt, type OfferSelection } from "@/components/communications/OfferDeliveryComposer";
import { OfferDeliveryHistory } from "@/components/communications/OfferDeliveryHistory";
import { LeadNotesPanel } from "@/components/broker/LeadNotesPanel";
import { BucketWorkspaceOverlay } from "@/components/buckets/BucketWorkspaceOverlay";
import { PipelineApprovalFields } from "@/components/operator/PipelineApprovalFields";
import { PaymentsWorkspace } from "@/components/payments/PaymentsWorkspace";
import { FinancialCockpit } from "@/components/file/cockpit/FinancialCockpit";
import { FundingPackageWorkspace, type FundingPackageTab, type PackagePreparation } from "./FundingPackageWorkspace";
import { InvestorPackageDetails, InvestorReportReferenceButton } from "./InvestorPackageDetails";
import type { FinancialCockpit as FinancialCockpitData } from "@/lib/financialCockpit";
import type { IntakeResponse } from "@/lib/intake";
import { leadCockpitNonDocumentMissingRows, leadCockpitOutstandingDocuments, preferredIntakeReviewResult } from "@/lib/leadCockpitDocuments";
import { mcaRefinanceReviewState } from "@/lib/mcaRefinanceReview";
import { PIPELINE_LIFECYCLE, underwritingStatusLabel, type PipelineMoveRequest, type UnderwritingLifecycleStatus } from "@/lib/unifiedOperator";
import type { ApplicationProfile, ApplicationProgramReadiness, ApplicationTermSheetState, ApplicationUnderwritingPatch, ApplicationUnderwritingState, FileOwnerRequirementState } from "@/lib/applicationProfile";
import { pipelineApprovalDraft, validatePipelineApprovalDraft, type PipelineApprovalDraft } from "@/lib/pipelineApproval";
import { compactMissingItems, intelligenceActionDestination, reviewDestination, type ReviewDestination } from "@/lib/reviewNavigation";
import { creditStepProgress } from "@/lib/creditStepSync";
import { calculateDealEarnings } from "@/lib/dealEconomics";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { Artifact, BucketAccessMode, DriveIngestResult, LeadContactUpdate, LeadDetail, LeadDetailView, PRODUCTION_CADENCE_LABELS, PRODUCTION_REPAYMENT_LABELS, PackageReadinessGeneration, PackageGenerationOptions, RoomRequestResult, UnderwritingDraft, VendorEmailPreview, VendorEmailSendPayload, VendorEmailSendResult, apiErrorMessage, arrayOfRecords, arrayOfStrings, artifactBucketFileId, artifactList, artifactSha, artifactVersion, asRecord, emptyUnderwritingDraft, formatDateTime, formatMoney, formatSize, intakeStatusPresentation, isSourceEvidenceFile, numberOrNull, probabilityTone, productionTermLabel, programVerticalForVariant, underwritingDraftFromState, variantLabel } from "./leadFile";

export function Stat({
  title,
  value,
  sub,
  tone = "neutral",
}: {
  title: string;
  value: string;
  sub: string;
  tone?: "neutral" | "accent" | "good" | "warn";
}) {
  const toneColor = tone === "accent" ? "var(--accent)" : tone === "good" ? "var(--ok)" : tone === "warn" ? "var(--warn)" : "var(--line)";
  return (
    <div
      className="kpi ai-intake-stat"
      data-tone={tone}
      style={{ minHeight: 104, padding: "16px 18px", borderLeft: `4px solid ${toneColor}` }}
    >
      <div className="lbl">{title}</div>
      <div className="knum num" style={tone === "neutral" ? undefined : { color: toneColor }}>{value}</div>
      <div className="sub" style={{ marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// `t` and `style` are still accepted (and ignored) so existing call sites keep
// compiling; the button is now the shared `.btn.sm.iconbtn`.

// `t` and `style` are still accepted (and ignored) so existing call sites keep
// compiling; the button is now the shared `.btn.sm.iconbtn`.
export function CopyIconButton({ onCopy, disabled, style }: { t?: unknown; onCopy: () => void; disabled?: boolean; style?: CSSProperties }) {
  return (
    <IconBtn
      onClick={onCopy}
      disabled={disabled}
      title="Copy"
      aria-label="Copy"
      style={style}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </svg>
    </IconBtn>
  );
}

export function Spinner() {
  return (
    <span
      style={{
        width: 13,
        height: 13,
        borderRadius: 999,
        border: "2px solid currentColor",
        borderTopColor: "transparent",
        display: "inline-block",
        verticalAlign: "-2px",
        marginRight: 6,
        animation: "qc-spin 0.7s linear infinite",
      }}
    >
      <style>{"@keyframes qc-spin{to{transform:rotate(360deg)}}"}</style>
    </span>
  );
}

export function InfoBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <Panel title={title}>{children}</Panel>;
}

/** The website box as the desk edits it: the address, or N/A when the client said they have none. */
function businessWebsiteDraft(intake: { business_website?: string | null; business_website_none?: boolean } | null | undefined): string {
  if (!intake) return "";
  return intake.business_website || (intake.business_website_none ? "N/A" : "");
}

export function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span className="sub">{label}</span>
      <b style={{ overflowWrap: "anywhere" }}>{value}</b>
    </div>
  );
}

export function CompactList({ rows, empty }: { rows: Array<{ title: string; body: string }>; empty: string }) {
  if (!rows.length) return <div className="sub">{empty}</div>;
  return (
    <div className="grid g8">
      {rows.slice(0, 10).map((row, index) => (
        <div key={`${row.title}-${index}`} className="grid g4">
          <strong>{row.title}</strong>
          <span className="sub">{row.body}</span>
        </div>
      ))}
    </div>
  );
}

// The lead list is a grid of <button> rows rather than a <table>: each row has
// to stay focusable and Enter-activatable, which a <tr onClick> is not. The
// column track is bespoke, so it stays an inline value.
// minmax(0,…) on the text columns so they shrink + ellipsize instead of forcing
// horizontal overflow when the sidebar is expanded / on smaller screens (a
// fixed floor here clipped the name column).

export function PackageArtifactCard({ artifact, label, description, version, current, bucketSynced }: { artifact: Artifact; label: string; description: string; version: number; current: boolean; bucketSynced: boolean }) {
  const sha = artifactSha(artifact);
  const previewUrl = artifact.preview_url || artifact.download_url;
  return <article className="package-document-card">
    <div className="package-document-icon"><Icon name="docCheck" size={20} /></div>
    <div className="package-document-copy"><div><span className="lbl">{label}</span><CellChip tone={current ? "ok" : "mut"}>{current ? "Current" : "Superseded"}</CellChip></div><strong>{artifact.title}</strong><p>{description}</p><small>v{version} · {formatDateTime(artifact.created_at)} · {bucketSynced ? "Synced to room" : "Legacy artifact"}{sha ? ` · ${sha.slice(0, 10)}…` : ""}</small></div>
    <div className="package-document-actions">{previewUrl ? <><a href={previewUrl} target="_blank" rel="noreferrer" className="btn sm"><Icon name="eye" size={14} />Preview</a>{artifact.download_url ? <a href={artifact.download_url} target="_blank" rel="noreferrer" className="btn sm iconbtn" title={`Download ${label}`} aria-label={`Download ${label}`}><Icon name="download" size={14} /></a> : null}</> : <CellChip tone="warn">PDF unavailable</CellChip>}</div>
  </article>;
}

export function PackageVersionList({ label, artifacts, renderReferences }: { label: string; artifacts: Artifact[]; renderReferences?: (artifact: Artifact) => ReactNode }) {
  return <section className="package-version-list"><header><span className="lbl">{label}</span><strong>{artifacts.length ? `${artifacts.length} version${artifacts.length === 1 ? "" : "s"}` : "Not generated"}</strong></header>{artifacts.length ? artifacts.map((artifact, index) => {
    const version = artifactVersion(artifact, artifacts.length - index);
    const previewUrl = artifact.preview_url || artifact.download_url;
    const current = index === 0 && artifact.status !== "superseded";
    return <div className="package-version-row" key={artifact.id}><div><CellChip tone={current ? "ok" : "mut"}>{current ? "Current" : "Superseded"}</CellChip><span><strong>Version {version}</strong><small>{formatDateTime(artifact.created_at)}{artifactBucketFileId(artifact) ? " · Room PDF" : " · Legacy artifact"}</small></span></div><div>{renderReferences?.(artifact)}{previewUrl ? <a href={previewUrl} target="_blank" rel="noreferrer" className="btn sm iconbtn" title={`Preview ${label} version ${version}`} aria-label={`Preview ${label} version ${version}`}><Icon name="eye" size={14} /></a> : null}</div></div>;
  }) : <div className="empty">No PDF versions yet.</div>}</section>;
}

export function UnderwriterDigest({ artifact }: { artifact: Artifact }) {
  const body = asRecord(artifact.body_json) || {};
  const rawMetrics = body.key_metrics;
  const metrics = Array.isArray(rawMetrics)
    ? rawMetrics.map((item) => {
      const row = asRecord(item);
      return row ? { label: String(row.label || "Metric"), value: String(row.value || "—"), note: String(row.note || "") } : null;
    }).filter((item): item is { label: string; value: string; note: string } => Boolean(item))
    : Object.entries(asRecord(rawMetrics) || {}).map(([label, value]) => ({ label: label.replaceAll("_", " "), value: String(value || "—"), note: "" }));
  const risks = artifactList(artifact, "risks").slice(0, 4);
  const mitigants = artifactList(artifact, "mitigants").slice(0, 4);
  const nextAction = typeof body.next_best_action === "string" ? body.next_best_action : null;
  if (!metrics.length && !risks.length && !mitigants.length && !nextAction) return null;
  return <section className="underwriter-digest"><header><div><span className="lbl">Decision view</span><h3>Underwriter highlights</h3></div><span className="sub">The full narrative and schedules remain in the PDFs.</span></header>{metrics.length ? <div className="underwriter-metrics">{metrics.slice(0, 6).map((metric, index) => <div key={`${metric.label}:${index}`}><span>{metric.label}</span><strong>{metric.value}</strong>{metric.note ? <small>{metric.note}</small> : null}</div>)}</div> : null}<div className="underwriter-watch-grid">{mitigants.length ? <div><span className="lbl">Strengths / mitigants</span><ul>{mitigants.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}{risks.length ? <div><span className="lbl">Risks / watchpoints</span><ul>{risks.map((item) => <li key={item}>{item}</li>)}</ul></div> : null}</div>{nextAction ? <div className="underwriter-next-action"><Icon name="arrowR" size={15} /><span><small>Next best action</small><strong>{nextAction}</strong></span></div> : null}</section>;
}

export function DriveFilePicker({
  open,
  onClose,
  selectedIds,
  onPick,
  onUnpick,
  mode = "attach",
  busy = false,
  maxSelect,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  selectedIds: string[];
  onPick: (file: DriveFile) => void;
  onUnpick: (id: string) => void;
  mode?: "attach" | "ingest";
  busy?: boolean;
  maxSelect?: number;
  onConfirm?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  // Only fetch once the picker is open; hitting /google/drive/files when the
  // operator hasn't connected Drive returns [] (best-effort), so no error state.
  const { data, isLoading, isError, refetch, isFetching } = useDriveFiles(submitted || undefined, open);
  const files = data?.files ?? [];
  const ingest = mode === "ingest";

  function fmtSize(size?: string | null): string {
    const n = size ? Number(size) : NaN;
    if (!Number.isFinite(n) || n <= 0) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={ingest ? "Add from Google Drive" : "Attach from Google Drive"}
      bodyClass="grid g10"
      footer={
        ingest ? (
          <>
            <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
            <span className="sp" />
            <Btn variant="pri" onClick={() => onConfirm?.()} disabled={busy || selectedIds.length === 0}>
              {busy ? <><Spinner /> Importing…</> : `Import & analyze${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
            </Btn>
          </>
        ) : (
          <>
            <span className="sp" />
            <Btn variant="pri" onClick={onClose}>Done{selectedIds.length ? ` (${selectedIds.length})` : ""}</Btn>
          </>
        )
      }
    >
      <Row>
        <Input
          grow
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setSubmitted(query.trim()); }}
          placeholder="Search your Drive files by name…"
          aria-label="Search your Drive files by name"
        />
        <Btn onClick={() => setSubmitted(query.trim())}>Search</Btn>
      </Row>
      <span className="sub">
        {ingest
          ? "Only files you open or create with Qualified Commercial are visible here (Drive “file” scope). Selected files are imported into this file’s document set and analyzed by the AI. Files over 25 MB are skipped."
          : "Only files you open or create with Qualified Commercial are visible here (Drive “file” scope). Files over 8 MB, or a combined attachment set over ~18 MB, are shared via the secure bucket instead of attached."}
      </span>
      {isLoading || isFetching ? (
        <div className="row sub">
          <Spinner /> Loading Drive files…
        </div>
      ) : isError ? (
        <div className="grid g8">
          <span className="sub">Couldn’t reach Google Drive. Make sure your Google account is connected in Settings → Connections.</span>
          <div><Btn onClick={() => refetch()}>Retry</Btn></div>
        </div>
      ) : files.length === 0 ? (
        <span className="sub">
          {submitted ? "No matching Drive files." : "No Drive files found. Connect Google Drive in Settings → Connections, or search by name."}
        </span>
      ) : (
        <div className="picklist">
          {files.map((f) => {
            const picked = selectedIds.includes(f.id);
            const atCap = maxSelect !== undefined && !picked && selectedIds.length >= maxSelect;
            return (
              <button
                key={f.id}
                type="button"
                className={cx("pick", picked && "on")}
                disabled={atCap}
                title={atCap ? `Up to ${maxSelect} files per import` : undefined}
                onClick={() => (picked ? onUnpick(f.id) : onPick(f))}
                style={{ textAlign: "left", opacity: atCap ? 0.5 : 1, cursor: atCap ? "not-allowed" : undefined }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="sub">{fmtSize(f.size)}</span>
                <CellChip tone={picked ? "acc" : "mut"}>{picked ? "Added" : "Add"}</CellChip>
              </button>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

export function ClientConversation({ adapter, clientName }: { adapter: LeadCockpitAdapter; clientName?: string | null }) {
  const [messages, setMessages] = useState<ClientThreadMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [resuming, setResuming] = useState(false);

  const adopt = useCallback((r: ClientThreadResponse) => {
    setMessages(r.messages || []);
    setPausedUntil(r.ai_paused_until ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    adapter
      .loadClientThread()
      .then((r) => { if (alive) adopt(r); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Could not load the client conversation."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [adapter, adopt]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      adopt(await adapter.replyClientThread(text));
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reply failed.");
    } finally {
      setSending(false);
    }
  }

  async function resumeAI() {
    if (!adapter.resumeClientThreadAI || resuming) return;
    setResuming(true);
    setError("");
    try {
      adopt(await adapter.resumeClientThreadAI());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not hand the conversation back.");
    } finally {
      setResuming(false);
    }
  }

  // Minutes left in the takeover window, for the banner.
  const pauseMinutes = pausedUntil
    ? Math.max(0, Math.ceil((new Date(pausedUntil).getTime() - Date.now()) / 60000))
    : 0;

  return (
    <div className="grid g10" style={{ alignContent: "start" }}>
      <WarnLine>
        This is the <strong>client-facing</strong> conversation{clientName ? ` with ${clientName}` : ""}. Anything you send here is visible to the client and is attributed to you as their underwriter. Private operator and partner messages stay in the Rep channel tab.
      </WarnLine>

      {pausedUntil ? (
        <StatusLine tone="warn">
          You have the conversation. The AI is not replying to {clientName || "the client"} here, and picks
          it back up in about {pauseMinutes} {pauseMinutes === 1 ? "minute" : "minutes"} unless you send again.
          {adapter.resumeClientThreadAI ? (
            <>
              {" "}
              <Btn size="sm" onClick={resumeAI} disabled={resuming}>
                {resuming ? "Handing back…" : "Hand back to the AI now"}
              </Btn>
            </>
          ) : null}
        </StatusLine>
      ) : null}

      <div className="card">
        <div className="thr">
          {loading ? (
            <span className="thr-empty">Loading client conversation…</span>
          ) : messages.length === 0 ? (
            <span className="thr-empty">No messages in the client conversation yet.</span>
          ) : (
            messages.map((m) => {
              const isAI = m.role === "assistant";
              // sender_kind is the marker; the name check only covers rows written
              // before it existed, and a borrower named "Underwriter" would fool it.
              const isClient = !isAI && (m.sender_kind
                ? m.sender_kind === "client"
                : !(m.author_name || "").toLowerCase().startsWith("underwriter"));
              const label = isAI ? "AI" : m.author_name || (isClient ? clientName || "Client" : "You");
              return (
                <div key={m.id} className={cx("msg", isAI ? "ai" : isClient ? "client-ch" : "mine")}>
                  <div className="msg-h"><span className="msg-who">{label}</span></div>
                  <div className="msg-b">{m.content}</div>
                </div>
              );
            })
          )}

        </div>

        {error ? <StatusLine tone="bad" className="mt">{error}</StatusLine> : null}

        <div className="composer">
          <Lbl>Reply on behalf (as underwriter)</Lbl>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Answer the client here. Enter to send, Shift+Enter for a new line."
            aria-label="Reply on behalf (as underwriter)"
          />
          <div className="composer-row">
            <Btn variant="pri" onClick={send} disabled={sending || !draft.trim()}>
              {sending ? <><Spinner /> Sending…</> : "Send to client"}
            </Btn>
            <span className="hint">Visible to the client · attributed to you · the AI does not reply to this</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfirmDeleteLeadModal({
  open,
  onClose,
  expectedName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  expectedName: string;
  onConfirm: (confirmName: string) => Promise<void>;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [confirmationName, setConfirmationName] = useState("");
  const normalizedExpectedName = expectedName.trim().split(/\s+/).join(" ").toLocaleLowerCase();
  const confirmationMatches = confirmationName.trim().split(/\s+/).join(" ").toLocaleLowerCase() === normalizedExpectedName;

  useEffect(() => {
    if (open) setConfirmationName("");
  }, [open, expectedName]);

  async function handleConfirm() {
    if (busy || !confirmationMatches) return;
    setBusy(true);
    try {
      await onConfirm(confirmationName);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not archive this AI Intake file.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title="Archive file"
      sub="Remove it from active work without deleting documents or history"
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" disabled={busy || !confirmationMatches} onClick={handleConfirm}>
            {busy ? <><Spinner /> Archiving…</> : "Archive file"}
          </Btn>
        </>
      }
    >
      <div className="grid">
        <div className="warnline"><strong>{expectedName}</strong> will leave the active workspace. Uploaded documents, generated artifacts, conversations, and history remain retained and can be restored.</div>
        <Callout tone="acc" icon={<Icon name="vault" size={15} />}>
          Protected payment agreements and ACH authorization records keep their protected-until date or legal hold after this file is archived.
        </Callout>
        <Field label={`Type “${expectedName}” to confirm`} req>
          <Input
            autoFocus
            value={confirmationName}
            onChange={(event) => setConfirmationName(event.target.value)}
            autoComplete="off"
            aria-describedby="delete-confirmation-help"
            style={{ minHeight: 44 }}
          />
        </Field>
        <span id="delete-confirmation-help" className="sub">The name is verified again by the server to prevent archiving the wrong file.</span>
        <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
        <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
        <div className="kv"><span>Reversible</span><b>Yes — use the Archived filter and Restore</b></div>
      </div>
    </Drawer>
  );
}

export function LeadDetailPanel({
  detail,
  loading,
  initialNotesOpen = false,
  initialView = "workspace",
  initialActiveTab = "conversation",
  initialWorkspaceSection = "overview",
  initialCommunicationChannel = "underwriter",
  initialEmailThreadId,
  onCommunicationNavigate,
  onEmailThreadNavigate,
  initialSubmissionStep,
  initialEvidenceTab = "requirements",
  canGovern,
  canDelete,
  onClose,
  onMinimize,
  onExport,
  onGenerateSummary,
  onGeneratePacket,
  onGeneratePackage,
  onGeneratePrequalification,
  onPreviewEmail,
  onSendEmail,
  onIngestFromDrive,
  onRerun,
  rerunning,
  cockpitResponse,
  cockpitAdapter,
  onCockpitResponse,
  onDownloadZip,
  onLinkBucketIntake,
  onPostNote,
  onUpdateOutcomeStatus,
  onUpdateLanguage,
  onUpdateContact,
  onFundingRequestSaved,
  onCancelDeletionRequest,
  onConfirmDeletion,
}: {
  detail: LeadDetail | null;
  loading: boolean;
  initialNotesOpen?: boolean;
  initialView?: LeadDetailView;
  /** Which top-level tab opens first; the File page opens the workspace, the list the conversation. */
  initialActiveTab?: "conversation" | "workspace";
  /** Which workspace section opens first, so a rail item lands on its part of the file. */
  initialWorkspaceSection?: "overview" | "documents" | "client" | "credit" | "contracts" | "package";
  initialCommunicationChannel?: "updates" | "underwriter" | "client" | "email" | "partner" | "internal";
  initialEmailThreadId?: string | null;
  onCommunicationNavigate?: (channel: "updates" | "underwriter" | "client" | "email" | "partner" | "internal") => void;
  onEmailThreadNavigate?: (threadId: string) => void;
  initialSubmissionStep?: number;
  initialEvidenceTab?: "requirements" | "banking";
  canGovern: boolean;
  // Delete is the desk's — super admin and underwriting — and nobody else's.
  canDelete: boolean;
  onClose: () => void;
  /** Absent when the panel is the page: there is nothing to minimise into. */
  onMinimize?: () => void;
  onExport: () => Promise<void> | void;
  onGenerateSummary: () => Promise<void> | void;
  onGeneratePacket: () => Promise<void> | void;
  onGeneratePackage: (options?: PackageGenerationOptions) => Promise<PackageReadinessGeneration>;
  onGeneratePrequalification: () => Promise<void> | void;
  onPreviewEmail: (payload: { to_emails: string[]; cc_emails: string[]; subject?: string; body?: string; include_lender_packet?: boolean }) => Promise<VendorEmailPreview>;
  onSendEmail: (payload: VendorEmailSendPayload) => Promise<VendorEmailSendResult>;
  onIngestFromDrive: (driveFileIds: string[]) => Promise<DriveIngestResult>;
  onRerun: () => void;
  rerunning: boolean;
  cockpitResponse: IntakeResponse | null;
  cockpitAdapter: LeadCockpitAdapter | null;
  onCockpitResponse: (r: IntakeResponse) => void;
  onDownloadZip: () => Promise<void>;
  onLinkBucketIntake: () => void;
  onPostNote: (content: string, imageIds: string[]) => Promise<void>;
  onUpdateOutcomeStatus: (status: string) => Promise<void>;
  onUpdateLanguage: (language: string) => Promise<void>;
  onUpdateContact: (payload: LeadContactUpdate) => Promise<void>;
  onFundingRequestSaved?: () => Promise<unknown> | void;
  onCancelDeletionRequest: () => Promise<void>;
  onConfirmDeletion: (confirmName: string) => Promise<void>;
}) {
  const toast = useToast();
  const { getToken } = useConsoleAuth();
  const bookingLink = useBookingLink();
  const { data: currentUser } = useCurrentUser();
  const canUnderwrite = currentUser?.role === Role.SUPER_ADMIN || currentUser?.role === Role.LOAN_EXEC;
  const communicationUnread = useIntakeCommunicationUnread(detail?.intake.id, { enabled: canUnderwrite });
  const smsUnread = communicationUnread.data?.sms ?? 0;
  const emailUnread = communicationUnread.data?.email ?? 0;
  const canViewPayments = Boolean(
    currentUser &&
      (currentUser.role === Role.SUPER_ADMIN ||
        currentUser.role === Role.LOAN_EXEC ||
        currentUser.role === Role.FIELD_REP ||
        currentUser.role === Role.BROKER),
  );
  const [activeTab, setActiveTab] = useState<"conversation" | "workspace">(initialActiveTab);
  const [workspaceSub, setWorkspaceSub] = useState<"overview" | "documents" | "client" | "credit" | "contracts" | "package">(initialWorkspaceSection);
  const [openBucketId, setOpenBucketId] = useState<string | null>(null);
  useEffect(() => setOpenBucketId(null), [detail?.intake.id, detail?.intake.bucket_id]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState("");
  const [zipBusy, setZipBusy] = useState(false);
  const [bankerModalOpen, setBankerModalOpen] = useState(false);
  const [notesPosting, setNotesPosting] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [notesOpen, setNotesOpen] = useState(initialNotesOpen);
  const [outcomeBusy, setOutcomeBusy] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);
  // Real send (via the operator's connected Gmail) — recipients, Drive picker,
  // and selected Drive files to attach.
  const [toEmails, setToEmails] = useState("");
  const [ccEmails, setCcEmails] = useState("");
  const [driveFiles, setDriveFiles] = useState<DriveFile[]>([]);
  const [drivePickerOpen, setDrivePickerOpen] = useState(false);
  // Attachment toggles + how the recipient reaches the secure bucket.
  const [attachPacket, setAttachPacket] = useState(true);
  const [attachSummary, setAttachSummary] = useState(false);
  const [attachZip, setAttachZip] = useState(false);
  const [bucketAccess, setBucketAccess] = useState<BucketAccessMode>("login");
  // Separate picker for ingesting Drive files INTO the bucket for AI analysis
  // (distinct from the email-attach picker above).
  const [ingestPickerOpen, setIngestPickerOpen] = useState(false);
  const [ingestFiles, setIngestFiles] = useState<DriveFile[]>([]);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [prototypeView, setPrototypeView] = useState<LeadDetailView>(initialView);
  // Which Underwriting sections this viewer keeps open; the defaults open the step that needs attention.
  const uwSections = useSectionState("qc:file:underwriting-sections");
  const [productionShareOpen, setProductionShareOpen] = useState(false);
  // "Record loan terms": the term-sheet drawer lives in the Production tab; the
  // Underwriting tab and the page-action menu ask for it through this flag.
  const [productionTermSheetOpen, setProductionTermSheetOpen] = useState(false);
  // The current term sheet on the profile (dealer files only) for the
  // Underwriting strip. Recorded through the drawer, read here.
  const [termSheet, setTermSheet] = useState<ApplicationTermSheetState | null>(null);
  const [communicationChannel, setCommunicationChannel] = useState<"updates" | "underwriter" | "client" | "email" | "partner" | "internal">(initialCommunicationChannel);
  function navigateCommunication(channel: typeof communicationChannel) {
    setPrototypeView("communications");
    setCommunicationChannel(channel);
    onCommunicationNavigate?.(channel);
  }
  useEffect(() => {
    if (initialView === "communications") { setPrototypeView("communications"); setCommunicationChannel(initialCommunicationChannel); }
  }, [initialCommunicationChannel, initialView]);
  const [submissionStep, setSubmissionStep] = useState(initialSubmissionStep === 3 ? 1 : initialSubmissionStep ?? 1);
  const [evidenceTab, setEvidenceTab] = useState<"requirements" | "banking" | "files">(initialEvidenceTab);
  const [evidenceFocus, setEvidenceFocus] = useState<{ query: string; requestId: number } | null>(null);
  // "Publish to marketplace" in the action menu lands on the Financials tab's
  // capital-partners panel, which reads readiness before cutting a listing.
  const [cockpitFocus, setCockpitFocus] = useState<"marketplace" | null>(null);
  const [contextRailOpen, setContextRailOpen] = useState(false);
  const [packageTab, setPackageTab] = useState<FundingPackageTab>("summary");
  const [packageError, setPackageError] = useState<string | null>(null);
  const [packagePreparation, setPackagePreparation] = useState<PackagePreparation | null>(null);
  const [artifactPreparation, setArtifactPreparation] = useState<PackagePreparation | null>(null);
  const [artifactOperation, setArtifactOperation] = useState<string | null>(null);
  const packageRequestRef = useRef(0);
  const artifactRequestRef = useRef(0);
  useEffect(() => {
    packageRequestRef.current += 1;
    artifactRequestRef.current += 1;
    setPackagePreparation(null); setArtifactPreparation(null); setArtifactOperation(null); setPackageError(null);
    setZipBusy(false); setBusy("");
  }, [detail?.intake.id]);
  const headerUploadRef = useRef<HTMLInputElement>(null);
  const initializedLeadIdRef = useRef<string | null>(null);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("");
  const [profileVerification, setProfileVerification] = useState<FileOwnerRequirementState | null>(null);
  const [underwriting, setUnderwriting] = useState<ApplicationUnderwritingState | null>(null);
  // The file behind this lead. The team strip and the Updates channel hang
  // off it, so it is hoisted from the first successful resolve rather than
  // read from `underwriting`, which only fills once the Underwriting tab has
  // been visited and its state has loaded.
  const [profileId, setProfileId] = useState<string | null>(null);
  const [workingFinancing, setWorkingFinancing] = useState<WorkingFinancing | null>(null);
  const [marketplacePublication, setMarketplacePublication] = useState<MarketplacePublicationState | null>(null);
  const [financingTermsRequest, setFinancingTermsRequest] = useState<{ profileId: string; sequence: number } | null>(null);
  const [financingCoverageRequest, setFinancingCoverageRequest] = useState<{ profileId: string; sequence: number } | null>(null);
  const currentFinancing = workingFinancing?.profileId === profileId ? workingFinancing : null;
  useEffect(() => { setFinancingTermsRequest(null); setFinancingCoverageRequest(null); }, [profileId]);
  const requestSharedTerms = () => {
    if (isDealerFile) { openTermSheet(); return; }
    if (profileId) setFinancingTermsRequest((previous) => ({ profileId, sequence: previous?.profileId === profileId ? previous.sequence + 1 : 1 }));
  };
  const requestSharedCoverage = () => { if (profileId) setFinancingCoverageRequest((previous) => ({ profileId, sequence: previous?.profileId === profileId ? previous.sequence + 1 : 1 })); };
  const communicationProfileId = underwriting?.profile_id ?? profileId;
  const [programReadiness, setProgramReadiness] = useState<ApplicationProgramReadiness | null>(null);
  const [underwritingDraft, setUnderwritingDraft] = useState<UnderwritingDraft>(() => emptyUnderwritingDraft());
  const [underwritingLoading, setUnderwritingLoading] = useState(false);
  const [underwritingSaving, setUnderwritingSaving] = useState(false);
  const [underwritingError, setUnderwritingError] = useState<string | null>(null);
  const [pendingApprovalPatch, setPendingApprovalPatch] = useState<ApplicationUnderwritingPatch | null>(null);
  const [approvalDraft, setApprovalDraft] = useState<PipelineApprovalDraft>(() => pipelineApprovalDraft());
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const [merchantOfferStatus, setMerchantOfferStatus] = useState<string | null>(null);
  const [merchantOfferSelection, setMerchantOfferSelection] = useState<OfferSelection | null>(null);
  const [applicationTermSelection, setApplicationTermSelection] = useState<OfferSelection | null>(null);
  const [selectedOfferKeys, setSelectedOfferKeys] = useState<string[]>([]);
  const [offerComposerOpen, setOfferComposerOpen] = useState(false);
  const [offerDeliveryReceipt, setOfferDeliveryReceipt] = useState<OfferDeliveryReceipt | null>(null);
  const [sendReviewOpen, setSendReviewOpen] = useState(false);
  const [notificationRoutingOpen, setNotificationRoutingOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestResult, setRequestResult] = useState<RoomRequestResult | null>(null);
  const [rotatePinOpen, setRotatePinOpen] = useState(false);
  const [rotatePinSaving, setRotatePinSaving] = useState(false);
  const [rotatePinDone, setRotatePinDone] = useState(false);
  const [rotatePin, setRotatePin] = useState("");
  const [rotatePinConfirm, setRotatePinConfirm] = useState("");
  const [requestDraft, setRequestDraft] = useState({
    name: "",
    category: "Business documents",
    description: "",
    allow_multiple_files: false,
    recipient_email: "",
    recipient_phone: "",
    email_room_link: true,
    sms_reminder: false,
  });
  const [contactEditOpen, setContactEditOpen] = useState(false);
  // Text or email the client without leaving the page: the Contact card opens the
  // same conversation and email workspace the Communications tab shows, in a popup.
  const [contactPopup, setContactPopup] = useState<"text" | "email" | null>(null);
  const [contactSaving, setContactSaving] = useState(false);
  const [contactDraft, setContactDraft] = useState({
    ...businessContactDraft({}),
    full_name: "",
    business_name: "",
    email: "",
    phone: "",
    loan_purpose: "",
    estimated_credit_score: "",
    referral_source: "",
    years_in_business: "",
    business_website: "",
    business_description: "",
  });
  const mcaReview = mcaRefinanceReviewState(detail);
  const mcaAutoReviewBlocked = Boolean(mcaReview && mcaReview.mode !== "automated_review");
  const result = detail ? preferredIntakeReviewResult(detail) : null;
  const forecastEarnings = underwriting?.forecast_earnings ?? calculateDealEarnings(
    underwriting?.accepted_amount,
    underwriting?.forecast_fee_points,
    underwriting?.forecast_consulting_fee,
  );
  const dealEconomicsVertical = programVerticalForVariant(detail?.intake.variant);
  const evidence = asRecord(result?.document_evidence_map);
  const missing = arrayOfRecords(result?.missing_or_incomplete_items);
  const canonicalMissingDocuments = useMemo(
    () => leadCockpitOutstandingDocuments(
      detail?.requested_documents ?? [],
      detail?.files ?? [],
      programReadiness,
    ),
    [detail?.files, detail?.requested_documents, programReadiness],
  );
  const reviewMissingItems = useMemo(() => {
    const snapshotRows = compactMissingItems(missing);
    if (!programReadiness) return snapshotRows;
    const canonicalRows = canonicalMissingDocuments.map((document) => ({
      title: document.name,
      detail: document.description || "Required evidence is still outstanding.",
      priority: "high",
      query: [document.category, document.name].filter(Boolean).join(" "),
    }));
    return compactMissingItems([
      ...canonicalRows,
      ...leadCockpitNonDocumentMissingRows(snapshotRows, programReadiness),
    ]);
  }, [canonicalMissingDocuments, missing, programReadiness]);
  const strengths = arrayOfStrings(result?.strengths);
  const risks = arrayOfStrings(result?.risks);

  const artifacts = useMemo(
    () => [...(detail?.artifacts || [])].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime()),
    [detail?.artifacts],
  );
  const summaryHistory = artifacts.filter((artifact) => artifact.artifact_type === "executive_summary");
  const packetHistory = artifacts.filter((artifact) => artifact.artifact_type === "lender_packet");
  const summary = summaryHistory[0];
  const presentationHistory = artifacts.filter((artifact) => artifact.artifact_type === "investor_presentation");
  const presentation = presentationHistory[0];
  const investorReportFormat = asRecord(presentation?.body_json?.investor_report_format);
  const condensedInvestorReport = investorReportFormat?.max_pages === 5 && Number(investorReportFormat.page_count) > 0 && Number(investorReportFormat.page_count) <= 5;
  const packet = packetHistory[0];
  const packageInSync = Boolean(
    summary?.generation_id
    && summary.generation_id === packet?.generation_id
    && summary.status === "current"
    && packet?.status === "current"
    && summary.is_fresh === true
    && packet.is_fresh === true
    && presentation?.generation_id === packet.generation_id
    && presentation.status === "current"
    && presentation.is_fresh === true
  );
  const packageNeedsRefresh = Boolean(summary && packet && !packageInSync);
  const evidenceFiles = detail?.files.filter(isSourceEvidenceFile) ?? [];
  const evidenceFileCount = evidenceFiles.length;
  const prequalification = artifacts.find((artifact) => artifact.artifact_type === "prequalification");
  const isRealEstate = detail?.intake.variant === "real_estate_dscr_v1";
  // "dealer_gatekeeper_v1" is the dealer marker, and the only one the backend
  // gates on. A second legacy value here would have let a package be sent to a
  // client the signing gate then refused to show, so there is exactly one.
  const isDealerFile = detail?.intake.variant === "dealer_gatekeeper_v1";

  async function refreshFullPackage(openPreview = true, options?: PackageGenerationOptions) {
    const requestId = ++packageRequestRef.current;
    const previewWindow = openPreview ? window.open("", "_blank") : null;
    if (previewWindow) {
      try {
        previewWindow.opener = null;
        writePreparationPreview(previewWindow, { title: "Preparing investor presentation", description: "Building the presentation and supporting PDFs from this file’s current financial figures and evidence." });
      } catch { /* A blocked or closed preview must not prevent generation. */ }
    }
    setBusy("package-all");
    setPackageError(null);
    setPackagePreparation({ state: "loading", title: "Preparing investor package", description: "Creating the presentation, executive summary and lender package. The current versions remain available while this runs.", steps: [{ label: "Create and save PDFs", status: "active" }, { label: "Open preview", status: "pending" }] });
    try {
      const generated = await onGeneratePackage(options);
      if (requestId !== packageRequestRef.current) return;
      setPackageTab("summary");
      const previewUrl = generated.investor_presentation?.preview_url || generated.investor_presentation?.download_url || generated.lender_packet.preview_url || generated.lender_packet.download_url || generated.executive_summary.preview_url || generated.executive_summary.download_url;
      let previewOpened = false;
      if (previewWindow && previewUrl) {
        try {
          if (!previewWindow.closed) { previewWindow.location.replace(previewUrl); previewOpened = true; }
        } catch { /* Saved PDFs remain successful even if preview navigation fails. */ }
      }
      if (previewWindow && !previewOpened) {
        try { writePreparationPreview(previewWindow, { state: "complete", title: "Investor package ready", description: "The versioned PDFs have been saved. Return to the file to open the presentation or download the package." }); } catch { /* Best-effort preview only. */ }
      }
      setPackagePreparation({ state: "complete", title: "Investor package ready", description: previewOpened ? "The versioned PDFs are saved and the presentation preview has opened." : "The versioned PDFs are saved. Open the presentation or supporting documents below to preview them.", steps: [{ label: "Create and save PDFs", status: "complete" }, ...(openPreview ? [{ label: previewOpened ? "Preview opened" : "Preview available below", status: previewOpened ? "complete" as const : "pending" as const }] : [])] });
      toast.show(generated.superseded_bucket_file_ids.length
        ? "Package refreshed. The previous room PDFs were superseded."
        : "Investor presentation, executive summary and lender package are ready in the room.");
    } catch (reason) {
      if (requestId !== packageRequestRef.current) return;
      const message = apiErrorMessage(reason, "The investor package could not be generated.");
      setPackageError(message);
      setPackagePreparation({ state: "error", title: "Package preparation needs attention", description: `${message} Your prior package remains available. Retry generation after correcting the issue.`, steps: [{ label: "Create and save PDFs", status: "pending" }, { label: "Open preview", status: "pending" }] });
      if (previewWindow) {
        try { writePreparationPreview(previewWindow, { state: "error", title: "Package preparation needs attention", description: message }); } catch { /* The error remains visible in the file. */ }
      }
      toast.show(message);
    } finally {
      if (requestId === packageRequestRef.current) setBusy("");
    }
  }

  async function prepareArtifact(key: string, title: string, description: string, done: string, action: () => Promise<void> | void) {
    const requestId = ++artifactRequestRef.current;
    setBusy(key);
    setArtifactOperation(key);
    setArtifactPreparation({ state: "loading", title, description });
    try {
      await action();
      if (requestId !== artifactRequestRef.current) return;
      setArtifactPreparation({ state: "complete", title: done, description: key === "export" ? "The prepared PDF was sent to your browser’s downloads." : "The prepared document is available in this file." });
      toast.show(done);
    } catch (reason) {
      if (requestId !== artifactRequestRef.current) return;
      const message = apiErrorMessage(reason, "The document could not be prepared. Retry the action to try again.");
      setArtifactPreparation({ state: "error", title: "Document preparation needs attention", description: message });
      toast.show(message);
    } finally {
      if (requestId === artifactRequestRef.current) setBusy("");
    }
  }

  const clientTermsQuery = useClientTermsSummary(underwriting?.profile_id, !isDealerFile && canUnderwrite);
  const clientTermsOnFile = clientTermsQuery.data ?? null;
  const clientTermsSelection = useMemo<OfferSelection | null>(() => {
    const t = clientTermsOnFile;
    if (!t?.term_sheet_id || !t.version) return null;
    return {
      key: `application_term_sheet:${t.term_sheet_id}:${t.version}`,
      ref: { kind: "application_term_sheet", term_sheet_id: t.term_sheet_id, expected_version: t.version },
      label: "Financing terms",
      description: `${formatMoney(t.amount ?? 0)} at ${t.apr_pct == null ? "—" : `${t.apr_pct}% APR`} for ${t.term_months || "—"} months · version ${t.version}`,
      fileName: `financing-terms-v${t.version}.pdf`,
    };
  }, [clientTermsOnFile]);
  const termsOnFile = useMemo<TermsOnFile | null>(() => {
    if (isDealerFile) {
      const current = termSheet?.current;
      if (!current || current.status !== "current") return null;
      return {
        kind: "production_term_sheet", id: current.id, version: current.version, status: "recorded", label: `Term sheet v${current.version} · ${current.funding_party_name || current.funding_party_kind}`,
        amount: current.approved_amount ?? null, ratePct: current.rate_pct ?? null, termMonths: current.term_months ?? null,
        structureLabel: productionTermLabel(current.repayment_structure ?? current.extra?.repayment_structure, PRODUCTION_REPAYMENT_LABELS, "Repayment not recorded"),
        interestOnlyMonths: Number(current.extra?.interest_only_months ?? 0) || 0,
        paymentMonthly: current.monthly_equivalent_payment ?? current.extra?.monthly_equivalent_payment ?? current.monthly_debt_service ?? null,
        coverageAfter: null, recordedAt: current.entered_at ?? null, sentToClient: false,
      };
    }
    const t = clientTermsOnFile;
    if (!t?.term_sheet_id || !t.version) return null;
    return {
      kind: "application_term_sheet", id: t.term_sheet_id, version: t.version, status: t.status, label: `Client terms v${t.version}${t.loan_type_label ? ` · ${t.loan_type_label}` : ""}`,
      amount: t.amount, ratePct: t.apr_pct, termMonths: t.term_months, structureLabel: t.calculation?.structure_label ?? null, interestOnlyMonths: t.interest_only_months ?? 0,
      paymentMonthly: t.calculation?.periodic_payment != null && t.repayment_frequency === "monthly" ? t.calculation.periodic_payment : null,
      paymentAmount: t.calculation?.periodic_payment ?? null,
      paymentLabel: t.repayment_frequency === "custom" ? `Payment · ${t.custom_repayment_label || "custom cadence"}` : `Payment · ${t.repayment_frequency}`,
      coverageAfter: t.calculation?.dscr_after ?? null, recordedAt: t.updated_at ?? null, sentToClient: t.status === "issued",
    };
  }, [isDealerFile, termSheet, clientTermsOnFile]);
  const productionTermSelection = useMemo<OfferSelection | null>(() => {
    const current = termSheet?.current;
    if (!current || current.status !== "current") return null;
    const repayment = current.repayment_structure ?? current.extra?.repayment_structure;
    const cadence = current.payment_frequency ?? current.extra?.payment_frequency;
    const repaymentLabel = productionTermLabel(repayment, PRODUCTION_REPAYMENT_LABELS, "Repayment not recorded");
    const cadenceLabel = productionTermLabel(cadence, PRODUCTION_CADENCE_LABELS, "Monthly");
    return {
      key: `production_term_sheet:${current.id}:${current.version}`,
      ref: { kind: "production_term_sheet", term_sheet_id: current.id, expected_version: current.version },
      label: "Loan terms",
      description: `${current.facility_type} · ${formatMoney(current.approved_amount)} · ${repaymentLabel} · ${cadenceLabel} · version ${current.version}`,
      fileName: `loan-terms-v${current.version}.pdf`,
    };
  }, [termSheet]);

  const availableOfferSelections = useMemo(
    () => [productionTermSelection, applicationTermSelection ?? clientTermsSelection, merchantOfferSelection].filter((item): item is OfferSelection => Boolean(item)),
    [applicationTermSelection, clientTermsSelection, merchantOfferSelection, productionTermSelection],
  );
  const selectedOfferSelections = useMemo(
    () => availableOfferSelections.filter((item) => selectedOfferKeys.includes(item.key)),
    [availableOfferSelections, selectedOfferKeys],
  );

  const handleMerchantOfferReady = useCallback((next: OfferSelection | null) => {
    setMerchantOfferSelection((current) => {
      if (!current && !next) return current;
      if (current && next && current.key === next.key && current.description === next.description) return current;
      return next;
    });
  }, []);

  const handleApplicationTermReady = useCallback((next: OfferSelection | null) => {
    setApplicationTermSelection((current) => {
      if (!current && !next) return current;
      if (current && next && current.key === next.key && current.description === next.description) return current;
      return next;
    });
  }, []);

  useEffect(() => {
    if (isDealerFile) setApplicationTermSelection(null);
  }, [isDealerFile, profileId]);

  useEffect(() => {
    const available = new Set(availableOfferSelections.map((item) => item.key));
    setSelectedOfferKeys((current) => {
      const next = current.filter((key) => available.has(key));
      return next.length === current.length && next.every((key, index) => key === current[index]) ? current : next;
    });
  }, [availableOfferSelections]);

  const setOfferSelected = useCallback((selection: OfferSelection | null, selected: boolean) => {
    if (!selection) return;
    setSelectedOfferKeys((current) => selected
      ? current.includes(selection.key) ? current : [...current, selection.key]
      : current.filter((key) => key !== selection.key));
    setOfferDeliveryReceipt(null);
  }, []);

  const openOfferComposer = useCallback((selection?: OfferSelection | null) => {
    if (selection) {
      setSelectedOfferKeys((current) => current.includes(selection.key) ? current : [...current, selection.key]);
    }
    setOfferDeliveryReceipt(null);
    setOfferComposerOpen(true);
  }, []);

  const openCurrentOffersComposer = useCallback(() => {
    setSelectedOfferKeys(availableOfferSelections.map((item) => item.key));
    setOfferDeliveryReceipt(null);
    setOfferComposerOpen(true);
  }, [availableOfferSelections]);

  // The term sheet is keyed on the profile and exists only on dealer files; a
  // 404 (not a dealer file / no package visibility) simply means "none".
  const loadTermSheet = useCallback(async (profileId: string | null | undefined, authToken?: string | null) => {
    if (!profileId || !isDealerFile || !canUnderwrite) {
      setTermSheet(null);
      return;
    }
    try {
      const token = authToken ?? (await getToken());
      setTermSheet(await api<ApplicationTermSheetState>(`/production-packages/term-sheets/${profileId}`, { authToken: token ?? undefined }));
    } catch {
      setTermSheet(null);
    }
  }, [canUnderwrite, getToken, isDealerFile]);

  const loadUnderwritingState = useCallback(async () => {
    const intakeId = detail?.intake.id;
    setProfileId(null);
    setProgramReadiness(null);
    if (!intakeId || !canUnderwrite) {
      setUnderwriting(null);
      setUnderwritingDraft(emptyUnderwritingDraft());
      return;
    }
    setUnderwritingLoading(true);
    setUnderwritingError(null);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ source_kind: "intake", source_id: intakeId }),
      });
      // This runs on file open for every operator (the resolve endpoint is
      // theirs), so the strip shows on the workspace view without a trip
      // through Underwriting — and it is set before the underwriting read, so
      // a failure there does not hide the team.
      setProfileId(profile.id);
      const [state, readiness] = await Promise.all([
        api<ApplicationUnderwritingState>(`/application-profiles/${profile.id}/underwriting`, {
          authToken: authToken ?? undefined,
        }),
        api<ApplicationProgramReadiness>(`/application-profiles/${profile.id}/program-readiness`, {
          authToken: authToken ?? undefined,
        }),
      ]);
      setUnderwriting(state);
      setProgramReadiness(readiness);
      setUnderwritingDraft(underwritingDraftFromState(state));
      await loadTermSheet(profile.id, authToken);
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting state could not be loaded."));
    } finally {
      setUnderwritingLoading(false);
    }
  }, [canUnderwrite, detail?.intake.id, getToken, loadTermSheet]);

  const refreshProgramReadiness = useCallback(async () => {
    if (!canUnderwrite) return;
    if (!profileId) {
      await loadUnderwritingState();
      return;
    }
    try {
      const authToken = await getToken();
      setProgramReadiness(await api<ApplicationProgramReadiness>(`/application-profiles/${profileId}/program-readiness`, {
        authToken: authToken ?? undefined,
      }));
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Evidence readiness could not be refreshed."));
    }
  }, [canUnderwrite, getToken, loadUnderwritingState, profileId]);

  const refreshUnderwritingFromResponse = useCallback(async () => {
    const activeProfileId = underwriting?.profile_id ?? profileId;
    if (!activeProfileId || !canUnderwrite) return;
    try {
      const authToken = await getToken();
      const state = await api<ApplicationUnderwritingState>(`/application-profiles/${activeProfileId}/underwriting`, {
        authToken: authToken ?? undefined,
      });
      setUnderwriting(state);
      // Refresh the accepted amount without resolving/unmounting this file.
      // Keep reviewer notes, target DSCR and other pending desk edits intact.
      setUnderwritingDraft((current) => ({
        ...current,
        underwriting_status: state.underwriting_status,
        accepted_amount: state.accepted_amount == null ? "" : String(state.accepted_amount),
      }));
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting state could not be refreshed."));
    }
  }, [canUnderwrite, getToken, profileId, underwriting?.profile_id]);

  const handleCockpitResponse = useCallback((response: IntakeResponse) => {
    onCockpitResponse(response);
    // Uploads and accepted/overridden evidence can change readiness without
    // changing the selected intake id, so its initial-load effect will not run.
    void refreshProgramReadiness();
  }, [onCockpitResponse, refreshProgramReadiness]);

  function openTermSheet() {
    setProductionTermSheetOpen(true);
  }

  function closeTermSheet() {
    setProductionTermSheetOpen(false);
    void loadTermSheet(underwriting?.profile_id);
  }

  async function saveUnderwritingPatch(patch: ApplicationUnderwritingPatch): Promise<boolean> {
    if (!detail || !canUnderwrite) return false;
    setUnderwritingSaving(true);
    setUnderwritingError(null);
    try {
      const authToken = await getToken();
      let profileId = underwriting?.profile_id;
      if (!profileId) {
        const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
          method: "POST",
          authToken: authToken ?? undefined,
          body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
        });
        profileId = profile.id;
      }
      const statusChanged = Boolean(patch.underwriting_status && patch.underwriting_status !== underwriting?.underwriting_status);
      const isApprovalMove = statusChanged && patch.underwriting_status === "approved";
      const remainingPatch = { ...patch };
      if (statusChanged) delete remainingPatch.underwriting_status;
      if (isApprovalMove) {
        // Approval details belong to the lifecycle transaction below. Keep
        // unrelated reviewer fields (for example, policy target DSCR) out of
        // that contract, but save them before moving so a later write cannot
        // make a successful approval look failed in the UI.
        delete remainingPatch.approved_amount;
        delete remainingPatch.approved_dscr;
        delete remainingPatch.reviewer_notes;
        if (Object.keys(remainingPatch).length) {
          await api<ApplicationUnderwritingState>(`/application-profiles/${profileId}/underwriting`, {
            method: "PATCH",
            authToken: authToken ?? undefined,
            body: JSON.stringify(remainingPatch),
          });
        }
      }
      if (statusChanged) {
        const moveBody: PipelineMoveRequest = {
          target_status: patch.underwriting_status!,
          expected_status: underwriting?.underwriting_status ?? "collecting_docs",
          note: patch.reviewer_notes || undefined,
        };
        if (patch.underwriting_status === "approved") {
          moveBody.approved_amount = patch.approved_amount ?? null;
          moveBody.approved_dscr = patch.approved_dscr ?? null;
          moveBody.note = patch.reviewer_notes ?? null;
        }
        await api(`/operator-files/intake/${detail.intake.id}/pipeline-move`, {
          method: "POST",
          authToken: authToken ?? undefined,
          body: JSON.stringify(moveBody),
        });
      }
      const updated = !isApprovalMove && Object.keys(remainingPatch).length
        ? await api<ApplicationUnderwritingState>(`/application-profiles/${profileId}/underwriting`, {
            method: "PATCH",
            authToken: authToken ?? undefined,
            body: JSON.stringify(remainingPatch),
          })
        : await api<ApplicationUnderwritingState>(`/application-profiles/${profileId}/underwriting`, {
            authToken: authToken ?? undefined,
          });
      setUnderwriting(updated);
      setUnderwritingDraft(underwritingDraftFromState(updated));
      toast.show(statusChanged ? "Pipeline status updated." : "Underwriting fields saved.");
      return true;
    } catch (reason) {
      setUnderwritingError(apiErrorMessage(reason, "Underwriting could not be saved."));
      toast.show(apiErrorMessage(reason, "Underwriting could not be saved."));
      return false;
    } finally {
      setUnderwritingSaving(false);
    }
  }

  function saveUnderwritingDraft() {
    const patch: ApplicationUnderwritingPatch = {
      underwriting_status: underwritingDraft.underwriting_status,
      target_dscr: numberOrNull(underwritingDraft.target_dscr),
      reviewer_notes: underwritingDraft.reviewer_notes.trim() || null,
      accepted_amount: numberOrNull(underwritingDraft.accepted_amount),
      estimated_close_date: underwritingDraft.estimated_close_date || null,
      funded_amount: numberOrNull(underwritingDraft.funded_amount),
    };
    if (patch.underwriting_status === "approved" && underwriting?.underwriting_status !== "approved") {
      openApproval(patch);
      return;
    }
    void saveUnderwritingPatch(patch);
  }

  function changeUnderwritingStatus(statusValue: UnderwritingLifecycleStatus) {
    const forecastPatch: Pick<ApplicationUnderwritingPatch, "accepted_amount" | "estimated_close_date" | "funded_amount"> = {
      accepted_amount: numberOrNull(underwritingDraft.accepted_amount),
      estimated_close_date: underwritingDraft.estimated_close_date || null,
      funded_amount: numberOrNull(underwritingDraft.funded_amount),
    };
    if (statusValue === "approved" && underwriting?.underwriting_status !== "approved") {
      openApproval({ underwriting_status: statusValue, reviewer_notes: underwritingDraft.reviewer_notes.trim() || null, ...forecastPatch });
      return;
    }
    setUnderwritingDraft((current) => ({ ...current, underwriting_status: statusValue }));
    void saveUnderwritingPatch({ underwriting_status: statusValue, reviewer_notes: underwritingDraft.reviewer_notes.trim() || null, ...forecastPatch });
  }

  function openApproval(patch: ApplicationUnderwritingPatch) {
    setUnderwritingError(null);
    setApprovalError(null);
    setApprovalDraft(pipelineApprovalDraft({
      approvedAmount: underwriting?.approved_amount ?? termSheet?.current?.approved_amount ?? underwriting?.term_sheet_amount,
      approvedDscr: underwriting?.approved_dscr,
      note: patch.reviewer_notes ?? "",
    }));
    setPendingApprovalPatch(patch);
  }

  function cancelApproval() {
    if (underwritingSaving) return;
    setPendingApprovalPatch(null);
    setApprovalError(null);
    setUnderwritingError(null);
    setUnderwritingDraft((current) => ({
      ...current,
      underwriting_status: underwriting?.underwriting_status ?? "collecting_docs",
    }));
  }

  async function confirmApproval() {
    if (!pendingApprovalPatch) return;
    const approval = validatePipelineApprovalDraft(approvalDraft);
    if (!approval.value) {
      setApprovalError(approval.error);
      return;
    }
    setApprovalError(null);
    const saved = await saveUnderwritingPatch({
      ...pendingApprovalPatch,
      underwriting_status: "approved",
      approved_amount: approval.value.approved_amount,
      approved_dscr: approval.value.approved_dscr,
      reviewer_notes: approval.value.note,
    });
    if (!saved) return;
    setPendingApprovalPatch(null);
    setApprovalDraft(pipelineApprovalDraft());
  }

  useEffect(() => {
    void loadUnderwritingState();
  }, [loadUnderwritingState]);

  useEffect(() => {
    const refreshAfterReview = (event: Event) => {
      const completedIntakeId = (event as CustomEvent<{ intakeId?: string }>).detail?.intakeId;
      if (completedIntakeId !== detail?.intake.id) return;
      void refreshProgramReadiness();
    };
    window.addEventListener("qc-ai-review-completed", refreshAfterReview);
    return () => window.removeEventListener("qc-ai-review-completed", refreshAfterReview);
  }, [detail?.intake.id, refreshProgramReadiness]);

  useEffect(() => {
    if (!detail) {
      initializedLeadIdRef.current = null;
      return;
    }
    if (initializedLeadIdRef.current === detail.intake.id) return;
    initializedLeadIdRef.current = detail.intake.id;
    const rows = detail.artifacts ?? [];
    if (initialSubmissionStep) setSubmissionStep(initialSubmissionStep === 3 ? 1 : initialSubmissionStep);
    else if (rows.some((item) => item.artifact_type === "lender_packet")) setSubmissionStep(4);
    else if (detail.latest_review?.status === "completed" || detail.intake.status === "reviewed") setSubmissionStep(4);
    else if (detail.files.some(isSourceEvidenceFile)) setSubmissionStep(2);
    else setSubmissionStep(1);
    setEvidenceTab(initialEvidenceTab);
    setEvidenceFocus(null);
    setPrototypeView(
      initialView === "payments" && canViewPayments
        ? "payments"
        : (initialView === "underwriting" || initialView === "reviewer" || initialView === "production") && canUnderwrite
        ? initialView
        : initialView === "communications"
          ? "communications"
          : initialView === "audit"
            ? "audit"
            : "workspace",
    );
    setProductionTermSheetOpen(false);
    setCommunicationChannel(initialCommunicationChannel);
    setContextRailOpen(false);
    setContactDraft({
      ...businessContactDraft(detail.intake),
      full_name: detail.intake.full_name || "",
      business_name: detail.intake.business_name || "",
      email: detail.intake.email || "",
      phone: detail.intake.phone || "",
      loan_purpose: detail.intake.loan_purpose || "",
      estimated_credit_score: detail.intake.estimated_credit_score == null ? "" : String(detail.intake.estimated_credit_score),
      referral_source: detail.intake.referral_source || "",
      years_in_business: detail.intake.years_in_business == null ? "" : String(detail.intake.years_in_business),
      business_website: businessWebsiteDraft(detail.intake),
      business_description: detail.intake.business_description || "",
    });
  }, [detail, initialCommunicationChannel, initialEvidenceTab, initialSubmissionStep, initialView, canUnderwrite, canViewPayments]);

  async function saveContact() {
    if (!contactDraft.full_name.trim() || !contactDraft.email.trim()) {
      toast.show("Principal name and email are required.");
      return;
    }
    const businessChanges = businessContactChanges(contactDraft, detail?.intake || {});
    if (businessChanges.problem) {
      toast.show(businessChanges.problem);
      return;
    }
    setContactSaving(true);
    try {
      await onUpdateContact({
        full_name: contactDraft.full_name.trim(),
        business_name: contactDraft.business_name.trim() || null,
        email: contactDraft.email.trim(),
        phone: contactDraft.phone.trim() || null,
        loan_purpose: contactDraft.loan_purpose.trim() || null,
        estimated_credit_score: contactDraft.estimated_credit_score ? Number(contactDraft.estimated_credit_score) : null,
        referral_source: contactDraft.referral_source.trim() || null,
        years_in_business: contactDraft.years_in_business.trim() ? Number(contactDraft.years_in_business.replace(",", ".")) : null,
        ...businessChanges.changes,
      });
      setContactEditOpen(false);
      toast.show("Contact details updated.");
    } catch (error) {
      toast.show(apiErrorMessage(error, "Could not update contact details."));
    } finally {
      setContactSaving(false);
    }
  }

  async function previewEmail() {
    setBusy("preview");
    try {
      // No recipients needed — this drafts a subject + body the operator copies
      // into their own mail client. The primary package PDF is selected from
      // the current evidence generation by the delivery service.
      const preview = await onPreviewEmail({
        to_emails: [],
        cc_emails: [],
        subject: subject || undefined,
        body: body || undefined,
        include_lender_packet: true,
      });
      setSubject(preview.subject);
      setBody(preview.body);
    } finally {
      setBusy("");
    }
  }

  // Parse a raw recipients string into { valid, invalid }. Unwraps display-name
  // forms ("Jane <jane@x.com>") and requires a real dot-bearing TLD so the
  // backend's strict EmailStr validation can't 422 the whole send on a token
  // that merely contained "@".
  function parseEmails(raw: string): { valid: string[]; invalid: string[] } {
    const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const token of raw.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)) {
      const m = token.match(EMAIL_RE);
      if (m) valid.push(m[0]);
      else invalid.push(token);
    }
    return { valid, invalid };
  }

  async function sendEmail() {
    const to = parseEmails(toEmails);
    const cc = parseEmails(ccEmails);
    if (to.invalid.length || cc.invalid.length) {
      toast.show(`Fix these email addresses: ${[...to.invalid, ...cc.invalid].join(", ")}`);
      return;
    }
    if (!to.valid.length) {
      toast.show("Add at least one recipient email");
      return;
    }
    if (!subject.trim() || !body.trim()) {
      toast.show("Draft a subject and body first");
      return;
    }
    if (subject.trim().length > 512) {
      toast.show("Subject is too long (max 512 characters)");
      return;
    }
    if (body.trim().length > 12000) {
      toast.show("Body is too long (max 12,000 characters)");
      return;
    }
    setBusy("send");
    try {
      const res = await onSendEmail({
        to_emails: to.valid,
        cc_emails: cc.valid,
        subject: subject.trim(),
        body: body.trim(),
        include_lender_packet: attachPacket,
        attach_lender_packet: attachPacket,
        attach_executive_summary: attachSummary,
        attach_package_zip: attachZip,
        bucket_access: bucketAccess,
        drive_file_ids: driveFiles.map((f) => f.id),
      });
      const ok = (res.email_sends || []).filter((s) => !s.ses_error).length;
      const failed = (res.email_sends || []).length - ok;
      toast.show(failed ? `Sent ${ok}, ${failed} failed — check status` : `Sent to ${ok} recipient${ok === 1 ? "" : "s"}`);
    } catch (error) {
      toast.show(apiErrorMessage(error, "Send failed"));
    } finally {
      setBusy("");
    }
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.show(`${label} copied`);
    } catch {
      toast.show("Copy failed");
    }
  }

  async function runIngest() {
    if (!ingestFiles.length) {
      toast.show("Pick at least one Drive file");
      return;
    }
    setBusy("ingest");
    try {
      const res = await onIngestFromDrive(ingestFiles.map((f) => f.id));
      const parts = [`${res.ingested} imported`];
      if (res.skipped) parts.push(`${res.skipped} skipped`);
      const suffix = res.ingested ? " — Re-run AI review to fold them in" : "";
      toast.show(`${parts.join(", ")}${suffix}`);
      setIngestFiles([]);
      setIngestPickerOpen(false);
    } catch (error) {
      toast.show(apiErrorMessage(error, "Drive import failed"));
    } finally {
      setBusy("");
    }
  }

  async function downloadZip() {
    if (!detail) return;
    const requestId = ++artifactRequestRef.current;
    setZipBusy(true);
    setArtifactOperation("zip");
    setArtifactPreparation({ state: "loading", title: "Preparing package download", description: "Collecting the current documents and building one ZIP archive." });
    try {
      await onDownloadZip();
      if (requestId !== artifactRequestRef.current) return;
      setArtifactPreparation({ state: "complete", title: "Package download started", description: "The prepared ZIP archive was sent to your browser’s downloads." });
      toast.show("Package download started");
    } catch (err) {
      if (requestId !== artifactRequestRef.current) return;
      const message = apiErrorMessage(err, "Package download failed");
      setArtifactPreparation({ state: "error", title: "Package download needs attention", description: message });
      toast.show(message);
    } finally {
      if (requestId === artifactRequestRef.current) setZipBusy(false);
    }
  }

  async function postNote(content: string, imageIds: string[] = []) {
    setNotesPosting(true);
    setNotesError(null);
    try {
      await onPostNote(content, imageIds);
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Could not post the note.");
    } finally {
      setNotesPosting(false);
    }
  }

  async function changeOutcomeStatus(nextStatus: string) {
    setOutcomeBusy(true);
    try {
      await onUpdateOutcomeStatus(nextStatus);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not update outcome status.");
    } finally {
      setOutcomeBusy(false);
    }
  }

  async function changeLanguage(nextLanguage: string) {
    setLanguageBusy(true);
    try {
      await onUpdateLanguage(nextLanguage);
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not update client language.");
    } finally {
      setLanguageBusy(false);
    }
  }

  async function handleCancelDeletionRequest() {
    setDeletionBusy(true);
    try {
      await onCancelDeletionRequest();
    } catch (error) {
      toast.show(error instanceof Error ? error.message : "Could not cancel the deletion request.");
    } finally {
      setDeletionBusy(false);
    }
  }

  async function uploadFromHeader(files: File[], requestedDocumentId?: string) {
    if (!cockpitAdapter || !files.length) return;
    setHeaderUploading(true);
    setUploadStatus(`Preparing ${files.length} file${files.length === 1 ? "" : "s"}...`);
    const failed: string[] = [];
    const lockedFiles: File[] = [];
    let uploaded = 0;
    let stale = 0;
    try {
      for (const [index, file] of files.entries()) {
        setUploadStatus(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        try {
          await assertPdfUploadUnlocked(file);
          const init = await cockpitAdapter.uploadInit({ requested_document_id: requestedDocumentId ?? null, file_name: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size });
          const response = await fetch(init.upload_url, { method: "PUT", body: file, headers: init.required_headers });
          if (!response.ok) throw new Error(`${file.name} could not be uploaded.`);
          await cockpitAdapter.uploadComplete(init.file_id);
          uploaded += 1;
        } catch (error) {
          if (isPasswordProtectedPdfUploadError(error)) lockedFiles.push(file);
          else if (isStaleRequestedDocumentError(error)) stale += 1;
          else failed.push(file.name);
        }
      }
      if (!uploaded && !stale && !lockedFiles.length) throw new Error(`None of the ${files.length} selected files could be uploaded.`);
      setUploadStatus("Refreshing evidence...");
      const response = await cockpitAdapter.reload();
      handleCockpitResponse(response);
      setSubmissionStep(2);
      setPrototypeView("workspace");
      toast.show([
        stale ? `${uploaded ? `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded. ` : ""}The document checklist changed, so ${stale === 1 ? "one file was" : `${stale} files were`} not attached. Use the current requirement and add ${stale === 1 ? "it" : "them"} again.` : "",
        lockedFiles.length ? passwordProtectedPdfUploadNotice(lockedFiles) : "",
        failed.length ? `${uploaded} uploaded; ${failed.length} failed: ${failed.join(", ")}` : "",
        !stale && !lockedFiles.length && !failed.length ? `${uploaded} file${uploaded === 1 ? "" : "s"} uploaded and queued for AI review` : "",
      ].filter(Boolean).join(" "));
    } catch (error) {
      toast.show(documentUploadErrorMessage(error));
    } finally {
      setHeaderUploading(false);
      setUploadStatus("");
      if (headerUploadRef.current) headerUploadRef.current.value = "";
    }
  }

  function openReviewDestination(destination: ReviewDestination) {
    if (destination.kind === "profile") {
      setContactEditOpen(true);
      return;
    }
    setPrototypeView("workspace");
    setEvidenceFocus(null);
    if (destination.kind === "owners") {
      setSubmissionStep(1);
      return;
    }
    if (destination.kind === "credit") {
      setSubmissionStep(1);
      return;
    }
    setSubmissionStep(2);
    if (destination.kind === "banking") {
      setEvidenceTab("banking");
      return;
    }
    setEvidenceTab("requirements");
    setEvidenceFocus((current) => ({
      query: destination.query,
      requestId: (current?.requestId ?? 0) + 1,
    }));
  }

  function openEvidenceFiles() {
    setEvidenceFocus(null);
    setEvidenceTab("files");
    setSubmissionStep(2);
    setPrototypeView("workspace");
  }

  function openDocumentRequest() {
    const nextMissing = missing.find((row) => String(row.title || "").trim());
    setRequestDraft({
      name: String(nextMissing?.title || ""),
      category: "Business documents",
      description: String(nextMissing?.detail || ""),
      allow_multiple_files: false,
      recipient_email: detail?.intake.email || "",
      recipient_phone: detail?.intake.phone || "",
      email_room_link: true,
      sms_reminder: false,
    });
    setRequestResult(null);
    setRequestOpen(true);
  }

  async function createDocumentRequest() {
    if (!detail || requestDraft.name.trim().length < 2) return;
    setRequestSaving(true);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
      });
      const result = await api<RoomRequestResult>(`/application-profiles/${profile.id}/room/requests`, {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({
          name: requestDraft.name.trim(),
          category: requestDraft.category.trim() || null,
          instructions: requestDraft.description.trim() || null,
          allow_multiple_files: requestDraft.allow_multiple_files,
          recipient_email: requestDraft.recipient_email.trim() || null,
          recipient_phone: requestDraft.recipient_phone.trim() || null,
          email_room_link: requestDraft.email_room_link,
          sms_reminder: requestDraft.sms_reminder,
        }),
      });
      if (cockpitAdapter) handleCockpitResponse(await cockpitAdapter.reload());
      setRequestResult(result);
      setSubmissionStep(2);
      setPrototypeView("workspace");
      toast.show(result.overall_status === "success" ? `Request created and delivered` : result.overall_status === "partial" ? "Request created; one delivery channel failed" : result.overall_status === "failed" ? "Request created; delivery failed" : "Request created without sending");
    } catch (reason) {
      toast.show(apiErrorMessage(reason, "The document request could not be created."));
    } finally {
      setRequestSaving(false);
    }
  }

  async function retryRequestDelivery() {
    if (!detail || !requestResult) return;
    const retryEmail = requestResult.deliveries.some((receipt) => receipt.channel === "email" && !receipt.provider_accepted);
    const retrySms = requestResult.deliveries.some((receipt) => receipt.channel === "sms" && !receipt.provider_accepted);
    if (!retryEmail && !retrySms) return;
    setRequestSaving(true);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }),
      });
      const retry = await api<RoomRequestResult>(`/application-profiles/${profile.id}/room/reminders`, {
        method: "POST",
        authToken: authToken ?? undefined,
        body: JSON.stringify({
          purpose: "documents",
          recipient_email: requestDraft.recipient_email.trim() || null,
          recipient_phone: requestDraft.recipient_phone.trim() || null,
          email_room_link: retryEmail,
          sms_reminder: retrySms,
        }),
      });
      setRequestResult({ ...retry, requested_document_id: requestResult.requested_document_id });
      toast.show(retry.overall_status === "success" ? "Failed delivery retried successfully" : retry.overall_status === "partial" ? "One retry channel is still failing" : "Delivery retry was not accepted");
    } catch (reason) {
      toast.show(apiErrorMessage(reason, "The failed delivery could not be retried."));
    } finally {
      setRequestSaving(false);
    }
  }

  function openRotatePin() {
    setRotatePin("");
    setRotatePinConfirm("");
    setRotatePinDone(false);
    setRotatePinOpen(true);
  }

  async function rotateApplicationRoomPin() {
    if (!detail || !/^\d{6}$/.test(rotatePin) || rotatePin !== rotatePinConfirm) return;
    setRotatePinSaving(true);
    try {
      const authToken = await getToken();
      const profile = await api<ApplicationProfile>("/application-profiles/resolve", { method: "POST", authToken: authToken ?? undefined, body: JSON.stringify({ source_kind: "intake", source_id: detail.intake.id }) });
      await api(`/application-profiles/${profile.id}/room/pin/rotate`, { method: "POST", authToken: authToken ?? undefined, body: JSON.stringify({ secure_room_pin: rotatePin }) });
      setRotatePinDone(true);
      toast.show("Application-room PIN rotated. The previous PIN no longer works.");
    } catch (reason) {
      toast.show(apiErrorMessage(reason, "The room PIN could not be rotated."));
    } finally {
      setRotatePinSaving(false);
    }
  }

  const requiredDocs = detail?.requested_documents.filter((document) => document.required) ?? [];
  const requiredUploaded = requiredDocs.filter((document) => document.status === "uploaded").length;
  const hasEvidence = evidenceFileCount > 0;
  const evidenceComplete = hasEvidence && (requiredDocs.length === 0 || requiredUploaded === requiredDocs.length);
  const evidenceAndBankingComplete = Boolean(profileVerification?.business_banking_complete && (profileVerification.evidence_complete || evidenceComplete));
  const hasBankingActivity = Boolean(profileVerification?.bank_connection_count || profileVerification?.bank_statement_months);
  const reviewComplete = !mcaAutoReviewBlocked && (detail?.latest_review?.status === "completed" || detail?.intake.status === "reviewed");
  const reviewActive = !mcaAutoReviewBlocked && Boolean(detail && (rerunning || ["queued", "running"].includes(detail.latest_review?.status || "")));
  const sentCount = detail?.email_sends?.filter((send) => !send.ses_error).length ?? 0;
  const ownerCreditProgress = creditStepProgress(profileVerification, programReadiness);
  const workflowSteps: Array<{ id: number; label: string; sub: string; status: "not-started" | "partial" | "complete" }> = [
    { id: 1, label: "Ownership & credit", sub: ownerCreditProgress.sub, status: ownerCreditProgress.status },
    { id: 2, label: "Evidence & banking", sub: "Files, forms, AI decisions and bank coverage", status: evidenceAndBankingComplete ? "complete" : hasEvidence || hasBankingActivity ? "partial" : "not-started" },
    { id: 4, label: mcaAutoReviewBlocked ? mcaReview?.mode === "manual_review" ? "Manual desk review" : "Confirm MCA details" : "AI review", sub: mcaAutoReviewBlocked ? "Accepted application; automatic underwriting disabled" : "Extracted facts, probability and DSCR", status: reviewComplete ? "complete" : reviewActive || hasEvidence ? "partial" : "not-started" },
  ];

  const renderFundingPackage = (marketplace: ReactNode, cockpit: FinancialCockpitData) => profileId ? <FundingPackageWorkspace key={profileId} profileId={profileId} cockpit={cockpit} activeTab={packageTab} onTab={(tab) => { setPackageTab(tab); if (tab === "marketplace") setCockpitFocus("marketplace"); }} busy={busy !== "" || zipBusy} generating={busy === "package-all"} preparation={packagePreparation} generated={Boolean(summary && packet)} current={packageInSync} error={packageError} onGenerate={(options) => void refreshFullPackage(true, options)}
    packageDetails={<InvestorPackageDetails profileId={profileId} intakeId={detail!.intake.id} report={presentation ?? null} disabled={busy !== "" || zipBusy} onSaved={onFundingRequestSaved} onOpenEvidence={openEvidenceFiles} />}
    packageContent={summary && packet ? <div className="package-readiness-overview">
                    {packageNeedsRefresh ? <Callout tone="warn">The evidence, review, or selected program changed after this package was generated. Refresh once to rebuild the presentation and supporting PDFs from the current Package Readiness snapshot.</Callout> : null}
                    <div className="package-readiness-status">
                      <div><span className="lbl">Current package</span><strong>Version {Math.max(artifactVersion(summary, summaryHistory.length), artifactVersion(packet, packetHistory.length))}</strong><small>Generated {formatDateTime(packet.created_at)}</small></div>
                      <div><span className="lbl">Programs in scope</span><strong>{programReadiness?.selections.length || 0}</strong><small>{programReadiness?.selections.map((item) => item.program_name).join(" · ") || "Select a program before delivery"}</small></div>
                      <div><span className="lbl">Evidence</span><strong>{evidenceFileCount} files</strong><small>{programReadiness?.can_advance ? "Program requirements complete" : `${canonicalMissingDocuments.length} open requirement${canonicalMissingDocuments.length === 1 ? "" : "s"}`}</small></div>
                    </div>
                    <div className="package-document-grid">
                      <PackageArtifactCard artifact={summary} label="Executive summary" description="Concise credit brief with decision metrics, strengths, risks, and next action." version={artifactVersion(summary, summaryHistory.length)} current bucketSynced={Boolean(artifactBucketFileId(summary))} />
                      {presentation ? <PackageArtifactCard artifact={presentation} label={condensedInvestorReport ? "Investor report · up to 5 pages" : "Investor report · legacy layout"} description={condensedInvestorReport ? "Confidential branded report: financing, monthly statements, earnings impact, credit overview, collateral and source references." : "Refresh the package to create the condensed five-page report with charts and a full source register."} version={artifactVersion(presentation, presentationHistory.length)} current bucketSynced={Boolean(artifactBucketFileId(presentation))} /> : null}
                      <PackageArtifactCard artifact={packet} label="Detailed underwriting packet" description="Supporting underwriting schedules and evidence detail. The condensed investor report is available separately." version={artifactVersion(packet, packetHistory.length)} current bucketSynced={Boolean(artifactBucketFileId(packet))} />
                    </div>
                    <UnderwriterDigest artifact={summary} />
                  </div> : <div className="package-readiness-empty"><Icon name="reports" size={28} /><strong>No package has been generated</strong><p>Generate the investor presentation, executive summary and lender package from one evidence snapshot. Each PDF is versioned and saved in this file&apos;s room.</p></div>}
    marketplaceContent={<><MarketplacePublishStrip profileId={profileId} packageInSync={packageInSync} canPublish={currentUser?.role === Role.SUPER_ADMIN} onStartListing={() => { setPackageTab("marketplace"); setCockpitFocus("marketplace"); }} />{marketplace}</>}
    historyContent={<div className="package-version-workspace">
                    <Callout tone="acc">The current generation is the active package in the room. Refreshing creates a new immutable version and marks the previous PDFs as superseded.</Callout>
                    <div className="package-version-columns">
                      <PackageVersionList label="Investor report" artifacts={presentationHistory} renderReferences={artifact => <InvestorReportReferenceButton intakeId={detail!.intake.id} artifact={artifact} compact onOpenEvidence={openEvidenceFiles} />} />
                      <PackageVersionList label="Executive summary" artifacts={summaryHistory} />
                      <PackageVersionList label="Lender package" artifacts={packetHistory} />
                    </div>
                  </div>}
    deliveryContent={<div className="package-delivery"><Callout tone={packageInSync ? "acc" : "warn"}>{packageInSync && packet ? `Synchronized package version ${artifactVersion(packet, packetHistory.length)} is ready to send.` : "Refresh required: rebuild the presentation and supporting PDFs from the latest evidence and program conditions before delivery."}</Callout><p className="sub">{condensedInvestorReport ? "The condensed investor report is the primary delivery PDF. The detailed underwriting packet and full ZIP remain available as supporting files." : "The current lender packet is the primary delivery PDF. Refresh the package to create the condensed investor report."}</p><div className="fldgrid two"><Field label="To"><Input value={toEmails} onChange={(event) => setToEmails(event.target.value)} placeholder="lender@bank.com" /></Field><Field label="Cc"><Input value={ccEmails} onChange={(event) => setCcEmails(event.target.value)} placeholder="optional" /></Field></div><Field label="Subject"><Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Prepare a lender submission" /></Field><Field label="Message"><Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={7} placeholder="Draft the reviewed submission message" /></Field><Row><Btn onClick={previewEmail} disabled={!packageInSync || busy !== ""}><Icon name="spark" size={14} />{busy === "preview" ? "Drafting..." : "Draft with Elara"}</Btn><Btn variant="pri" disabled={!toEmails.trim() || !subject.trim() || !body.trim() || !packageInSync || busy !== ""} onClick={() => setSendReviewOpen(true)}><Icon name="send" size={14} />Review and send</Btn><Btn onClick={downloadZip} disabled={zipBusy || !packageInSync || busy !== ""}>{zipBusy ? "Building..." : "Download package"}</Btn></Row>{artifactOperation === "zip" && artifactPreparation ? <PreparationProgress {...artifactPreparation} compact /> : null}</div>}
  /> : null;

  const prototypeDetailEnabled = Boolean(workflowSteps.length);
  const headerStatus = detail
    ? intakeStatusPresentation(detail.intake.status, underwriting?.underwriting_status)
    : null;
  if (prototypeDetailEnabled) return (
    <div className="intake-file">
      <div className="intake-file-head">
        <div className="grid g6">
          <Row>
            <h3>{detail?.intake.business_name || detail?.intake.full_name || "File"}</h3>
            {detail ? <CellChip tone={probabilityTone(String(result?.probability_status || ""))}>{String(result?.probability_status || "Awaiting review")}</CellChip> : null}
            {headerStatus ? <CellChip tone={headerStatus.tone}>{headerStatus.label}</CellChip> : null}
            {forecastEarnings != null ? <CellChip tone="ok">{formatMoney(forecastEarnings)} expected earnings</CellChip> : null}
            {underwriting?.estimated_close_date ? <CellChip tone="acc">Est. close {new Date(`${underwriting.estimated_close_date}T12:00:00`).toLocaleDateString()}</CellChip> : null}
          </Row>
          <div className="sub">
            {detail ? `${variantLabel(detail.intake.variant)} · ${detail.intake.referral_source || "Direct"} · ${detail.intake.email}` : "Loading file..."}
          </div>
        </div>
        <span className="sp" />
        {detail && submissionStep !== 2 ? (
          <Btn variant="pri" onClick={submissionStep === 4 ? onRerun : submissionStep === 5 ? () => void refreshFullPackage(true) : () => setPrototypeView("workspace")} disabled={busy !== "" || rerunning || (submissionStep === 4 && mcaAutoReviewBlocked)}>
            {submissionStep === 4 ? (mcaAutoReviewBlocked ? "Desk review required" : rerunning ? "Reviewing..." : "Run AI review") : submissionStep === 5 ? (busy === "package-all" ? "Refreshing package..." : summary && packet ? "Refresh package" : "Generate package") : submissionStep === 3 ? "Open owner credit" : "Open ownership"}
          </Btn>
        ) : null}
        <input ref={headerUploadRef} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.doc,.docx,.zip,.png,.jpg,.jpeg,.webp,.heic" onChange={(event) => void uploadFromHeader(Array.from(event.target.files ?? []))} />
        {detail ? <ActionIcon icon="upload" tone={submissionStep === 2 ? "pri" : "default"} busy={headerUploading} label={headerUploading ? "Uploading..." : "Add evidence: upload files from this computer"} disabled={headerUploading || !cockpitAdapter} onClick={() => headerUploadRef.current?.click()} /> : null}
        {detail ? <ActionIcon icon="send" label="Request a document from the client" onClick={openDocumentRequest} /> : null}
        {detail && canUnderwrite ? <ActionIcon icon="bell" label="Choose who is notified about this file" onClick={() => setNotificationRoutingOpen(true)} /> : null}
        {detail && canUnderwrite ? (
          <Select
            value={underwritingDraft.underwriting_status}
            disabled={underwritingLoading || underwritingSaving}
            onChange={(event) => changeUnderwritingStatus(event.target.value as UnderwritingLifecycleStatus)}
            aria-label="Underwriting lifecycle status"
          >
            {PIPELINE_LIFECYCLE.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
          </Select>
        ) : detail ? (
          <Select value={detail.intake.outcome_status} disabled={outcomeBusy} onChange={(event) => changeOutcomeStatus(event.target.value)} aria-label="Outcome status"><option value="submitted">Submitted</option><option value="closed">Closed</option><option value="denied">Denied</option></Select>
        ) : null}
        {detail && canUnderwrite && merchantOfferStatus && ["sent", "accepted", "declined"].includes(merchantOfferStatus) ? (
          <CellChip tone={merchantOfferStatus === "accepted" ? "ok" : merchantOfferStatus === "declined" ? "bad" : "warn"}>
            Processing offer: {merchantOfferStatus}
          </CellChip>
        ) : null}
        {detail && mcaReview?.activeAdvances ? (
          <CellChip tone={mcaReview.activeAdvances.tone} title="Active merchant cash advances: declared by the client, and what the documents or chat showed">
            Active MCAs: {mcaReview.activeAdvances.text}
          </CellChip>
        ) : null}
        {detail && detail.intake.preferred_language === "es" ? <CellChip tone="acc" title="This client is written to in Spanish">Spanish client</CellChip> : null}
        <PageActionMenu label="More actions for this file" items={[
          { label: detail?.intake.preferred_language === "es" ? "Write to this client in English" : "Write to this client in Español", onSelect: () => changeLanguage(detail?.intake.preferred_language === "es" ? "en" : "es"), hidden: !detail || languageBusy },
          { label: "Open underwriting chat", onSelect: () => navigateCommunication("underwriter"), hidden: !detail },
          { label: "View client conversation", onSelect: () => navigateCommunication("client"), hidden: !detail },
          { label: "Attach another room", onSelect: onLinkBucketIntake, hidden: !detail },
          { label: "Rotate room PIN", onSelect: openRotatePin, hidden: !detail },
          { label: "Dealer partner messages", onSelect: () => navigateCommunication("partner"), hidden: !detail },
          { label: "Share production package with a rep", onSelect: () => { setPrototypeView("production"); setProductionShareOpen(true); }, hidden: !detail || !isDealerFile || !canUnderwrite },
          { label: "Record loan terms", onSelect: openTermSheet, hidden: !detail || !isDealerFile || !canUnderwrite },
          { label: "Prepare marketplace listing", onSelect: () => { setPrototypeView("financials"); setPackageTab("marketplace"); setCockpitFocus("marketplace"); }, hidden: !detail || currentUser?.role !== Role.SUPER_ADMIN },
          { label: "Archive lead", onSelect: () => setConfirmDeleteOpen(true), hidden: !detail || !canGovern },
        ]} />
        {onMinimize ? <IconBtn aria-label="Minimize file workspace" title="Minimize" onClick={onMinimize}>
          <span aria-hidden="true" className="workspace-minimize-glyph">-</span>
        </IconBtn> : null}
        <IconBtn aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </IconBtn>
      </div>

      {detail ? <CommunicationUnreadBar sms={smsUnread} email={emailUnread} error={communicationUnread.isError} fetching={communicationUnread.isFetching} onOpen={navigateCommunication} onRetry={() => void communicationUnread.refetch()} /> : null}
      {detail && artifactPreparation && prototypeView !== "financials" ? <PreparationProgress {...artifactPreparation} compact /> : null}
      {detail && packagePreparation && prototypeView !== "financials" ? <PreparationProgress {...packagePreparation} compact /> : null}

      {detail?.application_source ? <div className="intake-source-links" aria-label="Application source">
        <b>{detail.application_source.recorded ? "Application source" : "MCA application page"}</b>
        {detail.application_source.marketing_url ? <a href={detail.application_source.marketing_url} target="_blank" rel="noopener noreferrer">{detail.application_source.marketing_url}<Icon name="arrowR" size={12} /></a> : null}
        {detail.application_source.entry_url ? <a href={detail.application_source.entry_url} target="_blank" rel="noopener noreferrer">Open original application entry<Icon name="arrowR" size={12} /></a> : null}
        {!detail.application_source.recorded ? <span className="sub">The original source was not captured for this older file.</span> : null}
      </div> : null}
      {mcaAutoReviewBlocked && mcaReview ? <Callout tone="warn"><strong>{mcaReview.title}</strong><p className="m-0">{mcaReview.description}</p></Callout> : null}
      {loading || !detail ? loading ? <PreparationProgress title="Opening file" description="Loading the application, linked evidence and financial workspace." /> : null : (
        <>
          <div className="intake-tabs" role="tablist" aria-label="File detail">
            {[
              ["workspace", "File workspace"],
              ...(canUnderwrite ? [["underwriting", "Underwriting"] as const] : []),
              ...(canUnderwrite ? [["financials", "Financials"] as const] : []),
              ...(canViewPayments ? [["payments", "Payments"] as const] : []),
              ...(canUnderwrite ? [["reviewer", "Reviewer controls"] as const] : []),
              ...(canUnderwrite && isDealerFile ? [["production", "Production Package"] as const] : []),
              ["communications", "Communications"],
              ["audit", "Audit trail"],
            ].map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={prototypeView === id} className={prototypeView === id ? "on" : undefined} onClick={() => setPrototypeView(id as typeof prototypeView)}>{label}{id === "communications" ? <CommunicationUnreadBadge count={smsUnread + emailUnread} channel="client" /> : null}</button>
            ))}
          </div>

          <div className={cx(
            "intake-file-body",
            // The submission sequence belongs to the file workspace. Every other tab drops
            // it and takes the freed 260px, so its own components get the room.
            prototypeView === "workspace" && "with-sequence",
            !contextRailOpen && "context-collapsed",
            // The cockpit takes the full width; the details rail has nothing to add there.
            prototypeView === "financials" && "no-context",
          )}>
            {prototypeView === "workspace" ? (
              <aside className="submission-rail">
                <Panel title="Submission sequence" sub={`Step ${Math.max(1, workflowSteps.findIndex((step) => step.id === submissionStep) + 1)} of ${workflowSteps.length}`}>
                  <div className="submission-steps submission-steps-rail">
                    {workflowSteps.map((step) => (
                      <button key={step.id} type="button" className={cx("submission-step", `status-${step.status}`, submissionStep === step.id && "on")} onClick={() => { setSubmissionStep(step.id); setPrototypeView("workspace"); }}>
                        <span>{step.status === "complete" ? <Icon name="check" size={12} /> : step.status === "not-started" ? <Icon name="x" size={11} /> : "-"}</span>
                        <b>{step.label}</b>
                        <small>{step.status === "complete" ? "Complete" : step.status === "partial" ? "In progress" : "Not started"} · {step.sub}</small>
                      </button>
                    ))}
                  </div>
                </Panel>
              </aside>
            ) : null}

            <main className="grid intake-file-primary">
              {prototypeView === "workspace" && submissionStep === 1 ? <ApplicationVerificationWorkspace sourceKind="intake" sourceId={detail.intake.id} mode="owners-credit" onReadyForStep2={() => setSubmissionStep(2)} onStateChange={setProfileVerification} programReadiness={programReadiness} programReadinessLoading={underwritingLoading} onProgramReadinessChange={setProgramReadiness} onRefreshProgramReadiness={refreshProgramReadiness} onOpenPrograms={() => { setPrototypeView("financials"); window.setTimeout(() => document.getElementById("fc-programs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400); }} /> : null}
              {prototypeView === "workspace" && submissionStep === 2 ? (
                profileId ? <ApplicationEvidenceWorkspace
                  profileId={profileId}
                  intakeId={detail.intake.id}
                  initialTab={evidenceTab}
                  onUploadFiles={uploadFromHeader}
                  uploadBusy={headerUploading}
                  uploadStatus={uploadStatus}
                  onNotice={toast.show}
                  onRunAiReview={mcaAutoReviewBlocked ? undefined : onRerun}
                  aiReviewRunning={rerunning}
                  onAddFromDrive={() => setIngestPickerOpen(true)}
                  onAttachBucket={onLinkBucketIntake}
                  onRequestDocument={openDocumentRequest}
                  onVerificationChange={setProfileVerification}
                  onProgramReadinessChange={setProgramReadiness}
                  canAddRequirements={canUnderwrite}
                  onOpenFinancials={() => { setPrototypeView("financials"); window.setTimeout(() => document.getElementById("fc-programs")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400); }}
                  focusRequirement={evidenceFocus}
                  canCreatePrograms={currentUser?.role === Role.SUPER_ADMIN}
                  programVertical={programVerticalForVariant(detail.intake.variant)}
                  intakeVariant={detail.intake.variant}
                /> : <div className="empty">{underwritingLoading ? "Loading the unified evidence workspace..." : "The application profile could not be resolved."}</div>
              ) : null}
              {prototypeView === "workspace" && submissionStep === 4 ? (
                <Panel title={mcaAutoReviewBlocked ? mcaReview?.title ?? "MCA refinance review" : "AI review"} actions={<Btn variant="pri" onClick={onRerun} disabled={rerunning || mcaAutoReviewBlocked}>{mcaAutoReviewBlocked ? "Automatic review disabled" : rerunning ? "Reviewing..." : reviewComplete ? "Re-run review" : "Run AI review"}</Btn>}>
                  <section className="ai-review-overview" aria-label="AI review overview">
                    <div className="ai-review-summary-strip">
                      <div className="ai-review-summary-primary">
                        <span>Probability</span>
                        <strong>{String(result?.probability_status || "Awaiting evidence")}</strong>
                      </div>
                      <button type="button" onClick={openEvidenceFiles} aria-label={`Open ${evidenceFileCount} evidence file${evidenceFileCount === 1 ? "" : "s"}`}>
                        <span>Evidence</span>
                        <strong className="num">{evidenceFileCount}</strong>
                        <small>files</small>
                        <Icon name="arrowR" size={13} />
                      </button>
                      {reviewMissingItems.length ? <button type="button" className="needs" onClick={() => openReviewDestination(reviewDestination(reviewMissingItems[0].query))} aria-label={`Open ${reviewMissingItems.length} missing item${reviewMissingItems.length === 1 ? "" : "s"}`}>
                        <span>Missing</span>
                        <strong className="num">{reviewMissingItems.length}</strong>
                        <small>{reviewMissingItems.length === 1 ? "item" : "items"}</small>
                        <Icon name="arrowR" size={13} />
                      </button> : <div className="ai-review-summary-complete"><span>Missing</span><strong className="num">0</strong><small>items</small><Icon name="check" size={13} /></div>}
                    </div>
                    {reviewMissingItems.length ? <nav className="ai-review-missing-items" aria-label="Open missing requirements">
                      <span className="lbl">Open items</span>
                      <div>{reviewMissingItems.map((item) => <button key={item.title} type="button" title={item.detail || item.title} aria-label={`Open missing item: ${item.title}${item.detail ? `. ${item.detail}` : ""}`} onClick={() => openReviewDestination(reviewDestination(item.query))}><span>{item.title}</span><Icon name="arrowR" size={12} /></button>)}</div>
                    </nav> : null}
                    <div className="ai-review-next-action"><span className="lbl">Next best action</span><p>{mcaAutoReviewBlocked ? mcaReview?.description : programReadiness?.can_advance
                      ? "Canonical evidence requirements are complete. Advance the file to underwriting."
                      : canonicalMissingDocuments.length
                        ? `Collect ${canonicalMissingDocuments.map((document) => document.name).join(", ")}.`
                        : String(result?.one_next_step || result?.executive_summary || "Run the review after the evidence room is complete.")}</p></div>
                    {/* The review reads as one verdict, what is still open, and where a
                        person overrides. Everything the engines computed stays one click
                        away instead of stacked under the verdict. */}
                    <div className="ai-review-overrides"><span className="lbl">Overrides</span><p>The AI accepts what it validated. A person corrects or overrides any decision from the requirements list.</p><Btn onClick={() => setSubmissionStep(2)}>Review requirements and override</Btn></div>
                    <details className="ai-review-breakdown">
                      <summary>Full breakdown: capital readiness, intelligence and extracted facts</summary>
                      {profileId ? <CapitalReadinessPanel profileId={profileId} locale={currentUser?.ui_locale === "es" ? "es" : "en"} canReview={canUnderwrite} /> : null}
                      <ApplicationIntelligencePanel sourceKind="intake" sourceId={detail.intake.id} onAction={(action) => openReviewDestination(intelligenceActionDestination(action))} />
                      <ExtractedFactsReview sourceKind="intake" sourceId={detail.intake.id} />
                    </details>
                  </section>
                </Panel>
              ) : null}
              {canUnderwrite ? (
                <div hidden={prototypeView !== "financials"}>
                {profileId ? (
                  <FinancialCockpit
                    key={profileId}
                    profileId={profileId}
                    termsRequest={financingTermsRequest?.profileId === profileId ? financingTermsRequest.sequence : 0}
                    coverageRequest={financingCoverageRequest?.profileId === profileId ? financingCoverageRequest.sequence : 0}
                    onWorkingFinancingChange={setWorkingFinancing}
                    businessName={detail.intake.business_name || detail.intake.full_name}
                    canPublish={currentUser?.role === Role.SUPER_ADMIN}
                    canRecordTerms={isDealerFile && canUnderwrite}
                    canUnderwrite={canUnderwrite}
                    programReadiness={programReadiness}
                    onProgramReadinessChange={setProgramReadiness}
                    onRefreshProgramReadiness={refreshProgramReadiness}
                    canCreatePrograms={currentUser?.role === Role.SUPER_ADMIN}
                    programVertical={programVerticalForVariant(detail.intake.variant)}
                    intakeVariant={detail.intake.variant}
                    termSheet={termSheet}
                    renderFundingPackage={renderFundingPackage}
                    packageState={{
                      generated: Boolean(summary && packet),
                      inSync: packageInSync,
                      summaryVersion: summary ? artifactVersion(summary, summaryHistory.length) : null,
                      packetVersion: packet ? artifactVersion(packet, packetHistory.length) : null,
                    }}
                    focus={cockpitFocus}
                    onFocusHandled={() => setCockpitFocus(null)}
                    onRecordTerms={openTermSheet}
                    onEconomicsSaved={() => { void loadUnderwritingState(); }}
                    termsKind={isDealerFile ? "production" : "client"}
                    onOpenEvidence={() => { setPrototypeView("workspace"); setSubmissionStep(2); }}
                    onOpenPackage={() => { setPackageTab("summary"); setPrototypeView("financials"); window.setTimeout(() => document.getElementById("package-readiness")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); }}
                  />
                ) : <div className="empty">{underwritingLoading ? "Resolving the application profile..." : "The application profile could not be resolved."}</div>}
                </div>
              ) : null}
              {prototypeView === "financials" && canUnderwrite && profileId ? (
                <div className="grid g12">
                  <FileSection
                    id="readiness"
                    title="Capital readiness"
                    summary={"Financial intelligence, score and policy for this file"}
                    status={null}
                    open={uwSections.isOpen("readiness", false)}
                    onToggle={() => uwSections.toggle("readiness", false)}
                  >
                    <CapitalReadinessPanel profileId={profileId} locale={currentUser?.ui_locale === "es" ? "es" : "en"} canReview={canUnderwrite} />
                  </FileSection>
                </div>
              ) : null}
              {prototypeView === "underwriting" && canUnderwrite ? (
                <div className="grid g12">
                <Panel
                  title="Underwriting"
                  sub="One workspace for client terms, marketplace publication, client response and closing."
                  actions={<Row>{underwriting?.loan_id ? <Link href={`/loans/${underwriting.loan_id}`} className="btn">Open funding file</Link> : <Btn onClick={() => changeUnderwritingStatus("in_underwriting")} disabled={underwritingSaving}>Create funding file</Btn>}</Row>}
                >
                  {underwritingLoading || !underwriting?.profile_id ? <div className="empty">Loading underwriting…</div> : (
                    <UnderwritingFlow
                      key={underwriting.profile_id}
                      profileId={underwriting.profile_id}
                      terms={termsOnFile}
                      termsLoading={!isDealerFile && clientTermsQuery.isLoading}
                      financing={currentFinancing}
                      requestedAmount={detail.intake.requested_loan_amount}
                      onCoveragePlan={requestSharedCoverage}
                      termsActions={isDealerFile && termSheet?.current ? (
                        <DealerTermSheetDocumentActions
                          profileId={underwriting.profile_id}
                          terms={termSheet.current}
                          contactSuppressed={Boolean(detail.intake.client_contact_suppressed)}
                          onEdit={openTermSheet}
                          selected={Boolean(productionTermSelection && selectedOfferKeys.includes(productionTermSelection.key))}
                          onSelectedChange={(selected) => setOfferSelected(productionTermSelection, selected)}
                          onCompose={() => openOfferComposer(productionTermSelection)}
                        />
                      ) : null}
                      onEditTerms={requestSharedTerms}
                      publication={marketplacePublication?.profileId === underwriting.profile_id ? {
                        published: marketplacePublication.isPublished,
                        label: marketplacePublication.loading ? "Reading publication…" : marketplacePublication.error ? "Publication status unavailable" : marketplacePublicationLabel(marketplacePublication.status),
                      } : undefined}
                      marketplace={<div className="grid g12">
                        <MarketplacePublishStrip profileId={underwriting.profile_id} packageInSync={packageInSync} canPublish={currentUser?.role === Role.SUPER_ADMIN} onPublicationState={setMarketplacePublication} onStartListing={() => { setPrototypeView("financials"); setPackageTab("marketplace"); setCockpitFocus("marketplace"); }} />
                        <Row><Btn onClick={() => { setPrototypeView("financials"); setPackageTab("summary"); window.setTimeout(() => document.getElementById("package-readiness")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120); }}><Icon name="file" size={14} />{packageInSync ? "Review investor package" : "Prepare investor package"}</Btn></Row>
                      </div>}
                      underwriting={underwriting}
                      statusLabel={underwritingStatusLabel(underwriting?.underwriting_status ?? underwritingDraft.underwriting_status)}
                      draft={underwritingDraft}
                      onDraftChange={(patch) => setUnderwritingDraft((current) => ({ ...current, ...patch }))}
                      saving={underwritingSaving}
                      error={underwritingError}
                      onRecordAcceptance={(patch) => { void saveUnderwritingPatch(patch); }}
                      onStatusChange={changeUnderwritingStatus}
                      onResponseRecorded={refreshUnderwritingFromResponse}
                      onEditFees={() => setPrototypeView("financials")}
                      forecastEarnings={forecastEarnings}
                      feeInfo={{ vertical: dealEconomicsVertical, capPercent: underwriting?.qc_fee_cap_percent, reviewRequired: underwriting?.qc_fee_review_required, reviewReason: underwriting?.qc_fee_review_reason, label: underwriting?.fee_label }}
                      offer={{
                        termsSelection: productionTermSelection ?? applicationTermSelection ?? clientTermsSelection,
                        merchantSelection: merchantOfferSelection,
                        merchantStatus: merchantOfferStatus,
                        merchantStrip: (
                          <MerchantOfferStrip
                            profileId={underwriting.profile_id}
                            onStatus={setMerchantOfferStatus}
                            selected={Boolean(merchantOfferSelection && selectedOfferKeys.includes(merchantOfferSelection.key))}
                            onSelectedChange={(selected) => setOfferSelected(merchantOfferSelection, selected)}
                            onOfferReady={handleMerchantOfferReady}
                            onCompose={() => openOfferComposer(merchantOfferSelection)}
                            onTargetDscr={(value) => {
                              setUnderwritingDraft((current) => ({ ...current, target_dscr: value.toFixed(2) }));
                              setPrototypeView("reviewer");
                            }}
                          />
                        ),
                        selectedKeys: selectedOfferKeys,
                        onSelectedKeys: setSelectedOfferKeys,
                        onCompose: () => openOfferComposer(),
                        receipt: offerDeliveryReceipt,
                        contactSuppressed: Boolean(detail.intake.client_contact_suppressed),
                      }}
                      loanId={underwriting?.loan_id ?? null}
                      onCreateFundingFile={() => changeUnderwritingStatus("in_underwriting")}
                      canUnderwrite={canUnderwrite}
                    />
                  )}
                </Panel>
                </div>
              ) : null}

              {prototypeView === "payments" && canViewPayments ? (
                <PaymentsWorkspace
                  compact
                  profileId={profileId}
                  sourceLabel={detail.intake.business_name || detail.intake.full_name}
                />
              ) : null}

              {prototypeView === "reviewer" && canUnderwrite ? (
                <Panel
                  title="Reviewer controls"
                  sub="Set the policy target, record internal notes, and make the desk's lifecycle decision. Deal economics are managed in Underwriting."
                  actions={<Btn variant="pri" onClick={saveUnderwritingDraft} disabled={underwritingLoading || underwritingSaving}>{underwritingSaving ? "Saving..." : "Save review"}</Btn>}
                >
                  {underwritingError ? <WarnLine>{underwritingError}</WarnLine> : null}
                  {underwritingLoading ? <div className="empty">Loading reviewer controls...</div> : (
                    <div className="grid g12">
                      <div className="terms-review-controls">
                        <FinancingProposalSummary value={currentFinancing} saved={underwriting?.financing} requestedAmount={detail.intake.requested_loan_amount} onEdit={requestSharedTerms} onCoverage={requestSharedCoverage} />
                        <div className="fldgrid two">
                          <Field label="Lifecycle status">
                            <Select aria-label="Lifecycle status" value={underwritingDraft.underwriting_status} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, underwriting_status: event.target.value as UnderwritingLifecycleStatus })}>
                              {PIPELINE_LIFECYCLE.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                            </Select>
                          </Field>
                          <Field label="Policy target DSCR">
                            <Input aria-label="Policy target DSCR" inputMode="decimal" value={underwritingDraft.target_dscr} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, target_dscr: event.target.value })} placeholder="1.25" />
                          </Field>
                          <Field label="Funded amount" hint="Record the actual gross amount once the file is funded.">
                            <Input aria-label="Funded amount" type="number" inputMode="decimal" min="0" step="0.01" value={underwritingDraft.funded_amount} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, funded_amount: event.target.value })} placeholder="0.00" />
                          </Field>
                        </div>
                        <Field label="Reviewer notes" hint="Internal only — these notes never appear on the client PDF.">
                          <Textarea aria-label="Reviewer notes" rows={6} value={underwritingDraft.reviewer_notes} onChange={(event) => setUnderwritingDraft({ ...underwritingDraft, reviewer_notes: event.target.value })} placeholder="Record underwriting conditions, exceptions, committee notes, or close reason." />
                        </Field>
                      </div>
                      <div className="underwriting-close-actions">
                        <Btn onClick={() => changeUnderwritingStatus("term_sheet_provided")} disabled={underwritingSaving}>Term sheet provided</Btn>
                        <Btn onClick={() => changeUnderwritingStatus("approved")} disabled={underwritingSaving}>Approved</Btn>
                        <Btn onClick={() => changeUnderwritingStatus("closed_won")} disabled={underwritingSaving}>Closed / funded</Btn>
                        <Btn onClick={() => changeUnderwritingStatus("closed_lost")} disabled={underwritingSaving}>Closed lost</Btn>
                        <Btn className="danger" onClick={() => changeUnderwritingStatus("denied")} disabled={underwritingSaving}>Denied</Btn>
                      </div>
                    </div>
                  )}
                </Panel>
              ) : null}

              {prototypeView === "communications" ? (
                <div className="intake-communications">
                  {underwriting?.profile_id ? <ApplicationMissingItemCommunications profileId={underwriting.profile_id} /> : null}
                  <div className="intake-channel-tabs" role="tablist" aria-label="Intake communication channel">
                    {([['updates', 'Updates'], ['underwriter', 'Underwriter AI'], ['client', 'Client conversation'], ['email', 'Email'], ['partner', 'Partner channel'], ['internal', 'Internal notes']] as const).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={communicationChannel === id} className={communicationChannel === id ? "on" : undefined} onClick={() => navigateCommunication(id)}>{label}{id === "client" ? <CommunicationUnreadBadge count={smsUnread} channel="SMS" /> : id === "email" ? <CommunicationUnreadBadge count={emailUnread} channel="email" /> : null}</button>)}
                  </div>
                  {communicationChannel === "updates" ? <FileTimeline profileId={profileId} tier="desk" /> : null}
                  {communicationChannel === "underwriter" ? (cockpitResponse && cockpitAdapter ? <div className="intake-underwriter-stage"><LeadCockpit hideFinancialForms response={cockpitResponse} adapter={cockpitAdapter} variant={detail.intake.variant} initialMessages={detail.messages} onResponse={handleCockpitResponse} onRequestRerun={onRerun} programReadiness={programReadiness} /></div> : <div className="empty">Loading the private underwriting conversation...</div>) : null}
                  {communicationChannel === "client" && cockpitAdapter ? <AIIntakeClientConversation adapter={cockpitAdapter} intakeId={detail.intake.id} profileId={underwriting?.profile_id ?? profileId} clientName={detail.intake.full_name} /> : null}
                  {communicationChannel === "email" ? communicationProfileId ? <AIIntakeEmailWorkspace key={communicationProfileId} profileId={communicationProfileId} intakeId={detail.intake.id} initialThreadId={initialEmailThreadId} onThreadNavigate={onEmailThreadNavigate} clientName={detail.intake.full_name} contactSuppressed={Boolean(detail.intake.client_contact_suppressed)} offerSelectionCount={availableOfferSelections.length} onComposeOffer={openCurrentOffersComposer} /> : <div className="empty">Email is unavailable until this file’s communication profile can be loaded.</div> : null}
                  {communicationChannel === "partner" ? <UnifiedThreadConversation threadId={`intake:${detail.intake.id}:partner`} emptyLabel="No dealer-partner messages yet." /> : null}
                  {communicationChannel === "internal" ? <UnifiedThreadConversation threadId={`intake:${detail.intake.id}:internal`} emptyLabel="No private internal notes yet." /> : null}
                </div>
              ) : null}

              {isDealerFile ? (
                <div hidden={prototypeView !== "production"}>
                <ProductionPackageTab intakeId={detail.intake.id} shareOpen={productionShareOpen} onShareClose={() => setProductionShareOpen(false)} termSheetOpen={productionTermSheetOpen} onTermSheetClose={closeTermSheet} />
                </div>
              ) : null}

              {prototypeView === "audit" ? (
                <Panel title="Audit trail">
                  <ApplicationAuditTimeline sourceKind="intake" sourceId={detail.intake.id} />
                </Panel>
              ) : null}
            </main>
            {contextRailOpen ? (
              <aside className="grid intake-file-context">
                <div className="context-rail-toolbar">
                  <span>File details</span>
                  <IconBtn onClick={() => setContextRailOpen(false)} aria-label="Collapse file details" title="Collapse file details">
                    <Icon name="chevR" size={15} />
                  </IconBtn>
                </div>
                <Panel
                  title="Contact"
                  actions={
                    <IconBtn onClick={() => setContactEditOpen(true)} aria-label="Edit contact details" title="Edit contact details">
                      <Icon name="pencil" size={14} />
                    </IconBtn>
                  }
                >
                  <Line label="Legal entity / LLC" value={detail.intake.business_name || "-"} />
                  <BusinessContactDetails values={detail.intake} />
                  <Line label="Principal" value={detail.intake.full_name} />
                  <EmailContact email={detail.intake.email} onCompose={canUnderwrite ? () => setContactPopup("email") : undefined} />
                  <PhoneContact phone={detail.intake.phone} firstName={(detail.intake.full_name || "").split(" ")[0]} onText={canUnderwrite ? () => setContactPopup("text") : undefined} />
                  <FundingRequestControl profileId={profileId} role={currentUser?.role} fallbackAmount={detail.intake.requested_loan_amount} onSaved={async () => { await onFundingRequestSaved?.(); await refreshProgramReadiness(); }} />
                  <Line label="Approved" value={underwriting?.approved_amount == null ? "Not approved" : formatMoney(underwriting.approved_amount)} />
                  <Line label="Accepted" value={underwriting?.accepted_amount == null ? "Not recorded" : formatMoney(underwriting.accepted_amount)} />
                  <Line label="Origination fee" value={underwriting?.forecast_fee_points == null ? "Not configured" : `${underwriting.forecast_fee_points.toFixed(2)}%`} />
                  <Line label="Consulting fee" value={underwriting?.forecast_consulting_fee == null ? "None" : formatMoney(underwriting.forecast_consulting_fee)} />
                  <Line label="Accepted-basis fee projection" value={formatMoney(forecastEarnings)} />
                  <Line label="Estimated closing" value={underwriting?.estimated_close_date ? new Date(`${underwriting.estimated_close_date}T12:00:00`).toLocaleDateString() : "Not scheduled"} />
                  <Line label="Purpose" value={detail.intake.loan_purpose || "-"} />
                  <Line label="Credit" value={detail.intake.estimated_credit_score ? String(detail.intake.estimated_credit_score) : "-"} />
                  <Line label="Source" value={detail.intake.referral_source || "Direct"} />
                  <Line label="Vertical" value={variantLabel(detail.intake.variant)} />
                </Panel>
                <FileTeamStrip profileId={profileId} canEdit={canUnderwrite} />
                <ApplicationClassificationPanel sourceKind="intake" sourceId={detail.intake.id} />
                <Panel title="Missing and blockers"><CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty={detail.latest_review ? "No blockers listed in the latest review." : "AI review has not run yet."} /></Panel>
              </aside>
            ) : (
              <aside className="intake-file-context-collapsed">
                <button type="button" className="context-rail-expand" onClick={() => setContextRailOpen(true)} aria-label="Expand file details" title="Expand file details">
                  <Icon name="chevL" size={15} />
                  <span>Details</span>
                </button>
              </aside>
            )}
          </div>
        </>
      )}

      {detail && underwriting?.profile_id ? <OfferDeliveryComposer
        profileId={underwriting.profile_id}
        clientName={detail.intake.full_name}
        open={offerComposerOpen && selectedOfferSelections.length > 0}
        selections={selectedOfferSelections}
        contactSuppressed={Boolean(detail.intake.client_contact_suppressed)}
        onClose={() => setOfferComposerOpen(false)}
        onSent={(receipt) => {
          setOfferDeliveryReceipt(receipt);
          setMerchantOfferStatus((current) => receipt.items.some((item) => item.kind === "merchant_offer") ? "sent" : current);
        }}
      /> : null}
      {detail ? <IntakeNotificationRoutingDrawer
        open={notificationRoutingOpen}
        onClose={() => setNotificationRoutingOpen(false)}
        intakeId={detail.intake.id}
        fileLabel={detail.intake.business_name || detail.intake.full_name || "AI Intake file"}
      /> : null}
      <Drawer
        open={pendingApprovalPatch != null}
        onClose={cancelApproval}
        title="Record approval"
        sub={detail ? `${detail.intake.business_name || detail.intake.full_name || "This file"} will move from ${underwritingStatusLabel(underwriting?.underwriting_status)} to Approved.` : undefined}
        width="md"
        closeOnBackdrop={!underwritingSaving}
        footer={(
          <>
            <Btn style={{ minHeight: 44 }} onClick={cancelApproval} disabled={underwritingSaving}>Cancel</Btn>
            <span className="sp" />
            <Btn style={{ minHeight: 44 }} variant="pri" onClick={() => void confirmApproval()} disabled={underwritingSaving}>
              {underwritingSaving ? "Approving..." : "Confirm approval"}
            </Btn>
          </>
        )}
      >
        {underwritingError ? <WarnLine>{underwritingError}</WarnLine> : null}
        <div className="review-list" style={{ marginBottom: 16 }}>
          <div><b>Approval record</b></div>
          <div className="sub">The amount, optional DSCR, notes, and lifecycle change are saved together in one pipeline move.</div>
          <div className="sub">If this intake has no funding file, the move creates or reuses its linked funding loan.</div>
        </div>
        <PipelineApprovalFields
          value={approvalDraft}
          onChange={(value) => {
            setApprovalDraft(value);
            setApprovalError(null);
            setUnderwritingError(null);
          }}
          error={approvalError}
          autoFocus
        />
      </Drawer>
      <Toast msg={toast.msg} />
      <DriveFilePicker open={ingestPickerOpen} mode="ingest" busy={busy === "ingest"} maxSelect={50} onClose={() => setIngestPickerOpen(false)} selectedIds={ingestFiles.map((file) => file.id)} onPick={(file) => setIngestFiles((current) => current.some((item) => item.id === file.id) ? current : [...current, file])} onUnpick={(id) => setIngestFiles((current) => current.filter((file) => file.id !== id))} onConfirm={runIngest} />
      {detail && canDelete ? <ConfirmDeleteLeadModal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} expectedName={detail.intake.business_name || detail.intake.full_name} onConfirm={async (name) => { await onConfirmDeletion(name); setConfirmDeleteOpen(false); }} /> : null}
      <ConfirmDialog open={sendReviewOpen} onClose={() => setSendReviewOpen(false)} title={`Send investor package to ${toEmails || "recipient"}`} body="This sends the reviewed message and selected package from the connected desk mailbox and records the delivery result." confirmLabel="Send package" busy={busy === "send"} onConfirm={() => { void sendEmail().then(() => setSendReviewOpen(false)); }} />
      <Drawer
        open={contactPopup === "text"}
        onClose={() => setContactPopup(null)}
        title={`Text ${detail?.intake.full_name || "the client"}`}
        sub="The client conversation. Replies go to their secure portal and, when they have agreed to texts, to their phone."
        width="lg"
        footer={<><Btn onClick={() => { setContactPopup(null); navigateCommunication("client"); }}>Open in Communications</Btn><span className="sp" /><Btn onClick={() => setContactPopup(null)}>Close</Btn></>}
      >
        {contactPopup === "text" && detail ? (
          cockpitAdapter ? (
            <AIIntakeClientConversation adapter={cockpitAdapter} intakeId={detail.intake.id} profileId={underwriting?.profile_id ?? null} clientName={detail.intake.full_name} preferSms />
          ) : <div className="empty"><span className="spinner solo" />Loading the client conversation...</div>
        ) : null}
      </Drawer>
      <Drawer
        open={contactPopup === "email"}
        onClose={() => setContactPopup(null)}
        title={`Email ${detail?.intake.full_name || "the client"}`}
        sub="Written from your connected mailbox and kept on the file."
        width="lg"
        footer={<><Btn onClick={() => { setContactPopup(null); navigateCommunication("email"); }}>Open in Communications</Btn><span className="sp" /><Btn onClick={() => setContactPopup(null)}>Close</Btn></>}
      >
        {contactPopup === "email" && detail ? (
          underwriting?.profile_id ? (
            <AIIntakeEmailWorkspace key={`popup-${underwriting.profile_id}`} profileId={underwriting.profile_id} intakeId={detail.intake.id} clientName={detail.intake.full_name} contactSuppressed={Boolean(detail.intake.client_contact_suppressed)} startComposing />
          ) : <div className="empty"><span className="spinner solo" />Loading email...</div>
        ) : null}
      </Drawer>
      <Drawer
        open={contactEditOpen}
        onClose={() => setContactEditOpen(false)}
        title="Edit contact and entity"
        sub="Update the intake record without changing other files owned by this client."
        width="md"
        footer={<><span className="sp" /><Btn onClick={() => setContactEditOpen(false)} disabled={contactSaving}>Cancel</Btn><Btn variant="pri" onClick={() => void saveContact()} disabled={contactSaving}>{contactSaving ? "Saving..." : "Save details"}</Btn></>}
      >
        <div className="fldgrid two">
          <Field label="Principal name"><Input aria-label="Principal name" value={contactDraft.full_name} onChange={(event) => setContactDraft({ ...contactDraft, full_name: event.target.value })} /></Field>
          <Field label="Legal entity / LLC"><Input aria-label="Legal entity / LLC" value={contactDraft.business_name} onChange={(event) => setContactDraft({ ...contactDraft, business_name: event.target.value })} /></Field>
          <Field label="Email"><Input aria-label="Email" type="email" value={contactDraft.email} onChange={(event) => setContactDraft({ ...contactDraft, email: event.target.value })} /></Field>
          <Field label="Mobile"><Input aria-label="Mobile" type="tel" value={contactDraft.phone} onChange={(event) => setContactDraft({ ...contactDraft, phone: event.target.value })} /></Field>
          <BusinessContactFields value={contactDraft} onChange={(patch) => setContactDraft((current) => ({ ...current, ...patch }))} />
          <Field label="Current requested amount" hint="Use the edit icon next to Current request in File details to update the amount and its use of funds together."><Input aria-label="Requested amount (read only)" value={formatMoney(detail?.intake.requested_loan_amount)} readOnly /></Field>
          <Field label="Estimated credit"><Input aria-label="Estimated credit" type="number" min="300" max="850" value={contactDraft.estimated_credit_score} onChange={(event) => setContactDraft({ ...contactDraft, estimated_credit_score: event.target.value })} /></Field>
          <Field label="Years in business"><Input aria-label="Years in business" type="number" min="0" max="150" step="0.5" value={contactDraft.years_in_business} onChange={(event) => setContactDraft({ ...contactDraft, years_in_business: event.target.value })} /></Field>
          <Field label="Website" hint="Type N/A if the business has none."><Input aria-label="Website" inputMode="url" value={contactDraft.business_website} onChange={(event) => setContactDraft({ ...contactDraft, business_website: event.target.value })} /></Field>
          <Field label="Loan purpose"><Input aria-label="Loan purpose" value={contactDraft.loan_purpose} onChange={(event) => setContactDraft({ ...contactDraft, loan_purpose: event.target.value })} /></Field>
          <Field label="Referral source"><Input aria-label="Referral source" value={contactDraft.referral_source} onChange={(event) => setContactDraft({ ...contactDraft, referral_source: event.target.value })} /></Field>
        </div>
        <Field label="About the business" hint="What the client does, in their words or yours."><Textarea aria-label="About the business" rows={3} maxLength={1000} value={contactDraft.business_description} onChange={(event) => setContactDraft({ ...contactDraft, business_description: event.target.value })} /></Field>
      </Drawer>
      <Drawer
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        title="Request missing evidence"
        sub="Add a required item to the client room. The request is recorded in the room audit trail."
        width="md"
        closeOnBackdrop={!requestSaving}
        footer={requestResult ? <><span className="sp" /><Btn variant="pri" onClick={() => setRequestOpen(false)}>Done</Btn></> : <><span className="sp" /><Btn onClick={() => setRequestOpen(false)} disabled={requestSaving}>Cancel</Btn><Btn variant="pri" onClick={() => void createDocumentRequest()} disabled={requestSaving || requestDraft.name.trim().length < 2}>{requestSaving ? "Creating..." : "Create request"}</Btn></>}
      >
        {requestResult ? <div className="grid g12">
          <Callout tone={requestResult.overall_status === "success" ? "ok" : requestResult.overall_status === "failed" ? "bad" : "warn"} icon={<Icon name={requestResult.overall_status === "success" ? "check" : "alert"} size={16} />}>
            {requestResult.overall_status === "success" ? "The request was created and the provider accepted every selected delivery." : requestResult.overall_status === "partial" ? "The request was created, but one selected channel did not send." : requestResult.overall_status === "failed" ? "The request is in the room, but delivery was not accepted." : "The request is in the room and was not sent."}
          </Callout>
          <div className="request-delivery-results">{requestResult.deliveries.map((receipt) => <div key={receipt.id}><span className="request-delivery-icon"><Icon name={receipt.provider_accepted ? "check" : receipt.channel === "none" ? "link" : "alert"} size={14} /></span><div className="grow"><b>{receipt.channel === "none" ? "Created without sending" : receipt.channel.toUpperCase()} {receipt.recipient_masked ? `· ${receipt.recipient_masked}` : ""}</b><span className="sub">{receipt.detail || receipt.status} · {formatDateTime(receipt.created_at)}</span></div><CellChip tone={receipt.provider_accepted ? "ok" : receipt.channel === "none" ? "mut" : "bad"}>{receipt.status}</CellChip></div>)}</div>
          <Row><Btn onClick={() => void navigator.clipboard.writeText(requestResult.room_url)}><Icon name="copy" size={14} />Copy room link</Btn>{requestResult.deliveries.some((receipt) => receipt.channel !== "none" && !receipt.provider_accepted) ? <Btn onClick={() => void retryRequestDelivery()} disabled={requestSaving}><Icon name="refresh" size={14} />{requestSaving ? "Retrying..." : "Retry failed delivery"}</Btn> : null}</Row>
          <Callout tone="warn">The room PIN is never included in this email. Share it separately.</Callout>
        </div> : <div className="grid g12">
          <Field label="Document or information needed"><Input autoFocus value={requestDraft.name} onChange={(event) => setRequestDraft({ ...requestDraft, name: event.target.value })} placeholder="Current year profit and loss statement" /></Field>
          <Field label="Category"><Select value={requestDraft.category} onChange={(event) => setRequestDraft({ ...requestDraft, category: event.target.value })}><option>Business documents</option><option>Bank statements</option><option>Tax returns</option><option>Ownership</option><option>Collateral</option><option>Debts</option><option>Personal financials</option><option>Other</option></Select></Field>
          <Field label="Client instructions"><Textarea value={requestDraft.description} onChange={(event) => setRequestDraft({ ...requestDraft, description: event.target.value })} placeholder="Describe the period, entity, and pages needed." /></Field>
          <label className="verification-sms"><input type="checkbox" checked={requestDraft.allow_multiple_files} onChange={(event) => setRequestDraft({ ...requestDraft, allow_multiple_files: event.target.checked })} />Allow multiple files for this request</label>
          <div className="fldgrid two"><Field label="Recipient email"><Input type="email" value={requestDraft.recipient_email} onChange={(event) => setRequestDraft({ ...requestDraft, recipient_email: event.target.value })} /></Field><Field label="Recipient phone"><Input type="tel" value={requestDraft.recipient_phone} onChange={(event) => setRequestDraft({ ...requestDraft, recipient_phone: event.target.value })} /></Field></div>
          <div className="request-channel-options">
            <label className={cx("pick", requestDraft.email_room_link && "on")}><input type="checkbox" checked={requestDraft.email_room_link} onChange={(event) => setRequestDraft({ ...requestDraft, email_room_link: event.target.checked })} />Email room link</label>
            <label className={cx("pick", requestDraft.sms_reminder && "on")}><input type="checkbox" checked={requestDraft.sms_reminder} onChange={(event) => setRequestDraft({ ...requestDraft, sms_reminder: event.target.checked })} />SMS reminder when consent exists</label>
            <label className={cx("pick", !requestDraft.email_room_link && !requestDraft.sms_reminder && "on")}><input type="radio" checked={!requestDraft.email_room_link && !requestDraft.sms_reminder} onChange={() => setRequestDraft({ ...requestDraft, email_room_link: false, sms_reminder: false })} />Create without sending</label>
          </div>
          <Callout tone="warn" icon={<Icon name="alert" size={15} />}>This changes the client checklist immediately. Review the title and instructions before creating it.</Callout>
        </div>}
      </Drawer>
      <Drawer
        open={rotatePinOpen}
        onClose={() => setRotatePinOpen(false)}
        title={rotatePinDone ? "Room PIN rotated" : "Review before running"}
        sub={rotatePinDone ? "The previous PIN was invalidated immediately." : "Rotate the secure application-room PIN."}
        width="md"
        closeOnBackdrop={!rotatePinSaving}
        footer={<><span className="sp" />{rotatePinDone ? <Btn variant="pri" onClick={() => setRotatePinOpen(false)}>Done</Btn> : <><Btn onClick={() => setRotatePinOpen(false)} disabled={rotatePinSaving}>Cancel</Btn><Btn variant="pri" onClick={() => void rotateApplicationRoomPin()} disabled={rotatePinSaving || !/^\d{6}$/.test(rotatePin) || rotatePin !== rotatePinConfirm}>{rotatePinSaving ? "Rotating..." : "Rotate room PIN"}</Btn></>}</>}
      >
        {rotatePinDone ? <div className="grid g12"><Callout tone="ok" icon={<Icon name="check" size={16} />}>The new PIN is active. Share it separately from the room link.</Callout><div className="secure-room-created-grid"><div><span className="lbl">New room PIN</span><b className="secure-room-pin num">{rotatePin}</b><Btn onClick={() => void navigator.clipboard.writeText(rotatePin)}><Icon name="copy" size={14} />Copy PIN</Btn></div></div></div> : <div className="grid g12"><Callout tone="warn" icon={<Icon name="alert" size={16} />}>This immediately invalidates the current PIN. Existing room URLs remain valid, but the client must use the new PIN.</Callout><div className="fldgrid two"><Field label="New six-digit PIN"><Input value={rotatePin} onChange={(event) => setRotatePin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" /></Field><Field label="Confirm PIN"><Input value={rotatePinConfirm} onChange={(event) => setRotatePinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" /></Field></div><div className="review-effects"><div><span>Actor</span><b>Current operator</b></div><div><span>Execution</span><b>Immediately</b></div><div><span>Reversible</span><b>Rotate again</b></div></div></div>}
      </Drawer>
      <BucketWorkspaceOverlay bucketId={openBucketId} onClose={() => setOpenBucketId(null)} />
    </div>
  );

  return (
    <div className="panel" style={{ minHeight: 0 }}>
      <div className="panel-h" style={{ flexShrink: 0 }}>
        <div style={{ minWidth: 0 }}>
          <h3>{detail?.intake.business_name || detail?.intake.full_name || "AI lead"}</h3>
          <p className="sub">
            {detail ? `${variantLabel(detail.intake.variant)} · ${detail.intake.email}` : "Loading"}
          </p>
        </div>
        <span className="sp" />
        <Btn
          aria-label="Messages with the dealer partner"
          title="Messages with the dealer partner"
          onClick={() => setNotesOpen(true)}
        >
          <Icon name="chat" size={14} /> Messages
          {detail?.notes && detail.notes.length > 0 ? (
            <span className="cnt sm">{detail.notes.length}</span>
          ) : null}
        </Btn>
        {detail ? (
          <Select
            value={detail.intake.outcome_status}
            disabled={outcomeBusy}
            onChange={(e) => changeOutcomeStatus(e.target.value)}
            aria-label="Outcome status"
          >
            <option value="submitted">Submitted</option>
            <option value="closed">Closed</option>
            <option value="denied">Denied</option>
          </Select>
        ) : null}
        {detail ? (
          <Select
            value={detail.intake.preferred_language}
            disabled={languageBusy}
            onChange={(e) => changeLanguage(e.target.value)}
            title="Client language"
            aria-label="Client language"
          >
            <option value="en">English</option>
            <option value="es">Español</option>
          </Select>
        ) : null}
        {detail?.intake.delete_requested_at ? (
          <CellChip tone="warn" title={`Requested by ${detail.intake.delete_requested_by || "unknown"} on ${new Date(detail.intake.delete_requested_at).toLocaleString()}`}>
            Partner requested delete
          </CellChip>
        ) : null}
        {canDelete ? <Btn disabled={deletionBusy} onClick={() => setConfirmDeleteOpen(true)}>Archive lead</Btn> : null}
        {canDelete && detail?.intake.delete_requested_at ? (
          <Btn disabled={deletionBusy} onClick={handleCancelDeletionRequest}>Keep</Btn>
        ) : null}
        <IconBtn aria-label="Close" title="Close" onClick={onClose}>
          <Icon name="x" size={16} />
        </IconBtn>
      </div>
      {loading || !detail ? (
        loading ? <PreparationProgress title="Opening file" description="Loading the application, linked evidence and financial workspace." /> : null
      ) : (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="row" style={{ flexShrink: 0, padding: "12px 16px 0" }}>
            <Seg
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel="Lead view"
              options={[
                { value: "conversation", label: "Conversation" },
                { value: "workspace", label: "Workspace" },
              ]}
            />
          </div>
          {activeTab === "workspace" ? (
            <div className="row" style={{ flexShrink: 0, padding: "10px 16px 12px", borderBottom: "1px solid var(--line)" }}>
              <Seg
                value={workspaceSub}
                onChange={setWorkspaceSub}
                ariaLabel="Workspace section"
                options={[
                  { value: "overview", label: "Overview" },
                  { value: "documents", label: "Documents" },
                  { value: "client", label: "Client conversation" },
                  { value: "credit", label: "Credit" },
                  { value: "contracts", label: "Contracts" },
                  { value: "package", label: "Package" },
                ]}
              />
            </div>
          ) : (
            <div style={{ flexShrink: 0, borderBottom: "1px solid var(--line)", marginTop: 12 }} />
          )}
          <div style={{ flex: 1, minHeight: 0, padding: 16, display: "grid", gap: 14, overflowY: "auto" }}>
          <Row>
            <CellChip tone={probabilityTone(String(result?.probability_status || ""))}>
              {String(result?.probability_status || "No screen yet")}
            </CellChip>
            <CellChip tone={detail.intake.call_booked ? "ok" : "mut"}>
              {detail.intake.call_booked ? "Call booked" : "Call not booked"}
            </CellChip>
          </Row>

          {activeTab === "conversation" ? (
            cockpitResponse && cockpitAdapter ? (
              <div style={{ flex: 1, minHeight: 460, position: "relative", overflow: "hidden" }}>
                <LeadCockpit
                  hideFinancialForms
                  response={cockpitResponse}
                  adapter={cockpitAdapter}
                  variant={detail.intake.variant}
                  initialMessages={detail.messages}
                  onResponse={handleCockpitResponse}
                  onRequestRerun={onRerun}
                  programReadiness={programReadiness}
                />
                <button
                  type="button"
                  className="btn"
                  onClick={() => setNotesOpen((v) => !v)}
                  aria-label={notesOpen ? "Hide internal notes" : "Show internal notes"}
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: notesOpen ? 360 : 0,
                    transform: "translateY(-50%)",
                    zIndex: 21,
                    flexDirection: "column",
                    transition: "right 200ms ease",
                  }}
                >
                  <Icon name={notesOpen ? "chevR" : "chevL"} size={12} />
                  <span style={{ writingMode: "vertical-rl" }}>
                    Notes{detail.notes?.length ? ` (${detail.notes.length})` : ""}
                  </span>
                </button>
                <div
                  style={{
                    position: "absolute",
                    top: 0,
                    right: 0,
                    bottom: 0,
                    width: 360,
                    zIndex: 20,
                    display: "grid",
                    transform: notesOpen ? "translateX(0)" : "translateX(100%)",
                    transition: "transform 200ms ease",
                    boxShadow: notesOpen ? "-8px 0 24px rgba(0,0,0,0.18)" : "none",
                  }}
                >
                  <LeadNotesPanel
                    notes={detail.notes ?? []}
                    onPost={postNote}
                    posting={notesPosting}
                    error={notesError}
                    subtitle="Private channel with this lead's dealer partner — never visible to the client."
                    emptyLabel="No messages yet. Start the conversation with this lead's dealer partner."
                  />
                </div>
              </div>
            ) : (
              <span className="sub">Loading conversation…</span>
            )
          ) : null}

          {activeTab === "workspace" && workspaceSub === "overview" ? (
            <>
              <InfoBlock title="Contact">
                <Line label="Name" value={detail.intake.full_name} />
                <Line label="Email" value={detail.intake.email} />
                <Line label="Phone" value={detail.intake.phone || "-"} />
                <FundingRequestControl profileId={profileId} role={currentUser?.role} fallbackAmount={detail.intake.requested_loan_amount} onSaved={async () => { await onFundingRequestSaved?.(); await refreshProgramReadiness(); }} />
                <Line label="Use of funds" value={detail.intake.loan_purpose || "-"} />
                <Line label="Referral" value={detail.intake.referral_source || "-"} />
              </InfoBlock>

              <InfoBlock title="Actions">
                <Row>
                  <Btn variant="pri" onClick={onRerun} disabled={rerunning || mcaAutoReviewBlocked}>
                    {mcaAutoReviewBlocked ? "Automatic review disabled" : rerunning ? "Re-running AI review…" : "Re-run AI review on latest uploads"}
                  </Btn>
                  <Btn disabled={busy !== "" || zipBusy} onClick={() => void prepareArtifact("export", "Preparing intelligence PDF", "Rendering the file’s intelligence report for download.", "Intelligence PDF download started", onExport)}>Export intelligence PDF</Btn>
                  <Btn onClick={() => setOpenBucketId(detail.intake.bucket_id)}>Open documents</Btn>
                  <Btn onClick={onLinkBucketIntake}>
                    <Icon name="link" size={14} />
                    Link room
                  </Btn>
                  <Btn onClick={() => navigator.clipboard.writeText(detail.intake.bucket_id)}>Copy room ID</Btn>
                </Row>
                {detail.latest_review?.status ? (
                  <StatusLine className="mt" tone={detail.latest_review.status === "failed" ? "bad" : "mut"}>
                    Latest review: {detail.latest_review.status}
                    {detail.latest_review.error ? ` — ${detail.latest_review.error}` : ""}
                  </StatusLine>
                ) : null}
              </InfoBlock>

              <InfoBlock title="AI next step">
                <p>{String(result?.one_next_step || result?.executive_summary || "Awaiting AI review.")}</p>
              </InfoBlock>

              <InfoBlock title="Evidence coverage">
                <CompactList rows={arrayOfRecords(evidence?.baseline_coverage).map((row) => ({
                  title: String(row.category || "Evidence"),
                  body: `${String(row.status || "unclear")} · ${Array.isArray(row.evidence) ? row.evidence.join(" | ") : String(row.evidence || row.gap || "")}`,
                }))} empty="No evidence map yet." />
              </InfoBlock>

              <InfoBlock title="Missing / blockers">
                <CompactList rows={missing.map((row) => ({ title: String(row.title || "Missing item"), body: String(row.detail || "") }))} empty="No missing items listed." />
              </InfoBlock>

              <InfoBlock title="Strengths / risks">
                <CompactList rows={[...strengths.map((item) => ({ title: "Strength", body: item })), ...risks.map((item) => ({ title: "Risk", body: item }))]} empty="Awaiting strengths and risks." />
              </InfoBlock>
            </>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "documents" ? (
            <InfoBlock title={`Uploaded files (${evidenceFileCount})`}>
              <div className="grid g10">
                <Row>
                  <span className="sub" style={{ flex: 1, minWidth: 200 }}>
                    Import files from your Google Drive so the AI reads and learns from them — imported files are analyzed and folded into the review, just like uploads.
                  </span>
                  <Btn
                    disabled={busy !== ""}
                    title="Pick files from your connected Google Drive to analyze with the AI"
                    onClick={() => setIngestPickerOpen(true)}
                  >
                    {busy === "ingest" ? <><Spinner /> Importing…</> : `Add from Google Drive${ingestFiles.length ? ` (${ingestFiles.length})` : ""}`}
                  </Btn>
                </Row>
                <div>
                  {evidenceFiles.length ? evidenceFiles.slice(0, 60).map((file) => (
                    <div key={file.id} className="filerow">
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file.zip_entry_path || file.file_name}</span>
                      <span className="sub">{formatSize(file.size_bytes)}</span>
                    </div>
                  )) : <span className="sub">No uploaded files yet.</span>}
                </div>
              </div>
            </InfoBlock>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "client" && cockpitAdapter ? (
            <AIIntakeClientConversation adapter={cockpitAdapter} intakeId={detail.intake.id} profileId={underwriting?.profile_id ?? null} clientName={detail.intake.full_name} />
          ) : null}

          {activeTab === "workspace" && workspaceSub === "credit" ? (
            <div className="grid">
              <LeadCreditPanel intakeId={detail.intake.id} />
              {!isRealEstate ? <LeadProgramFitPanel intakeId={detail.intake.id} /> : null}
              {isRealEstate ? <LeadDscrPanel intakeId={detail.intake.id} /> : null}
            </div>
          ) : null}

          {activeTab === "workspace" && workspaceSub === "contracts" ? (
            <LeadContractsPanel intakeId={detail.intake.id} />
          ) : null}

          {activeTab === "workspace" && workspaceSub === "package" ? (
            <>
              {/* Step 0 — Prequalification draft (real estate only — the AI also
                  auto-drafts this in chat once baseline+credit+details are ready;
                  this button lets an admin draft or redraft it manually). */}
              {isRealEstate ? (
                <InfoBlock title="0 · Prequalification draft">
                  <div className="grid g10">
                    <span className="sub">
                      A borrower-facing preliminary prequalification — program fit, sizing, and next step. The AI also generates this automatically in chat once baseline documents, the credit pull, and the down payment/prior-ownership/property-type details are all on file.
                    </span>
                    <Row>
                      <Btn variant="pri" onClick={() => void prepareArtifact("prequal", "Preparing prequalification", "Drafting the preliminary report from the file’s analyzed evidence.", "Prequalification drafted", onGeneratePrequalification)} disabled={busy !== "" || zipBusy}>
                        {busy === "prequal" ? <><Spinner /> Drafting…</> : prequalification ? "Redraft prequalification" : "Draft prequalification"}
                      </Btn>
                      <CellChip tone={prequalification ? "ok" : "mut"}>{prequalification ? "Ready" : "Not started"}</CellChip>
                      {prequalification ? <Btn onClick={() => copyText("Prequalification", prequalification.body_text || String(prequalification.body_json?.prequalification_summary || ""))}>Copy text</Btn> : null}
                    </Row>
                    {prequalification ? (
                      <div className="card grid g6" style={{ maxHeight: 260, overflowY: "auto" }}>
                        <strong>{prequalification.title}</strong>
                        <p style={{ whiteSpace: "pre-wrap" }}>{prequalification.body_text || String(prequalification.body_json?.prequalification_summary || "")}</p>
                        <span className="sub">Generated {formatDateTime(prequalification.created_at)}</span>
                      </div>
                    ) : <span className="sub">Draft a preliminary prequalification from the analyzed evidence.</span>}
                  </div>
                </InfoBlock>
              ) : null}

              {/* Step 1 — Executive summary (short on-screen narrative) */}
              <InfoBlock title="1 · Executive summary">
                <div className="grid g10">
                  <span className="sub">
                    A short credit-officer memo in plain prose — read it here and copy it into notes or a message. It also becomes the opening of the lender packet PDF in step 2.
                  </span>
                  <Row>
                    <Btn variant="pri" onClick={() => void prepareArtifact("summary", "Preparing executive summary", "Building the credit brief from the file’s analyzed evidence.", "Executive summary ready", onGenerateSummary)} disabled={busy !== "" || zipBusy}>
                      {busy === "summary" ? <><Spinner /> Generating…</> : summary ? "Regenerate summary" : "Generate executive summary"}
                    </Btn>
                    <CellChip tone={summary ? "ok" : "mut"}>{summary ? "Ready" : "Not started"}</CellChip>
                    {summary ? <Btn onClick={() => copyText("Summary", summary.body_text || String(summary.body_json?.executive_summary || ""))}>Copy summary</Btn> : null}
                    {summary?.title ? <Btn onClick={() => copyText("Title", summary.title)}>Copy title</Btn> : null}
                  </Row>
                  {summary ? (
                    <div className="card grid g6" style={{ maxHeight: 260, overflowY: "auto" }}>
                      <strong>{summary.title}</strong>
                      <p style={{ whiteSpace: "pre-wrap" }}>{summary.body_text || String(summary.body_json?.executive_summary || "")}</p>
                      <span className="sub">Generated {formatDateTime(summary.created_at)}</span>
                    </div>
                  ) : <span className="sub">Generate a polished underwriter summary from the analyzed evidence.</span>}
                </div>
              </InfoBlock>

              {/* Step 2 — Lender packet PDF (the full branded document) */}
              <InfoBlock title="2 · Lender packet PDF">
                <div className="grid g10">
                  <span className="sub">
                    The full branded document for a bank underwriter — landscape, white background, month-over-month bank charts (deposits, withdrawals, ending balance), a 2-year tax summary, Excel-style tables, our logo, and a CONFIDENTIAL watermark. Sensitive account and ID numbers are redacted.
                  </span>
                  <Row>
                    <Btn variant="pri" onClick={() => void prepareArtifact("packet", "Preparing lender package", "Rendering the financial report and supporting schedules.", "Lender packet ready", onGeneratePacket)} disabled={busy !== "" || zipBusy}>
                      {busy === "packet" ? <><Spinner /> Generating…</> : packet ? "Regenerate packet" : "Generate lender packet PDF"}
                    </Btn>
                    <CellChip tone={packet ? "ok" : "mut"}>{packet ? "Ready" : "Not started"}</CellChip>
                    {packet?.download_url ? <a href={packet.download_url} target="_blank" rel="noreferrer" className="btn">Download / preview PDF</a> : null}
                    {packet ? <span className="sub">{formatDateTime(packet.created_at)}</span> : null}
                  </Row>
                </div>
              </InfoBlock>

              {/* Step 3 — Ship it: full package + copy affordances */}
              <InfoBlock title="3 · Ship the package">
                <div className="grid g10">
                  <Row>
                    <Btn variant="pri" onClick={downloadZip} disabled={zipBusy || busy !== ""}>
                      {zipBusy ? <><Spinner /> Building ZIP…</> : "Download full package (.zip)"}
                    </Btn>
                    <Btn onClick={onLinkBucketIntake}>
                      <Icon name="link" size={14} />
                      Link room
                    </Btn>
                    <Btn onClick={() => copyText("Room ID", detail.intake.bucket_id)}>Copy room ID</Btn>
                  </Row>
                  <p className="sub">
                    The ZIP bundles every uploaded document, the lender packet PDF, the executive summary, and an editable email template — ready to attach, upload, or archive anywhere.
                  </p>
                </div>
              </InfoBlock>

              {/* Step 4 — Draft, then either copy to your inbox OR send from your connected Gmail */}
              <InfoBlock title="4 · Email — draft, then copy or send">
                <div className="grid g10">
                  <span className="sub">
                    Draft a lender/vendor email from the analyzed evidence. Copy the subject and body into your own mail client, or add recipients below and send it from your connected Gmail with the current investor report or legacy lender packet and any selected Google Drive files attached.
                  </span>

                  <div className="grid g6">
                    <Row>
                      <Lbl>Subject</Lbl>
                      <span className="sp" />
                      <CopyIconButton disabled={!subject.trim()} onCopy={() => copyText("Subject", subject)} />
                    </Row>
                    <Input value={subject} maxLength={512} onChange={(event) => setSubject(event.target.value)} placeholder="Email subject line" aria-label="Email subject line" />
                  </div>

                  <div className="grid g6">
                    <Row>
                      <Lbl>Body</Lbl>
                      <span className="sp" />
                      <CopyIconButton disabled={!body.trim()} onCopy={() => copyText("Body", body)} />
                    </Row>
                    <Textarea value={body} maxLength={12000} onChange={(event) => setBody(event.target.value)} placeholder="Prepare a draft, or write the email body here" aria-label="Email body" style={{ minHeight: 200, resize: "vertical" }} />
                  </div>

                  {/* Recipients — only used by the "Send via your Gmail" path. */}
                  <div className="fldgrid two">
                    <Field label="To">
                      <Input value={toEmails} onChange={(e) => setToEmails(e.target.value)} placeholder="lender@bank.com" />
                    </Field>
                    <Field label="Cc (optional)">
                      <Input value={ccEmails} onChange={(e) => setCcEmails(e.target.value)} placeholder="comma-separated" />
                    </Field>
                  </div>

                  {/* Selected Google Drive attachments */}
                  {driveFiles.length > 0 ? (
                    <Row>
                      {driveFiles.map((f) => (
                        <span key={f.id} className="chip">
                          <span style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                          <Linky
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setDriveFiles((prev) => prev.filter((x) => x.id !== f.id))}
                          >
                            ×
                          </Linky>
                        </span>
                      ))}
                    </Row>
                  ) : null}

                  {/* Attachments + secure-bucket access — controls what actually
                      goes out when "Send via your Gmail" is used. */}
                  <div className="card grid g8">
                    <Lbl>Attach to the email</Lbl>
                    <div>
                      <label className={cx("pick", attachPacket && "on")}>
                        <input type="checkbox" checked={attachPacket} onChange={(e) => setAttachPacket(e.target.checked)} /> {condensedInvestorReport ? "Investor report PDF (up to 5 pages)" : "Lender packet PDF"}
                      </label>
                      <label className={cx("pick", attachSummary && "on")}>
                        <input type="checkbox" checked={attachSummary} onChange={(e) => setAttachSummary(e.target.checked)} /> Executive summary PDF
                      </label>
                      <label className={cx("pick", attachZip && "on")}>
                        <input type="checkbox" checked={attachZip} onChange={(e) => setAttachZip(e.target.checked)} /> Full package (.zip)
                      </label>
                    </div>
                    <Row>
                      <Lbl>Room access</Lbl>
                      <Select value={bucketAccess} onChange={(e) => setBucketAccess(e.target.value as BucketAccessMode)} aria-label="Room access" style={{ minWidth: 210 }}>
                        <option value="login">Vendor login link (invited email)</option>
                        <option value="passcode">Link + access code (no login)</option>
                        <option value="none">No room access</option>
                      </Select>
                      <span className="sub">
                        {bucketAccess === "passcode"
                          ? "A one-time access code is generated and included in the email."
                          : bucketAccess === "login"
                            ? "Recipient logs in with their invited vendor email."
                            : "The email carries only the attachments above."}
                      </span>
                    </Row>
                    <span className="sub">
                      Files over 8&nbsp;MB (or a combined set over ~18&nbsp;MB) fall back to the secure room link instead of attaching.
                    </span>
                  </div>

                  <Row>
                    <Btn variant="pri" onClick={async () => { setBusy("preview"); try { await previewEmail(); toast.show("Draft ready"); } finally { setBusy(""); } }} disabled={busy !== ""}>
                      {busy === "preview" ? <><Spinner /> Drafting…</> : (subject || body) ? "Regenerate draft" : "Draft email with AI"}
                    </Btn>
                    <Btn
                      disabled={busy !== "" || !subject.trim() || !body.trim() || !toEmails.trim()}
                      title={!subject.trim() || !body.trim() ? "Draft a subject and body first" : !toEmails.trim() ? "Add at least one recipient in the To field" : "Send from your connected Gmail (falls back to firm email)"}
                      onClick={sendEmail}
                    >
                      {busy === "send" ? <><Spinner /> Sending…</> : "Send via your Gmail"}
                    </Btn>
                    <Btn
                      disabled={busy !== ""}
                      title="Attach files from your connected Google Drive"
                      onClick={() => setDrivePickerOpen(true)}
                    >
                      Attach from Drive{driveFiles.length ? ` (${driveFiles.length})` : ""}
                    </Btn>
                    <Btn
                      disabled={!bookingLink.data?.url}
                      title={bookingLink.data?.url ? "Append your booking link to the body" : "Enable your Booking Page first (Booking Page in the sidebar)"}
                      onClick={() => {
                        const url = bookingLink.data?.url;
                        if (!url) return;
                        setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n\n" : ""}Book a time with me: ${url}`);
                        toast.show("Booking link inserted");
                      }}
                    >
                      Insert booking link
                    </Btn>
                  </Row>
                </div>
              </InfoBlock>

              {/* Final step — assemble the normalized JSON payload for the
                  banker's own intake system. Dealer leads only, mirroring the
                  Program Fit panel's dealer-only gate. */}
              {!isRealEstate ? (
                <InfoBlock title="Prepare banker submission">
                  <div className="grid g10">
                    <span className="sub">
                      Assemble a normalized JSON payload — borrower, entity, key metrics, and program fit — for
                      an admin to hand to the banker's own intake system. SSN / personal Tax ID are collected
                      transiently in the modal and never stored.
                    </span>
                    <div>
                      <Btn variant="pri" onClick={() => setBankerModalOpen(true)}>
                        Open banker submission
                      </Btn>
                    </div>
                  </div>
                </InfoBlock>
              ) : null}
            </>
          ) : null}
          </div>
        </div>
      )}
      {/* Toast mounted at Card level so success/error messages show on every
          tab (Documents ingest, Overview, etc.), not just the package composer. */}
      <Toast msg={toast.msg} />
      <DriveFilePicker
        open={drivePickerOpen}
        onClose={() => setDrivePickerOpen(false)}
        selectedIds={driveFiles.map((f) => f.id)}
        onPick={(file) => {
          setDriveFiles((prev) => (prev.some((f) => f.id === file.id) ? prev : [...prev, file]));
        }}
        onUnpick={(id) => setDriveFiles((prev) => prev.filter((f) => f.id !== id))}
      />
      <DriveFilePicker
        open={ingestPickerOpen}
        mode="ingest"
        busy={busy === "ingest"}
        maxSelect={50}
        onClose={() => setIngestPickerOpen(false)}
        selectedIds={ingestFiles.map((f) => f.id)}
        onPick={(file) => {
          setIngestFiles((prev) => {
            if (prev.some((f) => f.id === file.id)) return prev;
            if (prev.length >= 50) return prev;
            return [...prev, file];
          });
        }}
        onUnpick={(id) => setIngestFiles((prev) => prev.filter((f) => f.id !== id))}
        onConfirm={runIngest}
      />
      {detail ? (
        <BankerSubmissionModal
          open={bankerModalOpen}
          onClose={() => setBankerModalOpen(false)}
          intakeId={detail.intake.id}
        />
      ) : null}
      {detail && canDelete ? (
        <ConfirmDeleteLeadModal
          open={confirmDeleteOpen}
          onClose={() => setConfirmDeleteOpen(false)}
          expectedName={detail.intake.business_name || detail.intake.full_name}
          onConfirm={async (confirmName) => {
            await onConfirmDeletion(confirmName);
            setConfirmDeleteOpen(false);
          }}
        />
      ) : null}
      <BucketWorkspaceOverlay bucketId={openBucketId} onClose={() => setOpenBucketId(null)} />
    </div>
  );
}
