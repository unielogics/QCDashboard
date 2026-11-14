/**
 * Every edit the plan screens make, as a pure function from one plan body to
 * the next. Nothing here talks to the API or to React, so the working copy can
 * change on each keystroke and be tested without a browser.
 *
 * Two rules live here because the API applies them too, and the screen must
 * not disagree with what a save will say:
 *
 * - Reviews. A staff decision is kept only while the change's figures, the
 *   revenue model and the cost lines stay as reviewed. Editing a note keeps
 *   it; editing a figure returns the change to proposed (`settleReviews`).
 * - One change per place. A price, a metric, a cost line or a whole group can
 *   carry one change.
 */
import { decimalInput } from "@/lib/decimalInput";
import { perWord } from "./format";
import { ALL, changeKey, number } from "./math";
import type {
  Amount, CategoryAnswer, EarningsPlanBody, ItemBlock, LineBehavior, PlanActivity, PlanAllocation, PlanBaseline, PlanChange, PlanFactor,
  PlanGrowth, PlanItemFields, PlanItemRow, PlanLine, PlanStream, PlanTarget, StreamTemplate, StreamType,
} from "./types";

export const ITEM_BLOCKS: readonly ItemBlock[] = ["changes", "growth", "activities"];
export const REVIEW_DEFAULTS = {
  status: "proposed", reviewed_by_user_id: null, reviewed_at: null, review_reason: "", review_stamp: null,
  baseline_treatment: "unreconciled", baseline_reconciliation_note: "",
} as const;
/** The stream a new plan starts with, and the one `balanceRevenue` keeps for whatever the named streams do not explain. */
export const SEED_STREAM = "s1";
export const OTHER_REVENUE_STREAM = "other-revenue";

const round = (value: number, places: number) => Math.round(value * 10 ** places) / 10 ** places;
/** A random UUID. `crypto.randomUUID` exists only on secure pages; the same random source builds one anywhere else. */
export function newId(): string {
  const source = globalThis.crypto;
  if (typeof source.randomUUID === "function") return source.randomUUID();
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const text = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
}
const hex = () => newId().replace(/-/g, "").slice(0, 6);

/** A typed figure as the API stores it: a number, or null while the field is empty. */
export function amount(value: Amount | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const parsed = decimalInput(value);
  return parsed == null || parsed < 0 ? null : parsed;
}

/** The working copy as the API takes it: every figure a number, nothing half-typed. */
export function toWire(body: EarningsPlanBody): EarningsPlanBody {
  const words = <T extends PlanItemFields>(row: T): T => ({ ...row, setup_cost: amount(row.setup_cost) });
  return {
    ...body,
    source: {
      ...body.source,
      corrections: Object.fromEntries(Object.entries(body.source?.corrections ?? {}).map(([key, row]) => [key, { amount: amount(row.amount) ?? 0, reason: row.reason }])),
    },
    streams: body.streams.map(stream => ({
      ...stream,
      // The stream that holds the rest states nothing; a stated stream sends its figure; a stream described as units times price sends neither.
      ...(stream.remainder ? { monthly_revenue: null } : stream.monthly_revenue === undefined ? {} : { monthly_revenue: amount(stream.monthly_revenue) }),
      factors: stream.factors.map(factor => ({ ...factor, value: amount(factor.value) })),
    })),
    lines: body.lines.map(line => ({ ...line, base: amount(line.base) ?? 0 })),
    changes: body.changes.map(row => ({ ...words(row), value: amount(row.value) })),
    growth: body.growth.map(row => ({ ...words(row), monthly_spend: amount(row.monthly_spend), added_per_month: amount(row.added_per_month) })),
    activities: body.activities.map(row => ({ ...words(row), monthly_amount: amount(row.monthly_amount) })),
    allocations: body.allocations.map(row => ({ ...row, monthly_amount: amount(row.monthly_amount) })),
  };
}

// ---------------------------------------------------------------------------
// Reviews: what an approval was given to
// ---------------------------------------------------------------------------

const PROPOSAL_AMOUNTS = new Set(["value", "setup_cost", "monthly_spend", "added_per_month", "monthly_amount"]);
const PROPOSAL_FIELDS: Record<ItemBlock, readonly string[]> = {
  changes: ["target", "direction", "mode", "value", "start_month", "setup_cost", "setup_cadence", "included"],
  growth: ["monthly_spend", "stream_id", "factor_id", "added_per_month", "start_month", "setup_cost", "setup_cadence", "included"],
  activities: ["monthly_amount", "start_month", "setup_cost", "setup_cadence", "included"],
};

/** The revenue model and cost lines every change rests on (names and notes are not part of it). */
export function modelKey(body: EarningsPlanBody): string {
  return JSON.stringify([
    body.streams.map(stream => [
      stream.id, Boolean(stream.remainder), stream.remainder ? null : amount(stream.monthly_revenue),
      stream.factors.map(factor => [factor.id, amount(factor.value), factor.unit, Boolean(factor.volume), Boolean(factor.alongside)]),
    ]),
    body.lines.map(line => [line.id, line.group, amount(line.base) ?? 0, line.behavior, line.link, line.measure ?? null]),
  ]);
}

/** What is proposed, without its words. */
export function proposalKey(block: ItemBlock, row: PlanItemRow): string {
  const record = row as unknown as Record<string, unknown>;
  return JSON.stringify(PROPOSAL_FIELDS[block].map(field => {
    const value = record[field];
    if (field === "target") {
      const target = (value ?? {}) as PlanTarget;
      return [target.kind, target.stream_id ?? null, target.factor_id ?? null, target.line_id ?? null, target.group ?? null];
    }
    if (PROPOSAL_AMOUNTS.has(field)) return amount(value as Amount);
    if (field === "included") return value !== false;
    return value ?? null;
  }));
}

/** After an edit, return to proposed whatever was reviewed against other figures. Returns `next` itself when nothing moved. */
export function settleReviews(previous: EarningsPlanBody, next: EarningsPlanBody): EarningsPlanBody {
  if (previous === next) return next;
  const modelMoved = modelKey(previous) !== modelKey(next);
  let changed = false;
  const settled = { ...next };
  for (const block of ITEM_BLOCKS) {
    const before = new Map((previous[block] as PlanItemRow[]).map(row => [row.id, row]));
    const rows = (next[block] as PlanItemRow[]).map(row => {
      if (row.status === "proposed" || row.status === undefined) return row;
      const prior = before.get(row.id);
      if (!modelMoved && prior && proposalKey(block, prior) === proposalKey(block, row)) return row;
      changed = true;
      return { ...row, ...REVIEW_DEFAULTS };
    });
    (settled as Record<ItemBlock, PlanItemRow[]>)[block] = rows;
  }
  return changed ? settled : next;
}

/** Staff decisions as the API recorded them, laid over the working copy without touching what is being typed. */
export function adoptReviews(body: EarningsPlanBody, saved: EarningsPlanBody): EarningsPlanBody {
  const next = { ...body };
  for (const block of ITEM_BLOCKS) {
    const decided = new Map((saved[block] as PlanItemRow[] | undefined ?? []).map(row => [row.id, row]));
    (next as Record<ItemBlock, PlanItemRow[]>)[block] = (body[block] as PlanItemRow[]).map(row => {
      const source = decided.get(row.id) as Record<string, unknown> | undefined;
      if (!source) return row;
      const review: Record<string, unknown> = {};
      for (const key of Object.keys(REVIEW_DEFAULTS)) if (key in source) review[key] = source[key];
      return { ...row, ...review } as PlanItemRow;
    });
  }
  return next;
}

/** Approvals the API no longer counts are shown as proposed, the way the saved figures already treat them. */
export function withoutStaleReviews(body: EarningsPlanBody, stale: readonly string[]): EarningsPlanBody {
  if (!stale.length) return body;
  const ids = new Set(stale);
  const next = { ...body };
  for (const block of ITEM_BLOCKS) {
    (next as Record<ItemBlock, PlanItemRow[]>)[block] = (body[block] as PlanItemRow[]).map(row => (ids.has(row.id) ? { ...row, ...REVIEW_DEFAULTS } : row));
  }
  return next;
}

// ---------------------------------------------------------------------------
// Step 1: the source
// ---------------------------------------------------------------------------

export function confirmGroup(body: EarningsPlanBody, key: string): EarningsPlanBody {
  if (body.source.confirmations[key]) return body;
  return { ...body, source: { ...body.source, confirmations: { ...body.source.confirmations, [key]: "confirmed" } } };
}

/** A correction is kept for the preparer; it never changes the source figure the plan computes from. */
export function saveCorrection(body: EarningsPlanBody, key: string, corrected: Amount, reason: string): EarningsPlanBody {
  const value = amount(corrected);
  if (value == null || reason.trim().length < 3) return body;
  return {
    ...body,
    source: {
      ...body.source,
      corrections: { ...body.source.corrections, [key]: { amount: value, reason: reason.trim() } },
      confirmations: { ...body.source.confirmations, [key]: "corrected" },
    },
  };
}

export function restoreSourceAmount(body: EarningsPlanBody, key: string): EarningsPlanBody {
  const corrections = { ...body.source.corrections };
  const confirmations = { ...body.source.confirmations };
  delete corrections[key];
  delete confirmations[key];
  return { ...body, source: { ...body.source, corrections, confirmations } };
}

// ---------------------------------------------------------------------------
// Step 2: revenue streams
// ---------------------------------------------------------------------------

const mapStream = (body: EarningsPlanBody, streamId: string, change: (stream: PlanStream) => PlanStream): EarningsPlanBody =>
  ({ ...body, streams: body.streams.map(stream => (stream.id === streamId ? change(stream) : stream)) });

export function renameStream(body: EarningsPlanBody, streamId: string, name: string): EarningsPlanBody {
  return mapStream(body, streamId, stream => ({ ...stream, name }));
}

/** True when a patch would leave the row exactly as it is: a keystroke that changes nothing is not an edit. */
const unchanged = (row: object | undefined, patch: object) => row !== undefined && Object.entries(patch).every(([key, value]) => (row as Record<string, unknown>)[key] === value);

/** What a measure is usually counted in. "other" is named by the business, and its unit follows the name. */
export const MEASURE_PRESETS = [
  { key: "units", label: "Units sold", unit: "units / mo" },
  { key: "hours", label: "Hours", unit: "hrs / mo" },
  { key: "jobs", label: "Jobs", unit: "jobs / mo" },
  { key: "customers", label: "Customers", unit: "customers / mo" },
  { key: "orders", label: "Orders", unit: "orders / mo" },
  { key: "other", label: "", unit: "per mo" },
] as const;
export type MeasureKind = (typeof MEASURE_PRESETS)[number]["key"];

const isVolume = (factor: PlanFactor) => Boolean(factor.volume) && !factor.alongside;
const isPrice = (factor: PlanFactor) => !factor.volume && !factor.alongside;
/** The unit a measure named by the business is counted in: "Tons hauled" is "tons hauled / mo". */
const unitFromName = (label: string) => (label.trim() ? `${label.trim().toLowerCase().slice(0, 34)} / mo` : "per mo");

/**
 * The price of a stream described freely is named after what the stream is counted in: revenue per unit, per hour,
 * or per month while nothing is counted. A price a stream kind names itself ("Hourly rate") is left alone.
 */
function namePrice(stream: PlanStream): PlanStream {
  const first = stream.factors.find(isVolume);
  const label = first ? `Revenue per ${perWord(first.unit)}` : "Revenue per month";
  const last = stream.factors.filter(isPrice).at(-1);
  if (!last || last.label === label || !/^Revenue per /.test(last.label)) return stream;
  return { ...stream, factors: stream.factors.map(factor => (factor === last ? { ...factor, label } : factor)) };
}

/** The seeded stream counts as the remainder only while it still looks like one: untouched names, nothing counted. */
const REMAINDER_NAMES = new Set(["All revenue", "Other revenue"]);
/** Units that count nothing: the one sale a month a plan used to be seeded with, and a multiplier left at one. */
const PLACEHOLDER_UNITS = new Set(["count", "multiplier"]);

/** Annual revenue of a stream described as its metrics multiplied together, with nothing proposed. */
function productRevenue(stream: PlanStream): number {
  let units = 1;
  let price = 1;
  for (const factor of stream.factors) {
    if (factor.alongside) continue;
    const value = factor.unit === "%" ? number(factor.value) / 100 : number(factor.value);
    if (factor.volume) units *= value;
    else price *= value;
  }
  return units * price * 12;
}

/**
 * The plan with every stream stating what it brings in a month.
 *
 * Plans were first described as units times a typed price. Revenue is the known figure, so the screens now hold it
 * the other way round: a stream states its revenue (or holds what the others leave) and its price is worked out by
 * division. A stream described the earlier way keeps exactly the revenue it had; its typed price is dropped because
 * it is now derived, and a metric that only stood in for one (one sale a month, a multiplier of one) goes unless a
 * change or a growth activity points at it. Returns `body` itself when every stream already states its revenue.
 */
export function modernize(body: EarningsPlanBody): EarningsPlanBody {
  let rest = body.streams.some(stream => stream.remainder);
  let moved = false;
  const pointedAt = (streamId: string, factorId: string) => body.changes.some(change => changeKey(change) === `f:${streamId}:${factorId}`)
    || body.growth.some(row => row.stream_id === streamId && row.factor_id === factorId);
  const streams = body.streams.map(stream => {
    if (stream.remainder || stream.monthly_revenue != null) return stream;
    moved = true;
    const revenue = productRevenue(stream) / 12;
    const kept = stream.factors.filter(factor => !(isVolume(factor) && PLACEHOLDER_UNITS.has(factor.unit) && number(factor.value) === 1 && !pointedAt(stream.id, factor.id)));
    const last = kept.filter(isPrice).at(-1);
    // The price is worked out from here on, so the one that was typed is not kept beside it.
    const factors = kept.map(factor => (factor === last ? { ...factor, value: null } : factor));
    const holdsTheRest = !rest && (stream.id === SEED_STREAM || stream.id === OTHER_REVENUE_STREAM) && REMAINDER_NAMES.has(stream.name.trim())
      && !factors.some(isVolume) && factors.filter(isPrice).length === 1 && last?.unit === "$";
    if (holdsTheRest) {
      rest = true;
      // Once other streams are named, what is left is no longer "all" revenue.
      const name = body.streams.length > 1 && stream.name.trim() === "All revenue" ? "Other revenue" : stream.name;
      return namePrice({ ...stream, name, remainder: true, monthly_revenue: null, factors });
    }
    return { ...stream, remainder: false, monthly_revenue: round(revenue, 2), factors };
  });
  return moved ? { ...body, streams } : body;
}

/** The stream that holds whatever the named streams do not explain, when the plan has one. */
export function remainderStream(body: EarningsPlanBody): PlanStream | null {
  return modernize(body).streams.find(stream => stream.remainder) ?? null;
}

/** What a stream brings in an average month, as typed. The stream that holds the rest has nothing to type. */
export function setStreamRevenue(body: EarningsPlanBody, streamId: string, value: string): EarningsPlanBody {
  const modern = modernize(body);
  const stream = modern.streams.find(row => row.id === streamId);
  if (!stream || stream.remainder || stream.monthly_revenue === value) return modern === body ? body : modern;
  return mapStream(modern, streamId, row => ({ ...row, monthly_revenue: value }));
}

/**
 * A metric's quantity or name. The price is never set here: it is the stream's revenue divided by its volume.
 * A measure the business named itself is counted in its own name ("Tons hauled" in tons hauled a month).
 */
export function setFactor(body: EarningsPlanBody, streamId: string, factorId: string, patch: Partial<Pick<PlanFactor, "label" | "value">>): EarningsPlanBody {
  const modern = modernize(body);
  const factor = modern.streams.find(stream => stream.id === streamId)?.factors.find(row => row.id === factorId);
  if (!factor || isPrice(factor) && "value" in patch) return modern;
  if (unchanged(factor, patch)) return modern;
  const named = patch.label !== undefined && factor.custom && factor.unit === unitFromName(factor.label) ? { unit: unitFromName(patch.label) } : {};
  return mapStream(modern, streamId, stream => namePrice({ ...stream, factors: stream.factors.map(row => (row.id === factorId ? { ...row, ...patch, ...named } : row)) }));
}

/**
 * One more way to count a stream's month. The first is what revenue follows; the rest sit alongside it, as divisors
 * (revenue and cost per hour) and as something a cost can follow. They move with the volume unless the plan changes them.
 */
export function addMeasure(body: EarningsPlanBody, streamId: string, kind: MeasureKind): EarningsPlanBody {
  const modern = modernize(body);
  const stream = modern.streams.find(row => row.id === streamId);
  const preset = MEASURE_PRESETS.find(row => row.key === kind) ?? MEASURE_PRESETS[0];
  if (!stream || stream.factors.length >= 12) return modern;
  const first = !stream.factors.some(isVolume);
  const taken = new Set(stream.factors.map(factor => factor.id));
  let id = `f-${hex()}`;
  while (taken.has(id)) id = `f-${hex()}`;
  const measure: PlanFactor = { id, label: preset.label, value: "", unit: preset.unit, volume: first, alongside: !first, custom: true };
  // The volume stands before the price it is divided into; a measure alongside comes after everything.
  return mapStream(modern, streamId, row => namePrice({ ...row, factors: first ? [measure, ...row.factors] : [...row.factors, measure] }));
}

/**
 * Only a metric the business added can go, and with it the change that targets it and any growth activity it fed.
 * When the stream's only volume goes, the first measure alongside becomes what revenue follows, so the stream stays
 * measured. A cost that followed the removed quantity becomes fixed.
 */
export function removeFactor(body: EarningsPlanBody, streamId: string, factorId: string): EarningsPlanBody {
  const modern = modernize(body);
  const stream = modern.streams.find(row => row.id === streamId);
  const factor = stream?.factors.find(row => row.id === factorId);
  if (!stream || !factor?.custom || stream.factors.length <= 1) return modern;
  let factors = stream.factors.filter(item => item.id !== factorId);
  const lastVolume = isVolume(factor) && !factors.some(isVolume);
  const promoted = lastVolume ? factors.find(item => item.alongside) : undefined;
  if (promoted) factors = [{ ...promoted, alongside: false, volume: true }, ...factors.filter(item => item !== promoted)];
  const fixed = (line: PlanLine): PlanLine => ({ ...line, behavior: "fixed", link: ALL, measure: null });
  return {
    ...mapStream(modern, streamId, row => namePrice({ ...row, factors })),
    lines: modern.lines.map(line => {
      if (line.link !== streamId || line.behavior !== "unit") return line;
      if (line.measure === factorId || (lastVolume && !line.measure)) return fixed(line);
      return promoted && line.measure === promoted.id ? { ...line, measure: null } : line;
    }),
    changes: modern.changes.filter(change => changeKey(change) !== `f:${streamId}:${factorId}`),
    growth: modern.growth.filter(row => !(row.stream_id === streamId && row.factor_id === factorId)),
  };
}

/** A new stream states its own revenue; the stream that was all revenue becomes what the others leave. */
export function addStream(body: EarningsPlanBody, type: StreamType, templates: Record<string, StreamTemplate>): EarningsPlanBody {
  const modern = modernize(body);
  const template = templates[type] ?? templates.custom;
  if (!template || modern.streams.length >= 40) return modern;
  const taken = new Set(modern.streams.map(stream => stream.id));
  let id = `s-${hex()}`;
  while (taken.has(id)) id = `s-${hex()}`;
  const stream: PlanStream = {
    id, name: template.label, type, added: true, remainder: false, monthly_revenue: "",
    // A share that scales volume starts at the whole of it; quantities are for the business to say; the price is worked out.
    factors: template.factors.map(([label, unit, volume], index) => ({ id: `f${index}`, label, value: volume ? (unit === "%" ? 100 : "") : null, unit, volume, custom: false })),
  };
  return {
    ...modern,
    streams: [...modern.streams.map(row => (row.remainder && row.name.trim() === "All revenue" ? { ...row, name: "Other revenue" } : row)), stream],
  };
}

/** Removing a stream takes its metric changes and growth activities with it; costs that followed it become fixed. */
export function removeStream(body: EarningsPlanBody, streamId: string): EarningsPlanBody {
  const modern = modernize(body);
  return {
    ...modern,
    streams: modern.streams.filter(stream => stream.id !== streamId),
    growth: modern.growth.filter(row => row.stream_id !== streamId),
    lines: modern.lines.map(line => (line.link === streamId ? { ...line, behavior: "fixed" as const, link: ALL, measure: null } : line)),
    changes: modern.changes.filter(change => !(change.target?.kind === "factor" && change.target.stream_id === streamId)),
  };
}

/**
 * Make the revenue model add up to the source: one stream that holds whatever the named streams do not explain.
 * A plan that already has one adds up by itself; streams that state more than the source cannot be balanced this way.
 */
export function balanceRevenue(body: EarningsPlanBody): EarningsPlanBody {
  const modern = modernize(body);
  if (modern.streams.some(stream => stream.remainder) || modern.streams.length >= 40) return modern;
  const taken = new Set(modern.streams.map(stream => stream.id));
  let id: string = OTHER_REVENUE_STREAM;
  while (taken.has(id)) id = `s-${hex()}`;
  return {
    ...modern,
    streams: [...modern.streams, {
      id, name: "Other revenue", type: "custom", added: true, remainder: true, monthly_revenue: null,
      factors: [{ id: "f1", label: "Revenue per month", value: null, unit: "$", volume: false, custom: false }],
    }],
  };
}

// ---------------------------------------------------------------------------
// Step 2: cost lines
// ---------------------------------------------------------------------------

/**
 * Following a stream per unit needs a stream to follow.
 *
 * A change on the cost that is already sized in dollars a year keeps meaning dollars a year when the cost starts or
 * stops following a driver, so $20,000 is never re-read as 20,000 points of revenue or $20,000 a unit.
 */
export function setLineBehavior(body: EarningsPlanBody, lineId: string, behavior: LineBehavior): EarningsPlanBody {
  const before = body.lines.find(line => line.id === lineId)?.behavior ?? "fixed";
  const carried = (change: PlanChange): PlanChange => {
    if (change.target.kind !== "line" || change.target.line_id !== lineId) return change;
    if (before === "fixed" && behavior !== "fixed" && change.mode === "amount") return { ...change, mode: "annual" };
    if (before !== "fixed" && behavior === "fixed" && change.mode === "annual") return { ...change, mode: "amount" };
    return change;
  };
  const changes = body.changes.map(carried);
  return {
    ...body,
    lines: body.lines.map(line => (line.id === lineId
      ? {
        ...line, behavior, link: behavior === "fixed" ? ALL : behavior === "unit" && line.link === ALL ? body.streams[0]?.id ?? ALL : line.link,
        // Only a cost per unit follows a measure; it starts on the stream's own volume.
        measure: behavior === "unit" && line.behavior === "unit" ? line.measure ?? null : null,
      }
      : line)),
    changes: changes.some((change, index) => change !== body.changes[index]) ? changes : body.changes,
  };
}

/**
 * A cost cannot be "per unit of all revenue": against all revenue it is a percent. A cost per unit follows its
 * stream's own volume, or one of the measures alongside it (`measure`): wages per labor hour.
 */
export function setLineLink(body: EarningsPlanBody, lineId: string, link: string, measure: string | null = null): EarningsPlanBody {
  return {
    ...body,
    lines: body.lines.map(line => {
      if (line.id !== lineId) return line;
      const behavior = link === ALL && line.behavior === "unit" ? "pct" : line.behavior;
      return { ...line, link, behavior, measure: behavior === "unit" && link !== ALL ? measure : null };
    }),
  };
}

/** The line a source group was seeded with: it holds what the group's own items do not account for. */
const isGroupLine = (line: PlanLine) => line.id === line.group && !line.added;

/** Keep a split group adding up to the source: the group's own line is the remainder of its items. */
function rebalance(lines: PlanLine[], baseline: PlanBaseline, group: string): PlanLine[] {
  const source = baseline.groups?.find(row => row.key === group);
  const own = lines.find(line => line.group === group && isGroupLine(line));
  if (!source || !own) return lines;
  const items = lines.filter(line => line.group === group && line !== own).reduce((sum, line) => sum + number(line.base), 0);
  const base = round(Math.max(0, source.amount - items), 2);
  return lines.map(line => (line === own ? { ...line, base } : line));
}

/** Split a source line: a new item inside the group, placed after the group's last line. */
export function addLine(body: EarningsPlanBody, baseline: PlanBaseline, group: string): EarningsPlanBody {
  if (body.lines.length >= 500) return body;
  const taken = new Set(body.lines.map(line => line.id));
  let id = `${group.slice(0, 48)}-${hex()}`;
  while (taken.has(id)) id = `${group.slice(0, 48)}-${hex()}`;
  const line: PlanLine = { id, group, label: "", base: "", behavior: "fixed", link: ALL, added: true };
  const last = body.lines.reduce((at, row, index) => (row.group === group ? index : at), -1);
  const lines = last < 0 ? [...body.lines, line] : [...body.lines.slice(0, last + 1), line, ...body.lines.slice(last + 1)];
  return { ...body, lines: rebalance(lines, baseline, group) };
}

export function setLine(body: EarningsPlanBody, baseline: PlanBaseline, lineId: string, patch: Partial<Pick<PlanLine, "label" | "base">>): EarningsPlanBody {
  const line = body.lines.find(row => row.id === lineId);
  if (!line || unchanged(line, patch)) return body;
  const lines = body.lines.map(row => (row.id === lineId ? { ...row, ...patch } : row));
  return { ...body, lines: "base" in patch ? rebalance(lines, baseline, line.group) : lines };
}

/** Only an item added by a split can go; its amount returns to the group's own line. */
export function removeLine(body: EarningsPlanBody, baseline: PlanBaseline, lineId: string): EarningsPlanBody {
  const line = body.lines.find(row => row.id === lineId);
  if (!line?.added) return body;
  return {
    ...body,
    lines: rebalance(body.lines.filter(row => row.id !== lineId), baseline, line.group),
    changes: body.changes.filter(change => changeKey(change) !== `l:${lineId}`),
  };
}

export function answerCategory(body: EarningsPlanBody, key: string, answer: CategoryAnswer): EarningsPlanBody {
  return { ...body, category_answers: { ...body.category_answers, [key]: answer } };
}

// ---------------------------------------------------------------------------
// Step 3: changes
// ---------------------------------------------------------------------------

const WORDS = { start_month: 1, setup_cost: "", setup_cadence: "one_time", note: "", evidence_note: "", owner: "", included: true, source_file_ids: [], status: "proposed" } as const;

export function findItem(body: EarningsPlanBody, id: string): { block: ItemBlock; row: PlanItemRow; index: number } | null {
  for (const block of ITEM_BLOCKS) {
    const index = (body[block] as PlanItemRow[]).findIndex(row => row.id === id);
    if (index >= 0) return { block, row: (body[block] as PlanItemRow[])[index], index };
  }
  return null;
}

/** A change on a price, a metric, a cost or a whole group. A place that already has one keeps it. */
export function addChange(body: EarningsPlanBody, target: PlanTarget, defaults: Partial<PlanChange> = {}): { body: EarningsPlanBody; id: string | null } {
  const place = changeKey({ target });
  const existing = body.changes.find(change => changeKey(change) === place);
  if (existing) return { body, id: existing.id };
  if (body.changes.length >= 300) return { body, id: null };
  const change: PlanChange = { ...WORDS, source_file_ids: [], id: newId(), target, direction: "down", mode: "percent", value: "", ...defaults };
  return { body: { ...body, changes: [...body.changes, change] }, id: change.id };
}

export type ItemPatch = Partial<Omit<PlanChange, "id" | "target"> & Omit<PlanGrowth, "id"> & Omit<PlanActivity, "id">>;

export function patchItem(body: EarningsPlanBody, id: string, patch: ItemPatch): EarningsPlanBody {
  const found = findItem(body, id);
  if (!found || unchanged(found.row, patch)) return body;
  return { ...body, [found.block]: (body[found.block] as PlanItemRow[]).map(row => (row.id === id ? { ...row, ...patch } : row)) };
}

/** A growth activity moved to another stream feeds that stream's first volume metric. */
export function setGrowthStream(body: EarningsPlanBody, id: string, streamId: string): EarningsPlanBody {
  const factor = body.streams.find(stream => stream.id === streamId)?.factors.find(row => row.volume);
  return factor ? patchItem(body, id, { stream_id: streamId, factor_id: factor.id }) : body;
}

export type RemovedItem = { block: ItemBlock; row: PlanItemRow; index: number };

export function removeItem(body: EarningsPlanBody, id: string): { body: EarningsPlanBody; removed: RemovedItem | null } {
  const found = findItem(body, id);
  if (!found) return { body, removed: null };
  return { body: { ...body, [found.block]: (body[found.block] as PlanItemRow[]).filter(row => row.id !== id) }, removed: found };
}

/** Undo a removal, unless what the change pointed at has gone or its place was taken meanwhile. */
export function restoreItem(body: EarningsPlanBody, removed: RemovedItem): EarningsPlanBody {
  const { block, row, index } = removed;
  if (findItem(body, row.id)) return body;
  if (block === "changes") {
    const change = row as PlanChange;
    const target = change.target;
    const stream = body.streams.find(item => item.id === target.stream_id);
    const exists = target.kind === "pricing"
      || (target.kind === "factor" && Boolean(stream?.factors.some(factor => factor.id === target.factor_id)))
      || (target.kind === "line" && body.lines.some(line => line.id === target.line_id))
      || (target.kind === "group" && body.lines.some(line => line.group === target.group));
    if (!exists || body.changes.some(other => changeKey(other) === changeKey(change))) return body;
  }
  if (block === "growth") {
    const growth = row as PlanGrowth;
    if (!body.streams.find(stream => stream.id === growth.stream_id)?.factors.some(factor => factor.id === growth.factor_id && factor.volume)) return body;
  }
  const rows = [...(body[block] as PlanItemRow[])];
  rows.splice(Math.min(index, rows.length), 0, row);
  return { ...body, [block]: rows };
}

/** Spending that adds volume to a stream. Needs a stream with a volume metric to feed. */
export function addGrowth(body: EarningsPlanBody): { body: EarningsPlanBody; id: string | null } {
  const stream = body.streams.find(row => row.factors.some(factor => factor.volume));
  const factor = stream?.factors.find(row => row.volume);
  if (!stream || !factor || body.growth.length >= 100) return { body, id: null };
  const row: PlanGrowth = { ...WORDS, source_file_ids: [], id: newId(), name: "New growth activity", monthly_spend: "", stream_id: stream.id, factor_id: factor.id, added_per_month: "" };
  return { body: { ...body, growth: [...body.growth, row] }, id: row.id };
}

/** A cost that does not exist today. */
export function addActivity(body: EarningsPlanBody): { body: EarningsPlanBody; id: string | null } {
  if (body.activities.length >= 100) return { body, id: null };
  const row: PlanActivity = { ...WORDS, source_file_ids: [], id: newId(), name: "New activity", monthly_amount: "" };
  return { body: { ...body, activities: [...body.activities, row] }, id: row.id };
}

// ---------------------------------------------------------------------------
// Released cash, carried-over items, and the plan's own words
// ---------------------------------------------------------------------------

export function addAllocation(body: EarningsPlanBody): EarningsPlanBody {
  if (body.allocations.length >= 200) return body;
  return { ...body, allocations: [...body.allocations, { id: newId(), label: "New allocation", purpose: "existing", monthly_amount: "", notes: "" }] };
}

export function patchAllocation(body: EarningsPlanBody, id: string, patch: Partial<Omit<PlanAllocation, "id">>): EarningsPlanBody {
  if (unchanged(body.allocations.find(row => row.id === id), patch)) return body;
  return { ...body, allocations: body.allocations.map(row => (row.id === id ? { ...row, ...patch } : row)) };
}

export function removeAllocation(body: EarningsPlanBody, id: string): EarningsPlanBody {
  return { ...body, allocations: body.allocations.filter(row => row.id !== id) };
}

/** An item the earlier plan held that this model says another way: marked once it has been re-entered or set aside. */
export function resolveCarriedOver(body: EarningsPlanBody, id: string, resolved: boolean): EarningsPlanBody {
  return { ...body, carried_over: body.carried_over.map(row => (row.id === id ? { ...row, resolved } : row)) };
}

export function setPlanStart(body: EarningsPlanBody, planStart: string): EarningsPlanBody {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(planStart) ? { ...body, plan_start: planStart } : body;
}

export function setAttestation(body: EarningsPlanBody, attestation: boolean): EarningsPlanBody {
  return { ...body, attestation };
}

export function setNotes(body: EarningsPlanBody, notes: string): EarningsPlanBody {
  return { ...body, notes };
}
