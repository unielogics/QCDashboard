"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
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

export default function TopBar() {
  const { t, isDark, toggle } = useTheme();
  const router = useRouter();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
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
  const aiChatOpen = useUI((s) => s.aiOpen);
  const setAiChatOpen = useUI((s) => s.setAiOpen);

  const isClient = user?.role === Role.CLIENT;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;
  const notifications = notificationData?.items ?? [];
  const unreadCount = notificationData?.unread_count ?? 0;

  async function openNotification(id: string, deepLink: string | null) {
    await markRead.mutateAsync(id);
    setNotificationsOpen(false);
    if (deepLink) router.push(deepLink);
  }

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "12px 20px",
        borderBottom: `1px solid ${t.line}`,
        background: t.surface,
      }}
    >
      {/* Sidebar collapse toggle (lifted from sidebar footer to topbar per design) */}
      <button
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: `1px solid ${t.line}`,
          background: "transparent",
          color: t.ink2,
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="filter" size={14} />
      </button>

      {/* Search trigger — fixed-width 360px per design */}
      <button
        onClick={() => setSearchOpen(true)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: "7px 12px",
          borderRadius: 9,
          border: `1px solid ${t.line}`,
          background: t.surface2,
          width: 360,
          cursor: "pointer",
          fontFamily: "inherit",
          color: t.ink3,
          fontSize: 13,
          textAlign: "left",
        }}
      >
        <Icon name="search" size={14} style={{ color: t.ink3 }} />
        <span style={{ flex: 1, fontWeight: 500 }}>Search loans, clients, properties…</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: t.ink3,
            padding: "2px 6px",
            border: `1px solid ${t.line}`,
            borderRadius: 4,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          }}
        >
          {searchShortcutLabel}
        </span>
      </button>

      {/* Read-only badge for borrower-view (client role) */}
      {isClient && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "5px 10px",
            borderRadius: 8,
            background: t.profitBg,
            color: t.profit,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: 0.5,
            textTransform: "uppercase",
          }}
        >
          <Icon name="shield" size={11} />
          Borrower view · read-only
        </span>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        {/* Theme toggle — sun/moon per design */}
        <button
          onClick={toggle}
          title={isDark ? "Switch to light" : "Switch to dark"}
          aria-label="Toggle theme"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1px solid ${t.line}`,
            background: "transparent",
            color: t.ink2,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name={isDark ? "sun" : "moon"} size={14} />
        </button>

        {/* Elara chat — visible to all roles.
            Opens a right-side panel mirroring the mobile sheet. */}
        <button
          onClick={() => setAiChatOpen(true)}
          aria-label={hasUnreadChat ? "Elara — new message" : "Elara"}
          title={hasUnreadChat ? "New Elara message" : "Ask Elara"}
          style={{
            position: "relative",
            width: 32,
            height: 32,
            borderRadius: 8,
            border: `1px solid ${t.line}`,
            background: aiChatOpen ? t.petrolSoft : "transparent",
            color: aiChatOpen ? t.petrol : t.ink2,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="chat" size={14} />
          {hasUnreadChat ? (
            <span
              style={{
                position: "absolute",
                top: 4,
                right: 4,
                width: 8,
                height: 8,
                borderRadius: 999,
                background: t.danger,
                border: `1.5px solid ${aiChatOpen ? t.petrolSoft : t.bg}`,
              }}
            />
          ) : null}
        </button>

        {/* Notifications */}
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setNotificationsOpen((v) => !v)}
            aria-label={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
            title="Notifications"
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: `1px solid ${notificationsOpen ? t.petrol + "66" : t.line}`,
              background: notificationsOpen ? t.petrolSoft : "transparent",
              color: notificationsOpen ? t.petrol : t.ink2,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              position: "relative",
            }}
          >
            <Icon name="bell" size={14} />
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  minWidth: 17,
                  height: 17,
                  padding: "0 4px",
                  borderRadius: 999,
                  background: t.danger,
                  color: "#fff",
                  border: `1.5px solid ${t.surface}`,
                  fontSize: 10,
                  fontWeight: 800,
                  lineHeight: "15px",
                  textAlign: "center",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {notificationsOpen && (
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 40,
                width: 360,
                maxWidth: "calc(100vw - 32px)",
                borderRadius: 8,
                border: `1px solid ${t.line}`,
                background: t.surface,
                boxShadow: "0 18px 60px rgba(0,0,0,.28)",
                zIndex: 50,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "12px 14px",
                  borderBottom: `1px solid ${t.line}`,
                }}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>Notifications</div>
                  <div style={{ fontSize: 11, color: t.ink3 }}>{unreadCount} unread</div>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    style={{
                      border: `1px solid ${t.line}`,
                      background: "transparent",
                      color: t.ink2,
                      borderRadius: 7,
                      padding: "6px 8px",
                      fontSize: 11,
                      fontWeight: 800,
                      cursor: "pointer",
                    }}
                  >
                    Mark all read
                  </button>
                )}
              </div>
              <div style={{ maxHeight: 430, overflowY: "auto" }}>
                {notifications.length === 0 ? (
                  <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>No notifications yet.</div>
                ) : (
                  notifications.map((item) => {
                    const unread = !item.read_at;
                    return (
                      <button
                        key={item.id}
                        onClick={() => openNotification(item.id, item.deep_link)}
                        style={{
                          width: "100%",
                          display: "grid",
                          gridTemplateColumns: "18px 1fr",
                          gap: 10,
                          padding: "12px 14px",
                          border: 0,
                          borderBottom: `1px solid ${t.line}`,
                          background: unread ? t.surface2 : t.surface,
                          color: t.ink,
                          cursor: "pointer",
                          textAlign: "left",
                          fontFamily: "inherit",
                        }}
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: unread ? t.petrol : "transparent",
                            marginTop: 5,
                          }}
                        />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: "block", fontSize: 13, fontWeight: 800, color: t.ink, overflowWrap: "anywhere" }}>{item.title}</span>
                          <span style={{ display: "block", marginTop: 3, fontSize: 12, color: t.ink2, lineHeight: 1.35, overflowWrap: "anywhere" }}>{item.body}</span>
                          <span style={{ display: "block", marginTop: 6, fontSize: 10, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 800 }}>
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

        {/* Elara toggle — only for non-client roles, with pending-task badge.
            Account / sign-out controls live in the sidebar footer now. */}
        {!isClient && (
          <button
            onClick={() => setAiOpen(!aiOpen)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 12px",
              borderRadius: 9,
              background: aiOpen ? t.petrolSoft : "transparent",
              border: `1px solid ${aiOpen ? t.petrol + "40" : t.line}`,
              color: aiOpen ? t.petrol : t.ink2,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Icon name="bolt" size={14} />
            Elara
            {!aiOpen && pendingTasks > 0 && (
              <span
                style={{
                  minWidth: 18,
                  padding: "0 5px",
                  borderRadius: 999,
                  background: t.petrol,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {pendingTasks}
              </span>
            )}
          </button>
        )}
      </div>

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
