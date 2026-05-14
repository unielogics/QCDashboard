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

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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
      return <Pill bg={t.dangerBg} color={t.danger}>Priority</Pill>;
    }
    if (importance === "low") {
      return <Pill bg={t.surface2} color={t.ink3}>Quiet</Pill>;
    }
    return null;
  }, [importance, t]);

  return (
    <Card pad={0}>
      <button
        type="button"
        onClick={toggle}
        style={{
          all: "unset",
          width: "100%",
          cursor: "pointer",
          padding: "10px 14px",
          borderBottom: open ? `1px solid ${t.line}` : "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name={open ? "chevD" : "chevR"} size={11} stroke={2.5} />
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: t.ink2,
            }}
          >
            {title}
          </span>
          {importancePill}
        </div>
        {rightBadge ? <div>{rightBadge}</div> : null}
      </button>
      {open ? <div style={{ padding: 14 }}>{children}</div> : null}
    </Card>
  );
}
