export type FundingProgramVertical = "real_estate" | "dealer" | "main_street" | "mca";

export type FundingProgramScope = {
  id?: string;
  vertical: FundingProgramVertical;
  scope_key: string;
  intake_variants: string[];
  intent_keys: string[];
  naics_prefixes: string[];
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
  created_at: string;
  updated_at: string;
};

export type PublicFundingProgram = Pick<FundingProgramCatalogItem, "program_key" | "public_slug" | "name" | "short_description" | "display_order"> & {
  verticals: FundingProgramVertical[];
};
