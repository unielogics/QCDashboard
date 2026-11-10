import { describe, expect, it, vi } from "vitest";
import { writePreparationPreview } from "../preparationPreview";

describe("preparation preview", () => {
  it("renders server text as text, including a failed preparation", () => {
    const write = vi.fn();
    const target = { closed: false, document: { open: vi.fn(), write, close: vi.fn() } } as unknown as Window;
    writePreparationPreview(target, { title: '<script>alert("bad")</script>', description: 'Could not build <img src=x onerror=alert(1)> & retry', state: "error" });
    const html = write.mock.calls[0][0];
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img src=x");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain('data-state="error"');
    expect(html).not.toContain('aria-valuenow="100"');
    expect(html).toContain("Return to the file to review the error and retry.");
  });

  it("allows generation to finish when the preview is closed or navigated elsewhere", () => {
    const closed = { closed: true } as Window;
    const navigated = { closed: false, get document() { throw new DOMException("Blocked cross-origin frame", "SecurityError"); } } as unknown as Window;
    expect(() => writePreparationPreview(closed, { title: "Package ready", description: "Saved" })).not.toThrow();
    expect(() => writePreparationPreview(navigated, { title: "Package ready", description: "Saved" })).not.toThrow();
  });
});
