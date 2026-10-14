export interface OfferingRequirement {
  requirement_key: string;
  label: string;
  requirement_kind: "field" | "document" | "form" | "consent" | "human_review";
  required_level: "required" | "recommended" | "optional";
  waivable: boolean;
  verification_required?: boolean;
  status?: string;
}

export interface LenderOption {
  id: string;
  name: string;
  submission_email: string | null;
  offering_id: string | null;
  configuration_complete: boolean;
  fit: { status: string; reasons: string[] };
  requirements: OfferingRequirement[];
}

export interface LenderSubmission {
  id: string;
  lender_id: string;
  lender_name: string;
  recipient_email: string | null;
  offering_id: string | null;
  status: string;
  version: number;
  blockers: { code: string; message: string }[];
  fit_status: string;
  warning_acknowledged: boolean;
  requirements_snapshot: { key: string; label: string; kind: string; status: string; required: boolean }[];
  manifest: { files: { id: string; name: string }[]; configuration_incomplete: boolean };
  expires_at: string;
  last_error: string | null;
}

export interface SubmissionBatch {
  id: string;
  profile_id: string;
  status: string;
  created_at: string;
  approved_at: string | null;
  submissions: LenderSubmission[];
}

export function canDispatchSubmission(submission: Pick<LenderSubmission, "status" | "blockers" | "fit_status" | "warning_acknowledged">): boolean {
  return ["prepared", "failed"].includes(submission.status)
    && submission.blockers.length === 0
    && (submission.fit_status === "recommended" || submission.warning_acknowledged);
}

export function submissionSelection(lenders: LenderOption[], selected: Set<string>, acknowledged: Set<string>) {
  return lenders.filter((lender) => selected.has(lender.id)).map((lender) => ({
    lender_id: lender.id,
    offering_id: lender.offering_id,
    warning_acknowledged: acknowledged.has(lender.id),
  }));
}
