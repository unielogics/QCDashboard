/**
 * What still stands between a draft and a saved version, as the screens show
 * it, and the things worth a warning that never hold a version back.
 *
 * The list itself is the engine's (`to_finish`): confirm the source amounts,
 * reconcile the revenue model, answer the category questions, explain each
 * change, confirm the plan. It is the only thing that blocks saving a version.
 */
import { number } from "./math";
import { usd } from "./format";
import type { EarningsPlanBody, PlanBaseline, PlanResult, ToFinishItem } from "./types";

export const STEP_TITLES = ["Confirm source", "Revenue model and current costs", "Plan changes", "Review and save"] as const;
export type StepIndex = 0 | 1 | 2 | 3;

/** How many open items each step holds. */
export function stepCounts(items: readonly ToFinishItem[]): [number, number, number, number] {
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  for (const item of items) counts[item.step] += 1;
  return counts;
}

/** The save button says what it will do: finish what is left, or save. */
export function saveLabel(items: readonly ToFinishItem[], client = false): string {
  if (items.length) return `Complete required items · ${items.length}`;
  return client ? "Submit plan for review" : "Save version and PDF";
}

export type Itemization = {
  key: string; label: string; count: number; linked: number; total: number; source: number; difference: number;
  state: "balanced" | "unallocated" | "over";
  tag: string; text: string;
};

/** For each source group that is split into items: do the items still add up to the source? */
export function itemization(body: EarningsPlanBody, baseline: PlanBaseline, behaviors: PlanResult["behaviors"]): Itemization[] {
  const rows: Itemization[] = [];
  for (const group of baseline.groups ?? []) {
    const lines = body.lines.filter(line => line.group === group.key);
    if (!lines.length) continue;
    const total = lines.reduce((sum, line) => sum + number(line.base), 0);
    const difference = total - group.amount;
    if (lines.length < 2 && Math.abs(difference) < 1) continue;
    const state = Math.abs(difference) < 1 ? "balanced" : difference < 0 ? "unallocated" : "over";
    const linked = lines.filter(line => behaviors[line.id] && behaviors[line.id] !== "fixed").length;
    rows.push({
      key: group.key, label: group.label, count: lines.length, linked, total, source: group.amount, difference, state,
      tag: state === "balanced" ? "Balanced" : state === "unallocated" ? `Unallocated ${usd(-difference)}` : `Over the source by ${usd(difference)}`,
      text: `${group.label} · ${lines.length} ${lines.length === 1 ? "item totals" : "items total"} ${usd(total)} against ${usd(group.amount)} on the source · ${linked} linked to revenue`,
    });
  }
  return rows;
}

export type PlanNotice = { code: string; tone: "warn" | "bad" | "acc"; message: string; step?: StepIndex };

/** Things to know that do not stop a save. */
export function planNotices(input: {
  body: EarningsPlanBody; baseline: PlanBaseline; result: PlanResult;
  sourceChanged: boolean; staleReviews: readonly string[]; origin?: string;
  /** The business has already sent this plan in and has changed nothing since. */
  submitted?: boolean;
}): PlanNotice[] {
  const { body, baseline, result, sourceChanged, staleReviews, origin, submitted } = input;
  const notices: PlanNotice[] = [];
  if (submitted) {
    notices.push({ code: "submitted", tone: "acc", message: "You have sent this plan to your team, and they are reviewing it. You can still change it and submit it again." });
  }
  if (baseline.available === false) {
    notices.push({ code: "no_source", tone: "warn", step: 0, message: baseline.reason || "This file has no earnings source yet. Add a filed business return or a profit and loss statement to the file; the plan's figures appear as soon as one is in use." });
  }
  if (sourceChanged) {
    notices.push({ code: "source_changed", tone: "warn", step: 0, message: "The source figures changed after this plan was built. Update the plan to the current figures, then confirm the amounts again." });
  }
  if (origin === "carried_over") {
    notices.push({ code: "carried_over", tone: "acc", message: "This plan was brought over from the earlier plan editor. Nothing is saved in the new form until you change something or save a version. Approvals do not carry over: each change is reviewed again." });
  }
  const waiting = body.carried_over.filter(row => !row.resolved).length;
  if (waiting) {
    notices.push({ code: "re_enter", tone: "warn", step: 2, message: `${waiting} ${waiting === 1 ? "item" : "items"} from the earlier plan could not be carried over as ${waiting === 1 ? "it was" : "they were"} written. ${waiting === 1 ? "It is" : "They are"} listed under Plan changes to re-enter; ${waiting === 1 ? "it is" : "they are"} not counted until then.` });
  }
  if (staleReviews.length) {
    notices.push({ code: "stale_reviews", tone: "warn", step: 3, message: `${staleReviews.length} reviewed ${staleReviews.length === 1 ? "change needs" : "changes need"} another review: the source figures or the plan's model changed after ${staleReviews.length === 1 ? "it was" : "they were"} approved.` });
  }
  if (result.released.over_allocated && result.released.available_monthly > 0) {
    notices.push({ code: "over_allocated", tone: "warn", step: 2, message: `Released cash is over-assigned by ${usd(result.released.allocated_monthly - result.released.available_monthly)} a month. Lower an allocation; this does not hold the version back.` });
  }
  return notices;
}
