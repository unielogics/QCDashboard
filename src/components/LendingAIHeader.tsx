"use client";

// Shared header for /admin/lending-ai/* pages.
// Provides consistent back navigation (← Lending AI) + page title.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";

interface Props {
  title: string;
  /** When provided, shows a sub-link under the title (e.g. for nested pages). */
  subtitle?: string | null;
  /** Where the back arrow goes. Defaults to /admin/lending-ai. */
  backHref?: string;
  backLabel?: string;
}


export function LendingAIHeader({
  title,
  subtitle,
  backHref = "/admin/lending-ai",
  backLabel = "Lending AI",
}: Props) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
        marginBottom: 4,
      }}>
        <Link
          href={backHref}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            fontSize: 12, fontWeight: 600, color: t.ink3,
            textDecoration: "none",
            padding: "4px 8px", borderRadius: 6,
            border: `1px solid ${t.line}`, background: t.surface,
          }}
        >
          <Icon name="chevL" size={11} /> {backLabel}
        </Link>
        <Link
          href="/settings"
          style={{
            fontSize: 11, fontWeight: 600, color: t.ink3,
            textDecoration: "none",
          }}
        >
          Settings
        </Link>
      </div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: "8px 0 4px" }}>
        {title}
      </h1>
      {subtitle ? (
        <p style={{ fontSize: 13, color: t.ink3, margin: 0, maxWidth: 720 }}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
