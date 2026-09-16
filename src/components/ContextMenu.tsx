"use client";

// ContextMenu — small reusable right-click menu.
//
// Usage:
//   const menu = useContextMenu();
//   <div onContextMenu={menu.open}>...</div>
//   <ContextMenu state={menu.state} onClose={menu.close} items={[...]} />
//
// Why a hook + a component instead of one big wrapper: the menu has
// to be positioned at the cursor's viewport coords, so it needs a
// portal-friendly fixed render. Multiple rows can share one menu
// instance — open just stamps the right row's id into state.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { V } from "@/components/design-system/cssVars";
import { Icon } from "@/components/design-system/Icon";
import { restoreTransientFocus } from "@/lib/focusManagement";

export interface ContextMenuItem {
  label: string;
  icon?: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  hint?: string;
}

export interface ContextMenuState<T = unknown> {
  open: boolean;
  x: number;
  y: number;
  payload: T | null;
  portalHost: HTMLElement | null;
  returnFocus: HTMLElement | null;
}

const CLOSED: ContextMenuState<unknown> = { open: false, x: 0, y: 0, payload: null, portalHost: null, returnFocus: null };

export function useContextMenu<T = unknown>() {
  const [state, setState] = useState<ContextMenuState<T>>(CLOSED as ContextMenuState<T>);
  const open = useCallback((e: React.MouseEvent, payload: T) => {
    e.preventDefault();
    const trigger = e.currentTarget instanceof HTMLElement ? e.currentTarget : null;
    if (trigger && trigger.tabIndex < 0) trigger.tabIndex = -1;
    const workspace = trigger?.closest<HTMLElement>(".table-workspace") ?? null;
    setState({
      open: true,
      x: e.clientX,
      y: e.clientY,
      payload,
      portalHost: workspace?.dataset.focused === "true" ? workspace : null,
      returnFocus: trigger,
    });
  }, []);
  const close = useCallback(() => setState(CLOSED as ContextMenuState<T>), []);
  return { state, open, close };
}

export function ContextMenu<T>({
  state, onClose, items,
}: {
  state: ContextMenuState<T>;
  onClose: () => void;
  /** items can be a static array OR a function of the active payload.
   *  Lets callers compute "Mark complete" vs "Unmark complete" off the
   *  row that was right-clicked. */
  items: ContextMenuItem[] | ((payload: T) => ContextMenuItem[]);
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const menuReceivedFocusRef = useRef(false);

  useEffect(() => {
    if (!state.open) return;
    menuReceivedFocusRef.current = false;
    const menu = ref.current;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstItem = menu?.querySelector<HTMLButtonElement>("button:not([disabled])");
      (firstItem ?? menu)?.focus({ preventScroll: true });
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "Tab") {
        onClose();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
      const choices = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]:not([disabled])') ?? []);
      if (!choices.length) return;
      e.preventDefault();
      const current = choices.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.key === "Home"
        ? 0
        : e.key === "End"
          ? choices.length - 1
          : e.key === "ArrowDown"
            ? current < 0 || current === choices.length - 1 ? 0 : current + 1
            : current <= 0 ? choices.length - 1 : current - 1;
      choices[next].focus({ preventScroll: true });
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("contextmenu", onClick);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("contextmenu", onClick);
      if (menuReceivedFocusRef.current) {
        restoreTransientFocus(state.returnFocus);
      }
    };
  }, [state.open, state.returnFocus, onClose]);

  if (!state.open || state.payload === null) return null;
  const resolved = typeof items === "function" ? items(state.payload) : items;
  if (resolved.length === 0) return null;

  // Clamp to viewport so the menu doesn't open off-screen at the
  // page edges.
  const MENU_W = 220;
  const MENU_H_PER_ITEM = 32;
  const totalH = resolved.length * MENU_H_PER_ITEM + 8;
  const left = typeof window !== "undefined" && state.x + MENU_W > window.innerWidth
    ? Math.max(8, window.innerWidth - MENU_W - 8)
    : state.x;
  const top = typeof window !== "undefined" && state.y + totalH > window.innerHeight
    ? Math.max(8, window.innerHeight - totalH - 8)
    : state.y;

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label="Row actions"
      tabIndex={-1}
      onFocusCapture={() => { menuReceivedFocusRef.current = true; }}
      style={{
        position: "fixed",
        top, left,
        zIndex: 100,
        minWidth: MENU_W,
        background: V.surface,
        border: `1px solid ${V.lineStrong}`,
        borderRadius: 9,
        boxShadow: "0 14px 32px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.10)",
        padding: 4,
        fontFamily: "inherit",
      }}
    >
      {resolved.map((item, i) => (
        <button
          key={`${item.label}-${i}`}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            menuReceivedFocusRef.current = false;
            state.returnFocus?.focus({ preventScroll: true });
            onClose();
            item.onSelect();
          }}
          style={{
            all: "unset",
            display: "flex",
            alignItems: "center",
            gap: 9,
            width: "100%",
            padding: "7px 10px",
            borderRadius: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color: item.disabled ? V.ink3 : item.tone === "danger" ? V.danger : V.ink,
            cursor: item.disabled ? "not-allowed" : "pointer",
            opacity: item.disabled ? 0.6 : 1,
            boxSizing: "border-box",
          }}
          onMouseEnter={(e) => {
            if (item.disabled) return;
            e.currentTarget.style.background = item.tone === "danger" ? V.dangerBg : V.surface2;
          }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          {item.icon ? (
            <span style={{ width: 14, display: "inline-flex", justifyContent: "center", color: "currentColor" }}>
              <Icon name={item.icon} size={13} stroke={2.2} />
            </span>
          ) : (
            <span style={{ width: 14 }} />
          )}
          <span style={{ flex: 1 }}>{item.label}</span>
          {item.hint ? (
            <span style={{ fontSize: 10.5, color: V.ink3, fontWeight: 700 }}>{item.hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
  if (typeof document === "undefined") return menu;
  return createPortal(menu, state.portalHost ?? document.body);
}
