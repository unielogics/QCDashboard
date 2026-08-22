"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useGoogleConnection } from "@/hooks/useApi";
import { isActive, navForRole, type NavItem } from "./nav.config";
import { ToolsDrawer } from "./ToolsDrawer";
import { useNavBadges } from "./useNavBadges";

function uniqueItems(items: NavItem[]): NavItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export function MobileBottomNav() {
  const pathname = usePathname() || "/";
  const { data: user } = useCurrentUser();
  const { data: googleConn } = useGoogleConnection();
  const [toolsOpen, setToolsOpen] = useState(false);
  const nav = navForRole(user?.role);
  const badges = useNavBadges(user?.role);

  const items = useMemo(
    () =>
      uniqueItems(
        nav.groups
          .flatMap((group) => group.items)
          .filter((item) => item.requires !== "gmail" || Boolean(googleConn?.gmail_connected)),
      ),
    [googleConn?.gmail_connected, nav.groups],
  );

  return (
    <>
      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
        <div className="mobile-bottom-nav-scroll">
          {items.map((item) => {
            const active = isActive(item, pathname);
            const count = item.badge ? badges[item.badge] ?? 0 : 0;
            return (
              <Link key={item.href} href={item.href} className={active ? "on" : ""}>
                <span className="mobile-bottom-nav-icon">
                  <Icon name={item.icon} size={18} />
                  {count > 0 ? <span className="mobile-bottom-nav-badge">{count > 99 ? "99+" : count}</span> : null}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
          {nav.tools.length > 0 ? (
            <button type="button" onClick={() => setToolsOpen(true)}>
              <span className="mobile-bottom-nav-icon"><Icon name="more" size={18} /></span>
              <span>More</span>
            </button>
          ) : null}
        </div>
      </nav>
      <ToolsDrawer open={toolsOpen} onClose={() => setToolsOpen(false)} groups={nav.tools} />
    </>
  );
}
