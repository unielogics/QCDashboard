import type { ApplicationRequirementEvidence } from "./applicationProfile";
import type { DocumentAssociation, DocumentAssociationAction } from "./documentAssociation";
import { evidenceDecisionLabel, evidenceDecisionTone, evidenceReasonLabel } from "./evidenceDecision";

// What the evidence review screen says about one file, and what the reviewer
// can do about it. A file carries two separate decisions: whether it counts for
// a checklist item (approve / reject), and whether it belongs to this file's
// business at all (same business / different business). Each gets one plain
// sentence and its own buttons, so neither is hidden behind an icon.

type Tone = "ok" | "acc" | "warn" | "bad" | "mut";

/** approve = sign off an accepted file; approve_anyway = accept what the AI did not. */
export type ReviewChoice = "approve" | "approve_anyway" | "reject" | "retry" | "attach";

export type ReviewDecisionState = {
  chip: string;
  tone: Tone;
  /** What is true now and what, if anything, is asked of the reviewer. */
  sentence: string;
  /** The recorded reason, when one explains the state. */
  reason: string | null;
  choices: ReviewChoice[];
  /** The decision still waits on a person. */
  open: boolean;
};

type DecisionFacts = Pick<ApplicationRequirementEvidence, "ai_decision" | "decision_actor" | "verified" | "ai_reason_code" | "ai_explanation">;

const sentenceEnd = (text: string) => /[.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;

export function reviewDecisionState({ decision, requirementLabel, verificationRequired, locked, headline, explanation, analysisNote, analysisFailed = false }: {
  decision: DecisionFacts | null;
  requirementLabel: string | null;
  /** The checklist item needs a person's approval on top of the AI's acceptance. */
  verificationRequired: boolean;
  locked?: { title: string; explanation: string } | null;
  /** The review's own wording of why, from `evidenceReviewPresentation`. */
  headline?: string | null;
  explanation?: string | null;
  /** What the AI made of a file that is on no checklist item. */
  analysisNote?: string | null;
  /** The AI could not read a file that is on no checklist item. */
  analysisFailed?: boolean;
}): ReviewDecisionState {
  const item = requirementLabel || "this checklist item";
  if (!decision) {
    return {
      chip: "Not on the checklist", tone: "mut",
      sentence: "This file is not attached to a checklist item, so there is nothing to approve yet. Attach it to the item it supports.",
      reason: analysisNote?.trim() ? sentenceEnd(analysisNote) : null,
      choices: analysisFailed && !locked ? ["retry", "attach"] : ["attach"], open: false,
    };
  }
  if (locked) {
    return {
      chip: locked.title, tone: "warn",
      sentence: `${sentenceEnd(locked.explanation)} The AI cannot read it, so it cannot count for ${item} until an unlocked copy arrives.`,
      reason: null, choices: ["reject"], open: false,
    };
  }
  const why = [headline, explanation].filter(Boolean).map((part) => sentenceEnd(part as string)).join(" ") || null;
  const staff = decision.decision_actor === "staff";
  if (decision.ai_decision === "accepted") {
    if (verificationRequired && !decision.verified) {
      return {
        chip: "Needs your approval", tone: "warn",
        sentence: `${staff ? "A team member accepted" : "The AI accepted"} this file for ${item}. This item also needs a person to approve it.`,
        reason: null, choices: ["approve", "reject"], open: true,
      };
    }
    return {
      chip: evidenceDecisionLabel("accepted", decision.decision_actor), tone: "ok",
      sentence: staff
        ? `A team member approved this file for ${item}. Nothing more is needed.`
        : `Accepted for ${item}. Nothing more is needed unless you disagree.`,
      reason: staff && decision.ai_explanation ? sentenceEnd(decision.ai_explanation) : null,
      choices: ["reject"], open: false,
    };
  }
  if (decision.ai_decision === "processing") {
    return {
      chip: evidenceDecisionLabel("processing"), tone: evidenceDecisionTone("processing"),
      sentence: "The AI is still reading this file. This screen updates on its own.",
      reason: null, choices: ["approve_anyway", "reject"], open: false,
    };
  }
  if (decision.ai_decision === "failed") {
    return {
      chip: evidenceDecisionLabel("failed"), tone: "warn",
      sentence: `The AI could not read this file, so it has not been checked for ${item}.`,
      reason: decision.ai_explanation ? sentenceEnd(decision.ai_explanation) : null,
      choices: ["retry", "approve_anyway", "reject"], open: true,
    };
  }
  if (decision.ai_decision === "rejected" && staff) {
    const label = evidenceReasonLabel(decision.ai_reason_code, decision.ai_decision);
    return {
      chip: evidenceDecisionLabel("rejected", "staff"), tone: "warn",
      sentence: `A team member rejected this file for ${item}.`,
      reason: [label, decision.ai_explanation].filter(Boolean).map((part) => sentenceEnd(part as string)).join(" ") || null,
      choices: ["approve_anyway"], open: false,
    };
  }
  return {
    chip: evidenceDecisionLabel(decision.ai_decision, decision.decision_actor), tone: "warn",
    sentence: `The AI could not accept this file for ${item}. Approve it if it is right, or reject it.`,
    reason: why, choices: ["approve_anyway", "reject"], open: true,
  };
}

/** same / different answer the question; change reopens an answer; view only reads it. */
export type BusinessNameChoice = "same" | "different" | "change" | "view";

export type BusinessNameState = {
  chip: string;
  tone: Tone;
  sentence: string;
  /** What the answer does to the file's numbers, or the recorded reason. */
  note: string | null;
  choices: BusinessNameChoice[];
  /** The answer still waits on a person. */
  open: boolean;
};

export const businessNameAction = (choice: BusinessNameChoice): DocumentAssociationAction | null =>
  choice === "same" ? "accept" : choice === "different" ? "deny" : null;

const shortDate = (at: string) => {
  const parsed = new Date(at);
  return Number.isNaN(parsed.valueOf()) ? at : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

/**
 * The business-name question for one document, or null when there is nothing to
 * show: the name matched on its own, or the document carries no name to compare.
 */
export function businessNameState(record: DocumentAssociation | null | undefined, { reasonCode, decision, canAnswer, includeMatched = false, formatDate = shortDate }: {
  reasonCode?: string | null;
  decision?: string | null;
  canAnswer: boolean;
  /** Also show a name that matched on its own, where the screen has no other way to change it. */
  includeMatched?: boolean;
  formatDate?: (at: string) => string;
}): BusinessNameState | null {
  if (!record) {
    const code = reasonCode?.trim().toLowerCase();
    if (decision !== "accepted" || (code !== "entity_mismatch_warning" && code !== "entity_unconfirmed_warning")) return null;
    return {
      chip: code === "entity_mismatch_warning" ? "Business name differs" : "Business name not confirmed", tone: "warn",
      sentence: "The business name on this document could not be matched to this file's business.",
      note: null, choices: ["view"], open: true,
    };
  }
  const expected = record.expected_entity?.trim() || "this file's business";
  const names = record.observed_entities.map((name) => name.trim()).filter(Boolean).join("; ");
  if (record.status === "matched") {
    if (!includeMatched) return null;
    return {
      chip: "Business name matches", tone: "ok",
      sentence: names ? `The document names ${names}, the same business as this file.` : "The business name on this document matches this file.",
      note: null, choices: canAnswer && record.can_review ? ["change"] : [], open: false,
    };
  }
  const answers: BusinessNameChoice[] = canAnswer && record.can_review ? ["same", "different"] : ["view"];
  const figures = record.allows_financial_use
    ? "Its figures are being used for now."
    : "Its figures are left out of this file's numbers until someone answers.";
  if (record.status === "accepted" || record.status === "denied") {
    const event = record.current_decision;
    const who = event?.actor_name?.trim() || "A team member";
    const when = event?.at ? ` on ${formatDate(event.at)}` : "";
    return {
      chip: record.status === "accepted" ? "Same business" : "Different business",
      tone: record.status === "accepted" ? "ok" : "bad",
      sentence: record.status === "accepted"
        ? `${who} confirmed this document belongs to ${expected}${when}.`
        : `${who} marked this document as a different business${when}. Its figures are left out of this file's numbers.`,
      note: event?.reason ? `Reason: ${sentenceEnd(event.reason)}` : null,
      choices: canAnswer && record.can_review ? ["change"] : ["view"],
      open: false,
    };
  }
  if (record.status === "stale") {
    return {
      chip: "Business name needs a new answer", tone: "warn",
      sentence: `The document or this file's business changed after the last answer. ${names ? `The document names ${names}; this file's business is ${expected}. ` : ""}Is it the same business?`,
      note: figures, choices: answers, open: true,
    };
  }
  if (record.status === "unconfirmed") {
    return {
      chip: "Business name not confirmed", tone: "warn",
      sentence: names
        ? `The document names ${names}. That could not be matched to ${expected}. Is it the same business?`
        : `No business name could be read from this document. Does it belong to ${expected}?`,
      note: figures, choices: answers, open: true,
    };
  }
  return {
    chip: "Business name differs", tone: "warn",
    sentence: names
      ? `The document names ${names}. This file's business is ${expected}. Is it the same business?`
      : `The name on this document does not match ${expected}. Is it the same business?`,
    note: figures, choices: answers, open: true,
  };
}

/** One-click reasons for the answer; the reviewer can still write their own. */
export const BUSINESS_NAME_REASONS: Record<DocumentAssociationAction, string[]> = {
  accept: [
    "Same business; its name is written differently on this document",
    "A trade name (DBA) of this business",
    "An earlier or legal name of this business",
  ],
  deny: [
    "A different business from this file's",
    "A personal document, not the business's",
    "A related company, not this business",
  ],
  reset: ["Answered by mistake; use the automatic check again"],
};

/** One-click reasons for rejecting a file, by what is wrong with it. */
export const REJECT_REASONS: Record<string, string> = {
  wrong_document: "This is not the document this item asks for",
  wrong_entity: "This document is for a different business",
  wrong_period: "This covers the wrong dates for this item",
  incomplete: "Pages or sections are missing",
  unreadable: "The file cannot be read clearly",
  duplicate: "The same document is already on this file",
};

/** One-click reasons for approving a file the AI did not accept. */
export const APPROVE_REASONS = [
  "I read the document and it meets this item",
  "The client confirmed this is the right document",
];

/** The shortest reason the API keeps for a recorded decision. */
export const MIN_REASON_LENGTH = 8;
export const reasonLongEnough = (reason: string) => reason.trim().length >= MIN_REASON_LENGTH;
