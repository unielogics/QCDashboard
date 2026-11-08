export type CitationRectangle = { x: number; y: number; width: number; height: number };
type TextItem = { str?: string; width?: number; height?: number; transform?: number[] };
type PageViewport = { width: number; height: number; convertToViewportRectangle: (rect: number[]) => number[] };

const normalized = (value: string) => value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

/** Only a unique exact excerpt is highlighted. Repeated values are not guessed. */
export function citationRectangles(items: TextItem[], quote: string, viewport: PageViewport): { rectangles: CitationRectangle[]; status: "matched" | "missing" | "ambiguous" } {
  const target = normalized(quote);
  if (target.length < 3 || quote.length > 1600 || !Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) return { rectangles: [], status: "missing" };
  let text = "";
  const spans: Array<{ start: number; end: number; item: TextItem }> = [];
  for (const item of items.slice(0, 50000)) {
    const value = normalized(item.str || "");
    if (!value) continue;
    if (text) text += " ";
    const start = text.length;
    text += value;
    spans.push({ start, end: text.length, item });
  }
  const hits: number[] = [];
  for (let from = 0; from < text.length;) {
    const hit = text.indexOf(target, from);
    if (hit < 0) break;
    const before = text[hit - 1] || "", after = text[hit + target.length] || "";
    const extendsNumber = /\d/.test(target[0]) && /\d[.,]$/.test(text.slice(Math.max(0, hit - 2), hit)) || /\d/.test(target[target.length - 1]) && /^[.,]\d/.test(text.slice(hit + target.length, hit + target.length + 2));
    if (!extendsNumber && !(/[\p{L}\p{N}]/u.test(target[0]) && /[\p{L}\p{N}]/u.test(before)) && !(/[\p{L}\p{N}]/u.test(target[target.length - 1]) && /[\p{L}\p{N}]/u.test(after))) hits.push(hit);
    from = hit + 1;
  }
  if (!hits.length) return { rectangles: [], status: "missing" };
  if (hits.length !== 1) return { rectangles: [], status: "ambiguous" };
  const start = hits[0];
  const end = start + target.length;
  const selected = spans.filter((span) => span.start < end && span.end > start);
  const rectangles = selected.flatMap(({ item }) => {
    const transform = item.transform;
    if (!transform || transform.length !== 6 || !transform.every(Number.isFinite) || transform[0] <= 0 || transform[3] <= 0 || Math.abs(transform[1]) > 0.001 || Math.abs(transform[2]) > 0.001 || !Number.isFinite(item.width) || !Number.isFinite(item.height) || item.width! <= 0 || item.height! <= 0) return [];
    const [x1, y1, x2, y2] = viewport.convertToViewportRectangle([transform[4], transform[5], transform[4] + item.width!, transform[5] + item.height!]);
    const left = Math.max(0, Math.min(x1, x2) / viewport.width), top = Math.max(0, Math.min(y1, y2) / viewport.height);
    const right = Math.min(1, Math.max(x1, x2) / viewport.width), bottom = Math.min(1, Math.max(y1, y2) / viewport.height);
    return right > left && bottom > top ? [{ x: left, y: top, width: right - left, height: bottom - top }] : [];
  });
  return rectangles.length && rectangles.length === selected.length ? { rectangles, status: "matched" } : { rectangles: [], status: "missing" };
}
