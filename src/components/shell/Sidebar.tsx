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
              // `display: contents` so the group's items are direct flex
              // children of `.nav` and pick up its 1px gap. Structural, and
              // nothing in the sheet names it.
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
              <div className="hr" role="separator" />
              <button type="button" className="toollink" onClick={() => setToolsOpen(true)}>
                <Icon name="layers" size={17} />
                {!collapsed && <span>All tools</span>}
              </button>
            </>
          )}

          {nav.scopeNote && !collapsed && (
            // A card that has something to say — which is exactly what
            // `.callout` is for. `.c-acc` because a scoped account is
            // context, not a warning.
            <div className="callout c-acc navnote">
              <div className="grow">
                <span className="lbl">Scoped account</span>
                <div className="sub">{nav.scopeNote}</div>
              </div>
            </div>
          )}
        </nav>

        <div className="foot" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            // `.disc-h` is the sheet's "this summary line is a real button"
            // reset: full width, left aligned, inherited font, no chrome.
            className="disc-h"
          >
            <div className="avatar">{initials}</div>
            {!collapsed && (
              <div className="ident grow">
                <b>{user?.name || user?.email || "Signed in"}</b>
                <span className="sub">{nav.roleLabel}</span>
              </div>
            )}
          </button>

          {menuOpen && (
            <div
              role="menu"
              // Opens upward: this card sits at the bottom of the sidebar, so a
              // downward menu would clip outside the viewport. `.popmenu` owns
              // `top` and `right`, so the variant has to be a class — inline
              // would leave two owners for the same edges.
              className="popmenu up"
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
              <div className="hr" role="separator" />
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
              <div className="hr" role="separator" />
              {/* `.popmenu .mi` is a two-class selector and out-specifies a
                  bare `.danger`, so the destructive item needs its own rule
                  rather than an inline colour. */}
              <button
                type="button"
                className="mi danger"
                role="menuitem"
                onClick={handleSignOut}
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
