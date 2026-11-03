import { describe, expect, it } from "vitest";
import { advanceAnswer, debtFieldText } from "../FormReview";

describe("the review page's debt words", () => {
  it("prints the type's label, a choice capitalised and a date as mm/dd/yyyy", () => {
    expect(debtFieldText("debt_type", "line_of_credit")).toBe("Line of credit");
    expect(debtFieldText("debt_type", "Bridge note")).toBe("Bridge note");
    expect(debtFieldText("payment_status", "delinquent")).toBe("Delinquent");
    expect(debtFieldText("secured", "secured")).toBe("Secured");
    expect(debtFieldText("originated_on", "2025-03-01")).toBe("03/01/2025");
    expect(debtFieldText("collateral", "Inventory")).toBe("Inventory");
  });

  it("states the advance answer with its note", () => {
    expect(advanceAnswer({ mca_modified: "yes", mca_modification_note: "pull cut" })).toBe("Yes — pull cut");
    expect(advanceAnswer({ mca_modified: "yes" })).toBe("Yes");
    expect(advanceAnswer({ mca_modified: "no" })).toBe("No");
    expect(advanceAnswer({})).toBe("Not answered");
  });
});
