// The online forms a requirement can collect, read from the backend registry
// (GET /form-kinds, app/services/form_kinds.py). A form row's
// collection_config names the form and, for a form that can be signed, the
// signature at its end.

export type SignatureConfig = {
  required: boolean;
  signers: string[];
  consents: string[];
  satisfies: string[];
  credit_reuse_days?: number;
};

export type FormKindInfo = {
  key: string;
  label: string;
  slot_category: string;
  category: string;
  engine: string;
  requirement_keys: string[];
  chat_complete_now: boolean;
  requestable: boolean;
  signable: boolean;
  default_signature: Partial<SignatureConfig> | null;
};

export type ConsentInfo = { key: string; label: string; version: string; text: string; sha256: string; draft: boolean };

export type FormKindCatalog = {
  kinds: FormKindInfo[];
  consents: ConsentInfo[];
  satisfiers: { key: string; consent: string }[];
  signer_roles: string[];
  max_credit_reuse_days: number;
};

export const CREDIT_SATISFIER = "signed_credit_authorization";
export const CREDIT_CONSENT = "credit_authorization";

/** A signature for a kind, starting from its defaults (e-signature consent always kept). */
export function defaultSignature(kind: FormKindInfo): SignatureConfig {
  const base = kind.default_signature || {};
  const consents = Array.from(new Set([...(base.consents || []), "esign"]));
  return {
    required: true,
    signers: base.signers?.length ? base.signers : ["borrower"],
    consents,
    satisfies: (base.satisfies || []).filter((key) => key !== CREDIT_SATISFIER || consents.includes(CREDIT_CONSENT)),
    ...(typeof base.credit_reuse_days === "number" ? { credit_reuse_days: base.credit_reuse_days } : {}),
  };
}

/** Turn one consent on or off; e-signature stays, and dropping the credit
 *  authorization also drops "counts as the credit authorization". */
export function toggleConsent(signature: SignatureConfig, key: string, on: boolean): SignatureConfig {
  if (key === "esign") return signature;
  const consents = on ? Array.from(new Set([...signature.consents, key])) : signature.consents.filter((item) => item !== key);
  const satisfies = key === CREDIT_CONSENT && !on ? signature.satisfies.filter((item) => item !== CREDIT_SATISFIER) : signature.satisfies;
  return { ...signature, consents, satisfies };
}

/** "Also counts as the credit authorization": needs the credit consent, so turning it on adds it. */
export function setCountsAsCredit(signature: SignatureConfig, on: boolean): SignatureConfig {
  if (!on) return { ...signature, satisfies: signature.satisfies.filter((item) => item !== CREDIT_SATISFIER) };
  return {
    ...signature,
    consents: Array.from(new Set([...signature.consents, CREDIT_CONSENT])),
    satisfies: Array.from(new Set([...signature.satisfies, CREDIT_SATISFIER])),
  };
}

export function setCoborrower(signature: SignatureConfig, on: boolean): SignatureConfig {
  return { ...signature, signers: on ? ["borrower", "coborrower"] : ["borrower"] };
}
