import { describe, expect, it } from "vitest";

import {
  isPdfPasswordError,
  lockedEvidencePresentation,
  unlockedCopyActionState,
  unlockedCopyRequest,
} from "@/lib/lockedEvidence";

describe("locked evidence presentation", () => {
  it("renders a password-protected PDF as a locked file that needs a new copy", () => {
    expect(lockedEvidencePresentation({
      fileName: "Grace PFS 8-31-2026.pdf",
      analysisStatus: "skipped",
      analysisReasonCode: "password_protected",
    })).toEqual({
      title: "Locked PDF",
      badge: "Password required",
      explanation: "This password-protected PDF cannot be previewed here.",
    });
  });

  it("prefers the explicit backend lock signal even without analysis text", () => {
    expect(lockedEvidencePresentation({
      fileName: "statement.pdf",
      isPasswordProtected: true,
    })?.badge).toBe("Password required");
  });

  it("treats an explicit current-hash false as authoritative over stale analysis text", () => {
    expect(lockedEvidencePresentation({
      fileName: "unlocked-statement.pdf",
      isPasswordProtected: false,
      analysisReasonCode: "password_protected",
      analysisDetail: "Password required by an older analysis run.",
    })).toBeNull();
  });

  it("recognizes a collapsed unreadable decision only when its explanation proves a password lock", () => {
    expect(lockedEvidencePresentation({
      fileName: "PFS.pdf",
      decisionReasonCode: "unreadable",
      decisionExplanation: "This PDF is password-protected and could not be extracted.",
    })?.badge).toBe("Password required");
    expect(lockedEvidencePresentation({
      fileName: "scan.pdf",
      decisionReasonCode: "unreadable",
      decisionExplanation: "The scan is too blurry to read.",
    })).toBeNull();
  });

  it("builds the file-scoped unlocked-copy request", () => {
    expect(unlockedCopyRequest("profile/id", "file/id")).toEqual({
      path: "/application-profiles/profile%2Fid/evidence/file%2Fid/request-unlocked-copy",
      payload: { retry_failed: false, delivery_mode: "email_if_available" },
    });
    expect(unlockedCopyRequest("profile/id", "file/id", false, "room_link_only").payload).toEqual({
      retry_failed: false,
      delivery_mode: "room_link_only",
    });
  });

  it("distinguishes request, delivery retry, active request, and replacement states", () => {
    expect(unlockedCopyActionState(null)).toMatchObject({ kind: "request", label: "Request unlocked copy", retryFailed: false });
    expect(unlockedCopyActionState({ request_status: "requested", delivery_status: "failed" })).toMatchObject({ kind: "retry", label: "Retry request", retryFailed: true, offerRoomLink: true });
    expect(unlockedCopyActionState({ request_status: "requested", delivery_status: "created" })).toMatchObject({ kind: "requested", label: "Unlocked copy requested", offerRoomLink: true, offerRetry: true });
    expect(unlockedCopyActionState({ request_status: "uploaded", delivery_status: "sent" })).toMatchObject({ kind: "replacement_received", label: "Replacement received", disabled: true });
    expect(unlockedCopyActionState({ request_status: "uploaded", delivery_status: "sent", replacement_review_state: "checking" })).toMatchObject({ kind: "replacement_checking", label: "Replacement under review", disabled: true });
    expect(unlockedCopyActionState({ request_status: "uploaded", delivery_status: "sent", replacement_review_state: "requested" })).toMatchObject({ kind: "requested", label: "Unlocked copy requested", disabled: true });
    expect(unlockedCopyActionState({ request_status: "uploaded", delivery_status: "sent", replacement_review_state: "needs_another_copy" })).toMatchObject({ kind: "needs_another_copy", label: "Another unlocked copy needed", disabled: false, offerRoomLink: true });
    expect(unlockedCopyActionState({ request_status: "uploaded", delivery_status: "sent", replacement_review_state: "received" })).toMatchObject({ kind: "replacement_received", label: "Replacement received", disabled: true });
  });

  it("recognizes the password exception raised by pdf.js at preview time", () => {
    expect(isPdfPasswordError({ name: "PasswordException", message: "No password given" })).toBe(true);
    expect(isPdfPasswordError(new Error("Network request failed"))).toBe(false);
  });
});
