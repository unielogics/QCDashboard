import { describe, expect, it } from "vitest";
import { balanceSheetIsEmpty, financialStatementRequest, profitAndLossIsEmpty, queueFileRequestPrefill } from "@/lib/financialStatementRequests";
import type { FinancialCockpit } from "@/lib/financialCockpit";
import type { FileRequestItem } from "@/lib/fileRequestsApi";

const blank: FileRequestItem = { document_type: "bank_statement", name: "Bank statements", quantity: 6, unit: "months", subject: "business", period: "current", instructions: "" };

describe("financial statement request entry points", () => {
  it("recognizes missing or metadata-only templates without losing explicit zero figures", () => {
    expect(profitAndLossIsEmpty(null)).toBe(true);
    expect(profitAndLossIsEmpty({ period_label: "2026", net_income: null } as FinancialCockpit["profit_and_loss"])).toBe(true);
    expect(profitAndLossIsEmpty({ net_income: 0 } as FinancialCockpit["profit_and_loss"])).toBe(false);
    expect(balanceSheetIsEmpty(null)).toBe(true);
    expect(balanceSheetIsEmpty({ as_of_date: "2026-10-31", cash: null } as FinancialCockpit["balance_sheet"])).toBe(true);
    expect(balanceSheetIsEmpty({ cash: 0 } as FinancialCockpit["balance_sheet"])).toBe(false);
  });

  it("prefills the requested form and business through the existing file-request contract", () => {
    expect(financialStatementRequest("profit_and_loss", " Little Star ")).toMatchObject({ document_type: "profit_and_loss", name: "Profit and loss statement", subject: "Little Star", quantity: 1, unit: "files", period: "current" });
    expect(financialStatementRequest("balance_sheet", "Little Star")).toMatchObject({ document_type: "balance_sheet", name: "Balance sheet", subject: "Little Star", quantity: 1 });
  });

  it("replaces the untouched bank default and combines unsent form requests without duplicates", () => {
    const pl = financialStatementRequest("profit_and_loss", "Little Star");
    const bs = financialStatementRequest("balance_sheet", "Little Star");
    const initial = queueFileRequestPrefill([blank], pl, blank);
    expect(initial).toEqual([pl]);
    const edited = [{ ...pl, quantity: 2, instructions: "Two reporting periods" }];
    const combined = queueFileRequestPrefill(edited, bs, blank);
    expect(combined).toEqual([...edited, bs]);
    expect(queueFileRequestPrefill(combined, pl, blank)).toBe(combined);
    expect(edited).toEqual([{ ...pl, quantity: 2, instructions: "Two reporting periods" }]);
  });
});
