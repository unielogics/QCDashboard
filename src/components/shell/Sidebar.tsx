"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Avatar } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

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
const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/pipeline", label: "Pipeline", icon: "layers" },
  { href: "/ai-inbox", label: "AI Inbox", icon: "bolt", roles: [Role.SUPER_ADMIN, Role.BROKER, Role.LOAN_EXEC] },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/messages", label: "Messages", icon: "chat" },
  { href: "/calendar", label: "Calendar", icon: "cal" },
  { href: "/documents", label: "Documents", icon: "doc" },
  { href: "/vault", label: "Vault", icon: "vault" },
  { href: "/simulator", label: "Simulate", icon: "calc" },
  { href: "/rates", label: "Rate Sheet", icon: "sliders", roles: [Role.SUPER_ADMIN, Role.BROKER, Role.LOAN_EXEC] },
  { href: "/reports", label: "Reports", icon: "trend", roles: [Role.SUPER_ADMIN, Role.BROKER, Role.LOAN_EXEC] },
  { href: "/rewards", label: "Rewards", icon: "trophy", roles: [Role.SUPER_ADMIN] },
  { href: "/settings", label: "Settings", icon: "gear", roles: [Role.SUPER_ADMIN] },
];

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  broker: "Account Exec",
  loan_exec: "Underwriter",
  client: "Borrower",
};

export default function Sidebar() {
  const { t } = useTheme();
  const pathname = usePathname();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const { data: user } = useCurrentUser();

  // Until /auth/me resolves, hide role-gated items rather than flicker.
  const items = NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role as Role)));

  const initials = user?.name
    ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";

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
        overflow: "hidden",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: collapsed ? "20px 16px" : "20px 18px",
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: `linear-gradient(135deg, ${t.brand}, ${t.petrol})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: t.inverse,
            fontWeight: 800,
            fontSize: 14,
            letterSpacing: 0.5,
            flexShrink: 0,
          }}
        >
          QC
        </div>
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
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
      </div>

      {/* Nav */}
      <nav
        style={{
          padding: "0 8px",
          display: "flex",
          flexDirection: "column",
          gap: 2,
          flex: 1,
          overflow: "auto",
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
            <Link
              href="/profile"
              title="Open profile"
              style={{
                flex: 1,
                minWidth: 0,
                textDecoration: "none",
                color: "inherit",
                cursor: "pointer",
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
            </Link>
          )}
        </div>
      </div>
      {/* Suppress unused warning for `initials` — kept for future fallback */}
      <span style={{ display: "none" }}>{initials}</span>
    </aside>
  );
}
