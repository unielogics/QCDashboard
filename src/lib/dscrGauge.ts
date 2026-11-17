// The DSCR dial drawn in the client rooms' cockpit and the desk's Lead Cockpit.
//
// It is a half circle read left to right: 0.00x at the left end, 3.00x at the
// right end, the value's needle pivoting on the hub below the arc. Three
// copies of the drawing each computed the needle from straight up instead of
// from the left end, so it swept the right-hand quarter and then went below
// the dial: any coverage above about 0.2x pointed into the green, 1.5x pointed
// at the right end, 2.0x pointed under it. The geometry lives here once.
//
// The bands are the ones the rest of the system already reads a DSCR by
// (LoanSimulator, the loan Overview tab, LeadDscrPanel): below 1.0 the cash
// flow does not cover the payment, 1.0 to 1.25 it covers it thinly, above 1.25
// it is comfortably covered.

export const DSCR_GAUGE_MAX = 3;
export const DSCR_COVERS_PAYMENT = 1.0;
export const DSCR_COMFORTABLE = 1.25;

export type DscrTone = "bad" | "warn" | "good";

const CENTER_X = 100;
const CENTER_Y = 92;
const RADIUS = 70;

/** The dial's viewBox: every point this module returns is inside it. */
export const DSCR_GAUGE_VIEWBOX = "0 0 200 120";
export const DSCR_GAUGE_HUB = { x: CENTER_X, y: CENTER_Y } as const;

/** A value pinned to what the dial can show. Anything that is not a number reads as the left end. */
export function clampDscr(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, DSCR_GAUGE_MAX));
}

/** Where a DSCR sits on the arc: the left end at 0, straight up at half the scale, the right end at the maximum. */
export function dscrGaugePoint(value: number | null | undefined): { x: number; y: number } {
  const angle = Math.PI * (1 - clampDscr(value) / DSCR_GAUGE_MAX);
  return { x: round(CENTER_X + RADIUS * Math.cos(angle)), y: round(CENTER_Y - RADIUS * Math.sin(angle)) };
}

/** The stretch of the arc between two DSCR values, as an SVG path that runs left to right over the top. */
export function dscrGaugeArc(from: number, to: number): string {
  const start = dscrGaugePoint(from), end = dscrGaugePoint(to);
  return `M${start.x} ${start.y} A${RADIUS} ${RADIUS} 0 0 1 ${end.x} ${end.y}`;
}

/** Which band a DSCR falls in. The boundaries belong to the better band: 1.00x covers the payment, 1.25x is comfortable. */
export function dscrTone(value: number): DscrTone {
  if (value < DSCR_COVERS_PAYMENT) return "bad";
  if (value < DSCR_COMFORTABLE) return "warn";
  return "good";
}

/**
 * The three bands in drawing order. The two outer bands are drawn first with
 * round ends, the narrow middle band last with flat ends, so the boundaries
 * fall exactly on 1.00x and 1.25x and the dial still has rounded tips.
 */
export const DSCR_GAUGE_BANDS: ReadonlyArray<{ tone: DscrTone; path: string; cap: "round" | "butt" }> = [
  { tone: "bad", path: dscrGaugeArc(0, DSCR_COVERS_PAYMENT), cap: "round" },
  { tone: "good", path: dscrGaugeArc(DSCR_COMFORTABLE, DSCR_GAUGE_MAX), cap: "round" },
  { tone: "warn", path: dscrGaugeArc(DSCR_COVERS_PAYMENT, DSCR_COMFORTABLE), cap: "butt" },
];

/** The whole arc, for the track under the bands. */
export const DSCR_GAUGE_TRACK = dscrGaugeArc(0, DSCR_GAUGE_MAX);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
