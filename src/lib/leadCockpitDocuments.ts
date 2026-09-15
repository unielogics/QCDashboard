import { clientRequestedDocumentNeedsAction } from "@/lib/clientRoomDocuments";
import type { ApplicationProgramReadiness, ApplicationRequirement } from "@/lib/applicationProfile";
import type { RequestedDoc, UploadedFile } from "@/lib/intake";

export type LeadCockpitReadiness = Pick<ApplicationProgramReadiness, "requirements" | "can_advance">;
export type LeadCockpitMissingRow = { title: string; detail: string; priority: string };

function normalizedLabel(value: unknown): string {
  return String(value ?? "")
    .toLocaleLowerCase()
    .replace(/p\s*&\s*l/g, "profit and loss")
    .replace(/profit\s*&\s*loss/g, "profit and loss")
    .replace(/[_/–—-]+/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(?:last|current|required|document|documents|copy|copies|month|months|year|years|ytd|year to date|most recent)\b/g, " ")
    .replace(/\b(statements|returns|schedules)\b/g, (word) => word.slice(0, -1))
    .replace(/\s+/g, " ")
    .trim();
}

export function evidenceRequirementIdentity(value: unknown): string {
  const normalized = normalizedLabel(value);
  if (!normalized) return "";
  if (/\bdebt\b.*\bschedule\b/.test(normalized)) return "debt schedule";
  if (/\bpersonal\b.*\bfinancial\b.*\bstatement\b/.test(normalized)) return "personal financial statement";
  if (/\bbank\b.*\bstatement\b/.test(normalized)) {
    if (normalized.includes("personal")) return "personal bank statement";
    if (normalized.includes("business")) return "business bank statement";
    return "bank statement";
  }
  if (normalized.includes("profit and loss")) return "profit and loss";
  if (/\btax\b.*\breturn\b/.test(normalized)) {
    if (normalized.includes("personal")) return "personal tax return";
    if (normalized.includes("business")) return "business tax return";
    return "tax return";
  }
  return normalized;
}

function identitiesMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function documentIdentities(document: Pick<RequestedDoc, "name" | "category">): string[] {
  return [document.name, document.category]
    .map(evidenceRequirementIdentity)
    .filter(Boolean);
}

function requirementIdentities(requirement: Pick<ApplicationRequirement, "label" | "category" | "requirement_key">): string[] {
  return [requirement.label, requirement.category, requirement.requirement_key]
    .map(evidenceRequirementIdentity)
    .filter(Boolean);
}

export function canonicalRequirementComplete(
  requirement: Pick<ApplicationRequirement, "status" | "verified_coverage_complete">,
): boolean {
  return requirement.verified_coverage_complete
    || ["verified", "waived", "not_applicable"].includes(requirement.status);
}

/** A completed latest review must win over the older intake snapshot. */
export function preferredIntakeReviewResult(
  response: {
    latest_review?: { status?: string | null; result?: Record<string, unknown> | null } | null;
    intake: { result_snapshot?: Record<string, unknown> | null };
  },
): Record<string, unknown> | null {
  if (response.latest_review?.status === "completed" && response.latest_review.result) {
    return response.latest_review.result;
  }
  return response.intake.result_snapshot ?? null;
}

/**
 * Build the clickable "Still needed" list. Canonical readiness owns every
 * requested-document id it names: a verified/waived/N/A requirement is hidden,
 * while an incomplete requirement remains actionable even if the older intake
 * row merely says "uploaded". This prevents rejected or wrong-entity evidence
 * from satisfying a request just because a file reached storage.
 *
 * Unlocked-copy tasks remain first and replace the original locked-file task.
 * Readiness snapshots are not available in every portal, so unclaimed requests
 * retain the existing intake-status fallback.
 */
export function leadCockpitOutstandingDocuments(
  documents: RequestedDoc[],
  files: UploadedFile[],
  readiness: LeadCockpitReadiness | null,
): RequestedDoc[] {
  const byId = new Map(documents.map((document) => [document.id, document]));
  const unlocked = documents.filter(
    (document) => document.required
      && document.request_kind?.trim().toLocaleLowerCase() === "unlocked_copy"
      && clientRequestedDocumentNeedsAction(document, files),
  );
  const replacedDocumentIds = new Set<string>();
  for (const request of unlocked) {
    const source = request.source_file_id ? files.find((file) => file.id === request.source_file_id) : undefined;
    if (source?.requested_document_id) replacedDocumentIds.add(source.requested_document_id);
  }

  const canonicalByDocumentId = new Map<string, ApplicationRequirement[]>();
  for (const requirement of readiness?.requirements ?? []) {
    if (!requirement.requested_document_id) continue;
    canonicalByDocumentId.set(requirement.requested_document_id, [
      ...(canonicalByDocumentId.get(requirement.requested_document_id) ?? []),
      requirement,
    ]);
  }

  const candidates: RequestedDoc[] = [];
  if (readiness) {
    for (const [requestedDocumentId, requirements] of canonicalByDocumentId) {
      const requiredVisible = requirements.filter(
        (requirement) => requirement.required_level === "required" && requirement.client_visible,
      );
      if (!requiredVisible.length || requiredVisible.every(canonicalRequirementComplete)) continue;
      const document = byId.get(requestedDocumentId);
      if (document?.request_kind?.trim().toLocaleLowerCase() === "unlocked_copy") continue;
      const source = requiredVisible.find((requirement) => !canonicalRequirementComplete(requirement))!;
      candidates.push({
        ...(document ?? {
          id: requestedDocumentId,
          name: source.label,
          category: source.category,
          required: true,
        }),
        // Canonical state explains why a stored upload is still insufficient
        // (processing, wrong entity, rejected, and so on).
        description: source.state_reason || document?.description || null,
        allow_multiple_files: source.allow_multiple_files,
        status: source.status,
      });
    }
  }

  for (const document of documents) {
    if (!document.required || document.request_kind?.trim().toLocaleLowerCase() === "unlocked_copy") continue;
    // A canonical entry is authoritative even when the legacy intake row says
    // "uploaded" or still says "requested". Do not add it through fallback.
    if (readiness && canonicalByDocumentId.has(document.id)) continue;
    if (clientRequestedDocumentNeedsAction(document, files)) candidates.push(document);
  }

  const output = [...unlocked];
  const seen = new Set<string>();
  for (const document of candidates) {
    if (replacedDocumentIds.has(document.id)) continue;
    const key = documentIdentities(document)[0] || document.id;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(document);
  }
  return output;
}

/** Every row returned above is already canonical-actionable. Do not re-check
 * its legacy `uploaded` flag before offering the replacement uploader. */
export function leadCockpitMissingDocumentUploadTarget(
  document: Pick<RequestedDoc, "id" | "requires_signature">,
): string | null {
  return document.requires_signature ? null : document.id;
}

/**
 * AI review snapshots can retain old document gaps after canonical evidence
 * decisions have moved on. When readiness is present, document-shaped AI rows
 * are handled by the clickable list above; only non-document clarifications
 * remain in the secondary intelligence table.
 */
export function leadCockpitNonDocumentMissingRows<T extends LeadCockpitMissingRow>(
  rows: T[],
  readiness: LeadCockpitReadiness | null,
): T[] {
  if (!readiness) return rows;
  // Suppress an AI row only when canonical readiness either says it is done,
  // or owns a real client-visible upload target that is rendered in the
  // clickable document list. Optional/internal/no-target requirements must
  // remain visible as clarifications instead of disappearing from both lists.
  const identities = readiness.requirements
    .filter((requirement) => canonicalRequirementComplete(requirement) || (
      requirement.required_level === "required"
      && requirement.client_visible
      && Boolean(requirement.requested_document_id)
    ))
    .flatMap(requirementIdentities)
    .filter((identity) => identity.split(" ").length >= 2);
  return rows.filter((row) => {
    const rowIdentities = [row.title, row.detail].map(evidenceRequirementIdentity).filter(Boolean);
    return !rowIdentities.some((rowIdentity) => identities.some((identity) => identitiesMatch(rowIdentity, identity)));
  });
}
