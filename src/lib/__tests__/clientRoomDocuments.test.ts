import { describe, expect, it } from "vitest";

import { clientActionableRequestedDocumentUploadTarget, clientActionNeeded, clientApiError, clientApiErrorCode, clientApiErrorDetail, clientMcaRequestedDocumentLayout, clientQueuedUploadCanSubmit, clientRequestedDocumentContextText, clientRequestedDocumentNeedsAction, clientRequestedDocumentState, clientUploadTarget, hasDuplicateSingleUseUploadTargets, isStaleRequestedDocumentError, isUnlockedCopyRequestedDocument, isValidRoomPin, normalizeRoomPin } from "@/lib/clientRoomDocuments";

describe("client requested-document state", () => {
  it("keeps a new unlocked-copy request actionable before upload", () => {
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: true,
      documentStatus: "requested",
      hasUploadedFile: false,
    })).toBe("needed");
  });

  it("shows an uploaded replacement as checking until evidence is accepted", () => {
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: true,
      documentStatus: "uploaded",
      hasUploadedFile: true,
      requirementComplete: true,
      uploadedEvidence: [{ analysisStatus: null }],
    })).toBe("checking");
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: true,
      documentStatus: "uploaded",
      hasUploadedFile: true,
      requirementComplete: true,
      uploadedEvidence: [{ analysisStatus: "completed", analysisClassification: "personal_financial_statement" }],
    })).toBe("accepted");
  });

  it("keeps only proven unreadable replacements needed", () => {
    for (const uploadedEvidence of [
      [{ analysisStatus: "skipped", analysisReasonCode: "unsupported_type" }],
      [{ analysisStatus: "skipped", analysisReasonCode: "password_protected", isPasswordProtected: true }],
      [{ analysisStatus: "completed", analysisClassification: "unreadable" }],
    ]) {
      expect(clientRequestedDocumentState({
        isUnlockedCopyRequest: true,
        documentStatus: "uploaded",
        hasUploadedFile: true,
        uploadedEvidence,
      })).toBe("needed");
    }
  });

  it("keeps a provider or system analysis failure under review", () => {
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: true,
      documentStatus: "uploaded",
      hasUploadedFile: true,
      uploadedEvidence: [{ analysisStatus: "failed", analysisReasonCode: "analysis_failed" }],
    })).toBe("checking");
  });

  it("keeps queued and status-less replacement uploads checking", () => {
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: true,
      hasUploadedFile: true,
      uploadedEvidence: [{ analysisStatus: "queued" }],
    })).toBe("checking");
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: true,
      hasUploadedFile: true,
      uploadedEvidence: [{ analysisStatus: null }],
    })).toBe("checking");
  });

  it("uses the backend replacement review state for all lifecycle outcomes", () => {
    expect(clientRequestedDocumentState({ isUnlockedCopyRequest: true, hasUploadedFile: false, replacementReviewState: "requested" })).toBe("needed");
    expect(clientRequestedDocumentState({ isUnlockedCopyRequest: true, hasUploadedFile: true, replacementReviewState: "checking" })).toBe("checking");
    expect(clientRequestedDocumentState({ isUnlockedCopyRequest: true, hasUploadedFile: true, replacementReviewState: "received" })).toBe("accepted");
    expect(clientRequestedDocumentState({ isUnlockedCopyRequest: true, hasUploadedFile: true, replacementReviewState: "needs_another_copy" })).toBe("needed");
  });

  it("counts only work the client can act on", () => {
    expect(clientActionNeeded("needed")).toBe(true);
    expect(clientActionNeeded("checking")).toBe(false);
    expect(clientActionNeeded("accepted")).toBe(false);
  });

  it("keeps an unlocked-copy task open when its prior replacement was removed", () => {
    expect(clientRequestedDocumentNeedsAction({
      id: "unlock-request",
      status: "uploaded",
      request_kind: "unlocked_copy",
      replacement_review_state: "requested",
    }, [])).toBe(true);
    expect(clientRequestedDocumentNeedsAction({
      id: "unlock-request",
      status: "uploaded",
      request_kind: "unlocked_copy",
      replacement_review_state: "received",
    }, [{ requested_document_id: "unlock-request", analysis_status: "completed" }])).toBe(false);
  });

  it("classifies an opaque unlocked-copy filename from its source requirement", () => {
    const original = { id: "bank-doc", name: "Last 6 months business bank statements", category: "Banking", status: "uploaded" };
    const replacement = {
      id: "unlock-doc",
      name: "Unlocked copy of 2026-08-31_STMSSCM (1).pdf",
      category: "Replacement Documents",
      request_kind: "unlocked_copy",
      source_file_id: "locked-file",
    };
    expect(clientRequestedDocumentContextText(replacement, [original, replacement], [{
      id: "locked-file",
      requested_document_id: original.id,
    }])).toContain("bank statements");
  });

  it("keeps an opaque unlinked MCA unlocked-copy request reachable beside occupied canonical slots", () => {
    const bank = { id: "bank", name: "Business bank statements", category: "Banking", status: "uploaded" };
    const credit = { id: "credit", name: "Credit authorization", status: "uploaded", requires_signature: true };
    const terms = { id: "terms", name: "Current MCA terms", status: "uploaded" };
    const unlocked = {
      id: "unlock",
      name: "Replacement requested for file-8842.pdf",
      status: "requested",
      request_kind: "unlocked_copy",
      source_file_id: "opaque-source",
      replacement_review_state: "requested",
    };
    const source = {
      id: "opaque-source",
      requested_document_id: null,
      analysis_status: "completed",
      analysis_classification: "unreadable",
      is_password_protected: true,
    };

    const layout = clientMcaRequestedDocumentLayout([bank, credit, terms, unlocked], [source]);

    expect(layout.bank?.id).toBe("bank");
    expect(layout.credit?.id).toBe("credit");
    expect(layout.terms?.id).toBe("terms");
    expect(layout.unresolvedUnlockedCopies.map((document) => document.id)).toEqual(["unlock"]);
    expect([layout.bank?.id, layout.credit?.id, layout.terms?.id]).not.toContain("unlock");
  });

  it("never routes credit or terms unlocked-copy requests into specialized MCA controls", () => {
    const creditReplacement = {
      id: "unlock-credit",
      name: "Unlocked credit report",
      status: "requested",
      request_kind: "unlocked_copy",
      replacement_review_state: "requested",
    };
    const termsReplacement = {
      id: "unlock-terms",
      name: "Unlocked MCA terms",
      status: "requested",
      request_kind: "unlocked_copy",
      replacement_review_state: "requested",
    };

    const layout = clientMcaRequestedDocumentLayout([creditReplacement, termsReplacement], []);

    expect(layout.credit).toBeNull();
    expect(layout.terms).toBeNull();
    expect(layout.unresolvedUnlockedCopies.map((document) => document.id)).toEqual(["unlock-credit", "unlock-terms"]);
  });

  it("keeps an MCA replacement visible while checking and clears it only when received", () => {
    const request = {
      id: "unlock",
      name: "Unlocked replacement",
      status: "uploaded",
      request_kind: "unlocked_copy",
      replacement_review_state: "checking",
    };
    expect(clientMcaRequestedDocumentLayout([request], []).unresolvedUnlockedCopies).toHaveLength(1);
    expect(clientMcaRequestedDocumentLayout([{ ...request, replacement_review_state: "received" }], []).unresolvedUnlockedCopies).toHaveLength(0);
  });

  it("does not call a canonical requirement accepted just because a rejected file was received", () => {
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: false,
      documentStatus: "uploaded",
      hasUploadedFile: true,
      requirementComplete: false,
      processingEvidenceCount: 0,
    })).toBe("needed");
    expect(clientRequestedDocumentState({
      isUnlockedCopyRequest: false,
      documentStatus: "uploaded",
      hasUploadedFile: true,
      requirementComplete: false,
      processingEvidenceCount: 1,
    })).toBe("checking");
  });

  it("routes Add file to the exact requested document", () => {
    expect(clientUploadTarget("unlock-req", ["bank", "unlock-req"], "supporting")).toBe("unlock-req");
    expect(clientUploadTarget("missing", ["bank", "unlock-req"], "supporting")).toBe("supporting");
  });

  it("keeps an opaque unlocked-copy task targetable when its source was a supporting upload", () => {
    const sourceFile = {
      id: "locked-supporting-file",
      requested_document_id: null,
      analysis_status: "failed",
      analysis_reason_code: "password_protected",
      analysis_classification: "unreadable",
      is_password_protected: true,
    };
    const request = {
      id: "unlock-request",
      name: "Unlocked copy of 2026-08-31_STMSSCM (1).pdf",
      status: "requested",
      request_kind: "unlocked_copy",
      source_file_id: sourceFile.id,
      replacement_review_state: "requested",
    };

    expect(clientActionableRequestedDocumentUploadTarget(request, [sourceFile])).toBe(request.id);
  });

  it("does not turn a signature request into a file-upload target", () => {
    expect(clientActionableRequestedDocumentUploadTarget({
      id: "signature-request",
      status: "requested",
      requires_signature: true,
    }, [])).toBeNull();
  });

  it("recognizes an explicit unlocked-copy task without relying on source-file history", () => {
    expect(isUnlockedCopyRequestedDocument({ id: "linked", isUnlockedCopyRequest: true }, new Set())).toBe(true);
    expect(isUnlockedCopyRequestedDocument({ id: "linked", requestKind: "unlocked_copy" }, new Set())).toBe(true);
    expect(isUnlockedCopyRequestedDocument({ id: "legacy" }, new Set(["legacy"]))).toBe(true);
  });

  it("allows another upload attempt for a normally single-use unlocked-copy task", () => {
    const uploads = [
      { requestedDocumentId: "unlock", status: "uploaded" },
      { requestedDocumentId: "unlock", status: "ready" },
    ];
    expect(hasDuplicateSingleUseUploadTargets(uploads, new Set(["unlock"]), new Set(["unlock"]))).toBe(false);
    expect(hasDuplicateSingleUseUploadTargets(uploads, new Set(["unlock"]), new Set())).toBe(true);
  });

  it("normalizes the application-room PIN to exactly six numeric digits", () => {
    expect(normalizeRoomPin("12a-34567!")).toBe("123456");
    expect(isValidRoomPin("123456")).toBe(true);
    expect(isValidRoomPin("12345")).toBe(false);
    expect(isValidRoomPin("12-456")).toBe(false);
  });

  it("preserves structured stale-request errors so the room can refresh", () => {
    expect(clientApiErrorDetail({
      detail: {
        code: "stale_requested_document",
        message: "This upload request was replaced by a newer task.",
      },
    }, "Upload failed.")).toEqual({
      code: "stale_requested_document",
      message: "This upload request was replaced by a newer task.",
    });
    expect(clientApiErrorDetail({ detail: "Invalid access code" }, "Upload failed.")).toEqual({ message: "Invalid access code" });
    expect(clientApiErrorDetail({ detail: { code: 409 } }, "Upload failed.")).toEqual({ message: "Upload failed." });
    const coded = clientApiError({ detail: { code: "stale_requested_document", message: "Refresh the checklist." } }, "Upload failed.");
    expect(coded.message).toBe("Refresh the checklist.");
    expect(clientApiErrorCode(coded)).toBe("stale_requested_document");
    expect(isStaleRequestedDocumentError(coded)).toBe(true);
    expect(isStaleRequestedDocumentError({ body: { detail: { code: "stale_requested_document" } } })).toBe(true);
    expect(isStaleRequestedDocumentError(new Error("stale_requested_document"))).toBe(false);
  });

  it("blocks a stale queued upload until the client chooses a current target", () => {
    expect(clientQueuedUploadCanSubmit({ status: "error", requiresRetarget: true })).toBe(false);
    expect(clientQueuedUploadCanSubmit({ status: "ready", requiresRetarget: true })).toBe(false);
    expect(clientQueuedUploadCanSubmit({ status: "ready", requiresRetarget: false })).toBe(true);
    expect(clientQueuedUploadCanSubmit({ status: "error" })).toBe(true);
  });
});
