"use client";

// Deal Analyzer settings — the global closing-cost tier table.
// Rendered as a tab inside /settings (mirrors the Simulator tab).
// Excel-like editable grid: loan-amount range → closing %, with a
// dollar floor. The analyzer resolves a deal's closing % as
// max(percentage, minimum$ / loanAmount). Empty From/To = open bound.
// One Save does a bulk replace.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, IconBtn, Input, Panel } from "@/components/ds";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { useClosingCostTiers, useReplaceClosingCostTiers } from "@/hooks/useApi";
import type { ClosingCostTier } from "@/lib/fixFlip/types";

interface Draft {
  from: string;
  to: string;
  pctWith: string;    // % with construction financed
  pctWithout: string; // % without construction (borrower self-funds)
}

function toDraft(tr: ClosingCostTier): Draft {
  return {
    from: tr.fromAmount == null ? "" : String(tr.fromAmount),
    to: tr.toAmount == null ? "" : String(tr.toAmount),
    pctWith: String(+(tr.percentage * 100).toFixed(4)),
    pctWithout: String(+(tr.percentageNoConstruction * 100).toFixed(4)),
  };
}

const numOrNull = (s: string): number | null => {
  const v = Number(s.replace(/[^0-9.]/g, ""));
  return s.trim() === "" || !Number.isFinite(v) ? null : v;
};
const num0 = (s: string): number => {
  const v = Number(s.replace(/[^0-9.]/g, ""));
  return Number.isFinite(v) ? v : 0;
};

export function DealAnalyzerSection() {
  const profile = useActiveProfile();
  const { data: tiers, isLoading } = useClosingCostTiers();
  const replace = useReplaceClosingCostTiers();

  const [rows, setRows] = useState<Draft[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (tiers) setRows(tiers.map(toDraft));
  }, [tiers]);

  const canEdit = profile.role === Role.SUPER_ADMIN;

  const cellInput = (
    value: string,
    onChange: (v: string) => void,
    prefix?: string,
  ) => (
    // Prefix glyph beside the field. Bespoke row geometry — `.row`'s 10px gap
    // is far too wide inside a table cell.
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {prefix ? <span className="sub">{prefix}</span> : null}
      <input
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        style={{ flex: 1 }}
      />
    </div>
  );

  const setCell = (idx: number, k: keyof Draft, v: string) =>
    setRows((p) => p.map((r, i) => (i === idx ? { ...r, [k]: v } : r)));
  const addRow = () =>
    setRows((p) => [...p, { from: "", to: "", pctWith: "2", pctWithout: "3" }]);
  const delRow = (idx: number) =>
    setRows((p) => p.filter((_, i) => i !== idx));

  const onSave = async () => {
    const payload: ClosingCostTier[] = rows.map((r) => ({
      fromAmount: numOrNull(r.from),
      toAmount: numOrNull(r.to),
      percentage: num0(r.pctWith) / 100,
      percentageNoConstruction: num0(r.pctWithout) / 100,
    }));
    try {
      await replace.mutateAsync(payload);
      setFlash("Saved.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't save.");
    }
    setTimeout(() => setFlash(null), 3000);
  };

  // Preview the resolved closing $ for a sample base (BRV, or
  // BRV+construction) against the current unsaved grid.
  const [sample, setSample] = useState("300000");
  const [withConstruction, setWithConstruction] = useState(true);
  const preview = useMemo(() => {
    const base = num0(sample);
    if (!(base > 0)) return null;
    const tier = rows.find((r) => {
      const lo = numOrNull(r.from);
      const hi = numOrNull(r.to);
      return base >= (lo ?? -Infinity) && base <= (hi ?? Infinity);
    });
    if (!tier) return { pct: 0.02, src: "default 2%", dollars: base * 0.02 };
    const pct = (withConstruction ? num0(tier.pctWith) : num0(tier.pctWithout)) / 100;
    return {
      pct,
      src: withConstruction ? "with-construction %" : "without-construction %",
      dollars: base * pct,
    };
  }, [rows, sample, withConstruction]);

  return (
    <div className="grid">
      <Panel
        title="Closing-cost tiers"
        actions={
          canEdit ? (
            <Btn variant="pri" onClick={onSave} disabled={replace.isPending}>
              {replace.isPending ? "Saving…" : "Save"}
            </Btn>
          ) : undefined
        }
      >
        <div className="sub">
          Loan-amount tiers used by the Deal Analyzer. For a deal the effective
          closing % is <strong>max(tier %, minimum $ ÷ loan amount)</strong>,
          applied to the loan amount. Leave <em>From</em> or <em>To</em> blank
          for an open-ended bound.
        </div>

        {flash ? (
          // `.c-ok` / `.c-bad` own the tint and the text colour; the inline
          // values are box geometry only.
          <div
            className={flash.includes("Couldn") ? "c-bad" : "c-ok"}
            style={{ borderRadius: 8, padding: "8px 11px", fontSize: 12.5, fontWeight: 650, margin: "10px 0" }}
          >
            {flash}
          </div>
        ) : null}

        {/* A real `.tbl` in its own scroll container, so a wide grid scrolls
            inside the panel instead of widening the page. */}
        <div className="tblwrap mt">
          <table className="tbl" style={{ minWidth: 560 }}>
            <thead>
              <tr>
                {["From $", "To $", "% with construction", "% without construction", ""].map((h) => (
                  <th key={h} scope="col">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="sub">Loading…</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="sub">No tiers yet — add a row.</td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ width: "24%" }}>
                      {cellInput(r.from, (v) => setCell(idx, "from", v), "$")}
                    </td>
                    <td style={{ width: "24%" }}>
                      {cellInput(r.to, (v) => setCell(idx, "to", v), "$")}
                    </td>
                    <td style={{ width: "22%" }}>
                      {cellInput(r.pctWith, (v) => setCell(idx, "pctWith", v), "%")}
                    </td>
                    <td style={{ width: "22%" }}>
                      {cellInput(r.pctWithout, (v) => setCell(idx, "pctWithout", v), "%")}
                    </td>
                    <td className="r">
                      {canEdit ? (
                        // `.c-bad` is declared after `.btn` in the sheet, so it
                        // wins the tint without an inline override.
                        <IconBtn className="c-bad" onClick={() => delRow(idx)} aria-label="Remove tier">
                          <Icon name="x" size={14} />
                        </IconBtn>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {canEdit ? (
          <div className="mt">
            <Btn onClick={addRow}>
              <Icon name="plus" size={12} stroke={3} /> Add tier
            </Btn>
          </div>
        ) : null}
      </Panel>

      <Panel title="Preview">
        <div className="row">
          <span className="sub">Base $ (BRV, or BRV + construction)</span>
          <Input value={sample} onChange={(e) => setSample(e.target.value)} style={{ width: 140 }} />
          <Btn onClick={() => setWithConstruction((v) => !v)}>
            {withConstruction ? "With construction" : "Without construction"}
          </Btn>
          {preview ? (
            <span className="sub">
              → closing{" "}
              <b style={{ color: "var(--ink)" }}>
                ${Math.round(preview.dollars).toLocaleString()}
              </b>{" "}
              ({(preview.pct * 100).toFixed(2)}% · {preview.src})
            </span>
          ) : null}
        </div>
        <div className="sub mt">
          Reflects the unsaved grid above. Save to make it live for the analyzer.
        </div>
      </Panel>
    </div>
  );
}
