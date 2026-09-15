import { describe, expect, it } from "vitest";
import {
  canonicalRequirementComplete,
  leadCockpitMissingDocumentUploadTarget,
  leadCockpitNonDocumentMissingRows,
  leadCockpitOutstandingDocuments,
  preferredIntakeReviewResult,
  type LeadCockpitReadiness,
} from "@/lib/leadCockpitDocuments";
import type { ApplicationRequirement } from "@/lib/applicationProfile";
import type { IntakeResponse, RequestedDoc, UploadedFile } from "@/lib/intake";

const doc = (id: string, name: string, status = "requested", extra: Partial<RequestedDoc> = {}): RequestedDoc => ({
  id,
  name,
  required: true,
  status,
  ...extra,
});

const requirement = (
  requestedDocumentId: string,
  label: string,
  extra: Partial<ApplicationRequirement> = {},
): ApplicationRequirement => ({
  requirement_key: requestedDocumentId.replaceAll("-", "_"),
  label,
  category: label,
  required_level: "required",
  status: "requested",
  requested_document_id: requestedDocumentId,
  evidence_file_id: null,
  evidence_file_name: null,
  evidence_files: [],
  evidence_count: 0,
  verified_evidence_count: 0,
  coverage: {},
  verified_coverage: {},
  coverage_complete: false,
  verified_coverage_complete: false,
  allow_multiple_files: false,
  verification_required: false,
  source_program_keys: [],
  source_policy_keys: [],
  program_overrides: {},
  client_visible: true,
  can_waive: true,
  state_reason: null,
  last_requested_at: null,
  received_at: null,
  verified_at: null,
  provenance: {},
  ...extra,
});

const readiness = (requirements: ApplicationRequirement[]): LeadCockpitReadiness => ({ requirements, can_advance: false });

describe("LeadCockpit outstanding documents", () => {
  it("prefers the newest review result over a stale intake snapshot", () => {
    const latest = { marker: "latest" };
    const response = {
      intake: { result_snapshot: { marker: "old" } },
      latest_review: { status: "completed", result: latest },
    } as unknown as IntakeResponse;
    expect(preferredIntakeReviewResult(response)).toBe(latest);
  });

  it("keeps the last completed snapshot while a newer review is queued or failed", () => {
    const previous = { marker: "previous" };
    for (const status of ["queued", "running", "failed"]) {
      const response = {
        intake: { result_snapshot: previous },
        latest_review: { status, result: { marker: "not-final" } },
      } as unknown as IntakeResponse;
      expect(preferredIntakeReviewResult(response)).toBe(previous);
    }
  });

  it("uses canonical accepted readiness, not an AI snapshot, to suppress a request", () => {
    const documents = [
      doc("bank", "Last 6 months business bank statements", "uploaded"),
      doc("pnl", "Year-to-date P&L", "uploaded"),
      doc("tax", "Last 2 years business tax returns", "uploaded"),
      doc("pfs", "Personal financial statement", "uploaded"),
    ];
    const canonical = readiness([
      requirement("bank", "Business bank statements", { status: "verified" }),
      requirement("pnl", "Profit & loss", { verified_coverage_complete: true }),
      requirement("tax", "Business tax returns", { status: "waived" }),
      // A stored file did not satisfy this requirement (for example, it was
      // rejected as wrong-entity), so it must remain clickable.
      requirement("pfs", "Personal financial statement", { status: "received_unverified", coverage_complete: true }),
    ]);
    const outstanding = leadCockpitOutstandingDocuments(documents, [], canonical);
    expect(outstanding.map((item) => item.id)).toEqual(["pfs"]);
    expect(outstanding[0]?.status).toBe("received_unverified");
    expect(leadCockpitMissingDocumentUploadTarget(outstanding[0]!)).toBe("pfs");
  });

  it("treats only verified coverage or canonical terminal states as complete", () => {
    expect(canonicalRequirementComplete(requirement("a", "A", { verified_coverage_complete: true }))).toBe(true);
    for (const status of ["verified", "waived", "not_applicable"] as const) {
      expect(canonicalRequirementComplete(requirement("a", "A", { status }))).toBe(true);
    }
    expect(canonicalRequirementComplete(requirement("a", "A", { status: "received_unverified", coverage_complete: true }))).toBe(false);
    expect(canonicalRequirementComplete(requirement("a", "A", { status: "failed" }))).toBe(false);
  });

  it("uses all canonical required client-visible requests and deduplicates equivalent debt schedules", () => {
    const documents = [
      doc("bank", "Last 6 months business bank statements"),
      doc("debt-1", "Business debt schedule"),
      doc("debt-2", "Debt schedule"),
      doc("pfs", "Personal financial statement"),
      doc("optional", "Optional ownership schedule"),
      doc("internal", "Internal credit worksheet"),
    ];
    const canonical = readiness([
      requirement("bank", "Business bank statements", { status: "verified" }),
      requirement("debt-1", "Business debt schedule"),
      requirement("debt-2", "Debt schedule"),
      requirement("pfs", "Personal financial statement"),
      requirement("optional", "Optional ownership schedule", { required_level: "optional" }),
      requirement("internal", "Internal credit worksheet", { client_visible: false }),
    ]);
    expect(leadCockpitOutstandingDocuments(documents, [], canonical).map((item) => item.id)).toEqual(["debt-1", "pfs"]);
  });

  it("creates a clickable document from an incomplete canonical requirement when the intake row is absent", () => {
    const canonical = readiness([
      requirement("canonical-id", "Personal financial statement", { allow_multiple_files: true, state_reason: "Needs an accepted copy." }),
    ]);
    expect(leadCockpitOutstandingDocuments([], [], canonical)).toEqual([
      expect.objectContaining({ id: "canonical-id", name: "Personal financial statement", required: true, allow_multiple_files: true }),
    ]);
  });

  it("keeps an unlocked-copy task first and suppresses its original request", () => {
    const documents = [
      doc("pfs", "Personal financial statement"),
      doc("unlock", "Unlocked copy of locked-pfs.pdf", "requested", { request_kind: "unlocked_copy", source_file_id: "locked-file" }),
      doc("debt", "Debt schedule"),
    ];
    const files = [{ id: "locked-file", requested_document_id: "pfs", file_name: "locked-pfs.pdf" }] as UploadedFile[];
    const canonical = readiness([requirement("pfs", "Personal financial statement"), requirement("debt", "Debt schedule")]);
    expect(leadCockpitOutstandingDocuments(documents, files, canonical).map((item) => item.id)).toEqual(["unlock", "debt"]);
  });

  it("keeps the legacy status fallback when canonical readiness is unavailable", () => {
    const documents = [
      doc("optional", "Optional schedule", "requested", { required: false }),
      doc("uploaded", "Already uploaded", "uploaded"),
      doc("open", "Open requirement"),
    ];
    expect(leadCockpitOutstandingDocuments(documents, [], null).map((item) => item.id)).toEqual(["open"]);
  });

  it("removes document-shaped AI gaps when canonical readiness is present but keeps true clarifications", () => {
    const rows = [
      { title: "Last 6 months business bank statements", detail: "Upload statements", priority: "high" },
      { title: "Debt schedule", detail: "Still required", priority: "high" },
      { title: "Ownership clarification", detail: "Confirm whether Robert owns 25% or 30%", priority: "open" },
    ];
    const canonical = readiness([
      requirement("bank", "Business bank statements", { status: "verified" }),
      requirement("debt", "Business debt schedule"),
    ]);
    expect(leadCockpitNonDocumentMissingRows(rows, canonical)).toEqual([rows[2]]);
    expect(leadCockpitNonDocumentMissingRows(rows, null)).toEqual(rows);
  });

  it("does not hide optional, internal, or untargeted canonical clarifications", () => {
    const rows = [
      { title: "Ownership schedule", detail: "Clarify the optional ownership schedule", priority: "open" },
      { title: "Internal credit worksheet", detail: "Internal review", priority: "open" },
      { title: "Guarantor explanation", detail: "Explain the guarantor structure", priority: "open" },
    ];
    const canonical = readiness([
      requirement("optional", "Ownership schedule", { required_level: "optional", requested_document_id: null }),
      requirement("internal", "Internal credit worksheet", { client_visible: false, requested_document_id: null }),
      requirement("guarantor", "Guarantor explanation", { requested_document_id: null }),
    ]);
    expect(leadCockpitNonDocumentMissingRows(rows, canonical)).toEqual(rows);
  });
});
