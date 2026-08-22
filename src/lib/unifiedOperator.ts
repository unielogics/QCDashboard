import type { ChipTone } from "@/components/ds";

export type UnifiedVertical = "real_estate" | "main_street" | "dealer" | "mca";
export type UnifiedOrigin = "console" | "agent" | "rep" | "dealer" | "ai_intake";
export type UnifiedSourceKind = "deal" | "loan" | "intake" | "bucket" | "dealer";
export type UnifiedStageFamily = "working" | "funding";
export type UnifiedTone = ChipTone;

export type UnifiedStage = {
  key: string;
  label: string;
  index: number;
  total: number;
  family: UnifiedStageFamily;
};

export type UnifiedDocumentProgress = {
  docs_uploaded: number;
  docs_total: number;
  signatures_uploaded: number;
  signatures_total: number;
  bucket_progress_label: string;
};

export type UnifiedFileRow = {
  id: string;
  source_kind: UnifiedSourceKind;
  source_id: string;
  ref?: string;
  title?: string;
  label: string;
  subtitle: string | null;
  principal?: string | null;
  client_name: string | null;
  business_name: string | null;
  vertical: UnifiedVertical;
  vertical_label: string;
  origin: UnifiedOrigin;
  origin_label: string;
  stage: UnifiedStage;
  amount: number | null;
  health: string;
  health_tone: UnifiedTone;
  coverage: string;
  stage_tone?: UnifiedTone;
  normalized_stage?: string;
  working_stage?: UnifiedStage | null;
  funding_stage?: UnifiedStage | null;
  program_tags: string[];
  owner_name: string | null;
  rep_name: string | null;
  dealer_name: string | null;
  bucket_id: string | null;
  bucket_name: string | null;
  intake_id: string | null;
  loan_id: string | null;
  deal_id: string | null;
  dealer_id: string | null;
  source_url: string | null;
  updated_at: string | null;
  created_at: string | null;
  document_progress: UnifiedDocumentProgress;
};

export type UnifiedRollup = {
  total: number;
  promoted: number;
  working: number;
  needs_attention: number;
  real_estate: number;
  main_street: number;
  dealer: number;
  mca: number;
};

export type UnifiedFilePage = {
  items: UnifiedFileRow[];
  rollup: UnifiedRollup;
  limit: number;
  filters: {
    vertical: UnifiedVertical | "all";
    origin: UnifiedOrigin | "all";
    q: string | null;
  };
};

export type UnifiedAuditItem = {
  id: string;
  action: string;
  detail: string | null;
  actor_name: string | null;
  actor_role: string | null;
  created_at: string;
};

export type UnifiedFileDetail = {
  file: UnifiedFileRow;
  audit: UnifiedAuditItem[];
};

export type BucketIntakeLinkPayload = {
  bucket_id: string;
  intake_id: string;
  relationship?: "primary" | "supporting" | "source";
  file_ids?: string[];
  note?: string;
};

export type BucketIntakeLinkResult = {
  ok: boolean;
  bucket_id: string;
  intake_id: string;
  relationship: "primary" | "supporting" | "source";
  linked_file_ids?: string[];
  audit_ids: string[];
  audit_action?: string;
  bucket_context?: Record<string, unknown>;
};

export type ProgramBlueprint = {
  key: string;
  label: string;
  verticals: UnifiedVertical[];
  tags: string[];
};

export type DocumentPackBlueprint = {
  key: UnifiedVertical;
  label: string;
  required: string[];
  signatures: string[];
};

export type UnifiedActionKind =
  | "review_file"
  | "link_bucket_intake"
  | "promote_to_funding"
  | "request_docs"
  | "send_external"
  | "archive";

export type UnifiedAction = {
  key: UnifiedActionKind;
  label: string;
  tone: UnifiedTone;
  destructive?: boolean;
  external?: boolean;
  workflowChanging?: boolean;
};

export const VERTICAL_OPTIONS: Array<{ value: UnifiedVertical | "all"; label: string }> = [
  { value: "all", label: "All verticals" },
  { value: "real_estate", label: "Real estate" },
  { value: "main_street", label: "Main Street" },
  { value: "dealer", label: "Dealer" },
  { value: "mca", label: "MCA" },
];

export const ORIGIN_OPTIONS: Array<{ value: UnifiedOrigin | "all"; label: string }> = [
  { value: "all", label: "All origins" },
  { value: "console", label: "Console" },
  { value: "agent", label: "Agent" },
  { value: "rep", label: "Rep" },
  { value: "dealer", label: "Dealer" },
  { value: "ai_intake", label: "AI intake" },
];

export const WORKING_LADDERS: Record<UnifiedVertical, Array<{ key: string; label: string }>> = {
  real_estate: [
    { key: "lead", label: "Lead" },
    { key: "contacted", label: "Contacted" },
    { key: "verified", label: "Verified" },
    { key: "ready_for_lending", label: "Ready for lending" },
  ],
  main_street: [
    { key: "applicant_intake", label: "Applicant intake" },
    { key: "verification", label: "Verification" },
    { key: "financial_profile", label: "Financial profile" },
    { key: "credit_application", label: "Credit application" },
    { key: "contracts_execution", label: "Contracts and execution" },
  ],
  dealer: [
    { key: "applicant_intake", label: "Applicant intake" },
    { key: "verification", label: "Verification" },
    { key: "financial_profile", label: "Financial profile" },
    { key: "credit_application", label: "Credit application" },
    { key: "contracts_execution", label: "Contracts and execution" },
  ],
  mca: [
    { key: "applicant_intake", label: "Applicant intake" },
    { key: "verification", label: "Verification" },
    { key: "financial_profile", label: "Financial profile" },
    { key: "credit_application", label: "Credit application" },
    { key: "contracts_execution", label: "Contracts and execution" },
  ],
};

export const FUNDING_LADDER = [
  { key: "prequalified", label: "Prequalified" },
  { key: "collecting_docs", label: "Collecting docs" },
  { key: "lender_connected", label: "Lender connected" },
  { key: "processing", label: "Processing" },
  { key: "closing", label: "Closing" },
  { key: "funded", label: "Funded" },
];

export const PROGRAM_BLUEPRINTS: ProgramBlueprint[] = [
  {
    key: "dscr_bridge",
    label: "DSCR / bridge",
    verticals: ["real_estate"],
    tags: ["DSCR", "Fix & flip", "Bridge", "Investor rental"],
  },
  {
    key: "sba_main_street",
    label: "SBA / Main Street",
    verticals: ["main_street"],
    tags: ["SBA", "Working capital", "Equipment", "Expansion"],
  },
  {
    key: "dealer_floorplan",
    label: "Dealer funding",
    verticals: ["dealer"],
    tags: ["Floorplan", "Inventory", "Dealer OS", "UrChoice"],
  },
  {
    key: "mca_refi",
    label: "MCA refinance",
    verticals: ["mca"],
    tags: ["MCA refi", "Debt relief", "Cash flow"],
  },
];

export const DOCUMENT_PACKS: Record<UnifiedVertical, DocumentPackBlueprint> = {
  real_estate: {
    key: "real_estate",
    label: "Real estate underwriting",
    required: ["Purchase contract", "Rent roll", "Insurance", "Bank statements", "Entity docs"],
    signatures: ["Borrower authorization", "Broker package release"],
  },
  main_street: {
    key: "main_street",
    label: "Main Street capital",
    required: ["Business bank statements", "Tax returns", "Debt schedule", "P&L", "Entity docs"],
    signatures: ["Credit authorization", "Funding application", "Disclosure consent"],
  },
  dealer: {
    key: "dealer",
    label: "Dealer partner funding",
    required: ["Dealer license", "Inventory list", "Bank statements", "Owner ID", "Dealer agreement"],
    signatures: ["Dealer authorization", "Program agreement", "ACH authorization"],
  },
  mca: {
    key: "mca",
    label: "MCA refinance",
    required: ["Merchant statements", "Bank statements", "Advance contracts", "Payoff letters"],
    signatures: ["Debt review consent", "Funding application"],
  },
};

export const UNIFIED_ACTIONS: UnifiedAction[] = [
  { key: "review_file", label: "Review file", tone: "acc" },
  {
    key: "link_bucket_intake",
    label: "Link bucket and intake",
    tone: "gold",
    workflowChanging: true,
  },
  {
    key: "promote_to_funding",
    label: "Promote to funding",
    tone: "ok",
    workflowChanging: true,
  },
  { key: "request_docs", label: "Request documents", tone: "warn", workflowChanging: true },
  { key: "send_external", label: "Send external package", tone: "pet", external: true },
  { key: "archive", label: "Archive", tone: "bad", destructive: true },
];

export function verticalTone(vertical: UnifiedVertical): UnifiedTone {
  if (vertical === "real_estate") return "acc";
  if (vertical === "main_street") return "ok";
  if (vertical === "dealer") return "gold";
  return "pet";
}

export function originTone(origin: UnifiedOrigin): UnifiedTone {
  if (origin === "ai_intake") return "acc";
  if (origin === "dealer") return "gold";
  if (origin === "rep") return "pet";
  if (origin === "agent") return "ok";
  return "mut";
}

export function stageTone(stage: UnifiedStage): UnifiedTone {
  if (stage.family === "funding") return stage.key === "funded" ? "ok" : "gold";
  if (stage.index >= stage.total - 1) return "ok";
  if (stage.index <= 1) return "mut";
  return "acc";
}

export function stageProgress(stage: UnifiedStage): number {
  if (!stage.total) return 0;
  return Math.min(100, Math.max(0, Math.round((stage.index / stage.total) * 100)));
}

export function formatUnifiedAmount(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return "No amount";
  if (Math.abs(amount) >= 1_000_000) return `$${(amount / 1_000_000).toFixed(amount >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(amount) >= 1_000) return `$${Math.round(amount / 1_000)}K`;
  return `$${amount.toLocaleString("en-US")}`;
}

export function operatorFileHref(row: UnifiedFileRow): string {
  if (row.loan_id) return `/loans/${row.loan_id}`;
  if (row.deal_id) return `/deals/${row.deal_id}`;
  if (row.intake_id) return `/admin/ai-underwriter-leads?lead=${row.intake_id}`;
  if (row.bucket_id) return `/admin/buckets?bucket=${row.bucket_id}`;
  return row.source_url || "/pipeline";
}

export function programBlueprintFor(row: UnifiedFileRow): ProgramBlueprint | undefined {
  return PROGRAM_BLUEPRINTS.find((program) => program.verticals.includes(row.vertical));
}

export function documentPackFor(row: UnifiedFileRow): DocumentPackBlueprint {
  return DOCUMENT_PACKS[row.vertical];
}

export function rowMatchesStage(row: UnifiedFileRow, stageKey: string, family: UnifiedStageFamily): boolean {
  return row.stage.family === family && row.stage.key === stageKey;
}
