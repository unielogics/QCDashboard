"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useActiveProfile } from "@/store/role";

export default function TopBar() {
  const { t, isDark, toggle } = useTheme();
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const profile = useActiveProfile();

  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "12px 24px", borderBottom: `1px solid ${t.line}`, background: t.surface,
    }}>
      {/* Search trigger */}
      <button onClick={() => setSearchOpen(true)} style={{
        flex: 1, maxWidth: 540, display: "flex", alignItems: "center", gap: 10,
        padding: "8px 12px", borderRadius: 10,
        background: t.surface2, border: `1px solid ${t.line}`, color: t.ink3,
      }}>
        <Icon name="search" size={14} />
        <span style={{ fontSize: 13 }}>Search loans, clients, properties…</span>
        <span style={{
          marginLeft: "auto", fontSize: 11, fontWeight: 700,
          padding: "2px 6px", border: `1px solid ${t.line}`, borderRadius: 5,
        }}>⌘K</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Theme toggle */}
      <button onClick={toggle} title={isDark ? "Switch to light" : "Switch to dark"} style={{
        padding: 8, borderRadius: 8, color: t.ink2,
      }}>
        <Icon name={isDark ? "sparkles" : "shield"} size={16} />
      </button>

      {/* Notifications */}
      <button style={{ padding: 8, borderRadius: 8, color: t.ink2, position: "relative" }}>
        <Icon name="bell" size={16} />
        <span style={{
          position: "absolute", top: 6, right: 6, width: 6, height: 6,
          borderRadius: 999, background: t.danger,
        }} />
      </button>

      {/* Co-pilot toggle */}
      <button onClick={() => setAiOpen(!aiOpen)} style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "8px 12px", borderRadius: 10,
        background: aiOpen ? t.petrolSoft : t.brandSoft,
        color: aiOpen ? t.petrol : t.ink, fontSize: 13, fontWeight: 700,
        border: `1px solid ${t.line}`,
      }}>
        <Icon name="sparkles" size={14} />
        Co-pilot
      </button>

      {/* User avatar — Clerk-aware */}
      <SignedIn>
        <UserButton afterSignOutUrl="/sign-in" />
      </SignedIn>
      <SignedOut>
        <Link href="/sign-in" title={profile.email} style={{
          width: 32, height: 32, borderRadius: 16, background: t.petrol, color: "#fff",
          display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800,
        }}>
          {profile.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
        </Link>
      </SignedOut>
    </header>
  );
}
