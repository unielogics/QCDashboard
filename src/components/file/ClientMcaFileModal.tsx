"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import type { ApplicationProfile } from "@/lib/applicationProfile";
import { uploadFile } from "@/lib/fileUpload";
import { documentUploadErrorMessage, passwordProtectedPdfUploadNotice, screenPdfUploads } from "@/lib/documentUpload";
import { CreateLeadModal, type LeadCreationClient } from "./CreateLeadModal";
import { apiErrorMessage, type CreateLeadPayload, type LeadDetail } from "./leadFile";

/** Reuse file creation and room setup while adopting the existing MCA lead. */
export function ClientMcaFileModal({ client, onClose, onOpen }: {
  client: LeadCreationClient;
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const call = useAuthedApi();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  async function create(payload: CreateLeadPayload, evidenceFiles: File[]): Promise<LeadDetail | undefined> {
    setCreating(true);
    setError("");
    try {
      const screened = await screenPdfUploads(evidenceFiles);
      const lockedNotice = screened.rejected.length ? passwordProtectedPdfUploadNotice(screened.rejected) : "";
      if (!screened.uploadable.length && screened.rejected.length) {
        setError(lockedNotice);
        return;
      }
      const result = await call<LeadDetail>("/admin/ai-underwriter-leads", {
        method: "POST",
        body: JSON.stringify({ ...payload, client_id: client.id, variant: "main_street", intent: "merchant_cash_advance" }),
      });
      const warnings = [lockedNotice];
      try {
        const profile = await call<ApplicationProfile>("/application-profiles/resolve", {
          method: "POST", body: JSON.stringify({ source_kind: "intake", source_id: result.intake.id }),
        });
        await call(`/application-profiles/${profile.id}/draft`, { method: "POST" });
      } catch (err) {
        warnings.push(apiErrorMessage(err, "The file was saved. Open it to prepare the application workspace."));
      }
      for (const file of screened.uploadable) {
        try {
          await uploadFile({
            initPath: `/admin/ai-underwriter-leads/${result.intake.id}/files/upload-init`,
            completePath: `/admin/ai-underwriter-leads/${result.intake.id}/files/complete`,
            call,
          }, file, { requestedDocumentId: null });
        } catch (err) {
          warnings.push(documentUploadErrorMessage(err, `${file.name} could not be uploaded. Upload it from the saved file.`));
        }
      }
      void queryClient.invalidateQueries({ queryKey: ["clients"] });
      void queryClient.invalidateQueries({ queryKey: ["client", client.id] });
      void queryClient.invalidateQueries({ queryKey: ["operator-files"] });
      return { ...result, creation_warning: warnings.filter(Boolean).join(" ") || undefined };
    } catch (err) {
      const detail = err instanceof ApiError && err.status === 409
        ? (err.body as { detail?: { intake_id?: unknown } } | null)?.detail : null;
      if (typeof detail?.intake_id === "string" && detail.intake_id) {
        onOpen(detail.intake_id);
        return;
      }
      setError(apiErrorMessage(err, "Could not create the MCA file."));
    } finally {
      setCreating(false);
    }
  }

  return <CreateLeadModal initialVariant="mca_funding" sourceClient={client} onClose={onClose} onOpen={onOpen} creating={creating} createError={error} onCreate={create} />;
}
