"use client";

import type { ReactNode } from "react";
import { useTheme } from "./ThemeProvider";

export type TabOption<T extends string> = { id: T; label: string; badge?: ReactNode };

/**
 * Tab control with two visual styles:
 * - "segmented" (default): pill segmented control (lifted from agent-settings),
 *   good for compact in-panel switches.
 * - "underline": corporate underline tab bar for section navigation inside a
 *   modal or a master-detail panel.
 * Themed entirely via useTheme() tokens.
 */
export function Tabs<T extends string>({
  value,
  onChange,
  options,
  variant = "segmented",
  fill = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: TabOption<T>[];
  variant?: "segmented" | "underline";
  fill?: boolean;
}) {
  const { t } = useTheme();

  if (variant === "underline") {
    return (
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          borderBottom: `1px solid ${t.line}`,
          width: fill ? "100%" : "fit-content",
        }}
      >
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.id)}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "9px 13px",
                fontSize: 13,
                fontWeight: active ? 800 : 600,
                color: active ? t.ink : t.ink3,
                borderBottom: `2px solid ${active ? t.brand : "transparent"}`,
                marginBottom: -1,
                flex: fill ? 1 : undefined,
                justifyContent: fill ? "center" : undefined,
              }}
            >
              {o.label}
              {o.badge != null ? o.badge : null}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="tablist"
      style={{
        display: "flex",
        gap: 4,
        padding: 3,
        background: t.surface2,
        borderRadius: 9,
        width: fill ? "100%" : "fit-content",
      }}
    >
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              justifyContent: "center",
              padding: "6px 11px",
              borderRadius: 7,
              fontSize: 12,
              fontWeight: 600,
              background: active ? t.surface : "transparent",
              color: active ? t.ink : t.ink3,
              boxShadow: active ? `0 1px 2px ${t.line}` : "none",
              flex: fill ? 1 : undefined,
            }}
          >
            {o.label}
            {o.badge != null ? o.badge : null}
          </button>
        );
      })}
    </div>
  );
}
