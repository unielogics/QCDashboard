"use client";

// AgentLeadModal — agent-side "+ New Client" capture.
//
// Simplified to the minimum the broker actually needs to start working a
// lead. Mirrors the mobile single-page form.
//
// Fields:
//   1. Name (required)
//   2. Email + Phone (≥1 required)
//   3. Buyer or Seller toggle
//   4. Properties owned — multi-row editor (each row: address / city /
//      state / use / value / balance owed). Can be empty for buyers.
//   5. Listing property — seller only. Pick which owned property is
//      the one being listed.
//
// Defaults applied server-side (not asked of the broker):
//   lead_source           = "manual_entry"
//   lead_temperature      = "warm"
//   financing_support     = "unknown"
//   contact_permission    = "save_lead_only" | "send_invite_now" by intent
//   relationship_context  = "new_lead"
//   cadence_preset        = "standard"  (broker tunes later via NurtureControls)
//
// Submits POST /clients with stage='lead'. Never creates a Loan; the
// loan emerges from the agent's "Ready for Prequalification" handoff
// downstream.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { Btn, WarnLine, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useCreateClient, useBufferWizardIntent, useSendIntakeLink } from "@/hooks/useApi";
import { ClientSearchBlock } from "@/components/ClientSearchBlock";
import { GoogleAddressInput } from "@/components/property/GoogleAddressInput";

type Side = "buyer" | "seller";
type AssetUse = "primary" | "rental" | "second_home" | "investment" | "other";

interface OwnedAsset {
  address: string;
  city: string;
  state: string;
  use: AssetUse;
  value: string;
  balanceOwed: string;
}

const NEW_ASSET: OwnedAsset = {
  address: "",
  city: "",
  state: "",
  use: "rental",
  value: "",
  balanceOwed: "",
};

interface FormState {
  side: Side;
  // Pulled in via ClientSearchBlock if the broker matched an existing
  // client mid-typing — UI bails out via onPickExisting before submit.
  clientPickedId: string | null;
  name: string;
  email: string;
  phone: string;
  ownedAssets: OwnedAsset[];
  listingIndex: number | null; // seller-only
}

const INITIAL: FormState = {
  side: "buyer",
  clientPickedId: null,
  name: "",
  email: "",
  phone: "",
  ownedAssets: [],
  listingIndex: null,
};

export function AgentLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Kept only for <ClientSearchBlock>, which still takes a token bag.
  const router = useRouter();
  const create = useCreateClient();
  const sendIntakeLink = useSendIntakeLink();
  const bufferWizardIntent = useBufferWizardIntent();
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((s) => ({ ...s, [k]: v }));

  const hasName = form.name.trim().length > 0;
  const hasContact = form.email.trim().length > 0 || form.phone.trim().length > 0;
  const emailLooksValid = form.email.trim().length === 0 || form.email.trim().includes("@");
  const sellerListingValid =
    form.side !== "seller"
      ? true
      : form.listingIndex != null &&
        (form.ownedAssets[form.listingIndex]?.address.trim().length ?? 0) > 0;

  const isSubmitting = create.isPending || sendIntakeLink.isPending;
  const canSubmit =
    hasName && hasContact && emailLooksValid && sellerListingValid && !isSubmitting;

  const reset = () => {
    setForm(INITIAL);
    setSubmitErr(null);
  };

  const submit = async (intent: "save" | "save_and_invite") => {
    setSubmitErr(null);
    try {
      const lead_intake = buildLeadIntake(form);
      const created = await create.mutateAsync({
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        stage: "lead",
        client_type: form.side,
        lead_intake,
        // Defaults — broker tunes per-client later if needed.
        lead_source: "manual_entry",
        lead_temperature: "warm",
        financing_support_needed: "unknown",
        contact_permission: intent === "save_and_invite" ? "send_invite_now" : "save_lead_only",
        relationship_context: "new_lead",
        source_channel: "agent_dashboard",
      });
      // Default nurture intent — broker tunes cadence per-client later
      // via NurtureControls. We seed file_settings.outreach_mode so the
      // realtor-phase ClientAIPlan has a reasonable starting state.
      // Non-fatal on error.
      try {
        await bufferWizardIntent.mutateAsync({
          clientId: created.id,
          body: {
            assignments: [],
            file_settings: { outreach_mode: "draft_first" },
          },
        });
      } catch (e) {
        console.warn("wizard-intent buffer failed", e);
      }
      let intakeLinkError: string | null = null;
      if (intent === "save_and_invite") {
        try {
          await sendIntakeLink.mutateAsync({ clientId: created.id });
        } catch (e) {
          intakeLinkError = e instanceof Error ? e.message : "The intake link was not queued.";
        }
      }
      if (intakeLinkError) {
        setSubmitErr(`Client saved, but the intake link was not queued. ${intakeLinkError} Opening the client file...`);
        await new Promise((resolve) => window.setTimeout(resolve, 1400));
      }
      reset();
      onClose();
      router.push(`/clients/${created.id}`);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Failed to save lead");
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      sub={`New Client · ${form.side === "seller" ? "Seller" : "Buyer"}`}
      title="Capture lead"
      footer={
        <>
          <Btn onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Btn>
          {submitErr ? (
            <WarnLine className="sp">{submitErr}</WarnLine>
          ) : (
            <div className="sub" style={{ flex: 1, textAlign: "center" }}>
              {canSubmit ? "Ready to save" : "Fill in name + email or phone"}
            </div>
          )}
          <Btn onClick={() => void submit("save")} disabled={!canSubmit}>
            {isSubmitting ? "Saving…" : "Save"}
          </Btn>
          <Btn variant="pri" onClick={() => void submit("save_and_invite")} disabled={!canSubmit}>
            {isSubmitting ? "Sending…" : "Save + Send Intake Link"}
          </Btn>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section className="card" style={SECTION_STYLE}>
          <SectionLabel>Contact</SectionLabel>
          <Field label="Name" required>
            <Input
              value={form.name}
              onChange={(v) => update("name", v)}
              placeholder="Marcus Holloway"
            />
          </Field>
          <Row>
            <Field label="Email">
              <Input
                value={form.email}
                onChange={(v) => update("email", v)}
                placeholder="marcus@holloway.cap"
                type="email"
              />
            </Field>
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(v) => update("phone", v)}
                placeholder="(917) 555-0148"
                type="tel"
              />
            </Field>
          </Row>
          {hasContact ? (
            <div className="sub">Either email or phone is fine. Both works too.</div>
          ) : (
            <WarnLine>Provide at least an email or a phone.</WarnLine>
          )}
          {/* Existing-client check — desktop ClientSearchBlock has its
              own search input + dropdown. Picking a match exits the
              wizard and routes to that client's detail page. */}
          <ClientSearchBlock
            scope="mine"
            label="Already in your book?"
            helperText="Search to open an existing client instead of creating a duplicate."
            onPick={(c) => {
              reset();
              onClose();
              router.push(`/clients/${c.id}`);
            }}
          />
        </section>

        <section className="card" style={SECTION_STYLE}>
          <SectionLabel>Side</SectionLabel>
          <Segmented
            options={[
              { value: "buyer", label: "Buyer" },
              { value: "seller", label: "Seller" },
            ]}
            value={form.side}
            onChange={(v) => {
              const next = v as Side;
              update("side", next);
              if (next === "buyer") update("listingIndex", null);
            }}
          />
        </section>

        <section className="card" style={SECTION_STYLE}>
          <SectionLabel>Properties owned</SectionLabel>
          <div className="sub">
            {form.side === "seller"
              ? "Add the property they're listing (and any others they own)."
              : "Any properties they already own. Optional for buyers."}
          </div>
          <OwnedAssetsEditor
            assets={form.ownedAssets}
            onChange={(next) => {
              update("ownedAssets", next);
              if (form.listingIndex != null && (form.listingIndex >= next.length || next.length === 0)) {
                update("listingIndex", next.length > 0 ? 0 : null);
              }
            }}
          />
        </section>

        {form.side === "seller" && (
          <section className="card" style={SECTION_STYLE}>
            <SectionLabel>Listing property</SectionLabel>
            {form.ownedAssets.length === 0 ? (
              <Btn
                onClick={() => update("ownedAssets", [{ ...NEW_ASSET }])}
                style={{ alignSelf: "flex-start" }}
              >
                <Icon name="plus" size={12} /> Add the property they&apos;re listing
              </Btn>
            ) : (
              <div>
                {form.ownedAssets.map((a, idx) => {
                  const active = form.listingIndex === idx;
                  const disabled = a.address.trim().length === 0;
                  const summary =
                    a.address.trim().length > 0
                      ? `${a.address}${a.city ? ", " + a.city : ""}${a.state ? " " + a.state : ""}`
                      : "Untitled property (fill in above)";
                  return (
                    <button
                      key={idx}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => !disabled && update("listingIndex", idx)}
                      disabled={disabled}
                      className={cx("pick", active && "on")}
                      // A row with no address yet cannot be picked — dimming it
                      // is state, not decoration, so it stays inline.
                      style={{ width: "100%", textAlign: "left", opacity: disabled ? 0.5 : 1 }}
                    >
                      <span
                        className="repdot"
                        style={{ background: active ? "var(--accent)" : "var(--line2)" }}
                      />
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {summary}
                      </span>
                    </button>
                  );
                })}
                {!sellerListingValid && (
                  <WarnLine className="mt">Pick which property they&apos;re listing.</WarnLine>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </Drawer>
  );
}

// ── Inline OwnedAssetsEditor (desktop) ─────────────────────────────────

function OwnedAssetsEditor({
  assets,
  onChange,
}: {
  assets: OwnedAsset[];
  onChange: (next: OwnedAsset[]) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(assets.length === 0 ? null : 0);

  const updateRow = (idx: number, patch: Partial<OwnedAsset>) =>
    onChange(assets.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  const removeRow = (idx: number) => {
    onChange(assets.filter((_, i) => i !== idx));
    if (expanded === idx) setExpanded(null);
  };
  const addRow = () => {
    onChange([...assets, { ...NEW_ASSET }]);
    setExpanded(assets.length);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {assets.map((a, idx) => {
        const open = expanded === idx;
        const summary = a.address.trim()
          ? `${a.address}${a.city ? ", " + a.city : ""}${a.state ? " " + a.state : ""}`
          : "New property — click to fill in";
        return (
          <div key={idx} className="card" style={{ padding: 0, overflow: "hidden" }}>
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setExpanded(open ? null : idx)}
              style={{
                cursor: "pointer",
                width: "100%",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                textAlign: "left",
              }}
            >
              <Icon name="building" size={13} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {summary}
              </span>
              <Icon name={open ? "chevU" : "chevD"} size={12} />
            </button>
            {open && (
              <div
                style={{
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  borderTop: "1px solid var(--line)",
                }}
              >
                <GoogleAddressInput
                  value={{ street: a.address, city: a.city, state: a.state }}
                  onChange={(next) =>
                    updateRow(idx, {
                      address: next.street ?? "",
                      city: next.city ?? "",
                      state: next.state ?? "",
                    })
                  }
                  showZip={false}
                  helperText="Search Google and select the property, or use manual entry if the address is not listed."
                />
                <div className="row">
                  {([
                    ["primary", "Primary"],
                    ["rental", "Rental"],
                    ["second_home", "2nd home"],
                    ["investment", "Investment"],
                    ["other", "Other"],
                  ] as const).map(([v, l]) => {
                    const active = a.use === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={active}
                        onClick={() => updateRow(idx, { use: v })}
                        className={cx("btn", "sm", active && "pri")}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
                <div className="cg">
                  <div className="s6">
                    <Input
                      value={a.value}
                      onChange={(v) => updateRow(idx, { value: v })}
                      placeholder="Est. value"
                      type="text"
                    />
                  </div>
                  <div className="s6">
                    <Input
                      value={a.balanceOwed}
                      onChange={(v) => updateRow(idx, { balanceOwed: v })}
                      placeholder="Balance owed"
                      type="text"
                    />
                  </div>
                </div>
                <Btn className="sm" onClick={() => removeRow(idx)} style={{ alignSelf: "flex-start" }}>
                  Remove
                </Btn>
              </div>
            )}
          </div>
        );
      })}
      <Btn onClick={addRow} style={{ alignSelf: "flex-start" }}>
        <Icon name="plus" size={12} /> Add another property
      </Btn>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────

function buildLeadIntake(form: FormState): Record<string, unknown> {
  const owned_assets = form.ownedAssets
    .filter((a) => a.address.trim().length > 0)
    .map((a, idx) => ({
      address: a.address.trim(),
      city: a.city.trim(),
      state: a.state.trim().toUpperCase(),
      use: a.use,
      value: parseDollars(a.value),
      balance_owed: parseDollars(a.balanceOwed),
      is_listing: form.side === "seller" && form.listingIndex === idx,
    }));
  const listing =
    form.side === "seller" && form.listingIndex != null
      ? owned_assets.find((_a, i) => i === form.listingIndex) ?? null
      : null;
  return {
    side: form.side,
    owned_assets,
    listing_address: listing
      ? `${listing.address}${listing.city ? ", " + listing.city : ""}${listing.state ? " " + listing.state : ""}`
      : null,
    cadence_preset: "standard",
  };
}

function parseDollars(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

// ── Primitives ──────────────────────────────────────────────────────
//
// On the shared classes now (`.lbl`, `.field`, `.seg`), so none of them carry
// a palette or take a `t`.

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="lbl">{children}</div>;
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
      <label className="lbl">
        {label.toUpperCase()}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10 }}>{children}</div>;
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel";
}) {
  return (
    <input
      className="field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      style={{ width: "100%" }}
    />
  );
}

/** Exclusive choice on `.seg`. */
function Segmented({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="seg" role="tablist" aria-label="Deal side">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? "on" : ""}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** The section stack: `.card` owns the surface, this owns the rhythm. */
const SECTION_STYLE: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
};
