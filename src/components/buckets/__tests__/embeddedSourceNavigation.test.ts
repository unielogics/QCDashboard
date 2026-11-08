import { describe, expect, it, vi } from "vitest";
import { scrollEmbeddedPdfSource } from "../embeddedSourceNavigation";

describe("embedded financial PDF source navigation", () => {
  const setup = () => ({ scrollTop: 40, scrollLeft: 12, clientHeight: 600, getBoundingClientRect: () => ({ top: 100 }), scrollTo: vi.fn() });
  const mark = { getBoundingClientRect: () => ({ top: 1600, height: 20 }) };
  it("moves only the PDF well to make the cited text visible below its toolbar", () => {
    const viewport = setup();
    expect(scrollEmbeddedPdfSource(2, 3, new Set([1, 2]), true, viewport, mark, true)).toBe(true);
    expect(viewport.scrollTo).toHaveBeenCalledOnce();
    expect(viewport.scrollTo.mock.calls[0][0]).toMatchObject({ left: 12, behavior: "instant" });
    expect(viewport.scrollTo.mock.calls[0][0].top).toBeCloseTo(1346.6666667);
  });
  it("does not consume a source jump while the embedding tab is hidden or canvases are incomplete", () => {
    const viewport = setup();
    expect(scrollEmbeddedPdfSource(2, 3, new Set([1, 2]), false, viewport, mark, true)).toBe(false);
    expect(scrollEmbeddedPdfSource(2, 3, new Set([2]), true, viewport, mark, true)).toBe(false);
    expect(scrollEmbeddedPdfSource(2, 3, new Set([1, 2]), true, { ...viewport, clientHeight: 0 }, mark, true)).toBe(false);
    expect(viewport.scrollTo).not.toHaveBeenCalled();
  });
});
