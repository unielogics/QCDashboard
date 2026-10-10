import { describe, expect, it } from "vitest";
import { calculateDealEarnings, parseDealEconomicsDraft } from "@/lib/dealEconomics";

describe("deal economics", () => {
  it("uses only the client-accepted amount as the percentage basis", () => {
    expect(calculateDealEarnings(250_000, 2, null)).toBe(5_000);
    expect(calculateDealEarnings(null, 2, null)).toBeNull();
  });

  it("supports a consulting-only earnings structure", () => {
    expect(calculateDealEarnings(null, null, 7_500)).toBe(7_500);
  });

  it("combines origination and consulting earnings", () => {
    expect(calculateDealEarnings(400_000, 1.5, 4_000)).toBe(10_000);
  });

  it("returns null when no earnings inputs are configured", () => {
    expect(calculateDealEarnings(400_000, null, null)).toBeNull();
  });

  it("parses optional values and rejects invalid ranges", () => {
    const valid = parseDealEconomicsDraft({
      acceptedAmount: "350000",
      originationFeePoints: "2.25",
      consultingFee: "1500",
    });
    expect(valid).toMatchObject({
      acceptedAmount: 350_000,
      originationFeePoints: 2.25,
      consultingFee: 1_500,
      valid: true,
      earnings: 9_375,
    });

    expect(parseDealEconomicsDraft({ acceptedAmount: "-1", originationFeePoints: "2", consultingFee: "0" }).valid).toBe(false);
    expect(parseDealEconomicsDraft({ acceptedAmount: "1", originationFeePoints: "101", consultingFee: "0" }).valid).toBe(false);
    expect(parseDealEconomicsDraft(
      { acceptedAmount: "1", originationFeePoints: "3.01", consultingFee: "0" },
      { maxOriginationFeePoints: 3 },
    ).valid).toBe(false);
    expect(parseDealEconomicsDraft(
      { acceptedAmount: "1", originationFeePoints: "3", consultingFee: "0" },
      { maxOriginationFeePoints: 3 },
    ).valid).toBe(true);
    expect(parseDealEconomicsDraft({ acceptedAmount: "1", originationFeePoints: "2", consultingFee: "-50" }).valid).toBe(false);
  });
});
