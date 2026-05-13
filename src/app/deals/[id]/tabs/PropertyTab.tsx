"use client";

// Property tab — always-editable inline fields. The agent sees every
// input in display and types directly. Changes mark the form dirty
// and a single "Save changes" button lights up. Saves cross-sync onto
// the linked Loan at promote_deal_to_loan time.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useLoan, useUpdateDealById, useUpdateProperty } from "@/hooks/useApi";
import { PropertyMap } from "@/components/property/PropertyMap";
import type { Deal, DSTaskRow, Loan } from "@/lib/types";
import type { PropertyType } from "@/lib/enums.generated";
import {
  deriveRedPropertyFields,
  emptyPropertyFlags,
  type PropertyFieldFlags,
} from "./fieldFillRequirements";

const PROPERTY_TYPES = ["sfr", "duplex", "triplex", "quad", "5_plus", "condo", "townhouse", "manufactured"];
const LISTING_STATUSES = ["off_market", "coming_soon", "active", "pending", "under_contract", "sold", "withdrawn"];

interface Draft {
  address: string;
  city: string;
  state: string;
  zip: string;
  property_type: string;
  beds: string;
  baths: string;
  sqft: string;
  year_built: string;
  list_price: string;
  target_price: string;
  listing_status: string;
  mls_number: string;
}

// When the deal has been promoted to a Loan, the Loan row is the
// canonical source of truth for the shared property fields (address,
// city, state, property_type, beds, baths, sqft, year_built,
// listing_status). The agent and the underwriting team edit the
// SAME row from their respective views. Deal-only fields (zip,
// list_price, target_price, mls_number) stay on the Deal because
// the Loan model doesn't carry them.
function buildDraft(deal: Deal, loan: Loan | null | undefined): Draft {
  const shared = loan ?? deal;
  return {
    address: (shared.address ?? deal.address) ?? "",
    city: (shared.city ?? deal.city) ?? "",
    state: (shared.state ?? deal.state) ?? "",
    zip: deal.zip ?? "",
    property_type: ((shared.property_type as string | null | undefined) ?? deal.property_type) ?? "",
    beds: (shared.beds ?? deal.beds)?.toString() ?? "",
    baths: (shared.baths ?? deal.baths)?.toString() ?? "",
    sqft: (shared.sqft ?? deal.sqft)?.toString() ?? "",
    year_built: (shared.year_built ?? deal.year_built)?.toString() ?? "",
    list_price: deal.list_price?.toString() ?? "",
    target_price: deal.target_price?.toString() ?? "",
    listing_status: (shared.listing_status ?? deal.listing_status) ?? "",
    mls_number: deal.mls_number ?? "",
  };
}

export function PropertyTab({
  deal,
  requiredFieldRows = [],
}: {
  deal: Deal;
  // property_data requirements still open. Each empty matching field
  // renders with a red left-border + "Required" pill. Unmapped keys
  // show up in the top callout so the agent still knows about them.
  requiredFieldRows?: DSTaskRow[];
}) {
  const { t } = useTheme();
  const updateDeal = useUpdateDealById();
  const updateProperty = useUpdateProperty();
  // Once the deal has been promoted, the linked Loan row is the
  // canonical source for the shared property fields. Both the agent
  // here and the funding team on /loans/[id] write to the same row.
  const { data: loan } = useLoan(deal.promoted_loan_id);
  const linkedLoan = loan ?? null;

  const [draft, setDraft] = useState<Draft>(() => buildDraft(deal, linkedLoan));
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Map open requirements → which specific draft fields should render
  // red. Recomputes as the agent types so a field stops being red as
  // soon as it has a value.
  const { flags: redFlags, unmappedLabels } = useMemo(() => {
    if (requiredFieldRows.length === 0) {
      return { flags: emptyPropertyFlags(), unmappedLabels: [] as string[] };
    }
    return deriveRedPropertyFields(requiredFieldRows, {
      address: draft.address,
      city: draft.city,
      state: draft.state,
      zip: draft.zip,
      property_type: draft.property_type,
      beds: draft.beds,
      baths: draft.baths,
      sqft: draft.sqft,
      year_built: draft.year_built,
      list_price: draft.list_price,
      target_price: draft.target_price,
      listing_status: draft.listing_status,
      mls_number: draft.mls_number,
    });
  }, [requiredFieldRows, draft]);

  // Snap back to server values when EITHER the deal or its linked
  // loan changes underneath us, but only when there are no unsaved
  // local edits.
  useEffect(() => {
    if (!dirty) setDraft(buildDraft(deal, linkedLoan));
  }, [deal, linkedLoan, dirty]);

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
    setSavedAt(null);
  }

  async function save() {
    setErr(null);
    try {
      const sharedPayload = {
        address: draft.address || null,
        city: draft.city || null,
        state: draft.state || null,
        property_type: (draft.property_type || null) as PropertyType | null,
        beds: draft.beds ? Number(draft.beds) : null,
        baths: draft.baths ? Number(draft.baths) : null,
        sqft: draft.sqft ? Number(draft.sqft) : null,
        year_built: draft.year_built ? Number(draft.year_built) : null,
        listing_status: draft.listing_status || null,
      };
      const dealOnlyPayload = {
        zip: draft.zip || null,
        list_price: draft.list_price ? Number(draft.list_price) : null,
        target_price: draft.target_price ? Number(draft.target_price) : null,
        mls_number: draft.mls_number || null,
      };
      if (linkedLoan) {
        // Post-promotion: shared fields go to the Loan (the funding
        // team's view will reflect the edit on next refetch), Deal-only
        // listing extras stay on the Deal.
        //
        // Strip nulls before the Loan PATCH — the frontend Loan type
        // is non-nullable on most fields; the backend's PropertyUpdate
        // schema treats missing fields as "no change" so an empty
        // string clearing isn't useful here anyway. The Deal mirror
        // PATCH below keeps the nulls so clearing on the deal works.
        const loanPatch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(sharedPayload)) {
          if (v !== null && v !== "") loanPatch[k] = v;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await updateProperty.mutateAsync({ loanId: linkedLoan.id, ...(loanPatch as any) });
        await updateDeal.mutateAsync({
          clientId: deal.client_id,
          dealId: deal.id,
          body: { ...sharedPayload, ...dealOnlyPayload },
        });
      } else {
        // Pre-promotion: write everything to the Deal. promote_deal_to_loan
        // will carry these onto the Loan at handoff time.
        await updateDeal.mutateAsync({
          clientId: deal.client_id,
          dealId: deal.id,
          body: { ...sharedPayload, ...dealOnlyPayload },
        });
      }
      setDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  function reset() {
    setDraft(buildDraft(deal, linkedLoan));
    setDirty(false);
    setSavedAt(null);
  }

  const isSeller = deal.deal_type === "seller";

  return (
    <Card pad={18}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <SectionLabel>Property</SectionLabel>
        {linkedLoan ? (
          <span
            style={{
              padding: "2px 8px",
              borderRadius: 999,
              background: t.brandSoft,
              color: t.brand,
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
            title="Edits sync to the funding workspace on the same loan"
          >
            Syncs to {linkedLoan.deal_id}
          </span>
        ) : null}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
          {dirty ? <span style={{ fontSize: 11, color: t.warn, fontWeight: 700 }}>Unsaved changes</span> : null}
          {!dirty && savedAt ? <span style={{ fontSize: 11, color: t.ink3 }}>Saved</span> : null}
          {err ? <span style={{ fontSize: 11, color: t.danger }}>{err}</span> : null}
          {dirty ? (
            <button onClick={reset} style={btnSecondary(t)}>Discard</button>
          ) : null}
          <button
            onClick={save}
            disabled={!dirty || updateDeal.isPending || updateProperty.isPending}
            style={btnPrimary(t, !dirty || updateDeal.isPending || updateProperty.isPending)}
          >
            {updateDeal.isPending || updateProperty.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>

      {requiredFieldRows.length > 0 ? (
        <RequiredFieldsCallout
          t={t}
          flagCount={countTrue(redFlags)}
          unmappedLabels={unmappedLabels}
        />
      ) : null}

      {/* Address row — full width + map preview side by side */}
      <Section title="Address">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(220px, 0.6fr)", gap: 14 }}>
          <div>
            <Grid cols="3fr 1.5fr 0.6fr 0.8fr">
              <Field label="Street address" required={redFlags.address}>
                <input value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" style={inputStyle(t, redFlags.address)} />
              </Field>
              <Field label="City" required={redFlags.city}>
                <input value={draft.city} onChange={(e) => set("city", e.target.value)} placeholder="Tampa" style={inputStyle(t, redFlags.city)} />
              </Field>
              <Field label="State" required={redFlags.state}>
                <input maxLength={2} value={draft.state} onChange={(e) => set("state", e.target.value.toUpperCase())} placeholder="FL" style={inputStyle(t, redFlags.state)} />
              </Field>
              <Field label="ZIP" required={redFlags.zip}>
                <input value={draft.zip} onChange={(e) => set("zip", e.target.value)} placeholder="33602" style={inputStyle(t, redFlags.zip)} />
              </Field>
            </Grid>
          </div>
          {draft.address ? (
            <div style={{ borderRadius: 8, overflow: "hidden", border: `1px solid ${t.line}` }}>
              <PropertyMap
                address={draft.address}
                city={draft.city || null}
                state={draft.state || null}
                latitude={null}
                longitude={null}
                width={320}
                height={180}
                style="osm-bright"
              />
            </div>
          ) : (
            <div
              style={{
                borderRadius: 8,
                border: `1px dashed ${t.line}`,
                background: t.surface2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: t.ink3,
                fontSize: 12,
                minHeight: 180,
                padding: 12,
                textAlign: "center",
              }}
            >
              Map appears once you enter a street address.
            </div>
          )}
        </div>
      </Section>

      <Section title="Details">
        <Grid cols="1fr 1fr 1fr 1fr 1fr">
          <Field label="Property type" required={redFlags.property_type}>
            <select value={draft.property_type} onChange={(e) => set("property_type", e.target.value)} style={inputStyle(t, redFlags.property_type)}>
              <option value="">—</option>
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="Beds" required={redFlags.beds}>
            <input type="number" value={draft.beds} onChange={(e) => set("beds", e.target.value)} placeholder="3" style={inputStyle(t, redFlags.beds)} />
          </Field>
          <Field label="Baths" required={redFlags.baths}>
            <input type="number" step="0.5" value={draft.baths} onChange={(e) => set("baths", e.target.value)} placeholder="2.5" style={inputStyle(t, redFlags.baths)} />
          </Field>
          <Field label="Sq ft" required={redFlags.sqft}>
            <input type="number" value={draft.sqft} onChange={(e) => set("sqft", e.target.value)} placeholder="1850" style={inputStyle(t, redFlags.sqft)} />
          </Field>
          <Field label="Year built" required={redFlags.year_built}>
            <input type="number" value={draft.year_built} onChange={(e) => set("year_built", e.target.value)} placeholder="1998" style={inputStyle(t, redFlags.year_built)} />
          </Field>
        </Grid>
      </Section>

      <Section title={isSeller ? "Listing" : "Pricing"}>
        <Grid cols="1fr 1fr 1fr 1fr">
          {isSeller ? (
            <Field label="List price" required={redFlags.list_price}>
              <input type="number" value={draft.list_price} onChange={(e) => set("list_price", e.target.value)} placeholder="450000" style={inputStyle(t, redFlags.list_price)} />
            </Field>
          ) : (
            <Field label="Target price" required={redFlags.target_price}>
              <input type="number" value={draft.target_price} onChange={(e) => set("target_price", e.target.value)} placeholder="375000" style={inputStyle(t, redFlags.target_price)} />
            </Field>
          )}
          <Field label="Listing status" required={redFlags.listing_status}>
            <select value={draft.listing_status} onChange={(e) => set("listing_status", e.target.value)} style={inputStyle(t, redFlags.listing_status)}>
              <option value="">—</option>
              {LISTING_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="MLS#" required={redFlags.mls_number}>
            <input value={draft.mls_number} onChange={(e) => set("mls_number", e.target.value)} placeholder="A4592031" style={inputStyle(t, redFlags.mls_number)} />
          </Field>
          {/* When buyer, also expose list_price as the seller's asking
              so the agent can capture both buyer target + seller list
              if they're tracking offer math. */}
          {!isSeller ? (
            <Field label="Seller's asking" required={redFlags.list_price}>
              <input type="number" value={draft.list_price} onChange={(e) => set("list_price", e.target.value)} placeholder="425000" style={inputStyle(t, redFlags.list_price)} />
            </Field>
          ) : (
            <Field label="Target / negotiation price" required={redFlags.target_price}>
              <input type="number" value={draft.target_price} onChange={(e) => set("target_price", e.target.value)} placeholder="440000" style={inputStyle(t, redFlags.target_price)} />
            </Field>
          )}
        </Grid>
      </Section>
    </Card>
  );
}

function RequiredFieldsCallout({
  t,
  flagCount,
  unmappedLabels,
}: {
  t: ReturnType<typeof useTheme>["t"];
  flagCount: number;
  unmappedLabels: string[];
}) {
  const total = flagCount + unmappedLabels.length;
  if (total === 0) {
    return (
      <div
        style={{
          marginBottom: 14,
          padding: "10px 12px",
          borderRadius: 8,
          background: `${t.brand}10`,
          border: `1px solid ${t.brand}40`,
          fontSize: 12.5,
          color: t.ink2,
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="docCheck" size={12} color={t.brand} stroke={2.2} />
        All property fields are filled — nothing red on this tab right now.
      </div>
    );
  }
  return (
    <div
      style={{
        marginBottom: 14,
        padding: "10px 12px",
        borderRadius: 8,
        background: `${t.danger}10`,
        border: `1px solid ${t.danger}55`,
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
      }}
    >
      <Icon name="alert" size={13} color={t.danger} stroke={2.2} />
      <div style={{ flex: 1, fontSize: 12.5, color: t.ink }}>
        <strong>{total} property field{total === 1 ? "" : "s"} need data.</strong>{" "}
        Fields outlined in red below are the ones to fill.
        {unmappedLabels.length > 0 ? (
          <div style={{ marginTop: 4, fontSize: 11.5, color: t.ink3 }}>
            Also pending (no dedicated field on this tab):{" "}
            {unmappedLabels.slice(0, 4).join(", ")}
            {unmappedLabels.length > 4 ? `, +${unmappedLabels.length - 4} more` : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function countTrue(flags: PropertyFieldFlags): number {
  return Object.values(flags).filter(Boolean).length;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.2, marginBottom: 8 }}>
        {title.toUpperCase()}
      </div>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: cols, gap: 10 }}>
      {children}
    </div>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  return (
    <label
      style={{
        display: "block",
        minWidth: 0,
        position: "relative",
        paddingLeft: required ? 8 : 0,
        borderLeft: required ? `3px solid ${t.danger}` : "none",
        transition: "border-color 120ms",
      }}
    >
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: required ? t.danger : t.ink3,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        {label}
        {required ? (
          <span
            style={{
              fontSize: 9,
              fontWeight: 900,
              padding: "1px 6px",
              borderRadius: 9,
              background: t.danger,
              color: "#fff",
              letterSpacing: 0.5,
            }}
          >
            REQUIRED
          </span>
        ) : null}
      </span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"], required = false): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${required ? t.danger : t.line}`,
    background: t.surface,
    color: t.ink,
    boxSizing: "border-box",
    boxShadow: required ? `0 0 0 2px ${t.danger}22` : "none",
  };
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"], disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.4 : 1,
  };
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    cursor: "pointer",
  };
}
