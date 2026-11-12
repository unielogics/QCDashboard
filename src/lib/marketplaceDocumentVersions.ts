import type { CpDocument } from "@/hooks/useCapitalPartners";
import type { MarketplacePpm, PpmVersion } from "@/lib/marketplacePpm";

export type OfferingPpmVersions = Pick<MarketplacePpm, "current_draft" | "current_approved" | "history"> & {
  active_version?: PpmVersion | null;
  working_draft_document_id?: string | null;
};
export type OfferingDocumentRole = "published" | "working" | "reviewed" | "attachment" | "history";
export type OfferingDocumentVersion = { document: CpDocument; ppmVersion: PpmVersion | null; role: OfferingDocumentRole };

/** PPM publication follows the server pointer, never the largest version or READY status. */
export function offeringDocumentVersions(documents: CpDocument[], ppm?: OfferingPpmVersions | null) {
  const saved = new Map<string, PpmVersion>();
  for (const version of [...(ppm?.history ?? []), ppm?.active_version, ppm?.current_approved, ppm?.current_draft]) {
    if (version) saved.set(version.document_id, version);
  }
  const records = new Map(documents.map(document => [document.id, document]));
  // A successful PPM response can arrive before the listing-document read catches up.
  for (const version of saved.values()) if (!records.has(version.document_id)) records.set(version.document_id, {
    id: version.document_id, kind: "ppm", kind_label: "Private placement memorandum",
    name: version.document.title || `PPM v${version.version}`, content_type: "application/pdf", size_bytes: null,
    version: version.version, status: version.status, source: version.source,
  });
  const activeId = ppm?.active_version?.document_id ?? null;
  const workingId = ppm && Object.hasOwn(ppm, "working_draft_document_id") ? ppm.working_draft_document_id ?? null : ppm?.current_draft?.document_id ?? null;
  const reviewedId = ppm?.current_approved?.document_id ?? null;
  const rows: OfferingDocumentVersion[] = [...records.values()].map(document => ({
    document, ppmVersion: saved.get(document.id) ?? null,
    role: document.kind !== "ppm" ? document.status === "ready" ? "attachment" : "history"
      : document.id === activeId ? "published"
        : document.id === workingId ? "working"
          : document.id === reviewedId ? "reviewed" : "history",
  }));
  const one = (role: OfferingDocumentRole) => rows.find(row => row.role === role) ?? null;
  const order = (a: OfferingDocumentVersion, b: OfferingDocumentVersion) => b.document.version - a.document.version || a.document.name.localeCompare(b.document.name);
  const active = one("published"), working = one("working"), reviewed = one("reviewed");
  return {
    publicationKnown: Boolean(ppm && Object.hasOwn(ppm, "active_version")), active, working, reviewed,
    current: [active, working, reviewed, ...rows.filter(row => row.role === "attachment").sort(order)].filter((row): row is OfferingDocumentVersion => Boolean(row)),
    history: rows.filter(row => row.role === "history").sort(order),
  };
}

export function offeringDocumentUrl(listingId: string, document: Pick<CpDocument, "id" | "kind">, download: boolean) {
  const base = `/capital/admin/listings/${encodeURIComponent(listingId)}`;
  return `${base}/${document.kind === "ppm" ? "ppm/versions" : "documents"}/${encodeURIComponent(document.id)}/url?download=${download}`;
}

export function offeringDocumentStatus(row: OfferingDocumentVersion): string {
  if (row.role === "published") return row.ppmVersion?.stale ? "Published version · update needed" : "Published PPM";
  if (row.role === "working") return "Working draft · not approved";
  if (row.role === "reviewed") return row.ppmVersion?.stale ? "Reviewed · facts changed" : "Reviewed · not published";
  if (row.role === "attachment") return "Ready attachment";
  if (row.ppmVersion?.reviewed_at) return "Reviewed history";
  if (row.document.kind === "ppm") return row.ppmVersion?.source === "generated_ppm" || row.document.source === "generated_ppm" ? "Previous draft" : "Historical PPM";
  return row.document.status === "pending" ? "Upload pending" : "Historical attachment";
}
