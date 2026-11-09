"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type FocusEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { dialogPortalHost } from "@/lib/dialogStack";

type Note = { cell: HTMLElement; text: string };
const useClientLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** One preview per grid, outside its scroll box. Selection and editing stay with the grid. */
export function useNoteTooltip(disabled: boolean) {
  const id = useId();
  const [note, setNote] = useState<Note | null>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, width: 480 });
  const panel = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>();
  const cancelLeave = useCallback(() => clearTimeout(leaveTimer.current), []);
  const close = useCallback(() => { cancelLeave(); setNote(null); }, [cancelLeave]);
  const leave = useCallback(() => { cancelLeave(); leaveTimer.current = setTimeout(close, 180); }, [cancelLeave, close]);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);

  const show = (target: EventTarget | null) => {
    if (disabled || !(target instanceof HTMLElement)) return;
    const cell = target.closest<HTMLElement>("[data-note-preview]");
    const text = cell?.querySelector<HTMLElement>(".sg-text");
    if (!cell || !text || text.scrollWidth <= text.clientWidth + 1 || !text.textContent?.trim()) return;
    cancelLeave();
    setNote((current) => current?.cell === cell && current.text === text.textContent ? current : { cell, text: text.textContent! });
  };

  useClientLayoutEffect(() => {
    if (!note || disabled || !panel.current) return;
    const element = panel.current;
    // Match the application's image previews: the browser top layer escapes
    // overflow and transformed modal containers without arbitrary z-indexes.
    element.showPopover?.();
    const width = Math.min(480, window.innerWidth - 24);
    element.style.width = `${width}px`;
    const anchor = note.cell.getBoundingClientRect();
    const height = element.getBoundingClientRect().height;
    const below = anchor.bottom + 6;
    setPosition({
      width,
      left: Math.max(12, Math.min(anchor.left, window.innerWidth - width - 12)),
      top: Math.max(12, Math.min(below + height <= window.innerHeight - 12 ? below : anchor.top - height - 6, window.innerHeight - height - 12)),
    });
  }, [disabled, note]);

  useEffect(() => {
    if (!note || disabled) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
    };
    const scroll = (event: Event) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      close();
    };
    const pointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && panel.current?.contains(event.target)) return;
      close();
    };
    window.addEventListener("keydown", dismiss, true);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", close);
    window.addEventListener("pointerdown", pointerDown, true);
    return () => {
      window.removeEventListener("keydown", dismiss, true);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("pointerdown", pointerDown, true);
    };
  }, [close, disabled, note]);

  const onPointerOver = (event: PointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch" && !event.buttons) show(event.target);
  };
  const onPointerOut = (event: PointerEvent<HTMLElement>) => {
    if (event.relatedTarget instanceof Node && note?.cell.contains(event.relatedTarget)) return;
    leave();
  };
  const onFocus = (event: FocusEvent<HTMLElement>) => show(event.target);
  const visible = note && !disabled;

  return {
    close, onPointerOver, onPointerOut, onFocus, onBlur: leave,
    describedCell: visible ? note.cell.getAttribute("data-addr") : null,
    id,
    tooltip: visible ? createPortal(<div
      id={id} ref={panel} role="tooltip" popover="manual" className="sg-note-tooltip" style={position} tabIndex={-1}
      onPointerOver={(event) => { event.stopPropagation(); cancelLeave(); }}
      onPointerOut={(event) => { event.stopPropagation(); if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) leave(); }}
      onFocus={(event) => { event.stopPropagation(); cancelLeave(); }}
      onBlur={(event) => { event.stopPropagation(); leave(); }}
      onMouseDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onCopy={(event) => event.stopPropagation()}
      onCut={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Tab") {
          event.preventDefault();
          note.cell.focus({ preventScroll: true });
          close();
        }
      }}
    >{note.text}</div>, dialogPortalHost(note.cell)) : null,
  };
}
