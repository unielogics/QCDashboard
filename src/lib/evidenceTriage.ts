// Who has to do something next about each requirement on a file.
//
// The Evidence & banking tab used to list every requirement under one pill
// vocabulary that mixed two different questions: what the AI did with a file
// ("Accepted by AI", "Needs review") and what the requirement still needs
// ("Received · AI checking", "0 of 1 documents accepted"). An underwriter
// opening the tab could not tell what was waiting on them and what was waiting
// on the client. This module answers one question per requirement, in plain
// words: *who acts next?* — you, the client, the AI, or nobody (it is done).
//
// Everything is derived from what the readiness read already returns. Nothing
// here changes how a requirement is decided; it only says what the decision
// leaves undone.

import type { ApplicationRequirement, ApplicationRequirementEvidence } from "@/lib/applicationProfile";

export type TriageGroup = "you" | "client" | "ai" | "done";

export type TriageKind =
  | "complete"
  | "overridden"
  | "not_needed"
  | "signoff"
  | "review"
  | "not_accepted"
  | "reading"
  | "not_run"
  | "checking"
  | "partial"
  | "fill"
  | "replace"
  | "waiting"
  | "not_asked"
  | "out_of_date";

export type TriageTone = "ok" | "acc" | "warn" | "bad" | "mut";

export type Progress = { current: number; required: number; unit: string; text: string };

export type Triage = {
  group: TriageGroup;
  kind: TriageKind;
  /** The pill. Plain words; never "Received · AI checking". */
  label: string;
  tone: TriageTone;
  /** One sentence: where it stands and what moves it. Also the pill's tooltip. */
  next: string;
  /** The same thing in a few words, for a collapsed row. */
  short: string;
  owner: "you" | "client" | "ai" | "none";
  /** What has been accepted of what is needed, or null when it does not count in parts. */
  progress: Progress | null;
};

type FileLike = Pick<ApplicationRequirementEvidence, "ai_decision" | "ai_explanation" | "verified"> &
  Partial<Pick<ApplicationRequirementEvidence, "decision_actor" | "file_name">>;

export type TriageInput = Pick<ApplicationRequirement, "status" | "verification_required" | "state_reason"> &
  Partial<Pick<ApplicationRequirement, "required_level" | "last_requested_at" | "label" | "source_program_keys" | "program_overrides">> & {
    evidence_files?: FileLike[] | null;
    coverage?: Record<string, unknown> | null;
    verified_coverage?: Record<string, unknown> | null;
  };

const FLAGGED = new Set(["needs_more", "rejected", "failed"]);

/** What the rest of the page knows that the requirement itself does not. */
export type TriageExtra = {
  /** A schedule read from a file (or already on the file) whose table still has work in it. */
  fillTable?: { read: number; onSchedule: number; missing: number; draftReady?: boolean; publishNeeded?: boolean };
};

export const GROUP_ORDER: TriageGroup[] = ["you", "client", "ai", "done"];

export const GROUPS: Record<TriageGroup, { title: string; blurb: string; empty: string }> = {
  you: {
    title: "Needs you",
    blurb: "A file is in and a person has to decide: the AI could not accept it, or it is waiting for your sign-off.",
    empty: "Nothing is waiting on you.",
  },
  client: {
    title: "Waiting on the client",
    blurb: "We have asked and the client has not sent it yet, or has sent only part of it.",
    empty: "Nothing is waiting on the client.",
  },
  ai: {
    title: "AI is working",
    blurb: "The AI is reading a file or finishing its checks. These update by themselves.",
    empty: "The AI is not working on anything right now.",
  },
  done: {
    title: "Complete",
    blurb: "Accepted by the AI or signed off by a person, or not needed for this file. These count toward readiness.",
    empty: "Nothing is complete yet.",
  },
};

/** The same words as the pills, for the "what do these mean?" panel. */
export const LEGEND: { label: string; group: TriageGroup; means: string }[] = [
  { label: "Needs your review", group: "you", means: "A file came in and the AI could not accept it (wrong document, unreadable, or not sure). Preview it, then accept it anyway, move it to the right item, or ask the client for another." },
  { label: "Fill in the table", group: "you", means: "We read the client's debt schedule into a table. Fill in the cells marked needed (interest, original amount, balance and so on), take off anything that is not a loan, then save." },
  { label: "Ready for your sign-off", group: "you", means: "The AI read the file and it looks right, but this item needs a person to confirm it before it counts." },
  { label: "Waiting on the client", group: "client", means: "We have asked and nothing has arrived yet. Partly received items say how much is in, for example 4 of 6 months." },
  { label: "New file needed", group: "client", means: "Your team rejected the file and asked for another copy. The client needs to send a replacement, or you can fill the form in yourself." },
  { label: "AI is reading", group: "ai", means: "A file just came in and the AI is reading it. This usually takes a minute or two and updates by itself." },
  { label: "Complete", group: "done", means: "The AI accepted it or a person signed it off. It counts toward readiness." },
  { label: "Not needed", group: "done", means: "Waived or marked not applicable for this file." },
];

function sentence(value: string | null | undefined): string {
  const text = (value ?? "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return count === 1 ? one : many;
}

function readCoverage(source: Record<string, unknown> | null | undefined): { current: number; required: number; unit: string } | null {
  if (!source) return null;
  const required = Number(source.required);
  if (!Number.isFinite(required) || required <= 0) return null;
  const current = Number(source.current);
  return { current: Number.isFinite(current) ? current : 0, required, unit: String(source.unit ?? "documents") };
}

function unitLabel(unit: string, required: number): string {
  if (unit === "documents") return plural(required, "document");
  if (unit === "months") return plural(required, "month");
  return unit;
}

function progressOf(source: { current: number; required: number; unit: string } | null): Progress | null {
  if (!source) return null;
  const current = Math.min(Math.max(source.current, 0), source.required);
  return {
    current,
    required: source.required,
    unit: source.unit,
    text: `${current} of ${source.required} ${unitLabel(source.unit, source.required)}`,
  };
}

/** The requirements the Documents list shows: documents, and forms that have a slot on the checklist. */
export function isDocumentRequirement(
  requirement: Pick<ApplicationRequirement, "requested_document_id"> & Partial<Pick<ApplicationRequirement, "requirement_kind">>,
): boolean {
  return (requirement.requirement_kind ?? "document") === "document" || (requirement.requirement_kind === "form" && Boolean(requirement.requested_document_id));
}

/** A requirement counts as done when it is accepted, waived or marked not applicable,
 *  or when every program that needs it has set it aside. */
export function requirementIsComplete(
  requirement: Pick<ApplicationRequirement, "status"> & Partial<Pick<ApplicationRequirement, "source_program_keys" | "program_overrides">>,
): boolean {
  if (["verified", "waived", "not_applicable"].includes(requirement.status)) return true;
  const keys = requirement.source_program_keys ?? [];
  return keys.length > 0 && keys.every((key) => ["waived", "not_applicable"].includes(requirement.program_overrides?.[key] || ""));
}

function askedOn(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function triageRequirement(requirement: TriageInput, extra?: TriageExtra): Triage {
  const files = requirement.evidence_files ?? [];
  const status = requirement.status;

  if (requirementIsComplete(requirement)) {
    if (status === "waived" || status === "not_applicable") {
      return { group: "done", kind: "not_needed", label: "Not needed", tone: "mut", owner: "none", progress: null, short: status === "waived" ? "Waived for this file" : "Marked not applicable", next: "Waived or marked not applicable for this file." };
    }
    if (status !== "verified") {
      return { group: "done", kind: "overridden", label: "Not needed", tone: "mut", owner: "none", progress: null, short: "Set aside by every program", next: "Every program that asked for this has set it aside." };
    }
    const overridden = /underwriting override/i.test(requirement.state_reason ?? "");
    const signedOff = requirement.verification_required && files.some((file) => file.verified && file.decision_actor && file.decision_actor !== "ai");
    return {
      group: "done",
      kind: "complete",
      label: "Complete",
      tone: "ok",
      owner: "none",
      progress: progressOf(readCoverage(requirement.verified_coverage) ?? readCoverage(requirement.coverage)),
      next: overridden ? "Accepted by your team as an override." : signedOff ? "Signed off by a person." : "Accepted by the AI.",
      short: overridden ? "Accepted by your team (override)" : signedOff ? "Signed off by a person" : "Accepted by the AI",
    };
  }

  const fill = extra?.fillTable;
  if (fill?.draftReady && fill.publishNeeded && !files.some((file) => file.ai_decision === "processing")) {
    return {
      group: "you", kind: "fill", label: "Save completed schedule", tone: "acc", owner: "you", progress: null,
      short: `${fill.onSchedule} ${plural(fill.onSchedule, "obligation")} in the working draft · ready to save`,
      next: "The working schedule is complete. Review it, then choose Save version to file its dated PDF and update the financial figures.",
    };
  }
  if (fill && (fill.read > 0 || fill.missing > 0) && !files.some((file) => file.ai_decision === "processing")) {
    const lines = fill.read > 0 ? fill.read : fill.onSchedule;
    const missing = fill.missing;
    const where = fill.read > 0 ? "We read" : "On the schedule:";
    return {
      group: "you", kind: "fill", label: "Fill in the table", tone: "warn", owner: "you",
      progress: progressOf(readCoverage(requirement.verified_coverage)),
      short: `${where} ${lines} ${plural(lines, "line")}${fill.read > 0 ? " from the file" : ""} · ${missing > 0 ? `${missing} ${plural(missing, "answer")} missing` : "nothing missing"}`,
      next: fill.read > 0
        ? "We read the file into a table. Fill in the cells marked needed, take off anything that is not a loan, then save."
        : "The schedule still has answers missing. Fill in the cells marked needed, then save.",
    };
  }

  const flagged = files.filter((file) => FLAGGED.has(file.ai_decision));
  const reading = files.filter((file) => file.ai_decision === "processing");
  const allAccepted = files.length > 0 && files.every((file) => file.ai_decision === "accepted");

  if (status === "stale") {
    return {
      group: "client", kind: "out_of_date", label: "Out of date", tone: "warn", owner: "client",
      progress: null,
      short: "Older than the program allows",
      next: "What the client sent is older than the program allows. Ask for a current copy.",
    };
  }

  if (!files.length) {
    if (status === "received_unverified") return { group: "you", kind: "review", label: "Needs your review", tone: "warn", owner: "you", progress: progressOf(readCoverage(requirement.coverage)), short: "Information received · needs team review", next: sentence(requirement.state_reason) || "Information has been received. Your team needs to review it before this requirement can be completed." };
    const asked = askedOn(requirement.last_requested_at);
    if (status === "requested") {
      return {
        group: "client", kind: "waiting", label: "Waiting on the client", tone: "mut", owner: "client",
        progress: progressOf(readCoverage(requirement.coverage)),
        short: asked ? `Asked ${asked} · nothing yet` : "Asked · nothing yet",
        next: asked ? `Asked ${asked}. Nothing has arrived yet.` : "Asked. Nothing has arrived yet.",
      };
    }
    return {
      group: "client", kind: "not_asked", label: "Not asked yet", tone: "mut", owner: "client",
      progress: progressOf(readCoverage(requirement.coverage)),
      short: "Not requested from the client yet",
      next: "Nothing has been requested from the client for this yet.",
    };
  }

  if (reading.length) {
    return {
      group: "ai", kind: "reading", label: "AI is reading", tone: "acc", owner: "ai",
      progress: progressOf(readCoverage(requirement.verified_coverage)),
      short: `Reading ${reading.length} ${plural(reading.length, "file")}`,
      next: `The AI is reading ${reading.length} ${plural(reading.length, "file")} now. This updates by itself, usually within a couple of minutes.`,
    };
  }

  // A file a person already rejected is not waiting on a person any more: the
  // client owes a replacement (or the team fills the form in). Only what the AI
  // itself could not accept is waiting on the underwriter.
  const staffFlagged = flagged.filter((file) => file.decision_actor === "staff");
  const aiFlagged = flagged.filter((file) => file.decision_actor !== "staff");

  if (!aiFlagged.length && staffFlagged.length) {
    const why = sentence(staffFlagged.find((file) => file.ai_explanation)?.ai_explanation);
    return {
      group: "client", kind: "replace", label: "New file needed", tone: "warn", owner: "client",
      progress: progressOf(readCoverage(requirement.verified_coverage)),
      short: "Your team asked for another copy",
      next: `${staffFlagged.length > 1 ? "Your team rejected these files" : "Your team rejected this file"}.${why ? ` ${why}` : ""} The client needs to send another, or you can fill it in yourself.`,
    };
  }

  if (aiFlagged.length || status === "failed") {
    const why = sentence(aiFlagged.find((file) => file.ai_explanation)?.ai_explanation ?? (status === "failed" ? requirement.state_reason : ""));
    const lead = aiFlagged.length > 1
      ? `The AI could not accept ${aiFlagged.length} of the ${files.length} files.`
      : aiFlagged.length === 1 && files.length > 1
        ? "The AI could not accept one of the files."
        : "The AI could not accept this file.";
    return {
      group: "you", kind: status === "failed" && !aiFlagged.length ? "not_accepted" : "review",
      label: status === "failed" && !aiFlagged.length ? "Not accepted" : "Needs your review",
      tone: "warn", owner: "you",
      progress: progressOf(readCoverage(requirement.verified_coverage)),
      short: aiFlagged.length > 1 ? `The AI could not accept ${aiFlagged.length} files` : "The AI could not accept the file",
      next: `${lead}${why ? ` ${why}` : ""} Preview it, then accept it anyway, move it to the right item, or ask the client for another.`,
    };
  }

  // Every file is accepted by the AI from here on. Short of what is required
  // means the client still owes the rest; otherwise only a person is missing.
  const matched = readCoverage(requirement.coverage);
  if (matched && matched.current < matched.required) {
    return {
      group: "client", kind: "partial", label: "Waiting on the client", tone: "mut", owner: "client",
      progress: progressOf(matched),
      short: `${progressOf(matched)?.text} so far`,
      next: `${progressOf(matched)?.text} accepted so far. The client still needs to send the rest.`,
    };
  }

  if (requirement.verification_required && allAccepted && !files.every((file) => file.verified)) {
    return {
      group: "you", kind: "signoff", label: "Ready for your sign-off", tone: "warn", owner: "you",
      progress: progressOf(matched),
      short: "The AI accepted it · needs your sign-off",
      next: "The AI read the file and it looks right. This item needs a person to confirm it before it counts.",
    };
  }

  if (/run ai review/i.test(requirement.state_reason ?? "")) {
    return {
      group: "you", kind: "not_run", label: "AI review not run", tone: "warn", owner: "you",
      progress: progressOf(matched),
      short: "The document checks have not run",
      next: "The file is in, but its document checks have not run yet. Refresh the AI review.",
    };
  }

  return {
    group: "ai", kind: "checking", label: "AI is finishing", tone: "acc", owner: "ai",
    progress: progressOf(matched),
    short: "Finishing the checks",
    next: "The AI accepted the files and is finishing its checks. This updates by itself.",
  };
}

export type TriageGroupCounts = Record<TriageGroup, number> & { total: number };

export function triageCounts<T extends TriageInput>(requirements: T[], extras?: (requirement: T) => TriageExtra | undefined): TriageGroupCounts {
  const counts: TriageGroupCounts = { you: 0, client: 0, ai: 0, done: 0, total: 0 };
  for (const requirement of requirements) {
    counts[triageRequirement(requirement, extras?.(requirement)).group] += 1;
    counts.total += 1;
  }
  return counts;
}

const KIND_URGENCY: TriageKind[] = [
  "fill", "review", "not_accepted", "signoff", "not_run", "out_of_date", "replace", "partial", "waiting", "not_asked", "reading", "checking", "complete", "overridden", "not_needed",
];

const LEVEL_ORDER: Record<string, number> = { required: 0, recommended: 1, optional: 2 };

export type TriagedRequirement<T extends TriageInput> = { requirement: T; triage: Triage };

export type TriageSection<T extends TriageInput> = {
  group: TriageGroup;
  title: string;
  blurb: string;
  items: TriagedRequirement<T>[];
};

/** The requirements in the four groups, most urgent first within each. Empty groups are dropped. */
export function groupRequirements<T extends TriageInput>(requirements: T[], extras?: (requirement: T) => TriageExtra | undefined): TriageSection<T>[] {
  const triaged = requirements.map((requirement) => ({ requirement, triage: triageRequirement(requirement, extras?.(requirement)) }));
  return GROUP_ORDER.map((group) => ({
    group,
    title: GROUPS[group].title,
    blurb: GROUPS[group].blurb,
    items: triaged
      .filter((item) => item.triage.group === group)
      .map((item, index) => ({ item, index }))
      .sort((a, b) =>
        (LEVEL_ORDER[a.item.requirement.required_level ?? "required"] ?? 0) - (LEVEL_ORDER[b.item.requirement.required_level ?? "required"] ?? 0)
        || KIND_URGENCY.indexOf(a.item.triage.kind) - KIND_URGENCY.indexOf(b.item.triage.kind)
        || a.index - b.index,
      )
      .map(({ item }) => item),
  })).filter((section) => section.items.length > 0);
}

/** One plain sentence for the top of the tab. */
export function triageSummary(counts: TriageGroupCounts): string {
  if (!counts.total) return "Nothing is required on this file yet.";
  const parts: string[] = [];
  if (counts.you) parts.push(`${counts.you} ${plural(counts.you, "item needs", "items need")} you`);
  if (counts.client) parts.push(`${counts.client} ${plural(counts.client, "item is", "items are")} waiting on the client`);
  if (counts.ai) parts.push(`the AI is working on ${counts.ai}`);
  if (!parts.length) return `All ${counts.total} ${plural(counts.total, "item is", "items are")} complete.`;
  const text = parts.join(", ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}. ${counts.done} of ${counts.total} complete.`;
}
