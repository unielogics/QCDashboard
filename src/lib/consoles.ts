// Consoles: which sign-ins a login may use.
//
// A console is a sign-in — Funding (app.), Field Desk (rep.), Audit (audit.).
// The role says what a person may do inside one; the console list says which
// ones they may open. The server is the rule (app/services/user_access.py,
// `_INHERITED_CONSOLES`): every Team row carries `inherited_account_types`
// from it, and /auth/me carries `consoles`. This map exists only where no row
// exists yet — the invite dialog — and mirrors the backend constant.
import { Role } from "@/lib/enums.generated";
import type { OperatorAccountAccessType } from "@/lib/types";

export const CONSOLE_LABELS: Record<OperatorAccountAccessType, string> = { funding: "Funding", field_desk: "Field Desk", audit: "Audit" };

export const INHERITED_CONSOLES: Record<string, OperatorAccountAccessType[]> = {
  [Role.SUPER_ADMIN]: ["funding", "field_desk", "audit"],
  [Role.LOAN_EXEC]: ["funding", "field_desk", "audit"],
  [Role.REGIONAL_MANAGER]: ["funding"],
  [Role.BROKER]: ["funding"],
  [Role.FIELD_REP]: ["field_desk", "audit"],
};

// What a super admin may toggle per role beyond what the role inherits. Audit
// is never a standalone grant for a broker or a regional manager: it arrives
// with Field Desk (the dealer-OS backend serves both rep. and audit.).
export const GRANTABLE_CONSOLES: Record<string, OperatorAccountAccessType[]> = {
  [Role.BROKER]: ["field_desk"],
  [Role.REGIONAL_MANAGER]: ["field_desk"],
  [Role.FIELD_REP]: ["funding"],
};

/** The roles that live in the operator consoles at all. */
export const OPERATOR_CONSOLE_ROLES = new Set<string>([Role.SUPER_ADMIN, Role.LOAN_EXEC, Role.REGIONAL_MANAGER, Role.BROKER, Role.FIELD_REP]);
