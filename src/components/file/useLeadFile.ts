"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAIReview } from "@/components/admin/AIReviewProvider";
import type { ClientThreadResponse, LeadCockpitAdapter } from "@/components/admin/LeadCockpit";
import { api, ApiError } from "@/lib/api";
import { reviewCompletionNotice } from "@/lib/aiReviewJobs";
import { isVisualQa, useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { fileAuthScope, fileDetailKey, fileDetailPath } from "@/lib/fileOpening";
import type { IntakeResponse } from "@/lib/intake";
import { mcaRefinanceReviewState } from "@/lib/mcaRefinanceReview";
import {
  apiErrorMessage,
  isSourceEvidenceFile,
  type Artifact,
  type DriveIngestResult,
  type LeadContactUpdate,
  type LeadDetail,
  type LeadRow,
  type PackageReadinessGeneration,
  type PackageGenerationOptions,
  type VendorEmailPreview,
  type VendorEmailSendPayload,
  type VendorEmailSendResult,
} from "./leadFile";

/**
 * One file's detail and every action on it, independent of the list it was
 * opened from.
 *
 * The list page used to own all of this inside a 4,500-line component, which
 * is why nothing else could show a file. The hook loads the detail for
 * `leadId`, keeps it fresh after each action, and reports two things upward:
 * notices (the caller decides where they render) and "the list changed"
 * (so a list beside it can refresh). The File page and the list page both
 * mount the same panel with the same handlers.
 */

export type UseLeadFileOptions = {
  leadId: string | null;
  notify: (text: string) => void;
  onListChanged?: () => void;
  includeDerived?: boolean;
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Prefer the server's Content-Disposition name; fall back to the dealer's. */
function downloadFilename(res: Response, dealer: string, fallbackSuffix: string, fallback: string): string {
  const safeDealer = dealer.trim().replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename\*?=(?:UTF-8''|")?([^";]+)/i);
  return (match && decodeURIComponent(match[1].trim().replace(/"/g, ""))) || (safeDealer ? `${safeDealer}-${fallbackSuffix}` : fallback);
}

export function useLeadFile({ leadId, notify, onListChanged, includeDerived = false }: UseLeadFileOptions) {
  const auth = useConsoleAuth();
  const { getToken } = auth;
  const { requestReview, isReviewing } = useAIReview();
  const queryClient = useQueryClient();
  const [analysisRequestedFor, setAnalysisRequestedFor] = useState<string | null>(null);
  const scope = fileAuthScope(auth, isVisualQa ? visualQaUser("admin@qc.dev") : null);
  const enabled = Boolean(leadId && auth.isLoaded && auth.isSignedIn && auth.userId);
  const wantsAnalysis = includeDerived || analysisRequestedFor === leadId;
  const factsKey = fileDetailKey(scope, leadId);
  const analysisKey = fileDetailKey(scope, leadId, true);
  const notifyRef = useRef(notify);
  const activeLead = useRef(leadId);
  activeLead.current = leadId;
  useEffect(() => { activeLead.current = leadId; return () => { activeLead.current = null; }; }, [leadId]);
  useEffect(() => { notifyRef.current = notify; }, [notify]);

  const call = useCallback(async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }, [getToken]);

  // The factual shell never waits for financial recomputation or package
  // fingerprints. Concurrent readers share a request; obsolete reads abort.
  const facts = useQuery({ queryKey: factsKey, queryFn: ({ signal }) => call<LeadDetail>(fileDetailPath(leadId!), { signal }), enabled,
    staleTime: 0, gcTime: 5 * 60_000, refetchOnMount: "always", refetchOnWindowFocus: false, retry: false });
  const analysis = useQuery({ queryKey: analysisKey, queryFn: ({ signal }) => call<LeadDetail>(fileDetailPath(leadId!, true), { signal }),
    enabled: enabled && wantsAnalysis && facts.data?.derived_pending === true && !facts.isFetching,
    staleTime: 0, gcTime: 5 * 60_000, refetchOnMount: "always", refetchOnWindowFocus: false, retry: false });
  // Never render another file's object, even for the frame before effects run.
  const denied = [facts.error, analysis.error].some(error => error instanceof ApiError && [401, 403, 404].includes(error.status));
  const factualDetail = enabled && !denied && facts.data?.intake.id === leadId ? facts.data : null;
  const detailedAnalysis = enabled && analysis.data?.intake.id === leadId && analysis.dataUpdatedAt >= facts.dataUpdatedAt ? analysis.data : null;
  const detail = !denied && wantsAnalysis && detailedAnalysis && !detailedAnalysis.derived_pending && !facts.isFetching && !analysis.isFetching ? detailedAnalysis : factualDetail;
  const loading = Boolean(enabled && !factualDetail && (facts.isPending || facts.isFetching));
  const refreshing = Boolean(detail && (facts.isFetching || analysis.isFetching));
  useEffect(() => {
    const error = facts.error ?? analysis.error;
    if (!error) return;
    if (error instanceof ApiError && [401, 403, 404].includes(error.status)) {
      // A 404 can be a deliberately concealed revocation/archive. Replace the
      // cached snapshots with empty sentinels without retrying a denied read.
      queryClient.setQueryData<LeadDetail | null>(fileDetailKey(scope, leadId), null);
      queryClient.setQueryData<LeadDetail | null>(fileDetailKey(scope, leadId, true), null);
    }
    notifyRef.current(error instanceof Error ? error.message : "File detail is unavailable.");
  }, [facts.error, analysis.error, leadId, queryClient, scope]);
  const requestDerived = useCallback(() => { if (leadId) setAnalysisRequestedFor(leadId); }, [leadId]);
  const refetchFacts = facts.refetch;
  const refetchAnalysis = analysis.refetch;
  const reload = useCallback(async (_options: { background?: boolean } = { background: true }) => {
    if (!leadId || !enabled || activeLead.current !== leadId) return;
    // A mutation must not reuse an analysis request started before its write.
    await queryClient.cancelQueries({ queryKey: fileDetailKey(scope, leadId, true), exact: true });
    queryClient.setQueryData<LeadDetail>(fileDetailKey(scope, leadId, true), current => current ? { ...current, derived_pending: true } : current);
    try {
      const current = await refetchFacts({ throwOnError: true });
      if (activeLead.current === leadId && wantsAnalysis && current.data?.derived_pending) await refetchAnalysis({ throwOnError: true, cancelRefetch: false });
    } catch (error) {
      // The preceding write may already have committed (or sent a message).
      // A failed refresh must not invite retrying that successful operation.
      notifyRef.current(error instanceof Error ? error.message : "The file changed, but its display could not be refreshed.");
    }
  }, [enabled, refetchAnalysis, refetchFacts, leadId, queryClient, scope, wantsAnalysis]);

  // The AI review runs elsewhere and announces completion on the window.
  useEffect(() => {
    const onReviewCompleted = (event: Event) => {
      const payload = (event as CustomEvent<{ intakeId?: string; status?: string }>).detail;
      if (!payload?.intakeId || payload.intakeId !== leadId) return;
      void reload();
      onListChanged?.();
      notify(reviewCompletionNotice(payload.status));
    };
    window.addEventListener("qc-ai-review-completed", onReviewCompleted);
    return () => window.removeEventListener("qc-ai-review-completed", onReviewCompleted);
  }, [leadId, reload, onListChanged, notify]);

  async function authedFetch(path: string): Promise<Response> {
    const token = await getToken();
    return fetch(`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  }

  const dealerName = () => detail?.intake.business_name || detail?.intake.full_name || "";

  async function exportPdf() {
    if (!leadId) return;
    const res = await authedFetch(`/admin/ai-underwriter-leads/${leadId}/intelligence.pdf`);
    if (!res.ok) {
      throw new Error(`PDF export failed: ${res.status} ${res.statusText}`);
    }
    downloadBlob(await res.blob(), downloadFilename(res, dealerName(), "intelligence.pdf", "dealer-ai-intelligence.pdf"));
  }

  async function downloadPackageZip() {
    if (!leadId) return;
    const res = await authedFetch(`/admin/ai-underwriter-leads/${leadId}/package.zip`);
    if (!res.ok) throw new Error(`Package export failed: ${res.status} ${res.statusText}`);
    downloadBlob(await res.blob(), downloadFilename(res, dealerName(), "package.zip", "underwriting-package.zip"));
  }

  async function postNote(content: string, imageIds: string[] = []) {
    if (!leadId) return;
    await call(`/admin/ai-underwriter-leads/${leadId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, image_ids: imageIds }),
    });
    await reload();
  }

  async function patchAndRefresh(path: string, body: unknown) {
    if (!leadId) return;
    await call(`/admin/ai-underwriter-leads/${leadId}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    await reload();
    onListChanged?.();
  }

  const updateOutcomeStatus = (outcomeStatus: string) => patchAndRefresh("/outcome-status", { outcome_status: outcomeStatus });
  const updateLanguage = (language: string) => patchAndRefresh("/language", { preferred_language: language });
  const updateContact = (payload: LeadContactUpdate) => patchAndRefresh("/contact", payload);

  async function cancelDeletionRequest() {
    if (!leadId) return;
    await call(`/admin/ai-underwriter-leads/${leadId}/cancel-deletion-request`, { method: "POST" });
    await reload();
    onListChanged?.();
  }

  /** Reversible archive of the file; the caller decides what to show next. */
  async function deleteLead(confirmName: string, id: string | null = leadId) {
    if (!id) return;
    await call(`/admin/ai-underwriter-leads/${id}/confirm-deletion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm_name: confirmName }),
    });
    queryClient.removeQueries({ queryKey: ["lead-file", scope, id] });
    onListChanged?.();
  }

  async function restoreLead(id: string | null = leadId) {
    if (!id) return;
    notify("");
    try {
      await call<LeadRow>(`/admin/ai-underwriter-leads/${id}/restore`, { method: "POST" });
      notify("File restored with its existing documents and history.");
      if (id === leadId) await reload();
      onListChanged?.();
    } catch (error) {
      notify(apiErrorMessage(error, "This file could not be restored."));
    }
  }

  function openRerun() {
    if (!leadId || !detail || detail.intake.id !== leadId) return;
    const mca = mcaRefinanceReviewState(detail);
    if (mca && mca.mode !== "automated_review") {
      notify(mca.description);
      return;
    }
    requestReview({ intakeId: leadId, leadName: detail.intake.business_name || detail.intake.full_name || "File" });
  }

  async function generate(path: string, done: string, failed: string) {
    if (!leadId) return;
    notify("");
    try {
      await call<Artifact>(`/admin/ai-underwriter-leads/${leadId}${path}`, { method: "POST" });
      await reload();
      notify(done);
    } catch (error) {
      notify(error instanceof Error ? error.message : failed);
      throw error;
    }
  }

  const generateExecutiveSummary = () => generate("/executive-summary", "Executive summary generated.", "Executive summary failed.");
  const generateLenderPacket = () => generate("/lender-packet", "Lender packet generated.", "Lender packet failed.");
  const generatePrequalification = () => generate("/prequalification", "Prequalification drafted.", "Prequalification failed.");

  async function generatePackageReadiness(options?: PackageGenerationOptions): Promise<PackageReadinessGeneration> {
    if (!leadId) throw new Error("No file is open.");
    notify("");
    try {
      const generated = await call<PackageReadinessGeneration>(`/admin/ai-underwriter-leads/${leadId}/package-readiness/generate`, { method: "POST", body: JSON.stringify(options ?? {}) });
      try {
        await reload();
        notify("Investor presentation and supporting PDFs refreshed together and saved to the room.");
      } catch {
        // The generation POST already committed immutable package versions. A
        // failed follow-up reload must not read as a failed generation.
        notify("The package PDFs were generated and saved. Reload the file to refresh the surrounding workspace.");
      }
      return generated;
    } catch (error) {
      notify(error instanceof Error ? error.message : "The lender package could not be refreshed.");
      throw error;
    }
  }

  async function previewVendorEmail(payload: { to_emails: string[]; cc_emails: string[]; subject?: string; body?: string; include_lender_packet?: boolean }) {
    if (!leadId) throw new Error("No file is open.");
    notify("");
    try {
      const preview = await call<VendorEmailPreview>(`/admin/ai-underwriter-leads/${leadId}/vendor-email/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await reload();
      return preview;
    } catch (error) {
      notify(error instanceof Error ? error.message : "Vendor email preview failed.");
      throw error;
    }
  }

  async function sendVendorEmail(payload: VendorEmailSendPayload) {
    if (!leadId) throw new Error("No file is open.");
    notify("");
    const res = await call<VendorEmailSendResult>(`/admin/ai-underwriter-leads/${leadId}/vendor-email/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    await reload();
    return res;
  }

  async function ingestFromDrive(driveFileIds: string[]) {
    if (!leadId) throw new Error("No file is open.");
    notify("");
    const res = await call<DriveIngestResult>(`/admin/ai-underwriter-leads/${leadId}/files/ingest-from-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ drive_file_ids: driveFileIds }),
    });
    await reload();
    return res;
  }

  // Map the admin LeadDetail into the IntakeResponse shape the cockpit expects.
  const cockpitResponse = useMemo<IntakeResponse | null>(() => {
    if (!detail) return null;
    return {
      token: null,
      session_token: null,
      mca_refinance_policy: detail.mca_refinance_policy ?? detail.intake.mca_refinance_policy ?? null,
      intake: {
        id: detail.intake.id,
        bucket_id: detail.intake.bucket_id,
        full_name: detail.intake.full_name,
        email: detail.intake.email,
        phone: detail.intake.phone ?? null,
        business_name: detail.intake.business_name ?? null,
        loan_purpose: detail.intake.loan_purpose ?? null,
        requested_loan_amount: detail.intake.requested_loan_amount ?? null,
        estimated_credit_score: detail.intake.estimated_credit_score ?? null,
        referral_source: detail.intake.referral_source ?? null,
        status: detail.intake.status,
        result_snapshot: detail.intake.result_snapshot ?? null,
        intake_state: detail.intake.intake_state ?? null,
        mca_refinance_policy: detail.intake.mca_refinance_policy ?? detail.mca_refinance_policy ?? null,
      },
      requested_documents: detail.requested_documents,
      files: detail.files.filter(isSourceEvidenceFile),
      latest_review: detail.latest_review ?? null,
      messages: detail.messages,
      assistant_message: "",
      widget: null,
    } as unknown as IntakeResponse;
  }, [detail]);

  // A Clerk-authenticated transport against the admin endpoints for the cockpit.
  const cockpitAdapter = useMemo<LeadCockpitAdapter | null>(() => {
    if (!leadId) return null;
    const base = `/admin/ai-underwriter-leads/${leadId}`;
    const post = <T,>(path: string, body?: unknown) =>
      call<T>(`${base}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    const isDealer = detail?.intake.variant !== "real_estate_dscr_v1";
    return {
      sendChat: (message: string) => post<IntakeResponse>("/chat", { message }),
      uploadInit: (payload) => post("/files/upload-init", payload),
      uploadComplete: async (fileId: string) => {
        await post("/files/complete", { file_id: fileId });
      },
      runReview: () => post<IntakeResponse>("/run-review"),
      reload: () => call<IntakeResponse>(base),
      loadClientThread: () => call<ClientThreadResponse>(`${base}/client-thread`, { cache: "no-store" }),
      replyClientThread: (message: string, alsoSms = false, imageIds: string[] = []) => post<ClientThreadResponse>("/client-thread/reply", { message, also_sms: alsoSms, image_ids: imageIds }),
      resumeClientThreadAI: () => post<ClientThreadResponse>("/client-thread/resume", {}),
      // PFS/debt-schedule request + fill-in are dealer-only — real-estate
      // leads never see these fields, so the adapter omits them entirely.
      requestPfs: isDealer ? async (ownerName?: string) => { await post("/request-pfs", { owner_name: ownerName || null }); } : undefined,
      requestDebtSchedule: isDealer ? async () => { await post("/request-debt-schedule"); } : undefined,
      submitPfs: isDealer ? async (payload) => { await post("/requested-documents/pfs", payload); } : undefined,
      submitDebtSchedule: isDealer ? async (payload) => { await post("/requested-documents/debt-schedule", payload); } : undefined,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadId, detail?.intake.variant]);

  /** Fold a cockpit response (chat turn, upload, re-run) back into the detail so switching tabs keeps the live conversation. */
  function foldCockpitResponse(r: IntakeResponse) {
    if (!leadId || (r.intake?.id && r.intake.id !== leadId)) return;
    const fold = (current: LeadDetail | undefined) =>
      current?.intake.id === leadId
        ? {
            ...current,
            messages: r.messages ?? current.messages,
            files: r.files ?? current.files,
            requested_documents: r.requested_documents ?? current.requested_documents,
            latest_review: r.latest_review ?? current.latest_review,
            mca_refinance_policy: r.mca_refinance_policy ?? current.mca_refinance_policy,
            intake: {
              ...current.intake,
              intake_state: r.intake?.intake_state ?? current.intake.intake_state,
              mca_refinance_policy: r.mca_refinance_policy ?? current.intake.mca_refinance_policy,
              result_snapshot: r.intake?.result_snapshot ?? current.intake.result_snapshot,
              status: r.intake?.status ?? current.intake.status,
            },
          }
        : current;
    queryClient.setQueryData<LeadDetail>(factsKey, fold);
    queryClient.setQueryData<LeadDetail>(analysisKey, fold);
    void queryClient.invalidateQueries({ queryKey: analysisKey, exact: true });
  }

  return {
    detail,
    loading,
    refreshing,
    requestDerived,
    reload,
    rerunning: Boolean(leadId && isReviewing(leadId)),
    cockpitResponse,
    cockpitAdapter,
    foldCockpitResponse,
    exportPdf,
    downloadPackageZip,
    postNote,
    updateOutcomeStatus,
    updateLanguage,
    updateContact,
    cancelDeletionRequest,
    deleteLead,
    restoreLead,
    openRerun,
    generateExecutiveSummary,
    generateLenderPacket,
    generatePackageReadiness,
    generatePrequalification,
    previewVendorEmail,
    sendVendorEmail,
    ingestFromDrive,
  };
}
