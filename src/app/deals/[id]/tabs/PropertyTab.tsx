"use client";

// Property tab — editable property fields on the Deal. These cross
// onto the new Loan at promote_deal_to_loan time, so funding sees
// the snapshot. Editable while the deal is open; once promoted the
// Loan becomes the source of truth (this tab stays read-mostly but
// agents can still annotate listing_status / mls_number).

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useUpdateDealById } from "@/hooks/useApi";
import type { Deal } from "@/lib/types";

const PROPERTY_TYPES = ["sfr", "duplex", "triplex", "quad", "5_plus", "condo", "townhouse", "manufactured"];

export function PropertyTab({ deal }: { deal: Deal }) {
  const { t } = useTheme();
  const update = useUpdateDealById();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    address: deal.address ?? "",
    city: deal.city ?? "",
    state: deal.state ?? "",
    zip: deal.zip ?? "",
    property_type: deal.property_type ?? "",
    beds: deal.beds?.toString() ?? "",
    baths: deal.baths?.toString() ?? "",
    sqft: deal.sqft?.toString() ?? "",
    year_built: deal.year_built?.toString() ?? "",
    list_price: deal.list_price?.toString() ?? "",
    target_price: deal.target_price?.toString() ?? "",
    listing_status: deal.listing_status ?? "",
    mls_number: deal.mls_number ?? "",
  });
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraft({
        address: deal.address ?? "",
        city: deal.city ?? "",
        state: deal.state ?? "",
        zip: deal.zip ?? "",
        property_type: deal.property_type ?? "",
        beds: deal.beds?.toString() ?? "",
        baths: deal.baths?.toString() ?? "",
        sqft: deal.sqft?.toString() ?? "",
        year_built: deal.year_built?.toString() ?? "",
        list_price: deal.list_price?.toString() ?? "",
        target_price: deal.target_price?.toString() ?? "",
        listing_status: deal.listing_status ?? "",
        mls_number: deal.mls_number ?? "",
      });
    }
  }, [deal, editing]);

  const isSeller = deal.deal_type === "seller";

  async function save() {
    setErr(null);
    try {
      await update.mutateAsync({
        clientId: deal.client_id,
        dealId: deal.id,
        body: {
          address: draft.address || null,
          city: draft.city || null,
          state: draft.state || null,
          zip: draft.zip || null,
          property_type: draft.property_type || null,
          beds: draft.beds ? Number(draft.beds) : null,
          baths: draft.baths ? Number(draft.baths) : null,
          sqft: draft.sqft ? Number(draft.sqft) : null,
          year_built: draft.year_built ? Number(draft.year_built) : null,
          list_price: draft.list_price ? Number(draft.list_price) : null,
          target_price: draft.target_price ? Number(draft.target_price) : null,
          listing_status: draft.listing_status || null,
          mls_number: draft.mls_number || null,
        },
      });
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  if (!editing) {
    return (
      <Card pad={18}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <SectionLabel>Property</SectionLabel>
          <button
            onClick={() => setEditing(true)}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            <Icon name="pencil" size={11} /> Edit
          </button>
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: deal.address ? t.ink : t.ink3,
            marginBottom: 4,
          }}
        >
          {deal.address || "No address yet"}
        </div>
        {deal.city || deal.state || deal.zip ? (
          <div style={{ fontSize: 12, color: t.ink3, marginBottom: 12 }}>
            {[deal.city, deal.state, deal.zip].filter(Boolean).join(", ")}
          </div>
        ) : null}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10 }}>
          {deal.property_type ? <KPI label="Type" value={deal.property_type.replace(/_/g, " ")} /> : null}
          {deal.beds ? <KPI label="Beds" value={String(deal.beds)} /> : null}
          {deal.baths ? <KPI label="Baths" value={String(deal.baths)} /> : null}
          {deal.sqft ? <KPI label="Sq ft" value={Number(deal.sqft).toLocaleString()} /> : null}
          {deal.year_built ? <KPI label="Year built" value={String(deal.year_built)} /> : null}
          {deal.list_price ? <KPI label="List price" value={`$${Number(deal.list_price).toLocaleString()}`} /> : null}
          {deal.target_price ? <KPI label="Target price" value={`$${Number(deal.target_price).toLocaleString()}`} /> : null}
          {deal.listing_status ? <KPI label="Listing status" value={deal.listing_status} /> : null}
          {deal.mls_number ? <KPI label="MLS#" value={deal.mls_number} /> : null}
        </div>
      </Card>
    );
  }

  return (
    <Card pad={18}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <SectionLabel>Property — editing</SectionLabel>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Address">
          <input value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="City">
          <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="State">
          <input maxLength={2} value={draft.state} onChange={(e) => setDraft({ ...draft, state: e.target.value.toUpperCase() })} style={inputStyle(t)} />
        </Field>
        <Field label="ZIP">
          <input value={draft.zip} onChange={(e) => setDraft({ ...draft, zip: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="Property type">
          <select value={draft.property_type} onChange={(e) => setDraft({ ...draft, property_type: e.target.value })} style={inputStyle(t)}>
            <option value="">—</option>
            {PROPERTY_TYPES.map((p) => (
              <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
            ))}
          </select>
        </Field>
        <Field label="Year built">
          <input type="number" value={draft.year_built} onChange={(e) => setDraft({ ...draft, year_built: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="Beds">
          <input type="number" value={draft.beds} onChange={(e) => setDraft({ ...draft, beds: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="Baths">
          <input type="number" step="0.5" value={draft.baths} onChange={(e) => setDraft({ ...draft, baths: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="Sq ft">
          <input type="number" value={draft.sqft} onChange={(e) => setDraft({ ...draft, sqft: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label={isSeller ? "List price" : "Target price"}>
          <input
            type="number"
            value={isSeller ? draft.list_price : draft.target_price}
            onChange={(e) =>
              isSeller
                ? setDraft({ ...draft, list_price: e.target.value })
                : setDraft({ ...draft, target_price: e.target.value })
            }
            style={inputStyle(t)}
          />
        </Field>
        <Field label="Listing status">
          <input value={draft.listing_status} onChange={(e) => setDraft({ ...draft, listing_status: e.target.value })} style={inputStyle(t)} />
        </Field>
        <Field label="MLS#">
          <input value={draft.mls_number} onChange={(e) => setDraft({ ...draft, mls_number: e.target.value })} style={inputStyle(t)} />
        </Field>
      </div>
      {err ? <div style={{ marginTop: 10, fontSize: 12, color: t.danger }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
        <button onClick={() => setEditing(false)} style={btnSecondary(t)}>Cancel</button>
        <button onClick={save} disabled={update.isPending} style={btnPrimary(t, update.isPending)}>
          {update.isPending ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: 8,
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
  };
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"], pending: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 6,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: "pointer",
    opacity: pending ? 0.6 : 1,
  };
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    cursor: "pointer",
  };
}
