export function validPdfSourcePage(page: unknown, pageCount?: number): number | null {
  return typeof page === "number" && Number.isInteger(page) && page > 0 && page <= 10000
    && (pageCount === undefined || page <= pageCount) ? page : null;
}

/** Earlier canvases must have their final height before scrolling to an exact page. */
export function pdfSourcePageReady(page: unknown, pageCount: number, renderedPages: ReadonlySet<number>): boolean {
  const target = validPdfSourcePage(page, pageCount);
  if (target === null) return false;
  for (let preceding = 1; preceding <= target; preceding += 1) {
    if (!renderedPages.has(preceding)) return false;
  }
  return true;
}

export function scrollToPdfSourcePage(page: unknown, pageCount: number, renderedPages: ReadonlySet<number>, stage?: Pick<HTMLElement, "scrollIntoView"> | null): boolean {
  if (!stage || !pdfSourcePageReady(page, pageCount, renderedPages)) return false;
  stage.scrollIntoView({ behavior: "smooth", block: "center" });
  return true;
}
