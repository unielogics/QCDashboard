import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatingPlanStatus } from "../OperatingPlanStatus";
import type { OperatingDraftFeedback } from "@/lib/operatingPlanFeedback";
const feedback = (patch: Record<string, unknown> = {}, actions: unknown[] = []) => ({ basis: "before_implementation_costs_and_timing", summary: { status: "calculated", complete: true, source_comparable: true, missing: [], ...patch }, actions }) as unknown as OperatingDraftFeedback;
const render = (props: Partial<Parameters<typeof OperatingPlanStatus>[0]> = {}) => renderToStaticMarkup(createElement(OperatingPlanStatus, { onReview: vi.fn(), ...props }));

describe("visible independent save and calculation feedback", () => {
  it("shows an in-flight draft and calculation without claiming either finished", () => {
    const html = render({ save: { state: "saving" }, calculation: { pending: true } });
    expect(html).toContain("Saving draft"); expect(html).toContain("Calculating"); expect(html).not.toContain("Draft saved"); expect(html).not.toContain("Preview updated");
  });
  it("exposes both retries while retaining useful failure details", () => {
    const html = render({ save: { state: "error", error: "Draft could not be saved", retry: vi.fn() }, calculation: { pending: false, error: "Calculation unavailable", retry: vi.fn() } });
    for (const text of ["Save failed", "Retry save", "Preview failed", "Retry calculation", "Draft could not be saved", "Calculation unavailable"]) expect(html).toContain(text);
  });
  it("offers a direct review action even when math is ready but qualification is incomplete", () => {
    const html = render({ feedback: feedback({}, [{ math_missing: [], qualification_missing: ["effective_date", "implementation_cost"], source_issues: [] }]), calculation: { pending: false, at: "10:01" } });
    expect(html).toContain("Inputs needed"); expect(html).toContain("Review</button>"); expect(html).not.toContain("Preview updated");
  });
  it.each([{ complete: false, status: "incomplete" }, { status: "source_blocked" }, { source_comparable: false }])("makes blocked inputs actionable: %j", patch => {
    expect(render({ feedback: feedback(patch), calculation: { pending: false } })).toContain("Inputs needed");
  });
  it("keeps draft saved status separate from publishing", () => {
    const html = render({ save: { state: "saved", at: "10:01" }, calculation: { pending: false, at: "10:02" }, feedback: feedback() });
    expect(html).toContain("Draft saved 10:01"); expect(html).toContain("Preview updated 10:02"); expect(html).toContain("Draft saves automatically; Save version publishes the plan.");
  });
  it("does not claim a preview is current before any result exists", () => {
    const html = render({ save: { state: "saved" } });
    expect(html).not.toContain("Preview updated"); expect(html).toContain("Preview not available yet");
  });
});
