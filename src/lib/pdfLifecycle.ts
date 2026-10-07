type PdfDestroyable = {
  destroy: () => unknown;
};

/**
 * pdf.js has exposed destruction on both loading tasks and document proxies
 * across releases. Runtime objects can still differ when a worker failed to
 * finish initializing or an older cached chunk is being torn down, so cleanup
 * must be capability based instead of assuming a particular object shape.
 */
export function isPdfDestroyable(resource: unknown): resource is PdfDestroyable {
  if (resource === null || (typeof resource !== "object" && typeof resource !== "function")) return false;
  try {
    return typeof (resource as Partial<PdfDestroyable>).destroy === "function";
  } catch {
    return false;
  }
}

/**
 * Destroy a pdf.js resource without allowing teardown failures to crash the
 * surrounding workspace. This also preserves the resource as `this`, which is
 * required by pdf.js' class methods.
 */
export async function destroyPdfResource(resource: unknown): Promise<boolean> {
  if (!isPdfDestroyable(resource)) return false;
  try {
    await resource.destroy.call(resource);
  } catch {
    // Cleanup is best-effort. A worker may already have been terminated by a
    // competing unmount or file switch, which is safe to treat as disposed.
  }
  return true;
}
