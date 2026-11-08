import { describe, expect, it } from "vitest";
import { citationRectangles } from "../financialCitationHighlight";

const item = (str: string, x = 10, y = 20) => ({ str, width: 80, height: 10, transform: [10, 0, 0, 10, x, y] });
const viewport = { width: 200, height: 100, convertToViewportRectangle: (rect: number[]) => rect };

describe("financial PDF citation positioning", () => {
  it("matches one normalized excerpt across text items and marks its containing regions", () => {
    const result = citationRectangles([item("NET   PROFIT"), item("$12,300", 100)], "Net profit $12,300", viewport);
    expect(result.status).toBe("matched");
    expect(result.rectangles).toHaveLength(2);
    expect(result.rectangles[0].x).toBeCloseTo(.05); expect(result.rectangles[1].x).toBeCloseTo(.5);
    for (const rect of result.rectangles) { expect(rect.y).toBeCloseTo(.2); expect(rect.width).toBeCloseTo(.4); expect(rect.height).toBeCloseTo(.1); }
  });
  it("does not guess which repeated excerpt is the source", () => {
    expect(citationRectangles([item("Net profit $500"), item("Net profit $500")], "Net profit $500", viewport)).toEqual({ status: "ambiguous", rectangles: [] });
  });
  it("rejects partial words and values inside larger numeric amounts", () => {
    for (const [text, quote] of [["Net profit $10,000", "Net profit $10"], ["Net profit 10.10", "Net profit 10"], ["10,000 cash", "000 cash"], ["Net profit 1500", "Net profit 150"], ["current balance", "rent balance"]]) {
      expect(citationRectangles([item(text)], quote, viewport).status).toBe("missing");
    }
  });
  it("fails closed for mirrored, vertical, skewed or missing geometry", () => {
    for (const transform of [[-10, 0, 0, 10, 10, 20], [10, 0, 0, -10, 10, 20], [0, 10, -10, 0, 10, 20], [10, 1, 0, 10, 10, 20], [10, 0, 0, 0, 10, 20]]) {
      expect(citationRectangles([{ ...item("Net profit"), transform }], "Net profit", viewport)).toEqual({ status: "missing", rectangles: [] });
    }
  });
  it("uses the page viewport for rotation and clips within its bounds", () => {
    const result = citationRectangles([item("Net profit", -10, 20)], "Net profit", { ...viewport, convertToViewportRectangle: ([x1, y1, x2, y2]) => [y1, 100 - x1, y2, 100 - x2] });
    expect(result.status).toBe("matched");
    for (const [key, expected] of Object.entries({ x: .1, y: .3, width: .05, height: .7 })) expect(result.rectangles[0][key as keyof typeof result.rectangles[0]]).toBeCloseTo(expected);
  });
  it("does not truncate an oversized citation into a different matching excerpt", () => {
    expect(citationRectangles([item("a".repeat(1600))], "a".repeat(1601), viewport).status).toBe("missing");
  });
});
