import { describe, expect, it } from "vitest";
import { compactMoney, dscrLabel, dscrTone, linePath, money, monthShort, niceTicks, ratioPct, signedPct, sourceLabel, trendDirection } from "@/lib/financialCockpit";

describe("financial cockpit helpers", () => {
  it("formats money for tiles, ticks and tables", () => {
    expect(money(57536.5)).toBe("$57,537");
    expect(money(-29364)).toBe("-$29,364");
    expect(money(null)).toBe("—");
    expect(compactMoney(690395)).toBe("$690k");
    expect(compactMoney(57536)).toBe("$57.5k");
    expect(compactMoney(1_250_000)).toBe("$1.3M");
    expect(compactMoney(980)).toBe("$980");
    expect(ratioPct(0.3333)).toBe("33%");
    expect(signedPct(4.2)).toBe("+4.2%");
    expect(signedPct(-3)).toBe("-3.0%");
  });

  it("builds clean ticks that always include zero", () => {
    expect(niceTicks(0, 55000)).toEqual([0, 20000, 40000, 60000]);
    expect(niceTicks(12000, 18000)).toEqual([0, 5000, 10000, 15000, 20000]);
    expect(niceTicks(-9000, 12000)).toEqual([-10000, 0, 10000, 20000]);
    expect(niceTicks(0, 0)).toEqual([0]);
  });

  it("breaks a line at a missing month instead of drawing a slope through it", () => {
    expect(linePath([{ x: 0, y: 10 }, { x: 10, y: 20 }, null, { x: 30, y: 5 }])).toBe("M0.0,10.0 L10.0,20.0 M30.0,5.0");
    expect(linePath([null, null])).toBe("");
  });

  it("labels months, DSCR statuses and sources in plain words", () => {
    expect(monthShort("2026-05")).toBe("May '26");
    expect(monthShort("odd")).toBe("odd");
    expect(dscrTone("very_strong")).toBe("ok");
    expect(dscrTone("acceptable")).toBe("warn");
    expect(dscrTone("concerning")).toBe("bad");
    expect(dscrLabel("unavailable")).toBe("Not available");
    expect(sourceLabel("advance_terms")).toBe("Advance terms read off documents");
    expect(sourceLabel("something_else")).toBe("something else");
    expect(trendDirection(4.2)).toBe("up");
    expect(trendDirection(0)).toBeUndefined();
  });
});
