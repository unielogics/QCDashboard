import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canonicalEquipmentAttribution,
  emitPublicIntakeConversion,
  isQualifiedEquipmentReview,
  publicIntakeConversionPayload,
} from "@/lib/publicIntakeConversion";

afterEach(() => vi.unstubAllGlobals());

describe("public equipment intake conversion signals", () => {
  it("queues a successful application event before an analytics consumer loads", () => {
    const browser = { dataLayer: undefined as unknown[] | undefined, dispatchEvent: vi.fn() };
    vi.stubGlobal("window", browser);
    emitPublicIntakeConversion("qc_application_start", { program: "term_loan", page: "/business-funding-check" }, "en");
    expect(browser.dataLayer).toHaveLength(1);
    expect(browser.dataLayer?.[0]).toMatchObject({ event: "qc_application_start", program: "term_loan" });
    const prior = browser.dataLayer;
    emitPublicIntakeConversion("qc_application_complete", { program: "term_loan" }, "en");
    expect(browser.dataLayer).toBe(prior); expect(browser.dataLayer).toHaveLength(2);
    expect(browser.dispatchEvent).toHaveBeenCalledTimes(2);
  });
  it("canonicalizes the equipment handoff without dropping campaign context", () => {
    expect(canonicalEquipmentAttribution({ source: "academy", campaign: "fall-gear" })).toEqual({
      source: "academy",
      page: "/equipment-financing",
      program: "equipment_financing",
      vertical: "business",
      funding_intent: "equipment",
      campaign: "fall-gear",
    });
  });

  it("keeps the event provider-neutral and excludes accidental PII", () => {
    const payload = publicIntakeConversionPayload(
      "qc_application_start",
      {
        source: "academy",
        program: "equipment_financing",
        funding_intent: "equipment",
        vertical: "business",
        campaign: "equipment-guide",
        email: "should-not-appear@example.com",
        full_name: "Should Not Appear",
      } as never,
      "en",
    );

    expect(payload).toEqual({
      event: "qc_application_start",
      source: "academy",
      program: "equipment_financing",
      campaign: "equipment-guide",
      cta: undefined,
      page: undefined,
      vertical: "business",
      funding_intent: "equipment",
      locale: "en",
    });
    expect(JSON.stringify(payload)).not.toContain("example.com");
    expect(JSON.stringify(payload)).not.toContain("Should Not Appear");
  });

  it("recognizes only authoritative good or recommended equipment results", () => {
    expect(isQualifiedEquipmentReview({ probability_status: "Good probability - book call" })).toBe(true);
    expect(isQualifiedEquipmentReview({
      program_readiness: {
        candidates: [{
          program_key: "equipment_financing",
          recommendation_status: "recommended",
          eligible: true,
        }],
      },
    })).toBe(true);
    expect(isQualifiedEquipmentReview({
      program_fit: {
        candidates: [{
          program_key: "equipment_financing",
          recommendation_status: "needs_information",
          eligible: false,
        }],
      },
    })).toBe(false);
    expect(isQualifiedEquipmentReview({
      program_readiness: {
        candidates: [{
          program_key: "dealer_working_capital",
          recommendation_status: "recommended",
          eligible: true,
        }],
      },
    })).toBe(false);
  });
});
