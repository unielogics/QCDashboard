// Open a URL that came back from the backend (e.g. an S3 presigned download
// link) in a new tab, but only if it is a real https URL. Guards against a
// tainted/unexpected response carrying a javascript: or data: payload that
// would execute if handed straight to window.open. Presigned storage URLs are
// always absolute https, so a non-https value is treated as unsafe.
export function openSignedUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
    return true;
  } catch {
    return false;
  }
}
