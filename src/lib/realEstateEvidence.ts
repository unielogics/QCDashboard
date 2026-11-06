import type { AuthedApi } from "./worksheetApi";
import type { FinancialImport, FinancialWorkspaceSnapshot } from "./financialWorkspaceApi";
import { realEstateOptionLabel, realEstatePropertyLabel, type RealEstateBody, type RealEstateRow, type RealEstateSchema } from "./realEstateSchedule";

export type RealEstateEvidenceLink = {
  import_id?: string | null; file_id?: string; file_name?: string; property_row_id: string; mortgage_row_id: string;
  statement_date?: string | null; status: "staged" | "accepted" | "unreviewed" | "invalid"; reason?: string | null; withdrawn?: boolean;
};
export type RealEstateEvidence = { links: RealEstateEvidenceLink[] };
export type MortgageSourceCandidate = {
  source_mortgage_id: string;
  property: Record<string, unknown>;
  mortgage: Record<string, unknown>;
};
export type MortgageEvidenceImport = FinancialImport & {
  evidence: {
    candidates: MortgageSourceCandidate[];
    associations: Array<{ source_mortgage_id: string; property_row_id: string; mortgage_row_id: string; reasons: string[]; match: "exact" | "possible" }>;
    target_property_id?: string | null; target_mortgage_id?: string | null; needs_association: boolean;
    source_mortgage_id?: string | null; create_property?: boolean; create_mortgage?: boolean; contradictions?: string[];
    association_override_required?: boolean; override_reasons?: string[];
  };
};
const root = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/financial-workspace/real-estate-evidence`;
export function readRealEstateEvidence(api: AuthedApi, profileId: string, familyId: string) {
  return api<RealEstateEvidence>(`${root(profileId)}?${new URLSearchParams({ family_id: familyId })}`);
}
export type MortgageEvidenceTarget = { property_row_id?: string; mortgage_row_id?: string; source_mortgage_id?: string; create_property?: boolean; create_mortgage?: boolean };
export function stageMortgageEvidence(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, fileId: string, target: MortgageEvidenceTarget = {}) {
  return api<MortgageEvidenceImport>(`${root(profileId)}/imports`, { method: "POST", body: JSON.stringify({ family_id: snapshot.family_id, file_id: fileId, expected_revision: snapshot.draft.revision, ...target }) });
}
export function applyMortgageEvidence(api: AuthedApi, profileId: string, importId: string, revision: number, keys: string[], overrideReason = "") {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/imports/${encodeURIComponent(importId)}/apply`, { method: "POST", body: JSON.stringify({ expected_revision: revision, keys, confirm_association: true, confirm_latest_statement: true, ...(overrideReason.trim() ? { association_override_reason: overrideReason.trim() } : {}) }) });
}
export function rejectMortgageEvidence(api: AuthedApi, profileId: string, importId: string) {
  return api<{ status: string }>(`${root(profileId)}/imports/${encodeURIComponent(importId)}/reject`, { method: "POST" });
}
export function unlinkMortgageEvidence(api: AuthedApi, profileId: string, snapshot: FinancialWorkspaceSnapshot, mortgageId: string, link: Pick<RealEstateEvidenceLink, "import_id" | "file_id">) {
  return api<FinancialWorkspaceSnapshot>(`${root(profileId)}/unlink`, { method: "POST", body: JSON.stringify({ family_id: snapshot.family_id, expected_revision: snapshot.draft.revision, mortgage_row_id: mortgageId, ...(link.import_id ? { import_id: link.import_id } : { file_id: link.file_id }) }) });
}
export function mortgageStatementStatus(links: RealEstateEvidenceLink[] | null | undefined, mortgageId: string, mortgage?: RealEstateRow, property?: RealEstateRow) {
  if (mortgage?.status === "paid_off") return { label: "Not required · paid off", tone: "mut" as const };
  if (links == null) return { label: "Checking statement evidence", tone: "mut" as const };
  const linked = links.filter((link) => link.mortgage_row_id === mortgageId);
  if (linked.some((link) => link.status === "accepted" && !link.withdrawn)) return { label: "Reviewed statement on file", tone: "ok" as const };
  if (linked.some((link) => link.status === "staged" && !link.withdrawn)) return { label: "Statement reviewed · save version", tone: "acc" as const };
  if (linked.some((link) => link.status === "unreviewed" && !link.withdrawn)) return { label: "Statement needs review", tone: "warn" as const };
  if (linked.some((link) => link.status === "invalid")) return { label: "Statement needs attention", tone: "warn" as const };
  if (mortgage && mortgage.status !== "active" && !(Number(String(mortgage.balance ?? "").replace(/[,$\s]/g, "")) > 0) && property?.mortgage_status !== "active") return { label: "Confirm mortgage status", tone: "mut" as const };
  return { label: "Latest statement needed", tone: "warn" as const };
}
export function mortgageMappingLabel(key: string, labels: Record<string, string>) {
  const field = key.split(".").at(-1) || key;
  return labels[field] || field.replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());
}
/** An uploaded workbook is retained as an original, not mislabeled as a generated PDF. */
export function financialVersionIsWorkbook(snapshot: Pick<FinancialWorkspaceSnapshot, "versions" | "evidence">, versionId: string | null | undefined) {
  const version = snapshot.versions.find((item) => item.id === versionId);
  return Boolean(version && !version.pdf_file_id && version.source_file_id && /\.xlsx$/i.test(snapshot.evidence.find((file) => file.file_id === version.source_file_id)?.file_name ?? ""));
}
export function realEstateImportFieldLabel(key: string, bodies: RealEstateBody[], schema: RealEstateSchema): string {
  const [block, id, field] = key.split(".");
  if (block !== "properties" && block !== "mortgages") return schema.header.find((item) => item.key === block)?.label || mortgageMappingLabel(key, {});
  const rows = bodies.flatMap((body) => body[block] ?? []);
  const index = rows.findIndex((row) => row.id === id);
  const row = rows[index];
  const owner = row ? block === "properties" ? realEstatePropertyLabel(row, index) : String(row.lender || "Mortgage") : block === "properties" ? "Property" : "Mortgage";
  return `${owner} · ${schema[block].find((item) => item.key === field)?.label || mortgageMappingLabel(key, {})}`;
}
export function realEstateImportFieldValue(key: string, value: unknown, bodies: RealEstateBody[], schema: RealEstateSchema): string {
  if (value == null || value === "") return "Blank";
  const [block, , field] = key.split(".");
  if (field === "property_row_id") {
    const rows = bodies.flatMap((body) => body.properties ?? []); const index = rows.findIndex((row) => row.id === value);
    return index >= 0 ? realEstatePropertyLabel(rows[index], index) : "Property association needs review";
  }
  if (block === "properties" || block === "mortgages") {
    const spec = schema[block].find((item) => item.key === field);
    if (spec?.options?.length) return realEstateOptionLabel(spec, String(value));
  }
  return String(value);
}
