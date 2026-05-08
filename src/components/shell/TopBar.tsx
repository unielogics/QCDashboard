"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useAIChatThreads, useAITasks, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { AIChatPanel } from "@/components/AIChatPanel";

export default function TopBar() {
  const { t, isDark, toggle } = useTheme();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const { data: user } = useCurrentUser();
  const { data: tasks = [] } = useAITasks();
  const { data: chatThreads = [] } = useAIChatThreads();
  const hasUnreadChat = chatThreads.some((th) => th.unread);
  // AI Intelligent Underwriter chat — borrower-facing entry point.
  // Operators have the existing AIRail co-pilot for per-loan + AI-task
  // workflows; this is the cross-account, conversational surface
  // borrowers (and operators on borrower-style questions) reach for.
  const [aiChatOpen, setAiChatOpen] = useState(false);

  const isClient = user?.role === Role.CLIENT;
  const isAgent = user?.role === Role.BROKER;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;

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
          ⌘K
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
        {/* AI Secretary — agent-only entry point for account-wide
            questions ("how many leads this week?", "what did Marcus
            email me?", etc.). Opens the same AIChatPanel as the
            general chat icon — distinct affordance with the agent's
            name nearby so it feels like "your assistant". */}
        {isAgent && (
          <button
            onClick={() => setAiChatOpen(true)}
            aria-label="AI Secretary"
            title="AI Secretary — ask account-wide questions"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "7px 12px",
              borderRadius: 9,
              background: t.brandSoft,
              border: `1px solid ${t.brand}40`,
              color: t.brand,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <Icon name="spark" size={14} />
            {user?.name ? `${user.name.split(" ")[0]}'s AI` : "AI Secretary"}
          </button>
        )}

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

        {/* AI Intelligent Underwriter chat — visible to all roles.
            Opens a right-side panel mirroring the mobile sheet. */}
        <button
          onClick={() => setAiChatOpen(true)}
          aria-label={hasUnreadChat ? "AI Intelligent Underwriter — new message" : "AI Intelligent Underwriter"}
          title={hasUnreadChat ? "New AI message" : "Ask AI Intelligent Underwriter"}
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
        <button
          aria-label="Notifications"
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
            position: "relative",
          }}
        >
          <Icon name="bell" size={14} />
          <span
            style={{
              position: "absolute",
              top: 5,
              right: 6,
              width: 7,
              height: 7,
              borderRadius: 999,
              background: t.danger,
              border: `1.5px solid ${t.surface}`,
            }}
          />
        </button>

        {/* Co-pilot toggle — only for non-client roles, with pending-task badge.
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
            Co-pilot
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
