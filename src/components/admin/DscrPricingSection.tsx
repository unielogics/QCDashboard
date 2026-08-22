"use client";

// Admin editor for the deterministic DSCR-potential pricing used on
// real-estate AI Underwriter Leads (AppSettings.data.dscr_pricing — backend
// DscrPricingSettings). Rates entered as percentages, stored as decimals.
// Self-contained: reads/patches the shared /settings endpoint directly so it
// can slot into any admin page as a section body.

import { useEffect, useState } from "react";
import { Btn, Field, Input, Lbl, Sub } from "@/components/ds";
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
    return <Sub>Loading DSCR pricing…</Sub>;
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

  // Bespoke width (rule 3): these are 3-to-4-character numeric fields laid out
  // in a reading line ("FICO ≥ [760] → [6.75] % APR"). `.field.grow` would give
  // them a 180px minimum and break the sentence.
  const narrow = { width: 110 } as const;

  return (
    <div className="grid">
      <div className="fldsec">
        <Lbl>Rate tiers by credit (FICO floor → annual rate %)</Lbl>
        <div className="grid g8">
          {draft.rate_tiers.map((tier, index) => (
            <div className="row" key={index}>
              {/* Fixed 60px so the three rows' inputs line up under each other. */}
              <span style={{ width: 60 }}>FICO ≥</span>
              <Input
                className="num"
                style={narrow}
                aria-label={`Tier ${index + 1} minimum FICO`}
                inputMode="numeric"
                value={String(tier.min_fico)}
                onChange={(e) => setTier(index, { min_fico: Number(e.target.value) || 0 })}
              />
              <span>→</span>
              <Input
                className="num"
                style={narrow}
                aria-label={`Tier ${index + 1} annual rate, percent`}
                inputMode="decimal"
                value={toPercentText(tier.annual_rate)}
                onChange={(e) => {
                  const rate = fromPercentText(e.target.value);
                  if (rate !== null) setTier(index, { annual_rate: rate });
                }}
              />
              <Sub>% APR</Sub>
            </div>
          ))}
        </div>
      </div>

      <div className="row">
        <Field label="Sensitivity spread (±%)">
          <Input
            className="num"
            style={narrow}
            aria-label="Sensitivity spread, percent"
            inputMode="decimal"
            value={toPercentText(draft.band_spread)}
            onChange={(e) => {
              const spread = fromPercentText(e.target.value);
              if (spread !== null) setDraft({ ...draft, band_spread: spread });
            }}
          />
        </Field>
        <Field label="Amortization (months)">
          <Input
            className="num"
            style={narrow}
            aria-label="Amortization in months"
            inputMode="numeric"
            value={String(draft.amortization_months)}
            onChange={(e) => setDraft({ ...draft, amortization_months: Number(e.target.value) || 360 })}
          />
        </Field>
        <Field label="Taxes+insurance (%/yr of value)">
          <Input
            className="num"
            style={narrow}
            aria-label="Taxes and insurance, percent per year of value"
            inputMode="decimal"
            value={toPercentText(draft.tax_insurance_annual_pct_of_value)}
            onChange={(e) => {
              const pct = fromPercentText(e.target.value);
              if (pct !== null) setDraft({ ...draft, tax_insurance_annual_pct_of_value: pct });
            }}
          />
        </Field>
      </div>

      <div className="row">
        <Btn variant="pri" onClick={save} disabled={update.isPending}>
          {update.isPending ? "Saving…" : "Save DSCR pricing"}
        </Btn>
        {notice ? <Sub>{notice}</Sub> : null}
      </div>

      <p className="sub">
        Used by the DSCR-potential screen on real-estate leads: the file&apos;s soft-pull FICO (or stated credit
        tier) picks its tier, and the screen shows that rate ± the sensitivity spread. Deterministic screen
        assumptions only — never quoted to the borrower.
      </p>
    </div>
  );
}
