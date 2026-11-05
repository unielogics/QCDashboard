// The desk's words for SMS consent: who agreed, how, and what that means for
// texting this client. The proof itself is stored by qcbackend
// (`dos_sms_consent`); this only says it.

export type SmsGrantLike = {
  consent_kind: string;
  granted: boolean;
  method: string;
  consenter_name: string | null;
  captured_by_name: string | null;
  created_at: string;
  revoked_at: string | null;
};

export type SmsStateLike = {
  phone: string | null;
  can_send: boolean;
  transactional_consented: boolean;
  marketing_consented?: boolean;
  opted_out: boolean;
  provider_available: boolean;
  onboarding_choice?: { transactional: boolean; marketing: boolean; asked_at: string | null } | null;
};

export function consentKindLabel(kind: string): string {
  return kind === "marketing" ? "Marketing messages" : "Application messages";
}

function dated(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/** One grant as a sentence: who agreed, how it was recorded, when. */
export function grantWords(grant: SmsGrantLike): string {
  const who = grant.consenter_name || "the client";
  const when = dated(grant.created_at);
  const how =
    grant.method === "self_web"
      ? `Agreed by ${who} on the application`
      : grant.method === "in_person_device"
        ? `Agreed by ${who} on a rep's device`
        : `Recorded by ${grant.captured_by_name || "a rep"} for ${who}`;
  const base = when ? `${how} · ${when}` : how;
  return grant.revoked_at ? `${base} · withdrawn ${dated(grant.revoked_at)}` : base;
}

/** The grants that still count, newest first. */
export function activeGrants<T extends SmsGrantLike>(grants: T[] | null | undefined): T[] {
  return (grants ?? [])
    .filter((grant) => grant.granted && !grant.revoked_at)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** Where texting this client stands, in a few words, with a tone for the chip. */
export function smsStatusWords(state: SmsStateLike | null | undefined): { text: string; tone: "ok" | "warn" | "bad" | "mut" } {
  if (!state) return { text: "Checking text consent", tone: "mut" };
  if (!state.phone) return { text: "No mobile number on file", tone: "mut" };
  if (state.opted_out) return { text: "Opted out of texts", tone: "bad" };
  if (state.transactional_consented) {
    return state.can_send || state.provider_available
      ? { text: "Consent on file", tone: "ok" }
      : { text: "Consent on file, SMS unavailable", tone: "warn" };
  }
  if (state.onboarding_choice && !state.onboarding_choice.transactional) {
    return { text: "Declined texts when they started", tone: "warn" };
  }
  return { text: "No consent yet", tone: "warn" };
}
