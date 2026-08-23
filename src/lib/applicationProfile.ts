export type ApplicationSourceKind = "deal" | "loan" | "intake" | "dealer";

export type ApplicationProfile = {
  id: string;
  client_id: string | null;
  deal_id: string | null;
  loan_id: string | null;
  intake_id: string | null;
  dealer_id: string | null;
  primary_bucket_id: string | null;
  vertical: "real_estate" | "main_street" | "dealer" | "mca";
  funding_category: string | null;
  entity_type: string | null;
  industry: string | null;
  naics_code: string | null;
  naics_label: string | null;
  custom_industry: string | null;
  classification_revision: number;
  backfill_needs_review: boolean;
  owner_storage: "application" | "dealer";
};

export type FileOwner = {
  id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  ownership_pct: number | null;
  is_primary: boolean;
  is_guarantor: boolean;
  invite_sent_at: string | null;
  invite_opened_at: string | null;
  has_invite: boolean;
  credit_score: number | null;
  credit_tier: string | null;
  credit_pulled_at: string | null;
  credit_required: boolean;
  credit_complete: boolean;
  credit_contact_complete: boolean;
  backfill_needs_review: boolean;
  source: "application" | "dealer";
};

export type FileOwnerRequirementState = {
  ownership_total: number;
  ownership_complete: boolean;
  owner_contact_complete: boolean;
  owner_count: number;
  required_credit_owner_count: number;
  completed_credit_owner_count: number;
  pending_credit_owner_ids: string[];
  missing_credit_contact_owner_ids: string[];
  bank_linked: boolean;
  bank_connection_count: number;
  bank_statement_months: number;
  credit_returned: boolean;
  ready_for_step_2: boolean;
  unlocked: boolean;
  blockers: string[];
};

export type FileCreditInvite = {
  owner_id: string;
  owner_name: string;
  token: string | null;
  path: string | null;
  delivered: boolean;
  channel: string;
  detail: string;
};

export type ApplicationBankConnection = {
  id: string;
  institution_name: string | null;
  accounts_label: string | null;
  status: string;
  error: string | null;
  auto_refresh: boolean;
  is_primary_operating: boolean;
  last_pulled_at: string | null;
  next_refresh_at: string | null;
  statement_months: string[];
  source: "application" | "dealer";
};

export type ApplicationBankState = {
  enabled: boolean;
  environment: string;
  consent_granted: boolean;
  disclosure_version: string;
  disclosure_text: string;
  items: ApplicationBankConnection[];
};

export type UnifiedAuditEvent = {
  id: string;
  occurred_at: string;
  action: string;
  summary: string;
  actor_name: string | null;
  actor_role: string | null;
  source: string;
  metadata: Record<string, unknown>;
};

export type ClassificationPatch = Pick<
  ApplicationProfile,
  "vertical" | "funding_category" | "entity_type" | "industry" | "naics_code" | "naics_label" | "custom_industry"
>;

export type ClassificationPreview = {
  profile_id: string;
  current_revision: number;
  before: ClassificationPatch;
  after: ClassificationPatch;
  effects: string[];
  requires_confirmation: boolean;
};
