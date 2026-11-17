import { describe, expect, it } from "vitest";
import { Role } from "@/lib/enums.generated";
import {
  roleAccessProfile,
  roleRequiresPartnerCompany,
  roleUsesHouseProfile,
  TEAM_ASSIGNABLE_ROLES,
  isReferralPartner,
  canUseReferralIntake,
  teamRoleOptions,
} from "@/lib/roleAccess";

describe("role access vocabulary", () => {
  it("distinguishes property originators from program-independent referrals", () => {
    expect(roleAccessProfile(Role.BROKER)).toMatchObject({
      label: "Real Estate Originator",
      workspace: "Real Estate Funding",
    });
    expect(roleAccessProfile(Role.DEALER_PARTNER)).toMatchObject({
      label: "Referral Partner",
      workspace: "All active programs",
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

describe("legacy referral enrollment", () => {
  it("offers one general referral role for new invitations", () => {
    expect(TEAM_ASSIGNABLE_ROLES).toContain(Role.DEALER_PARTNER);
    expect(TEAM_ASSIGNABLE_ROLES).not.toContain(Role.PROFESSIONAL_REFERRAL_PARTNER);
    expect(teamRoleOptions(Role.PROFESSIONAL_REFERRAL_PARTNER)).toContain(Role.PROFESSIONAL_REFERRAL_PARTNER);
    expect(roleAccessProfile(Role.PROFESSIONAL_REFERRAL_PARTNER).label).toBe("Referral Partner");
  });
  it("shares intake with legacy professionals and property originators without admitting clients", () => {
    expect(isReferralPartner(Role.PROFESSIONAL_REFERRAL_PARTNER)).toBe(true);
    expect(canUseReferralIntake(Role.BROKER)).toBe(true);
    expect(canUseReferralIntake(Role.CLIENT)).toBe(false);
    expect(canUseReferralIntake(Role.FIELD_REP)).toBe(false);
  });
});
