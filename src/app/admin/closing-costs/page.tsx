"use client";

// Super-admin only — the global closing-cost tier table.
//
// Excel-like editable grid: loan-amount range → closing %, with a
// dollar floor. The Deal Analyzer resolves a deal's closing % from
// this table: max(percentage, minimum$ / loanAmount). Empty From/To
// means an open-ended bound. One Save does a bulk replace.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import { useClosingCostTiers, useReplaceClosingCostTiers } from "@/hooks/useApi";
import type { ClosingCostTier } from "@/lib/fixFlip/types";

interface Draft {
  from: string; // dollars, blank = open bottom
  to: string;   // dollars, blank = open top
  pct: string;  // percent, e.g. "2" == 2%
  min: string;  // dollars
}

function toDraft(tr: ClosingCostTier): Draft {
  return {
    from: tr.fromAmount == null ? "" : String(tr.fromAmount),
    to: tr.toAmount == null ? "" : String(tr.toAmount),
    pct: String(+(tr.percentage * 100).toFixed(4)),
    min: String(tr.minimumDollar),
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

export default function ClosingCostsAdminPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const { data: tiers, isLoading } = useClosingCostTiers();
  const replace = useReplaceClosingCostTiers();

  const [rows, setRows] = useState<Draft[]>([]);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    if (tiers) setRows(tiers.map(toDraft));
  }, [tiers]);

  const isSuper = profile.role === Role.SUPER_ADMIN;

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
    setRows((p) => [...p, { from: "", to: "", pct: "2", min: "0" }]);
  const delRow = (idx: number) =>
    setRows((p) => p.filter((_, i) => i !== idx));

  const onSave = async () => {
    const payload: ClosingCostTier[] = rows.map((r) => ({
      fromAmount: numOrNull(r.from),
      toAmount: numOrNull(r.to),
      percentage: num0(r.pct) / 100,
      minimumDollar: num0(r.min),
    }));
    try {
      await replace.mutateAsync(payload);
      setFlash("Saved.");
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Couldn't save.");
    }
    setTimeout(() => setFlash(null), 3000);
  };

  // Preview the resolved closing % for a sample loan against the
  // current (unsaved) grid — gives admins instant feedback.
  const [sample, setSample] = useState("300000");
  const preview = useMemo(() => {
    const loan = num0(sample);
    if (!(loan > 0)) return null;
    const tier = rows.find((r) => {
      const lo = numOrNull(r.from);
      const hi = numOrNull(r.to);
      return loan >= (lo ?? -Infinity) && loan <= (hi ?? Infinity);
    });
    if (!tier) return { pct: 0.02, src: "default 2%", dollars: loan * 0.02 };
    const eff = Math.max(num0(tier.pct) / 100, num0(tier.min) / loan);
    return {
      pct: eff,
      src: eff > num0(tier.pct) / 100 ? "minimum-$ floor" : "tier %",
      dollars: loan * eff,
    };
  }, [rows, sample]);

  if (!isSuper) {
    return (
      <div style={{ padding: 24 }}>
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            The closing-cost table is super-admin only.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
          Super admin
        </div>
        <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>
          Closing Costs
        </h1>
        <div style={{ fontSize: 12, color: t.ink3, marginTop: 4, lineHeight: 1.5, maxWidth: 720 }}>
          Loan-amount tiers used by the Deal Analyzer. For a deal the effective
          closing % is <strong>max(tier %, minimum $ ÷ loan amount)</strong>,
          applied to the loan amount. Leave <em>From</em> or <em>To</em> blank
          for an open-ended bound.
        </div>
      </div>

      {flash ? (
        <div style={{ fontSize: 13, fontWeight: 600, color: flash.includes("Couldn") ? t.danger : t.petrol }}>
          {flash}
        </div>
      ) : null}

      <Card pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                {["From $", "To $", "Percentage %", "Minimum $", ""].map((h) => (
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
                      {cellInput(r.pct, (v) => setCell(idx, "pct", v), "%")}
                    </td>
                    <td style={{ padding: "8px 14px", width: "22%" }}>
                      {cellInput(r.min, (v) => setCell(idx, "min", v), "$")}
                    </td>
                    <td style={{ padding: "8px 14px", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick={() => delRow(idx)}
                        style={{ all: "unset", cursor: "pointer", color: t.danger, padding: 6 }}
                        aria-label="Remove tier"
                      >
                        <Icon name="x" size={14} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 10, padding: 14, borderTop: `1px solid ${t.line}` }}>
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
          <button
            type="button"
            onClick={onSave}
            disabled={replace.isPending}
            style={{
              all: "unset",
              cursor: replace.isPending ? "default" : "pointer",
              padding: "9px 18px",
              borderRadius: 9,
              background: replace.isPending ? t.chip : t.petrol,
              color: replace.isPending ? t.ink4 : "#fff",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            {replace.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </Card>

      <Card pad={16}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6, color: t.ink3 }}>
          Preview
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
          <span style={{ fontSize: 13, color: t.ink3 }}>Loan amount $</span>
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
