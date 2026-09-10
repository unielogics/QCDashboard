import { describe, expect, it } from "vitest";
import { parseMoney as sharedParseMoney } from "@/lib/pfsTotals";
import { formatCount, formatMoney, formatPlain, formatRatio, parseMoney, parseRate } from "../money";
import { AMOUNT_CASES } from "./fixtures.test";

describe("parseMoney", () => {
  it("reads money the way people type it", () => {
    expect(parseMoney("$1,250")).toEqual({ value: 1250, blank: false, warn: false });
    expect(parseMoney("1,250.00").value).toBe(1250);
    expect(parseMoney("  42  ").value).toBe(42);
    expect(parseMoney(" 250,000 ").value).toBe(250000);
  });

  it("reads accounting parentheses as the minus sign", () => {
    expect(parseMoney("(500)").value).toBe(-500);
    expect(parseMoney("($500)").value).toBe(-500);
    expect(parseMoney("(-500)").value).toBe(-500);
    expect(parseMoney("-$500").value).toBe(-500);
  });

  it("is blank for nothing typed, and never warns about it", () => {
    expect(parseMoney("")).toEqual({ value: 0, blank: true, warn: false });
    expect(parseMoney("   ")).toEqual({ value: 0, blank: true, warn: false });
    expect(parseMoney(null)).toEqual({ value: 0, blank: true, warn: false });
    expect(parseMoney(undefined).blank).toBe(true);
  });

  it("warns, rather than reading zero silently, when something typed is not a number", () => {
    expect(parseMoney("n/a")).toEqual({ value: 0, blank: false, warn: true });
    expect(parseMoney("abc").warn).toBe(true);
    expect(parseMoney("--5").warn).toBe(true);
    expect(parseMoney("0x10").warn).toBe(true);
    // A percent sign belongs on a rate, not a money line.
    expect(parseMoney("7.25%").warn).toBe(true);
  });

  it("agrees with the server's _amount on every value it counts", () => {
    for (const [text, expected] of Object.entries(AMOUNT_CASES)) {
      expect(parseMoney(text).value, text).toBe(expected);
      // …and with the forms' shared parser, which every stacked form imports.
      expect(sharedParseMoney(text), text).toBe(expected);
    }
  });
});

describe("parseRate", () => {
  it("drops the percent sign", () => {
    expect(parseRate("7.25%")).toEqual({ value: 7.25, blank: false, warn: false });
    expect(parseRate("7.25 %").value).toBe(7.25);
    expect(parseRate("7.25").value).toBe(7.25);
    expect(parseRate("").blank).toBe(true);
    expect(parseRate("high").warn).toBe(true);
  });
});

describe("formatMoney", () => {
  it("shows dollars and cents with negatives in parentheses", () => {
    expect(formatMoney(1250)).toBe("$1,250.00");
    expect(formatMoney(-500)).toBe("($500.00)");
    expect(formatMoney(0)).toBe("$0.00");
    expect(formatMoney(1234567.891)).toBe("$1,234,567.89");
  });

  it("formats a typed string through the same parser", () => {
    expect(formatMoney("$1,250")).toBe("$1,250.00");
    expect(formatMoney("(500)")).toBe("($500.00)");
    expect(formatMoney("1,250.00")).toBe("$1,250.00");
  });

  it("keeps blank blank and shows an unreadable string verbatim, never as $0.00", () => {
    expect(formatMoney("")).toBe("");
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney("n/a")).toBe("n/a");
    expect(formatMoney("about 500")).toBe("about 500");
  });

  it("does not print a negative zero", () => {
    expect(formatMoney(-0.001)).toBe("$0.00");
  });
});

describe("formatRatio, formatCount, formatPlain", () => {
  it("show a ratio to two places and a count whole, with a dash for none", () => {
    expect(formatRatio(0.5)).toBe("0.50");
    expect(formatRatio(1.234)).toBe("1.23");
    expect(formatRatio(null)).toBe("—");
    expect(formatCount(12)).toBe("12");
    expect(formatCount(1200)).toBe("1,200");
    expect(formatCount(null)).toBe("—");
  });

  it("write a plain number for the clipboard that our own parser reads back", () => {
    expect(formatPlain(1250)).toBe("1250");
    expect(formatPlain(-500.5)).toBe("-500.5");
    expect(formatPlain(-0.001)).toBe("0");
    expect(formatPlain(null)).toBe("");
    expect(parseMoney(formatPlain(1234567.89)).value).toBe(1234567.89);
  });
});
