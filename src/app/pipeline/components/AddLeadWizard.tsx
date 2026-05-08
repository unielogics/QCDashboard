"use client";

// AddLeadWizard — the agent's "+ Add Lead" entry point on the pipeline.
//
// 4-step RightPanel slide-in mirroring SmartIntakeModal's shape, but
// targets `POST /clients` (not `/intake`). Output is a lead-stage
// Client row with three optional JSONB overrides applied:
//
//   lead_intake          — property + financial context captured here
//   checklist_overrides  — disable firm items + add lead-specific extras
//   ai_cadence_override  — per-lead nudge frequency preset
//
// Replaces the SmartIntakeModal-as-add-lead regression: that wizard
// posts to /intake and creates a Loan, which is wrong for an early-
// funnel lead. Leads should sit at Client.stage='lead' with no Loan
// attached until promotion.

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RightPanel } from "@/components/design-system/RightPanel";
import { Pill } from "@/components/design-system/primitives";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useBrokerSettings, useCreateClient } from "@/hooks/useApi";

type Side = "buyer" | "seller";
type CadencePreset = "gentle" | "standard" | "aggressive";

const CADENCE_PRESETS: Record<CadencePreset, { first: number; second: number; escalate: number; label: string; sub: string }> = {
  gentle:     { first: 5, second: 12, escalate: 21, label: "Gentle",    sub: "5 / 12 / 21d nudges" },
  standard:   { first: 3, second: 7,  escalate: 14, label: "Standard",  sub: "3 / 7 / 14d (firm default)" },
  aggressive: { first: 2, second: 5,  escalate: 10, label: "Aggressive", sub: "2 / 5 / 10d nudges" },
};

// Sensible buyer-side / seller-side starter docs the wizard pre-loads.
// Same names the agent's settings page uses, so toggling here "carries"
// to the lead's per-Client checklist_overrides.disabled_firm_items.
const STARTER_BUYER_DOCS = [
  "Government ID",
  "Pre-Approval Letter",
  "Buyer Agency Agreement",
  "Purchase Agreement",
  "Earnest Money Receipt",
  "Inspection Report",
  "Proof of Funds",
];
const STARTER_SELLER_DOCS = [
  "Government ID",
  "Listing Agreement",
  "Property Disclosure",
  "HOA Documents",
  "Lead-Based Paint Disclosure",
  "Title / Deed",
  "Agency Disclosure",
];

interface Props {
  onClose: () => void;
}

export function AddLeadWizard({ onClose }: Props) {
  const { t } = useTheme();
  const router = useRouter();
  const create = useCreateClient();
  const brokerQ = useBrokerSettings();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1 — Lead basics
  const [side, setSide] = useState<Side>("buyer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Step 2 — Property context (free-shape, dropped into lead_intake)
  const [propPriceLow, setPropPriceLow] = useState("");
  const [propPriceHigh, setPropPriceHigh] = useState("");
  const [propArea, setPropArea] = useState("");
  const [propTimeline, setPropTimeline] = useState("");
  const [sellerAddress, setSellerAddress] = useState("");
  const [sellerAskPrice, setSellerAskPrice] = useState("");
  const [sellerEstValue, setSellerEstValue] = useState("");

  // Step 3 — Doc collection (toggle starter docs + add custom)
  const starterDocs = useMemo(
    () => (side === "buyer" ? STARTER_BUYER_DOCS : STARTER_SELLER_DOCS),
    [side],
  );
  const [skippedDocs, setSkippedDocs] = useState<Set<string>>(new Set());
  const [customDocs, setCustomDocs] = useState<{ name: string; due_offset_days: number }[]>([]);
  const [newCustom, setNewCustom] = useState("");

  // Step 4 — AI cadence
  const [cadence, setCadence] = useState<CadencePreset>("standard");

  // Reset doc step when side flips so toggles match the new starter list
  const onSideChange = (next: Side) => {
    setSide(next);
    setSkippedDocs(new Set());
    setCustomDocs([]);
  };

  const toggleDoc = (n: string) => {
    setSkippedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  };

  const addCustom = () => {
    const name = newCustom.trim();
    if (!name) return;
    if (customDocs.some((c) => c.name.toLowerCase() === name.toLowerCase())) return;
    setCustomDocs((prev) => [...prev, { name, due_offset_days: 7 }]);
    setNewCustom("");
  };

  const canProceed = (): boolean => {
    if (step === 1) return name.trim().length > 0;
    return true;
  };

  const onSubmit = async () => {
    const preset = CADENCE_PRESETS[cadence];

    // Build lead_intake JSONB
    const lead_intake: Record<string, unknown> = { side };
    if (side === "buyer") {
      if (propPriceLow) lead_intake.target_price_low = Number(propPriceLow);
      if (propPriceHigh) lead_intake.target_price_high = Number(propPriceHigh);
      if (propArea) lead_intake.target_area = propArea;
      if (propTimeline) lead_intake.timeline = propTimeline;
    } else {
      if (sellerAddress) lead_intake.subject_address = sellerAddress;
      if (sellerAskPrice) lead_intake.asking_price = Number(sellerAskPrice);
      if (sellerEstValue) lead_intake.estimated_value = Number(sellerEstValue);
      if (propTimeline) lead_intake.timeline = propTimeline;
    }

    // Build checklist_overrides — same shape as AgentChecklistOverlay
    const checklist_overrides = {
      disabled_firm_items: Array.from(skippedDocs),
      extra_items: customDocs.map((c) => ({
        name: c.name,
        display_name: null,
        type: "external",
        required: false,
        auto_request: true,
        due_offset_days: c.due_offset_days,
        anchor: "loan_created",
        per_unit: false,
        side,
      })),
    };

    // Build ai_cadence_override (skip when 'standard' = inherits firm default)
    const ai_cadence_override =
      cadence === "standard"
        ? null
        : {
            first_reminder_days: preset.first,
            second_reminder_days: preset.second,
            escalate_after_days: preset.escalate,
          };

    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        client_type: side,
        stage: "lead",
        lead_intake,
        checklist_overrides:
          checklist_overrides.disabled_firm_items.length === 0 &&
          checklist_overrides.extra_items.length === 0
            ? null
            : checklist_overrides,
        ai_cadence_override,
      });
      onClose();
      router.push(`/clients/${created.id}`);
    } catch {
      // useCreateClient surfaces errors via the mutation state; keep the
      // panel open so the agent can retry without losing inputs.
    }
  };

  const stepHeader = (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
      {[1, 2, 3, 4].map((n) => (
        <div key={n} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
          <div
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              background: n <= step ? t.brand : t.surface2,
              color: n <= step ? t.inverse : t.ink3,
              fontSize: 11,
              fontWeight: 700,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flex: "0 0 auto",
            }}
          >
            {n}
          </div>
          {n < 4 && (
            <div
              style={{
                flex: 1,
                height: 2,
                background: n < step ? t.brand : t.line,
                borderRadius: 1,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );

  const fieldStyle: React.CSSProperties = {
    padding: "8px 10px",
    borderRadius: 7,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink,
    fontSize: 13,
    outline: "none",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: t.ink3,
  };

  const footer = (
    <>
      {step > 1 && (
        <button
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
          style={{
            padding: "8px 14px",
            borderRadius: 8,
            border: `1px solid ${t.line}`,
            background: t.surface2,
            color: t.ink,
            fontSize: 13,
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Back
        </button>
      )}
      {step < 4 ? (
        <button
          onClick={() => canProceed() && setStep((s) => (s < 4 ? ((s + 1) as 2 | 3 | 4) : s))}
          disabled={!canProceed()}
          style={{
            padding: "8px 16px",
            borderRadius: 8,
            border: "none",
            background: canProceed() ? t.brand : t.chip,
            color: canProceed() ? t.inverse : t.ink4,
            fontSize: 13,
            fontWeight: 700,
            cursor: canProceed() ? "pointer" : "not-allowed",
          }}
        >
          Continue
        </button>
      ) : (
        <button
          onClick={onSubmit}
          disabled={create.isPending}
          style={{
            padding: "8px 18px",
            borderRadius: 8,
            border: "none",
            background: t.brand,
            color: t.inverse,
            fontSize: 13,
            fontWeight: 700,
            cursor: create.isPending ? "wait" : "pointer",
          }}
        >
          {create.isPending ? "Creating…" : "Create lead"}
        </button>
      )}
    </>
  );

  return (
    <RightPanel
      open
      onClose={onClose}
      eyebrow="New Lead"
      title={
        step === 1 ? "Lead basics"
        : step === 2 ? `${side === "buyer" ? "Buyer" : "Seller"} context`
        : step === 3 ? "What docs to collect"
        : "AI follow-up cadence"
      }
      footer={footer}
    >
      {stepHeader}

      {step === 1 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={labelStyle}>Side</span>
            <div style={{ display: "flex", gap: 8 }}>
              {(["buyer", "seller"] as const).map((s) => {
                const active = side === s;
                return (
                  <button
                    key={s}
                    onClick={() => onSideChange(s)}
                    style={{
                      flex: 1,
                      padding: "12px 10px",
                      borderRadius: 9,
                      border: `1px solid ${active ? t.brand : t.line}`,
                      background: active ? t.brandSoft : t.surface2,
                      color: active ? t.brand : t.ink2,
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {s === "buyer" ? "Buyer" : "Seller"}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: t.ink3 }}>
              Drives which docs the AI will collect + the lead's downstream
              treatment when promoted to funding.
            </div>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus style={fieldStyle} placeholder="Sarah Smith" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Email</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} style={fieldStyle} placeholder="sarah@example.com" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Phone</span>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} style={fieldStyle} placeholder="(555) 123-4567" />
          </label>
        </div>
      )}

      {step === 2 && side === "buyer" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
            What is {name || "this buyer"} looking to purchase? All optional —
            captures context for the AI's follow-up messaging.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelStyle}>Target price (low)</span>
              <input type="number" value={propPriceLow} onChange={(e) => setPropPriceLow(e.target.value)} style={fieldStyle} placeholder="350000" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelStyle}>Target price (high)</span>
              <input type="number" value={propPriceHigh} onChange={(e) => setPropPriceHigh(e.target.value)} style={fieldStyle} placeholder="500000" />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Target city / area</span>
            <input value={propArea} onChange={(e) => setPropArea(e.target.value)} style={fieldStyle} placeholder="Tampa, FL" />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Timeline</span>
            <select value={propTimeline} onChange={(e) => setPropTimeline(e.target.value)} style={fieldStyle}>
              <option value="">Select…</option>
              <option value="immediate">Immediate (under 30 days)</option>
              <option value="1_3_months">1-3 months</option>
              <option value="3_6_months">3-6 months</option>
              <option value="6_plus_months">6+ months</option>
            </select>
          </label>
        </div>
      )}

      {step === 2 && side === "seller" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
            What is {name || "this seller"} listing? All optional.
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Property address</span>
            <input value={sellerAddress} onChange={(e) => setSellerAddress(e.target.value)} style={fieldStyle} placeholder="1234 Oak St, Tampa FL" />
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelStyle}>Estimated value</span>
              <input type="number" value={sellerEstValue} onChange={(e) => setSellerEstValue(e.target.value)} style={fieldStyle} placeholder="475000" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <span style={labelStyle}>Asking price</span>
              <input type="number" value={sellerAskPrice} onChange={(e) => setSellerAskPrice(e.target.value)} style={fieldStyle} placeholder="495000" />
            </label>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={labelStyle}>Timeline</span>
            <select value={propTimeline} onChange={(e) => setPropTimeline(e.target.value)} style={fieldStyle}>
              <option value="">Select…</option>
              <option value="ready_now">Ready to list now</option>
              <option value="1_2_months">1-2 months</option>
              <option value="3_plus_months">3+ months</option>
            </select>
          </label>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
            Here's what the AI will collect from {name || "this lead"}. Toggle off
            anything you don't need, or add custom items below.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {starterDocs.map((d) => {
              const skipped = skippedDocs.has(d);
              return (
                <label
                  key={d}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 12px",
                    borderRadius: 9,
                    border: `1px solid ${t.line}`,
                    background: skipped ? t.surface2 : "transparent",
                    opacity: skipped ? 0.6 : 1,
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={!skipped}
                    onChange={() => toggleDoc(d)}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  <span style={{ fontSize: 13, color: t.ink, fontWeight: 600, textDecoration: skipped ? "line-through" : "none" }}>
                    {d}
                  </span>
                </label>
              );
            })}
          </div>
          {customDocs.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={labelStyle}>Custom items for this lead</span>
              {customDocs.map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1px solid ${t.line}`, borderRadius: 9 }}>
                  <Pill bg={t.brandSoft} color={t.brand}>Custom</Pill>
                  <span style={{ flex: 1, fontSize: 13, color: t.ink }}>{c.name}</span>
                  <button
                    onClick={() => setCustomDocs((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Remove"
                    style={{ all: "unset", cursor: "pointer", color: t.ink3, padding: 4 }}
                  >
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={newCustom}
              onChange={(e) => setNewCustom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCustom()}
              placeholder="Add custom item (e.g. HOA Estoppel)"
              style={{ ...fieldStyle, flex: 1 }}
            />
            <button
              onClick={addCustom}
              disabled={!newCustom.trim()}
              style={{
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${t.line}`,
                background: t.surface2,
                color: t.ink,
                fontSize: 12,
                fontWeight: 600,
                cursor: newCustom.trim() ? "pointer" : "not-allowed",
              }}
            >
              Add
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.5 }}>
            How often should the AI follow up with {name || "this lead"}? You can
            change this later from their profile.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {(Object.keys(CADENCE_PRESETS) as CadencePreset[]).map((p) => {
              const preset = CADENCE_PRESETS[p];
              const active = cadence === p;
              return (
                <button
                  key={p}
                  onClick={() => setCadence(p)}
                  style={{
                    all: "unset",
                    cursor: "pointer",
                    padding: "12px 14px",
                    borderRadius: 10,
                    border: `1.5px solid ${active ? t.brand : t.line}`,
                    background: active ? t.brandSoft : t.surface2,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: 999,
                      border: `2px solid ${active ? t.brand : t.ink4}`,
                      background: active ? t.brand : "transparent",
                      flex: "0 0 auto",
                    }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: active ? t.brand : t.ink }}>
                      {preset.label}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                      {preset.sub}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {brokerQ.data?.data?.cadence && (
            <div style={{ fontSize: 11, color: t.ink3, padding: "8px 10px", background: t.surface2, borderRadius: 7 }}>
              Your global cadence in agent settings: {brokerQ.data.data.cadence.first_reminder_days ?? "—"}d / {brokerQ.data.data.cadence.second_reminder_days ?? "—"}d / {brokerQ.data.data.cadence.escalate_after_days ?? "—"}d.
            </div>
          )}
        </div>
      )}

      {create.isError && (
        <div style={{ marginTop: 8, padding: "8px 12px", borderRadius: 7, background: t.dangerBg, color: t.danger, fontSize: 12 }}>
          {create.error instanceof Error ? create.error.message : "Couldn't create lead."}
        </div>
      )}
    </RightPanel>
  );
}
