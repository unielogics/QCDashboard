import { describe, expect, it, vi } from "vitest";
import { destroyPdfResource, isPdfDestroyable } from "@/lib/pdfLifecycle";

describe("pdf resource lifecycle", () => {
  it("ignores partially initialized resources without a destroy method", async () => {
    expect(isPdfDestroyable({ promise: Promise.resolve() })).toBe(false);
    await expect(destroyPdfResource({ promise: Promise.resolve() })).resolves.toBe(false);
  });

  it("calls destroy with the pdf.js resource as its receiver", async () => {
    const resource = {
      destroyed: false,
      destroy(this: { destroyed: boolean }) {
        this.destroyed = true;
      },
    };

    await expect(destroyPdfResource(resource)).resolves.toBe(true);
    expect(resource.destroyed).toBe(true);
  });

  it("contains synchronous and asynchronous teardown failures", async () => {
    const syncFailure = { destroy: vi.fn(() => { throw new Error("already destroyed"); }) };
    const asyncFailure = { destroy: vi.fn(() => Promise.reject(new Error("worker closed"))) };

    await expect(destroyPdfResource(syncFailure)).resolves.toBe(true);
    await expect(destroyPdfResource(asyncFailure)).resolves.toBe(true);
    expect(syncFailure.destroy).toHaveBeenCalledOnce();
    expect(asyncFailure.destroy).toHaveBeenCalledOnce();
  });
});
