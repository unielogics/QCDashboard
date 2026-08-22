"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { Pill } from "@/components/design-system/primitives";
import { useUI } from "@/store/ui";
import { useGlobalSearch } from "@/hooks/useApi";

// The ⌘K palette. Restyled onto `.panel` / `.panel-h` / `.pick` / `.kbd`;
// the scrim and its top-anchored placement stay inline because a command
// palette hangs from the top of the viewport, which no class in the sheet
// describes, and it sits at z-index 100 — deliberately above `.drawer-scrim`
// (60) so it can be opened from inside a dialog.

export default function GlobalSearch() {
  const open = useUI((s) => s.searchOpen);
  const setOpen = useUI((s) => s.setSearchOpen);
  const router = useRouter();
  const [q, setQ] = useState("");
  const { data: groups } = useGlobalSearch(q);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,32,0.34)", zIndex: 100,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="panel cmdk"
        // The palette's own measurements, not a system step.
        style={{ width: 720, maxHeight: "70vh" }}
      >
        <div className="panel-h">
          <Icon name="search" size={16} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search loans, clients, documents, messages…"
            className="grow cmdk-in"
            aria-label="Search"
          />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="btn sm iconbtn">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="cmdk-b">
          {q.trim().length < 2 && (
            <div className="cmdk-empty">
              <Icon name="search" size={28} />
              <div className="cmdk-empty-t">Type at least 2 characters to search.</div>
              <div className="sub">
                Results group by client across loans, documents, messages, events, and AI tasks.
              </div>
            </div>
          )}
          {groups?.length === 0 && q.trim().length >= 2 && (
            <div className="cmdk-empty sub">
              No matches for &ldquo;{q}&rdquo;.
            </div>
          )}
          {groups?.map((g) => (
            <div key={g.client_id} className="cmdk-grp">
              <div className="lbl">{g.client_name}</div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    if (item.kind === "loan") router.push(`/loans/${item.id}`);
                    else if (item.kind === "client") router.push(`/clients/${item.id}`);
                    else if (item.kind === "doc" && item.loan_id) router.push(`/loans/${item.loan_id}`);
                    else if (item.kind === "message") router.push("/messages");
                    else if (item.kind === "event") router.push("/calendar");
                    else if (item.kind === "aiTask") router.push("/ai-inbox");
                  }}
                  className="pick cmdk-hit"
                >
                  <Pill>{item.kind}</Pill>
                  <div className="grow">
                    <div className="cmdk-hit-t">{item.title}</div>
                    {item.subtitle && <div className="sub">{item.subtitle}</div>}
                  </div>
                  <Icon name="chevR" size={13} />
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer keyboard hints */}
        <div className="row sub cmdk-f">
          <KbdHint keys={["↑", "↓"]} label="Navigate" />
          <KbdHint keys={["↵"]} label="Open" />
          <KbdHint keys={["Esc"]} label="Close" />
          <span className="cmdk-f-note">
            Searches loans, clients, documents, messages, events, AI tasks
          </span>
        </div>
      </div>
    </div>
  );
}

function KbdHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="row kbdhint">
      {keys.map((k) => (
        <kbd key={k} className="kbd">
          {k}
        </kbd>
      ))}
      {label}
    </span>
  );
}
