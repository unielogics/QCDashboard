import { Role } from "./enums.generated";
import { budgetPreview, budgetRows, moneyCents, USE_OF_FUNDS_CATEGORIES, type UseOfFundsItem, type UseOfFundsRow } from "./useOfFunds";

export type FundingRequest = {
  profile_id: string;
  requested_amount: number | string | null;
  requested_amount_source: string | null;
  original_requested_amount: number | string | null;
  revision: number;
  use_of_funds_revision: number;
  items: UseOfFundsItem[];
  complete: boolean;
  can_edit: boolean;
  reason: string | null;
  updated_at: string | null;
  updated_by_user_id: string | null;
  payoff_only_alternative: boolean;
};

export type FundingRequestDraft = {
  requestedAmount: string;
  rows: UseOfFundsRow[];
  reason: string;
  payoffOnlyAlternative: boolean;
};

export type FundingRequestSave = {
  requested_amount: string;
  items: UseOfFundsRow[];
  expected_revision: number;
  expected_use_of_funds_revision: number;
  idempotency_key: string;
  reason: string;
  payoff_only_alternative: boolean;
};

export function canCorrectFundingRequest(role: string | null | undefined, request: Pick<FundingRequest, "can_edit"> | null) {
  return Boolean(request?.can_edit && (role === Role.SUPER_ADMIN || role === Role.LOAN_EXEC));
}

export function fundingRequestDraft(request: FundingRequest): FundingRequestDraft {
  return {
    requestedAmount: request.requested_amount == null ? "" : String(request.requested_amount),
    rows: budgetRows(request.items),
    reason: "",
    payoffOnlyAlternative: request.payoff_only_alternative,
  };
}

export function fundingRequestPreview(draft: FundingRequestDraft) {
  const preview = budgetPreview(draft.rows, draft.requestedAmount);
  const errors = { ...preview.errors };
  const requested = moneyCents(draft.requestedAmount);
  if (requested == null || requested <= 0) errors.requestedAmount = "Enter a requested amount above $0, with no more than two decimal places.";
  else if (requested > 99_999_999_999_999) errors.requestedAmount = "The requested amount is too large.";
  if (requested != null && requested > 0 && !preview.complete && !Object.keys(preview.errors).length) errors.total = "Allocate the full requested amount before saving.";
  if (draft.rows.length > 50) errors.total = "Use at most 50 allocation lines.";
  if (new Set(draft.rows.map((row) => row.id)).size !== draft.rows.length) errors.total = "Each allocation must have its own line.";
  for (const row of draft.rows) {
    if (!USE_OF_FUNDS_CATEGORIES.some(([key]) => key === row.category)) errors[row.id] = "Choose a use of funds.";
    if (row.label.length > 160) errors[row.id] = "Keep the description within 160 characters.";
  }
  if (draft.reason.trim().length < 8 || draft.reason.trim().length > 2000) errors.reason = "Enter a reason between 8 and 2,000 characters.";
  return { ...preview, errors, valid: Object.keys(errors).length === 0 && preview.complete };
}

export function fundingRequestSave(request: FundingRequest, draft: FundingRequestDraft, idempotencyKey: string): FundingRequestSave {
  if (!fundingRequestPreview(draft).valid) throw new Error("Complete the requested amount, balanced uses, and reason before saving.");
  return {
    requested_amount: draft.requestedAmount.trim(),
    items: draft.rows.map((row) => ({ ...row, amount: row.amount.trim(), label: row.label.trim() || USE_OF_FUNDS_CATEGORIES.find(([key]) => key === row.category)![1] })),
    expected_revision: request.revision,
    expected_use_of_funds_revision: request.use_of_funds_revision,
    idempotency_key: idempotencyKey,
    reason: draft.reason.trim(),
    payoff_only_alternative: draft.payoffOnlyAlternative,
  };
}

type Call = <T>(path: string, options?: RequestInit) => Promise<T>;
export function fundingRequestApi(call: Call, profileId: string) {
  const path = `/application-profiles/${encodeURIComponent(profileId)}/funding-request`;
  return {
    load: () => call<FundingRequest>(path),
    save: (input: FundingRequestSave) => call<FundingRequest>(path, { method: "PATCH", body: JSON.stringify(input) }),
  };
}
