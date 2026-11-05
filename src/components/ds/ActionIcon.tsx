"use client";

import type { MouseEventHandler } from "react";
import { Icon } from "@/components/design-system/Icon";
import { cx, IconBtn } from "./index";

/** An icon that does one thing, named on hover.
 *
 *  Rows of text buttons ("Edit request", "Pause", "Take over", "Preview",
 *  "Override AI", "Reassign", "Unlink"...) crowd a row until the words are the
 *  loudest thing on it. An icon with a tooltip carries the same action in a
 *  fraction of the room, and the label still reads to a screen reader.
 *
 *  The tooltip sits on a wrapper, not the button: browsers do not show a title
 *  on a disabled button, and a disabled action is exactly when the desk wants
 *  to know what it would have done.
 */
export function ActionIcon({
  icon,
  label,
  onClick,
  disabled,
  tone,
  pressed,
  busy,
  className,
}: {
  icon: string;
  /** What it does, in a few words. Shown on hover and read aloud. */
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  tone?: "default" | "pri" | "danger" | "ok";
  pressed?: boolean;
  busy?: boolean;
  className?: string;
}) {
  return (
    <span className="action-icon" title={label}>
      <IconBtn
        className={cx(tone === "pri" && "pri", tone === "danger" && "danger", tone === "ok" && "ok", busy && "busy", className)}
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled || busy}
        onClick={onClick}
      >
        <Icon name={icon} size={14} />
      </IconBtn>
    </span>
  );
}
