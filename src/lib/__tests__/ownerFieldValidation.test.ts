import { describe, expect, it } from "vitest";
import { validateOwnerField } from "@/lib/ownerFieldValidation";

describe("owner field validation", () => {
  it("blocks blank required names before a PATCH", () => {
    expect(validateOwnerField("first_name", "  ").error).toBe("First name is required.");
    expect(validateOwnerField("last_name", "").error).toBe("Last name is required.");
  });

  it("accepts only ownership percentages from zero through one hundred", () => {
    expect(validateOwnerField("ownership_pct", "").error).toBeTruthy();
    expect(validateOwnerField("ownership_pct", "-0.01").error).toBeTruthy();
    expect(validateOwnerField("ownership_pct", "100.01").error).toBeTruthy();
    expect(validateOwnerField("ownership_pct", "not-a-number").error).toBeTruthy();
    expect(validateOwnerField("ownership_pct", "20")).toEqual({ value: 20, error: null });
  });

  it("allows a blank optional email but blocks malformed non-empty values", () => {
    expect(validateOwnerField("email", " ")).toEqual({ value: null, error: null });
    expect(validateOwnerField("email", "owner@example.com")).toEqual({ value: "owner@example.com", error: null });
    expect(validateOwnerField("email", "owner@example").error).toBeTruthy();
  });
});
