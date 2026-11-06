"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import {
  useAITasks,
  useCurrentUser,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { usePrimaryShortcutLabel } from "@/lib/platformShortcuts";
import { cx } from "@/components/ds";
import { ConsoleSwitcher } from "./ConsoleSwitcher";
import { NotificationCenter } from "./NotificationCenter";
import styles from "./TopBar.module.css";

export default function TopBar() {
  const header = useRef<HTMLElement>(null);
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
  const searchShortcutLabel = usePrimaryShortcutLabel("k");

  const isClient = user?.role === Role.CLIENT;
  // Dealer partners are a thin external role with no per-loan/AI-task
  // workflows of their own — suppress the operator Elara toggle for them too
  // (but they're not borrowers, so the "borrower-view" badge below stays
  // client-only).
  const isDealerPartner = user?.role === Role.DEALER_PARTNER;
  const pendingTasks = tasks.filter((task) => task.status === "pending").length;

  useEffect(() => {
    const element = header.current;
    const app = element?.closest<HTMLElement>(".app");
    if (!element || !app) return;
    const measure = () => app.style.setProperty("--topbar-height", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => { observer.disconnect(); app.style.removeProperty("--topbar-height"); };
  }, []);

  return (
    <header ref={header} className={cx("top", styles.bar)}>
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
        onClick={() => isDealerPartner ? router.push("/broker/buckets") : setSearchOpen(true)}
        className={cx("btn topsearch", styles.search)}
      >
        <Icon name="search" size={14} />
        <span className="grow">{isDealerPartner ? "Search dealer leads and document rooms…" : "Search loans, clients, properties…"}</span>
        {!isDealerPartner ? <span className="kbd">{searchShortcutLabel}</span> : null}
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

      {/* Console switcher — the same authenticated account across Funding,
          Field Desk and Audit; the server says which of them this login may enter. */}
      <ConsoleSwitcher consoles={user?.consoles} current="funding" />

      <div className={styles.alerts}><NotificationCenter /></div>

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
