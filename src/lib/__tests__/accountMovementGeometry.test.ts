import { describe, expect, it } from "vitest";
import { MOVEMENT_ACCOUNT_SIZE, movementLayout, movementLinkPath, type MovementLinkGeometry, type MovementPosition } from "@/lib/accountMovements";

const pointOn = (curve: MovementLinkGeometry, t: number) => ({
  x: (1 - t) ** 2 * curve.start.x + 2 * (1 - t) * t * curve.control.x + t ** 2 * curve.end.x,
  y: (1 - t) ** 2 * curve.start.y + 2 * (1 - t) * t * curve.control.y + t ** 2 * curve.end.y,
});
const insideCard = (point: { x: number; y: number }, node: MovementPosition) =>
  Math.abs(point.x - node.x) < 124 - .0001 && Math.abs(point.y - node.y) < 94 - .0001;
const labelsOverlap = (a: MovementLinkGeometry, b: MovementLinkGeometry) => Math.abs(a.x - b.x) < 224 && Math.abs(a.y - b.y) < 68;

describe("account movement diagram geometry", () => {
  it("gives two large account cards a wide central arrow and label area", () => {
    expect(MOVEMENT_ACCOUNT_SIZE).toEqual({ width: 248, height: 188 });
    expect(movementLayout(["b", "a"])).toEqual({ width: 1040, height: 380,
      positions: [{ key: "a", x: 160, y: 190 }, { key: "b", x: 880, y: 190 }] });
    expect(movementLayout([]).positions).toEqual([]);
    expect(movementLayout(["a"]).positions).toEqual([{ key: "a", x: 520, y: 190 }]);
  });

  it("keeps account identity and placement deterministic without mutating the input", () => {
    const input = ["c", "a", "b", "a"];
    expect(movementLayout(input)).toEqual(movementLayout(["b", "c", "a"]));
    expect(input).toEqual(["c", "a", "b", "a"]);
    expect(movementLayout(input).positions.map((node) => node.key)).toEqual(["a", "b", "c"]);
  });

  it.each([3, 4, 5, 6, 9, 16, 50])("retains all %i account cards inside a bounded-width canvas without overlapping", (count) => {
    const layout = movementLayout(Array.from({ length: count }, (_, index) => `account-${index}`));
    expect(layout.width).toBe(1040);
    expect(layout.positions).toHaveLength(count);
    for (const node of layout.positions) {
      expect(node.x - 124).toBeGreaterThanOrEqual(0);
      expect(node.x + 124).toBeLessThanOrEqual(layout.width);
      expect(node.y - 94).toBeGreaterThanOrEqual(0);
      expect(node.y + 94).toBeLessThanOrEqual(layout.height);
    }
    for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) {
      const a = layout.positions[i], b = layout.positions[j];
      expect(Math.abs(a.x - b.x) >= 248 || Math.abs(a.y - b.y) >= 188).toBe(true);
    }
    const rowYs = [...new Set(layout.positions.map((node) => node.y))].sort((a, b) => a - b);
    for (let i = 1; i < rowYs.length; i++) expect(rowYs[i] - rowYs[i - 1]).toBeGreaterThanOrEqual(220);
  });

  it("starts at the source card and stops eight pixels outside the destination card", () => {
    const [from, to] = movementLayout(["a", "b"]).positions;
    const forward = movementLinkPath(from, to, 76);
    expect(forward.start.x).toBeCloseTo(from.x + 124, 6);
    expect(forward.end.x).toBeCloseTo(to.x - 124 - 8, 6);
    expect(forward.end.x).toBeGreaterThan(forward.start.x);
    expect(forward.start.y).toBeGreaterThan(from.y);
    expect(forward.path).toMatch(/^M [-.\d]+ [-.\d]+ Q /);
    const reverse = movementLinkPath(to, from, 76);
    expect(reverse.start.x).toBeCloseTo(to.x - 124, 6);
    expect(reverse.end.x).toBeCloseTo(from.x + 124 + 8, 6);
    expect(reverse.end.x).toBeLessThan(reverse.start.x);
    expect(reverse.start.y).toBeLessThan(to.y);
  });

  it("places bidirectional labels and review lanes far enough apart for 224 by 68 labels", () => {
    const [from, to] = movementLayout(["a", "b"]).positions;
    const forward = movementLinkPath(from, to, 76), reverse = movementLinkPath(to, from, 76);
    const review = movementLinkPath(from, to, 150);
    expect(labelsOverlap(forward, reverse)).toBe(false);
    expect(labelsOverlap(forward, review)).toBe(false);
    expect(Math.abs(forward.y - review.y)).toBeGreaterThanOrEqual(74);
    expect(forward.path).not.toEqual(reverse.path);
    expect(forward.path).not.toEqual(review.path);
    expect(forward.y - 34).toBeGreaterThan(0);
    expect(review.y + 34).toBeLessThan(380);
    expect(labelsOverlap(movementLinkPath(from, to), movementLinkPath(to, from))).toBe(false);
  });

  it("supports an explicit extra outward lane while preserving the three-argument API", () => {
    const [from, to] = movementLayout(["a", "b"]).positions;
    const ordinary = movementLinkPath(from, to, 76);
    const extra = movementLinkPath(from, to, 76, { lane: 1 });
    expect(labelsOverlap(ordinary, extra)).toBe(false);
    expect(extra.control.y).toBeGreaterThan(ordinary.control.y);
    expect(Math.max(Math.abs(extra.end.x - to.x) - 124, Math.abs(extra.end.y - to.y) - 94)).toBeCloseTo(8, 6);
  });

  it.each([76, 150, -76])("clips a diagonal curve itself, including strongly bent %i-pixel lanes", (bend) => {
    const [from, to] = movementLayout(["a", "b", "c"]).positions;
    const curve = movementLinkPath(from, to, bend);
    for (let sample = 0; sample <= 100; sample++) {
      const p = pointOn(curve, sample / 100);
      expect(insideCard(p, from)).toBe(false);
      expect(insideCard(p, to)).toBe(false);
    }
    expect(Math.max(Math.abs(curve.end.x - to.x) - 124, Math.abs(curve.end.y - to.y) - 94)).toBeCloseTo(8, 6);
  });

  it("handles vertical direction and coincident endpoints without invalid SVG coordinates", () => {
    const from = { key: "a", x: 520, y: 150 }, to = { key: "b", x: 520, y: 470 };
    const down = movementLinkPath(from, to, 76), up = movementLinkPath(to, from, 76);
    expect(down.start.y).toBeCloseTo(244, 6);
    expect(down.end.y).toBeCloseTo(368, 6);
    expect(up.start.y).toBeCloseTo(376, 6);
    expect(up.end.y).toBeCloseTo(252, 6);
    expect(labelsOverlap(down, up)).toBe(false);
    const empty = movementLinkPath(from, { ...from, key: "alias" });
    expect(empty.path).toBe("");
    expect(empty.x).toBe(520);
    expect(JSON.stringify(empty)).not.toMatch(/NaN|Infinity/);
  });
});
