// What a received requirement is actually waiting on.
//
// "Received · AI checking" used to cover every requirement whose files had
// arrived but which was not yet "Accepted". On the live files it was almost never
// true: the AI had already finished (and accepted the file, or said it could not),
// and the item was waiting on a person, or on the client for the rest of the
// months. Nothing moved those along, so they sat under a label that promised the
// opposite. This reads the same evidence the Requirements tab shows and says who
// has to act next.

import type { ApplicationRequirement, ApplicationRequirementEvidence } from "@/lib/applicationProfile";

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

type Evidence = Pick<ApplicationRequirementEvidence, "ai_decision" | "ai_explanation" | "verified">;
type Waitable = Pick<ApplicationRequirement, "status" | "verification_required" | "state_reason"> & {
  evidence_files?: Evidence[] | null;
  coverage?: Record<string, unknown> | null;
  verified_coverage?: Record<string, unknown> | null;
};

const FLAGGED = new Set(["needs_more", "rejected", "failed"]);

type Progress = { current: number; required: number; unit: string };

/** How much of what is needed the AI (or a person) has accepted so far, or
 *  null when it is all there or the requirement does not count in parts. */
export function acceptedProgress(requirement: Pick<Waitable, "coverage" | "verified_coverage">): Progress | null {
  const source = requirement.verified_coverage ?? requirement.coverage ?? {};
  const current = Number(source.current);
  const required = Number(source.required);
  if (!Number.isFinite(current) || !Number.isFinite(required) || required <= 0 || current >= required) return null;
  return { current, required, unit: String(source.unit ?? "documents") };
}

function sentence(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/** Who a requirement in "received, not yet accepted" is waiting on, in words.
 *  Any other status answers `received` with a null-safe label of its own. */
export function requirementWaiting(requirement: Waitable): RequirementWaiting {
  const files = requirement.evidence_files ?? [];
  const reading = files.filter((file) => file.ai_decision === "processing");
  const flagged = files.filter((file) => FLAGGED.has(file.ai_decision));
  const progress = acceptedProgress(requirement);
  const allAccepted = files.length > 0 && files.every((file) => file.ai_decision === "accepted");

  if (reading.length) {
    return {
      kind: "ai_reading",
      label: "Received · AI reading",
      hint: "The AI is reading the file now. This usually takes a minute or two.",
      tone: "acc",
      owner: "ai",
    };
  }
  if (flagged.length) {
    const why = sentence(flagged.find((file) => file.ai_explanation)?.ai_explanation);
    const many = flagged.length > 1;
    return {
      kind: "needs_person",
      label: "Received · needs a person",
      hint: `${many ? `The AI could not accept ${flagged.length} of the files` : "The AI could not accept this file"}.${why ? ` ${why}` : ""} Preview it, then accept it, move it to the right item, or ask the client for another.`,
      tone: "warn",
      owner: "person",
    };
  }
  if (progress) {
    return {
      kind: "partial",
      label: `Partly received · ${progress.current} of ${progress.required} ${progress.unit}`,
      hint: `The AI accepted ${progress.current} of ${progress.required} ${progress.unit}. The client still needs to send the rest.`,
      tone: "mut",
      owner: "client",
    };
  }
  if (requirement.verification_required && allAccepted && !files.every((file) => file.verified)) {
    return {
      kind: "needs_signoff",
      label: "Received · needs sign-off",
      hint: "The AI accepted the file. This item needs a person to confirm it before it counts.",
      tone: "warn",
      owner: "person",
    };
  }
  if (/run ai review/i.test(requirement.state_reason ?? "")) {
    return {
      kind: "review_not_run",
      label: "Received · review not run",
      hint: "The file is in. Its review checks have not been run yet; use Run AI review on the Requirements tab.",
      tone: "acc",
      owner: "ai",
    };
  }
  return {
    kind: "received",
    label: "Received · being checked",
    hint: "The file is in and the requirement has not been accepted yet.",
    tone: "acc",
    owner: "ai",
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
