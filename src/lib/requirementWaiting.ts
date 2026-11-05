// What a received requirement is waiting on, in the vocabulary of the collection
// task cards. The decision itself lives in evidenceTriage.ts; this keeps the
// older shape (kind / label / hint / tone / owner) for the callers that want a
// single pill and a tooltip.
//
// "Received · AI checking" used to cover every requirement whose files had
// arrived but which was not yet accepted. On the live files it was almost never
// true: the AI had already finished (and accepted the file, or said it could
// not), and the item was waiting on a person, or on the client for the rest of
// the months. It no longer exists.

import type { ApplicationRequirement } from "@/lib/applicationProfile";
import { triageRequirement, type TriageInput, type TriageKind } from "@/lib/evidenceTriage";

export type RequirementWaitingKind =
  | "ai_reading"
  | "needs_person"
  | "needs_signoff"
  | "partial"
  | "review_not_run"
  | "received";

export type RequirementWaiting = {
  kind: RequirementWaitingKind;
  label: string;
  /** One sentence for the tooltip: why it is waiting and what moves it. */
  hint: string;
  tone: "acc" | "warn" | "mut";
  /** Who has to act next. */
  owner: "ai" | "person" | "client";
};

type Waitable = TriageInput;

const KINDS: Partial<Record<TriageKind, RequirementWaitingKind>> = {
  reading: "ai_reading",
  review: "needs_person",
  not_accepted: "needs_person",
  signoff: "needs_signoff",
  partial: "partial",
  replace: "partial",
  not_run: "review_not_run",
};

/** Who a requirement that is in but not yet accepted is waiting on, in words. */
export function requirementWaiting(requirement: Waitable): RequirementWaiting {
  const triage = triageRequirement(requirement);
  return {
    kind: KINDS[triage.kind] ?? "received",
    label: triage.label,
    hint: triage.next,
    tone: triage.tone === "warn" || triage.tone === "bad" ? "warn" : triage.tone === "mut" ? "mut" : "acc",
    owner: triage.owner === "you" ? "person" : triage.owner === "client" ? "client" : "ai",
  };
}

const URGENCY: RequirementWaitingKind[] = ["needs_person", "needs_signoff", "review_not_run", "partial", "ai_reading", "received"];

/** One answer for a task that covers several requirements: the one a person
 *  would want to see first. */
export function mostUrgentWaiting(items: RequirementWaiting[]): RequirementWaiting | null {
  if (!items.length) return null;
  return [...items].sort((a, b) => URGENCY.indexOf(a.kind) - URGENCY.indexOf(b.kind))[0];
}

/** Where a file came from, as a short chip: an upload, a form somebody filled
 *  in (the PDF is our rendering of their answers), or a signed certificate. */
export function evidenceOriginLabel(origin: string | null | undefined, formKind?: string | null): string {
  if (origin === "filled_form") {
    const kind = ({ pfs: "personal financial statement", debt_schedule: "debt schedule", p_and_l: "profit and loss", balance_sheet: "balance sheet" } as Record<string, string>)[formKind ?? ""];
    return kind ? `Filled in online · ${kind}` : "Filled in online";
  }
  if (origin === "signed") return "Signed in the room";
  return "Uploaded";
}

export type { ApplicationRequirement };
