"use client";

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/design-system/Icon";
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
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const reposition = () => placeMenu();
    window.addEventListener("keydown", close);
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, placeMenu]);

  if (!visible.length) return null;

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
      {open && typeof document !== "undefined" ? createPortal(
        <>
          <span className="menu-scrim menu-scrim--portal" onClick={() => setOpen(false)} />
          <span
            ref={menuRef}
            className="actmenu actmenu--portal"
            role="menu"
            aria-label={label}
            style={{ top: position.top, left: position.left }}
          >
            {visible.map((item) => item.href ? (
              <Link key={item.label} href={item.href} role="menuitem" onClick={() => setOpen(false)} className={item.tone === "danger" ? "danger" : undefined}>
                {item.label}
              </Link>
            ) : (
              <button key={item.label} type="button" role="menuitem" className={item.tone === "danger" ? "danger" : undefined} onClick={() => { setOpen(false); item.onSelect?.(); }}>
                {item.label}
              </button>
            ))}
          </span>
        </>
      , document.body) : null}
    </span>
  );
}
