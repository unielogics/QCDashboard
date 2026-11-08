import { pdfSourcePageReady } from "@/lib/pdfSourceNavigation";

type SourceViewport = { scrollTop: number; scrollLeft: number; clientHeight: number; getBoundingClientRect: () => { top: number }; scrollTo: (options: ScrollToOptions) => void };
type SourceTarget = { getBoundingClientRect: () => { top: number; height: number } };

/** Scroll only the document well; scrollIntoView also moves the enclosing modal. */
export function scrollEmbeddedPdfSource(page: number, pageCount: number, rendered: ReadonlySet<number>, visible: boolean, viewport: SourceViewport | null, target: SourceTarget | null, isCitation: boolean): boolean {
  if (!visible || !viewport || !target || viewport.clientHeight < 100 || !pdfSourcePageReady(page, pageCount, rendered)) return false;
  const box = target.getBoundingClientRect();
  if (!Number.isFinite(box.top) || !Number.isFinite(box.height) || box.height <= 0) return false;
  const offset = isCitation ? Math.max(70, (viewport.clientHeight - box.height) / 3) : 70;
  viewport.scrollTo({ top: Math.max(0, viewport.scrollTop + box.top - viewport.getBoundingClientRect().top - offset), left: viewport.scrollLeft, behavior: "instant" });
  return true;
}
