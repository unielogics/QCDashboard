"use client";

import { CellChip, type ChipTone } from "@/components/ds";
import type { DealHealth } from "@/lib/types";

const META: Record<DealHealth, { label: string; emoji: string; tone: ChipTone }> = {
  on_track: { label: "On track", emoji: "🟢", tone: "ok" },
  at_risk: { label: "At risk", emoji: "🟡", tone: "warn" },
  stuck: { label: "Stuck", emoji: "🔴", tone: "bad" },
};

export function DealHealthPill({ health }: { health: DealHealth | undefined }) {
  const value = (health ?? "on_track") as DealHealth;
  const m = META[value];
  // `.cellchip.caps` is the ALL-CAPS status chip; the tone carries the
  // colour pair that used to be two inline reads off the theme.
  return (
    <CellChip className="caps" tone={m.tone} title="Deal health (Living Loan File)">
      <span>{m.emoji}</span> {m.label}
    </CellChip>
  );
}
