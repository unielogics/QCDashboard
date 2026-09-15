import { clientApiErrorCode } from "@/lib/clientRoomDocuments";

export const PASSWORD_PROTECTED_PDF_UPLOAD_CODE = "password_protected_pdf";
export const PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE =
  "This PDF is password-protected. Remove the password and upload an unlocked copy.";

const PASSWORD_PROTECTED_PDF_CODES = new Set([
  PASSWORD_PROTECTED_PDF_UPLOAD_CODE,
  "password_protected",
  "password_required",
  "encrypted_pdf",
]);

const PASSWORD_PROTECTED_PDF_TEXT =
  /\b(?:password[- ]protected pdf|pdf (?:is |was )?(?:password[- ]protected|locked|encrypted)|remove the password|upload an unlocked copy)\b/i;

export class PasswordProtectedPdfUploadError extends Error {
  readonly code = PASSWORD_PROTECTED_PDF_UPLOAD_CODE;

  constructor(public readonly fileName?: string) {
    super(PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE);
    this.name = "PasswordProtectedPdfUploadError";
  }
}

export function isPdfUpload(file: Pick<File, "name" | "type">): boolean {
  return file.type.trim().toLocaleLowerCase() === "application/pdf"
    || file.name.trim().toLocaleLowerCase().endsWith(".pdf");
}

export function isPasswordProtectedPdfUploadError(error: unknown): boolean {
  const code = clientApiErrorCode(error)?.trim().toLocaleLowerCase();
  if (code && PASSWORD_PROTECTED_PDF_CODES.has(code)) return true;
  if (!error || typeof error !== "object") return false;
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  return PASSWORD_PROTECTED_PDF_TEXT.test(message);
}

export function documentUploadErrorMessage(error: unknown, fallback = "Upload failed."): string {
  if (isPasswordProtectedPdfUploadError(error)) return PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE;
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

type PdfPasswordProbe = (bytes: Uint8Array) => Promise<void>;

function isPdfJsPasswordException(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "PasswordException");
}

async function pdfJsPasswordProbe(bytes: Uint8Array): Promise<void> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: bytes,
    password: "",
    wasmUrl: "/pdfjs/wasm/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    cMapUrl: "/pdfjs/cmaps/",
    cMapPacked: true,
    iccUrl: "/pdfjs/iccs/",
  });
  try {
    await task.promise;
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/**
 * Reject a password-gated PDF before a presigned upload begins. Parsing errors
 * that are unrelated to a password deliberately fall through: the backend is
 * still the authoritative validator and returns the same coded rejection after
 * upload-complete. Empty-password and permissions-only PDFs load normally and
 * therefore remain uploadable.
 */
export async function assertPdfUploadUnlocked(
  file: Pick<File, "name" | "type" | "arrayBuffer">,
  probe: PdfPasswordProbe = pdfJsPasswordProbe,
): Promise<void> {
  if (!isPdfUpload(file)) return;
  try {
    await probe(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    if (isPdfJsPasswordException(error)) throw new PasswordProtectedPdfUploadError(file.name);
    // Let malformed or otherwise unreadable PDFs reach the authoritative
    // server-side validator rather than guessing that they are password locked.
  }
}

export async function screenPdfUploads<T extends Pick<File, "name" | "type" | "arrayBuffer">>(
  files: Iterable<T>,
  probe?: PdfPasswordProbe,
): Promise<{ uploadable: T[]; rejected: T[] }> {
  const uploadable: T[] = [];
  const rejected: T[] = [];
  for (const file of files) {
    try {
      await assertPdfUploadUnlocked(file, probe);
      uploadable.push(file);
    } catch (error) {
      if (!isPasswordProtectedPdfUploadError(error)) throw error;
      rejected.push(file);
    }
  }
  return { uploadable, rejected };
}

export function passwordProtectedPdfUploadNotice(files: Iterable<Pick<File, "name">>): string {
  const names = Array.from(files, (file) => file.name);
  if (!names.length) return PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE;
  const label = names.length === 1 ? names[0] : `${names.length} selected PDFs`;
  return `${label} ${names.length === 1 ? "was" : "were"} rejected. ${PASSWORD_PROTECTED_PDF_UPLOAD_MESSAGE}`;
}
