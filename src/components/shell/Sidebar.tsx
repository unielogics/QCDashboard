"use client";

// The sidebar: brand, grouped nav, all-tools, identity.
//
// It used to hold six flat per-role arrays inline — the operator's ran to twenty
// items — plus its own inline styling for every element. The lists now live in
// nav.config.ts as data, and everything here is `.side` / `.nav` / `.grp` /
// `.foot` from globals.css.
//
// Capability parity with the version this replaces, item for item: collapse with
// localStorage persistence, per-role item filtering, the Gmail-gated Inbox item,
// unread badges, the identity menu (profile, settings for super admin, sign
// out), and the Terms / Privacy / Disclosures links — which moved INTO the
// identity menu rather than being dropped. They must stay reachable for app
// store review.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Icon } from "@/components/design-system/Icon";
import { QCMark } from "@/components/QCMark";
import { useUI } from "@/store/ui";
import { SIGN_IN_URL } from "@/lib/appUrl";
import { useCurrentUser, useGoogleConnection } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { isActive, navForRole, type NavItem } from "./nav.config";
import { useNavBadges } from "./useNavBadges";
import { ToolsDrawer } from "./ToolsDrawer";

export function Sidebar() {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const clerk = useClerk();
  const { data: user } = useCurrentUser();
  const { data: googleConn } = useGoogleConnection();

  const collapsed = useUI((s) => s.sidebarCollapsed);
  const setCollapsed = useUI((s) => s.setSidebarCollapsed);

  const [menuOpen, setMenuOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const nav = navForRole(user?.role);
  const badges = useNavBadges(user?.role);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  async function handleSignOut() {
    try {
      await clerk.signOut({ redirectUrl: SIGN_IN_URL });
    } catch {
      // If Clerk's signOut hiccups, land the user somewhere sensible anyway.
      window.location.href = SIGN_IN_URL;
    }
  }

  /** Gmail-gated items disappear until the mailbox is actually connected. */
  const visible = (items: NavItem[]) =>
    items.filter((n) => n.requires !== "gmail" || Boolean(googleConn?.gmail_connected));

  const initials =
    (user?.name || user?.email || "?")
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?";

  return (
    <>
      <aside className="side">
        <div className="brand">
          <QCMark size={35} />
          {!collapsed && (
            <div>
              <b>Qualified</b>
              <span>{nav.shellLabel}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          className="navtoggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        >
          {collapsed ? "»" : "«"}
        </button>

        <nav className="nav">
          {nav.groups.map((g) => {
            const items = visible(g.items);
            if (!items.length) return null;
            return (
              <div key={g.id} style={{ display: "contents" }}>
                <div className="grp">{g.label}</div>
                {items.map((n) => {
                  const count = n.badge ? badges[n.badge] ?? 0 : 0;
                  return (
                    <Link
                      key={n.href}
                      href={n.href}
                      className={isActive(n, pathname) ? "on" : ""}
                      title={collapsed ? n.label : undefined}
                    >
                      <Icon name={n.icon} size={17} />
                      {!collapsed && <span className="navlbl">{n.label}</span>}
                      {count > 0 && (
                        <span className="bdg" aria-label={`${count} unread`}>
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            );
          })}

          {nav.tools.length > 0 && (
            <>
              <div style={{ height: 1, background: "var(--line)", margin: "12px 10px 8px" }} />
              <button type="button" className="toollink" onClick={() => setToolsOpen(true)}>
                <Icon name="layers" size={17} />
                {!collapsed && <span>All tools</span>}
              </button>
            </>
          )}

          {nav.scopeNote && !collapsed && (
            <div
              style={{
                margin: "12px 10px 0",
                padding: "10px 11px",
                border: "1px solid var(--line)",
                borderRadius: 10,
                background: "var(--sunken2)",
              }}
            >
              <span className="lbl" style={{ fontSize: 9.4 }}>
                Scoped account
              </span>
              <div className="sub" style={{ fontSize: 11.5, marginTop: 4, lineHeight: 1.45 }}>
                {nav.scopeNote}
              </div>
            </div>
          )}
        </nav>

        <div className="foot" ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              background: "none",
              border: 0,
              padding: 0,
              cursor: "pointer",
              width: "100%",
              textAlign: "left",
              minWidth: 0,
            }}
          >
            <div className="avatar">{initials}</div>
            {!collapsed && (
              <div className="ident" style={{ minWidth: 0, flex: 1 }}>
                <b style={{ fontSize: 12.5, display: "block", lineHeight: 1.2 }}>
                  {user?.name || user?.email || "Signed in"}
                </b>
                <span
                  className="sub"
                  style={{
                    fontSize: 10.5,
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                    fontWeight: 640,
                  }}
                >
                  {nav.roleLabel}
                </span>
              </div>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              className="popmenu"
              // Opens upward: this card sits at the bottom of the sidebar, so a
              // downward menu would clip outside the viewport.
              style={{ bottom: "calc(100% + 8px)", top: "auto", left: 0, right: 0 }}
            >
              <button
                type="button"
                className="mi"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  router.push("/profile");
                }}
              >
                Open profile
              </button>
              {user?.role === Role.SUPER_ADMIN && (
                <button
                  type="button"
                  className="mi"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/settings");
                  }}
                >
                  Settings
                </button>
              )}
              <div style={{ height: 1, background: "var(--line)", margin: "3px 4px" }} />
              {/* Legal links live here now rather than in a sidebar footer row.
                  They must stay reachable — app store review checks for them. */}
              <Link className="mi" href="/terms" role="menuitem" onClick={() => setMenuOpen(false)}>
                Terms
              </Link>
              <Link className="mi" href="/privacy" role="menuitem" onClick={() => setMenuOpen(false)}>
                Privacy
              </Link>
              <Link
                className="mi"
                href="/disclosures"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                Disclosures
              </Link>
              <div style={{ height: 1, background: "var(--line)", margin: "3px 4px" }} />
              <button
                type="button"
                className="mi"
                role="menuitem"
                onClick={handleSignOut}
                style={{ color: "var(--danger)" }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </aside>

      <ToolsDrawer open={toolsOpen} onClose={() => setToolsOpen(false)} groups={nav.tools} />
    </>
  );
}
