import { describe, expect, it } from "vitest";
import {
  clientFeeAgreementCertificatePath,
  clientPaymentStageVisibility,
  normalizeClientAuthorizationTerms,
} from "@/components/client/ClientPaymentsPanel";

describe("client payment stage visibility", () => {
  it("keeps the fee agreement signable before an ACH obligation exists", () => {
    expect(clientPaymentStageVisibility({
      available: true,
      fee_agreement: { id: "fee-agreement-request", status: "awaiting_signature" },
      obligation: null,
    })).toEqual({
      feeAgreement: true,
      ach: false,
      waitingForObligation: true,
      empty: false,
    });
  });

  it("shows ACH controls only after the exact obligation exists", () => {
    expect(clientPaymentStageVisibility({
      available: true,
      fee_agreement: { id: "fee-agreement-request", status: "signed" },
      obligation: { id: "fee-obligation" },
    })).toEqual({
      feeAgreement: true,
      ach: true,
      waitingForObligation: false,
      empty: false,
    });
  });

  it("uses the authenticated public-room agreement certificate route", () => {
    expect(clientFeeAgreementCertificatePath("request/id")).toBe("/fee-agreements/request%2Fid/certificate");
  });
});

describe("client ACH authorization term normalization", () => {
  it("maps the canonical business-CCD proof keys used by public state", () => {
    expect(normalizeClientAuthorizationTerms({
      authorization_type: "one_time_business_ccd",
      originator: "Qualified Commercial LLC",
      customer_name: "Avery Owner",
      amount_cents: 125000,
      scheduled_debit_at: "2026-10-09T14:00:00-04:00",
      submission_window: "business_day_et",
      notice_business_days: 2,
      revocation_cutoff_at: "2026-10-08T17:00:00-04:00",
      revocation_email: "support@qualifiedcommercial.com",
      authorization_text_version: "ach-v2",
      authorization_text_sha256: "proof-hash",
      authorization_text: "I authorize this one-time business CCD debit.",
    }, {
      business_name: "Avery Holdings LLC",
    })).toMatchObject({
      authorization_type: "one_time_business_ccd",
      originator_name: "Qualified Commercial LLC",
      customer_name: "Avery Owner",
      business_name: "Avery Holdings LLC",
      advance_notice_business_days: 2,
      terms_version: "ach-v2",
      terms_sha256: "proof-hash",
    });
  });

  it("continues to normalize legacy aliases during rollout", () => {
    expect(normalizeClientAuthorizationTerms({
      authorization_type: "one_time",
      originator_name: "Qualified Commercial LLC",
      amount_cents: 50000,
      scheduled_debit_at: "2026-10-09T14:00:00-04:00",
      submission_window: "business_day_et",
      advance_notice_business_days: 2,
      revocation_cutoff_at: "2026-10-08T17:00:00-04:00",
      revocation_email: "support@qualifiedcommercial.com",
      terms_version: "ach-v1",
      terms_sha256: "legacy-hash",
    }, {
      client_name: "Legacy Client",
      business_name: "Legacy Client LLC",
    })).toMatchObject({
      authorization_type: "one_time_business_ccd",
      customer_name: "Legacy Client",
      business_name: "Legacy Client LLC",
      terms_sha256: "legacy-hash",
    });
  });
});
