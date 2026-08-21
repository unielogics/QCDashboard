"use client";

// "All tools" — the destination catalogue for everything not on the daily desk.
//
// Deliberately NOT merged with the ⌘K global search, which people often assume
// should be one thing. They answer different questions: this one is "what can
// this app do", browsable and role-scoped and knowable without typing; ⌘K is
// "find the thing I already have in mind", a server query over loans, clients,
// documents and events. Collapsing them would make the browsable half
// undiscoverable behind a blank input.
//
// ⌘/Ctrl+J opens it, kept clear of ⌘K for the same reason.

import Link from "next/link";
import { useEffect } from "react";
import { Icon } from "@/components/design-system/Icon";
import type { ToolGroup } from "./nav.config";

export function ToolsDrawer({
  open,
  onClose,
  groups,
}: {
  open: boolean;
  onClose: () => void;
  groups: ToolGroup[];
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (open && e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !groups.length) return null;

  return (
    <>
      <div className="navmore" onClick={onClose} aria-hidden="true" />
      <div className="navmore-p" role="dialog" aria-modal="true" aria-label="All tools">
        <div className="hd" style={{ marginBottom: 14 }}>
          <h2 style={{ fontSize: 19 }}>All tools</h2>
          <span className="lede">Everything not on your daily desk.</span>
        </div>

        <div style={{ display: "grid", gap: 18 }}>
          {groups.map((g) => (
            <div key={g.id}>
              <div className="grp" style={{ padding: "0 0 6px" }}>
                {g.label}
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(228px, 1fr))",
                  gap: 6,
                }}
              >
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className="toollink" onClick={onClose}>
                    <Icon name={it.icon} size={17} />
                    <span style={{ minWidth: 0 }}>
                      <b style={{ display: "block", fontWeight: 600 }}>{it.label}</b>
                      {it.desc && (
                        <span className="sub" style={{ fontSize: 11.5 }}>
                          {it.desc}
                        </span>
                      )}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Wires ⌘/Ctrl+J. Mounted once by the shell. */
export function useToolsHotkey(onOpen: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
