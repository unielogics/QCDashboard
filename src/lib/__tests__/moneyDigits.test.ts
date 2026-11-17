import { describe, expect, it } from "vitest";

import { moneyDigits } from "@/lib/moneyDigits";

const usd = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", ...moneyDigits(value) }).format(value);

describe("money with or without cents", () => {
  it("prints both cent digits whenever there are cents", () => {
    expect(usd(184321.5)).toBe("$184,321.50");
    expect(usd(0.5)).toBe("$0.50");
    expect(usd(-1250.05)).toBe("-$1,250.05");
  });

  it("prints whole dollars without cents", () => {
    expect(usd(300000)).toBe("$300,000");
    expect(usd(0)).toBe("$0");
  });
});
