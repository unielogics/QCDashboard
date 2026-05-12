"use client";

// Property tab — always-editable inline fields. The agent sees every
// input in display and types directly. Changes mark the form dirty
// and a single "Save changes" button lights up. Saves cross-sync onto
// the linked Loan at promote_deal_to_loan time.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useLoan, useUpdateDealById, useUpdateProperty } from "@/hooks/useApi";
import { PropertyMap } from "@/components/property/PropertyMap";
import type { Deal, Loan } from "@/lib/types";
import type { PropertyType } from "@/lib/enums.generated";

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

export function PropertyTab({ deal }: { deal: Deal }) {
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

      {/* Address row — full width + map preview side by side */}
      <Section title="Address">
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.4fr) minmax(220px, 0.6fr)", gap: 14 }}>
          <div>
            <Grid cols="3fr 1.5fr 0.6fr 0.8fr">
              <Field label="Street address">
                <input value={draft.address} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" style={inputStyle(t)} />
              </Field>
              <Field label="City">
                <input value={draft.city} onChange={(e) => set("city", e.target.value)} placeholder="Tampa" style={inputStyle(t)} />
              </Field>
              <Field label="State">
                <input maxLength={2} value={draft.state} onChange={(e) => set("state", e.target.value.toUpperCase())} placeholder="FL" style={inputStyle(t)} />
              </Field>
              <Field label="ZIP">
                <input value={draft.zip} onChange={(e) => set("zip", e.target.value)} placeholder="33602" style={inputStyle(t)} />
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
          <Field label="Property type">
            <select value={draft.property_type} onChange={(e) => set("property_type", e.target.value)} style={inputStyle(t)}>
              <option value="">—</option>
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="Beds">
            <input type="number" value={draft.beds} onChange={(e) => set("beds", e.target.value)} placeholder="3" style={inputStyle(t)} />
          </Field>
          <Field label="Baths">
            <input type="number" step="0.5" value={draft.baths} onChange={(e) => set("baths", e.target.value)} placeholder="2.5" style={inputStyle(t)} />
          </Field>
          <Field label="Sq ft">
            <input type="number" value={draft.sqft} onChange={(e) => set("sqft", e.target.value)} placeholder="1850" style={inputStyle(t)} />
          </Field>
          <Field label="Year built">
            <input type="number" value={draft.year_built} onChange={(e) => set("year_built", e.target.value)} placeholder="1998" style={inputStyle(t)} />
          </Field>
        </Grid>
      </Section>

      <Section title={isSeller ? "Listing" : "Pricing"}>
        <Grid cols="1fr 1fr 1fr 1fr">
          {isSeller ? (
            <Field label="List price">
              <input type="number" value={draft.list_price} onChange={(e) => set("list_price", e.target.value)} placeholder="450000" style={inputStyle(t)} />
            </Field>
          ) : (
            <Field label="Target price">
              <input type="number" value={draft.target_price} onChange={(e) => set("target_price", e.target.value)} placeholder="375000" style={inputStyle(t)} />
            </Field>
          )}
          <Field label="Listing status">
            <select value={draft.listing_status} onChange={(e) => set("listing_status", e.target.value)} style={inputStyle(t)}>
              <option value="">—</option>
              {LISTING_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </Field>
          <Field label="MLS#">
            <input value={draft.mls_number} onChange={(e) => set("mls_number", e.target.value)} placeholder="A4592031" style={inputStyle(t)} />
          </Field>
          {/* When buyer, also expose list_price as the seller's asking
              so the agent can capture both buyer target + seller list
              if they're tracking offer math. */}
          {!isSeller ? (
            <Field label="Seller's asking">
              <input type="number" value={draft.list_price} onChange={(e) => set("list_price", e.target.value)} placeholder="425000" style={inputStyle(t)} />
            </Field>
          ) : (
            <Field label="Target / negotiation price">
              <input type="number" value={draft.target_price} onChange={(e) => set("target_price", e.target.value)} placeholder="440000" style={inputStyle(t)} />
            </Field>
          )}
        </Grid>
      </Section>
    </Card>
  );
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "block", minWidth: 0 }}>
      <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>
        {label}
      </span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "8px 10px",
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    boxSizing: "border-box",
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
