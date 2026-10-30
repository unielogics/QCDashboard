"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAIReview } from "@/components/admin/AIReviewProvider";
import type { ClientThreadResponse, LeadCockpitAdapter } from "@/components/admin/LeadCockpit";
import { api } from "@/lib/api";
import { reviewCompletionNotice } from "@/lib/aiReviewJobs";
import { useConsoleAuth } from "@/lib/consoleAuth";
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

export function useLeadFile({ leadId, notify, onListChanged }: UseLeadFileOptions) {
  const { getToken } = useConsoleAuth();
  const { requestReview, isReviewing } = useAIReview();
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const loadingRequestRef = useRef(0);

  const call = useCallback(async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }, [getToken]);

  const load = useCallback(async (id: string, options: { background?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    if (!options.background) {
      loadingRequestRef.current = requestId;
      setLoading(true);
    }
    try {
      const data = await call<LeadDetail>(`/admin/ai-underwriter-leads/${id}`);
      if (requestId !== requestRef.current) return;
      setDetail(data);
    } catch (error) {
      if (requestId === requestRef.current) notify(error instanceof Error ? error.message : "Lead detail is unavailable.");
    } finally {
      if (!options.background && requestId === loadingRequestRef.current) setLoading(false);
    }
  }, [call, notify]);

  // A new file id loads fresh; clearing the id drops the detail and cancels
  // any response still in flight for the previous one.
  useEffect(() => {
    if (!leadId) {
      requestRef.current += 1;
      setDetail(null);
      setLoading(false);
      return;
    }
    void load(leadId);
  }, [leadId, load]);

  const reload = useCallback(async (options: { background?: boolean } = { background: true }) => {
    if (leadId) await load(leadId, options);
  }, [leadId, load]);

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
      notify(`PDF export failed: ${res.status} ${res.statusText}`);
      return;
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
    }
  }

  const generateExecutiveSummary = () => generate("/executive-summary", "Executive summary generated.", "Executive summary failed.");
  const generateLenderPacket = () => generate("/lender-packet", "Lender packet generated.", "Lender packet failed.");
  const generatePrequalification = () => generate("/prequalification", "Prequalification drafted.", "Prequalification failed.");

  async function generatePackageReadiness(): Promise<PackageReadinessGeneration> {
    if (!leadId) throw new Error("No file is open.");
    notify("");
    try {
      const generated = await call<PackageReadinessGeneration>(`/admin/ai-underwriter-leads/${leadId}/package-readiness/generate`, { method: "POST" });
      try {
        await reload();
        notify("Executive summary and lender package refreshed together and saved to the room.");
      } catch {
        // The generation POST already committed immutable package versions. A
        // failed follow-up reload must not read as a failed generation.
        notify("Both PDFs were generated and saved. Reload the file to refresh the surrounding workspace.");
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
      replyClientThread: (message: string, alsoSms = false) => post<ClientThreadResponse>("/client-thread/reply", { message, also_sms: alsoSms }),
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
    setDetail((current) =>
      current
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
        : current,
    );
  }

  return {
    detail,
    loading,
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
