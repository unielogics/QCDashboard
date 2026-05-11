"use client";

// PropertyTab — agent-facing listing-style property view.
//
// Renders almost like an MLS / brokerage detail page: hero (map +
// listing status badge), address + property meta, agent-written
// description, highlight features as chips, structural numbers as a
// stat grid, and a sidebar with valuation + holding costs.
//
// All fields editable through the `/loans/{id}/property` endpoint
// (broker-accessible) — flips into edit mode in place.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useUpdateProperty } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseUSD, parseIntStrict } from "@/lib/formCoerce";
import { PropertyType, PropertyTypeOptions } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";
import { PropertyMap } from "@/components/property/PropertyMap";

const LISTING_STATUS_OPTIONS = [
  { value: "on_market", label: "On market", tone: "watch" },
  { value: "off_market", label: "Off market", tone: "muted" },
  { value: "in_contract", label: "In contract", tone: "brand" },
  { value: "closed", label: "Closed", tone: "ready" },
] as const;

export function PropertyTab({ loan, canEdit }: { loan: Loan; canEdit: boolean }) {
  const { t } = useTheme();
  const update = useUpdateProperty();
  const [editing, setEditing] = useState(false);
  const [featureDraft, setFeatureDraft] = useState("");
  const [draft, setDraft] = useState(() => loanToDraft(loan));

  // Re-seed draft if the loan changes (eg. another tab patched a field)
  // and we're not currently editing.
  useMemo(() => {
    if (!editing) setDraft(loanToDraft(loan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loan.id, loan.address]);

  const persistGeocode = (coords: { latitude: number; longitude: number }) => {
    // Don't overwrite existing coords on the loan record. Skipping when
    // they're already set keeps the update endpoint quiet on every page
    // load. Also skip if we don't have permission (canEdit=false).
    if (loan.latitude != null && loan.longitude != null) return;
    if (!canEdit) return;
    update.mutate({ loanId: loan.id, latitude: coords.latitude, longitude: coords.longitude });
  };

  const save = async () => {
    const beds = parseIntStrict(draft.beds);
    const baths = draft.baths.trim() === "" ? null : Number(draft.baths);
    const sqft = parseIntStrict(draft.sqft);
    const lot = parseIntStrict(draft.lot_size_sqft);
    const yearBuilt = parseIntStrict(draft.year_built);
    const unitCount = parseIntStrict(draft.unit_count);
    await update.mutateAsync({
      loanId: loan.id,
      address: draft.address || loan.address,
      city: draft.city || null,
      state: draft.state || null,
      property_type: draft.property_type as Loan["property_type"],
      beds,
      baths: baths != null && Number.isFinite(baths) ? baths : null,
      sqft,
      lot_size_sqft: lot,
      year_built: yearBuilt,
      unit_count: unitCount,
      annual_taxes: parseUSD(draft.annual_taxes),
      annual_insurance: parseUSD(draft.annual_insurance),
      monthly_hoa: parseUSD(draft.monthly_hoa),
      description: draft.description || null,
      zoning: draft.zoning || null,
      parcel_id: draft.parcel_id || null,
      listing_status: draft.listing_status || null,
      highlight_features: draft.highlight_features.length ? draft.highlight_features : null,
      street_view_url: draft.street_view_url || null,
      // address moves invalidate the cached coords so the next map
      // render re-geocodes against the new query.
      ...(draft.address !== loan.address ? { latitude: null, longitude: null } : {}),
    });
    setEditing(false);
  };

  const statusBadge = LISTING_STATUS_OPTIONS.find((o) => o.value === loan.listing_status);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.45fr 1fr", gap: 18 }}>
      {/* MAIN — listing-style hero + body */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={0}>
          <PropertyMap
            address={loan.address}
            city={loan.city ?? null}
            state={loan.state ?? null}
            latitude={loan.latitude ?? null}
            longitude={loan.longitude ?? null}
            onGeocoded={persistGeocode}
            height={260}
          />
          <div style={{ padding: 18 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  {statusBadge ? (
                    <Pill
                      bg={pillBg(t, statusBadge.tone)}
                      color={pillColor(t, statusBadge.tone)}
                    >
                      {statusBadge.label}
                    </Pill>
                  ) : null}
                  <span style={{ fontSize: 11, fontWeight: 800, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
                    {prettyPropertyType(loan.property_type)}
                  </span>
                  {loan.unit_count && loan.unit_count > 1 ? (
                    <span style={{ fontSize: 11, fontWeight: 800, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
                      · {loan.unit_count} units
                    </span>
                  ) : null}
                </div>
                <div style={{ marginTop: 6, fontSize: 22, fontWeight: 900, color: t.ink, lineHeight: 1.2 }}>
                  {loan.address || "Untitled property"}
                </div>
                <div style={{ marginTop: 3, fontSize: 13.5, color: t.ink2 }}>
                  {[loan.city, loan.state].filter(Boolean).join(", ") || "—"}
                </div>
              </div>
              {canEdit && !editing && (
                <button onClick={() => setEditing(true)} style={qcBtn(t)}>
                  <Icon name="gear" size={12} /> Edit details
                </button>
              )}
            </div>

            {/* Stat grid — beds / baths / sqft / lot / built / units */}
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
              gap: 8,
              marginTop: 16,
              padding: 12,
              borderRadius: 11,
              background: t.surface2,
              border: `1px solid ${t.line}`,
            }}>
              <Stat label="Beds" value={loan.beds ?? "—"} t={t} />
              <Stat label="Baths" value={loan.baths ?? "—"} t={t} />
              <Stat label="Sqft" value={loan.sqft ? loan.sqft.toLocaleString() : "—"} t={t} />
              <Stat label="Lot" value={loan.lot_size_sqft ? `${loan.lot_size_sqft.toLocaleString()} sf` : "—"} t={t} />
              <Stat label="Year" value={loan.year_built ?? "—"} t={t} />
              <Stat label="Zoning" value={loan.zoning ?? "—"} t={t} />
            </div>

            {/* Description */}
            {!editing ? (
              <>
                <div style={{ marginTop: 18, fontSize: 11, fontWeight: 900, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                  About this property
                </div>
                <div style={{
                  marginTop: 6,
                  fontSize: 13,
                  color: loan.description ? t.ink : t.ink3,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                }}>
                  {loan.description || "Agent has not added a description yet. Click 'Edit details' above to write the listing narrative."}
                </div>

                {loan.highlight_features && loan.highlight_features.length > 0 ? (
                  <>
                    <div style={{ marginTop: 18, fontSize: 11, fontWeight: 900, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                      Highlights
                    </div>
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {loan.highlight_features.map((f) => (
                        <span key={f} style={{
                          fontSize: 11.5, fontWeight: 800,
                          padding: "4px 10px", borderRadius: 999,
                          background: t.brandSoft, color: t.brand,
                        }}>
                          {f}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}

                {(loan.parcel_id || loan.lot_size_sqft) && (
                  <div style={{ marginTop: 18, fontSize: 11.5, color: t.ink3, lineHeight: 1.6 }}>
                    {loan.parcel_id ? <span>APN: <strong style={{ color: t.ink2 }}>{loan.parcel_id}</strong></span> : null}
                  </div>
                )}
              </>
            ) : (
              <EditForm
                draft={draft}
                setDraft={setDraft}
                t={t}
                featureDraft={featureDraft}
                setFeatureDraft={setFeatureDraft}
                onCancel={() => setEditing(false)}
                onSave={save}
                saving={update.isPending}
              />
            )}
          </div>
        </Card>
      </div>

      {/* SIDEBAR — valuation + holding costs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel>Valuation</SectionLabel>
          <Row t={t} label="As-is value (appraised)" value={loan.ltv ? QC_FMT.usd(Math.round(Number(loan.amount) / Number(loan.ltv))) : "—"} />
          <Row t={t} label="ARV (after repair)" value={loan.arv ? QC_FMT.usd(Number(loan.arv)) : "—"} />
          <Row t={t} label="Loan-to-value" value={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}%` : "—"} />
          {loan.ltc && <Row t={t} label="Loan-to-cost" value={`${(loan.ltc * 100).toFixed(0)}%`} />}
        </Card>

        <Card pad={16}>
          <SectionLabel>Holding costs (annual)</SectionLabel>
          <KPI label="Property taxes" value={QC_FMT.usd(Number(loan.annual_taxes))} />
          <KPI label="Insurance" value={QC_FMT.usd(Number(loan.annual_insurance))} />
          <KPI label="HOA (monthly)" value={QC_FMT.usd(Number(loan.monthly_hoa))} />
        </Card>

        {loan.monthly_rent ? (
          <Card pad={16}>
            <SectionLabel>Income</SectionLabel>
            <KPI label="Monthly rent" value={QC_FMT.usd(Number(loan.monthly_rent))} />
            <KPI label="Annualized" value={QC_FMT.usd(Number(loan.monthly_rent) * 12)} />
          </Card>
        ) : null}
      </div>
    </div>
  );
}


type Draft = ReturnType<typeof loanToDraft>;

function loanToDraft(loan: Loan) {
  return {
    address: loan.address ?? "",
    city: loan.city ?? "",
    state: loan.state ?? "",
    property_type: loan.property_type,
    beds: loan.beds == null ? "" : String(loan.beds),
    baths: loan.baths == null ? "" : String(loan.baths),
    sqft: loan.sqft == null ? "" : String(loan.sqft),
    lot_size_sqft: loan.lot_size_sqft == null ? "" : String(loan.lot_size_sqft),
    year_built: loan.year_built == null ? "" : String(loan.year_built),
    unit_count: loan.unit_count == null ? "" : String(loan.unit_count),
    annual_taxes: String(loan.annual_taxes ?? ""),
    annual_insurance: String(loan.annual_insurance ?? ""),
    monthly_hoa: String(loan.monthly_hoa ?? ""),
    description: loan.description ?? "",
    zoning: loan.zoning ?? "",
    parcel_id: loan.parcel_id ?? "",
    listing_status: loan.listing_status ?? "",
    highlight_features: loan.highlight_features ?? [],
    street_view_url: loan.street_view_url ?? "",
  };
}


function EditForm({
  draft, setDraft, t, featureDraft, setFeatureDraft, onCancel, onSave, saving,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
  t: ReturnType<typeof useTheme>["t"];
  featureDraft: string;
  setFeatureDraft: (v: string) => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const update = (partial: Partial<Draft>) => setDraft({ ...draft, ...partial });

  const addFeature = () => {
    const v = featureDraft.trim();
    if (!v) return;
    if (draft.highlight_features.includes(v)) { setFeatureDraft(""); return; }
    update({ highlight_features: [...draft.highlight_features, v] });
    setFeatureDraft("");
  };

  return (
    <div style={{ marginTop: 16, display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 100px", gap: 10 }}>
        <Field t={t} label="Address">
          <Input t={t} value={draft.address} onChange={(v) => update({ address: v })} />
        </Field>
        <Field t={t} label="City">
          <Input t={t} value={draft.city} onChange={(v) => update({ city: v })} />
        </Field>
        <Field t={t} label="State (2-letter)">
          <Input t={t} value={draft.state} onChange={(v) => update({ state: v.toUpperCase() })} maxLength={2} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field t={t} label="Property type">
          <select
            value={draft.property_type}
            onChange={(e) => update({ property_type: e.target.value as Loan["property_type"] })}
            style={inputStyle(t)}
          >
            {PropertyTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field t={t} label="Listing status">
          <select
            value={draft.listing_status}
            onChange={(e) => update({ listing_status: e.target.value })}
            style={inputStyle(t)}
          >
            <option value="">—</option>
            {LISTING_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        <Field t={t} label="Units">
          <Input t={t} value={draft.unit_count} onChange={(v) => update({ unit_count: v })} placeholder="1" />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
        <Field t={t} label="Beds">
          <Input t={t} value={draft.beds} onChange={(v) => update({ beds: v })} />
        </Field>
        <Field t={t} label="Baths">
          <Input t={t} value={draft.baths} onChange={(v) => update({ baths: v })} />
        </Field>
        <Field t={t} label="Interior sqft">
          <Input t={t} value={draft.sqft} onChange={(v) => update({ sqft: v })} />
        </Field>
        <Field t={t} label="Lot sqft">
          <Input t={t} value={draft.lot_size_sqft} onChange={(v) => update({ lot_size_sqft: v })} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field t={t} label="Year built">
          <Input t={t} value={draft.year_built} onChange={(v) => update({ year_built: v })} />
        </Field>
        <Field t={t} label="Zoning">
          <Input t={t} value={draft.zoning} onChange={(v) => update({ zoning: v })} placeholder="R-1 / C-2 / …" />
        </Field>
        <Field t={t} label="APN / Parcel ID">
          <Input t={t} value={draft.parcel_id} onChange={(v) => update({ parcel_id: v })} />
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field t={t} label="Annual taxes">
          <Input t={t} value={draft.annual_taxes} onChange={(v) => update({ annual_taxes: v })} prefix="$" />
        </Field>
        <Field t={t} label="Annual insurance">
          <Input t={t} value={draft.annual_insurance} onChange={(v) => update({ annual_insurance: v })} prefix="$" />
        </Field>
        <Field t={t} label="Monthly HOA">
          <Input t={t} value={draft.monthly_hoa} onChange={(v) => update({ monthly_hoa: v })} prefix="$" />
        </Field>
      </div>

      <Field t={t} label="Description (listing narrative)">
        <textarea
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={5}
          placeholder="Tell the funding team what's special about this property — condition, recent updates, comps story, anything material."
          style={{
            ...inputStyle(t),
            resize: "vertical",
            lineHeight: 1.5,
            fontFamily: "inherit",
          }}
        />
      </Field>

      <Field t={t} label="Highlight features (chips)">
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
          {draft.highlight_features.map((f) => (
            <span key={f} style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontSize: 11.5, fontWeight: 800,
              padding: "4px 10px", borderRadius: 999,
              background: t.brandSoft, color: t.brand,
            }}>
              {f}
              <button
                type="button"
                onClick={() => update({ highlight_features: draft.highlight_features.filter((x) => x !== f) })}
                style={{ all: "unset", cursor: "pointer", fontSize: 13, fontWeight: 900, lineHeight: 1, color: t.brand }}
              >×</button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <Input
            t={t}
            value={featureDraft}
            onChange={setFeatureDraft}
            placeholder="e.g. New roof, ADU potential, Cap rate 7.2%"
            onSubmit={addFeature}
          />
          <button onClick={addFeature} style={qcBtn(t)}>Add</button>
        </div>
      </Field>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 4 }}>
        <button onClick={onCancel} style={qcBtn(t)}>Cancel</button>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ ...qcBtnPrimary(t), opacity: saving ? 0.6 : 1, cursor: saving ? "wait" : "pointer" }}
        >
          <Icon name="check" size={13} /> {saving ? "Saving…" : "Save property"}
        </button>
      </div>
    </div>
  );
}


function prettyPropertyType(p: Loan["property_type"]): string {
  switch (p) {
    case PropertyType.SFR: return "Single-Family";
    case PropertyType.UNITS_2_4: return "2–4 Units";
    case PropertyType.UNITS_5_8: return "5–8 Units";
    case PropertyType.MIXED_USE: return "Mixed-Use";
    case PropertyType.COMMERCIAL: return "Commercial";
    default: return p;
  }
}


function pillBg(t: ReturnType<typeof useTheme>["t"], tone: string): string {
  switch (tone) {
    case "ready": return t.profitBg;
    case "watch": return t.warnBg;
    case "brand": return t.brandSoft;
    case "muted": return t.surface2;
    default: return t.surface2;
  }
}
function pillColor(t: ReturnType<typeof useTheme>["t"], tone: string): string {
  switch (tone) {
    case "ready": return t.profit;
    case "watch": return t.warn;
    case "brand": return t.brand;
    case "muted": return t.ink3;
    default: return t.ink3;
  }
}


function Stat({ label, value, t }: { label: string; value: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 2, fontSize: 14, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}


function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}


function Input({
  t, value, onChange, prefix, placeholder, maxLength, onSubmit,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: string;
  onChange: (v: string) => void;
  prefix?: string;
  placeholder?: string;
  maxLength?: number;
  onSubmit?: () => void;
}) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", flex: 1 }}>
      {prefix && <span style={{ position: "absolute", left: 10, fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onSubmit) { e.preventDefault(); onSubmit(); }
        }}
        style={{ ...inputStyle(t), paddingLeft: prefix ? 22 : 12 }}
      />
    </div>
  );
}


function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
    border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}


function Row({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
      <span style={{ fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>{value}</span>
    </div>
  );
}
