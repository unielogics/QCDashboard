"use client";

// Collapsible right-column panel for the lender thread.
//
// Behavior:
//   * Manual: clicking the header toggles open/closed.
//   * AI-suggested default: parent passes `defaultOpen` based on
//     whether the panel is currently "important" (e.g., AI summary
//     opens when there are open_asks; Living Profile opens when
//     deal_health != on_track).
//   * User override: once the user clicks, that choice persists in
//     localStorage per (loanId, panelKey) and overrides future
//     AI-suggested defaults until the user resets.
//
// The localStorage layer is intentionally cheap: a single boolean
// per panel. We don't persist scroll position or anything else.
//
// Restyled onto `.panel` / `.panel-h` / `.panel-b`. The header is still a
// real button, and now carries `aria-expanded` so a screen reader is told
// what the click does.

import { useEffect, useMemo, useState } from "react";
import { CellChip } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";

interface Props {
  loanId: string;
  panelKey: string;
  title: string;
  rightBadge?: React.ReactNode;
  defaultOpen?: boolean;
  importance?: "low" | "med" | "high";
  children: React.ReactNode;
}

export function CollapsiblePanel({
  loanId,
  panelKey,
  title,
  rightBadge,
  defaultOpen = true,
  importance = "med",
  children,
}: Props) {
  const storageKey = `lender-panel:${loanId}:${panelKey}`;
  const [open, setOpen] = useState<boolean>(defaultOpen);
  const [userOverridden, setUserOverridden] = useState<boolean>(false);

  // On mount, read any saved user choice. If present, it wins; if
  // absent, fall through to the parent's AI-suggested defaultOpen.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw === "open") {
        setOpen(true);
        setUserOverridden(true);
      } else if (raw === "closed") {
        setOpen(false);
        setUserOverridden(true);
      }
    } catch {
      // localStorage blocked (private mode, SSR, etc.) — keep
      // defaultOpen behavior.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // If the AI-suggested defaultOpen changes (e.g., a new lender
  // message arrives and importance escalates), apply it ONLY when
  // the user hasn't overridden.
  useEffect(() => {
    if (!userOverridden) {
      setOpen(defaultOpen);
    }
  }, [defaultOpen, userOverridden]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setUserOverridden(true);
    try {
      window.localStorage.setItem(storageKey, next ? "open" : "closed");
    } catch {
      // best-effort
    }
  };

  const importancePill = useMemo(() => {
    if (importance === "high") {
      return <CellChip tone="bad">Priority</CellChip>;
    }
    if (importance === "low") {
      return <CellChip>Quiet</CellChip>;
    }
    return null;
  }, [importance]);

  return (
    <div className="panel">
      {/* `.panel-h` owns the padding, the hairline and the flex row; the
          element being a <button> is what makes the panel operable by
          keyboard. `.panel > .panel-h:last-child` drops the hairline while
          collapsed. */}
      <button
        type="button"
        className="panel-h toggler"
        onClick={toggle}
        aria-expanded={open}
      >
        <span className="row grow">
          <Icon name={open ? "chevD" : "chevR"} size={11} stroke={2.5} />
          <span className="lbl">{title}</span>
          {importancePill}
        </span>
        {rightBadge ? <span>{rightBadge}</span> : null}
      </button>
      {open ? <div className="panel-b">{children}</div> : null}
    </div>
  );
}
