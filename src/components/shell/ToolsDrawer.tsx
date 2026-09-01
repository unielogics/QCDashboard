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
        {/* `.hd` ships a 2px bottom margin for a page header sitting straight
            on top of its content; here it is a dialog title with a grid under
            it, so `.mb` takes the spacing. */}
        <div className="hd mb">
          <h2>All tools</h2>
          <span className="lede">Everything not on your daily desk.</span>
        </div>

        <div className="grid">
          {groups.map((g) => (
            <div key={g.id}>
              {/* Was `.grp`, which globals scopes to `.nav .grp` — outside the
                  nav it styled nothing, and `.app.app--collapsed .grp` hid these labels
                  outright whenever the sidebar was collapsed. `.lbl` is the
                  same small-caps label and is not sidebar-scoped. */}
              <div className="lbl toolgrp">{g.label}</div>
              <div className="grid cols-auto g6">
                {g.items.map((it) => (
                  <Link key={it.href} href={it.href} className="toollink" onClick={onClose}>
                    <Icon name={it.icon} size={17} />
                    <span className="grow">
                      <b>{it.label}</b>
                      {it.desc && <span className="sub">{it.desc}</span>}
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
      if ((e.metaKey || e.ctrlKey) && typeof e.key === "string" && e.key.toLowerCase() === "j") {
        e.preventDefault();
        onOpen();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onOpen]);
}
