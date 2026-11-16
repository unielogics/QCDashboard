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
import { useClient, useCurrentUser, useProposedActionItems } from "@/hooks/useApi";
import { AiSuggestionsPanel } from "@/components/operator/AiSuggestionsPanel";
import { Role } from "@/lib/enums.generated";
import { SECTION_DEFINITIONS, parseFileSection } from "@/lib/fileRoutes";
import { parseMarketplaceFinancialAction } from "@/lib/marketplaceIssues";
import { needsFullFileAnalysis } from "@/lib/fileOpening";
import { FileWorkspaceProvider } from "@/components/file/FileWorkspaceContext";

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
  const packageWorkspace = searchParams.get("workspace") === "package";
  const section = parseFileSection(searchParams.get("section"));
  const financialAction = parseMarketplaceFinancialAction(searchParams.get("financial_action"));
  const requestedChannel = searchParams.get("channel");
  const communicationChannel = requestedChannel === "client" || requestedChannel === "email" || requestedChannel === "updates" || requestedChannel === "partner" || requestedChannel === "internal" ? requestedChannel : requestedChannel === "sms" ? "client" : "underwriter";
  const definition = SECTION_DEFINITIONS[section];
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const isDesk = me?.role === Role.SUPER_ADMIN || me?.role === Role.LOAN_EXEC;
  const canGovern = me?.role === Role.SUPER_ADMIN;
  const [notice, setNotice] = useState("");
  const [linkLead, setLinkLead] = useState<LinkLead | null>(null);
  // The server enforces the operator role. Start this permissioned factual
  // read alongside /auth/me instead of waiting an additional network roundtrip.
  const file = useLeadFile({ leadId, notify: setNotice, includeDerived: packageWorkspace || needsFullFileAnalysis(section) });
  // Every file has a client; the file says whose it is and links to them.
  const clientId = file.detail?.intake.client_id ?? null;
  const { data: fileClient } = useClient(isDesk ? clientId : null);
  // What this file's AI is waiting to be told. One line in the bar until opened:
  // the inbox that used to hold these is gone, and the file is where they belong.
  const bucketId = file.detail?.intake.bucket_id ?? null;
  const roomSuggestions = useProposedActionItems(isDesk && Boolean(bucketId), "proposed", bucketId).data;
  // Filtered here as well: a server that predates the room filter answers with every room's.
  const fileSuggestions = (roomSuggestions ?? []).filter((item) => item.bucket_id === bucketId);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  useEffect(() => {
    if (!meLoading && me && !isDesk) router.replace("/");
  }, [isDesk, meLoading, me, router]);

  useEffect(() => {
    if (!packageWorkspace || !isDesk) return;
    let stopped = false;
    const observer = new MutationObserver(() => { const target = document.getElementById("package-readiness"); if (!stopped && target) { target.scrollIntoView({ block: "start" }); stop(); } });
    const stop = () => { stopped = true; observer.disconnect(); };
    observer.observe(document.body, { childList: true, subtree: true });
    const ready = document.getElementById("package-readiness"); if (ready) { ready.scrollIntoView({ block: "start" }); stop(); }
    const timer = window.setTimeout(stop, 15000);
    window.addEventListener("wheel", stop, { once: true }); window.addEventListener("keydown", stop, { once: true });
    return () => { stop(); window.clearTimeout(timer); window.removeEventListener("wheel", stop); window.removeEventListener("keydown", stop); };
  }, [packageWorkspace, isDesk, leadId]);

  if (meLoading || !me || !isDesk || !leadId) return null;

  return (
    <FileWorkspaceProvider value={{ intakeId: leadId, profileId: file.detail?.application_profile_id, pageMode: false }}><div className="file-page">
      <div className="file-page-bar">
        <Link href={LIST_HREF} className="linky file-page-back"><Icon name="chevL" size={14} /> All files</Link>
        {fileSuggestions.length > 0 || suggestionsOpen ? (
          <button type="button" className="linky file-page-back" aria-expanded={suggestionsOpen} onClick={() => setSuggestionsOpen((value) => !value)}>
            <Icon name="spark" size={13} /> {fileSuggestions.length === 1 ? "1 AI suggestion waiting" : `${fileSuggestions.length} AI suggestions waiting`} · {suggestionsOpen ? "Hide" : "Review"}
          </button>
        ) : null}
        {clientId ? (
          <>
            <span className="sp" style={{ flex: 1 }} />
            <Link href={`/clients/${clientId}`} className="linky file-page-back" title="Open the client this file belongs to: their other files, texts and emails">
              <Icon name="clients" size={13} /> Client: {fileClient?.name ?? file.detail?.intake.full_name ?? "open"}
            </Link>
          </>
        ) : null}
      </div>
      {notice ? <WarnLine>{notice}</WarnLine> : null}
      {suggestionsOpen && bucketId ? <AiSuggestionsPanel bucketId={bucketId} /> : null}
      <LeadDetailPanel
        key={`${leadId}:${section}:${packageWorkspace}`}
        detail={file.detail}
        loading={file.loading}
        refreshing={file.refreshing}
        onRequireAnalysis={file.requestDerived}
        initialView={packageWorkspace ? "financials" : definition.view}
        initialActiveTab={definition.activeTab}
        initialWorkspaceSection={definition.workspaceSection}
        initialFinancialAction={financialAction}
        initialEvidenceTab={definition.evidenceTab ?? "requirements"}
        initialCommunicationChannel={communicationChannel}
        initialEmailThreadId={communicationChannel === "email" ? searchParams.get("thread") : null}
        onCommunicationNavigate={(channel) => {
          const query = new URLSearchParams(searchParams.toString());
          query.delete("financial_action"); query.delete("workspace");
          query.set("section", "communications"); query.set("channel", channel);
          if (channel !== "email") query.delete("thread");
          router.push(`/files/${leadId}?${query}`, { scroll: false });
        }}
        onEmailThreadNavigate={(threadId) => {
          const query = new URLSearchParams(searchParams.toString());
          query.delete("financial_action"); query.delete("workspace");
          query.set("section", "communications"); query.set("channel", "email"); query.set("thread", threadId);
          router.replace(`/files/${leadId}?${query}`, { scroll: false });
        }}
        initialNotesOpen={searchParams.get("notes") === "1"}
        canGovern={canGovern}
        canDelete={isDesk}
        onClose={() => router.push(LIST_HREF)}
        onExport={file.exportPdf}
        onRefresh={file.reload}
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
        onFundingRequestSaved={() => file.reload()}
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
    </div></FileWorkspaceProvider>
  );
}
