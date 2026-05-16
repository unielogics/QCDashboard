"use client";

// Deal Analyzer settings — the global closing-cost tier table.
// Rendered as a tab inside /settings (mirrors the Simulator tab).
// Excel-like editable grid: loan-amount range → closing %, with a
// dollar floor. The analyzer resolves a deal's closing % as
// max(percentage, minimum$ / loanAmount). Empty From/To = open bound.
// One Save does a bulk replace.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
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
  const { t } = useTheme();
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
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {prefix ? <span style={{ fontSize: 12, color: t.ink3 }}>{prefix}</span> : null}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={!canEdit}
        style={{
          width: "100%",
          padding: "8px 8px",
          background: t.surface2,
          border: `1px solid ${t.line}`,
          borderRadius: 8,
          color: t.ink,
          fontSize: 13,
          outline: "none",
        }}
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card pad={20}>
        <SectionLabel
          action={
            canEdit ? (
              <button
                type="button"
                onClick={onSave}
                disabled={replace.isPending}
                style={{
                  all: "unset",
                  cursor: replace.isPending ? "default" : "pointer",
                  padding: "7px 16px",
                  borderRadius: 9,
                  background: replace.isPending ? t.chip : t.petrol,
                  color: replace.isPending ? t.ink4 : "#fff",
                  fontSize: 12.5,
                  fontWeight: 700,
                }}
              >
                {replace.isPending ? "Saving…" : "Save"}
              </button>
            ) : undefined
          }
        >
          Closing-cost tiers
        </SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink3, marginBottom: 12, lineHeight: 1.5 }}>
          Loan-amount tiers used by the Deal Analyzer. For a deal the effective
          closing % is <strong>max(tier %, minimum $ ÷ loan amount)</strong>,
          applied to the loan amount. Leave <em>From</em> or <em>To</em> blank
          for an open-ended bound.
        </div>

        {flash ? (
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: flash.includes("Couldn") ? t.danger : t.petrol }}>
            {flash}
          </div>
        ) : null}

        <div style={{ overflowX: "auto", border: `1px solid ${t.line}`, borderRadius: 10 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr>
                {["From $", "To $", "% with construction", "% without construction", ""].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: "left",
                      padding: "12px 14px",
                      fontSize: 11,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: 0.6,
                      color: t.ink3,
                      borderBottom: `1px solid ${t.line}`,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, fontSize: 13, color: t.ink3 }}>
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 18, fontSize: 13, color: t.ink3 }}>
                    No tiers yet — add a row.
                  </td>
                </tr>
              ) : (
                rows.map((r, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: "8px 14px", width: "24%" }}>
                      {cellInput(r.from, (v) => setCell(idx, "from", v), "$")}
                    </td>
                    <td style={{ padding: "8px 14px", width: "24%" }}>
                      {cellInput(r.to, (v) => setCell(idx, "to", v), "$")}
                    </td>
                    <td style={{ padding: "8px 14px", width: "22%" }}>
                      {cellInput(r.pctWith, (v) => setCell(idx, "pctWith", v), "%")}
                    </td>
                    <td style={{ padding: "8px 14px", width: "22%" }}>
                      {cellInput(r.pctWithout, (v) => setCell(idx, "pctWithout", v), "%")}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => delRow(idx)}
                          style={{ all: "unset", cursor: "pointer", color: t.danger, padding: 6 }}
                          aria-label="Remove tier"
                        >
                          <Icon name="x" size={14} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {canEdit ? (
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              onClick={addRow}
              style={{
                all: "unset",
                cursor: "pointer",
                padding: "9px 14px",
                borderRadius: 9,
                border: `1px solid ${t.line}`,
                color: t.ink2,
                fontSize: 13,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Icon name="plus" size={12} stroke={3} /> Add tier
            </button>
          </div>
        ) : null}
      </Card>

      <Card pad={20}>
        <SectionLabel>Preview</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: t.ink3 }}>Base $ (BRV, or BRV + construction)</span>
          <input
            value={sample}
            onChange={(e) => setSample(e.target.value)}
            style={{
              width: 140,
              padding: "8px 10px",
              background: t.surface2,
              border: `1px solid ${t.line}`,
              borderRadius: 8,
              color: t.ink,
              fontSize: 13,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => setWithConstruction((v) => !v)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "7px 12px",
              borderRadius: 8,
              border: `1px solid ${t.line}`,
              color: t.ink2,
              fontSize: 12.5,
              fontWeight: 700,
            }}
          >
            {withConstruction ? "With construction" : "Without construction"}
          </button>
          {preview ? (
            <span style={{ fontSize: 13, color: t.ink2 }}>
              → closing{" "}
              <strong style={{ color: t.ink }}>
                ${Math.round(preview.dollars).toLocaleString()}
              </strong>{" "}
              ({(preview.pct * 100).toFixed(2)}% · {preview.src})
            </span>
          ) : null}
        </div>
        <div style={{ fontSize: 11.5, color: t.ink4, marginTop: 8 }}>
          Reflects the unsaved grid above. Save to make it live for the analyzer.
        </div>
      </Card>
    </div>
  );
}
