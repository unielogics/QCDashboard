import { describe, expect, it } from "vitest";
import { isBankStatementRequest, roomRowPrimaryAction } from "../roomBankRequest";

describe("the room's bank-statement row", () => {
  it("recognises the requirement by key, category or name", () => {
    expect(isBankStatementRequest({ requirement_key: "business_bank_statements_6_months" })).toBe(true);
    expect(isBankStatementRequest({ category: "Bank Statements", name: "Last 6 months" })).toBe(true);
    expect(isBankStatementRequest({ name: "Business bank statements (6 months)" })).toBe(true);
    expect(isBankStatementRequest({ name: "Credit card statements", category: "Debts" })).toBe(false);
    expect(isBankStatementRequest({ name: "Personal bank statements", category: "Personal Financials" })).toBe(false);
    expect(isBankStatementRequest({ name: "Tax returns", category: "Tax Returns" })).toBe(false);
  });

  it("leads with the bank connection only where the room can connect one", () => {
    const bank = { requirement_key: "business_bank_statements_6_months" };
    expect(roomRowPrimaryAction(bank, true)).toBe("connect_bank");
    expect(roomRowPrimaryAction(bank, false)).toBe("upload");
    expect(roomRowPrimaryAction({ name: "Tax returns" }, true)).toBe("upload");
  });
});
