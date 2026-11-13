/** Decimal input grammar used by the API: finite decimal/exponent, never JavaScript hex. */
export function decimalInput(value: unknown, percent = false): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  let text = value.trim();
  if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`;
  text = text.replace(/[,$\s]/g, "");
  if (percent) text = text.replace(/%/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
  const result = Number(text);
  return Number.isFinite(result) ? result : null;
}
