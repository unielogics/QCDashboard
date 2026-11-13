import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OperatingPlanItemization } from "../OperatingPlanItemization";
import type { OperatingPlanBody } from "@/lib/operatingPlan";
import type { OperatingGuidance } from "@/lib/operatingGuidance";

const guidance = {
  essentials: [
    { category: "rent", label: "Rent" }, { category: "utilities", label: "Utilities" },
    { category: "insurance", label: "Insurance" }, { category: "software", label: "Software" },
  ], expense_groups: [],
} as unknown as OperatingGuidance;

describe("current cost category presentation", () => {
  it("shows each populated category once and asks only unanswered missing categories", () => {
    const value: OperatingPlanBody = {
      expenses: [{ id: "rent", category: "rent", label: "Office rent", current_amount: 1000, cadence: "monthly" }],
      category_confirmations: { rent: "confirmed", insurance: "confirmed", software: "not_applicable" },
    };
    const before = structuredClone(value);
    let writes = 0;
    const html = renderToStaticMarkup(createElement(OperatingPlanItemization, { value, guidance, onChange: () => writes++ }));
    expect(html.match(/aria-label="Current cost category Rent"/g)).toHaveLength(1);
    expect(html.match(/aria-label="Confirm Rent"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Missing current cost answers"');
    expect(html).toContain('aria-label="Confirm Utilities"');
    expect(html).toContain("1 answer needed");
    expect(html).not.toContain('aria-label="Confirm Insurance"');
    expect(html).not.toContain('aria-label="Confirm Software"');
    expect(html).not.toContain("Other categories");
    expect(html).toContain('aria-label="Add current cost category"');
    expect(html).toContain('<option value="software">Software</option>');
    expect(html).toContain("No current cost (0)");
    expect(html).toContain("Included in another line");
    expect(html).toContain("I need help");
    expect(writes).toBe(0);
    expect(value).toEqual(before);
  });

  it("keeps source groups and manual records independent inside the same category", () => {
    const value: OperatingPlanBody = {
      expenses: [
        { id: "location-one", category: "rent", source_group_key: "rent:a", label: "Location one", current_amount: 12000, cadence: "annual" },
        { id: "location-two", category: "rent", source_group_key: "rent:b", label: "Location two", current_amount: 24000, cadence: "annual" },
        { id: "manual", category: "rent", label: "Storage", current_amount: 250, cadence: "monthly" },
      ], category_confirmations: { rent: "confirmed", utilities: "not_applicable", insurance: "confirmed", software: "not_applicable" },
    };
    const html = renderToStaticMarkup(createElement(OperatingPlanItemization, { value, guidance, onChange: () => { throw new Error("Unexpected render write"); } }));
    expect(html.match(/aria-label="Current cost category Rent"/g)).toHaveLength(1);
    for (const id of ["location-one", "location-two", "manual"]) expect(html.match(new RegExp(`aria-label="Current item ${id}"`, "g"))).toHaveLength(1);
    expect(html).toContain('data-operating-source-group="rent:a"');
    expect(html).toContain('data-operating-source-group="rent:b"');
    expect(html).not.toContain('aria-label="Missing current cost answers"');
  });

  it("keeps explicit help requests visible without repeating completed categories", () => {
    const html = renderToStaticMarkup(createElement(OperatingPlanItemization, { value: { category_confirmations: { rent: "confirmed", utilities: "needs_help", insurance: "confirmed", software: "not_applicable" } }, guidance, disabled: true, onChange: () => {} }));
    expect(html).toContain('aria-label="Confirm Utilities"');
    expect(html).toContain('value="needs_help" selected=""');
    expect(html).not.toContain('aria-label="Confirm Rent"');
    expect(html).not.toContain("+ Add item");
    expect(html).toContain('aria-label="Add current cost category" disabled=""');
  });
});
