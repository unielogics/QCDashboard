import { describe, expect, it } from "vitest";
import { isAchMandateActive, isAchMandateSigned, normalizePaymentSummary, normalizePaymentsQueue, type PaymentSummaryWire } from "@/lib/payments";

function rawSummary(): PaymentSummaryWire {
  return {
    profile_id: "profile-1",
    economics: {
      accepted_amount: "500000.00",
      funded_amount: "500000.00",
      origination_points: "2.5",
      consulting_fee: "1000.00",
      origination_fee_cents: 1_250_000,
      gross_fee_cents: 1_350_000,
    },
    current_obligation: {
      id: "obligation-1",
      version: 1,
      record_version: 3,
      status: "authorized",
      accepted_amount: "500000.00",
      funded_amount: "500000.00",
      origination_points: "2.5",
      origination_fee_cents: 1_250_000,
      consulting_fee_cents: 100_000,
      gross_fee_cents: 1_350_000,
      client_ach_cents: 800_000,
      bank_direct_cents: 500_000,
      external_cents: 0,
      deferred_cents: 0,
      waived_cents: 50_000,
      agreement_reference: "agreement-7",
      consulting_milestone_confirmed_at: "2026-10-01T14:00:00Z",
      created_at: "2026-10-01T13:00:00Z",
      updated_at: "2026-10-01T14:00:00Z",
    },
    funding_confirmation: {
      id: "funding-1",
      actual_funding_date: "2026-10-01",
      actual_funded_amount: "500000.00",
      funding_party_name: "QC Private Capital",
      source: "manual",
      confirmed_at: "2026-10-01T15:00:00Z",
    },
    funding_source: {
      id: "source-1",
      status: "verified",
      owner_type: "business",
      ach_class: "CCD",
      institution_name: "Example Bank",
      account_mask: "6789",
      verified_at: "2026-10-01T15:30:00Z",
      created_at: "2026-10-01T15:00:00Z",
    },
    mandate: {
      id: "mandate-1",
      status: "active",
      current: true,
      ach_class: "CCD",
      authorized_amount_cents: 800_000,
      typed_name: "Alex Owner",
      payer_name: "Alex Owner",
      signed_at: "2026-10-01T16:00:00Z",
    },
    transfers: [],
    bank_direct_receipts: [],
    private_plans: [],
    installments: [],
    totals: {
      gross_fee_cents: 1_350_000,
      client_ach_cents: 800_000,
      bank_direct_expected_cents: 500_000,
      bank_direct_received_cents: 0,
      waived_cents: 50_000,
      outstanding_cents: 1_300_000,
    },
    capabilities: { can_read: true, can_prepare: true, can_confirm_funding: true, can_release: true, payments_enabled: true },
    readiness: { ready_to_release: true, blockers: [] },
  };
}

describe("payment API normalization", () => {
  it("converts cents once and preserves a balanced split allocation", () => {
    const summary = normalizePaymentSummary(rawSummary());
    expect(summary.gross_expected_fee).toBe(13_500);
    expect(summary.origination_fee).toBe(12_500);
    expect(summary.consulting_fee).toBe(1_000);
    expect(summary.allocation).toMatchObject({
      collection_mode: "split",
      client_ach_amount: 8_000,
      bank_direct_amount: 5_000,
      waived_amount: 500,
      unallocated_amount: 0,
      is_balanced: true,
    });
    expect(summary.readiness.ready_for_release).toBe(true);
    expect(summary.readiness.client_authorized).toBe(true);
    expect(summary.mandate).toMatchObject({ status: "active", current: true, sec_code: "CCD" });
  });

  it("does not confuse retained signed proof with a current debit authority", () => {
    const raw = rawSummary();
    raw.mandate = { ...raw.mandate!, status: "signed", current: false };
    const summary = normalizePaymentSummary(raw);

    expect(isAchMandateSigned(raw.mandate)).toBe(true);
    expect(isAchMandateActive(raw.mandate)).toBe(false);
    expect(summary.mandate?.current).toBe(false);
    expect(summary.readiness.client_authorized).toBe(false);
  });

  it("requires the server-confirmed current Success Fee Agreement", () => {
    const raw = rawSummary();
    raw.agreement_documents = [{
      id: "other-document",
      name: "Other signed document",
      artifact_type: "bucket_file",
      sha256: "abc123",
      system_signed: true,
      signed_at: "2026-10-01T12:00:00Z",
      signature_kind: "credit_authorization",
      requires_staff_attestation: false,
      eligible_components: ["origination"],
    }];

    expect(normalizePaymentSummary(raw).readiness.fee_agreement_signed).toBe(false);
    raw.agreement_documents[0].signature_kind = "success_fee_agreement";
    expect(normalizePaymentSummary(raw).readiness.fee_agreement_signed).toBe(false);
    raw.fee_agreement = {
      id: "prepared-agreement",
      status: "signed",
      current: false,
    };
    expect(normalizePaymentSummary(raw).readiness.fee_agreement_signed).toBe(false);
    raw.fee_agreement.current = true;
    expect(normalizePaymentSummary(raw).readiness.fee_agreement_signed).toBe(true);
  });

  it("keeps the signing invitation distinct from the exact debit notice", () => {
    const raw = rawSummary();
    raw.authorization_request_delivery = {
      status: "delivered",
      sent_at: "2026-10-01T15:40:00Z",
      delivered_at: "2026-10-01T15:41:00Z",
    };
    raw.debit_notice = {
      id: "notice-1",
      status: "sent",
      amount_cents: 800_000,
      scheduled_debit_at: "2026-10-06T14:00:00Z",
      submission_window: "business_day_et",
      notice_business_days: 2,
      revocation_cutoff_at: "2026-10-05T21:00:00Z",
      sent_at: "2026-10-01T16:01:00Z",
    };
    const summary = normalizePaymentSummary(raw);

    expect(summary.authorization_request_delivery?.status).toBe("delivered");
    expect(summary.debit_notice).toMatchObject({ status: "sent", amount: 8_000, advance_notice_business_days: 2 });
    expect(summary.readiness.debit_notice_delivered).toBe(false);
    expect(summary.timeline.map((item) => item.kind)).toEqual(expect.arrayContaining(["authorization_request", "debit_notice"]));
  });

  it("fails account eligibility closed unless the source is business CCD", () => {
    const raw = rawSummary();
    raw.funding_source = { ...raw.funding_source!, ach_class: "WEB" };
    let summary = normalizePaymentSummary(raw);

    expect(summary.funding_source?.ach_class).toBe("WEB");
    expect(summary.readiness.account_eligible).toBe(false);

    delete raw.funding_source.ach_class;
    summary = normalizePaymentSummary(raw);
    expect(summary.funding_source?.ach_class).toBe("UNKNOWN");
    expect(summary.readiness.account_eligible).toBe(false);
  });

  it("never counts a submitted transfer as collected", () => {
    const raw = rawSummary();
    raw.transfers = [{
      id: "transfer-1",
      status: "submitted",
      amount_cents: 800_000,
      attempt_no: 1,
      submitted_at: "2026-10-01T17:00:00Z",
      created_at: "2026-10-01T17:00:00Z",
    }];
    raw.totals.collected_cents = 0;
    raw.totals.processing_cents = 800_000;
    const summary = normalizePaymentSummary(raw);
    expect(summary.transfer?.status).toBe("submitted");
    expect(summary.totals.processing).toBe(8_000);
    expect(summary.totals.collected).toBe(0);
  });

  it("preserves the durable submitting state and same-intent resume eligibility", () => {
    const raw = rawSummary();
    raw.transfers = [{
      id: "transfer-resume-1",
      status: "submitting",
      amount_cents: 800_000,
      attempt_no: 1,
      resume_eligible: true,
      created_at: "2026-10-01T17:00:00Z",
    }];
    const summary = normalizePaymentSummary(raw);
    expect(summary.transfer?.status).toBe("submitting");
    expect(summary.transfer?.resume_eligible).toBe(true);
    expect(summary.transfer?.retry_eligible).toBe(false);
  });

  it("normalizes an empty operations queue using server summary counts", () => {
    const queue = normalizePaymentsQueue({
      items: [], total: 0, page: 1, page_size: 100,
      summary: { awaiting_authorization: 2, ready_for_release: 1, returned: 3, externally_reconciled: 4 },
    });
    expect(queue.items).toEqual([]);
    expect(queue.totals.awaiting_authorization).toBe(2);
    expect(queue.totals.ready_for_release).toBe(1);
    expect(queue.totals.action_required).toBe(3);
    expect(queue.totals.externally_reconciled).toBe(4);
  });

  it("keeps owner identity available for global queue filtering", () => {
    const queue = normalizePaymentsQueue({
      items: [{
        profile_id: "profile-1",
        owner_id: "owner-1",
        owner_name: "Alex Owner",
        business_name: "Example Co",
        queue: "origination_fees",
        amount_cents: 12_500,
        status: "ready_for_release",
      }],
      total: 1,
      page: 1,
      page_size: 50,
      summary: {},
    });
    expect(queue.items[0]).toMatchObject({ owner_id: "owner-1", owner_name: "Alex Owner" });
  });
});
