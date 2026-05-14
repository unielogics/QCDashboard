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
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPetrol } from "@/components/design-system/buttons";
import { RightPanel } from "@/components/design-system/RightPanel";
import { useCreateClient, useBufferWizardIntent } from "@/hooks/useApi";
import { ClientSearchBlock } from "@/components/ClientSearchBlock";
import { US_STATES } from "@/lib/usStates";
import type { QCTokens } from "@/components/design-system/tokens";

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
  const { t } = useTheme();
  const router = useRouter();
  const create = useCreateClient();
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

  const canSubmit =
    hasName && hasContact && emailLooksValid && sellerListingValid && !create.isPending;

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
      reset();
      onClose();
      router.push(`/clients/${created.id}`);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Failed to save lead");
    }
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      width="min(560px, max(40vw, 460px))"
      eyebrow={`New Client · ${form.side === "seller" ? "Seller" : "Buyer"}`}
      title="Capture lead"
      ariaLabel="New client capture"
      footer={
        <>
          <button onClick={onClose} style={qcBtn(t)} disabled={create.isPending}>
            Cancel
          </button>
          <div
            style={{
              flex: 1,
              textAlign: "center",
              fontSize: 11,
              color: submitErr ? t.danger : t.ink3,
              fontWeight: 600,
            }}
          >
            {submitErr ?? (canSubmit ? "Ready to save" : "Fill in name + email or phone")}
          </div>
          <div style={{ display: "inline-flex", gap: 6 }}>
            <button
              onClick={() => void submit("save")}
              disabled={!canSubmit}
              style={{ ...qcBtn(t), opacity: canSubmit ? 1 : 0.5 }}
            >
              {create.isPending ? "Saving…" : "Save"}
            </button>
            <button
              onClick={() => void submit("save_and_invite")}
              disabled={!canSubmit}
              style={{ ...qcBtnPetrol(t), opacity: canSubmit ? 1 : 0.5 }}
            >
              Save + Send Invite
            </button>
          </div>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <section style={sectionStyle(t)}>
          <SectionLabel t={t}>Contact</SectionLabel>
          <Field t={t} label="Name" required>
            <Input
              t={t}
              value={form.name}
              onChange={(v) => update("name", v)}
              placeholder="Marcus Holloway"
            />
          </Field>
          <Row t={t}>
            <Field t={t} label="Email">
              <Input
                t={t}
                value={form.email}
                onChange={(v) => update("email", v)}
                placeholder="marcus@holloway.cap"
                type="email"
              />
            </Field>
            <Field t={t} label="Phone">
              <Input
                t={t}
                value={form.phone}
                onChange={(v) => update("phone", v)}
                placeholder="(917) 555-0148"
                type="tel"
              />
            </Field>
          </Row>
          <div
            style={{
              fontSize: 11,
              color: hasContact ? t.ink3 : t.warn,
              lineHeight: 1.4,
            }}
          >
            {hasContact ? "Either email or phone is fine. Both works too." : "Provide at least an email or a phone."}
          </div>
          {/* Existing-client check — desktop ClientSearchBlock has its
              own search input + dropdown. Picking a match exits the
              wizard and routes to that client's detail page. */}
          <ClientSearchBlock
            t={t}
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

        <section style={sectionStyle(t)}>
          <SectionLabel t={t}>Side</SectionLabel>
          <Segmented
            t={t}
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

        <section style={sectionStyle(t)}>
          <SectionLabel t={t}>Properties owned</SectionLabel>
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
            {form.side === "seller"
              ? "Add the property they're listing (and any others they own)."
              : "Any properties they already own. Optional for buyers."}
          </div>
          <OwnedAssetsEditor
            t={t}
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
          <section style={sectionStyle(t)}>
            <SectionLabel t={t}>Listing property</SectionLabel>
            {form.ownedAssets.length === 0 ? (
              <button
                onClick={() => update("ownedAssets", [{ ...NEW_ASSET }])}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  padding: "10px 12px",
                  borderRadius: 9,
                  border: `1px dashed ${t.warn}`,
                  color: t.warn,
                  fontSize: 12.5,
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  alignSelf: "flex-start",
                }}
              >
                <Icon name="plus" size={12} /> Add the property they're listing
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                      onClick={() => !disabled && update("listingIndex", idx)}
                      disabled={disabled}
                      style={{
                        all: "unset",
                        cursor: disabled ? "not-allowed" : "pointer",
                        padding: "10px 12px",
                        borderRadius: 10,
                        border: `1px solid ${active ? t.brand : t.line}`,
                        background: active ? t.brandSoft : "transparent",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        opacity: disabled ? 0.5 : 1,
                      }}
                    >
                      <span
                        style={{
                          width: 16,
                          height: 16,
                          borderRadius: 999,
                          border: `2px solid ${active ? t.brand : t.lineStrong}`,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {active && (
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: t.brand,
                            }}
                          />
                        )}
                      </span>
                      <span
                        style={{
                          fontSize: 13,
                          color: active ? t.brand : t.ink,
                          fontWeight: active ? 800 : 600,
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
                  <div style={{ fontSize: 11, color: t.warn, marginTop: 4 }}>
                    Pick which property they're listing.
                  </div>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </RightPanel>
  );
}

// ── Inline OwnedAssetsEditor (desktop) ─────────────────────────────────

function OwnedAssetsEditor({
  t,
  assets,
  onChange,
}: {
  t: QCTokens;
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
          <div
            key={idx}
            style={{
              borderRadius: 10,
              border: `1px solid ${open ? t.brand : t.line}`,
              background: t.surface,
              overflow: "hidden",
            }}
          >
            <button
              onClick={() => setExpanded(open ? null : idx)}
              style={{
                all: "unset",
                cursor: "pointer",
                width: "100%",
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                boxSizing: "border-box",
              }}
            >
              <Icon name="building" size={13} color={t.ink2} />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 13,
                  color: t.ink,
                  fontWeight: 600,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {summary}
              </span>
              <Icon name={open ? "chevU" : "chevD"} size={12} color={t.ink3} />
            </button>
            {open && (
              <div
                style={{
                  padding: 12,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  borderTop: `1px solid ${t.line}`,
                }}
              >
                <Input
                  t={t}
                  value={a.address}
                  onChange={(v) => updateRow(idx, { address: v })}
                  placeholder="Street address"
                />
                <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8 }}>
                  <Input
                    t={t}
                    value={a.city}
                    onChange={(v) => updateRow(idx, { city: v })}
                    placeholder="City"
                  />
                  <select
                    value={a.state}
                    onChange={(e) => updateRow(idx, { state: e.target.value.toUpperCase().slice(0, 2) })}
                    style={{
                      ...inputBaseStyle(t),
                      padding: "8px 10px",
                    }}
                  >
                    <option value="">ST</option>
                    {US_STATES.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code}
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
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
                        onClick={() => updateRow(idx, { use: v })}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          padding: "5px 10px",
                          borderRadius: 999,
                          border: `1px solid ${active ? t.brand : t.line}`,
                          background: active ? t.brand : t.surface2,
                          color: active ? "#fff" : t.ink2,
                          fontSize: 11.5,
                          fontWeight: 700,
                        }}
                      >
                        {l}
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Input
                    t={t}
                    value={a.value}
                    onChange={(v) => updateRow(idx, { value: v })}
                    placeholder="Est. value"
                    type="text"
                  />
                  <Input
                    t={t}
                    value={a.balanceOwed}
                    onChange={(v) => updateRow(idx, { balanceOwed: v })}
                    placeholder="Balance owed"
                    type="text"
                  />
                </div>
                <button
                  onClick={() => removeRow(idx)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    alignSelf: "flex-start",
                    padding: "5px 10px",
                    borderRadius: 8,
                    color: t.danger,
                    fontSize: 11.5,
                    fontWeight: 700,
                  }}
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
      <button
        onClick={addRow}
        style={{
          all: "unset",
          cursor: "pointer",
          padding: "10px 12px",
          borderRadius: 10,
          border: `1px dashed ${t.line}`,
          color: t.ink2,
          fontSize: 12.5,
          fontWeight: 700,
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          alignSelf: "flex-start",
        }}
      >
        <Icon name="plus" size={12} /> Add another property
      </button>
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

// ── Primitives ──────────────────────────────────────────────────────────

function SectionLabel({ t, children }: { t: QCTokens; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 800,
        color: t.ink3,
        letterSpacing: 1.2,
        textTransform: "uppercase",
      }}
    >
      {children}
    </div>
  );
}

function sectionStyle(t: QCTokens): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 14,
    borderRadius: 12,
    border: `1px solid ${t.line}`,
    background: t.surface,
  };
}

function Field({
  t,
  label,
  required,
  children,
}: {
  t: QCTokens;
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1, minWidth: 0 }}>
      <label
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 0.5,
        }}
      >
        {label.toUpperCase()}
        {required ? " *" : ""}
      </label>
      {children}
    </div>
  );
}

function Row({ children }: { t: QCTokens; children: React.ReactNode }) {
  return <div style={{ display: "flex", gap: 10 }}>{children}</div>;
}

function inputBaseStyle(t: QCTokens): React.CSSProperties {
  return {
    boxSizing: "border-box",
    width: "100%",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 9,
    padding: "9px 11px",
    fontSize: 13,
    color: t.ink,
    outline: "none",
  };
}

function Input({
  t,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  t: QCTokens;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "tel";
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      type={type}
      style={inputBaseStyle(t)}
    />
  );
}

function Segmented({
  t,
  options,
  value,
  onChange,
}: {
  t: QCTokens;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${options.length}, 1fr)`,
        gap: 6,
      }}
    >
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "10px 12px",
              borderRadius: 9,
              border: `1px solid ${active ? t.brand : t.line}`,
              background: active ? t.brand : t.surface2,
              color: active ? "#fff" : t.ink,
              fontSize: 12.5,
              fontWeight: 700,
              textAlign: "center",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
