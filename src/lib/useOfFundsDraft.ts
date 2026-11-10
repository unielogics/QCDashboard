import { moneyCents, type UseOfFundsBudget, type UseOfFundsRow } from "./useOfFunds";

export type UseOfFundsWorkingDraft = { generation: number; budget: UseOfFundsBudget; rows: UseOfFundsRow[] };
export type UseOfFundsDraftStore = {
  profileId: string;
  read: () => UseOfFundsWorkingDraft | null;
  write: (budget: UseOfFundsBudget, rows: UseOfFundsRow[]) => UseOfFundsWorkingDraft;
  clear: (generation?: number) => boolean;
};

/** Owned by one mounted file workspace, never shared between users or files. */
export function createUseOfFundsDraftStore(profileId: string): UseOfFundsDraftStore {
  let draft: UseOfFundsWorkingDraft | null = null;
  let generation = 0;
  return {
    profileId,
    read: () => draft ? structuredClone(draft) : null,
    write: (budget, rows) => {
      draft = structuredClone({ generation: ++generation, budget, rows });
      return structuredClone(draft);
    },
    clear: (expected) => {
      if (expected !== undefined && draft?.generation !== expected) return false;
      draft = null;
      return true;
    },
  };
}

/** Permissions are refreshed separately; they do not change the draft's financial basis. */
export function budgetDraftMatchesCurrent(base: UseOfFundsBudget, latest: UseOfFundsBudget): boolean {
  return base.revision === latest.revision
    && moneyCents(base.requested_amount) === moneyCents(latest.requested_amount)
    && base.requested_amount_source === latest.requested_amount_source
    && base.funding_request_revision === latest.funding_request_revision
    && Boolean(base.requires_exact_allocation) === Boolean(latest.requires_exact_allocation);
}
