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
//
// Styling lives in globals.css / app-extras.css. The two-pane shape is
// `.withrail` (main surface + sticky rail) and the edit form is `.fldsec` /
// `.fldgrid`, which is the form grid — `.cg` is the 12-column PAGE grid and is
// the wrong tool inside a panel.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { useUpdateProperty } from "@/hooks/useApi";
import { QC_FMT } from "@/lib/fmt";
import { parseUSD, parseIntStrict } from "@/lib/formCoerce";
import { PropertyType, PropertyTypeOptions } from "@/lib/enums.generated";
import type { Loan } from "@/lib/types";
import { PropertyMap } from "@/components/property/PropertyMap";
import { AddressInput } from "@/components/property/GoogleAddressInput";
import {
  Btn,
  CellChip,
  Field,
  Input,
  Kpi,
  KpiRow,
  Linky,
  Panel,
  Select,
  Textarea,
  type ChipTone,
} from "@/components/ds";

const LISTING_STATUS_OPTIONS = [
  { value: "on_market", label: "On market", tone: "watch" },
  { value: "off_market", label: "Off market", tone: "muted" },
  { value: "in_contract", label: "In contract", tone: "brand" },
  { value: "closed", label: "Closed", tone: "ready" },
] as const;

export function PropertyTab({ loan, canEdit }: { loan: Loan; canEdit: boolean }) {
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
    <div className="withrail">
      {/* MAIN — listing-style hero + body */}
      <div className="grid">
        <Panel noPad>
          <PropertyMap
            address={loan.address}
            city={loan.city ?? null}
            state={loan.state ?? null}
            latitude={loan.latitude ?? null}
            longitude={loan.longitude ?? null}
            onGeocoded={persistGeocode}
            height={260}
          />
          <div className="panel-b">
            <div className="row top">
              <div className="grow">
                <div className="row">
                  {statusBadge ? (
                    <CellChip tone={listingTone(statusBadge.tone)}>{statusBadge.label}</CellChip>
                  ) : null}
                  <span className="lbl">{prettyPropertyType(loan.property_type)}</span>
                  {loan.unit_count && loan.unit_count > 1 ? (
                    <span className="lbl">· {loan.unit_count} units</span>
                  ) : null}
                </div>
                <h2>{loan.address || "Untitled property"}</h2>
                <div className="sub">
                  {[loan.city, loan.state].filter(Boolean).join(", ") || "—"}
                </div>
              </div>
              {canEdit && !editing && (
                <Btn onClick={() => setEditing(true)}>
                  <Icon name="gear" size={12} /> Edit details
                </Btn>
              )}
            </div>

            {/* Stat grid — beds / baths / sqft / lot / built / units */}
            <KpiRow className="mt">
              <Kpi label="Beds" value={loan.beds ?? "—"} prose />
              <Kpi label="Baths" value={loan.baths ?? "—"} prose />
              <Kpi label="Sqft" value={loan.sqft ? loan.sqft.toLocaleString() : "—"} prose />
              <Kpi label="Lot" value={loan.lot_size_sqft ? `${loan.lot_size_sqft.toLocaleString()} sf` : "—"} prose />
              <Kpi label="Year" value={loan.year_built ?? "—"} prose />
              <Kpi label="Zoning" value={loan.zoning ?? "—"} prose />
            </KpiRow>

            {/* Description */}
            {!editing ? (
              <>
                <div className="lbl mt">About this property</div>
                {/* `.pretext` keeps the agent's own line breaks; without it a
                    multi-paragraph listing narrative collapses to one block. */}
                <div className={loan.description ? "pretext" : "pretext sub"}>
                  {loan.description || "Agent has not added a description yet. Click 'Edit details' above to write the listing narrative."}
                </div>

                {loan.highlight_features && loan.highlight_features.length > 0 ? (
                  <>
                    <div className="lbl mt">Highlights</div>
                    <div className="row">
                      {loan.highlight_features.map((f) => (
                        <CellChip key={f} tone="acc">{f}</CellChip>
                      ))}
                    </div>
                  </>
                ) : null}

                {(loan.parcel_id || loan.lot_size_sqft) && (
                  <div className="sub mt">
                    {loan.parcel_id ? <span>APN: <strong>{loan.parcel_id}</strong></span> : null}
                  </div>
                )}
              </>
            ) : (
              <EditForm
                draft={draft}
                setDraft={setDraft}
                featureDraft={featureDraft}
                setFeatureDraft={setFeatureDraft}
                onCancel={() => setEditing(false)}
                onSave={save}
                saving={update.isPending}
              />
            )}
          </div>
        </Panel>
      </div>

      {/* SIDEBAR — valuation + holding costs */}
      <div className="railcol">
        <Panel title="Valuation">
          <KvRow label="As-is value (appraised)" value={loan.ltv ? QC_FMT.usd(Math.round(Number(loan.amount) / Number(loan.ltv))) : "—"} />
          <KvRow label="ARV (after repair)" value={loan.arv ? QC_FMT.usd(Number(loan.arv)) : "—"} />
          <KvRow label="Loan-to-value" value={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}%` : "—"} />
          {loan.ltc && <KvRow label="Loan-to-cost" value={`${(loan.ltc * 100).toFixed(0)}%`} />}
        </Panel>

        <Panel title="Holding costs (annual)">
          <KpiRow>
            <Kpi label="Property taxes" value={QC_FMT.usd(Number(loan.annual_taxes))} prose />
            <Kpi label="Insurance" value={QC_FMT.usd(Number(loan.annual_insurance))} prose />
            <Kpi label="HOA (monthly)" value={QC_FMT.usd(Number(loan.monthly_hoa))} prose />
          </KpiRow>
        </Panel>

        {loan.monthly_rent ? (
          <Panel title="Income">
            <KpiRow>
              <Kpi label="Monthly rent" value={QC_FMT.usd(Number(loan.monthly_rent))} prose />
              <Kpi label="Annualized" value={QC_FMT.usd(Number(loan.monthly_rent) * 12)} prose />
            </KpiRow>
          </Panel>
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
  draft, setDraft, featureDraft, setFeatureDraft, onCancel, onSave, saving,
}: {
  draft: Draft;
  setDraft: (next: Draft) => void;
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
    <div className="fldsec mt">
      <AddressInput
        value={{ street: draft.address, city: draft.city, state: draft.state }}
        onChange={(next) => update({
          address: next.street ?? "",
          city: next.city ?? "",
          state: next.state ?? "",
        })}
      />

      <div className="fldgrid three mt">
        <Field label="Property type">
          <Select
            value={draft.property_type}
            onChange={(e) => update({ property_type: e.target.value as Loan["property_type"] })}
          >
            {PropertyTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Listing status">
          <Select
            value={draft.listing_status}
            onChange={(e) => update({ listing_status: e.target.value })}
          >
            <option value="">—</option>
            {LISTING_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>
        <Field label="Units">
          <Input value={draft.unit_count} onChange={(e) => update({ unit_count: e.target.value })} placeholder="1" />
        </Field>
      </div>

      <div className="fldgrid four mt">
        <Field label="Beds">
          <Input value={draft.beds} onChange={(e) => update({ beds: e.target.value })} />
        </Field>
        <Field label="Baths">
          <Input value={draft.baths} onChange={(e) => update({ baths: e.target.value })} />
        </Field>
        <Field label="Interior sqft">
          <Input value={draft.sqft} onChange={(e) => update({ sqft: e.target.value })} />
        </Field>
        <Field label="Lot sqft">
          <Input value={draft.lot_size_sqft} onChange={(e) => update({ lot_size_sqft: e.target.value })} />
        </Field>
      </div>

      <div className="fldgrid three mt">
        <Field label="Year built">
          <Input value={draft.year_built} onChange={(e) => update({ year_built: e.target.value })} />
        </Field>
        <Field label="Zoning">
          <Input value={draft.zoning} onChange={(e) => update({ zoning: e.target.value })} placeholder="R-1 / C-2 / …" />
        </Field>
        <Field label="APN / Parcel ID">
          <Input value={draft.parcel_id} onChange={(e) => update({ parcel_id: e.target.value })} />
        </Field>
      </div>

      <div className="fldgrid three mt">
        <Field label="Annual taxes">
          <MoneyInput value={draft.annual_taxes} onChange={(v) => update({ annual_taxes: v })} />
        </Field>
        <Field label="Annual insurance">
          <MoneyInput value={draft.annual_insurance} onChange={(v) => update({ annual_insurance: v })} />
        </Field>
        <Field label="Monthly HOA">
          <MoneyInput value={draft.monthly_hoa} onChange={(v) => update({ monthly_hoa: v })} />
        </Field>
      </div>

      <Field label="Description (listing narrative)" className="mt">
        <Textarea
          value={draft.description}
          onChange={(e) => update({ description: e.target.value })}
          rows={5}
          placeholder="Tell the funding team what's special about this property — condition, recent updates, comps story, anything material."
        />
      </Field>

      <Field label="Highlight features (chips)" className="mt">
        <div className="row">
          {draft.highlight_features.map((f) => (
            <CellChip key={f} tone="acc">
              {f}
              <Linky
                aria-label={`Remove ${f}`}
                onClick={() => update({ highlight_features: draft.highlight_features.filter((x) => x !== f) })}
              >×</Linky>
            </CellChip>
          ))}
        </div>
        <div className="row">
          <Input
            grow
            value={featureDraft}
            onChange={(e) => setFeatureDraft(e.target.value)}
            placeholder="e.g. New roof, ADU potential, Cap rate 7.2%"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); addFeature(); }
            }}
          />
          <Btn onClick={addFeature}>Add</Btn>
        </div>
      </Field>

      <div className="row end mt">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="pri" onClick={onSave} disabled={saving}>
          <Icon name="check" size={13} /> {saving ? "Saving…" : "Save property"}
        </Btn>
      </div>
    </div>
  );
}


/** A `.field` carrying a `$` adornment. See `.fieldpre` in app-extras.css. */
function MoneyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="fieldpre">
      <span className="pre">$</span>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}


function KvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <b className="num">{value}</b>
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


// The listing-status tones. These used to be two switch statements returning a
// (bg, fg) pair off the theme; they now resolve to the sheet's chip
// vocabulary, so "closed" is the same green here as a verified doc elsewhere.
function listingTone(tone: string): ChipTone {
  switch (tone) {
    case "ready": return "ok";
    case "watch": return "warn";
    case "brand": return "acc";
    case "muted": return "mut";
    default: return "mut";
  }
}
