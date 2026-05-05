// Synthetic 30-day sparkline generator for the dashboard rates widget.
// Mirrors qcmobile/app/(tabs)/index.tsx synthSpark — replace once the backend
// exposes /rates/{sku}/history.

export function synthSpark(seed: number, points = 30): number[] {
  return Array.from({ length: points }, (_, i) =>
    Math.sin(i / 5 + seed) * 0.05 + 0.07 + seed / 1000,
  );
}
