"use client";

import type { MouseEvent } from "react";
import { cx } from "@/components/ds";
import { Icon } from "./Icon";

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
  // Tone and state resolve to classes, so hover, focus and the disabled dim
  // are CSS rather than the four JS handlers that used to mutate style on
  // mouseenter/leave/focus/blur — those never fired for a keyboard user
  // arriving by Tab without :focus-visible, and left the button re-painted
  // after an unmount mid-hover.
  const toneClass = tone === "danger" ? "danger" : tone === "brand" ? "tone-acc" : undefined;
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={title ?? label}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onClick(e);
      }}
      className={cx("btn", "sm", "iconbtn", toneClass, active && "tone-acc")}
    >
      {/* `.iconbtn svg` pins glyphs to 15px, and a CSS rule beats an SVG
          width/height ATTRIBUTE — so the public `size` prop has to be an
          inline style or it would silently stop doing anything. */}
      <Icon name={name} size={size} stroke={2.1} style={{ width: size, height: size }} />
    </button>
  );
}
