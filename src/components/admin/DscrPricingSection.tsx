"use client";

// Admin editor for the deterministic DSCR-potential pricing used on
// real-estate AI Underwriter Leads (AppSettings.data.dscr_pricing — backend
// DscrPricingSettings). Rates entered as percentages, stored as decimals.
// Self-contained: reads/patches the shared /settings endpoint directly so it
// can slot into any admin page as a section body.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useSettings, useUpdateSettings } from "@/hooks/useApi";
import type { DscrPricingSettings, DscrRateTier } from "@/lib/types";

const DEFAULTS: DscrPricingSettings = {
  rate_tiers: [
    { min_fico: 760, annual_rate: 0.0675 },
    { min_fico: 700, annual_rate: 0.075 },
    { min_fico: 300, annual_rate: 0.0825 },
  ],
  band_spread: 0.0075,
  amortization_months: 360,
  tax_insurance_annual_pct_of_value: 0.016,
};

function toPercentText(decimal: number): string {
  return (decimal * 100).toFixed(2).replace(/\.?0+$/, "");
}

function fromPercentText(text: string): number | null {
  const parsed = Number(text);
  return Number.isFinite(parsed) && parsed > 0 ? parsed / 100 : null;
}

export function DscrPricingSection() {
  const { t } = useTheme();
  const settings = useSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<DscrPricingSettings | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (settings.data && !draft) {
      setDraft(settings.data.data.dscr_pricing ?? DEFAULTS);
    }
  }, [settings.data, draft]);

  if (settings.isLoading || !draft) {
    return <span style={{ color: t.ink3, fontSize: 13 }}>Loading DSCR pricing…</span>;
  }

  const setTier = (index: number, patch: Partial<DscrRateTier>) => {
    setDraft({
      ...draft,
      rate_tiers: draft.rate_tiers.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    });
  };

  const save = async () => {
    setNotice("");
    try {
      await update.mutateAsync({ dscr_pricing: draft });
      setNotice("DSCR pricing saved — the next DSCR screen uses these rates.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Save failed.");
    }
  };

  const input = {
    border: `1px solid ${t.line}`,
    borderRadius: 8,
    padding: "6px 10px",
    background: t.surface,
    color: t.ink,
    width: 110,
    fontSize: 13,
  } as const;
  const label = { color: t.ink3, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: 0.4 };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gap: 8 }}>
        <span style={label}>Rate tiers by credit (FICO floor → annual rate %)</span>
        {draft.rate_tiers.map((tier, index) => (
          <div key={index} style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span style={{ color: t.ink2, fontSize: 13, width: 60 }}>FICO ≥</span>
            <input
              style={input}
              inputMode="numeric"
              value={String(tier.min_fico)}
              onChange={(e) => setTier(index, { min_fico: Number(e.target.value) || 0 })}
            />
            <span style={{ color: t.ink2, fontSize: 13 }}>→</span>
            <input
              style={input}
              inputMode="decimal"
              value={toPercentText(tier.annual_rate)}
              onChange={(e) => {
                const rate = fromPercentText(e.target.value);
                if (rate !== null) setTier(index, { annual_rate: rate });
              }}
            />
            <span style={{ color: t.ink3, fontSize: 13 }}>% APR</span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={label}>Sensitivity spread (±%)</span>
          <input
            style={input}
            inputMode="decimal"
            value={toPercentText(draft.band_spread)}
            onChange={(e) => {
              const spread = fromPercentText(e.target.value);
              if (spread !== null) setDraft({ ...draft, band_spread: spread });
            }}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={label}>Amortization (months)</span>
          <input
            style={input}
            inputMode="numeric"
            value={String(draft.amortization_months)}
            onChange={(e) => setDraft({ ...draft, amortization_months: Number(e.target.value) || 360 })}
          />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <span style={label}>Taxes+insurance (%/yr of value)</span>
          <input
            style={input}
            inputMode="decimal"
            value={toPercentText(draft.tax_insurance_annual_pct_of_value)}
            onChange={(e) => {
              const pct = fromPercentText(e.target.value);
              if (pct !== null) setDraft({ ...draft, tax_insurance_annual_pct_of_value: pct });
            }}
          />
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          onClick={save}
          disabled={update.isPending}
          style={{
            border: 0,
            borderRadius: 999,
            padding: "9px 18px",
            background: t.brand,
            color: "#fff",
            fontWeight: 800,
            cursor: update.isPending ? "wait" : "pointer",
            fontSize: 13,
          }}
        >
          {update.isPending ? "Saving…" : "Save DSCR pricing"}
        </button>
        {notice ? <span style={{ color: t.ink3, fontSize: 12 }}>{notice}</span> : null}
      </div>
      <p style={{ margin: 0, color: t.ink3, fontSize: 12, lineHeight: 1.5 }}>
        Used by the DSCR-potential screen on real-estate leads: the file&apos;s soft-pull FICO (or stated credit
        tier) picks its tier, and the screen shows that rate ± the sensitivity spread. Deterministic screen
        assumptions only — never quoted to the borrower.
      </p>
    </div>
  );
}
