"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Btn, CellChip, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { BucketIntakeLinkDrawer } from "@/components/operator/UnifiedOperator";
import { FileRail, SECTION_DEFINITIONS, fileHref, parseFileSection, type FileSection } from "@/components/file/FileRail";
import { LeadDetailPanel } from "@/components/file/LeadDetailPanel";
import { useLeadFile } from "@/components/file/useLeadFile";
import { intakeStatusPresentation, type LinkLead } from "@/components/file/leadFile";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { resolveIntakeWorkspaceState } from "@/lib/intakeWorkspace";

const LIST_HREF = "/admin/ai-underwriter-leads";

/**
 * One file, one page. The rail on the left moves between the file's parts;
 * the detail panel on the right is the same component the list used to open
 * inline, mounted with the section's view so every deep link lands on the
 * right part of the file.
 */
export default function FilePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const leadId = params?.id ?? null;
  const section = parseFileSection(searchParams.get("section"));
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const isDesk = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const canGovern = me?.role === Role.SUPER_ADMIN;
  const canDelete = isDesk;
  const [notice, setNotice] = useState("");
  const [linkLead, setLinkLead] = useState<LinkLead | null>(null);
  const file = useLeadFile({ leadId: isDesk ? leadId : null, notify: setNotice });

  useEffect(() => {
    if (!meLoading && me && !isDesk) router.replace("/");
  }, [isDesk, meLoading, me, router]);

  const definition = SECTION_DEFINITIONS[section];
  const title = file.detail?.intake.business_name || file.detail?.intake.full_name || "File";
  const status = useMemo(() => {
    const intake = file.detail?.intake;
    if (!intake) return null;
    const workspaceState = resolveIntakeWorkspaceState({
      workspaceState: intake.workspace_state,
      workspaceStateReason: intake.workspace_state_reason,
      archivedAt: intake.archived_at ?? null,
      underwritingStatus: intake.underwriting_status,
      outcomeStatus: intake.outcome_status,
      intakeStatus: intake.status,
    });
    return intakeStatusPresentation(intake.status, intake.underwriting_status, intake.outcome_status, workspaceState, intake.workspace_state_reason);
  }, [file.detail]);

  const badges = useMemo(() => {
    const detail = file.detail;
    if (!detail) return {};
    const openRequests = detail.requested_documents.filter((doc) => doc.status === "requested").length;
    return {
      documents: openRequests ? `${openRequests} open` : undefined,
      communications: detail.messages?.length ? detail.messages.length : undefined,
    } as Partial<Record<FileSection, string | number>>;
  }, [file.detail]);

  function go(next: FileSection) {
    if (!leadId) return;
    setNotice("");
    router.replace(fileHref(leadId, next), { scroll: false });
  }

  if (meLoading || !me) return null;
  if (!isDesk || !leadId) return null;

  return (
    <div className="file-page">
      <aside className="file-page-side">
        <div className="file-page-head">
          <Link href={LIST_HREF} className="linky file-page-back"><Icon name="chevL" size={14} /> All files</Link>
          <h1 className="file-page-title">{title}</h1>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            {status ? <CellChip tone={status.tone}>{status.label}</CellChip> : null}
            {file.detail?.intake.bucket_id ? <Link className="cellchip c-acc" href={`/admin/buckets?bucket=${file.detail.intake.bucket_id}`}>Room</Link> : null}
          </div>
        </div>
        <FileRail section={section} onSelect={go} badges={badges} />
        <div className="file-page-side-foot sub">{definition.hint}</div>
      </aside>

      <main className="file-page-main" aria-label={`${title} · ${definition.label}`}>
        {notice ? <WarnLine>{notice}</WarnLine> : null}
        <LeadDetailPanel
          key={`${leadId}:${section}`}
          detail={file.detail}
          loading={file.loading}
          initialView={definition.view}
          initialActiveTab={definition.activeTab}
          initialWorkspaceSection={definition.workspaceSection}
          initialEvidenceTab={definition.evidenceTab ?? "requirements"}
          initialCommunicationChannel={searchParams.get("channel") === "client" ? "client" : searchParams.get("channel") === "email" ? "email" : "underwriter"}
          initialNotesOpen={searchParams.get("notes") === "1"}
          canGovern={canGovern}
          canDelete={canDelete}
          onClose={() => router.push(LIST_HREF)}
          onMinimize={() => router.push(LIST_HREF)}
          onExport={() => void file.exportPdf()}
          onGenerateSummary={file.generateExecutiveSummary}
          onGeneratePacket={file.generateLenderPacket}
          onGeneratePackage={file.generatePackageReadiness}
          onGeneratePrequalification={file.generatePrequalification}
          onPreviewEmail={file.previewVendorEmail}
          onSendEmail={file.sendVendorEmail}
          onIngestFromDrive={file.ingestFromDrive}
          onRerun={file.openRerun}
          rerunning={file.rerunning}
          cockpitResponse={file.cockpitResponse}
          cockpitAdapter={file.cockpitAdapter}
          onCockpitResponse={file.foldCockpitResponse}
          onDownloadZip={file.downloadPackageZip}
          onLinkBucketIntake={() => {
            if (file.detail?.intake) {
              setLinkLead({ id: file.detail.intake.id, bucket_id: null, business_name: file.detail.intake.business_name, full_name: file.detail.intake.full_name });
            }
          }}
          onPostNote={file.postNote}
          onUpdateOutcomeStatus={file.updateOutcomeStatus}
          onUpdateLanguage={file.updateLanguage}
          onUpdateContact={file.updateContact}
          onCancelDeletionRequest={file.cancelDeletionRequest}
          onConfirmDeletion={async (confirmName) => {
            await file.deleteLead(confirmName);
            router.push(LIST_HREF);
          }}
        />
        {!file.loading && !file.detail ? (
          <div className="empty">
            This file could not be loaded. <Btn size="sm" onClick={() => void file.reload({ background: false })}>Try again</Btn>
          </div>
        ) : null}
      </main>

      <BucketIntakeLinkDrawer
        open={linkLead !== null}
        onClose={() => setLinkLead(null)}
        initialBucketId={linkLead?.bucket_id}
        initialIntakeId={linkLead?.id}
        title="Link file to room"
      />
    </div>
  );
}
