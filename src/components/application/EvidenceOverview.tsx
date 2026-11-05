"use client";

// The first thing the Evidence & banking tab says: who has to do something.
//
// Four tiles answer it (needs you / waiting on the client / AI is working /
// complete) and a fifth says where the bank statements stand. Each tile jumps
// to its group below. A line of plain words sums it up, and a panel explains
// what every status means, so nobody has to guess what "received" or "checking"
// stood for.

import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { cx } from "@/components/ds";
import { GROUPS, LEGEND, triageSummary, type TriageGroup, type TriageGroupCounts } from "@/lib/evidenceTriage";

export type OverviewTarget = TriageGroup | "banking";

type BankSummary = {
  accepted: number;
  required: number;
  complete: boolean;
  institutions: number;
  counted: number;
};

const TILE_ICONS: Record<TriageGroup, string> = { you: "user", client: "send", ai: "ai", done: "check" };

const TILE_SUBS: Record<TriageGroup, (count: number) => string> = {
  you: (count) => (count ? "Review or sign off" : "All clear"),
  client: (count) => (count ? "Asked, not yet received" : "Nothing outstanding"),
  ai: (count) => (count ? "Reading and checking" : "Nothing in progress"),
  done: () => "Counts toward readiness",
};

export function EvidenceOverview({
  counts,
  aiFiles = 0,
  otherOpen = 0,
  bank,
  onJump,
}: {
  counts: TriageGroupCounts;
  /** Files the AI is reading right now, whether or not they sit on a requirement yet. */
  aiFiles?: number;
  /** Open requests that are not a document on the list (questions, forms, consents, reviews). */
  otherOpen?: number;
  bank: BankSummary;
  onJump: (target: OverviewTarget) => void;
}) {
  const [legendOpen, setLegendOpen] = useState(false);
  const aiCount = Math.max(counts.ai, aiFiles);
  const tiles: { group: TriageGroup; count: number; value: string }[] = [
    { group: "you", count: counts.you, value: String(counts.you) },
    { group: "client", count: counts.client, value: String(counts.client) },
    { group: "ai", count: aiCount, value: String(aiCount) },
    { group: "done", count: counts.done, value: `${counts.done} of ${counts.total}` },
  ];
  const bankTone = bank.complete ? "ok" : "warn";
  return (
    <section className="ev-overview" aria-label="Where this file stands">
      <div className="ev-tiles">
        {tiles.map((tile) => (
          <button
            key={tile.group}
            type="button"
            className={cx("ev-tile", tile.count === 0 && tile.group !== "done" && "quiet")}
            data-group={tile.group}
            onClick={() => onJump(tile.group)}
            title={GROUPS[tile.group].blurb}
          >
            <span className="ev-tile-icon" aria-hidden="true"><Icon name={TILE_ICONS[tile.group]} size={16} /></span>
            <span className="ev-tile-body">
              <span className="ev-tile-label">{GROUPS[tile.group].title}</span>
              <b>{tile.value}</b>
              <small>{TILE_SUBS[tile.group](tile.count)}</small>
            </span>
          </button>
        ))}
        <button type="button" className="ev-tile" data-group="bank" data-tone={bankTone} onClick={() => onJump("banking")} title="Open the Banking tab">
          <span className="ev-tile-icon" aria-hidden="true"><Icon name="building" size={16} /></span>
          <span className="ev-tile-body">
            <span className="ev-tile-label">Bank statements</span>
            <b>{bank.accepted} of {bank.required}</b>
            <small>{bank.complete ? "months accepted" : "months accepted so far"}{bank.institutions ? ` · ${bank.institutions} connected` : " · Plaid optional"}</small>
          </span>
        </button>
      </div>
      <div className="ev-summary">
        <p>{triageSummary(counts)}{otherOpen ? ` Also collecting ${otherOpen} other ${otherOpen === 1 ? "item" : "items"} (questions, forms and consents).` : ""}</p>
        <button type="button" className="linky ev-legend-toggle" aria-expanded={legendOpen} aria-controls="ev-legend" onClick={() => setLegendOpen((open) => !open)}>
          {legendOpen ? "Hide what the statuses mean" : "What do these statuses mean?"}
        </button>
      </div>
      {legendOpen ? (
        <dl id="ev-legend" className="ev-legend">
          {LEGEND.map((item) => (
            <div key={item.label}>
              <dt><span className="ev-dot" data-group={item.group} aria-hidden="true" />{item.label}</dt>
              <dd>{item.means}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
