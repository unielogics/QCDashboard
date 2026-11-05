import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { compactHelper, DebtReviewHeadline, sourceMeta } from "@/components/application/DebtScheduleReviewHeader";
import type { ReviewSource, ReviewSummary } from "@/lib/debtReview";

function source(over: Partial<ReviewSource> = {}): ReviewSource {
  return {
    file_id: "f1", file_name: "Earthly_Inc_Debt_Schedule_Nov_05_2026.pdf", uploaded_by: "Terrell Parker", uploaded_at: "2026-11-05T14:02:06+00:00",
    entity: "Earthly Inc.", schedule_date: "2026-11-05", status_note: "Preliminary; not lender-certified", scope_note: null, source_basis: null, line_count: 7, ...over,
  };
}

function summary(over: Partial<ReviewSummary> = {}): ReviewSummary {
  return { read: 7, keeping: 7, removing: 0, missing: 38, invalid: 0, unsavedPayments: 0, droppedPayments: 0, changed: false, ...over };
}

const render = (sources: ReviewSource[], over: Partial<ReviewSummary> = {}) => renderToStaticMarkup(createElement(DebtReviewHeadline, { sources, summary: summary(over) }));

describe("the headline a row's table wears", () => {
  it("is the file name, the file's own caveat and the three counts, in one line", () => {
    const html = render([source()]);
    expect(html).toContain("Earthly_Inc_Debt_Schedule_Nov_05_2026.pdf");
    expect(html).toContain("Preliminary; not lender-certified");
    expect(html).toContain("7 lines");
    expect(html).toContain("38 answers missing");
    expect(html).toContain("0 taken off");
    expect(html.match(/<header /g)).toHaveLength(1);
  });

  it("says who uploaded the file and when on hover, not in a card of its own", () => {
    const html = render([source()]);
    expect(html).toContain('title="uploaded by Terrell Parker · Nov 5, 2026 · schedule dated 2026-11-05 · 7 lines"');
    expect(html).not.toContain("uploaded by Terrell Parker</p>");
  });

  it("says at most one short sentence about what to do", () => {
    const html = render([source()]);
    expect(html.match(/<p /g)).toHaveLength(1);
    expect(html).toContain("Fill the amber cells, take off anything that is not a loan, then save.");
  });

  it("counts singular and plural properly", () => {
    const html = render([source()], { keeping: 1, missing: 1, removing: 1 });
    expect(html).toContain("1 line<");
    expect(html).toContain("1 answer missing");
  });

  it("names the number of files, with no caveat, when there are several", () => {
    const html = render([source(), source({ file_id: "f2", file_name: "Second.xlsx" })]);
    expect(html).toContain("2 files");
    expect(html).not.toContain("Preliminary; not lender-certified");
  });

  it("still reads for a schedule typed by hand, with no file", () => {
    const html = render([], { read: 0, keeping: 2, missing: 0 });
    expect(html).toContain("Debt schedule");
    expect(html).toContain("2 lines");
    expect(html).not.toContain("<p ");
  });
});

describe("the helper sentence", () => {
  it("asks for the amber cells while answers are missing", () => {
    expect(compactHelper({ missing: 3, read: 5 })).toMatch(/amber cells/);
    expect(compactHelper({ missing: 3, read: 0 })).toMatch(/amber cells/);
  });

  it("only asks to take off non-loans once every answer is in a fresh reading", () => {
    expect(compactHelper({ missing: 0, read: 5 })).toBe("Every answer is in. Take off anything that is not a loan, then save.");
  });

  it("says nothing when there is nothing to do", () => {
    expect(compactHelper({ missing: 0, read: 0 })).toBeNull();
  });
});

describe("the source line", () => {
  it("leaves out what it does not know", () => {
    expect(sourceMeta(source({ uploaded_by: null, uploaded_at: null, schedule_date: null, line_count: 1 }))).toBe("1 line");
  });
});
