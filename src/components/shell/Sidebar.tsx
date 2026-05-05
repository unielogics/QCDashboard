"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Avatar } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { ROLE_PROFILES, useActiveProfile, useRole } from "@/store/role";

interface NavItem {
  href: string;
  label: string;
  icon: string;
  needsKey?: keyof ReturnType<typeof useActiveProfile>["canSee"];
}

const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home" },
  { href: "/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/ai-inbox", label: "AI Inbox", icon: "ai", needsKey: "aiInbox" },
  { href: "/clients", label: "Clients", icon: "clients" },
  { href: "/messages", label: "Messages", icon: "messages" },
  { href: "/calendar", label: "Calendar", icon: "cal" },
  { href: "/documents", label: "Documents", icon: "vault" },
  { href: "/rates", label: "Rate Sheet", icon: "rates" },
  { href: "/reports", label: "Reports", icon: "reports" },
  { href: "/rewards", label: "Rewards", icon: "rewards", needsKey: "rewards" },
  { href: "/settings", label: "Settings", icon: "gear", needsKey: "settings" },
];

export default function Sidebar() {
  const { t } = useTheme();
  const pathname = usePathname();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const profile = useActiveProfile();
  const setRoleKey = useRole((s) => s.setActive);
  const activeKey = useRole((s) => s.activeKey);

  const items = NAV.filter((n) => !n.needsKey || profile.canSee[n.needsKey]);

  return (
    <aside style={{
      borderRight: `1px solid ${t.line}`,
      background: t.surface,
      display: "flex", flexDirection: "column", padding: 12,
    }}>
      {/* Logo + role pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px 14px" }}>
        <Avatar label="QC" color={t.brand} size={32} />
        {!collapsed && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.ink, lineHeight: 1.1 }}>Qualified</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 1.4 }}>OPERATOR CONSOLE</div>
          </div>
        )}
      </div>

      {/* Role chooser (visible label + transparent select overlay) */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: 10, marginBottom: 10,
        background: t.surface2, borderRadius: 10, border: `1px solid ${t.line}`, position: "relative",
      }}>
        <Avatar label={profile.name.split(" ").map(n => n[0]).slice(0, 2).join("")} color={t.petrol} size={28} />
        {!collapsed && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.name}</div>
            <div style={{ fontSize: 9.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              {profile.role.replace("_", " ")}
            </div>
          </div>
        )}
        {!collapsed && <Icon name="chevD" size={12} style={{ color: t.ink3 }} />}
        <select
          aria-label="View as"
          value={activeKey}
          onChange={(e) => setRoleKey(e.target.value as keyof typeof ROLE_PROFILES)}
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        >
          {Object.entries(ROLE_PROFILES).map(([k, p]) => (
            <option key={k} value={k}>View as {p.name} ({p.role})</option>
          ))}
        </select>
      </div>

      {/* Nav */}
      <nav style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, overflowY: "auto" }}>
        {items.map((n) => {
          const active = pathname === n.href || (n.href !== "/" && pathname.startsWith(n.href));
          return (
            <Link key={n.href} href={n.href} style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "9px 10px", borderRadius: 9,
              background: active ? t.brandSoft : "transparent",
              color: active ? t.ink : t.ink2,
              fontSize: 13, fontWeight: 600,
              border: `1px solid ${active ? t.line : "transparent"}`,
            }}>
              <Icon name={n.icon} size={16} />
              {!collapsed && <span>{n.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <button onClick={toggle} style={{
        marginTop: 8, padding: "8px 10px", borderRadius: 8,
        color: t.ink3, fontSize: 12, fontWeight: 600,
        display: "flex", alignItems: "center", gap: 8, justifyContent: collapsed ? "center" : "flex-start",
      }}>
        <Icon name={collapsed ? "chevR" : "chevL"} size={14} />
        {!collapsed && "Collapse"}
      </button>
    </aside>
  );
}
