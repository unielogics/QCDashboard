import { Role } from "@/lib/enums.generated";

export type RoleAccessProfile = {
  label: string;
  workspace: string;
  scope: string;
  kind: "internal" | "partner" | "client";
};

/**
 * Human-facing meaning of each authorization role. The stored enum remains
 * stable; this vocabulary makes industry and data scope explicit everywhere
 * an administrator assigns or reviews access.
 */
export const ROLE_ACCESS: Record<string, RoleAccessProfile> = {
  [Role.SUPER_ADMIN]: {
    label: "Super Admin",
    workspace: "All workspaces",
    scope: "Firm-wide governance, users, files, funding, Field Desk, and Audit.",
    kind: "internal",
  },
  [Role.LOAN_EXEC]: {
    label: "Underwriter",
    workspace: "Funding & underwriting",
    scope: "Firm-wide funding files and AI intake; no team or global bucket administration.",
    kind: "internal",
  },
  [Role.BROKER]: {
    label: "Real Estate Agent",
    workspace: "Real Estate Funding",
    scope: "Own clients, deals, funding pipeline, and real-estate analysis tools.",
    kind: "partner",
  },
  [Role.REGIONAL_MANAGER]: {
    label: "Regional Manager",
    workspace: "Regional funding portfolio",
    scope: "Assigned agents, their clients, and portfolio reporting.",
    kind: "internal",
  },
  [Role.DEALER_PARTNER]: {
    label: "Auto Dealer Agent",
    workspace: "Dealer AI Intake",
    scope: "Only auto-industry leads referred by this user, including their document rooms and AI review.",
    kind: "partner",
  },
  [Role.PROFESSIONAL_REFERRAL_PARTNER]: {
    label: "Professional Referral Partner",
    workspace: "Foreclosure Rescue",
    scope: "Rescue files owned by the user’s approved firm.",
    kind: "partner",
  },
  [Role.FIELD_REP]: {
    label: "Field Representative",
    workspace: "Field Desk & Audit",
    scope: "Only appointments and dealer files owned by this representative.",
    kind: "internal",
  },
  [Role.CLIENT]: {
    label: "Client",
    workspace: "Borrower Portal",
    scope: "Own funding file, documents, messages, and calendar.",
    kind: "client",
  },
  [Role.DEALER]: {
    label: "Dealer Client",
    workspace: "Audit",
    scope: "Own linked dealership and audit records.",
    kind: "client",
  },
  [Role.LENDER]: {
    label: "Lender",
    workspace: "Lender Packages",
    scope: "Only packages explicitly shared with this lender identity.",
    kind: "partner",
  },
  [Role.VENDOR]: {
    label: "Vendor",
    workspace: "Assigned Document Rooms",
    scope: "Only buckets and files explicitly assigned to this vendor.",
    kind: "partner",
  },
};

export function roleAccessProfile(role: Role | string): RoleAccessProfile {
  return ROLE_ACCESS[role] ?? {
    label: String(role).replaceAll("_", " "),
    workspace: "Limited access",
    scope: "Access is restricted by server-side role and ownership rules.",
    kind: "partner",
  };
}

export const TEAM_ASSIGNABLE_ROLES: Role[] = [
  Role.BROKER,
  Role.DEALER_PARTNER,
  Role.REGIONAL_MANAGER,
  Role.LOAN_EXEC,
  Role.FIELD_REP,
  Role.PROFESSIONAL_REFERRAL_PARTNER,
  Role.SUPER_ADMIN,
];

/** Roles whose business profile must be an external partner company. */
export const PARTNER_COMPANY_ROLES: ReadonlySet<Role> = new Set([
  Role.DEALER_PARTNER,
  Role.PROFESSIONAL_REFERRAL_PARTNER,
]);

/** Internal employees default to the house profile, including regional managers. */
export const HOUSE_PROFILE_ROLES: ReadonlySet<Role> = new Set([
  Role.SUPER_ADMIN,
  Role.LOAN_EXEC,
  Role.REGIONAL_MANAGER,
  Role.FIELD_REP,
]);

export function roleRequiresPartnerCompany(role: Role): boolean {
  return PARTNER_COMPANY_ROLES.has(role);
}

export function roleUsesHouseProfile(role: Role): boolean {
  return HOUSE_PROFILE_ROLES.has(role);
}
