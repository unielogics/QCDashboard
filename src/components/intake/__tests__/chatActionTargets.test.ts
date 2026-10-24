import { describe, expect, it } from "vitest";
import {
  INLINE_DOC_KIND_BY_REQUIREMENT,
  accessCodeNotice,
  chatActionStatusText,
  inlineDocKindFor,
  resolveChatActionTarget,
  type InlineDocKind,
} from "@/components/intake/chatActionTargets";

const PFS = "owner_personal_financial_statement";
const DEBT = "business_debt_schedule";
const PL_BS = "ytd_p_and_l_balance_sheet";

const BOTH_INLINE: readonly InlineDocKind[] = ["pfs", "debt_schedule"];
const FORM = "https://app.example.com/forms/pfs/tok";
const WORKSHEET = "https://app.example.com/forms/worksheet/tok";
const ROOM = "https://app.example.com/room/abc?x=1";

describe("inline form kinds", () => {
  it("maps the two inline-draftable requirements and nothing else", () => {
    expect(INLINE_DOC_KIND_BY_REQUIREMENT).toEqual({ [PFS]: "pfs", [DEBT]: "debt_schedule" });
    expect(inlineDocKindFor(PFS)).toBe("pfs");
    expect(inlineDocKindFor(DEBT)).toBe("debt_schedule");
    expect(inlineDocKindFor(PL_BS)).toBeNull();
    expect(inlineDocKindFor("")).toBeNull();
  });
});

describe("resolveChatActionTarget: complete_now", () => {
  it("keeps the inline PFS / debt schedule forms on pages that have them", () => {
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, { form_url: FORM, room_url: ROOM }, { inlineKinds: BOTH_INLINE }))
      .toEqual({ kind: "inline", docKind: "pfs" });
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: DEBT }, { form_url: FORM, room_url: ROOM }, { inlineKinds: BOTH_INLINE }))
      .toEqual({ kind: "inline", docKind: "debt_schedule" });
  });

  it("only inlines the kinds the page actually drafts", () => {
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: DEBT }, { form_url: FORM }, { inlineKinds: ["pfs"] }))
      .toEqual({ kind: "open", url: FORM });
  });

  it("opens the worksheet link for the P&L + balance sheet even on inline pages", () => {
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PL_BS }, { form_url: WORKSHEET, room_url: ROOM }, { inlineKinds: BOTH_INLINE }))
      .toEqual({ kind: "open", url: WORKSHEET });
  });

  it("opens form_url on pages without inline forms", () => {
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, { form_url: FORM, room_url: ROOM }))
      .toEqual({ kind: "open", url: FORM });
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, { form_url: FORM, room_url: ROOM }, { inlineKinds: [] }))
      .toEqual({ kind: "open", url: FORM });
  });

  it("falls back to room_url when an older backend sent no form_url", () => {
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, { room_url: ROOM })).toEqual({ kind: "open", url: ROOM });
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, { form_url: null, room_url: ROOM })).toEqual({ kind: "open", url: ROOM });
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, { form_url: "   ", room_url: ROOM })).toEqual({ kind: "open", url: ROOM });
  });

  it("does nothing when neither link is present", () => {
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, {})).toEqual({ kind: "none" });
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, null)).toEqual({ kind: "none" });
    expect(resolveChatActionTarget({ action_type: "complete_now", requirement_key: PFS }, undefined)).toEqual({ kind: "none" });
  });
});

describe("resolveChatActionTarget: open_worksheet", () => {
  it("opens form_url regardless of inline kinds or requirement", () => {
    expect(resolveChatActionTarget({ action_type: "open_worksheet", requirement_key: PFS }, { form_url: WORKSHEET, room_url: ROOM }, { inlineKinds: BOTH_INLINE }))
      .toEqual({ kind: "open", url: WORKSHEET });
    expect(resolveChatActionTarget({ action_type: "open_worksheet", requirement_key: PL_BS }, { form_url: WORKSHEET }))
      .toEqual({ kind: "open", url: WORKSHEET });
  });

  it("never falls back to the room link", () => {
    expect(resolveChatActionTarget({ action_type: "open_worksheet", requirement_key: PFS }, { room_url: ROOM })).toEqual({ kind: "none" });
    expect(resolveChatActionTarget({ action_type: "open_worksheet", requirement_key: PFS }, null)).toEqual({ kind: "none" });
  });
});

describe("resolveChatActionTarget: other actions", () => {
  it.each(["upload_own", "download_template", "email_template", "something_new"])("%s opens nothing even when links are present", (actionType) => {
    expect(resolveChatActionTarget({ action_type: actionType, requirement_key: PFS }, { form_url: FORM, room_url: ROOM }, { inlineKinds: BOTH_INLINE }))
      .toEqual({ kind: "none" });
  });
});

describe("accessCodeNotice", () => {
  it("is empty without a code", () => {
    expect(accessCodeNotice(null)).toBeNull();
    expect(accessCodeNotice(undefined, "es")).toBeNull();
    expect(accessCodeNotice("", "en")).toBeNull();
    expect(accessCodeNotice("  ", "en")).toBeNull();
  });

  it("renders the one-time PIN sentence in English and Spanish", () => {
    expect(accessCodeNotice("482913")).toBe("Your worksheet PIN is 482913. It is shown only once.");
    expect(accessCodeNotice("482913", "en")).toBe("Your worksheet PIN is 482913. It is shown only once.");
    expect(accessCodeNotice("482913", "es")).toBe("El PIN de su hoja de trabajo es 482913. Se muestra una sola vez.");
  });
});

describe("chatActionStatusText", () => {
  it("keeps the detail alone when there is no recipient and no code", () => {
    expect(chatActionStatusText({ detail: "Opened." })).toBe("Opened.");
    expect(chatActionStatusText({ detail: "Opened.", delivery: null, access_code: null })).toBe("Opened.");
  });

  it("keeps the existing masked-recipient suffix for emailed templates", () => {
    expect(chatActionStatusText({ detail: "Template emailed.", delivery: { recipient_masked: "f***@u***.com" } }))
      .toBe("Template emailed. Recipient: f***@u***.com.");
  });

  it("appends the PIN sentence once, in the page language", () => {
    expect(chatActionStatusText({ detail: "Worksheet ready.", access_code: "1234" }))
      .toBe("Worksheet ready. Your worksheet PIN is 1234. It is shown only once.");
    expect(chatActionStatusText({ detail: "Hoja lista.", access_code: "1234" }, "es"))
      .toBe("Hoja lista. El PIN de su hoja de trabajo es 1234. Se muestra una sola vez.");
    expect(chatActionStatusText({ detail: "Sent.", delivery: { recipient_masked: "a***@b.com" }, access_code: "9" }))
      .toBe("Sent. Recipient: a***@b.com. Your worksheet PIN is 9. It is shown only once.");
  });
});
