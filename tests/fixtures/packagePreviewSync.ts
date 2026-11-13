import type { Artifact } from "../../src/components/file/leadFile";
import type { PackageArtifactsSnapshot } from "../../src/lib/packageArtifacts";
import { pdfFontCompatibility } from "./pdfFontCompatibility";

// Existing valid three-page synthetic PDF, reused unchanged for preview transport.
// Package generations intentionally contain the same sample bytes; this fixture
// proves immutable artifact/version selection and rendering, not financial parity.
export const packagePreviewPdf = pdfFontCompatibility;
export const PACKAGE_INTAKE = "98000000-0000-4000-8000-000000000001";
export const PACKAGE_PROFILE = "98000000-0000-4000-8000-000000000002";
export const PACKAGE_TYPES = ["executive_summary", "lender_packet", "investor_presentation"] as const;
export function packageArtifactId(kind: typeof PACKAGE_TYPES[number], version: number) { return `synthetic-${kind}-v${version}`; }
export function packageArtifacts(version: number, origin: string, status: "current" | "superseded" = "current"): Artifact[] {
  return PACKAGE_TYPES.map(kind => ({ id: packageArtifactId(kind, version), intake_id: PACKAGE_INTAKE, artifact_type: kind,
    title: `Synthetic PDF compatibility sample ${kind} v${version}`, preview_url: `${origin}/expired-${kind}-v${version}.pdf`,
    download_url: `${origin}/expired-${kind}-v${version}.pdf`, version, status, generation_id: `synthetic-generation-${version}`,
    bucket_file_id: `synthetic-room-${kind}-${version}`, is_fresh: true, created_at: `2026-11-13T12:0${version}:00Z`, updated_at: `2026-11-13T12:0${version}:00Z`,
    body_json: kind === "investor_presentation" ? { investor_report_format: { max_pages: 5, page_count: 3 } } : {} }));
}
export function packageSnapshot(version: number, origin: string): PackageArtifactsSnapshot {
  return { intake_id: PACKAGE_INTAKE, artifacts: [...packageArtifacts(version, origin), ...(version > 6 ? packageArtifacts(6, origin, "superseded") : [])],
    latest_package: { generation_id: `synthetic-generation-${version}`, executive_summary_id: packageArtifactId("executive_summary", version), lender_packet_id: packageArtifactId("lender_packet", version), investor_presentation_id: packageArtifactId("investor_presentation", version), versions: { executive_summary: version, lender_packet: version, investor_presentation: version }, created_at: `2026-11-13T12:0${version}:00Z`, input_fingerprint: `synthetic-input-${version}`, source_freshness: "unchecked" }, refresh: null };
}
export function packageFileDetail(origin: string) {
  return { application_profile_id: PACKAGE_PROFILE, derived_pending: false,
    intake: { id: PACKAGE_INTAKE, business_name: "Example package file", full_name: "Example operator", variant: "mca_refinance", status: "collecting_docs", outcome_status: "submitted", email: "operator@example.test" },
    artifacts: packageArtifacts(6, origin), files: [], requested_documents: [], messages: [], notes: [], latest_review: null };
}
