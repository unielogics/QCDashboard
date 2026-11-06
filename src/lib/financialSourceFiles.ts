export const DEBT_SOURCE_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.heic,.heif";
const IMAGE_EXTENSION = /\.(?:png|jpe?g|webp|gif|heic|heif)$/i;
export function financialSourceIsImage(file?: { file_name?: string | null; content_type?: string | null } | null): boolean {
  if (!file) return false;
  return /^image\/(?:png|jpeg|webp|gif|heic|heif)(?:;|$)/i.test(file.content_type ?? "") || IMAGE_EXTENSION.test(file.file_name ?? "");
}
export function financialUploadContentType(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").at(-1) ?? "";
  return ({ pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif" } as Record<string, string>)[extension] ?? "application/octet-stream";
}
export function financialVersionSourceKind(snapshot: { versions: Array<{ id: string; source_file_id?: string | null; pdf_file_id?: string | null; source_content_type?: string | null }>; evidence: Array<{ file_id: string; file_name?: string | null; content_type?: string | null }> }, versionId?: string | null): "pdf" | "image" | "workbook" | "source" {
  const version = snapshot.versions.find((item) => item.id === versionId);
  if (!version || version.pdf_file_id || !version.source_file_id) return "pdf";
  const source = snapshot.evidence.find((file) => file.file_id === version.source_file_id);
  if (financialSourceIsImage({ ...source, content_type: version.source_content_type ?? source?.content_type })) return "image";
  if (/\.xlsx?$/i.test(source?.file_name ?? "") || /spreadsheet|excel/i.test(version.source_content_type ?? source?.content_type ?? "")) return "workbook";
  return "source";
}
