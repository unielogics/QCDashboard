"use client";

// Property tab — always-editable inline fields. The agent sees every
// input in display and types directly. Changes mark the form dirty
// and a single "Save changes" button lights up. Saves cross-sync onto
// the linked Loan at promote_deal_to_loan time.

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  Callout,
  CellChip,
  Field,
  Input,
  Panel,
  Select,
  Sub,
  cx,
} from "@/components/ds";
import { useLoan, useUpdateDealById, useUpdateProperty } from "@/hooks/useApi";
import { GoogleAddressInput } from "@/components/property/GoogleAddressInput";
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

  function setAddressParts(next: { street?: string | null; city?: string | null; state?: string | null; zip?: string | null }) {
    setDraft((d) => ({
      ...d,
      address: next.street ?? "",
      city: next.city ?? "",
      state: next.state ?? "",
      zip: next.zip ?? "",
    }));
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
  const saving = updateDeal.isPending || updateProperty.isPending;

  return (
    <Panel
      title="Property"
      sub={
        linkedLoan ? (
          <CellChip tone="acc" title="Edits sync to the funding workspace on the same loan">
            Syncs to {linkedLoan.deal_id}
          </CellChip>
        ) : undefined
      }
      actions={
        <>
          {dirty ? <CellChip tone="warn">Unsaved changes</CellChip> : null}
          {!dirty && savedAt ? <CellChip tone="ok">Saved</CellChip> : null}
          {err ? <CellChip tone="bad">{err}</CellChip> : null}
          {dirty ? <Btn onClick={reset}>Discard</Btn> : null}
          <Btn variant="pri" onClick={save} disabled={!dirty || saving}>
            {saving ? "Saving…" : "Save changes"}
          </Btn>
        </>
      }
    >
      {requiredFieldRows.length > 0 ? (
        <RequiredFieldsCallout
          flagCount={countTrue(redFlags)}
          unmappedLabels={unmappedLabels}
        />
      ) : null}

      {/* Address row — full width + map preview side by side */}
      <Section title="Address">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(220px, 0.6fr)",
            gap: 14,
          }}
        >
          <div>
            <GoogleAddressInput
              value={{ street: draft.address, city: draft.city, state: draft.state, zip: draft.zip }}
              onChange={setAddressParts}
              helperText="Select a Google suggestion to split street, city, state, and ZIP. Use manual entry when the address is not listed."
            />
          </div>
          {draft.address ? (
            <div className="mapbox">
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
            <div className="mapbox empty">Map appears once you enter a street address.</div>
          )}
        </div>
      </Section>

      <Section title="Details">
        <div className="fldgrid five">
          <Field label="Property type" req={redFlags.property_type}>
            <Select
              value={draft.property_type}
              onChange={(e) => set("property_type", e.target.value)}
              className={cx(redFlags.property_type && "bad")}
            >
              <option value="">—</option>
              {PROPERTY_TYPES.map((p) => (
                <option key={p} value={p}>{p.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="Beds" req={redFlags.beds}>
            <Input
              type="number"
              value={draft.beds}
              onChange={(e) => set("beds", e.target.value)}
              placeholder="3"
              className={cx(redFlags.beds && "bad")}
            />
          </Field>
          <Field label="Baths" req={redFlags.baths}>
            <Input
              type="number"
              step="0.5"
              value={draft.baths}
              onChange={(e) => set("baths", e.target.value)}
              placeholder="2.5"
              className={cx(redFlags.baths && "bad")}
            />
          </Field>
          <Field label="Sq ft" req={redFlags.sqft}>
            <Input
              type="number"
              value={draft.sqft}
              onChange={(e) => set("sqft", e.target.value)}
              placeholder="1850"
              className={cx(redFlags.sqft && "bad")}
            />
          </Field>
          <Field label="Year built" req={redFlags.year_built}>
            <Input
              type="number"
              value={draft.year_built}
              onChange={(e) => set("year_built", e.target.value)}
              placeholder="1998"
              className={cx(redFlags.year_built && "bad")}
            />
          </Field>
        </div>
      </Section>

      <Section title={isSeller ? "Listing" : "Pricing"}>
        <div className="fldgrid four">
          {isSeller ? (
            <Field label="List price" req={redFlags.list_price}>
              <Input
                type="number"
                value={draft.list_price}
                onChange={(e) => set("list_price", e.target.value)}
                placeholder="450000"
                className={cx(redFlags.list_price && "bad")}
              />
            </Field>
          ) : (
            <Field label="Target price" req={redFlags.target_price}>
              <Input
                type="number"
                value={draft.target_price}
                onChange={(e) => set("target_price", e.target.value)}
                placeholder="375000"
                className={cx(redFlags.target_price && "bad")}
              />
            </Field>
          )}
          <Field label="Listing status" req={redFlags.listing_status}>
            <Select
              value={draft.listing_status}
              onChange={(e) => set("listing_status", e.target.value)}
              className={cx(redFlags.listing_status && "bad")}
            >
              <option value="">—</option>
              {LISTING_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </Select>
          </Field>
          <Field label="MLS#" req={redFlags.mls_number}>
            <Input
              value={draft.mls_number}
              onChange={(e) => set("mls_number", e.target.value)}
              placeholder="A4592031"
              className={cx(redFlags.mls_number && "bad")}
            />
          </Field>
          {/* When buyer, also expose list_price as the seller's asking
              so the agent can capture both buyer target + seller list
              if they're tracking offer math. */}
          {!isSeller ? (
            <Field label="Seller's asking" req={redFlags.list_price}>
              <Input
                type="number"
                value={draft.list_price}
                onChange={(e) => set("list_price", e.target.value)}
                placeholder="425000"
                className={cx(redFlags.list_price && "bad")}
              />
            </Field>
          ) : (
            <Field label="Target / negotiation price" req={redFlags.target_price}>
              <Input
                type="number"
                value={draft.target_price}
                onChange={(e) => set("target_price", e.target.value)}
                placeholder="440000"
                className={cx(redFlags.target_price && "bad")}
              />
            </Field>
          )}
        </div>
      </Section>
    </Panel>
  );
}

function RequiredFieldsCallout({
  flagCount,
  unmappedLabels,
}: {
  flagCount: number;
  unmappedLabels: string[];
}) {
  const total = flagCount + unmappedLabels.length;
  if (total === 0) {
    return (
      <Callout tone="acc" icon={<Icon name="docCheck" size={14} stroke={2.2} />} className="mb">
        All property fields are filled — nothing red on this tab right now.
      </Callout>
    );
  }
  return (
    <Callout tone="bad" icon={<Icon name="alert" size={14} stroke={2.2} />} className="mb">
      <strong>
        {total} property field{total === 1 ? "" : "s"} need data.
      </strong>{" "}
      Fields outlined in red below are the ones to fill.
      {unmappedLabels.length > 0 ? (
        <Sub>
          Also pending (no dedicated field on this tab):{" "}
          {unmappedLabels.slice(0, 4).join(", ")}
          {unmappedLabels.length > 4 ? `, +${unmappedLabels.length - 4} more` : ""}
        </Sub>
      ) : null}
    </Callout>
  );
}

function countTrue(flags: PropertyFieldFlags): number {
  return Object.values(flags).filter(Boolean).length;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="fldsec">
      <div className="lbl">{title}</div>
      {children}
    </div>
  );
}
