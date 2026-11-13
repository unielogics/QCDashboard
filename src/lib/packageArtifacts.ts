import type { Artifact } from "@/components/file/leadFile";
import type { MarketplaceRefreshJob } from "./marketplaceRefresh";

export type PackageArtifactLink = { artifact_id: string; url: string; expires_in_seconds: number; version: number; content_type: string; disposition: "inline" | "attachment" };
export const PACKAGE_ARTIFACT_TYPES = ["executive_summary", "investor_presentation", "lender_packet"] as const;
export type LatestSavedPackage = { generation_id: string; executive_summary_id: string; lender_packet_id: string; investor_presentation_id: string; versions: { executive_summary: number; lender_packet: number; investor_presentation: number }; created_at: string; input_fingerprint: string | null; source_freshness: "unchecked" };
export type PackageArtifactsSnapshot = { intake_id: string; artifacts: Artifact[]; latest_package: LatestSavedPackage | null; refresh: MarketplaceRefreshJob | null };

export function checkedPackageArtifacts(value: PackageArtifactsSnapshot, intakeId: string): PackageArtifactsSnapshot {
  if (value.intake_id !== intakeId || !Array.isArray(value.artifacts) || value.artifacts.some(row => row.intake_id !== intakeId)) throw new Error("The saved package response belongs to another file.");
  if (value.refresh && !["idle", "queued", "running", "succeeded", "failed", "blocked"].includes(value.refresh.status)) throw new Error("The package update status could not be read.");
  return value;
}

export function packageArtifactPath(intakeId: string, artifactId?: string, download = false): string {
  const base = `/admin/ai-underwriter-leads/${encodeURIComponent(intakeId)}/artifacts`;
  return artifactId ? `${base}/${encodeURIComponent(artifactId)}/url?download=${download}` : base;
}

/** A signed URL is usable only for the immutable artifact requested by this click. */
export function checkedPackageArtifactUrl(value: PackageArtifactLink, artifact: Pick<Artifact, "id" | "version">, origin: string): string {
  if (value.artifact_id !== artifact.id || artifact.version != null && value.version !== artifact.version) throw new Error("The PDF does not match the selected saved version. Check the saved package and try again.");
  if (value.content_type !== "application/pdf") throw new Error("This saved artifact is not a PDF.");
  const url = new URL(value.url, origin);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === origin)) throw new Error("The document service returned an invalid PDF link.");
  return url.href;
}

export function sortedPackageArtifacts(artifacts: Artifact[]): Artifact[] {
  return [...artifacts].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime() || right.id.localeCompare(left.id));
}

export function mergeSavedPackageArtifacts(fileArtifacts: Artifact[], packageArtifacts: Artifact[]): Artifact[] {
  return [...fileArtifacts.filter(row => !PACKAGE_ARTIFACT_TYPES.some(type => type === row.artifact_type)), ...packageArtifacts.filter(row => PACKAGE_ARTIFACT_TYPES.some(type => type === row.artifact_type))];
}

/** Retain a real full-read/generation validation; metadata never supplies new source proof. */
export function packageVerificationMatches(artifacts: Artifact[], proof: Artifact[], refresh?: MarketplaceRefreshJob | null): boolean {
  if (refresh && ["queued", "running", "failed", "blocked"].includes(refresh.status)) return false;
  return artifacts.length === 3 && new Set(artifacts.map(row => row.id)).size === 3 && new Set(artifacts.map(row => row.generation_id)).size === 1 && new Set(artifacts.map(row => row.input_fingerprint)).size === 1 && artifacts.every(row => row.status === "current" && row.is_fresh !== false && Boolean(row.generation_id && row.input_fingerprint) && !proof.some(verified => verified.id === row.id && verified.is_fresh === false) && proof.some(verified => verified.id === row.id && verified.generation_id === row.generation_id && verified.input_fingerprint === row.input_fingerprint && verified.is_fresh === true && verified.status === "current"));
}

/** Never stitch together independently current documents from different generations. */
export function selectPackageArtifacts(artifacts: Artifact[], latest?: LatestSavedPackage | null) {
  const sorted = sortedPackageArtifacts(artifacts);
  const generations = [...new Set(sorted.filter(row => row.status === "current" && row.generation_id).map(row => row.generation_id!))];
  const complete = generations.map(id => PACKAGE_ARTIFACT_TYPES.map(type => sorted.find(row => row.artifact_type === type && row.generation_id === id && row.status === "current"))).find(rows => rows.every(Boolean));
  const authoritative = latest === null ? [] : latest ? [latest.executive_summary_id, latest.investor_presentation_id, latest.lender_packet_id].map((id, index) => sorted.find(row => row.id === id && row.generation_id === latest.generation_id && row.artifact_type === PACKAGE_ARTIFACT_TYPES[index])) : undefined;
  const selected = (authoritative ?? complete)?.filter((row): row is Artifact => Boolean(row)) ?? [];
  const coherent = selected.length === PACKAGE_ARTIFACT_TYPES.length;
  return {
    summary: coherent ? selected.find(row => row.artifact_type === "executive_summary") : undefined,
    presentation: coherent ? selected.find(row => row.artifact_type === "investor_presentation") : undefined,
    packet: coherent ? selected.find(row => row.artifact_type === "lender_packet") : undefined,
    coherent,
    fresh: coherent && selected.every(row => row.status === "current" && row.is_fresh === true),
    hasArtifacts: sorted.some(row => PACKAGE_ARTIFACT_TYPES.some(type => type === row.artifact_type)),
  };
}
