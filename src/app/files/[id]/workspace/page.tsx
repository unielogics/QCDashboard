"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout } from "@/components/ds";
import { FileWorkspaceBackLink, FileWorkspaceLink, FileWorkspaceProvider } from "@/components/file/FileWorkspaceContext";
import { artifactVersion } from "@/components/file/leadFile";
import { useLeadFile } from "@/components/file/useLeadFile";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { FILE_WORKSPACE_LABELS, FILE_WORKSPACE_TOOLS, parseFileWorkspaceRequest } from "@/lib/fileWorkspace";
import type { ApplicationProgramReadiness, ApplicationTermSheetState } from "@/lib/applicationProfile";
import { createProfileTermsClient } from "@/production-package/client";
import styles from "./workspace.module.css";
import type { CpSourceLookup } from "@/hooks/useCapitalPartners";
import { marketplaceReviewHref } from "@/lib/marketplacePublication";

const loading = () => <p role="status">Opening editor…</p>;
const FinancialWorkspace = dynamic(() => import("@/components/application/FinancialWorkspace").then(module => module.FinancialWorkspace), { ssr: false, loading });
const FinancialCockpit = dynamic(() => import("@/components/file/cockpit/FinancialCockpit").then(module => module.FinancialCockpit), { ssr: false, loading });
const TermSheetDrawer = dynamic(() => import("@/production-package/TermSheetDrawer").then(module => module.TermSheetDrawer), { ssr: false, loading });

export default function FileWorkspacePage() {
  const { id } = useParams<{ id: string }>(), search = useSearchParams(), staff = useCurrentUser();
  const permitted = staff.authReady !== false && (staff.data?.role === Role.SUPER_ADMIN || staff.data?.role === Role.LOAN_EXEC);
  if (!permitted || !id) return <div className="empty">{staff.isLoading || staff.authReady === false ? "Checking file access…" : "This workspace requires file access."}</div>;
  return <Workspace key={`${staff.authScope ?? staff.data?.id}:${id}`} intakeId={id} request={parseFileWorkspaceRequest(search)} canPublish={staff.data?.role === Role.SUPER_ADMIN} authScope={staff.authScope ?? staff.data?.id ?? ""} />;
}

function Workspace({ intakeId, request, canPublish, authScope }: { authScope: string; intakeId: string; request: ReturnType<typeof parseFileWorkspaceRequest>; canPublish: boolean }) {
  const [notice, setNotice] = useState(""), [resolved, setResolved] = useState<string | null>(null), [error, setError] = useState("");
  const [creationProfile, setCreationProfile] = useState<string | null>(null);
  const redirected = useRef<string | null>(null);
  const file = useLeadFile({ leadId: intakeId, notify: setNotice, includeDerived: request?.tool === "marketplace" }), api = useAuthedApi(), cache = useQueryClient();
  const knownProfile = file.detail?.application_profile_id, profileId = knownProfile ?? resolved;
  const creationMode = Boolean(profileId && creationProfile === profileId);
  const offerLookup = useQuery({ queryKey: ["file-workspace-offer", profileId, authScope], queryFn: ({ signal }) => api<CpSourceLookup>(`/capital/admin/sources/lookup?profile_id=${encodeURIComponent(profileId!)}`, { signal }), enabled: Boolean(profileId && canPublish && request?.tool === "marketplace"), retry: false, staleTime: 0 });
  useEffect(() => {
    if (request?.tool !== "marketplace" || !canPublish || !profileId || !offerLookup.isSuccess || creationMode) return;
    const listingId = offerLookup.data.listing?.id;
    if (!listingId) { setCreationProfile(profileId); return; }
    const target = marketplaceReviewHref(listingId);
    if (redirected.current === target) return;
    redirected.current = target;
    window.location.replace(target);
  }, [request?.tool, canPublish, profileId, offerLookup.isSuccess, offerLookup.data, creationMode]);
  const dealer = file.detail?.intake.variant === "dealer_gatekeeper_v1";
  const hasFile = Boolean(file.detail), validRequest = Boolean(request);
  const tool = request?.tool, fileName = file.detail?.intake.business_name || file.detail?.intake.full_name;
  useEffect(() => {
    if (!tool || !fileName) return;
    const previous = document.title, title = `${FILE_WORKSPACE_LABELS[tool]} · ${fileName}`;
    document.title = title;
    return () => { if (document.title === title) document.title = previous; };
  }, [tool, fileName]);
  useEffect(() => {
    if (!hasFile || knownProfile || !validRequest) return;
    const controller = new AbortController();
    void api<{ id: string }>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: "intake", source_id: intakeId }), signal: controller.signal }).then(value => { if (!controller.signal.aborted) setResolved(value.id); }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "The linked application could not be resolved."); });
    return () => controller.abort();
  }, [api, hasFile, knownProfile, intakeId, validRequest]);
  const readinessKey = ["file-workspace-programs", profileId, authScope];
  const readiness = useQuery({ queryKey: readinessKey, queryFn: ({ signal }) => api<ApplicationProgramReadiness>(`/application-profiles/${profileId}/program-readiness`, { signal }), enabled: Boolean(profileId && request && !["forms", "operating-plan", "terms"].includes(request.tool)), retry: false });
  const dealerTerms = useQuery({ queryKey: ["file-workspace-dealer-terms", profileId, authScope], queryFn: ({ signal }) => api<ApplicationTermSheetState>(`/production-packages/term-sheets/${profileId}`, { signal }), enabled: Boolean(profileId && dealer && request?.tool === "marketplace"), retry: false });
  const termsClient = useMemo(() => createProfileTermsClient(<T,>(path: string, init = {}) => { const { body, ...rest } = init as import("@/production-package/types").ApiInit; return api<T>(path, { ...rest, body: typeof body === "string" ? body : body == null ? undefined : JSON.stringify(body) }); }), [api]);
  if (!request) return <Callout tone="warn">Choose a supported file workspace. <a href={`/files/${encodeURIComponent(intakeId)}`}>Back to file</a></Callout>;
  if (file.loading || !file.detail) return <div className="empty">{notice || "Opening file workspace…"}{!file.loading ? <Btn onClick={() => void file.reload({ background: false })}>Retry file</Btn> : null}</div>;
  const title = file.detail.intake.business_name || file.detail.intake.full_name || "File";
  const latest = (type: string) => (file.detail!.artifacts ?? []).filter(item => item.artifact_type === type).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0];
  const executive = latest("executive_summary"), packet = latest("lender_packet"), presentation = latest("investor_presentation");
  const packageCurrent = Boolean(executive?.generation_id && executive.generation_id === packet?.generation_id && presentation?.generation_id === packet?.generation_id && [executive, packet, presentation].every(item => item?.status === "current" && item.is_fresh === true));
  const packageState = { generated: Boolean(executive && packet), inSync: packageCurrent, summaryVersion: executive ? artifactVersion(executive) : null, packetVersion: packet ? artifactVersion(packet) : null };

  const operatingPlan = request.tool === "operating-plan";
  const workspaceLinks = <nav className={styles.tools} aria-label="File workspaces">{FILE_WORKSPACE_TOOLS.filter(tool => !operatingPlan || tool !== "operating-plan").map(tool => <FileWorkspaceLink key={tool} tool={tool}>{FILE_WORKSPACE_LABELS[tool]}</FileWorkspaceLink>)}</nav>;
  return <FileWorkspaceProvider value={{ intakeId, profileId, pageMode: true, tool: request.tool }}><main className={`${styles.root}${operatingPlan ? ` ${styles.operatingPlan}` : ""}`}>
    {operatingPlan ? <header className={styles.planHeader}><div className={styles.planContext}><FileWorkspaceBackLink /><span>{title}</span></div><h1>Operating plan</h1><details className={styles.planTools}><summary>Other file workspaces</summary>{workspaceLinks}</details></header> : <><header><FileWorkspaceBackLink /><div><h1>{FILE_WORKSPACE_LABELS[request.tool]}</h1><p>{title}</p><small>The original file stays open in its tab. This workspace starts from saved file data.</small></div></header>{workspaceLinks}</>}
    {request.tool === "marketplace" && creationMode ? <div className="row"><a className="btn btn-sm" href={`/files/${encodeURIComponent(intakeId)}?workspace=package#package-readiness`} target="_blank" rel="noopener noreferrer">Prepare / refresh investor package</a><span className="sub">{packageCurrent ? "Current package on file" : "Package readiness is checked before publication."}</span></div> : null}
    {readiness.isError ? <Callout tone="warn">Program readiness could not be loaded. <Btn onClick={() => void readiness.refetch()}>Retry program readiness</Btn></Callout> : null}
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {notice ? <Callout tone="warn">{notice}</Callout> : null}
    {profileId && request.tool === "marketplace" && canPublish && !creationMode ? offerLookup.isError ? <Callout tone="bad">The saved offer could not be checked. No draft was created.<Btn onClick={() => void offerLookup.refetch()}>Retry offer lookup</Btn></Callout> : <p role="status">{offerLookup.data?.listing?.id ? "Opening Review and publish offer…" : "Finding the saved offer…"}</p> : profileId ? request.tool === "forms" || request.tool === "operating-plan" ? <FinancialWorkspace key={profileId} inline open profileId={profileId} initialKind={request.tool === "operating-plan" ? "operating_plan" : request.kind ?? "debt_schedule"} initialView={request.view} initialDebtId={request.debtId} onClose={() => window.location.assign(`/files/${encodeURIComponent(intakeId)}`)} /> : request.tool === "terms" && dealer ? <TermSheetDrawer inline open client={termsClient} profileId={profileId} onClose={() => undefined} /> : <FinancialCockpit key={profileId} workspaceTool={request.tool} profileId={profileId} businessName={title} canPublish={canPublish} canRecordTerms={dealer} canUnderwrite programReadiness={readiness.data ?? null} onProgramReadinessChange={value => cache.setQueryData(readinessKey, value)} onRefreshProgramReadiness={() => readiness.refetch()} canCreatePrograms={canPublish} intakeVariant={file.detail.intake.variant} termSheet={dealerTerms.data ?? null} packageState={packageState} focus={null} onFocusHandled={() => undefined} onRecordTerms={() => window.location.assign(`/files/${encodeURIComponent(intakeId)}/workspace?tool=terms`)} onOpenEvidence={() => window.location.assign(`/files/${encodeURIComponent(intakeId)}?section=evidence`)} onOpenPackage={() => window.location.assign(`/files/${encodeURIComponent(intakeId)}`)} termsKind={dealer ? "production" : "client"} /> : !error ? <p role="status">Resolving the linked application…</p> : null}
  </main></FileWorkspaceProvider>;
}
