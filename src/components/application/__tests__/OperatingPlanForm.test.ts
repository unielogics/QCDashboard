import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperatingPlanForm } from "../OperatingPlanForm";
import { applyFinancialCells, financialLayout, financialValues, saveFinancialDraft, type FinancialWorkspaceSnapshot } from "@/lib/financialWorkspaceApi";
import { normalizeOperatingPlanBody, type OperatingPlanBody } from "@/lib/operatingPlan";
import type { Edit, SheetLayout } from "@/components/sheet/types";

const fields = ["label", "current_amount", "cadence", "essential", "excluded"];
const sheet: SheetLayout = {
  kind: "operating_plan", title: "Operating plan", schema_version: "v1", layout_version: "v1", name_prefix: "op", freeze: [1, 1], columns: fields.map((_, index) => ({ c: index + 1 })),
  rows: Array.from({ length: 19 }, (_, index) => ({ r: index + 1, kind: "data", block: "expenses", row_key: `expense-${index}`, cells: fields.map((field, column) => ({ c: column + 1, type: field === "current_amount" ? "money" : "text", editable: true, key: `expenses.expense-${index}.${field}`, path: ["expenses", `expense-${index}`, field] })) })),
};
const pasted: Edit[] = sheet.rows.flatMap((row, index) => fields.map((field) => ({ sheet: "operating_plan", key: `expenses.expense-${index}.${field}`, value: field === "label" ? `Cost ${index + 1}` : field === "current_amount" ? index < 17 ? String(index * 100) : "" : field === "cadence" ? "monthly" : field === "essential" ? "true" : "false" })));

describe("operating plan worksheet and form recovery", () => {
  it("keeps all 19 pasted rows, two unknown amounts and real booleans through form switching and draft save", async () => {
    const body = applyFinancialCells({ schema_version: "operating-plan-v1", adjustments: [] }, sheet, pasted) as OperatingPlanBody;
    expect(body.expenses).toHaveLength(19);
    expect(body.expenses!.slice(0, 17).map((row) => row.current_amount)).toEqual(Array.from({ length: 17 }, (_, index) => index * 100));
    expect(body.expenses!.slice(17).map((row) => row.current_amount)).toEqual([null, null]);
    expect(body.expenses!.every((row) => row.essential === true && row.excluded === false)).toBe(true);
    const html = renderToStaticMarkup(createElement(OperatingPlanForm, { value: body, onChange: () => undefined }));
    expect(html.match(/aria-label="Expense name"/g)).toHaveLength(19);
    expect(html).toContain("Cost 19");
    expect(html).toContain("2 unknown amount(s)");
    const backToGrid = financialValues(body, financialLayout(body, sheet));
    expect(backToGrid["expenses.expense-0.current_amount"]).toBe("0");
    expect(backToGrid["expenses.expense-17.current_amount"]).toBe("");
    const api = vi.fn().mockResolvedValue({ body });
    await saveFinancialDraft(api, "profile", { kind: "operating_plan", family_id: "family", draft: { revision: 3 } } as FinancialWorkspaceSnapshot, body);
    const payload = JSON.parse(api.mock.calls[0][1].body);
    expect(payload.body.expenses).toHaveLength(19);
    expect(payload.body.expenses[0].current_amount).toBe(0);
    expect(payload.body.expenses[17].current_amount).toBeNull();
    expect(payload.body.expenses[18].excluded).toBe(false);
  });

  it("renders a pre-existing unsaved raw paste without hiding string-false rows or replacing the body", () => {
    const raw = { expenses: Array.from({ length: 19 }, (_, index) => ({ id: `old-${index}`, label: `Raw cost ${index + 1}`, current_amount: index < 17 ? String(index * 10) : "", essential: "true", excluded: "false", notes: "Preserve this note", source_file_ids: ["source"] })), adjustments: [{ id: "action", current_amount: "", proposed_amount: "0", implementation_cost: "50.25", excluded: "false" }] } as unknown as OperatingPlanBody;
    const normalized = normalizeOperatingPlanBody(raw);
    expect(normalized.expenses).toHaveLength(19);
    expect(normalized.expenses![18]).toMatchObject({ current_amount: null, excluded: false, essential: true, notes: "Preserve this note", source_file_ids: ["source"] });
    expect(normalized.adjustments![0]).toMatchObject({ current_amount: null, proposed_amount: 0, implementation_cost: 50.25, excluded: false });
    expect((raw.expenses![18] as unknown as { excluded: string }).excluded).toBe("false");
    const html = renderToStaticMarkup(createElement(OperatingPlanForm, { value: raw, onChange: () => undefined }));
    expect(html.match(/aria-label="Expense name"/g)).toHaveLength(19);
    expect(html).not.toContain("No operating expenses entered");
  });
});
