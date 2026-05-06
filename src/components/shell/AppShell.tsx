"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import AIRail from "./AIRail";
import GlobalSearch from "./GlobalSearch";
import { useUI } from "@/store/ui";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useCurrentUser } from "@/hooks/useApi";
import { useRecordPendingConsent } from "@/hooks/useRecordPendingConsent";
import { _setActiveProfileFromUser } from "@/store/role";

export default function AppShell({ children }: { children: ReactNode }) {
  const { t } = useTheme();
  const pathname = usePathname();
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const { data: user } = useCurrentUser();
  // Flush any pending sign-up consent (from localStorage) into the
  // /legal/accept audit table once the user resolves.
  useRecordPendingConsent();

  // Mirror the real /auth/me user into the legacy useActiveProfile() shim so
  // older call sites keep working while we migrate them off.
  useEffect(() => {
    _setActiveProfileFromUser(user ?? null);
  }, [user]);

  // Auto-close the AI rail on screen change (per chat2.md final state)
  useEffect(() => { setAiOpen(false); }, [pathname, setAiOpen]);

  // ⌘K opens GlobalSearch
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  // Sidebar manages its own collapsed/expanded width internally now.
  // Reference sidebarCollapsed to keep the dependency tracked (drives
  // the sidebar's transition, not the grid).
  void sidebarCollapsed;
  const railW = aiOpen ? 360 : 0;

  // Auth + public-legal pages render bare — no sidebar / topbar / AI rail.
  // /terms and /privacy must be reachable without auth (signup consent links
  // point to them, and Apple/Google review require public legal URLs).
  const isBareRoute =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy");
  if (isBareRoute) {
    return <div style={{ background: t.bg, minHeight: "100vh" }}>{children}</div>;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `auto 1fr ${railW}px`,
        height: "100vh",
        background: t.bg,
        transition: "grid-template-columns .2s ease",
      }}
    >
      <Sidebar />
      {/* min-height:0 + minWidth:0 are REQUIRED on the flex column so the
          inner <main> can actually shrink and scroll instead of pushing the
          page taller than the viewport. Without min-height:0 the column
          grows to fit children's content and the whole document scrolls. */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <TopBar />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 24 }}>{children}</main>
      </div>
      <AIRail />
      <GlobalSearch />
    </div>
  );
}
