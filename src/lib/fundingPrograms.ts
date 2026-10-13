export type FundingProgramVertical = "real_estate" | "dealer" | "main_street" | "mca";

export type FundingProgramScope = {
  id?: string;
  vertical: FundingProgramVertical;
  scope_key: string;
  intake_variants: string[];
  intent_keys: string[];
  naics_prefixes: string[];
  excluded_naics_prefixes?: string[];
  industry_keys: string[];
  required_fact_keys: string[];
  is_active?: boolean;
};

export type FundingProgramVersion = {
  playbook_id: string;
  version: number;
  status: "draft" | "published" | "archived";
  rules: Record<string, unknown>;
  requirements: Array<Record<string, unknown>>;
  published_at: string | null;
};

export type FundingProgramCommercialTerms = {
  id: string;
  version: number;
  status: "draft" | "published" | "retired";
  minimum_amount: number | null;
  maximum_amount: number | null;
  minimum_term_months: number | null;
  maximum_term_months: number | null;
  pricing_basis: "apr" | "interest_rate" | "factor_rate" | "file_specific" | null;
  minimum_pricing: number | null;
  maximum_pricing: number | null;
  qc_fee_cap_percent: number | null;
  qc_fee_default_percent: number | null;
  disclosures: string[];
  source_reference: string | null;
  effective_date: string | null;
  published_at: string | null;
};

export type FundingProgramReviewCheck = {
  key: "net_income_nonnegative" | "net_income_not_declining" | "revenue_not_declining" | "no_mca_debits" | "no_nsf" | "positive_ending_balance" | "custom" | `custom_${string}`;
  label: string;
  instructions: string;
  severity: "review" | "block";
};

export type FundingProgramBaseline = {
  program_key: string;
  name: string;
  version: string;
  source_urls: string[];
  source_notes: string[];
  rules: Record<string, unknown>;
  requirements: Array<Record<string, unknown>>;
  scopes: FundingProgramScope[];
  needs_review: boolean;
};

export type FundingProgramCatalogItem = {
  id: string;
  program_key: string;
  public_slug: string;
  name: string;
  short_description: string | null;
  aliases: string[];
  display_order: number;
  status: "active" | "retired";
  scopes: FundingProgramScope[];
  published_version: FundingProgramVersion | null;
  draft_versions: FundingProgramVersion[];
  published_commercial_terms?: FundingProgramCommercialTerms | null;
  draft_commercial_terms?: FundingProgramCommercialTerms[];
  created_at: string;
  updated_at: string;
};

export type PublicFundingProgram = Pick<FundingProgramCatalogItem, "program_key" | "public_slug" | "name" | "short_description" | "display_order"> & {
  verticals: FundingProgramVertical[];
  commercial_terms?: FundingProgramCommercialTerms | null;
};

/**
 * A manual-program retry may resume a draft created by an earlier interrupted
 * attempt, but it must never publish an arbitrary draft that happens to share
 * the same catalog key. Keep this deliberately strict: a more sophisticated
 * criteria tree belongs in the catalog editor, not the quick-add workflow.
 */
export function manualProgramDraftMatches(
  version: FundingProgramVersion,
  vertical: FundingProgramVertical,
  requirementLabels: string[],
): boolean {
  const rules = version.rules && typeof version.rules === "object" ? version.rules : {};
  const fit = rules.fit;
  if (!fit || typeof fit !== "object" || Array.isArray(fit)) return false;
  const fitRule = fit as Record<string, unknown>;
  if (
    fitRule.field !== "vertical"
    || fitRule.op !== "eq"
    || fitRule.value !== vertical
    || Object.keys(fitRule).some((key) => !["field", "op", "value"].includes(key))
  ) return false;
  if (Array.isArray(rules.unresolved_review_items) && rules.unresolved_review_items.length) return false;

  const normalize = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase();
  const actualLabels = version.requirements.map((requirement) => normalize(requirement.label));
  const expectedLabels = requirementLabels.map(normalize);
  return actualLabels.length === expectedLabels.length
    && actualLabels.every((label, index) => label === expectedLabels[index]);
}
