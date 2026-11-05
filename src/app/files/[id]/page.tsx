"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Btn, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { BucketIntakeLinkDrawer } from "@/components/operator/UnifiedOperator";
import { LeadDetailPanel } from "@/components/file/LeadDetailPanel";
import { useLeadFile } from "@/components/file/useLeadFile";
import type { LinkLead } from "@/components/file/leadFile";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { SECTION_DEFINITIONS, parseFileSection } from "@/lib/fileRoutes";

const LIST_HREF = "/admin/ai-underwriter-leads";

/**
 * One file, one page, the full width of the screen. The detail panel is the
 * same one the list used to open inline; its own header and tabs are the
 * navigation. `?section=` only chooses which tab a deep link opens on.
 */
export default function FilePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const leadId = params?.id ?? null;
  const section = parseFileSection(searchParams.get("section"));
  const definition = SECTION_DEFINITIONS[section];
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const isDesk = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const canGovern = me?.role === Role.SUPER_ADMIN;
  const [notice, setNotice] = useState("");
  const [linkLead, setLinkLead] = useState<LinkLead | null>(null);
  const file = useLeadFile({ leadId: isDesk ? leadId : null, notify: setNotice });

  useEffect(() => {
    if (!meLoading && me && !isDesk) router.replace("/");
  }, [isDesk, meLoading, me, router]);

  if (meLoading || !me || !isDesk || !leadId) return null;

  return (
    <div className="file-page">
      <div className="file-page-bar">
        <Link href={LIST_HREF} className="linky file-page-back"><Icon name="chevL" size={14} /> All files</Link>
      </div>
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
        canDelete={isDesk}
        onClose={() => router.push(LIST_HREF)}
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
