// Pure "which target does this chat action open" decision, shared by every
// page that renders the AI's secure-document buttons (dealer-ai-underwriter,
// client/dealer-intakes, funding-review, mca-refinance-intake).
//
// Nothing here touches React, the DOM or `window`: the pages do the actual
// `window.open` / inline-modal work with the answer this module gives them,
// which keeps the rule testable under vitest's node runner.

import type { Lang } from "@/lib/intakeCopy";
import { APP_ORIGIN } from "@/lib/appUrl";

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

/** The server-issued form link carries the correct family, draft and versions. */
function canonicalFinancialFormUrl(value: string | null | undefined, requirementKey: string, worksheetOnly = false): string | null {
  const raw = nonEmpty(value);
  if (!raw) return null;
  try {
    const origin = new URL(APP_ORIGIN);
    const url = new URL(raw, origin);
    if (url.origin !== origin.origin || !["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const match = /^\/forms\/(pfs|debt_schedule|p_and_l|balance_sheet|real_estate_schedule|worksheet|packet)\/[^/]+\/?$/.exec(url.pathname);
    if (!match || worksheetOnly && match[1] !== "worksheet") return null;
    const expected = inlineDocKindFor(requirementKey);
    if (expected && ![expected, "worksheet", "packet"].includes(match[1])) return null;
    return raw.startsWith("/") ? raw : url.toString();
  } catch { return null; }
}

/**
 * Decide what a page should do once a chat action has executed.
 *
 * - `complete_now`: open a validated canonical form link when supplied so the
 *   client sees the imported working rows and saves dated versions. Older
 *   responses without one retain the inline modal or room-link fallback.
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
    const formUrl = canonicalFinancialFormUrl(result?.form_url, action.requirement_key);
    if (formUrl) return { kind: "open", url: formUrl };
    const docKind = inlineDocKindFor(action.requirement_key);
    if (docKind && inlineKinds.includes(docKind)) return { kind: "inline", docKind };
    const url = nonEmpty(result?.room_url);
    return url ? { kind: "open", url } : { kind: "none" };
  }
  if (action.action_type === "open_worksheet") {
    const url = canonicalFinancialFormUrl(result?.form_url, action.requirement_key, true);
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
