import { describe, expect, it } from "vitest";

import { formKindOf, newFormRequirement, signatureOf, withSignature } from "@/components/settings/fundingProgramEditorModel";
import { CREDIT_SATISFIER, defaultSignature, setCoborrower, setCountsAsCredit, toggleConsent, type FormKindInfo } from "@/lib/formKinds";

const application: FormKindInfo = {
  key: "re_application", label: "Real estate loan application", slot_category: "Application", category: "borrower_info",
  engine: "client_form", requirement_keys: ["signed_re_application"], chat_complete_now: true, requestable: true, signable: true,
  default_signature: { signers: ["borrower"], consents: ["business_purpose", "accuracy", "credit_authorization", "information_sharing"], satisfies: [CREDIT_SATISFIER] },
};
const pfs: FormKindInfo = { ...application, key: "pfs", label: "Personal financial statement", category: "financials", engine: "financial_workspace", requirement_keys: ["owner_personal_financial_statement"], signable: false, default_signature: null };

describe("online form rows in the program editor", () => {
  it("adds a form row that names its form and, when it can be signed, its signature", () => {
    const row = newFormRequirement(application, []);
    expect(row.requirement_key).toBe("signed_re_application");
    expect(row.requirement_kind).toBe("form");
    expect(row.category).toBe("borrower_info");
    expect(formKindOf(row)).toBe("re_application");
    expect(signatureOf(row)).toEqual({ required: true, signers: ["borrower"], consents: ["business_purpose", "accuracy", "credit_authorization", "information_sharing", "esign"], satisfies: [CREDIT_SATISFIER] });

    const financial = newFormRequirement(pfs, [row]);
    expect(financial.collection_config).toEqual({ form_kind: "pfs" });
    expect(signatureOf(financial)).toBeNull();
  });

  it("turns a signature off and on without losing the form's other settings", () => {
    const row = { ...newFormRequirement(application, []), collection_config: { form_kind: "re_application", evidence_classes: ["re_application"], signature: defaultSignature(application) } };
    const off = withSignature(row, null);
    expect(off.collection_config).toEqual({ form_kind: "re_application", evidence_classes: ["re_application"] });
    expect(signatureOf(withSignature(off, defaultSignature(application)))?.satisfies).toEqual([CREDIT_SATISFIER]);
  });
});

describe("signature choices", () => {
  const signature = defaultSignature(application);

  it("keeps the e-signature consent and drops the credit link with the credit consent", () => {
    expect(toggleConsent(signature, "esign", false)).toBe(signature);
    const withoutCredit = toggleConsent(signature, "credit_authorization", false);
    expect(withoutCredit.consents).not.toContain("credit_authorization");
    expect(withoutCredit.satisfies).not.toContain(CREDIT_SATISFIER);
  });

  it("counting as the credit authorization brings its consent along", () => {
    const bare = { required: true, signers: ["borrower"], consents: ["esign"], satisfies: [] };
    const counted = setCountsAsCredit(bare, true);
    expect(counted.consents).toContain("credit_authorization");
    expect(counted.satisfies).toEqual([CREDIT_SATISFIER]);
    expect(setCountsAsCredit(counted, false).satisfies).toEqual([]);
  });

  it("a co-borrower signs beside the borrower, never instead", () => {
    expect(setCoborrower(signature, true).signers).toEqual(["borrower", "coborrower"]);
    expect(setCoborrower(signature, false).signers).toEqual(["borrower"]);
  });
});
