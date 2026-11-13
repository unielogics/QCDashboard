"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Drawer } from "@/components/ds/Drawer";
import styles from "./OperatingChangeConfiguration.module.css";

export type OperatingConfigurationRequest = { key: number; actionId: string; field?: string };

/** Configuration edits use the existing working body and autosave, including incomplete drafts. */
export function OperatingChangeConfiguration({ open, onClose, children, focusLabel, attention }: { attention?: boolean; open: boolean; onClose: () => void; children: ReactNode; focusLabel?: string }) {
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || !focusLabel) return;
    let frame = 0, attempts = 0, cancelled = false;
    const focus = () => {
      if (cancelled) return;
      const node = content.current;
      const target = [...(node?.querySelectorAll<HTMLElement>("[aria-label]") || [])].find(item => item.getAttribute("aria-label") === focusLabel);
      if (!target || target.closest('[aria-hidden="true"],[inert]')) { if (++attempts < 40) frame = requestAnimationFrame(focus); return; }
      let parent = target.parentElement; while (parent && node?.contains(parent)) { if (parent instanceof HTMLDetailsElement) parent.open = true; parent = parent.parentElement; }
      target.focus({ preventScroll: true }); target.scrollIntoView({ block: "nearest" });
    };
    frame = requestAnimationFrame(focus);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [open, focusLabel]);
  return <Drawer open={open} onClose={onClose} title="Configure planned change" ariaLabel="Configure planned change" width="md" footer={<button className={styles.done} type="button" onClick={onClose}>Done</button>}>
    <div ref={content} className={`${styles.content} ${attention ? styles.attention : ""}`}>{children}</div>
    <small>Changes save to your working draft automatically.</small>
  </Drawer>;
}
