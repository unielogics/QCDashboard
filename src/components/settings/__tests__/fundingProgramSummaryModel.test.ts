import { describe, expect, it } from "vitest";
import type { FundingProgramCatalogItem, FundingProgramScope } from "@/lib/fundingPrograms";
import {
  fundingProgramStatusBadges,
  summarizeFitRule,
  summarizeProgramEffects,
} from "../fundingProgramSummaryModel";

const route = (patch: Partial<FundingProgramScope> = {}): FundingProgramScope => ({
  vertical: "dealer",
  scope_key: "default",
  intake_variants: [],
  intent_keys: [],
  naics_prefixes: [],
  excluded_naics_prefixes: [],
  industry_keys: [],
  required_fact_keys: [],
  ...patch,
});

const program = (patch: Partial<FundingProgramCatalogItem> = {}): FundingProgramCatalogItem => ({
  id: "program-1",
  program_key: "sba_504",
  public_slug: "sba-504",
  name: "SBA 504",
  short_description: null,
  aliases: [],
  display_order: 1,
  status: "active",
  scopes: [route()],
  published_version: {
    playbook_id: "live-2",
    version: 2,
    status: "published",
    rules: { fit: { field: "requested_amount", op: "lte", value: 5_000_000 } },
    requirements: [],
    published_at: "2026-09-27T12:00:00Z",
  },
  draft_versions: [],
  created_at: "2026-09-27T12:00:00Z",
  updated_at: "2026-09-27T12:00:00Z",
  ...patch,
});

describe("funding program effect summary", () => {
  it("keeps a live program green and ignores stale sibling drafts", () => {
    const stale = { ...program().published_version!, playbook_id: "draft-1", version: 1, status: "draft" as const, published_at: null };
    expect(fundingProgramStatusBadges(program({ draft_versions: [stale] }))).toEqual([
      { label: "Published v2", tone: "ok" },
    ]);

    const advancing = { ...stale, playbook_id: "draft-3", version: 3 };
    expect(fundingProgramStatusBadges(program({ draft_versions: [stale, advancing] }))).toEqual([
      { label: "Published v2", tone: "ok" },
      { label: "Draft v3 saved", tone: "warn" },
    ]);
  });

  it("preserves nested AND, OR, and NOT semantics instead of flattening policy", () => {
    const summary = summarizeFitRule({
      all: [
        { field: "credit_score", op: "gte", value: 680 },
        {
          any: [
            { field: "declared_collateral", op: "eq", value: true },
            { not: { field: "mca_obligations_present", op: "eq", value: true } },
          ],
        },
      ],
    });

    expect(summary.text).toBe("All of these must match");
    expect(summary.children?.[1].text).toBe("At least one of these must match");
    expect(summary.children?.[1].children?.[1]).toMatchObject({
      text: "This must not match",
      children: [{ text: "Existing merchant cash advances must be Yes" }],
    });
  });

  it("shows deny-first NAICS exclusions across every route in one workspace", () => {
    const effects = summarizeProgramEffects(
      [
        route({ scope_key: "purchase", excluded_naics_prefixes: ["5221"] }),
        route({ scope_key: "expansion", intent_keys: ["equipment"], excluded_naics_prefixes: ["524"] }),
      ],
      JSON.stringify({ fit: { field: "requested_amount", op: "gte", value: 1 } }),
      "[]",
    );

    expect(effects.routes).toHaveLength(2);
    expect(effects.routes[0].exclusions).toEqual(["5221", "524"]);
    expect(effects.routes[1].exclusions).toEqual(["5221", "524"]);
    expect(effects.routes[1].restrictions).toContain("Funding purpose: Equipment or vehicle");
  });

  it("keeps review checks staff-gated while allowing optional blank guidance", () => {
    const effects = summarizeProgramEffects(
      [route()],
      JSON.stringify({ fit: { field: "requested_amount", op: "gte", value: 1 } }),
      JSON.stringify([
        {
          requirement_key: "tax_returns",
          label: "Tax returns",
          required_level: "optional",
          verification_required: false,
          completion_mode: "ai_can_complete",
          completion_criteria: "",
          objective_text: "",
          review_checks: [
            { key: "custom_1", label: "Stable earnings", instructions: "", severity: "review" },
          ],
        },
      ]),
    );

    expect(effects.documents[0]).toMatchObject({
      importance: "Optional",
      instructions: "",
      staffVerification: true,
      completion: "Staff verification required",
      checks: [{ label: "Stable earnings", instructions: "", policy: "Flag for staff review" }],
    });
  });
});
