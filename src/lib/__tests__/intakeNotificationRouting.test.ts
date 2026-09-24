import { describe, expect, it } from "vitest";
import {
  notificationRuleProblem,
  notificationRuleSummary,
  setNotificationChannel,
  togglePrimaryRecipient,
  type IntakeNotificationRule,
} from "@/lib/intakeNotificationRouting";

const base: IntakeNotificationRule = {
  enabled: true,
  email_enabled: true,
  in_app_enabled: false,
  to_user_ids: ["lead"],
  cc_user_ids: ["broker"],
};

describe("AI Intake notification routing controls", () => {
  it("turns an event off when its last delivery channel is removed", () => {
    const next = setNotificationChannel(base, "email", false);
    expect(next.enabled).toBe(false);
    expect(next.cc_user_ids).toEqual([]);
    expect(notificationRuleSummary(next)).toBe("Off");
  });

  it("turns an event on when an operator selects its first TO recipient", () => {
    const next = togglePrimaryRecipient(
      { ...base, enabled: false, email_enabled: false, to_user_ids: [], cc_user_ids: [] },
      "agent",
    );
    expect(next).toMatchObject({ enabled: true, email_enabled: true, to_user_ids: ["agent"] });
    expect(notificationRuleSummary(next)).toBe("Email · 1 TO");
  });

  it("turns an event off when its final TO recipient is removed", () => {
    const next = togglePrimaryRecipient(base, "lead");
    expect(next.enabled).toBe(false);
    expect(next.to_user_ids).toEqual([]);
  });

  it("blocks enabled routes without a channel or primary recipient", () => {
    expect(notificationRuleProblem({ ...base, email_enabled: false })).toMatch(/Email or In-app/);
    expect(notificationRuleProblem({ ...base, to_user_ids: [] })).toMatch(/primary/);
    expect(notificationRuleProblem(base)).toBeNull();
  });
});
