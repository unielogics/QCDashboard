// Synthetic staff file/workspace fixtures. No customer records or external services.
import { FINANCIAL_LABELS, type FinancialWorkspaceSnapshot } from "../../src/lib/financialWorkspaceApi";
import { marketplaceBudget, marketplaceCockpit, marketplacePlan, MARKETPLACE_PROFILE } from "./marketplacePanel";
import { emptyStaffOperatingBody, staffOperatingEvidence, staffOperatingEvaluation, STAFF_FAMILY } from "./staffOperatingSources";
import type { SheetKind } from "../../src/components/sheet/types";

export const WORKSPACE_INTAKE = "99000000-0000-4000-8000-000000000001";
export const WORKSPACE_PROFILE = MARKETPLACE_PROFILE;
export const WORKSPACE_BUSINESS = "Example Workspace Studio LLC";
export const workspaceReadiness = {
  profile_id: WORKSPACE_PROFILE, lending_applicable: true, selection_mode: "auto", selections: [], evidence_policies: [], candidates: [], programs: [], requirements: [], available_evidence_files: [], evidence_summary: {}, can_advance: false, automatic_stage_status: "not_ready", automation: { enabled: false, eligible: false, attempts: 0, max_attempts: 3 },
};
export function workspaceDetail(profileId: string | null = WORKSPACE_PROFILE) {
  return { application_profile_id: profileId, derived_pending: false,
    intake: { id: WORKSPACE_INTAKE, business_name: WORKSPACE_BUSINESS, full_name: "Example operator contact", variant: "mca_refinance", email: "workspace@example.test", phone: null, status: "collecting_docs", outcome_status: "submitted" },
    files: [], requested_documents: [], messages: [], notes: [], artifacts: [], latest_review: null };
}
export function workspaceFinancial(kind: SheetKind = "operating_plan", revision = 4, version = false, linkedDebt = false): FinancialWorkspaceSnapshot {
  const current = { id: "99000000-0000-4000-8000-000000000020", version_number: 2, created_at: "2026-11-11T17:00:00Z", actor_name: "Example operator", source: "staff", source_file_id: null, pdf_file_id: "99000000-0000-4000-8000-000000000021", status: "published" as const };
  return { kind, family_id: STAFF_FAMILY, label: kind === "operating_plan" ? "Operating expenses and earnings plan" : "Business debt schedule",
    body: kind === "operating_plan" ? { ...structuredClone(emptyStaffOperatingBody), business_name: WORKSPACE_BUSINESS } : { business_name: WORKSPACE_BUSINESS, debts: linkedDebt ? [{ id: "99000000-0000-4000-8000-000000000030", lender: "Example lender", debt_type: "term_loan", original_amount: "10000", balance: "8000", monthly_payment: "300", status: "active", evidence_links: [{ file_id: "99000000-0000-4000-8000-000000000031", role: "agreement" }] }] : [], no_debt_confirmed: false }, schema: {},
    worksheet: { layout: { kind, title: "Synthetic financial workspace", schema_version: "test", layout_version: "test", name_prefix: "test", columns: kind === "debt_schedule" ? [{ c: 1, label: "Lender", width: 180 }] : [], rows: [], freeze: [0, 0] }, values: {}, computed: {} },
    draft: { revision, base_version_id: version ? current.id : null, updated_at: "2026-11-11T17:00:00Z", dirty: !version }, current_version_id: version ? current.id : null,
    versions: version ? [current] : [], families: [{ id: STAFF_FAMILY, kind, label: "Synthetic working statement", current_version_id: version ? current.id : null }],
    evidence: kind === "debt_schedule" && linkedDebt ? [{ file_id: "99000000-0000-4000-8000-000000000031", file_name: "Example loan agreement.pdf", classification: "loan_agreement", content_type: "application/pdf" }] : staffOperatingEvidence.files.map(file => ({ ...file, content_type: "application/pdf" })), completion: { complete: true, missing_fields: [], reason: "Synthetic complete draft", no_debt: false, active_rows: 0 }, ...(version ? { saved_version: current } : {}),
  };
}
export { marketplaceBudget, marketplaceCockpit, marketplacePlan, staffOperatingEvidence, staffOperatingEvaluation };

export const workspaceForms = ["debt_schedule", "pfs", "real_estate_schedule", "p_and_l", "balance_sheet", "operating_plan"].map(kind => ({ kind, label: FINANCIAL_LABELS[kind as SheetKind], requested: true, satisfied: false, source: "none", statement_id: null, row_count: 0, total_monthly: null, total_balance: null, net_worth: null, updated_at: null, filled_by_staff: false, figures_from: null, statements: [], analysis_pending: false }));
