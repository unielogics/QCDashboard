// Navigation, as data.
//
// The sidebar used to hold six flat arrays, one per role, and the operator's ran
// to twenty items. Twenty things in one undifferentiated list is not a menu, it
// is a haystack — so the daily-use items are grouped and the occasional ones move
// behind "All tools".
//
// **Relocation is not removal.** Every item that used to be in a sidebar is
// still reachable; the ones that left the sidebar are in `tools`. If you remove
// something from here, remove its route too, or it becomes a page nobody can
// find and nobody knows to delete.
//
// Badge COUNTS are deliberately absent. Items carry a `BadgeKey` and
// useNavBadges() resolves it at runtime, so this file stays static and
// serializable — you can read the whole IA without running the app.

import { Role } from "@/lib/enums.generated";

export type BadgeKey =
  | "elaraTasks"
  | "myPipeline"
  | "dealerUnread"
  | "adminDealerUnread"
  | "vendorBuckets"
  | "myLeads";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: BadgeKey;
  /** "/" must match exactly or it lights up on every route. */
  match?: "exact" | "prefix";
  /** Runtime gate. Replaces the old imperative splice of the Gmail inbox item. */
  requires?: "gmail";
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export interface ToolItem {
  label: string;
  icon: string;
  href: string;
  desc?: string;
}

export interface ToolGroup {
  id: string;
  label: string;
  items: ToolItem[];
}

export interface RoleNav {
  /** Sub-line under the wordmark: names which console you are in. */
  shellLabel: string;
  roleLabel: string;
  groups: NavGroup[];
  /** Empty hides the "All tools" button entirely. */
  tools: ToolGroup[];
  /** Renders the "Scoped account" card for thin, allow-listed roles. */
  scopeNote?: string;
}

const COMMS: NavGroup = {
  id: "comms",
  label: "Communication",
  items: [
    { label: "Messages", href: "/messages", icon: "chat" },
    { label: "Inbox", href: "/inbox", icon: "mail", requires: "gmail" },
    { label: "Calendar", href: "/calendar", icon: "cal" },
  ],
};

const ANALYSIS_TOOLS: ToolGroup = {
  id: "analysis",
  label: "Analysis",
  items: [
    { label: "Deal analyzer", href: "/deal-analyzer", icon: "hammer", desc: "Model a fix & flip or rental" },
    { label: "Simulator", href: "/simulator", icon: "calc", desc: "Rate, DSCR and payment scenarios" },
    { label: "Rate sheet", href: "/rates", icon: "sliders", desc: "Current pricing by program" },
    { label: "Reports", href: "/reports", icon: "trend", desc: "Funded, pipeline and pull-through" },
  ],
};

export const NAV_BY_ROLE: Record<string, RoleNav> = {
  // ── Super admin ────────────────────────────────────────────────────────
  [Role.SUPER_ADMIN]: {
    shellLabel: "Operator console",
    roleLabel: "Super admin",
    groups: [
      {
        id: "desk",
        label: "Working desk",
        items: [
          { label: "Dashboard", href: "/", icon: "home", match: "exact" },
          { label: "Pipeline", href: "/pipeline", icon: "layers" },
          { label: "Elara inbox", href: "/ai-inbox", icon: "bolt", badge: "elaraTasks" },
          { label: "Clients", href: "/clients", icon: "clients" },
        ],
      },
      {
        id: "intake",
        label: "Intake and evidence",
        items: [
          { label: "Buckets", href: "/admin/buckets", icon: "lock" },
          { label: "AI intake", href: "/admin/ai-underwriter-leads", icon: "spark" },
          { label: "Vault", href: "/vault", icon: "vault" },
          { label: "Prequalifications", href: "/admin/prequal-requests", icon: "docCheck" },
        ],
      },
      COMMS,
    ],
    tools: [
      {
        id: "underwriting",
        label: "Underwriting",
        items: [
          { label: "Lenders", href: "/admin/lenders", icon: "building", desc: "Directory and appetite" },
        ],
      },
      ANALYSIS_TOOLS,
      {
        id: "admin",
        label: "Administration",
        items: [
          { label: "Settings", href: "/settings", icon: "gear", desc: "Firm-wide configuration" },
          { label: "Agreements", href: "/admin/agreements", icon: "docCheck", desc: "Contract templates and status" },
          { label: "Dealer messages", href: "/admin/dealer-messages", icon: "chat", desc: "Partner channel", },
          { label: "Rewards", href: "/rewards", icon: "trophy", desc: "Referral incentives" },
          { label: "Booking page", href: "/booking-settings", icon: "link", desc: "Your public scheduling link" },
        ],
      },
    ],
  },

  // ── Underwriter (loan exec) ────────────────────────────────────────────
  [Role.LOAN_EXEC]: {
    shellLabel: "Operator console",
    roleLabel: "Underwriter",
    groups: [
      {
        id: "desk",
        label: "Working desk",
        items: [
          { label: "Dashboard", href: "/", icon: "home", match: "exact" },
          { label: "Pipeline", href: "/pipeline", icon: "layers" },
          { label: "Elara inbox", href: "/ai-inbox", icon: "bolt", badge: "elaraTasks" },
          { label: "Clients", href: "/clients", icon: "clients" },
        ],
      },
      {
        id: "uw",
        label: "Underwriting",
        items: [
          { label: "Vault", href: "/vault", icon: "vault" },
          { label: "Prequalifications", href: "/admin/prequal-requests", icon: "docCheck" },
        ],
      },
      COMMS,
    ],
    tools: [
      ANALYSIS_TOOLS,
      {
        id: "admin",
        label: "Administration",
        items: [{ label: "Booking page", href: "/booking-settings", icon: "link" }],
      },
    ],
  },

  // ── Agent (broker) ─────────────────────────────────────────────────────
  [Role.BROKER]: {
    shellLabel: "Funding command centre",
    roleLabel: "Agent",
    groups: [
      {
        id: "desk",
        label: "My desk",
        items: [
          { label: "Dashboard", href: "/", icon: "home", match: "exact" },
          { label: "My pipeline", href: "/pipeline", icon: "layers", badge: "myPipeline" },
          { label: "Clients", href: "/clients", icon: "clients" },
        ],
      },
      {
        id: "comms",
        label: "Communication",
        items: [
          { label: "Messages", href: "/messages", icon: "chat" },
          { label: "Inbox", href: "/inbox", icon: "mail", requires: "gmail" },
          { label: "Calendar", href: "/calendar", icon: "cal" },
          { label: "Booking page", href: "/booking-settings", icon: "link" },
        ],
      },
    ],
    tools: [
      {
        id: "automation",
        label: "Automation",
        items: [
          { label: "Elara inbox", href: "/ai-inbox", icon: "bolt", desc: "Suggestions awaiting approval" },
          { label: "AI outreach", href: "/ai-agents", icon: "spark", desc: "Cadences and sequences" },
        ],
      },
      {
        id: "underwriting",
        label: "Underwriting",
        items: [
          { label: "Prequalifications", href: "/admin/prequal-requests", icon: "docCheck" },
        ],
      },
      ANALYSIS_TOOLS,
      {
        id: "admin",
        label: "Administration",
        items: [{ label: "Settings", href: "/agent-settings", icon: "gear" }],
      },
    ],
  },

  // ── Regional manager ───────────────────────────────────────────────────
  // Kept deliberately: this role is live in the Role enum and owns
  // /regional-agents. The design canvas does not show it, which is a gap in the
  // design rather than a decision to retire the role.
  [Role.REGIONAL_MANAGER]: {
    shellLabel: "Regional console",
    roleLabel: "Regional manager",
    groups: [
      {
        id: "desk",
        label: "Team desk",
        items: [
          { label: "Dashboard", href: "/", icon: "home", match: "exact" },
          { label: "Portfolio pipeline", href: "/pipeline", icon: "layers" },
          { label: "Agents", href: "/regional-agents", icon: "clients" },
          { label: "Clients", href: "/clients", icon: "clients" },
        ],
      },
      {
        id: "comms",
        label: "Communication",
        items: [
          { label: "Messages", href: "/messages", icon: "chat" },
          { label: "Inbox", href: "/inbox", icon: "mail", requires: "gmail" },
          { label: "Calendar", href: "/calendar", icon: "cal" },
          { label: "Booking page", href: "/booking-settings", icon: "link" },
        ],
      },
    ],
    tools: [
      {
        id: "analysis",
        label: "Analysis",
        items: [{ label: "Reports", href: "/reports", icon: "trend", desc: "Team performance" }],
      },
    ],
  },

  // ── Client (borrower) ──────────────────────────────────────────────────
  [Role.CLIENT]: {
    shellLabel: "Borrower view",
    roleLabel: "Client",
    groups: [
      {
        id: "mine",
        label: "My account",
        items: [
          { label: "Dashboard", href: "/", icon: "home", match: "exact" },
          { label: "My file", href: "/pipeline", icon: "layers" },
          { label: "Vault", href: "/vault", icon: "vault" },
        ],
      },
      {
        id: "comms",
        label: "Communication",
        items: [
          { label: "Messages", href: "/messages", icon: "chat" },
          { label: "Calendar", href: "/calendar", icon: "cal" },
          { label: "Profile", href: "/profile", icon: "user" },
        ],
      },
    ],
    tools: [],
    scopeNote: "You can see your own file and documents. Ask your advisor for anything else.",
  },

  // ── Vendor ─────────────────────────────────────────────────────────────
  [Role.VENDOR]: {
    shellLabel: "Vendor file rooms",
    roleLabel: "Vendor",
    groups: [
      {
        id: "vendor",
        label: "Vendor access",
        items: [
          { label: "Buckets", href: "/vendor/buckets", icon: "lock", badge: "vendorBuckets" },
          { label: "Profile", href: "/profile", icon: "user" },
        ],
      },
    ],
    tools: [],
    scopeNote: "You can see only the document rooms assigned to you.",
  },

  // ── Dealer partner ─────────────────────────────────────────────────────
  [Role.DEALER_PARTNER]: {
    shellLabel: "Referral portal",
    roleLabel: "Dealer partner",
    groups: [
      {
        id: "referrals",
        label: "Referrals",
        items: [
          { label: "My leads", href: "/broker/ai-underwriter-leads", icon: "spark", badge: "myLeads" },
          { label: "Messages", href: "/broker/messages", icon: "chat", badge: "dealerUnread" },
          { label: "Programs and resources", href: "/broker/programs", icon: "docCheck" },
          { label: "Profile", href: "/profile", icon: "user" },
        ],
      },
    ],
    tools: [],
    scopeNote: "You can see the leads you referred and the programs available to you.",
  },
};

/**
 * Roles with no entry of their own.
 *
 * LENDER and FIELD_REP previously fell through to the twenty-item operator nav
 * by accident — an omission, not a decision, and one that showed them admin
 * routes they cannot use. They get an explicit minimal shell instead.
 */
const MINIMAL: RoleNav = {
  shellLabel: "Console",
  roleLabel: "Member",
  groups: [
    {
      id: "desk",
      label: "Desk",
      items: [
        { label: "Dashboard", href: "/", icon: "home", match: "exact" },
        { label: "Messages", href: "/messages", icon: "chat" },
        { label: "Profile", href: "/profile", icon: "user" },
      ],
    },
  ],
  tools: [],
  scopeNote: "Limited access. Ask an administrator if you need more.",
};

export function navForRole(role: string | undefined | null): RoleNav {
  if (!role) return NAV_BY_ROLE[Role.CLIENT];
  return NAV_BY_ROLE[role] ?? MINIMAL;
}

/** True when `href` should render as the active nav item for `pathname`. */
export function isActive(item: NavItem, pathname: string): boolean {
  if (item.match === "exact" || item.href === "/") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
