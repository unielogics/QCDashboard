import { describe, expect, it } from "vitest";
import { emptyMcaIntakeAnswers, mcaDeclarationDoesNotFit, mcaIntakeRequest, mcaPriorTaxYear, mcaPublicAttribution, safeMcaRoomUrl } from "../mcaFundingIntake";

describe("standalone Main Street MCA intake", () => {
  it("preserves unknown declarations instead of claiming zero positions or an unmodified advance", () => {
    const body = mcaIntakeRequest({ ...emptyMcaIntakeAnswers, active_mca_count: "unknown", has_modified_mca: "unknown", last_year_tax_earnings: "unknown" }, "482691", "en", "attempt", "");
    expect(body).toMatchObject({ active_mca_count: null, has_modified_mca: null, last_year_tax_earnings: "unknown", consent_version: "mca-ai-intake-v3" });
    expect(mcaDeclarationDoesNotFit({ active_mca_count: "unknown", has_modified_mca: "unknown", last_year_tax_earnings: "unknown" })).toBe(false);
    expect(mcaIntakeRequest(emptyMcaIntakeAnswers, "482691", "en", "attempt", "")).toMatchObject({ active_mca_count: null, has_modified_mca: null });
    expect(mcaIntakeRequest({ ...emptyMcaIntakeAnswers, monthly_revenue: "unknown", time_in_business: "unknown" }, "482691", "en", "attempt", "")).toMatchObject({ monthly_revenue: null, time_in_business: null });
  });
  it("keeps the two existing advances before funding distinct from prohibited known conditions", () => {
    const allowed = { active_mca_count: "2", has_modified_mca: "no", last_year_tax_earnings: "nonnegative" };
    expect(mcaDeclarationDoesNotFit(allowed)).toBe(false);
    for (const change of [{ active_mca_count: "3_plus" }, { has_modified_mca: "yes" }, { last_year_tax_earnings: "negative" }]) expect(mcaDeclarationDoesNotFit({ ...allowed, ...change })).toBe(true);
    expect(mcaIntakeRequest({ ...emptyMcaIntakeAnswers, ...allowed }, "482691", "en", "attempt", "")).toMatchObject({ active_mca_count: 2, has_modified_mca: false });
  });
  it("uses the policy timezone when the calendar year differs from UTC", () => {
    expect(mcaPriorTaxYear(new Date("2027-01-01T02:00:00Z"))).toBe(2025);
    expect(mcaPriorTaxYear(new Date("2027-01-01T06:00:00Z"))).toBe(2026);
  });
  it("opens only QC PIN rooms and strips credentials or arbitrary redirect parameters", () => {
    const origin = "http://localhost:3127";
    expect(safeMcaRoomUrl("/buckets/request/room-example?pin=482691&redirect=https://evil.test#code=482691", origin)).toBe(`${origin}/buckets/request/room-example?tab=ai-review`);
    for (const url of ["https://evil.test/buckets/request/room", "javascript:alert(1)", "//evil.test/buckets/request/room", "/sign-in", "https://user:pass@capital.qualifiedcommercial.com/buckets/request/room"]) expect(safeMcaRoomUrl(url, origin)).toBeNull();
  });
  it("preserves campaign attribution without letting a link change the product or collect contact identifiers", () => {
    const attribution = mcaPublicAttribution("?program=mca_refinance&vertical=dealer&utm_source=google&gclid=click&email=private@example.com&pin=123456", "es");
    expect(attribution).toEqual({ source: "public_site", page: "/es/merchant-cash-advance", entry_page: "/es/merchant-cash-advance", campaign: "mca_funding", vertical: "main_street", program: "merchant_cash_advance", funding_intent: "merchant_cash_advance", profile: "main_street_v1", utm_source: "google", gclid: "click" });
    const trade = mcaPublicAttribution("?page=/industries/main-street&campaign=main_street_route_check&cta=new_mca_file", "en");
    expect(trade).toMatchObject({ page: "/industries/main-street", entry_page: "/industries/main-street", campaign: "main_street_route_check", cta: "new_mca_file" });
    expect(mcaPublicAttribution("?page=/clients/private@example.com?pin=123456&campaign=private@example.com&cta=pin=123456", "en")).toMatchObject({ page: "/merchant-cash-advance", campaign: "mca_funding" });
  });
});
