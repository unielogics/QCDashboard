"use client";

// The console switcher: Funding · Field Desk · Audit, rendered from the list
// the server says this login may enter (/auth/me.consoles). Three apps used
// to draw this by hand, each with its own gating and its own host literals;
// now each renders the same list and only knows its own key.
import type { ConsoleLink } from "@/lib/types";

export function ConsoleSwitcher({ consoles, current }: { consoles: ConsoleLink[] | undefined; current: ConsoleLink["key"] }) {
  if (!consoles || consoles.length < 2) return null;
  return (
    <div className="chip" aria-label="Console switcher">
      {consoles.map((c, i) => (
        <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {i > 0 ? <span style={{ color: "var(--faint)" }}>·</span> : null}
          {c.key === current
            ? <b aria-current="page">{c.label}</b>
            : <a href={c.url} title={`Open ${c.label} under the same account`} style={{ color: "var(--accent)", textDecoration: "none" }}>{c.label}</a>}
        </span>
      ))}
    </div>
  );
}
