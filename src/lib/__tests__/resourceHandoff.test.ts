import { afterEach, describe, expect, it, vi } from "vitest";
import { consumeResourceToken, isResourceSourcePage, loadResourceHandoff, resourceAnswerNumber, resourceTokenForEmail } from "../resourceHandoff";
import { businessFundingAttribution, optionalBusinessAmount } from "../businessFundingIntake";
import { mcaPublicAttribution } from "../mcaFundingIntake";

afterEach(() => vi.unstubAllGlobals());

describe("resource-to-application handoff", () => {
  it("erases the token immediately while preserving unrelated URL state", () => {
    const location = new URL("https://app.qualifiedcommercial.com/business-funding-intake?locale=es#resource=signed.resource.token&section=apply");
    const replaceState = vi.fn();
    expect(consumeResourceToken(location, { replaceState })).toBe("signed.resource.token");
    expect(replaceState).toHaveBeenCalledWith(null, "", "/business-funding-intake?locale=es#section=apply");
    expect(consumeResourceToken(new URL("https://example.com/#resource=%3Cscript%3E"), { replaceState })).toBeNull();
    expect(replaceState.mock.lastCall?.[2]).toBe("/");
  });

  it("loads only the intended resource goal and never treats loading as application creation", async () => {
    const contact = { name: "Owner", business_name: "Example LLC", email: "owner@example.com", phone: "+19735550148" };
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ goal: "term_loan", contact, answers: { requested_amount: 40000 }, attribution: { page: "/business-funding-check" }, locale: "es" }) });
    vi.stubGlobal("fetch", fetcher);
    const result = await loadResourceHandoff("signed.resource.token", "term_loan");
    expect(result.contact).toEqual(contact); expect(result.locale).toBe("es");
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][0]).toMatch(/\/public\/resources\/handoff$/);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ resource_token: "signed.resource.token" }), cache: "no-store" });
    await expect(loadResourceHandoff("signed.resource.token", "mca_refinance")).rejects.toThrow("different funding review");
    expect(resourceTokenForEmail("signed.resource.token", result, " OWNER@example.com ")).toBe("signed.resource.token");
    expect(resourceTokenForEmail("signed.resource.token", result, "different@example.com")).toBeUndefined();
  });

  it("keeps unknown answers unknown and accepts zero only when explicitly supplied", () => {
    expect(resourceAnswerNumber({ active_mca_count: 0 }, "active_mca_count")).toBe(0);
    for (const value of [null, undefined, "", "0", Number.NaN, -1, true]) expect(resourceAnswerNumber({ value }, "value")).toBeNull();
    expect(optionalBusinessAmount("")).toBeNull(); expect(optionalBusinessAmount("$50,000.25")).toBe(50000.25);
    expect(optionalBusinessAmount("Infinity")).toBeNull(); expect(optionalBusinessAmount("0")).toBeNull();
  });

  it("attributes resources and Academy without accepting arbitrary private or external paths", () => {
    for (const path of ["/business-funding-check", "/es/business-funding-check", "/resources", "/resources/mca-review", "/academy/mca-refinance-requirements-documents"]) {
      expect(isResourceSourcePage(path)).toBe(true);
      expect(mcaPublicAttribution(`?page=${encodeURIComponent(path)}`, "en").page).toBe(path);
      expect(businessFundingAttribution(`?page=${encodeURIComponent(path)}&email=private@example.com`, "en")).toMatchObject({ page: path, program: "term_loan", funding_intent: "working_capital" });
    }
    for (const path of ["https://evil.test/resources", "/resources/private@example.com", "/academy/file?token=private", "/clients/private"]) expect(isResourceSourcePage(path)).toBe(false);
    const safe = businessFundingAttribution("?page=/clients/private@example.com&campaign=private@example.com&program=merchant_cash_advance", "en");
    expect(safe.page).toBe("/business-funding-intake"); expect(safe.program).toBe("term_loan"); expect(JSON.stringify(safe)).not.toContain("private");
  });
});
