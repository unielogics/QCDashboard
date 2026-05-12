"use client";

// Stateless tab strip for the unified workspace. Numeric pills come
// from WorkspaceData.tab_counts. When v2 is OFF (or for legacy
// fallback) the caller passes a smaller `tabs` list.

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import type { WorkspaceTabId, WorkspaceTabCounts } from "@/lib/types";

export interface TabSpec {
  id: WorkspaceTabId;
  label: string;
  icon: "home" | "vault" | "trend" | "doc" | "chat" | "bolt" | "spark" | "file" | "cal";
}

interface Props {
  tabs: TabSpec[];
  active: WorkspaceTabId;
  onChange: (id: WorkspaceTabId) => void;
  counts?: WorkspaceTabCounts;
}

export function ClientWorkspaceTabs({ tabs, active, onChange, counts }: Props) {
  const { t } = useTheme();
  return (
    <div
      style={{
        display: "flex",
        gap: 4,
        borderBottom: `1px solid ${t.line}`,
        paddingBottom: 0,
        flexWrap: "wrap",
      }}
    >
      {tabs.map((x) => {
        const pill = pillForTab(x.id, counts);
        const isActive = active === x.id;
        return (
          <button
            key={x.id}
            onClick={() => onChange(x.id)}
            style={{
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 600,
              border: "none",
              background: "transparent",
              color: isActive ? t.ink : t.ink3,
              borderBottom: `2px solid ${isActive ? t.petrol : "transparent"}`,
              cursor: "pointer",
              marginBottom: -1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name={x.icon} size={13} />
            {x.label}
            {pill !== null ? (
              <span
                style={{
                  marginLeft: 2,
                  padding: "1px 6px",
                  fontSize: 10,
                  fontWeight: 700,
                  borderRadius: 999,
                  background: isActive ? t.brandSoft : t.surface2,
                  color: isActive ? t.brand : t.ink3,
                  minWidth: 16,
                  textAlign: "center",
                }}
              >
                {pill}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

function pillForTab(id: WorkspaceTabId, counts?: WorkspaceTabCounts): number | null {
  if (!counts) return null;
  switch (id) {
    case "deals":
      return counts.deals;
    case "funding":
      return counts.funding;
    case "tasks":
      return counts.tasks;
    case "ai-follow-up":
      return counts.ai_follow_up;
    case "documents":
      return counts.documents;
    default:
      return null;
  }
}
