"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import {
  useAITasks,
  useCurrentUser,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { usePrimaryShortcutLabel } from "@/lib/platformShortcuts";
import { cx } from "@/components/ds";

// Restyled onto `.top` / `.btn` / `.chip` / `.popcard` from the design-system
// sheet. Every control, role gate, badge and title below is the one that was
// here before — this file is imported by the whole authenticated app, so
// nothing about what it can do changed.

export default function TopBar() {
  const router = useRouter();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const theme = useUI((s) => s.theme);
  const toggleTheme = useUI((s) => s.toggleTheme);
  const { data: user } = useCurrentUser();
  const { data: tasks = [] } = useAITasks();
  const { data: notificationData } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const searchShortcutLabel = usePrimaryShortcutLabel("k");

  const isClient = user?.role === Role.CLIENT;
  // Dealer partners are a thin external role with no per-loan/AI-task
  // workflows of their own — suppress the operator Elara toggle for them too
  // (but they're not borrowers, so the "borrower-view" badge below stays
  // client-only).
  const isDealerPartner = user?.role === Role.DEALER_PARTNER;
  const isOperatorSwitcher = user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC;
  const isDualClient = user?.account_types?.includes("funding") && user.account_types.includes("audit");
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const notifications = notificationData?.items ?? [];
  const unreadCount = notificationData?.unread_count ?? 0;

  async function openNotification(id: string, deepLink: string | null) {
    await markRead.mutateAsync(id);
    setNotificationsOpen(false);
    if (deepLink) router.push(deepLink);
  }

  return (
    <header className="top">
      {/* Sidebar collapse toggle (lifted from sidebar footer to topbar per design) */}
      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-pressed={collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="btn sm iconbtn"
      >
        <Icon name="filter" size={14} />
      </button>

      {/* Search trigger — fixed-width 360px per design */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        className="btn topsearch"
        // A fixed 360px rail is this bar's own measurement, not a system step.
        style={{ width: 360 }}
      >
        <Icon name="search" size={14} />
        <span className="grow">Search loans, clients, properties…</span>
        <span className="kbd">{searchShortcutLabel}</span>
      </button>

      {/* Read-only badge for borrower-view (client role) */}
      {isClient && (
        <span className="cellchip caps c-ok">
          <Icon name="shield" size={11} />
          Borrower view · read-only
        </span>
      )}

      <span className="sp" />

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light theme" : "Switch to Obsidian theme"}
        aria-pressed={theme === "dark"}
        title={theme === "dark" ? "Light theme" : "Obsidian theme"}
        className={cx("btn", "sm", "themebtn", theme === "dark" && "tone-acc")}
      >
        <Icon name={theme === "dark" ? "sun" : "moon"} size={14} />
        <span className="themebtn-l">{theme === "dark" ? "Light" : "Obsidian"}</span>
      </button>

      {/* Console switcher — operators keep the same authenticated account
          while moving between Funding, Field Desk, and Audit. */}
      {(isOperatorSwitcher || isDualClient) && (
        <div className="chip" aria-label="Console switcher">
          <b>Funding</b>
          {isOperatorSwitcher ? <><span style={{ color: "var(--faint)" }}>·</span><a href="https://rep.qualifiedcommercial.com" title="Open Field Desk under the same account" style={{ color: "var(--accent)", textDecoration: "none" }}>Field Desk</a></> : null}
          <span style={{ color: "var(--faint)" }}>·</span>
          <a href="https://audit.qualifiedcommercial.com" title="Open Audit under the same account" style={{ color: "var(--accent)", textDecoration: "none" }}>Audit</a>
        </div>
      )}

      {/* Notifications */}
      <div className="popwrap">
        <button
          type="button"
          onClick={() => setNotificationsOpen((v) => !v)}
          aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
          title="Notifications"
          className={cx("btn", "sm", "iconbtn", "badged", notificationsOpen && "tone-pet")}
        >
          <Icon name="bell" size={14} />
          {unreadCount > 0 && (
            <span className="cnt sm">{unreadCount > 9 ? "9+" : unreadCount}</span>
          )}
        </button>
        {notificationsOpen && (
          <div className="popcard" aria-label="Notifications">
            <div className="panel-h">
              <div className="grow">
                <b>Notifications</b>
                <div className="sub">{unreadCount} unread</div>
              </div>
              {unreadCount > 0 && (
                <button type="button" className="btn sm" onClick={() => markAllRead.mutate()}>
                  Mark all read
                </button>
              )}
            </div>
            {/* A bounded scroller: the cap is this popover's own geometry. */}
            <div style={{ maxHeight: 430, overflowY: "auto" }}>
              {notifications.length === 0 ? (
                <div className="panel-b sub">No notifications yet.</div>
              ) : (
                notifications.map((item) => {
                  const unread = !item.read_at;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => openNotification(item.id, item.deep_link)}
                      // `.filerow.tone-acc` carries "unread" on the whole row:
                      // this list is SCANNED, and a dot alone means reading
                      // every row to find the new ones.
                      className={cx("filerow", "notifrow", unread && "tone-acc")}
                    >
                      <span
                        className="repdot"
                        // Presence of the dot is per-item state.
                        style={{ background: unread ? "var(--petrol)" : "transparent" }}
                      />
                      <span className="grow">
                        <b>{item.title}</b>
                        <span className="sub">{item.body}</span>
                        <span className="lbl">
                          {item.category} · {formatNotificationTime(item.created_at)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* One Elara control opens the shared chat, task, and context rail. */}
      {!isDealerPartner && (
        <button
          type="button"
          onClick={() => setAiOpen(!aiOpen)}
          aria-pressed={aiOpen}
          className={cx("btn", aiOpen && "tone-pet")}
        >
          <Icon name="bolt" size={14} />
          Elara
          {!aiOpen && pendingTasks > 0 && <span className="cnt sm pet">{pendingTasks}</span>}
        </button>
      )}

    </header>
  );
}

function formatNotificationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Date.now() - date.getTime();
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
