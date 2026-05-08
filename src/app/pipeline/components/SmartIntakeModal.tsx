"use client";

// Smart Intake — side-aware new-deal flow.
//
// Substantial rewrite to match the Agent's mental model after live feedback:
//   1. Step 1 starts with the Buyer/Seller toggle so the rest of the flow can
//      branch. Borrower + entity info follows; this step creates the Client.
//   2. Step 2 is the Asset step — REQUIRED single subject property when side
//      is "seller" (the property they're listing); for "buyer" the subject is
//      optional ("they may not have a target yet"), with an additional list
//      of owned properties (primary or investment) so the AI has financial
//      context for Step 3 packaging.
//   3. Step 3 is keyboard-first (sliders → number inputs). Conditional on
//      side: buyer enters cash available + max purchase; seller enters sales
//      price. Loan type + LTV stay common, plus DSCR/ARV when applicable.
//   4. Step 4 is the AI / Communication step — language preference, channel,
//      target close date, backstory, and free-text AI speaking instructions.
//      The earlier financial-tactical rules (floor rate, escalation delta,
//      etc.) are kept as defaults under the hood for backend compatibility
//      but no longer surfaced — those are firm-wide / Super Admin concerns
//      and don't belong on Agent intake per the architecture rules.
//
// Container is the shared <RightPanel> 1/3-width slide-in (was a centered
// modal). Same UX standard the rest of the app is migrating to.
//
// Backend payload (qcbackend POST /api/v1/intake) is preserved on the
// existing borrower/asset/numbers/ai_rules shape, with the new fields
// appended on the same payload. Backend will ignore unknowns until support
// lands.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPetrol } from "@/components/design-system/buttons";
import { RightPanel } from "@/components/design-system/RightPanel";
import { useClients, useCreateIntake, useCurrentUser } from "@/hooks/useApi";
import { parseUSD, parseIntStrict } from "@/lib/formCoerce";
import {
  EntityType,
  ExperienceTier,
  LoanType,
  PropertyType,
  Role,
} from "@/lib/enums.generated";
import { isLoanTypeEnabled } from "@/lib/products";
import type { SmartIntakePayload, OwnedAsset } from "@/lib/types";
import type { QCTokens } from "@/components/design-system/tokens";
import { US_STATES } from "@/lib/usStates";

type DealSide = "buyer" | "seller";

// Minimal client shape the modal accepts via prefillClient. Sourced
// from the existing Client type — kept narrow so callers (clients
// list / detail / pipeline) don't have to pass full records.
export interface IntakePrefillClient {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_type?: "buyer" | "seller" | null;
}
type Channel = "sms+email" | "sms" | "email" | "push";

interface AssetEntry {
  // Street + city are stored separately so the property record
  // doesn't depend on free-form parsing. `state` is a USPS 2-letter
  // code matching @/lib/usStates.
  address: string;
  city: string;
  state: string;
  ownership: "primary" | "investment";
  marketValue: string;
  balanceOwed: string;
}

interface FormState {
  // ── Step 1: Side + Borrower & Entity ─────────────────────────────────
  dealSide: DealSide;
  borrowerName: string;
  borrowerEmail: string;
  borrowerPhone: string;
  entityType: typeof EntityType[keyof typeof EntityType];
  entityName: string;
  experience: typeof ExperienceTier[keyof typeof ExperienceTier];

  // ── Step 2: Subject property + owned-asset portfolio ─────────────────
  // Seller: subject is required (the property they're selling).
  // Buyer:  subject is optional (they may not have a target yet); the
  //         buyerOwnsProperties + ownedAssets list captures their portfolio.
  // Street / city / state are split so the backend's loans.state
  // column (alembic 0028) can persist the USPS code separately from
  // the city for queryable / sortable filters.
  subjectAddress: string;
  subjectCity: string;
  subjectState: string;
  subjectPropertyType: typeof PropertyType[keyof typeof PropertyType];
  subjectMarketValue: string;
  subjectSqft: string;
  subjectTaxes: string;
  subjectInsurance: string;
  buyerOwnsProperties: boolean;
  ownedAssets: AssetEntry[];

  // ── Step 3: Numbers (keyboard-first inputs) ──────────────────────────
  loanType: typeof LoanType[keyof typeof LoanType];
  // Buyer-side
  cashAvailable: string;
  maxPurchasePrice: string;
  // Seller-side
  salesPrice: string;
  // Common
  targetLTV: string;
  baseRate: string;
  expectedRent: string;
  arv: string;

  // ── Step 4: AI / Communication ───────────────────────────────────────
  language: string;
  preferredChannel: Channel;
  targetCloseDate: string;
  backstory: string;
  aiInstructions: string;
}

const INITIAL: FormState = {
  dealSide: "buyer",
  borrowerName: "",
  borrowerEmail: "",
  borrowerPhone: "",
  entityType: EntityType.LLC,
  entityName: "",
  experience: ExperienceTier.LIGHT,
  subjectAddress: "",
  subjectCity: "",
  subjectState: "",
  subjectPropertyType: PropertyType.SFR,
  subjectMarketValue: "",
  subjectSqft: "",
  subjectTaxes: "",
  subjectInsurance: "",
  buyerOwnsProperties: false,
  ownedAssets: [],
  loanType: LoanType.DSCR,
  cashAvailable: "",
  maxPurchasePrice: "",
  salesPrice: "",
  targetLTV: "75",
  baseRate: "7.5",
  expectedRent: "",
  arv: "",
  language: "en",
  preferredChannel: "sms+email",
  targetCloseDate: "",
  backstory: "",
  aiInstructions: "",
};

const STEPS = [
  { id: "borrower", label: "Borrower" },
  { id: "asset", label: "Asset" },
  { id: "numbers", label: "Numbers" },
  { id: "ai", label: "AI & Messaging" },
] as const;

export function SmartIntakeModal({
  open,
  onClose,
  prefillClient,
}: {
  open: boolean;
  onClose: () => void;
  // Optional pre-selected client. When set, the modal skips its
  // search step and locks the borrower fields. The agent / operator
  // can still tap "Choose different client" to clear it.
  prefillClient?: IntakePrefillClient | null;
}) {
  const { t } = useTheme();
  const router = useRouter();
  const createIntake = useCreateIntake();
  const { data: user } = useCurrentUser();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(INITIAL);
  const [submitErr, setSubmitErr] = useState<string | null>(null);
  // Tracks whether the borrower fields were filled from a picked
  // existing client. Drives the "locked" UI + the search affordance.
  const [pickedClient, setPickedClient] = useState<IntakePrefillClient | null>(
    prefillClient ?? null,
  );

  const isBroker = user?.role === Role.BROKER;
  // Real-estate side toggle is only meaningful to realtors. Super-
  // admins / underwriters originate loans directly — for them the
  // wizard runs in pure prequalification mode.
  const showSideToggle = isBroker;

  // Sync prefill into form on open. Clears when prefill removed.
  useEffect(() => {
    if (!open) return;
    if (prefillClient) {
      setForm((f) => ({
        ...f,
        borrowerName: prefillClient.name,
        borrowerEmail: prefillClient.email ?? "",
        borrowerPhone: prefillClient.phone ?? "",
        // If the client carries a side preference (buyer/seller),
        // honor it so the agent doesn't have to flip it again.
        dealSide:
          prefillClient.client_type === "seller"
            ? "seller"
            : prefillClient.client_type === "buyer"
              ? "buyer"
              : f.dealSide,
      }));
      setPickedClient(prefillClient);
    }
  }, [open, prefillClient]);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isSeller = form.dealSide === "seller";
  const isBuyer = form.dealSide === "buyer";

  // When the user clears the picked client, wipe the borrower fields
  // back to blanks so the form makes sense.
  const clearPickedClient = () => {
    setPickedClient(null);
    setForm((f) => ({
      ...f,
      borrowerName: "",
      borrowerEmail: "",
      borrowerPhone: "",
    }));
  };

  // Picking from the search list locks the borrower trio.
  const onPickClient = (c: IntakePrefillClient) => {
    setPickedClient(c);
    setForm((f) => ({
      ...f,
      borrowerName: c.name,
      borrowerEmail: c.email ?? "",
      borrowerPhone: c.phone ?? "",
      dealSide:
        c.client_type === "seller"
          ? "seller"
          : c.client_type === "buyer"
            ? "buyer"
            : f.dealSide,
    }));
  };

  const canAdvance = () => {
    if (step === 0) {
      return form.borrowerName.trim().length > 0 && form.borrowerEmail.includes("@");
    }
    if (step === 1) {
      // Sellers need a subject property + market value.
      // Buyers can move on without a subject (they may not have a target yet).
      if (isSeller) {
        return form.subjectAddress.trim().length > 0 && parseUSD(form.subjectMarketValue) > 0;
      }
      return true;
    }
    if (step === 2) {
      // Buyer needs cash + max purchase; Seller needs sales price.
      if (isBuyer) return parseUSD(form.cashAvailable) > 0 && parseUSD(form.maxPurchasePrice) > 0;
      return parseUSD(form.salesPrice) > 0;
    }
    return true;
  };

  const handleActivate = async () => {
    setSubmitErr(null);
    try {
      const payload = mapToPayload(form);
      const result = await createIntake.mutateAsync(payload);
      setForm(INITIAL);
      setStep(0);
      onClose();
      router.push(`/loans/${result.loan_id}/control-room?just-created=1`);
    } catch (e: unknown) {
      setSubmitErr(e instanceof Error ? e.message : "Failed to create deal");
    }
  };

  const handleAddAsset = () => {
    update("ownedAssets", [
      ...form.ownedAssets,
      { address: "", city: "", state: "", ownership: "investment", marketValue: "", balanceOwed: "" },
    ]);
  };

  const handleRemoveAsset = (idx: number) => {
    update(
      "ownedAssets",
      form.ownedAssets.filter((_, i) => i !== idx),
    );
  };

  const handleUpdateAsset = (idx: number, patch: Partial<AssetEntry>) => {
    update(
      "ownedAssets",
      form.ownedAssets.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    );
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      width="min(680px, max(45vw, 520px))"
      eyebrow={
        showSideToggle
          ? `New Deal · Smart Intake · ${isSeller ? "Seller" : "Buyer"}`
          : "New Deal · Smart Intake"
      }
      title={STEPS[step].label}
      ariaLabel="Smart Intake — new deal"
      footer={
        <>
          <button
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            style={qcBtn(t)}
            disabled={createIntake.isPending}
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
            <button
              onClick={handleActivate}
              disabled={createIntake.isPending}
              style={{
                ...qcBtnPetrol(t),
                opacity: createIntake.isPending ? 0.6 : 1,
                cursor: createIntake.isPending ? "wait" : "pointer",
              }}
            >
              <Icon name="bolt" size={13} />
              {createIntake.isPending ? "Activating…" : "Activate AI"}
            </button>
          )}
        </>
      }
    >
      {/* Stepper */}
      <div style={{ display: "flex", gap: 4, marginBottom: 4 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                flexShrink: 0,
                background: i <= step ? t.petrol : t.line,
                color: i <= step ? "#fff" : t.ink3,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 800,
              }}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: i <= step ? t.ink : t.ink3, letterSpacing: 0.3 }}>
              {s.label}
            </div>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? t.petrol : t.line }} />
            )}
          </div>
        ))}
      </div>

      {/* Body — switch on step */}
      {step === 0 && (
        <BorrowerStepView
          t={t}
          form={form}
          update={update}
          showSideToggle={showSideToggle}
          pickedClient={pickedClient}
          onPickClient={onPickClient}
          clearPickedClient={clearPickedClient}
        />
      )}
      {step === 1 && (
        <AssetStepView
          t={t}
          form={form}
          update={update}
          onAddAsset={handleAddAsset}
          onRemoveAsset={handleRemoveAsset}
          onUpdateAsset={handleUpdateAsset}
        />
      )}
      {step === 2 && <NumbersStepView t={t} form={form} update={update} />}
      {step === 3 && <CommunicationStepView t={t} form={form} update={update} />}
    </RightPanel>
  );
}

// ── Map flat form → backend nested payload (backward-compatible) ──────────

function mapToPayload(form: FormState): SmartIntakePayload {
  const isSeller = form.dealSide === "seller";

  // Subject property: for sellers it's the listing; for buyers it's the
  // (optional) target they may have already identified. If buyer with no
  // subject, send placeholder data — the loan row exists as a working file
  // until the borrower locks a property. Street + city + state are
  // split — the backend stores state in its own column (alembic 0028).
  const subjectAddressRaw = form.subjectAddress.trim();
  const address = subjectAddressRaw || (isSeller ? "" : "Property TBD");
  const city = form.subjectCity.trim();
  const state = form.subjectState.trim().toUpperCase() || null;

  const subjectValue = parseUSD(form.subjectMarketValue);
  const cashAvailable = parseUSD(form.cashAvailable);
  const maxPurchase = parseUSD(form.maxPurchasePrice);
  const salesPrice = parseUSD(form.salesPrice);

  // Loan amount: seller side uses sales price * (1 - target LTV-equivalent)
  // doesn't make sense; instead, use the Subject value the listing carries
  // OR the explicit numbers field. For buyers, use max purchase as the basis.
  const ltvDecimal = (parseFloat(form.targetLTV) || 0) / 100;
  const baseValue = isSeller
    ? subjectValue || salesPrice
    : subjectValue || maxPurchase;
  const amount = Math.round(baseValue * ltvDecimal);
  const baseRate = parseFloat(form.baseRate) || 0;

  const ownedAssets: OwnedAsset[] | null =
    isBuyerWithAssets(form)
      ? form.ownedAssets
          .filter((a) => a.address.trim().length > 0)
          .map<OwnedAsset>((a) => ({
            address: a.address.trim(),
            city: a.city.trim() || null,
            state: a.state.trim().toUpperCase() || null,
            ownership: a.ownership,
            market_value: parseUSD(a.marketValue) || null,
            balance_owed: parseUSD(a.balanceOwed) || null,
          }))
      : null;

  return {
    borrower: {
      name: form.borrowerName.trim(),
      email: form.borrowerEmail.trim(),
      phone: form.borrowerPhone.trim(),
      entity_type: form.entityType,
      entity_name: form.entityName.trim() || null,
      experience: form.experience,
    },
    asset: {
      address,
      city: city || null,
      state,
      property_type: form.subjectPropertyType,
      sqft: parseIntStrict(form.subjectSqft) || null,
      annual_taxes: parseUSD(form.subjectTaxes),
      annual_insurance: parseUSD(form.subjectInsurance),
      as_is_value: subjectValue || null,
    },
    numbers: {
      type: form.loanType,
      amount,
      ltv: ltvDecimal,
      ltc: null,
      arv: parseUSD(form.arv) || null,
      monthly_rent: parseUSD(form.expectedRent) || null,
      base_rate: baseRate,
      cash_available: isSeller ? null : cashAvailable || null,
      max_purchase_price: isSeller ? null : maxPurchase || null,
      sales_price: isSeller ? salesPrice || null : null,
    },
    ai_rules: {
      // Defaulted financial-tactical rules — kept for backend compat.
      floor_rate: 6.5,
      max_buy_down_points: 1.5,
      require_soft_pull: true,
      auto_send_terms: false,
      doc_auto_verify: true,
      escalation_delta_bps: 25,
      // New communication-focused fields
      notify_channel: form.preferredChannel,
      intro_message: null,
      language: form.language || null,
      backstory: form.backstory.trim() || null,
      target_close_date: form.targetCloseDate || null,
      ai_instructions: form.aiInstructions.trim() || null,
    },
    deal_side: form.dealSide,
    owned_assets: ownedAssets,
  };
}

function isBuyerWithAssets(form: FormState): boolean {
  return form.dealSide === "buyer" && form.buyerOwnsProperties && form.ownedAssets.length > 0;
}

// ── Step views ────────────────────────────────────────────────────────────

// Searches the calling user's accessible clients (broker → their book;
// super-admin → firm-wide via the existing useClients scope rules) and
// surfaces hits as picker rows. The user can ALWAYS skip this and just
// type a new borrower in the form below — falling through is the
// "client doesn't exist yet" path.
function ClientSearchBlock({
  t,
  onPick,
}: {
  t: QCTokens;
  onPick: (c: IntakePrefillClient) => void;
}) {
  const { data: clients = [] } = useClients();
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clients, query]);

  return (
    <div>
      <Label t={t}>Find an existing client</Label>
      <div style={{ position: "relative" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 12px",
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 9,
          }}
        >
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
            placeholder="Search by name or email…"
            style={{
              flex: 1, minWidth: 0,
              padding: "10px 0",
              background: "transparent",
              border: "none",
              color: t.ink,
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        {showResults && matches.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%", left: 0, right: 0,
              marginTop: 4,
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 9,
              boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
              zIndex: 10,
              maxHeight: 240,
              overflow: "auto",
            }}
          >
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onPick({
                    id: c.id,
                    name: c.name,
                    email: c.email ?? null,
                    phone: c.phone ?? null,
                    client_type: c.client_type ?? null,
                  });
                  setQuery("");
                  setShowResults(false);
                }}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 12px",
                  borderBottom: `1px solid ${t.line}`,
                  width: "calc(100% - 24px)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.email ?? "—"}
                  </div>
                </div>
                <Icon name="arrowR" size={11} />
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
        Don&apos;t see them? Skip the search and fill the borrower fields below — we&apos;ll create a new client.
      </div>
    </div>
  );
}

interface StepProps {
  t: QCTokens;
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}

interface BorrowerStepProps extends StepProps {
  showSideToggle: boolean;
  pickedClient: IntakePrefillClient | null;
  onPickClient: (c: IntakePrefillClient) => void;
  clearPickedClient: () => void;
}

function BorrowerStepView({
  t,
  form,
  update,
  showSideToggle,
  pickedClient,
  onPickClient,
  clearPickedClient,
}: BorrowerStepProps) {
  // Borrower fields lock when an existing client is selected so we
  // don't accidentally fork the record. Tap "Choose different
  // client" to clear and go back to free-form entry.
  const locked = !!pickedClient;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Side toggle — only for realtors. Super-admin / underwriter
          run the wizard in pure prequalification mode and skip the
          listing-vs-purchase framing. */}
      {showSideToggle && (
        <div>
          <Label t={t}>Listing or Purchase?</Label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <SideButton t={t} active={form.dealSide === "buyer"} onClick={() => update("dealSide", "buyer")}>
              Purchase (Buyer)
            </SideButton>
            <SideButton t={t} active={form.dealSide === "seller"} onClick={() => update("dealSide", "seller")}>
              Listing (Seller)
            </SideButton>
          </div>
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
            {form.dealSide === "buyer"
              ? "We'll capture purchase capacity and any properties they currently own."
              : "We'll capture the listing — the property they're selling, plus the sale price."}
          </div>
        </div>
      )}

      {/* Client lookup — pick an existing client OR fall through to
          create a new one. Hidden when prefillClient locked us in. */}
      {!locked && (
        <ClientSearchBlock t={t} onPick={onPickClient} />
      )}

      {locked && pickedClient && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 9,
            background: t.brandSoft,
            border: `1px solid ${t.brand}40`,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="check" size={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: t.brand }}>
              Existing client: {pickedClient.name}
            </div>
            <div style={{ fontSize: 11, color: t.ink3 }}>
              {pickedClient.email ?? "—"}
              {pickedClient.phone ? ` · ${pickedClient.phone}` : ""}
            </div>
          </div>
          <button
            onClick={clearPickedClient}
            style={{
              all: "unset", cursor: "pointer",
              fontSize: 11, fontWeight: 700, color: t.brand,
              padding: "4px 8px",
            }}
          >
            Choose different client
          </button>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Name" required>
          <Input t={t} value={form.borrowerName} onChange={(v) => update("borrowerName", v)} placeholder="Marcus Holloway" disabled={locked} />
        </Field>
        <Field t={t} label="Email" required>
          <Input t={t} type="email" value={form.borrowerEmail} onChange={(v) => update("borrowerEmail", v)} placeholder="marcus@holloway.cap" disabled={locked} />
        </Field>
        <Field t={t} label="Phone">
          <Input t={t} value={form.borrowerPhone} onChange={(v) => update("borrowerPhone", v)} placeholder="(917) 555-0148" disabled={locked} />
        </Field>
        <Field t={t} label="Entity type">
          <Select
            t={t}
            value={form.entityType}
            onChange={(v) => update("entityType", v as FormState["entityType"])}
            options={[
              { value: EntityType.INDIVIDUAL, label: "Individual" },
              { value: EntityType.LLC, label: "LLC" },
              { value: EntityType.CORPORATION, label: "Corporation" },
              { value: EntityType.TRUST, label: "Trust" },
            ]}
          />
        </Field>
        <Field t={t} label="Entity name">
          <Input t={t} value={form.entityName} onChange={(v) => update("entityName", v)} placeholder="Holloway Capital LLC" />
        </Field>
        <Field t={t} label="Experience level">
          <Select
            t={t}
            value={form.experience}
            onChange={(v) => update("experience", v as FormState["experience"])}
            options={[
              { value: ExperienceTier.NONE, label: "First-time" },
              { value: ExperienceTier.LIGHT, label: "1–2 deals" },
              { value: ExperienceTier.MID, label: "3–5 deals" },
              { value: ExperienceTier.HEAVY, label: "Institutional" },
            ]}
          />
        </Field>
      </div>
      <Note t={t}>
        Submitting Step 1 creates the Client record. The rest of the flow enriches it.
      </Note>
    </div>
  );
}

function AssetStepView({
  t,
  form,
  update,
  onAddAsset,
  onRemoveAsset,
  onUpdateAsset,
}: StepProps & {
  onAddAsset: () => void;
  onRemoveAsset: (idx: number) => void;
  onUpdateAsset: (idx: number, patch: Partial<AssetEntry>) => void;
}) {
  const isSeller = form.dealSide === "seller";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Subject property — required for sellers, optional for buyers */}
      <div>
        <SectionHeader t={t}>
          {isSeller ? "Property they're selling" : "Target property (optional)"}
        </SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field t={t} label="Street address" full required={isSeller}>
            <Input t={t} value={form.subjectAddress} onChange={(v) => update("subjectAddress", v)} placeholder="123 Main St" />
          </Field>
          <Field t={t} label="City">
            <Input t={t} value={form.subjectCity} onChange={(v) => update("subjectCity", v)} placeholder="Brooklyn" />
          </Field>
          <Field t={t} label="State">
            <StateSelect t={t} value={form.subjectState} onChange={(v) => update("subjectState", v)} />
          </Field>
          <Field t={t} label="Property type">
            <Select
              t={t}
              value={form.subjectPropertyType}
              onChange={(v) => update("subjectPropertyType", v as FormState["subjectPropertyType"])}
              options={[
                { value: PropertyType.SFR, label: "Single-Family" },
                { value: PropertyType.UNITS_2_4, label: "2–4 Units" },
                { value: PropertyType.UNITS_5_8, label: "5–8 Units" },
                { value: PropertyType.MIXED_USE, label: "Mixed-Use" },
                { value: PropertyType.COMMERCIAL, label: "Commercial" },
              ]}
            />
          </Field>
          <Field t={t} label={isSeller ? "Estimated market value" : "Asking price (if known)"} required={isSeller}>
            <Input t={t} value={form.subjectMarketValue} onChange={(v) => update("subjectMarketValue", v)} placeholder="485,000" prefix="$" />
          </Field>
          <Field t={t} label="Square footage">
            <Input t={t} value={form.subjectSqft} onChange={(v) => update("subjectSqft", v)} placeholder="2,140" suffix="sqft" />
          </Field>
          <Field t={t} label="Annual taxes">
            <Input t={t} value={form.subjectTaxes} onChange={(v) => update("subjectTaxes", v)} placeholder="8,420" prefix="$" />
          </Field>
        </div>
      </div>

      {/* Buyer-only — current portfolio */}
      {form.dealSide === "buyer" && (
        <div>
          <SectionHeader t={t}>Properties currently owned</SectionHeader>
          <Toggle
            t={t}
            label="The buyer currently owns real estate"
            sub="Add each property they own. Becomes part of their experience profile + financial picture."
            value={form.buyerOwnsProperties}
            onChange={(v) => update("buyerOwnsProperties", v)}
          />
          {form.buyerOwnsProperties && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
              {form.ownedAssets.map((asset, idx) => (
                <div
                  key={idx}
                  style={{
                    border: `1px solid ${t.line}`,
                    borderRadius: 10,
                    padding: 12,
                    background: t.surface2,
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                  }}
                >
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <Field t={t} label="Street address" full>
                      <Input t={t} value={asset.address} onChange={(v) => onUpdateAsset(idx, { address: v })} placeholder="55 Park Ave" />
                    </Field>
                    <Field t={t} label="City">
                      <Input t={t} value={asset.city} onChange={(v) => onUpdateAsset(idx, { city: v })} placeholder="Brooklyn" />
                    </Field>
                    <Field t={t} label="State">
                      <StateSelect t={t} value={asset.state} onChange={(v) => onUpdateAsset(idx, { state: v })} />
                    </Field>
                    <Field t={t} label="Use">
                      <Select
                        t={t}
                        value={asset.ownership}
                        onChange={(v) => onUpdateAsset(idx, { ownership: v as AssetEntry["ownership"] })}
                        options={[
                          { value: "primary", label: "Primary residence" },
                          { value: "investment", label: "Investment" },
                        ]}
                      />
                    </Field>
                    <Field t={t} label="Estimated value">
                      <Input t={t} value={asset.marketValue} onChange={(v) => onUpdateAsset(idx, { marketValue: v })} placeholder="525,000" prefix="$" />
                    </Field>
                    <Field t={t} label="Balance owed">
                      <Input t={t} value={asset.balanceOwed} onChange={(v) => onUpdateAsset(idx, { balanceOwed: v })} placeholder="280,000" prefix="$" />
                    </Field>
                  </div>
                  <button
                    onClick={() => onRemoveAsset(idx)}
                    title="Remove asset"
                    style={{
                      all: "unset",
                      cursor: "pointer",
                      color: t.ink3,
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      alignSelf: "start",
                    }}
                  >
                    <Icon name="x" size={13} />
                  </button>
                </div>
              ))}
              <button
                onClick={onAddAsset}
                style={{
                  ...qcBtn(t),
                  alignSelf: "flex-start",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Icon name="plus" size={12} /> Add property
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function NumbersStepView({ t, form, update }: StepProps) {
  const isSeller = form.dealSide === "seller";
  const isDscr = form.loanType === LoanType.DSCR;
  const isFlipOrConstruct = form.loanType === LoanType.FIX_AND_FLIP || form.loanType === LoanType.GROUND_UP;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Loan type">
          <Select
            t={t}
            value={form.loanType}
            onChange={(v) => update("loanType", v as FormState["loanType"])}
            options={[
              { value: LoanType.DSCR, label: "DSCR Rental" },
              { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip" },
              { value: LoanType.BRIDGE, label: "Bridge" },
              { value: LoanType.GROUND_UP, label: "Ground Up" },
              { value: LoanType.PORTFOLIO, label: "Portfolio" },
              { value: LoanType.CASH_OUT_REFI, label: "Cash-Out Refi" },
            ].filter((o) => isLoanTypeEnabled(o.value))}
          />
        </Field>

        {isSeller ? (
          <Field t={t} label="Sales price" required>
            <Input t={t} value={form.salesPrice} onChange={(v) => update("salesPrice", v)} placeholder="485,000" prefix="$" />
          </Field>
        ) : (
          <>
            <Field t={t} label="Cash available" required>
              <Input t={t} value={form.cashAvailable} onChange={(v) => update("cashAvailable", v)} placeholder="125,000" prefix="$" />
            </Field>
            <Field t={t} label="Max purchase price" required full>
              <Input t={t} value={form.maxPurchasePrice} onChange={(v) => update("maxPurchasePrice", v)} placeholder="650,000" prefix="$" />
            </Field>
          </>
        )}

        <Field t={t} label="Target LTV (%)">
          <Input t={t} value={form.targetLTV} onChange={(v) => update("targetLTV", v)} placeholder="75" suffix="%" />
        </Field>
        <Field t={t} label="Base rate (%)">
          <Input t={t} value={form.baseRate} onChange={(v) => update("baseRate", v)} placeholder="7.500" suffix="%" />
        </Field>

        {isDscr && (
          <Field t={t} label="Expected monthly rent" full>
            <Input t={t} value={form.expectedRent} onChange={(v) => update("expectedRent", v)} placeholder="3,650" prefix="$" />
          </Field>
        )}
        {isFlipOrConstruct && (
          <Field t={t} label="ARV (after-repair value)" full>
            <Input t={t} value={form.arv} onChange={(v) => update("arv", v)} placeholder="640,000" prefix="$" />
          </Field>
        )}
      </div>

      <Note t={t}>
        Type the numbers — sliders are gone. The Lender Submission Package generated from
        a Deal recomputes terms server-side; these inputs are starting estimates.
      </Note>
    </div>
  );
}

function CommunicationStepView({ t, form, update }: StepProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div
        style={{
          padding: 12,
          borderRadius: 10,
          background: t.petrolSoft,
          border: `1px solid ${t.petrol}30`,
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <Icon name="bolt" size={14} style={{ color: t.petrol, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>How the AI should speak with this client</div>
          <div style={{ fontSize: 11.5, color: t.ink2, marginTop: 3, lineHeight: 1.5 }}>
            These instructions guide your client-side AI only — the early-funnel relationship
            work. Once the client moves to <strong>Ready for Lending</strong>, the firm-wide
            Funding Team AI takes over for the lender packaging side.
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Preferred language">
          <Select
            t={t}
            value={form.language}
            onChange={(v) => update("language", v)}
            options={[
              { value: "en", label: "English" },
              { value: "es", label: "Spanish" },
              { value: "pt", label: "Portuguese" },
              { value: "zh", label: "Chinese" },
              { value: "fr", label: "French" },
              { value: "other", label: "Other / multilingual" },
            ]}
          />
        </Field>
        <Field t={t} label="Preferred channel">
          <Select
            t={t}
            value={form.preferredChannel}
            onChange={(v) => update("preferredChannel", v as Channel)}
            options={[
              { value: "sms+email", label: "SMS + Email" },
              { value: "sms", label: "SMS only" },
              { value: "email", label: "Email only" },
              { value: "push", label: "App push only" },
            ]}
          />
        </Field>
        <Field t={t} label="Target close date" full>
          <Input
            t={t}
            type="date"
            value={form.targetCloseDate}
            onChange={(v) => update("targetCloseDate", v)}
          />
        </Field>
      </div>

      <Field t={t} label="Backstory / context">
        <textarea
          value={form.backstory}
          onChange={(e) => update("backstory", e.target.value)}
          placeholder="Anything the AI should know up-front — relocation timeline, family situation, prior agent, why they're transacting now…"
          style={textareaStyle(t)}
          rows={3}
        />
      </Field>

      <Field t={t} label="AI speaking instructions">
        <textarea
          value={form.aiInstructions}
          onChange={(e) => update("aiInstructions", e.target.value)}
          placeholder="Keep messages short. Avoid jargon. Always copy me on first contact. Use a friendly, lower-pressure tone — they're nervous about timing."
          style={textareaStyle(t)}
          rows={3}
        />
      </Field>

      <Note t={t}>
        Compliance: AI drafts for borrower-facing messages always require your approval.
        Forbidden phrasings (&quot;you are approved&quot;, &quot;guaranteed rate&quot;) are
        enforced at prompt level — these instructions can&apos;t override them.
      </Note>
    </div>
  );
}

// ── Tiny form primitives ──────────────────────────────────────────────────

function Field({ t, label, required, children, full }: { t: QCTokens; label: string; required?: boolean; children: ReactNode; full?: boolean }) {
  return (
    <div style={{ gridColumn: full ? "1 / -1" : "auto" }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label} {required && <span style={{ color: t.danger }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function Label({ t, children }: { t: QCTokens; children: ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 8 }}>
      {children}
    </div>
  );
}

function SectionHeader({ t, children }: { t: QCTokens; children: ReactNode }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${t.line}` }}>
      {children}
    </div>
  );
}

function SideButton({
  t,
  active,
  onClick,
  children,
}: {
  t: QCTokens;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        padding: "12px 16px",
        borderRadius: 10,
        border: `1px solid ${active ? t.petrol : t.line}`,
        background: active ? t.petrolSoft : t.surface2,
        color: active ? t.petrol : t.ink2,
        fontSize: 13,
        fontWeight: 700,
        textAlign: "center",
      }}
    >
      {children}
    </button>
  );
}

function Note({ t, children }: { t: QCTokens; children: ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.55, marginTop: 4 }}>
      {children}
    </div>
  );
}

function Input({
  t,
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
  suffix,
  disabled,
}: {
  t: QCTokens;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        width: "100%",
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 9,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {prefix && (
        <span style={{ padding: "0 0 0 12px", color: t.ink3, fontSize: 13, fontWeight: 700 }}>{prefix}</span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "10px 12px",
          background: "transparent",
          border: "none",
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
        }}
      />
      {suffix && (
        <span style={{ padding: "0 12px 0 0", color: t.ink3, fontSize: 12 }}>{suffix}</span>
      )}
    </div>
  );
}

function Select({
  t,
  value,
  onChange,
  options,
}: {
  t: QCTokens;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 9,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        color: t.ink,
        fontSize: 13,
        fontFamily: "inherit",
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// Standardized US state dropdown — reads from @/lib/usStates so every
// address-collection form across the app stays in lockstep.
function StateSelect({
  t,
  value,
  onChange,
}: {
  t: QCTokens;
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        padding: "10px 12px",
        borderRadius: 9,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        color: value ? t.ink : t.ink3,
        fontSize: 13,
        fontFamily: "inherit",
        outline: "none",
      }}
    >
      <option value="">Select state…</option>
      {US_STATES.map((s) => (
        <option key={s.code} value={s.code}>
          {s.name} ({s.code})
        </option>
      ))}
    </select>
  );
}

function Toggle({
  t,
  label,
  sub,
  value,
  onChange,
}: {
  t: QCTokens;
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!value)}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${value ? t.petrol : t.line}`,
        background: value ? t.petrolSoft : t.surface2,
        width: "100%",
      }}
    >
      <div
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          background: value ? t.petrol : t.line,
          position: "relative",
          flexShrink: 0,
          transition: "background .15s ease",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 2,
            left: value ? 18 : 2,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "#fff",
            transition: "left .15s ease",
          }}
        />
      </div>
      <div>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{sub}</div>}
      </div>
    </button>
  );
}

function textareaStyle(t: QCTokens): React.CSSProperties {
  return {
    width: "100%",
    minHeight: 70,
    resize: "vertical",
    padding: "10px 12px",
    background: t.surface2,
    border: `1px solid ${t.line}`,
    borderRadius: 9,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    lineHeight: 1.5,
    outline: "none",
  };
}
