import { describe, expect, it } from "vitest";

import { confidenceTone, howWords, ownerCreditStatus, ownerCreditWords, reportWords, scoreWords, shortDate } from "@/lib/creditLinks";

describe("scoreWords", () => {
  it("never dresses up a missing or estimated number", () => {
    expect(scoreWords(null, null)).toBe("Score not yet imported");
    expect(scoreWords(720, "intelligence-proxy")).toBe("720 estimated from the identity check, not a bureau score");
    expect(scoreWords(742, "scraped:fico_8")).toBe("Score 742");
  });
});

describe("ownerCreditWords", () => {
  it("joins the score, the pull date and how it was linked", () => {
    expect(ownerCreditWords({ credit_score: 742, credit_fico_source: "full_feed", credit_pulled_at: "2026-11-03T15:33:11Z", credit_link_how: "manual" }))
      .toBe("Score 742 · pulled Nov 3, 2026 · linked by hand");
    expect(ownerCreditWords({ credit_score: null, credit_fico_source: null, credit_pulled_at: null, credit_link_how: null })).toBe("Score not yet imported");
  });
});

describe("ownerCreditStatus", () => {
  const owner = { credit_complete: true, credit_score: 661, credit_fico_source: "scraped:fico_4", invite_opened_at: null, invite_sent_at: null };
  it("shows the verified linked number in green", () => {
    expect(ownerCreditStatus(owner)).toEqual({ label: "Score 661", tone: "ok" });
  });
  it("never turns a missing or proxy score green", () => {
    expect(ownerCreditStatus({ ...owner, credit_score: null }).tone).toBe("warn");
    expect(ownerCreditStatus({ ...owner, credit_score: 720, credit_fico_source: "intelligence-proxy" }).tone).toBe("warn");
  });
});

describe("howWords and confidenceTone", () => {
  it("name every way a link can happen", () => {
    expect(["manual", "automatic", "signature", "sweep", "other"].map(howWords)).toEqual([
      "linked by hand",
      "linked automatically",
      "linked from the signed authorization",
      "linked by the desk's match",
      "linked",
    ]);
    expect([confidenceTone("exact"), confidenceTone("likely"), confidenceTone("weak")]).toEqual(["ok", "warn", "mut"]);
  });
});

describe("reportWords", () => {
  it("counts connections, who waits and what was checked", () => {
    expect(reportWords({ linked: [1], waiting: [1, 2] })).toBe("1 pull connected, 2 owners still waiting");
    expect(reportWords({ linked: [], unmatched: [1], pulls_checked: 3 })).toBe("0 pulls connected, 1 pull still unmatched, 3 checked");
  });
});

describe("shortDate", () => {
  it("reads as a date and survives junk", () => {
    expect(shortDate("2026-11-03T15:33:11Z")).toBe("Nov 3, 2026");
    expect(shortDate(null)).toBe("an unknown date");
    expect(shortDate("not a date")).toBe("not a date");
  });
});
