"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SignedIn, SignedOut, UserButton, useClerk } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Avatar } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { QCMark } from "@/components/QCMark";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  // role-gating: nav item only shows when current user role matches one of these
  // (omit to show for everyone)
  roles?: Role[];
}

// Icons match design (icons.jsx) — `bolt` for AI, `doc` for Documents,
// `trend` for Reports — not the previously-used aliases.
//
// Two NAV variants exist:
//
//   AGENT_NAV — the Funding Command Center IA for BROKER (Agent) users.
//   Reorganized around closing work: My Pipeline · Next Best Actions · Leads ·
//   Deals · Borrowers · Documents · AI Follow-Up · Messages · Funding
//   Packages · Performance.
//
//   OPERATOR_NAV — the existing firm-wide operator nav for Super Admin /
//   Underwriter / Borrower. Preserved per Architecture Rule #5: do not break
//   current operator workflows when reorganizing for Agents.
const AGENT_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/pipeline", label: "My Pipeline", icon: "layers" },
  { href: "/ai-inbox", label: "AI Inbox", icon: "bolt" },
  { href: "/clients", label: "Clients", icon: "clients" },
  // /vault intentionally omitted for agents — they collect docs from
  // INSIDE a deal (Documents tab on the loan/client detail page) rather
  // than from a global firm-wide vault. Operators keep their /vault
  // entry below.
  { href: "/messages", label: "Messages", icon: "chat" },
  { href: "/reports", label: "Performance", icon: "trend" },
  { href: "/agent-settings", label: "Settings", icon: "gear" },
];

const OPERATOR_NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/pipeline", label: "Pipeline", icon: "layers" },
  { href: "/ai-inbox", label: "AI Inbox", icon: "bolt", roles: [Role.SUPER_ADMIN, Role.LOAN_EXEC] },
  { href: "/clients", label: "Clients", icon: "clients", roles: [Role.SUPER_ADMIN, Role.LOAN_EXEC] },
  { href: "/vault", label: "Vault", icon: "vault" },
  { href: "/admin/prequal-requests", label: "Pre-Qual Queue", icon: "docCheck", roles: [Role.SUPER_ADMIN, Role.LOAN_EXEC] },
  { href: "/admin/lenders", label: "Lenders", icon: "building", roles: [Role.SUPER_ADMIN] },
  { href: "/messages", label: "Messages", icon: "chat" },
  { href: "/calendar", label: "Calendar", icon: "cal" },
  { href: "/simulator", label: "Simulate", icon: "calc" },
  { href: "/rates", label: "Rate Sheet", icon: "sliders", roles: [Role.SUPER_ADMIN, Role.LOAN_EXEC] },
  { href: "/reports", label: "Reports", icon: "trend", roles: [Role.SUPER_ADMIN, Role.LOAN_EXEC] },
  { href: "/rewards", label: "Rewards", icon: "trophy", roles: [Role.SUPER_ADMIN] },
  { href: "/settings", label: "Settings", icon: "gear", roles: [Role.SUPER_ADMIN] },
];

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  broker: "Agent",
  loan_exec: "Underwriter",
  client: "Client",
};

export default function Sidebar() {
  const { t } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const clerk = useClerk();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const { data: user } = useCurrentUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Pick the IA variant by role. Agents get the Funding Command Center IA;
  // every other role keeps the existing operator nav. Until /auth/me resolves,
  // hide role-gated items rather than flicker.
  const NAV = user?.role === Role.BROKER ? AGENT_NAV : OPERATOR_NAV;
  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role as Role)));

  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  // Click-outside + Escape close the identity popover.
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    setMenuOpen(false);
    try {
      await clerk.signOut({ redirectUrl: "/sign-in" });
    } catch {
      // If Clerk's signOut hiccups, push to /sign-in anyway so the user lands somewhere sensible.
      router.push("/sign-in");
    }
  };

  return (
    <aside
      style={{
        width: collapsed ? 68 : 232,
        flexShrink: 0,
        borderRight: `1px solid ${t.line}`,
        background: t.surface,
        display: "flex",
        flexDirection: "column",
        transition: "width .18s ease",
        // overflow:visible so the identity-card popover (which renders ABOVE
        // the footer with bottom:calc(100% + 8px)) isn't clipped by aside.
        // Internal regions (logo, nav) hide their own overflow as needed.
        // Height is inherited from the AppShell grid row (height:100vh) —
        // adding sticky/100vh here fights the grid and caused page-level
        // scroll on tall content.
        overflow: "visible",
      }}
    >
      {/* Logo + collapse toggle. The toggle persists to localStorage via the
          ui store so the user's choice survives a refresh. When collapsed,
          the toggle sits below the QC mark (no room beside it at 68px). */}
      <div
        style={{
          padding: collapsed ? "16px 8px 8px" : "20px 14px 20px 18px",
          display: "flex",
          flexDirection: collapsed ? "column" : "row",
          alignItems: "center",
          gap: collapsed ? 8 : 10,
          justifyContent: collapsed ? "center" : "flex-start",
        }}
      >
        <QCMark size={32} />
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, letterSpacing: -0.2 }}>Qualified</div>
            <div
              style={{
                fontSize: 10,
                fontWeight: 600,
                color: t.ink3,
                letterSpacing: 1.4,
                textTransform: "uppercase",
              }}
            >
              Operator Console
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            all: "unset",
            cursor: "pointer",
            width: 26,
            height: 26,
            borderRadius: 7,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: t.ink3,
            background: "transparent",
            border: `1px solid transparent`,
            transition: "background 120ms, border-color 120ms",
            flexShrink: 0,
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = t.surface2;
            (e.currentTarget as HTMLButtonElement).style.borderColor = t.line;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            (e.currentTarget as HTMLButtonElement).style.borderColor = "transparent";
          }}
        >
          <Icon name={collapsed ? "chevR" : "chevL"} size={14} stroke={2.4} />
        </button>
      </div>

      {/* Nav */}
      <nav
        style={{
          padding: "0 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flex: 1,
          // min-height:0 is REQUIRED for flex:1 children to actually shrink
          // and let overflow:auto kick in. Without it the nav pushes the
          // footer below the viewport when there are many nav items.
          minHeight: 0,
          overflowY: "auto",
          overflowX: "hidden",
        }}
      >
        {items.map((n) => {
          const active =
            n.href === "/"
              ? pathname === "/"
              : pathname === n.href || pathname.startsWith(n.href + "/");
          return (
            <Link
              key={n.href}
              href={n.href}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: collapsed ? "10px" : "9px 11px",
                borderRadius: 9,
                background: active ? t.brandSoft : "transparent",
                color: active ? t.ink : t.ink2,
                fontSize: 13,
                fontWeight: active ? 700 : 500,
                letterSpacing: -0.1,
                justifyContent: collapsed ? "center" : "flex-start",
                position: "relative",
                textDecoration: "none",
              }}
            >
              {/* Left-border active indicator (matches design) */}
              {active && !collapsed && (
                <div
                  style={{
                    position: "absolute",
                    left: -8,
                    top: 8,
                    bottom: 8,
                    width: 3,
                    borderRadius: 3,
                    background: t.brand,
                  }}
                />
              )}
              <Icon name={n.icon} size={17} stroke={active ? 2.4 : 1.8} />
              {!collapsed && <span style={{ flex: 1, textAlign: "left" }}>{n.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer — user identity + Clerk account menu (sign out, manage account).
          The Clerk <UserButton> renders an avatar that opens its own menu on
          click; we lay our name + role chips alongside it so the whole row
          reads as the operator's identity card. */}
      <div
        style={{
          padding: collapsed ? "10px 8px" : 12,
          borderTop: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 10,
            padding: collapsed ? "8px" : "8px 10px",
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          <SignedIn>
            <UserButton
              afterSignOutUrl="/sign-in"
              appearance={{
                elements: {
                  avatarBox: { width: 32, height: 32 },
                },
              }}
            />
          </SignedIn>
          <SignedOut>
            <Link
              href="/sign-in"
              aria-label="Sign in"
              style={{
                width: 32,
                height: 32,
                borderRadius: 999,
                background: t.petrol,
                color: t.inverse,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              <Icon name="user" size={16} />
            </Link>
          </SignedOut>

          {!collapsed && (
            <div ref={menuRef} style={{ flex: 1, minWidth: 0, position: "relative" }}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title="Account menu"
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "block",
                  width: "100%",
                  minWidth: 0,
                }}
              >
                {user ? (
                  <>
                    <div
                      style={{
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: t.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {user.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: t.ink3,
                        fontWeight: 600,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {ROLE_LABEL[user.role] ?? user.role}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink2 }}>Sign in</div>
                    <div
                      style={{
                        fontSize: 10.5,
                        color: t.ink3,
                        fontWeight: 600,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                      }}
                    >
                      Operator Console
                    </div>
                  </>
                )}
              </button>

              {menuOpen && user && (
                <div
                  role="menu"
                  // Float ABOVE the identity card since this card sits at the
                  // bottom of the sidebar — opening downward would clip outside
                  // the viewport.
                  style={{
                    position: "absolute",
                    bottom: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    background: t.surface,
                    border: `1px solid ${t.line}`,
                    borderRadius: 10,
                    boxShadow: t.shadowLg,
                    padding: 4,
                    zIndex: 60,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/profile");
                    }}
                    style={menuItemStyle(t)}
                    role="menuitem"
                  >
                    <Icon name="user" size={13} /> Open profile
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      router.push("/settings");
                    }}
                    style={{
                      ...menuItemStyle(t),
                      display: user.role === Role.SUPER_ADMIN ? "flex" : "none",
                    }}
                    role="menuitem"
                  >
                    <Icon name="gear" size={13} /> Settings
                  </button>
                  <div style={{ height: 1, background: t.line, margin: "3px 4px" }} />
                  <button onClick={handleSignOut} style={menuItemStyle(t, t.danger)} role="menuitem">
                    <Icon name="arrowR" size={13} /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Legal footer — collapsed mode hides the labels but the routes
          stay reachable from the URL bar / from /sign-up consent links. */}
      {!collapsed && (
        <div
          style={{
            padding: "6px 16px 12px",
            display: "flex",
            justifyContent: "center",
            gap: 10,
            fontSize: 10.5,
            color: t.ink4,
          }}
        >
          <Link href="/terms" style={{ color: "inherit", textDecoration: "none" }}>
            Terms
          </Link>
          <span aria-hidden>·</span>
          <Link href="/privacy" style={{ color: "inherit", textDecoration: "none" }}>
            Privacy
          </Link>
        </div>
      )}
      {/* Suppress unused warning for `initials` — kept for future fallback */}
      <span style={{ display: "none" }}>{initials}</span>
    </aside>
  );
}

function menuItemStyle(
  t: ReturnType<typeof useTheme>["t"],
  color?: string,
): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderRadius: 7,
    fontSize: 12.5,
    fontWeight: 600,
    color: color ?? t.ink,
  };
}
