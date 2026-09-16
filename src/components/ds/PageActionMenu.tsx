"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/design-system/Icon";
import { restoreTransientFocus } from "@/lib/focusManagement";
import { IconBtn } from "./index";

export type PageActionMenuItem = {
  label: string;
  href?: string;
  onSelect?: () => void;
  hidden?: boolean;
  tone?: "default" | "danger";
};

const MENU_WIDTH = 232;
const MENU_GAP = 8;
const VIEWPORT_MARGIN = 12;

export function PageActionMenu({ items, label = "More actions" }: { items: PageActionMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerWrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const menuReceivedFocusRef = useRef(false);
  const visible = items.filter((item) => !item.hidden && (item.href || item.onSelect));

  const placeMenu = useCallback(() => {
    const trigger = triggerWrapRef.current;
    if (!trigger) return;

    const triggerRect = trigger.getBoundingClientRect();
    const measuredHeight = menuRef.current?.getBoundingClientRect().height;
    const menuHeight = measuredHeight || visible.length * 36 + 12;
    const roomBelow = window.innerHeight - triggerRect.bottom - VIEWPORT_MARGIN;
    const openAbove = roomBelow < menuHeight && triggerRect.top > roomBelow;
    const unclampedTop = openAbove
      ? triggerRect.top - MENU_GAP - menuHeight
      : triggerRect.bottom + MENU_GAP;

    setPosition({
      top: Math.max(VIEWPORT_MARGIN, Math.min(unclampedTop, window.innerHeight - menuHeight - VIEWPORT_MARGIN)),
      left: Math.max(
        VIEWPORT_MARGIN,
        Math.min(triggerRect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - VIEWPORT_MARGIN),
      ),
    });
  }, [visible.length]);

  useLayoutEffect(() => {
    if (open) placeMenu();
  }, [open, placeMenu]);

  useEffect(() => {
    if (!open) return;
    menuReceivedFocusRef.current = false;
    const trigger = triggerWrapRef.current?.querySelector<HTMLElement>("button") ?? null;
    const menu = menuRef.current;
    const focusFrame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    });
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key === "Tab") {
        setOpen(false);
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const choices = Array.from(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])') ?? []);
      if (!choices.length) return;
      event.preventDefault();
      const current = choices.indexOf(document.activeElement as HTMLElement);
      const next = event.key === "Home"
        ? 0
        : event.key === "End"
          ? choices.length - 1
          : event.key === "ArrowDown"
            ? current < 0 || current === choices.length - 1 ? 0 : current + 1
            : current <= 0 ? choices.length - 1 : current - 1;
      choices[next].focus({ preventScroll: true });
    };
    const reposition = () => placeMenu();
    window.addEventListener("keydown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      if (menuReceivedFocusRef.current) {
        restoreTransientFocus(trigger);
      }
    };
  }, [open, placeMenu]);

  if (!visible.length) return null;
  const closestWorkspace = typeof document !== "undefined"
    ? triggerWrapRef.current?.closest<HTMLElement>(".table-workspace") ?? null
    : null;
  // In focus mode the workspace itself is a viewport-sized, non-transformed
  // overlay, so keeping its menu inside preserves the focus trap. In normal
  // panels the menu still portals to body to escape overflow clipping.
  const portalHost = typeof document !== "undefined"
    ? closestWorkspace?.dataset.focused === "true" ? closestWorkspace : document.body
    : null;

  return (
    <span className="popwrap" ref={triggerWrapRef}>
      <IconBtn
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          if (!open) placeMenu();
          setOpen((value) => !value);
        }}
      >
        <Icon name="dots" size={15} />
      </IconBtn>
      {open && portalHost ? createPortal(
        <>
          <span className="menu-scrim menu-scrim--portal" onClick={() => setOpen(false)} />
          <span
            ref={menuRef}
            className="actmenu actmenu--portal"
            role="menu"
            aria-label={label}
            onFocusCapture={() => { menuReceivedFocusRef.current = true; }}
            style={{ top: position.top, left: position.left }}
          >
            {visible.map((item) => item.href ? (
              <Link
                key={item.label}
                href={item.href}
                role="menuitem"
                onClick={() => {
                  menuReceivedFocusRef.current = false;
                  const trigger = triggerWrapRef.current?.querySelector<HTMLElement>("button") ?? null;
                  trigger?.focus({ preventScroll: true });
                  setOpen(false);
                }}
                className={item.tone === "danger" ? "danger" : undefined}
              >
                {item.label}
              </Link>
            ) : (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={item.tone === "danger" ? "danger" : undefined}
                onClick={() => {
                  menuReceivedFocusRef.current = false;
                  const trigger = triggerWrapRef.current?.querySelector<HTMLElement>("button") ?? null;
                  trigger?.focus({ preventScroll: true });
                  setOpen(false);
                  item.onSelect?.();
                }}
              >
                {item.label}
              </button>
            ))}
          </span>
        </>
      , portalHost) : null}
    </span>
  );
}
