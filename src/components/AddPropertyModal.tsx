"use client";

// AddPropertyModal — used by the Properties tab on /clients/[id]/workspace.
// Captures the minimum fields the agent needs to track a buyer target
// or a seller listing. Other fields can be filled in later from the
// property detail view.

import { useState } from "react";
import { V, type CssVars } from "@/components/design-system/cssVars";
import { Btn } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { GoogleAddressInput } from "@/components/property/GoogleAddressInput";
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

export function AddPropertyModal({ clientSide, onSubmit, onClose }: Props) {
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
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="Add property"
      closeOnBackdrop={!busy}
      footer={
        <>
          <Btn onClick={onClose} disabled={busy}>Cancel</Btn>
          <span className="sp" />
          <Btn variant="pri" onClick={submit} disabled={busy}>
            {busy ? "Saving..." : "Add property"}
          </Btn>
        </>
      }
    >
      <div className="grid">
          {/* Side picker */}
          <Field label="Type">
            <div style={{ display: "flex", gap: 6 }}>
              <Chip active={side === "buyer_target"} onClick={() => setSide("buyer_target")}>
                Buyer target
              </Chip>
              <Chip active={side === "seller_listing"} onClick={() => setSide("seller_listing")}>
                Seller listing
              </Chip>
            </div>
          </Field>

          <div style={{ marginBottom: 10 }}>
            <GoogleAddressInput
              value={{ street: address, city, state: stateField, zip }}
              onChange={(next) => {
                setAddress(next.street ?? "");
                setCity(next.city ?? "");
                setStateField(next.state ?? "");
                setZip(next.zip ?? "");
              }}
              helperText="Search Google and select the property, or use manual entry if the address is not listed."
            />
          </div>

          <Field label="Property type">
            <select value={propertyType} onChange={e => setPropertyType(e.target.value)} style={input()}>
              {PROPERTY_TYPES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>

          <Field label={side === "seller_listing" ? "List price" : "Target price"}>
            <input
              type="number"
              inputMode="numeric"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder="e.g. 875000"
              style={input()}
            />
          </Field>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <Field label="Beds">
              <input type="number" value={bedrooms} onChange={e => setBedrooms(e.target.value)} style={input()} />
            </Field>
            <Field label="Baths">
              <input type="number" step="0.5" value={bathrooms} onChange={e => setBathrooms(e.target.value)} style={input()} />
            </Field>
            <Field label="Sq ft">
              <input type="number" value={sqft} onChange={e => setSqft(e.target.value)} style={input()} />
            </Field>
            <Field label="Units">
              <input type="number" value={units} onChange={e => setUnits(e.target.value)} style={input()} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              style={{ ...input(), resize: "vertical", fontFamily: "inherit" }}
            />
          </Field>

          {err ? (
            <div style={{ color: V.danger, fontSize: 12, marginBottom: 10 }}>
              {err}
            </div>
          ) : null}

      </div>
    </Drawer>
  );
}


function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: V.ink3, marginBottom: 4, textTransform: "uppercase" }}>
        {label}
      </div>
      {children}
    </div>
  );
}


function Chip({
  active, onClick, children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 12px", fontSize: 12, fontWeight: 700,
        borderRadius: 18, cursor: "pointer",
        border: `1px solid ${active ? V.brand : V.line}`,
        background: active ? V.brand : V.surface,
        color: active ? V.inverse : V.ink,
      }}
    >
      {children}
    </button>
  );
}


function input() {
  return {
    width: "100%", padding: 8, fontSize: 13,
    borderRadius: 6, border: `1px solid ${V.line}`,
    background: V.surface, color: V.ink,
  } as const;
}
