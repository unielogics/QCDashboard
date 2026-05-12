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
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";

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
}

const CLOSED: ContextMenuState<unknown> = { open: false, x: 0, y: 0, payload: null };

export function useContextMenu<T = unknown>() {
  const [state, setState] = useState<ContextMenuState<T>>(CLOSED as ContextMenuState<T>);
  const open = useCallback((e: React.MouseEvent, payload: T) => {
    e.preventDefault();
    setState({ open: true, x: e.clientX, y: e.clientY, payload });
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
  const { t } = useTheme();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state.open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    window.addEventListener("contextmenu", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("contextmenu", onClick);
    };
  }, [state.open, onClose]);

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

  return (
    <div
      ref={ref}
      role="menu"
      style={{
        position: "fixed",
        top, left,
        zIndex: 100,
        minWidth: MENU_W,
        background: t.surface,
        border: `1px solid ${t.lineStrong}`,
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
          disabled={item.disabled}
          onClick={() => {
            if (item.disabled) return;
            item.onSelect();
            onClose();
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
            color: item.disabled ? t.ink3 : item.tone === "danger" ? t.danger : t.ink,
            cursor: item.disabled ? "not-allowed" : "pointer",
            opacity: item.disabled ? 0.6 : 1,
            boxSizing: "border-box",
          }}
          onMouseEnter={(e) => {
            if (item.disabled) return;
            e.currentTarget.style.background = item.tone === "danger" ? t.dangerBg : t.surface2;
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
            <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>{item.hint}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
