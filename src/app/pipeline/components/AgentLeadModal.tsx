"use client";

// AgentLeadModal — the agent-side "+ New Lead" wizard.
//
// Sister to SmartIntakeModal but with a fundamentally different mental
// model: agents are real-estate operators capturing a transaction
// lead, not loan originators. They don't pick a loan program, don't
// run the simulator, and don't commit to numbers. They capture intent
// + ownership + permission, and let the AI Secretary nurture from
// there. When ready, they fire "Ready for Prequalification" from
// /clients/[id] (or via their AI) to hand off to the funding team.
//
// Submits to POST /clients with stage='lead'. Never creates a Loan.
// The Loan only ever materializes when the funding team approves the
// PrequalRequest (a separate, controlled step downstream).
//
// 4 steps:
//   1. Lead         — side, client search/create, source, temperature,
//                     financing-support-needed, contact permission
//   2. Property     — address (optional for buyers still searching),
//                     property type, ClientContextCard if known
//   3. Numbers      — buyer: price (or range) + deposit + liquidity
//                     confidence + timeline; seller: listing price + dates
//   4. Handoff      — collapsible doc preview, AI cadence preset,
//                     handoff note, submit options (Save | Save+Invite)

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPetrol } from "@/components/design-system/buttons";
import { RightPanel } from "@/components/design-system/RightPanel";
import { useClient, useCreateClient } from "@/hooks/useApi";
import { ClientSearchBlock } from "@/components/ClientSearchBlock";
import { US_STATES } from "@/lib/usStates";
import type { QCTokens } from "@/components/design-system/tokens";

type Side = "buyer" | "seller";
type CadencePreset = "gentle" | "standard" | "aggressive";

// Mirrors lib/types LeadSource — kept inline since this modal owns
// the labels too.
const LEAD_SOURCES: { value: string; label: string }[] = [
  { value: "manual_entry", label: "Manual entry" },
  { value: "open_house", label: "Open house" },
  { value: "referral", label: "Referral" },
  { value: "listing_inquiry", label: "Listing inquiry" },
  { value: "buyer_consultation", label: "Buyer consultation" },
  { value: "existing_database", label: "Existing database" },
  { value: "other", label: "Other" },
];

const TIMELINE_OPTIONS: { value: string; label: string }[] = [
  { value: "asap", label: "ASAP" },
  { value: "0_30", label: "0–30 days" },
  { value: "30_60", label: "30–60 days" },
  { value: "60_plus", label: "60+ days" },
];

const PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: "single_family", label: "Single-Family" },
  { value: "two_to_four_units", label: "2–4 Units" },
  { value: "five_to_eight_units", label: "5–8 Units" },
  { value: "mixed_use", label: "Mixed-Use" },
  { value: "commercial", label: "Commercial" },
];

interface FormState {
  // Step 1
  side: Side;
  clientPickedId: string | null;
  name: string;
  email: string;
  phone: string;
  leadSource: string;
  leadTemperature: "hot" | "warm" | "nurture";
  financingSupportNeeded: "yes" | "maybe" | "no" | "unknown";
  contactPermission: "send_invite_now" | "save_lead_only" | "agent_will_introduce_first";
  relationshipContext: string;

  // Step 2
  propertyStatus: "selected" | "still_searching" | "multiple"; // buyer-only; sellers always "selected"
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyType: string;
  buyerOwnsProperties: boolean;
  ownedAssets: { address: string; city: string; state: string; use: "primary" | "investment"; value: string; balanceOwed: string }[];

  // Step 3
  priceMode: "exact" | "range"; // buyer-only
  purchasePrice: string;
  priceRangeLow: string;
  priceRangeHigh: string;
  depositAvailable: string;
  liquidityConfidence: "confirmed" | "verbal" | "unknown";
  targetCloseDate: string;
  timeline: string;
  listingPrice: string;
  targetListDate: string;

  // Step 4
  cadencePreset: CadencePreset;
  handoffNote: string;
}

const INITIAL: FormState = {
  side: "buyer",
  clientPickedId: null,
  name: "",
  email: "",
  phone: "",
  leadSource: "manual_entry",
  leadTemperature: "warm",
  financingSupportNeeded: "unknown",
  contactPermission: "save_lead_only",
  relationshipContext: "new_lead",

  propertyStatus: "still_searching",
  propertyAddress: "",
  propertyCity: "",
  propertyState: "",
  propertyType: "single_family",
  buyerOwnsProperties: false,
  ownedAssets: [],

  priceMode: "exact",
  purchasePrice: "",
  priceRangeLow: "",
  priceRangeHigh: "",
  depositAvailable: "",
  liquidityConfidence: "unknown",
  targetCloseDate: "",
  timeline: "60_plus",
  listingPrice: "",
  targetListDate: "",

  cadencePreset: "standard",
  handoffNote: "",
};

const STEPS = [
  { id: "lead", label: "Lead" },
  { id: "property", label: "Property" },
  { id: "numbers", label: "Numbers" },
  { id: "handoff", label: "Handoff" },
] as const;

export function AgentLeadModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTheme();
  const router = useRouter();
  const create = useCreateClient();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitErr, setSubmitErr] = useState<string | null>(null);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Sellers always have a known subject property (the listing); flip
  // propertyStatus to "selected" and lock it when the side is seller.
  useEffect(() => {
    if (form.side === "seller" && form.propertyStatus !== "selected") {
      update("propertyStatus", "selected");
    }
  }, [form.side, form.propertyStatus]);

  const canAdvance = (): boolean => {
    if (step === 0) {
      // Real-estate leads commonly land via phone first — name + ANY
      // contact channel (email or phone) is the bar. If both are present
      // we still validate email shape; phone-only is fine.
      const hasName = form.name.trim().length > 0;
      const emailTrimmed = form.email.trim();
      const phoneTrimmed = form.phone.trim();
      const emailLooksValid = emailTrimmed.length === 0 || emailTrimmed.includes("@");
      const hasContact = emailTrimmed.length > 0 || phoneTrimmed.length > 0;
      return hasName && hasContact && emailLooksValid;
    }
    if (step === 1) {
      // Sellers must have a property; buyers can be still-searching.
      if (form.side === "seller") return form.propertyAddress.trim().length > 0;
      return true;
    }
    return true;
  };

  const submit = async (intent: "save" | "save_and_invite") => {
    setSubmitErr(null);
    try {
      const lead_intake = buildLeadIntake(form);
      // Permission flag overrides invite intent — if agent picked
      // "save_lead_only" we never send a Clerk invite even if the
      // primary submit button was Save+Invite (rare but safe).
      const finalContactPermission =
        intent === "save_and_invite"
          ? "send_invite_now"
          : form.contactPermission;
      const created = await create.mutateAsync({
        name: form.name.trim(),
        // email + phone are both optional individually; Continue gate
        // upstream guarantees at least one is present. Send undefined
        // for empties so the backend stores NULL rather than "".
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        stage: "lead",
        client_type: form.side,
        lead_intake,
        // Lead routing fields persist on the Client row so the pipeline
        // view can filter / scope and the funding team has context at
        // promotion time.
        lead_source: form.leadSource,
        lead_temperature: form.leadTemperature,
        financing_support_needed: form.financingSupportNeeded,
        contact_permission: finalContactPermission,
        relationship_context: form.relationshipContext,
        source_channel: "agent_dashboard",
      });
      setForm(INITIAL);
      setStep(0);
      onClose();
      router.push(`/clients/${created.id}`);
      // Note: when contact_permission=send_invite_now, the backend's
      // /clients endpoint doesn't actually fire the Clerk invite today
      // (only /intake does that path). For v1, the lead simply sits at
      // stage='lead' and the agent fires "Ready for Prequalification"
      // when they're ready to bring the funding team in. Borrower-side
      // Clerk invite happens at /intake submit time downstream.
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Failed to save lead");
    }
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      width="min(680px, max(45vw, 520px))"
      eyebrow={`New Lead · ${form.side === "seller" ? "Listing (Seller)" : "Purchase (Buyer)"}`}
      title={STEPS[step].label}
      ariaLabel="Agent lead capture"
      footer={
        <>
          <button
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            style={qcBtn(t)}
            disabled={create.isPending}
          >
            {step === 0 ? "Cancel" : "← Back"}
          </button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 11, color: submitErr ? t.danger : t.ink3, fontWeight: 600 }}>
            {submitErr ? submitErr : `Step ${step + 1} of ${STEPS.length}`}
          </div>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => canAdvance() && setStep(step + 1)}
              disabled={!canAdvance()}
              style={{
                ...qcBtnPetrol(t),
                opacity: canAdvance() ? 1 : 0.5,
                cursor: canAdvance() ? "pointer" : "not-allowed",
              }}
            >
              Continue →
            </button>
          ) : (
            <div style={{ display: "inline-flex", gap: 6 }}>
              <button
                onClick={() => void submit("save")}
                disabled={create.isPending}
                style={{ ...qcBtn(t), opacity: create.isPending ? 0.6 : 1 }}
              >
                {create.isPending ? "Saving…" : "Save Lead"}
              </button>
              <button
                onClick={() => void submit("save_and_invite")}
                disabled={create.isPending}
                style={{
                  ...qcBtnPetrol(t),
                  opacity: create.isPending ? 0.6 : 1,
                }}
              >
                Save + Send Client Invite
              </button>
            </div>
          )}
        </>
      }
    >
      {/* Stepper */}
      <div style={{ display: "flex", gap: 4, marginBottom: 8 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{
              width: 18, height: 18, borderRadius: 999, flexShrink: 0,
              background: i <= step ? t.brand : t.line,
              color: i <= step ? "#fff" : t.ink3,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              fontSize: 10, fontWeight: 800,
            }}>
              {i < step ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: i <= step ? t.ink : t.ink3, letterSpacing: 0.3 }}>
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? t.brand : t.line }} />
            )}
          </div>
        ))}
      </div>

      {step === 0 && <LeadStep t={t} form={form} update={update} />}
      {step === 1 && <PropertyStep t={t} form={form} update={update} />}
      {step === 2 && <NumbersStep t={t} form={form} update={update} />}
      {step === 3 && <HandoffStep t={t} form={form} update={update} />}
    </RightPanel>
  );
}

// ── Step views ────────────────────────────────────────────────────────────

interface StepProps {
  t: QCTokens;
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}

function LeadStep({ t, form, update }: StepProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label t={t}>Listing or Purchase?</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <SideButton t={t} active={form.side === "buyer"} onClick={() => update("side", "buyer")}>
            Purchase (Buyer)
          </SideButton>
          <SideButton t={t} active={form.side === "seller"} onClick={() => update("side", "seller")}>
            Listing (Seller)
          </SideButton>
        </div>
      </div>

      <ClientSearchBlock
        t={t}
        label="Find an existing client (optional)"
        onPick={(c) => {
          update("clientPickedId", c.id);
          update("name", c.name);
          update("email", c.email ?? "");
          update("phone", c.phone ?? "");
        }}
      />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Name" required>
          <Input t={t} value={form.name} onChange={(v) => update("name", v)} placeholder="Marcus Holloway" disabled={!!form.clientPickedId} />
        </Field>
        {/* Email + phone are individually optional, but the Continue gate
            requires AT LEAST ONE of them — phone-only leads are common
            in real estate. The helper line under the row spells this out. */}
        <Field t={t} label="Email">
          <Input t={t} type="email" value={form.email} onChange={(v) => update("email", v)} placeholder="marcus@holloway.cap" disabled={!!form.clientPickedId} />
        </Field>
        <Field t={t} label="Phone">
          <Input t={t} value={form.phone} onChange={(v) => update("phone", v)} placeholder="(917) 555-0148" disabled={!!form.clientPickedId} />
        </Field>
        <div style={{ gridColumn: "1 / -1", fontSize: 11, color: t.ink3, marginTop: -4 }}>
          Provide at least one contact channel — email or phone.
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Lead source">
          <Select t={t} value={form.leadSource} onChange={(v) => update("leadSource", v)} options={LEAD_SOURCES} />
        </Field>
        <Field t={t} label="Lead temperature">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            {(["hot", "warm", "nurture"] as const).map((opt) => (
              <SideButton key={opt} t={t} active={form.leadTemperature === opt} onClick={() => update("leadTemperature", opt)}>
                {opt[0].toUpperCase() + opt.slice(1)}
              </SideButton>
            ))}
          </div>
        </Field>
        <Field t={t} label="Financing support needed?">
          <Select
            t={t}
            value={form.financingSupportNeeded}
            onChange={(v) => update("financingSupportNeeded", v as FormState["financingSupportNeeded"])}
            options={[
              { value: "yes", label: "Yes" },
              { value: "maybe", label: "Maybe" },
              { value: "no", label: "No / cash buyer" },
              { value: "unknown", label: "Unknown" },
            ]}
          />
        </Field>
        <Field t={t} label="Permission to contact">
          <Select
            t={t}
            value={form.contactPermission}
            onChange={(v) => update("contactPermission", v as FormState["contactPermission"])}
            options={[
              { value: "send_invite_now", label: "Send invite now" },
              { value: "save_lead_only", label: "Save lead only" },
              { value: "agent_will_introduce_first", label: "Agent will introduce first" },
            ]}
          />
        </Field>
        <Field t={t} label="Relationship context" full>
          <Select
            t={t}
            value={form.relationshipContext}
            onChange={(v) => update("relationshipContext", v)}
            options={[
              { value: "new_lead", label: "New lead" },
              { value: "existing_client", label: "Existing client" },
              { value: "past_client", label: "Past client" },
              { value: "referral_from_other", label: "Referral from another client" },
              { value: "other", label: "Other" },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

function PropertyStep({ t, form, update }: StepProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {form.clientPickedId && <ClientContextCard t={t} clientId={form.clientPickedId} />}

      {form.side === "buyer" && (
        <div>
          <Label t={t}>Property status</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <SideButton t={t} active={form.propertyStatus === "selected"} onClick={() => update("propertyStatus", "selected")}>
              Property selected
            </SideButton>
            <SideButton t={t} active={form.propertyStatus === "still_searching"} onClick={() => update("propertyStatus", "still_searching")}>
              Still searching
            </SideButton>
            <SideButton t={t} active={form.propertyStatus === "multiple"} onClick={() => update("propertyStatus", "multiple")}>
              Multiple properties
            </SideButton>
          </div>
        </div>
      )}

      {(form.side === "seller" || form.propertyStatus === "selected") && (
        <div>
          <SectionHeader t={t}>{form.side === "seller" ? "Property they're selling" : "Subject property"}</SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Street address" full required>
              <Input t={t} value={form.propertyAddress} onChange={(v) => update("propertyAddress", v)} placeholder="123 Main St" />
            </Field>
            <Field t={t} label="City">
              <Input t={t} value={form.propertyCity} onChange={(v) => update("propertyCity", v)} placeholder="Brooklyn" />
            </Field>
            <Field t={t} label="State">
              <StateSelect t={t} value={form.propertyState} onChange={(v) => update("propertyState", v)} />
            </Field>
            <Field t={t} label="Property type" full>
              <Select t={t} value={form.propertyType} onChange={(v) => update("propertyType", v)} options={PROPERTY_TYPES} />
            </Field>
          </div>
        </div>
      )}

      {form.side === "buyer" && (
        <div>
          <SectionHeader t={t}>Properties currently owned</SectionHeader>
          <ToggleRow
            t={t}
            label="The buyer currently owns real estate"
            value={form.buyerOwnsProperties}
            onChange={(v) => update("buyerOwnsProperties", v)}
          />
          {form.buyerOwnsProperties && (
            <OwnedAssetsEditor t={t} form={form} update={update} />
          )}
        </div>
      )}
    </div>
  );
}

function NumbersStep({ t, form, update }: StepProps) {
  if (form.side === "seller") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field t={t} label="Listing price" required full>
            <Input t={t} value={form.listingPrice} onChange={(v) => update("listingPrice", v)} placeholder="485,000" prefix="$" />
          </Field>
          <Field t={t} label="Target list date">
            <Input t={t} type="date" value={form.targetListDate} onChange={(v) => update("targetListDate", v)} />
          </Field>
          <Field t={t} label="Target close date">
            <Input t={t} type="date" value={form.targetCloseDate} onChange={(v) => update("targetCloseDate", v)} />
          </Field>
        </div>
        <Note t={t}>
          No loan numbers — this is a listing capture. The funding team gets
          looped in only when the seller asks for refinance support, in which
          case you fire &quot;Ready for Prequalification&quot; from the client
          page.
        </Note>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Label t={t}>Target purchase price</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
          <SideButton t={t} active={form.priceMode === "exact"} onClick={() => update("priceMode", "exact")}>
            Exact price
          </SideButton>
          <SideButton t={t} active={form.priceMode === "range"} onClick={() => update("priceMode", "range")}>
            Price range
          </SideButton>
        </div>
        {form.priceMode === "exact" ? (
          <Input t={t} value={form.purchasePrice} onChange={(v) => update("purchasePrice", v)} placeholder="485,000" prefix="$" />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Input t={t} value={form.priceRangeLow} onChange={(v) => update("priceRangeLow", v)} placeholder="Min 400,000" prefix="$" />
            <Input t={t} value={form.priceRangeHigh} onChange={(v) => update("priceRangeHigh", v)} placeholder="Max 550,000" prefix="$" />
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Deposit available">
          <Input t={t} value={form.depositAvailable} onChange={(v) => update("depositAvailable", v)} placeholder="125,000" prefix="$" />
        </Field>
        <Field t={t} label="Liquidity confidence">
          <Select
            t={t}
            value={form.liquidityConfidence}
            onChange={(v) => update("liquidityConfidence", v as FormState["liquidityConfidence"])}
            options={[
              { value: "confirmed", label: "Confirmed (saw bank statements)" },
              { value: "verbal", label: "Verbal (told to me)" },
              { value: "unknown", label: "Unknown" },
            ]}
          />
        </Field>
        <Field t={t} label="Timeline">
          <Select t={t} value={form.timeline} onChange={(v) => update("timeline", v)} options={TIMELINE_OPTIONS} />
        </Field>
        <Field t={t} label="Target close date (if known)">
          <Input t={t} type="date" value={form.targetCloseDate} onChange={(v) => update("targetCloseDate", v)} />
        </Field>
      </div>

      <Note t={t}>
        No loan-program math here — that&apos;s the funding team&apos;s job.
        Capture intent + capacity; we&apos;ll size the loan when you fire
        &quot;Ready for Prequalification&quot; from the client page.
      </Note>
    </div>
  );
}

function HandoffStep({ t, form, update }: StepProps) {
  const [docPreviewOpen, setDocPreviewOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Field t={t} label="AI cadence preset">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          {(["gentle", "standard", "aggressive"] as const).map((opt) => (
            <SideButton key={opt} t={t} active={form.cadencePreset === opt} onClick={() => update("cadencePreset", opt)}>
              {opt[0].toUpperCase() + opt.slice(1)}
            </SideButton>
          ))}
        </div>
      </Field>

      <Field t={t} label="Handoff note (anything the funding team should know?)">
        <textarea
          value={form.handoffNote}
          onChange={(e) => update("handoffNote", e.target.value)}
          placeholder="They prefer SMS over email, husband is the decision-maker, hoping to close before school starts in September…"
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 9,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            color: t.ink,
            fontSize: 13,
            outline: "none",
            fontFamily: "inherit",
            minHeight: 80,
            resize: "vertical",
          }}
        />
      </Field>

      <div>
        <button
          onClick={() => setDocPreviewOpen((v) => !v)}
          style={{
            all: "unset", cursor: "pointer",
            fontSize: 11.5, fontWeight: 700, color: t.ink3,
            display: "inline-flex", alignItems: "center", gap: 4,
          }}
        >
          <Icon name={docPreviewOpen ? "chevD" : "chevR"} size={11} />
          Documents we may request later
        </button>
        {docPreviewOpen && (
          <div style={{
            marginTop: 8,
            padding: "10px 12px",
            borderRadius: 9,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            fontSize: 12, color: t.ink2, lineHeight: 1.6,
          }}>
            {form.side === "buyer"
              ? "Government ID · Pre-Approval Letter · Buyer Agency Agreement · Purchase Agreement · Earnest Money Receipt · Inspection Report · Proof of Funds"
              : "Government ID · Listing Agreement · Property Disclosure · HOA Documents · Lead-Based Paint Disclosure · Title / Deed · Agency Disclosure"}
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 6, fontStyle: "italic" }}>
              The AI will help you collect these as the lead progresses. Edit
              defaults from your Agent Settings → Doc Checklist.
            </div>
          </div>
        )}
      </div>

      <Note t={t}>
        After save, fire &quot;Ready for Prequalification&quot; from the client
        page — or just tell your AI Secretary — when you&apos;re ready to hand
        off to the funding team.
      </Note>
    </div>
  );
}

// ── Helpers + primitives ──────────────────────────────────────────────────

function buildLeadIntake(form: FormState): Record<string, unknown> {
  const property = (() => {
    if (form.side === "seller" || form.propertyStatus === "selected") {
      return {
        status: "selected",
        address: form.propertyAddress.trim(),
        city: form.propertyCity.trim(),
        state: form.propertyState.trim().toUpperCase(),
        property_type: form.propertyType,
      };
    }
    return { status: form.propertyStatus };
  })();

  const numbers = form.side === "seller"
    ? {
        listing_price: parseDollars(form.listingPrice),
        target_list_date: form.targetListDate || null,
        target_close_date: form.targetCloseDate || null,
      }
    : {
        price_mode: form.priceMode,
        purchase_price: form.priceMode === "exact" ? parseDollars(form.purchasePrice) : null,
        price_range_low: form.priceMode === "range" ? parseDollars(form.priceRangeLow) : null,
        price_range_high: form.priceMode === "range" ? parseDollars(form.priceRangeHigh) : null,
        deposit_available: parseDollars(form.depositAvailable),
        liquidity_confidence: form.liquidityConfidence,
        timeline: form.timeline,
        target_close_date: form.targetCloseDate || null,
      };

  const owned_properties = form.side === "buyer" && form.buyerOwnsProperties
    ? form.ownedAssets
        .filter((a) => a.address.trim().length > 0)
        .map((a) => ({
          address: a.address.trim(),
          city: a.city.trim(),
          state: a.state.trim().toUpperCase(),
          use: a.use,
          value: parseDollars(a.value),
          balance_owed: parseDollars(a.balanceOwed),
        }))
    : [];

  return {
    property,
    numbers,
    owned_properties,
    handoff_note: form.handoffNote.trim() || null,
    cadence_preset: form.cadencePreset,
  };
}

function parseDollars(s: string): number | null {
  const cleaned = s.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function ClientContextCard({ t, clientId }: { t: QCTokens; clientId: string }) {
  const { data: client } = useClient(clientId);
  if (!client) return null;
  const hasContext = !!client.experience || !!client.properties || !!client.fico || (client.tier && client.tier !== "standard");
  if (!hasContext) return null;
  return (
    <div style={{
      padding: "10px 12px", borderRadius: 9,
      background: t.surface2, border: `1px solid ${t.line}`,
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3 }}>
        Borrower context
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{client.name}</span>
        {client.tier && client.tier !== "standard" && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.brandSoft, color: t.brand }}>
            {client.tier}
          </span>
        )}
        {client.fico != null && (
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: t.surface, color: t.ink2, border: `1px solid ${t.line}` }}>
            FICO {client.fico}
          </span>
        )}
      </div>
      {client.experience && (
        <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
          <strong style={{ color: t.ink3, fontWeight: 700, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>Experience</strong>
          <div style={{ marginTop: 2 }}>{client.experience}</div>
        </div>
      )}
      {client.properties && (
        <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
          <strong style={{ color: t.ink3, fontWeight: 700, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>Properties</strong>
          <div style={{ marginTop: 2 }}>{client.properties}</div>
        </div>
      )}
    </div>
  );
}

function OwnedAssetsEditor({ t, form, update }: StepProps) {
  const add = () =>
    update("ownedAssets", [
      ...form.ownedAssets,
      { address: "", city: "", state: "", use: "investment", value: "", balanceOwed: "" },
    ]);
  const patch = (idx: number, p: Partial<FormState["ownedAssets"][number]>) =>
    update("ownedAssets", form.ownedAssets.map((a, i) => (i === idx ? { ...a, ...p } : a)));
  const remove = (idx: number) =>
    update("ownedAssets", form.ownedAssets.filter((_, i) => i !== idx));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
      {form.ownedAssets.map((a, idx) => (
        <div key={idx} style={{
          padding: 12, borderRadius: 10, background: t.surface2,
          border: `1px solid ${t.line}`,
          display: "grid", gridTemplateColumns: "1fr auto", gap: 10,
        }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field t={t} label="Street address" full>
              <Input t={t} value={a.address} onChange={(v) => patch(idx, { address: v })} placeholder="55 Park Ave" />
            </Field>
            <Field t={t} label="City">
              <Input t={t} value={a.city} onChange={(v) => patch(idx, { city: v })} placeholder="Brooklyn" />
            </Field>
            <Field t={t} label="State">
              <StateSelect t={t} value={a.state} onChange={(v) => patch(idx, { state: v })} />
            </Field>
            <Field t={t} label="Use">
              <Select
                t={t}
                value={a.use}
                onChange={(v) => patch(idx, { use: v as "primary" | "investment" })}
                options={[
                  { value: "primary", label: "Primary residence" },
                  { value: "investment", label: "Investment" },
                ]}
              />
            </Field>
            <Field t={t} label="Estimated value">
              <Input t={t} value={a.value} onChange={(v) => patch(idx, { value: v })} placeholder="525,000" prefix="$" />
            </Field>
            <Field t={t} label="Balance owed">
              <Input t={t} value={a.balanceOwed} onChange={(v) => patch(idx, { balanceOwed: v })} placeholder="280,000" prefix="$" />
            </Field>
          </div>
          <button
            onClick={() => remove(idx)}
            style={{
              all: "unset", cursor: "pointer", color: t.ink3,
              width: 28, height: 28, borderRadius: 8,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, alignSelf: "start",
            }}
            aria-label="Remove property"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        style={{ ...qcBtn(t), alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6 }}
      >
        <Icon name="plus" size={12} /> Add property
      </button>
    </div>
  );
}

// ── Tiny primitives (kept inline so this modal stands alone) ──────────────

function Field({ t, label, required, children, full }: { t: QCTokens; label: string; required?: boolean; children: ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3, marginBottom: 5 }}>
        {label}{required ? <span style={{ color: t.danger, marginLeft: 3 }}>*</span> : null}
      </div>
      {children}
    </div>
  );
}

function Label({ t, children }: { t: QCTokens; children: ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3, marginBottom: 6 }}>
      {children}
    </div>
  );
}

function SectionHeader({ t, children }: { t: QCTokens; children: ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function SideButton({ t, active, children, onClick }: { t: QCTokens; active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset", cursor: "pointer",
        padding: "9px 11px", borderRadius: 9,
        textAlign: "center",
        fontSize: 12.5, fontWeight: 700,
        background: active ? t.brand : t.surface2,
        color: active ? t.inverse : t.ink2,
        border: `1px solid ${active ? t.brand : t.line}`,
      }}
    >
      {children}
    </button>
  );
}

function Note({ t, children }: { t: QCTokens; children: ReactNode }) {
  return (
    <div style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.5, padding: "8px 0" }}>
      {children}
    </div>
  );
}

function Input({
  t, value, onChange, placeholder, type = "text", prefix, disabled,
}: {
  t: QCTokens; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; prefix?: string; disabled?: boolean;
}) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", width: "100%",
      background: t.surface2, border: `1px solid ${t.line}`, borderRadius: 9,
      opacity: disabled ? 0.6 : 1,
    }}>
      {prefix && <span style={{ padding: "0 0 0 12px", color: t.ink3, fontSize: 13, fontWeight: 700 }}>{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1, minWidth: 0,
          padding: "10px 12px", background: "transparent",
          border: "none", color: t.ink, fontSize: 13,
          outline: "none", fontFamily: "inherit",
        }}
      />
    </div>
  );
}

function Select({
  t, value, onChange, options,
}: {
  t: QCTokens; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 9,
        background: t.surface2, border: `1px solid ${t.line}`,
        color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function StateSelect({ t, value, onChange }: { t: QCTokens; value: string; onChange: (code: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 9,
        background: t.surface2, border: `1px solid ${t.line}`,
        color: value ? t.ink : t.ink3, fontSize: 13, fontFamily: "inherit", outline: "none",
      }}
    >
      <option value="">Select state…</option>
      {US_STATES.map((s) => (
        <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
      ))}
    </select>
  );
}

function ToggleRow({ t, label, value, onChange }: { t: QCTokens; label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 12px", borderRadius: 9,
      border: `1px solid ${t.line}`, cursor: "pointer",
    }}>
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        style={{ width: 16, height: 16, cursor: "pointer" }}
      />
      <span style={{ fontSize: 12.5, color: t.ink2, fontWeight: 600 }}>{label}</span>
    </label>
  );
}
