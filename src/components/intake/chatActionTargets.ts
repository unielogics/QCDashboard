// Pure "which target does this chat action open" decision, shared by every
// page that renders the AI's secure-document buttons (dealer-ai-underwriter,
// client/dealer-intakes, funding-review, mca-refinance-intake).
//
// Nothing here touches React, the DOM or `window`: the pages do the actual
// `window.open` / inline-modal work with the answer this module gives them,
// which keeps the rule testable under vitest's node runner.

import type { Lang } from "@/lib/intakeCopy";

export type ChatActionType =
  | "upload_own"
  | "complete_now"
  | "download_template"
  | "email_template"
  | "open_worksheet";

/** Form kinds a page can draft inline (modal) instead of opening a link. */
export type InlineDocKind = "pfs" | "debt_schedule";

export type ChatActionTarget =
  | { kind: "inline"; docKind: InlineDocKind }
  | { kind: "open"; url: string }
  | { kind: "none" };

export type ChatActionTargetInput = {
  action_type: ChatActionType | string;
  requirement_key: string;
};

export type ChatActionResultInput = {
  form_url?: string | null;
  room_url?: string | null;
} | null | undefined;

/** Requirement keys that map onto an inline-draftable form kind. */
export const INLINE_DOC_KIND_BY_REQUIREMENT: Readonly<Record<string, InlineDocKind>> = {
  owner_personal_financial_statement: "pfs",
  business_debt_schedule: "debt_schedule",
};

export function inlineDocKindFor(requirementKey: string): InlineDocKind | null {
  return INLINE_DOC_KIND_BY_REQUIREMENT[requirementKey] ?? null;
}

function nonEmpty(value: string | null | undefined): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
}

/**
 * Decide what a page should do once a chat action has executed.
 *
 * - `complete_now`: when the page drafts that form kind inline (`inlineKinds`
 *   lists pfs and/or debt_schedule) keep the inline modal; otherwise open
 *   `result.form_url`, falling back to `result.room_url` for responses from
 *   older backends that only carried the room link.
 * - `open_worksheet`: open `result.form_url`. There is no room fallback: the
 *   room does not open the worksheet, so sending the client there would lie.
 * - everything else (`upload_own`, `download_template`, `email_template`,
 *   unknown types): the page handles it itself; nothing to open.
 */
export function resolveChatActionTarget(
  action: ChatActionTargetInput,
  result: ChatActionResultInput,
  options: { inlineKinds?: readonly InlineDocKind[] } = {},
): ChatActionTarget {
  const inlineKinds = options.inlineKinds ?? [];
  if (action.action_type === "complete_now") {
    const docKind = inlineDocKindFor(action.requirement_key);
    if (docKind && inlineKinds.includes(docKind)) return { kind: "inline", docKind };
    const url = nonEmpty(result?.form_url) ?? nonEmpty(result?.room_url);
    return url ? { kind: "open", url } : { kind: "none" };
  }
  if (action.action_type === "open_worksheet") {
    const url = nonEmpty(result?.form_url);
    return url ? { kind: "open", url } : { kind: "none" };
  }
  return { kind: "none" };
}

/** The one-time PIN sentence for the status line, or null when there is no code. */
export function accessCodeNotice(accessCode: string | null | undefined, lang: Lang = "en"): string | null {
  const code = nonEmpty(accessCode);
  if (!code) return null;
  return lang === "es"
    ? `El PIN de su hoja de trabajo es ${code}. Se muestra una sola vez.`
    : `Your worksheet PIN is ${code}. It is shown only once.`;
}

export type ChatActionStatusInput = {
  detail: string;
  delivery?: { recipient_masked?: string | null } | null;
  access_code?: string | null;
};

/**
 * Text for the page's existing status line after an action runs: the
 * backend's detail, the masked email recipient when a template was emailed
 * (unchanged from before), and the PIN sentence when the result carries one.
 */
export function chatActionStatusText(result: ChatActionStatusInput, lang: Lang = "en"): string {
  const recipient = nonEmpty(result.delivery?.recipient_masked);
  const base = recipient ? `${result.detail} Recipient: ${recipient}.` : result.detail;
  const pin = accessCodeNotice(result.access_code, lang);
  return pin ? `${base} ${pin}`.trim() : base;
}
