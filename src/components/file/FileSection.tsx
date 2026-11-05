"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { CellChip, cx, type ChipTone } from "@/components/ds";

/**
 * One section of a file's tab: a header that says what is inside and where it
 * stands, and a body that opens on demand.
 *
 * The Underwriting and Payments tabs used to show every block at once. A
 * section carries its own one-line summary and status, so a tab reads as a
 * short list first; the viewer opens what they need, and their choices are
 * remembered in this browser only.
 */

export type SectionStatus = { label: string; tone: ChipTone };

export function useSectionState(storageKey: string) {
  const [stored, setStored] = useState<Record<string, boolean>>({});

  // Browser storage is a convenience: it can be empty or throw in private
  // windows, and the tab must render identically without it.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setStored(JSON.parse(raw) as Record<string, boolean>);
    } catch {
      // nothing remembered
    }
  }, [storageKey]);

  const isOpen = useCallback((id: string, defaultOpen: boolean) => (id in stored ? stored[id] : defaultOpen), [stored]);

  const toggle = useCallback((id: string, defaultOpen: boolean) => {
    setStored((current) => {
      const next = { ...current, [id]: !(id in current ? current[id] : defaultOpen) };
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // not remembered; still toggled for this view
      }
      return next;
    });
  }, [storageKey]);

  return { isOpen, toggle };
}

export function FileSection({
  id,
  title,
  summary,
  status,
  actions,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  /** One line that lets the viewer decide whether to open it. */
  summary?: ReactNode;
  status?: SectionStatus | null;
  /** Controls that belong to the section and stay visible while it is closed. */
  actions?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const bodyId = `file-section-${id}`;
  return (
    <section className={cx("file-section", !open && "is-closed")} aria-labelledby={`${bodyId}-title`}>
      <div className="file-section-head">
        <button type="button" className="file-section-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <Icon name={open ? "chevD" : "chevR"} size={14} />
          <span className="file-section-text">
            <b id={`${bodyId}-title`}>{title}</b>
            {summary ? <small>{summary}</small> : null}
          </span>
        </button>
        <div className="file-section-side">
          {status ? <CellChip tone={status.tone}>{status.label}</CellChip> : null}
          {actions}
        </div>
      </div>
      {open ? <div className="file-section-body" id={bodyId}>{children}</div> : null}
    </section>
  );
}
