import { describe, expect, it } from "vitest";
import { debtPayloadRow } from "../DraftFinancialFormModal";

describe("the modal's row on the wire", () => {
  it("sends the figures as numbers, the rest as text or null, and the advance answer as a boolean", () => {
    expect(
      debtPayloadRow({
        lender: " Fundbox ",
        debt_type: "mca",
        original_amount: "$20,000",
        balance: "12,000",
        rate: "32.5%",
        monthly_payment: "900",
        originated_on: "2025-03-01",
        maturity_on: "",
        secured: "unsecured",
        payment_status: "current",
        collateral: "",
        notes: " payoff requested ",
        mca_modified: "yes",
        mca_modification_note: "daily pull cut to $300",
      }),
    ).toEqual({
      lender: "Fundbox",
      balance: 12000,
      monthly_payment: 900,
      debt_type: "mca",
      original_amount: 20000,
      rate: 32.5,
      originated_on: "2025-03-01",
      maturity_on: null,
      secured: "unsecured",
      payment_status: "current",
      collateral: null,
      notes: "payoff requested",
      mca_modified: true,
      mca_modification_note: "daily pull cut to $300",
    });
  });

  it("drops the modification note when the answer is no, and sends null for an unanswered question", () => {
    expect(debtPayloadRow({ lender: "A", balance: "1", monthly_payment: "1", mca_modified: "no", mca_modification_note: "stale" })).toMatchObject({
      mca_modified: false,
      mca_modification_note: null,
    });
    expect(debtPayloadRow({ lender: "A", balance: "1", monthly_payment: "1" })).toMatchObject({ mca_modified: null, rate: null, original_amount: null });
  });
});
