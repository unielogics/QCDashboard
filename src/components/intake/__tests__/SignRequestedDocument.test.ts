import { describe, expect, it } from "vitest";
import {
  requestedDocumentAllowsTypedSignature,
  requestedDocumentNeedsDrawing,
} from "@/components/intake/SignRequestedDocument";
import { pendingSignableForRequest, type Signable } from "@/components/room/RoomActions";

describe("requested document signature methods", () => {
  it("allows a typed signature only for the Success Fee Agreement", () => {
    expect(requestedDocumentAllowsTypedSignature("success_fee_agreement")).toBe(true);
    expect(requestedDocumentNeedsDrawing("success_fee_agreement", "typed")).toBe(false);
    expect(requestedDocumentNeedsDrawing("success_fee_agreement", "drawn")).toBe(true);
  });

  it.each(["credit_authorization", "custom", null, undefined])(
    "still requires a drawing for %s",
    (signatureKind) => {
      expect(requestedDocumentAllowsTypedSignature(signatureKind)).toBe(false);
      expect(requestedDocumentNeedsDrawing(signatureKind, "typed")).toBe(true);
    },
  );
});

describe("agreement deep-link focus", () => {
  const feeAgreement: Signable = {
    id: "fee-agreement-request",
    name: "Success Fee Agreement",
    kind: "success_fee_agreement",
    signed: false,
    signable: true,
    document_text: "Agreement text",
  };

  it("resolves the payment request to the actual pending signer", () => {
    expect(pendingSignableForRequest([feeAgreement], feeAgreement.id)).toEqual(feeAgreement);
  });

  it("does not reopen a completed or disabled signing request", () => {
    expect(pendingSignableForRequest([{ ...feeAgreement, signed: true }], feeAgreement.id)).toBeNull();
    expect(pendingSignableForRequest([{ ...feeAgreement, signable: false }], feeAgreement.id)).toBeNull();
  });
});
