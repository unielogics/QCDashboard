import { describe, expect, it, vi } from "vitest";
import { linkDebtPayee, readDebtPayees } from "../debtPayeesApi";
import { shareFinancialVersion } from "../financialWorkspaceApi";

describe("banking evidence payee associations", () => {
  it("reads payees within the profile's banking evidence", async () => {
    const api = vi.fn().mockResolvedValue({ obligations: [], payees: [], schedule_complete: true });
    await readDebtPayees(api, "profile-a");
    expect(api).toHaveBeenCalledWith("/application-profiles/profile-a/banking/debt-payees");
  });
  it("changes only a loan/payee association without publishing financial values", async () => {
    const api = vi.fn().mockResolvedValue({ obligations: [], payees: [], schedule_complete: true });
    await linkDebtPayee(api, "profile-a", "debt-a", "oakwood");
    expect(api).toHaveBeenCalledTimes(1);
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile-a/banking/debt-payees/debt-a");
    expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ vendor_key: "oakwood" });
    await linkDebtPayee(api, "profile-a", "debt-a", null);
    expect(JSON.parse(api.mock.calls[1][1].body)).toEqual({ vendor_key: null });
  });
  it("requests a pinned saved PDF share instead of a live worksheet link", async () => {
    const api = vi.fn().mockResolvedValue({ url: "https://example.test/pdf/token", expires_at: "2026-11-12T12:00:00Z" });
    const result = await shareFinancialVersion(api, "profile-a", "version-2");
    expect(api.mock.calls[0][0]).toBe("/application-profiles/profile-a/financial-workspace/versions/version-2/share");
    expect(api.mock.calls[0][1]).toEqual({ method: "POST" });
    expect(result.url).toContain("/pdf/");
  });
});
