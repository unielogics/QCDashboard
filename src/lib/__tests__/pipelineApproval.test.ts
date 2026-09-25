import { describe, expect, it } from "vitest";
import { pipelineApprovalDraft, validatePipelineApprovalDraft } from "../pipelineApproval";

describe("pipeline approval details", () => {
  it("prefills stored approval values without inventing missing values", () => {
    expect(pipelineApprovalDraft({ approvedAmount: 250000, approvedDscr: 1.25, note: "Committee approved" })).toEqual({
      approvedAmount: "250000",
      approvedDscr: "1.25",
      note: "Committee approved",
    });
    expect(pipelineApprovalDraft()).toEqual({ approvedAmount: "", approvedDscr: "", note: "" });
  });

  it("requires a positive approved amount", () => {
    expect(validatePipelineApprovalDraft(pipelineApprovalDraft()).error).toMatch(/approved amount/i);
    expect(validatePipelineApprovalDraft({ approvedAmount: "0", approvedDscr: "", note: "" }).error).toMatch(/approved amount/i);
    expect(validatePipelineApprovalDraft({ approvedAmount: "-1", approvedDscr: "", note: "" }).error).toMatch(/approved amount/i);
  });

  it("normalizes currency, optional DSCR, and notes for the atomic move payload", () => {
    expect(validatePipelineApprovalDraft({
      approvedAmount: "$325,000.50",
      approvedDscr: "1.31",
      note: "  Subject to final insurance.  ",
    })).toEqual({
      value: {
        approved_amount: 325000.5,
        approved_dscr: 1.31,
        note: "Subject to final insurance.",
      },
      error: null,
    });
    expect(validatePipelineApprovalDraft({ approvedAmount: "250000", approvedDscr: "", note: "" })).toEqual({
      value: { approved_amount: 250000, approved_dscr: null, note: null },
      error: null,
    });
  });

  it("rejects an invalid optional DSCR", () => {
    expect(validatePipelineApprovalDraft({ approvedAmount: "250000", approvedDscr: "nope", note: "" }).error).toMatch(/DSCR/i);
    expect(validatePipelineApprovalDraft({ approvedAmount: "250000", approvedDscr: "-0.1", note: "" }).error).toMatch(/DSCR/i);
  });
});
