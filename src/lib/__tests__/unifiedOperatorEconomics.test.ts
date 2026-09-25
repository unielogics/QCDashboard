import { describe, expect, it } from "vitest";
import { derivePipelineEconomics, type UnifiedFileRow } from "@/lib/unifiedOperator";

function row(fields: Partial<UnifiedFileRow>): UnifiedFileRow {
  return {
    id: fields.id ?? String(Math.random()),
    source_kind: fields.source_kind ?? "intake",
    source_id: fields.source_id ?? fields.id ?? "source",
    label: "Test file",
    subtitle: null,
    client_id: null,
    client_name: null,
    business_name: null,
    vertical: "dealer",
    vertical_label: "Dealer",
    origin: "ai_intake",
    origin_label: "AI intake",
    stage: { key: "test", label: "Test", index: 0, total: 1, family: "working" },
    amount: null,
    health: "Ready",
    health_tone: "ok",
    coverage: "Ready",
    program_tags: [],
    owner_name: null,
    rep_name: null,
    dealer_name: null,
    bucket_id: null,
    bucket_name: null,
    intake_id: null,
    loan_id: null,
    deal_id: null,
    dealer_id: null,
    source_url: null,
    updated_at: null,
    created_at: null,
    document_progress: { docs_uploaded: 0, docs_total: 0, signatures_uploaded: 0, signatures_total: 0, bucket_progress_label: "" },
    ...fields,
  };
}

describe("derivePipelineEconomics", () => {
  it("groups values by lifecycle, calculates earnings, and excludes files without points from earnings", () => {
    const result = derivePipelineEconomics([
      row({ id: "request", profile_id: "p1", pipeline_status: "submitted", forecast_amount: 100_000, forecast_fee_points: 2, forecast_earnings: 2_000 }),
      row({ id: "underwriting", profile_id: "p2", pipeline_status: "in_underwriting", forecast_amount: 50_000 }),
      row({ id: "approved", profile_id: "p3", pipeline_status: "approved", forecast_amount: 300_000, forecast_fee_points: 1 }),
      row({ id: "funded", profile_id: "p4", pipeline_status: "closed_won", funded_amount: 400_000, forecast_fee_points: 2.5 }),
      row({ id: "denied", profile_id: "p5", pipeline_status: "denied", forecast_amount: 900_000, forecast_fee_points: 10 }),
    ]);

    expect(result.requested).toMatchObject({ count: 1, value: 100_000, forecasted_count: 1, forecast_coverage_pct: 100, forecast_earnings: 2_000 });
    expect(result.underwriting).toMatchObject({ count: 1, value: 50_000, forecasted_count: 0, forecast_coverage_pct: 0, forecast_earnings: 0 });
    expect(result.approved).toMatchObject({ count: 1, value: 300_000, forecasted_count: 1, forecast_earnings: 3_000 });
    expect(result.funded).toMatchObject({ count: 1, value: 400_000, forecasted_count: 1, forecast_earnings: 10_000 });
  });

  it("counts linked projections only once by application profile", () => {
    const result = derivePipelineEconomics([
      row({ id: "intake-row", profile_id: "same-profile", pipeline_status: "submitted", forecast_amount: 125_000, forecast_fee_points: 2 }),
      row({ id: "loan-row", source_kind: "loan", profile_id: "same-profile", pipeline_status: "submitted", forecast_amount: 125_000, forecast_fee_points: 2 }),
    ]);

    expect(result.requested).toMatchObject({ count: 1, value: 125_000, forecast_earnings: 2_500 });
  });
});

