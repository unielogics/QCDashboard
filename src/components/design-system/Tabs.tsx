"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ds";

export type TabOption<T extends string> = { id: T; label: string; badge?: ReactNode };

/**
 * Tab control with two visual styles:
 * - "segmented" (default): pill segmented control (lifted from agent-settings),
 *   good for compact in-panel switches.
 * - "underline": corporate underline tab bar for section navigation inside a
 *   modal or a master-detail panel.
 * Both render from `.seg` / `.ftab` in the design-system sheet.
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
  if (variant === "underline") {
    return (
      // NOT `.ftabs`: that strip is fused to the bottom edge of a `.filehd`
      // and carries its hairline on TOP. A free-standing underline bar needs
      // the hairline UNDER it, which is the one declaration left inline here.
      // `.ftab` itself — padding, weight, the 2px underline and its `.on`
      // state — is the shared class.
      <div
        role="tablist"
        style={{
          display: "flex",
          gap: 4,
          overflowX: "auto",
          // Setting overflow-x to anything but visible makes overflow-y compute
          // to auto as well, and the active tab's 2px underline was enough to
          // trip it — a stray vertical scrollbar sat at the end of the strip.
          overflowY: "hidden",
          borderBottom: "1px solid var(--line)",
          width: fill ? "100%" : "fit-content",
        }}
      >
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(o.id)}
              className={cx("ftab", active && "on")}
              // `fill` spreads the strip across its container.
              style={fill ? { flex: 1, justifyContent: "center" } : undefined}
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
    // `.seg` is inline-flex; `.seg.fill` (app-extras) is the full-width
    // variant, because `display` cannot be owned by both a class and a style.
    <div role="tablist" className={cx("seg", fill && "fill")}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cx(active && "on")}
          >
            {o.label}
            {o.badge != null ? o.badge : null}
          </button>
        );
      })}
    </div>
  );
}
