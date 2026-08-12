"use client";

import type { MouseEvent } from "react";
import { Icon } from "./Icon";
import { useTheme } from "./ThemeProvider";

/**
 * A single square icon action. ~25 files hand-rolled this same
 * <button><Icon/></button> markup with no shared hover/focus behavior; this is
 * the one primitive for modal/card/panel icon actions on the banking surfaces
 * (close = x, delete = trash, copy = copy, etc.).
 *
 * stopPropagation is built in so an icon action inside a clickable card or row
 * never also triggers the card's own onClick.
 */
export function IconButton({
  name,
  label,
  onClick,
  tone = "default",
  size = 15,
  disabled = false,
  active = false,
  title,
}: {
  name: string;
  label: string;
  onClick: (e: MouseEvent) => void;
  tone?: "default" | "danger" | "brand";
  size?: number;
  disabled?: boolean;
  active?: boolean;
  title?: string;
}) {
  const { t } = useTheme();
  const color = disabled
    ? t.ink4
    : tone === "danger"
      ? t.danger
      : tone === "brand"
        ? t.brand
        : t.ink2;
  const hoverBg = tone === "danger" ? t.dangerBg : t.surface2;
  return (
    <button
      type="button"
      aria-label={label}
      title={title ?? label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick(e);
      }}
      style={{
        all: "unset",
        boxSizing: "border-box",
        cursor: disabled ? "not-allowed" : "pointer",
        width: 30,
        height: 30,
        borderRadius: 8,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color,
        background: active ? t.surface2 : "transparent",
        transition: "background 120ms ease",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = hoverBg;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? t.surface2 : "transparent";
      }}
      onFocus={(e) => {
        e.currentTarget.style.outline = `2px solid ${t.brand}`;
        e.currentTarget.style.outlineOffset = "1px";
      }}
      onBlur={(e) => {
        e.currentTarget.style.outline = "none";
      }}
    >
      <Icon name={name} size={size} stroke={2.1} />
    </button>
  );
}
