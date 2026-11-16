// The desk's home is the intake files. These pin the words in its headline
// and that its stage strip speaks the underwriting lifecycle's own labels.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/useApi", () => ({}));

import { deskHeadline, stageHint, stageLabel } from "../OperatorFilesDesk";

describe("the desk headline", () => {
  it("counts files, stalled files and new files in plain words", () => {
    expect(deskHeadline({ active: 14, attention: 3, newThisWeek: 2 })).toBe("14 files in flight · 3 need attention · 2 new this week");
    expect(deskHeadline({ active: 1, attention: 1, newThisWeek: 0 })).toBe("1 file in flight · 1 needs attention · 0 new this week");
  });
  it("leaves out what has not loaded instead of printing a zero nobody counted", () => {
    expect(deskHeadline({ active: 14 })).toBe("14 files in flight");
    expect(deskHeadline({})).toBe("");
  });
});

describe("the stage strip", () => {
  it("uses the underwriting lifecycle's own labels", () => {
    expect(stageLabel("collecting_docs")).toBe("Collecting docs");
    expect(stageLabel("in_underwriting")).toBe("In underwriting");
    expect(stageLabel("closed_won")).toBe("Closed / funded");
    expect(stageHint("approved")).toBe("Clear to close");
  });
  it("shows a stage it does not know as written rather than hiding it", () => {
    expect(stageLabel("on_hold")).toBe("on hold");
    expect(stageHint("on_hold")).toBe("");
  });
});
