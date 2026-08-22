"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import {
  useAIChatThreads,
  useAITasks,
  useCurrentUser,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { AIChatPanel } from "@/components/AIChatPanel";
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
  const { data: chatThreads = [] } = useAIChatThreads();
  const { data: notificationData } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const hasUnreadChat = chatThreads.some((th) => th.unread);
  const searchShortcutLabel = usePrimaryShortcutLabel("k");
  // Elara chat — borrower-facing entry point.
  // Operators have the existing AIRail Elara for per-loan + AI-task
  // workflows; this is the cross-account, conversational surface
  // borrowers (and operators on borrower-style questions) reach for.
  // Open state lives in the UI store so other surfaces (e.g. the
  // /clients/[id]/workspace "Open AI Chat" button) can trigger it
  // without local prop drilling.
  // The chat slide-in is its own surface. It shared `aiOpen` with the Elara
  // suggestions rail, so one press opened both, stacked.
  const aiChatOpen = useUI((s) => s.chatOpen);
  const setAiChatOpen = useUI((s) => s.setChatOpen);

  const isClient = user?.role === Role.CLIENT;
  // Dealer partners are a thin external role with no per-loan/AI-task
  // workflows of their own — suppress the operator Elara toggle for them too
  // (but they're not borrowers, so the "borrower-view" badge below stays
  // client-only).
  const isDealerPartner = user?.role === Role.DEALER_PARTNER;
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

      {/* Funding ⇄ Audit system switcher — operators only. Both apps share
          the same Clerk application, so one sign-in works on app. and
          audit.qualifiedcommercial.com (Dealer Capital OS). */}
      {(user?.role === Role.SUPER_ADMIN || user?.role === Role.LOAN_EXEC) && (
        <a
          href="https://audit.qualifiedcommercial.com"
          title="Open Dealer Capital OS (audit.qualifiedcommercial.com) — same login"
          className="chip"
        >
          Funding{" "}
          {/* Two accents inside one chip: `.chip` owns its own colour and
              nothing owns these, so the pair stays inline. */}
          <span style={{ color: "var(--faint)" }}>⇄</span>{" "}
          <span style={{ color: "var(--accent)" }}>Audit</span>
        </a>
      )}

      {/* Elara chat — visible to all roles.
          Opens a right-side panel mirroring the mobile sheet. */}
      <button
        type="button"
        onClick={() => setAiChatOpen(true)}
        aria-label={hasUnreadChat ? "Elara — new message" : "Elara"}
        aria-pressed={aiChatOpen}
        title={hasUnreadChat ? "New Elara message" : "Ask Elara"}
        className={cx("btn", "sm", "iconbtn", "badged", aiChatOpen && "tone-pet")}
      >
        <Icon name="chat" size={14} />
        {hasUnreadChat ? <span className="unreaddot" /> : null}
      </button>

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

      {/* Elara toggle — only for non-client, non-dealer-partner roles, with
          pending-task badge. Account / sign-out controls live in the
          sidebar footer now. */}
      {!isClient && !isDealerPartner && (
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

      <AIChatPanel open={aiChatOpen} onClose={() => setAiChatOpen(false)} />
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
