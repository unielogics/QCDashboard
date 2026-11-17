import { describe, expect, it } from "vitest";
import {
  DSCR_COMFORTABLE,
  DSCR_COVERS_PAYMENT,
  DSCR_GAUGE_BANDS,
  DSCR_GAUGE_HUB,
  DSCR_GAUGE_MAX,
  DSCR_GAUGE_TRACK,
  clampDscr,
  dscrGaugeArc,
  dscrGaugePoint,
  dscrTone,
} from "@/lib/dscrGauge";

// The dial is a half circle read left to right. The needle used to be computed
// from straight up, which put every ordinary DSCR in the green and anything
// above 1.5x under the dial.
describe("the DSCR dial", () => {
  it("runs from the left end at zero, over the top, to the right end at the maximum", () => {
    expect(dscrGaugePoint(0)).toEqual({ x: 30, y: 92 });
    expect(dscrGaugePoint(DSCR_GAUGE_MAX / 2)).toEqual({ x: 100, y: 22 });
    expect(dscrGaugePoint(DSCR_GAUGE_MAX)).toEqual({ x: 170, y: 92 });
  });

  it("never points below the hub, whatever the value", () => {
    for (const value of [-2, 0, 0.2, 0.6, 1, 1.12, 1.25, 1.32, 1.5, 2, 2.9, 3, 3.5, 40]) {
      const point = dscrGaugePoint(value);
      expect(point.y, `DSCR ${value}`).toBeLessThanOrEqual(DSCR_GAUGE_HUB.y);
      expect(point.x, `DSCR ${value}`).toBeGreaterThanOrEqual(30);
      expect(point.x, `DSCR ${value}`).toBeLessThanOrEqual(170);
    }
  });

  it("moves to the right as coverage rises", () => {
    const values = [0, 0.4, 0.99, 1, 1.12, 1.25, 1.32, 1.5, 2, 2.5, 3];
    const xs = values.map((value) => dscrGaugePoint(value).x);
    for (let index = 1; index < xs.length; index += 1) expect(xs[index], `DSCR ${values[index]}`).toBeGreaterThan(xs[index - 1]);
  });

  it("pins a value the dial cannot show to its nearest end, and a missing one to the left end", () => {
    expect(clampDscr(3.5)).toBe(DSCR_GAUGE_MAX);
    expect(clampDscr(-1)).toBe(0);
    expect(clampDscr(null)).toBe(0);
    expect(clampDscr(undefined)).toBe(0);
    expect(clampDscr(Number.NaN)).toBe(0);
    expect(dscrGaugePoint(3.5)).toEqual(dscrGaugePoint(DSCR_GAUGE_MAX));
    expect(dscrGaugePoint(null)).toEqual(dscrGaugePoint(0));
  });

  it("reads a DSCR the way the rest of the system does: short below 1.00x, thin to 1.25x, comfortable from there", () => {
    expect(dscrTone(0.6)).toBe("bad");
    expect(dscrTone(0.99)).toBe("bad");
    expect(dscrTone(DSCR_COVERS_PAYMENT)).toBe("warn");
    expect(dscrTone(1.12)).toBe("warn");
    expect(dscrTone(1.249)).toBe("warn");
    expect(dscrTone(DSCR_COMFORTABLE)).toBe("good");
    expect(dscrTone(1.32)).toBe("good");
    expect(dscrTone(2)).toBe("good");
  });

  it("draws three bands that meet exactly at 1.00x and 1.25x and together cover the whole arc", () => {
    const [short, comfortable, thin] = DSCR_GAUGE_BANDS;
    expect([short.tone, comfortable.tone, thin.tone]).toEqual(["bad", "good", "warn"]);
    const at = (value: number) => { const point = dscrGaugePoint(value); return `${point.x} ${point.y}`; };
    expect(short.path).toBe(`M${at(0)} A70 70 0 0 1 ${at(DSCR_COVERS_PAYMENT)}`);
    expect(thin.path).toBe(`M${at(DSCR_COVERS_PAYMENT)} A70 70 0 0 1 ${at(DSCR_COMFORTABLE)}`);
    expect(comfortable.path).toBe(`M${at(DSCR_COMFORTABLE)} A70 70 0 0 1 ${at(DSCR_GAUGE_MAX)}`);
    // The narrow middle band is drawn last with flat ends, over the round ends of its neighbours.
    expect(thin.cap).toBe("butt");
    expect(DSCR_GAUGE_TRACK).toBe(dscrGaugeArc(0, DSCR_GAUGE_MAX));
    expect(DSCR_GAUGE_TRACK).toBe("M30 92 A70 70 0 0 1 170 92");
  });

  it("puts the needle inside the band its value belongs to", () => {
    // On a left-to-right dial a point's x says which band it is over.
    const boundaryShort = dscrGaugePoint(DSCR_COVERS_PAYMENT).x, boundaryComfortable = dscrGaugePoint(DSCR_COMFORTABLE).x;
    expect(dscrGaugePoint(0.6).x).toBeLessThan(boundaryShort);
    expect(dscrGaugePoint(1.12).x).toBeGreaterThan(boundaryShort);
    expect(dscrGaugePoint(1.12).x).toBeLessThan(boundaryComfortable);
    expect(dscrGaugePoint(1.32).x).toBeGreaterThan(boundaryComfortable);
    expect(dscrGaugePoint(2).x).toBeGreaterThan(boundaryComfortable);
  });
});
