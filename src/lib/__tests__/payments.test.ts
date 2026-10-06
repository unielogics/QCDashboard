import { describe, expect, it } from "vitest";
import { normalizePaymentSummary, normalizePaymentsQueue, type PaymentSummaryWire } from "@/lib/payments";

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
      status: "signed",
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
