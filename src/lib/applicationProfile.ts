export type ApplicationSourceKind = "deal" | "loan" | "intake" | "dealer";
export type UnderwritingLifecycleStatus =
  | "submitted"
  | "collecting_docs"
  | "in_underwriting"
  | "term_sheet_provided"
  | "approved"
  | "closed_won"
  | "closed_lost"
  | "denied";

export type ApplicationProfile = {
  id: string;
  client_id: string | null;
  deal_id: string | null;
  loan_id: string | null;
  intake_id: string | null;
  dealer_id: string | null;
  primary_bucket_id: string | null;
  plaid_assets_enabled: boolean;
  plaid_statements_enabled: boolean;
  plaid_policy_updated_at: string | null;
  plaid_policy_updated_by_user_id: string | null;
  vertical: "real_estate" | "main_street" | "dealer" | "mca";
  funding_category: string | null;
  entity_type: string | null;
  industry: string | null;
  subindustry: string | null;
  naics_code: string | null;
  naics_label: string | null;
  custom_industry: string | null;
  industry_entry_id: string | null;
  subindustry_entry_id: string | null;
  activity_entry_id: string | null;
  taxonomy_version: string;
  classification_provenance: Record<string, unknown> | null;
  classification_revision: number;
  backfill_needs_review: boolean;
  is_draft: boolean;
  draft_finalized_at: string | null;
  extraction_reviewed_at: string | null;
  bank_verification_override_at: string | null;
  bank_verification_override_reason: string | null;
  underwriting_status: UnderwritingLifecycleStatus;
  underwriting_approved_amount: number | null;
  underwriting_term_sheet_amount: number | null;
  underwriting_current_dscr: number | null;
  underwriting_target_dscr: number | null;
  underwriting_approved_dscr: number | null;
  underwriting_close_outcome: string | null;
  underwriting_notes: string | null;
  underwriting_updated_by_user_id: string | null;
  underwriting_updated_at: string | null;
  owner_storage: "application" | "dealer";
};

export type ApplicationUnderwritingState = {
  profile_id: string;
  source_kind: ApplicationSourceKind | null;
  source_id: string | null;
  loan_id: string | null;
  underwriting_status: UnderwritingLifecycleStatus;
  approved_amount: number | null;
  term_sheet_amount: number | null;
  current_dscr: number | null;
  target_dscr: number | null;
  approved_dscr: number | null;
  close_outcome: string | null;
  reviewer_notes: string | null;
  updated_by_user_id: string | null;
  updated_at: string | null;
};

export type ApplicationUnderwritingPatch = Partial<{
  underwriting_status: UnderwritingLifecycleStatus;
  approved_amount: number | null;
  term_sheet_amount: number | null;
  current_dscr: number | null;
  target_dscr: number | null;
  approved_dscr: number | null;
  close_outcome: string | null;
  reviewer_notes: string | null;
}>;

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
  owner_credit_complete: boolean;
  business_banking_complete: boolean;
  evidence_complete: boolean;
  ready_for_step_2: boolean;
  unlocked: boolean;
  ownership_blockers: string[];
  credit_blockers: string[];
  banking_blockers: string[];
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
  environment: string;
  error: string | null;
  update_mode_reason: string | null;
  update_mode_account_selection: boolean;
  auto_refresh: boolean;
  is_primary_operating: boolean;
  last_pulled_at: string | null;
  next_refresh_at: string | null;
  statement_months: string[];
  source: "application" | "dealer";
  products: string[];
  consented_products: string[];
  billed_products: string[];
  unavailable_products: string[];
  pending_products: string[];
  authorization_state: string;
  products_checked_at: string | null;
};

export type PlaidAssetReport = {
  id: string;
  status: string;
  environment: string;
  days_requested: number;
  error: string | null;
  ready_at: string | null;
  created_at: string;
};

export type ApplicationBankState = {
  enabled: boolean;
  environment: string;
  consent_granted: boolean;
  disclosure_version: string;
  disclosure_text: string;
  items: ApplicationBankConnection[];
  manual_override: boolean;
  manual_override_reason: string | null;
  manual_statement_months: string[];
  manual_statement_file_count: number;
  manual_statement_pending_count: number;
  assets_enabled: boolean;
  statements_enabled: boolean;
  selected_products: string[];
  available_products: string[];
  consent_product_scope: string[];
  connections_requiring_client_authorization: number;
  plaid_policy_updated_at: string | null;
  plaid_policy_updated_by_user_id: string | null;
  asset_reports: PlaidAssetReport[];
};

export type RoomDeliveryReceipt = {
  id: string;
  action_kind: string;
  channel: "email" | "sms" | "none" | string;
  recipient_masked: string | null;
  status: string;
  detail: string | null;
  provider_accepted: boolean;
  created_at: string;
};

export type RoomRequestResult = {
  room_url: string;
  overall_status: "created" | "success" | "partial" | "failed";
  deliveries: RoomDeliveryReceipt[];
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
  "vertical" | "funding_category" | "entity_type" | "industry" | "subindustry" | "naics_code" | "naics_label" | "custom_industry" | "industry_entry_id" | "subindustry_entry_id" | "activity_entry_id"
>;

export type TaxonomyEntry = {
  id: string;
  level: 2 | 3 | 6;
  code: string | null;
  label: string;
  parent_id: string | null;
  source: string;
  taxonomy_version: string;
  status: "official" | "approved" | "pending" | "rejected" | "merged";
  aliases: string[];
  originating_profile_id: string | null;
  canonical_entry_id: string | null;
};

export type TaxonomySearch = { items: TaxonomyEntry[]; total: number; page: number; page_size: number };
export type FundingCategory = { id: string; vertical: string; slug: string; label: string; status: string; is_system: boolean };
export type ExtractedFact = { id: string; field_key: string; value: { value?: unknown }; normalized_value: string | null; confidence: number | null; source_file_id: string | null; status: string; extraction_method: string; created_at: string };
export type ApplicationDraftAnalysisStatus = { profile_id: string; uploaded_file_count: number; analyzed_file_count: number; processing_file_count: number; failed_file_count: number; suggested_fact_count: number; reviewed_fact_count: number; can_finalize: boolean };
export type ApplicationIntelligence = { profile_id: string; metrics: Array<{ key: string; label: string; applicable: boolean; value: string | number | null; unit: string | null; status: "ready" | "needs_evidence" | "not_applicable"; confidence: number | null; period: string | null; source: string | null; action: string | null }>; dscr_inputs: Record<string, unknown> };

export type ClassificationPreview = {
  profile_id: string;
  current_revision: number;
  before: ClassificationPatch;
  after: ClassificationPatch;
  effects: string[];
  requires_confirmation: boolean;
};
