"use client";

// AddPropertyModal — used by the Properties tab on /clients/[id]/workspace.
// Captures the minimum fields the agent needs to track a buyer target
// or a seller listing. Other fields can be filled in later from the
// property detail view.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import type { ClientPropertyInput } from "@/hooks/useApi";

interface Props {
  clientSide: "buyer" | "seller" | "both";
  onSubmit: (body: ClientPropertyInput) => Promise<unknown>;
  onClose: () => void;
}

const PROPERTY_TYPES = [
  { value: "single_family", label: "Single family" },
  { value: "multifamily", label: "Multifamily" },
  { value: "mixed_use", label: "Mixed-use" },
  { value: "commercial", label: "Commercial" },
  { value: "retail", label: "Retail" },
  { value: "office", label: "Office" },
  { value: "industrial", label: "Industrial" },
  { value: "land", label: "Land" },
];

const STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC"];


export function AddPropertyModal({ clientSide, onSubmit, onClose }: Props) {
  const { t } = useTheme();
  const defaultSide: ClientPropertyInput["side"] =
    clientSide === "seller" ? "seller_listing" : "buyer_target";
  const [side, setSide] = useState<ClientPropertyInput["side"]>(defaultSide);
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateField, setStateField] = useState("");
  const [zip, setZip] = useState("");
  const [propertyType, setPropertyType] = useState<string>("single_family");
  const [price, setPrice] = useState<string>("");
  const [bedrooms, setBedrooms] = useState<string>("");
  const [bathrooms, setBathrooms] = useState<string>("");
  const [sqft, setSqft] = useState<string>("");
  const [units, setUnits] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      const priceNum = price.trim() ? Number(price) : null;
      await onSubmit({
        side,
        status: "active",
        address: address.trim() || null,
        city: city.trim() || null,
        state: stateField || null,
        zip: zip.trim() || null,
        property_type: propertyType || null,
        // Buyer side → target_price, seller side → list_price
        target_price: side === "buyer_target" ? priceNum : null,
        list_price: side === "seller_listing" ? priceNum : null,
        bedrooms: bedrooms ? parseInt(bedrooms, 10) : null,
        bathrooms: bathrooms ? Number(bathrooms) : null,
        sqft: sqft ? parseInt(sqft, 10) : null,
        units: units ? parseInt(units, 10) : null,
        notes: notes.trim() || null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save property.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "rgba(11,22,41,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
    >
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 580 }}>
        <Card pad={20}>
          <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: t.ink, margin: 0, flex: 1 }}>
              Add property
            </h2>
            <button
              onClick={onClose}
              style={{
                background: "transparent", border: `1px solid ${t.line}`,
                padding: "4px 8px", borderRadius: 6, color: t.ink3,
                cursor: "pointer", fontSize: 12,
              }}
            >
              Close
            </button>
          </div>

          {/* Side picker */}
          <Field label="Type" t={t}>
            <div style={{ display: "flex", gap: 6 }}>
              <Chip active={side === "buyer_target"} onClick={() => setSide("buyer_target")} t={t}>
                Buyer target
              </Chip>
              <Chip active={side === "seller_listing"} onClick={() => setSide("seller_listing")} t={t}>
                Seller listing
              </Chip>
            </div>
          </Field>

          <Field label="Address" t={t}>
            <input value={address} onChange={e => setAddress(e.target.value)} placeholder="123 Main St" style={input(t)} />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 90px 110px", gap: 10 }}>
            <Field label="City" t={t}>
              <input value={city} onChange={e => setCity(e.target.value)} style={input(t)} />
            </Field>
            <Field label="State" t={t}>
              <select value={stateField} onChange={e => setStateField(e.target.value)} style={input(t)}>
                <option value="">—</option>
                {STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="ZIP" t={t}>
              <input value={zip} onChange={e => setZip(e.target.value)} style={input(t)} />
            </Field>
          </div>

          <Field label="Property type" t={t}>
            <select value={propertyType} onChange={e => setPropertyType(e.target.value)} style={input(t)}>
              {PROPERTY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>

          <Field label={side === "seller_listing" ? "List price" : "Target price"} t={t}>
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="e.g. 875000"
              style={input(t)}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <Field label="Beds" t={t}>
              <input type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} style={input(t)} />
            </Field>
            <Field label="Baths" t={t}>
              <input type="number" step="0.5" value={bathrooms} onChange={e => setBathrooms(e.target.value)} style={input(t)} />
            </Field>
            <Field label="Sq ft" t={t}>
              <input type="number" value={sqft} onChange={e => setSqft(e.target.value)} style={input(t)} />
            </Field>
            <Field label="Units" t={t}>
              <input type="number" value={units} onChange={e => setUnits(e.target.value)} style={input(t)} />
            </Field>
          </div>

          <Field label="Notes" t={t}>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...input(t), resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>

          {err ? (
            <div style={{ color: t.danger, fontSize: 12, marginBottom: 10 }}>
              {err}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <button
              onClick={submit}
              disabled={busy}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: 700,
                borderRadius: 8, border: "none",
                background: t.brand, color: t.inverse, cursor: "pointer",
                opacity: busy ? 0.5 : 1,
              }}
            >
              {busy ? "Saving…" : "Add property"}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: "10px 16px", fontSize: 13, fontWeight: 700,
                borderRadius: 8, border: `1px solid ${t.line}`,
                background: t.surface, color: t.ink, cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}


function Field({ label, children, t }: { label: string; children: React.ReactNode; t: ReturnType<typeof useTheme>["t"] }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      {children}
    </div>
  );
}


function Chip({
  active, onClick, t, children,
}: {
  active: boolean;
  onClick: () => void;
  t: ReturnType<typeof useTheme>["t"];
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", fontSize: 12, fontWeight: 700,
        borderRadius: 18, cursor: "pointer",
        border: `1px solid ${active ? t.brand : t.line}`,
        background: active ? t.brand : t.surface,
        color: active ? t.inverse : t.ink,
      }}
    >
      {children}
    </button>
  );
}


function input(t: ReturnType<typeof useTheme>["t"]) {
  return {
    width: "100%", padding: 8, fontSize: 13,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink,
  } as const;
}
