// Multi-file selection in the file room: download the checked files as one
// zip, or move them to Removed files together. The words and the filename
// parsing live here so they can be tested without the workspace.

export type BucketFilesRemoveResult = {
  removed: string[];
  blocked: { file_id: string; file_name: string; reason: string }[];
  missing: string[];
};

const trimEdges = (value: string) => value.replace(/^[ ._]+|[ ._]+$/g, "");

// Twin of `bucket_file_archive.archive_file_name`: the fallback when the
// response carries no usable Content-Disposition.
export function archiveFileName(roomName: string | null | undefined): string {
  const cleaned = trimEdges(
    trimEdges((roomName || "").replace(/[^A-Za-z0-9._ -]+/g, "").replace(/\s+/g, " ")).slice(0, 80),
  );
  return `${cleaned || "room"} files.zip`;
}

export function attachmentFileName(disposition: string | null | undefined): string | null {
  if (!disposition) return null;
  const extended = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
  if (extended) {
    try {
      return decodeURIComponent(extended[1].trim()) || null;
    } catch {
      // fall through to the plain filename
    }
  }
  const quoted = /filename="((?:\\.|[^"\\])*)"/i.exec(disposition);
  if (quoted) return quoted[1].replace(/\\(.)/g, "$1").trim() || null;
  const bare = /filename=([^;]+)/i.exec(disposition);
  return bare?.[1]?.trim() || null;
}

export function fileNamesPreview(names: string[], limit = 3): string {
  const shown = names.slice(0, limit).join(", ");
  const rest = names.length - limit;
  return rest > 0 ? `${shown} +${rest} more` : shown;
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function removalSummary(result: BucketFilesRemoveResult, protectedNames: string[]): string {
  const parts: string[] = [];
  if (result.removed.length) {
    parts.push(`${count(result.removed.length, "file")} moved to Removed files. The stored documents were kept and can be restored.`);
  }
  const stayed = [...protectedNames, ...result.blocked.map((item) => item.file_name)];
  if (stayed.length) {
    parts.push(`${count(stayed.length, "file")} stayed, protected by retention or legal hold: ${fileNamesPreview(stayed)}.`);
  }
  if (result.missing.length) {
    parts.push(`${count(result.missing.length, "file")} had already been removed.`);
  }
  return parts.join(" ") || "Nothing was removed.";
}

export function saveBlobAs(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
