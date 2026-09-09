// The "needs attention" container. Minimized by default — on a blank package
// it is twenty-eight rows, and left open it pushed "Where this stands", "You
// earn" and "Agreement" below the fold. One click opens it; what it was is
// remembered per package for the visit. The header always says how many and
// how many are the desk's, so the closed state still carries the count.
import { useEffect, useId, useState } from "react";
import { PAGES, pageFor } from "./schema";
import { IconChevron, IconFlag } from "./icons";
import type { AttentionItem } from "./types";

function memoryKey(packageId: string) { return `pp-att:${packageId}`; }
function readOpen(packageId: string, fallback: boolean): boolean {
  try {
    const v = window.sessionStorage.getItem(memoryKey(packageId));
    return v === null ? fallback : v === "open";
  } catch { return fallback; }
}
function writeOpen(packageId: string, open: boolean) {
  try { window.sessionStorage.setItem(memoryKey(packageId), open ? "open" : "closed"); } catch { /* private window */ }
}

export function AttentionList({ items, onJump, onAction, mode, packageId, defaultOpen = false }: {
  items: AttentionItem[]; onJump: (item: AttentionItem) => void;
  /** A row's own action, when it has one (copy the sponsor signing link). */
  onAction?: (item: AttentionItem) => void;
  /** An agent cannot clear a desk-owned item; splitting them out is what stops
   *  the list reading as a wall of things they are failing to do. */
  mode?: string;
  /** What the container remembers is per package. */
  packageId: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // sessionStorage is read after mount so the server and the first client render agree.
  useEffect(() => { setOpen(readOpen(packageId, defaultOpen)); }, [packageId, defaultOpen]);
  const toggle = () => setOpen((o) => { writeOpen(packageId, !o); return !o; });
  const bodyId = useId();

  const agent = mode !== undefined && mode !== "operator";
  const waiting = agent ? items.filter((i) => i.owner === "desk") : [];
  const mine = agent ? items.filter((i) => i.owner !== "desk") : items;
  // Every row lands on a page — pageFor never returns nowhere — so nothing an
  // unknown backend step sends can fall out of the list that gates the send.
  const groups = PAGES.map((p) => ({ key: p.key as string, label: p.label, items: mine.filter((i) => pageFor(i) === p.key) })).filter((g) => g.items.length);
  return (
    <section className={`pp-att${open ? " is-open" : ""}`} aria-label="Needs attention">
      <button type="button" className="pp-att-h pp-att-toggle" onClick={toggle} aria-expanded={open} aria-controls={bodyId}>
        <IconFlag /><b>{mine.length} item{mine.length === 1 ? "" : "s"} need{mine.length === 1 ? "s" : ""} attention</b>
        {waiting.length ? <span className="pp-att-wait">{waiting.length} with the desk</span> : null}
        <IconChevron style={{ marginLeft: "auto", transform: open ? "rotate(90deg)" : undefined }} />
      </button>
      {open ? (
        <div className="pp-att-body" id={bodyId}>
          <span className="pp-sub">Sending is blocked until the list is empty. Pick an item to jump to its step.</span>
          {groups.map((g) => (
            <div key={g.key} className="pp-att-g">
              <div className="pp-att-step">{g.label}</div>
              {g.items.map((item) => (
                <div key={`${item.step}:${item.key}:${item.title}`} className="pp-att-item">
                  <button type="button" className="pp-att-row" onClick={() => onJump(item)}>
                    <span><b>{item.title}</b><small>{item.detail}</small></span><IconChevron />
                  </button>
                  {item.action && onAction ? <button type="button" className="pp-btn v-link s-sm pp-att-act" onClick={() => onAction(item)}>{item.action.label}</button> : null}
                </div>
              ))}
            </div>
          ))}
          {waiting.length ? (
            <div className="pp-att-g">
              <div className="pp-att-step">Waiting on the desk</div>
              {waiting.map((item) => (
                <div key={`${item.step}:${item.key}`} className="pp-att-row is-waiting">
                  <span><b>{item.title}</b><small>An admin or underwriter sets this. {item.detail}</small></span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
