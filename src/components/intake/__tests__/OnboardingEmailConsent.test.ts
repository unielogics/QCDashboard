import { describe, expect, it } from "vitest";
import { NO_SMS_CHOICES, smsChoicesBody } from "../OnboardingConsent";

describe("email marketing consent on application starts", () => {
  it("keeps required application notices and optional SMS separate from marketing email", () => {
    const choices = { ...NO_SMS_CHOICES, email: true, transactional: true, marketing: true };
    expect(smsChoicesBody(choices).email_marketing_consent).toBe(false);
    expect(smsChoicesBody({ ...choices, emailMarketing: true }).email_marketing_consent).toBe(true);
  });
});
