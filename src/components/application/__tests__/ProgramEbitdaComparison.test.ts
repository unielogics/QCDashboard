import { describe, expect, it } from "vitest";
import { programEbitdaCheckOutcome } from "../ProgramEbitdaComparison";
describe("program EBITDA component outcomes", () => {
  it("labels a negated condition without presenting the underlying failure as program rejection", () => {
    expect(programEbitdaCheckOutcome("fail", true)).toEqual({ label: "Excluded condition does not match", tone: "ok" });
    expect(programEbitdaCheckOutcome("pass", true)).toEqual({ label: "Excluded condition matches", tone: "bad" });
    expect(programEbitdaCheckOutcome("unknown", true)).toEqual({ label: "Needs evidence", tone: "warn" });
  });
  it("reports the component only, leaving all/any/overall program eligibility to the server", () => {
    expect(programEbitdaCheckOutcome("fail").label).toBe("Does not meet this check");
    expect(programEbitdaCheckOutcome("pass").label).toBe("Meets this check");
    expect(programEbitdaCheckOutcome("unavailable").label).toBe("Needs evidence");
  });
});
