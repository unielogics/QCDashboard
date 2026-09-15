import { describe, expect, it } from "vitest";
import { Role } from "@/lib/enums.generated";
import {
  roleAccessProfile,
  roleRequiresPartnerCompany,
  roleUsesHouseProfile,
  TEAM_ASSIGNABLE_ROLES,
} from "@/lib/roleAccess";

describe("role access vocabulary", () => {
  it("distinguishes real-estate agents from auto dealer agents", () => {
    expect(roleAccessProfile(Role.BROKER)).toMatchObject({
      label: "Real Estate Agent",
      workspace: "Real Estate Funding",
    });
    expect(roleAccessProfile(Role.DEALER_PARTNER)).toMatchObject({
      label: "Auto Dealer Agent",
      workspace: "Dealer AI Intake",
    });
  });

  it("does not offer dedicated client/vendor/lender onboarding roles in Team", () => {
    expect(TEAM_ASSIGNABLE_ROLES).not.toContain(Role.CLIENT);
    expect(TEAM_ASSIGNABLE_ROLES).not.toContain(Role.DEALER);
    expect(TEAM_ASSIGNABLE_ROLES).not.toContain(Role.VENDOR);
    expect(TEAM_ASSIGNABLE_ROLES).not.toContain(Role.LENDER);
  });

  it("keeps staff on the house profile and both external partner roles off it", () => {
    expect(roleUsesHouseProfile(Role.REGIONAL_MANAGER)).toBe(true);
    expect(roleUsesHouseProfile(Role.LOAN_EXEC)).toBe(true);
    expect(roleRequiresPartnerCompany(Role.DEALER_PARTNER)).toBe(true);
    expect(roleRequiresPartnerCompany(Role.PROFESSIONAL_REFERRAL_PARTNER)).toBe(true);
    expect(roleRequiresPartnerCompany(Role.BROKER)).toBe(false);
  });
});
