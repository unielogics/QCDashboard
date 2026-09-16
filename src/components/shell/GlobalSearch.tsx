"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { Pill } from "@/components/design-system/primitives";
import { useUI } from "@/store/ui";
import { useGlobalSearch } from "@/hooks/useApi";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

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
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const { data: user } = useCurrentUser();
  const isDealerPartner = user?.role === Role.DEALER_PARTNER;
  const { data: groups } = useGlobalSearch(isDealerPartner ? "" : q);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // Focus first so a focused TableWorkspace can yield and release its own
    // scroll lock. This dialog then becomes the single lock owner.
    searchInputRef.current?.focus({ preventScroll: true });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setOpen(false);
        return;
      }
      const choices = dialogRef.current
        ? Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button.pick:not([disabled])"))
        : [];
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && choices.length) {
        event.preventDefault();
        const current = choices.indexOf(document.activeElement as HTMLElement);
        const next = event.key === "Home"
          ? 0
          : event.key === "End"
            ? choices.length - 1
            : event.key === "ArrowDown"
              ? current < 0 || current === choices.length - 1 ? 0 : current + 1
              : current <= 0 ? choices.length - 1 : current - 1;
        choices[next].focus({ preventScroll: true });
        return;
      }
      if (event.key === "Enter" && document.activeElement === searchInputRef.current && choices.length) {
        event.preventDefault();
        choices[0].click();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (restoreTo?.isConnected) {
        const target = restoreTo.matches(".table-workspace")
          ? restoreTo.querySelector<HTMLElement>(".table-workspace__focus-button")
          : restoreTo;
        target?.focus({ preventScroll: true });
      }
    };
  }, [open, setOpen]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed", inset: 0, background: "rgba(15,23,32,0.34)", zIndex: 820,
        display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="panel cmdk"
        // The palette's own measurements, not a system step.
        style={{ width: 720, maxHeight: "70vh" }}
      >
        <div className="panel-h">
          <Icon name="search" size={16} />
          <input
            ref={searchInputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isDealerPartner ? "Open an auto workspace…" : "Search loans, clients, documents, messages…"}
            className="grow cmdk-in"
            aria-label="Search"
          />
          <button type="button" onClick={() => setOpen(false)} aria-label="Close search" className="btn sm iconbtn">
            <Icon name="x" size={16} />
          </button>
        </div>

        <div className="cmdk-b">
          {isDealerPartner ? (
            <div className="grid" style={{ padding: 14 }}>
              <button type="button" className="pick" onClick={() => { setOpen(false); router.push("/broker/ai-underwriter-leads"); }}><Icon name="spark" size={15} /><span className="grow"><b>Auto AI Intake</b><span className="sub">Dealer leads, uploads, and AI review</span></span><Icon name="chevR" size={13} /></button>
              <button type="button" className="pick" onClick={() => { setOpen(false); router.push("/broker/buckets"); }}><Icon name="lock" size={15} /><span className="grow"><b>Document rooms</b><span className="sub">Your assigned dealer files only</span></span><Icon name="chevR" size={13} /></button>
            </div>
          ) : q.trim().length < 2 && (
            <div className="cmdk-empty">
              <Icon name="search" size={28} />
              <div className="cmdk-empty-t">Type at least 2 characters to search.</div>
              <div className="sub">
                Results group by client across loans, documents, messages, events, and AI tasks.
              </div>
            </div>
          )}
          {!isDealerPartner && groups?.length === 0 && q.trim().length >= 2 && (
            <div className="cmdk-empty sub">
              No matches for &ldquo;{q}&rdquo;.
            </div>
          )}
          {!isDealerPartner && groups?.map((g) => (
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
          <span className="cmdk-f-note">{isDealerPartner ? "Auto-industry workspace only" : "Searches loans, clients, documents, messages, events, AI tasks"}</span>
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
