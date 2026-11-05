import { describe, expect, it } from "vitest";

import { activeGrants, consentKindLabel, grantWords, smsStatusWords } from "@/lib/smsConsentWords";

const grant = (over: Record<string, unknown> = {}) => ({
  consent_kind: "transactional",
  granted: true,
  method: "self_web",
  consenter_name: "Terrell Parker",
  captured_by_name: "The client, on the application",
  created_at: "2026-11-05T19:14:00Z",
  revoked_at: null,
  ...over,
});

describe("grantWords", () => {
  it("says who agreed and how, for each way consent is recorded", () => {
    expect(grantWords(grant())).toMatch(/^Agreed by Terrell Parker on the application · Nov 5, 2026/);
    expect(grantWords(grant({ method: "in_person_device" }))).toMatch(/^Agreed by Terrell Parker on a rep's device/);
    expect(grantWords(grant({ method: "rep_attested", captured_by_name: "Franco" }))).toMatch(/^Recorded by Franco for Terrell Parker/);
    expect(grantWords(grant({ consenter_name: null }))).toMatch(/^Agreed by the client on the application/);
  });

  it("notes a withdrawal", () => {
    expect(grantWords(grant({ revoked_at: "2026-11-06T10:00:00Z" }))).toMatch(/withdrawn Nov 6, 2026/);
  });
});

describe("activeGrants", () => {
  it("keeps only what still counts, newest first", () => {
    const rows = [grant({ created_at: "2026-11-01T00:00:00Z" }), grant({ revoked_at: "2026-11-06T00:00:00Z" }), grant({ granted: false }), grant({ consent_kind: "marketing", created_at: "2026-11-04T00:00:00Z" })];
    expect(activeGrants(rows).map((row) => row.consent_kind)).toEqual(["marketing", "transactional"]);
    expect(activeGrants(null)).toEqual([]);
  });
});

describe("consentKindLabel", () => {
  it("uses the names on the application", () => {
    expect(consentKindLabel("transactional")).toBe("Application messages");
    expect(consentKindLabel("marketing")).toBe("Marketing messages");
  });
});

describe("smsStatusWords", () => {
  const base = { phone: "+17028632888", can_send: false, transactional_consented: false, marketing_consented: false, opted_out: false, provider_available: true, onboarding_choice: null };

  it("says where texting stands", () => {
    expect(smsStatusWords(null)).toEqual({ text: "Checking text consent", tone: "mut" });
    expect(smsStatusWords({ ...base, phone: null })).toEqual({ text: "No mobile number on file", tone: "mut" });
    expect(smsStatusWords({ ...base, opted_out: true })).toEqual({ text: "Opted out of texts", tone: "bad" });
    expect(smsStatusWords({ ...base, transactional_consented: true, can_send: true })).toEqual({ text: "Consent on file", tone: "ok" });
    expect(smsStatusWords({ ...base, transactional_consented: true, provider_available: false })).toEqual({ text: "Consent on file, SMS unavailable", tone: "warn" });
    expect(smsStatusWords(base)).toEqual({ text: "No consent yet", tone: "warn" });
  });

  it("says the client declined when they were asked and said no", () => {
    expect(smsStatusWords({ ...base, onboarding_choice: { transactional: false, marketing: false, asked_at: null } })).toEqual({ text: "Declined texts when they started", tone: "warn" });
    expect(smsStatusWords({ ...base, onboarding_choice: { transactional: true, marketing: false, asked_at: null } }).text).toBe("No consent yet");
  });
});
