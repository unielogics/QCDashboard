import { describe, expect, it, vi } from "vitest";
import { actOnFinancialDebtCandidate, candidateDecisionLabel, recurringReviewRows, reviewPage, type FinancialDebtCandidate, type FinancialDebtReview } from "../financialDebtReview";
import type { RecurringPayee } from "../financialCockpit";

const payee: RecurringPayee = {
  key: "funding", payee: "Funding LLC", kind: "other", kind_label: "Other", rationale: "Test observation",
  cadence: null, same_amount: null, monthly_average: 500, average_amount: 25, total: 1000,
  accounts: ["Checking", "Savings"], monthly: { "2026-05": 1000 }, months: ["2026-05"], occurrences: 40, months_seen: 1,
  first_date: null, last_date: null, file_ids: [], accepted: false, is_debt: false, is_card: false,
};
const candidate = (key: string, account: string, extra: Partial<FinancialDebtCandidate> = {}): FinancialDebtCandidate => ({ key, vendor_key: "funding", payee: "Funding LLC", kind: "other", kind_label: "Other", monthly_average: 100, accounts: [account], file_ids: ["statement"], source_refs: [], status: "unreviewed", row_id: null, eligible: true, reason: "Review classification", ...extra });

describe("financial debt review decisions", () => {
  it("keeps separately sourced observations separate and does not copy aggregate account totals into them", () => {
    const rows = recurringReviewRows([payee], [candidate("one", "Checking"), candidate("two", "Savings", { monthly_average: null })]);
    expect(rows.map((row) => row.key)).toEqual(["one", "two"]);
    expect(rows[0].payee.accounts).toEqual(["Checking"]);
    expect(rows[0].payee.monthly_average).toBe(100);
    expect(rows[0].payee.monthly).toEqual({});
    expect(rows[1].payee.monthly_average).toBeNull();
    expect(rows[1].payee.average_amount).toBeNull();
  });
  it("retains operating payees and supports explicit staff review even if AI did not classify a loan", () => {
    const payroll = { ...payee, key: "payroll", kind: "payroll" as const, payee: "Payroll provider" };
    const decision = candidate("payroll-one", "Checking", { vendor_key: "payroll", payee: "Payroll provider", kind: "payroll", eligible: true });
    const rows = recurringReviewRows([payroll], [decision]);
    expect(rows).toHaveLength(1);
    expect(rows[0].candidate?.eligible).toBe(true);
    expect(candidateDecisionLabel(rows[0].candidate)).toBe("Unreviewed candidate");
    expect(candidateDecisionLabel({ ...decision, status: "included" })).not.toContain("debt service");
  });
  it("bounds pages without hiding or losing rows", () => {
    const rows = Array.from({ length: 25 }, (_, index) => index);
    expect(reviewPage(rows, 0).items).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(reviewPage(rows, 10)).toMatchObject({ page: 3, pages: 4, items: [24] });
  });
  it("sends revision, identity, idempotency and explicit link target without publishing", async () => {
    const api = vi.fn().mockResolvedValue({});
    const review = { workspace: { family_id: "family", draft: { revision: 7 } } } as FinancialDebtReview;
    await actOnFinancialDebtCandidate(api, "profile", review, "vendor-account", "link_existing", "attempt", "row-one");
    expect(api).toHaveBeenCalledWith("/application-profiles/profile/financial-workspace/debt-review/actions", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ family_id: "family", expected_revision: 7, candidate_key: "vendor-account", action: "link_existing", idempotency_key: "attempt", target_row_id: "row-one" });
    expect(api.mock.calls[0][0]).not.toContain("versions");
  });
});
