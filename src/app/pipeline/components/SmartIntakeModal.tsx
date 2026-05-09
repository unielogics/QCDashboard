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
import {
  useBrokerSettings,
  useClient,
  useClients,
  useCreateIntake,
  useCurrentUser,
  useSettings,
  useUsers,
} from "@/hooks/useApi";
import { parseUSD } from "@/lib/formCoerce";
import {
  EntityType,
  ExperienceTier,
  LoanType,
  PropertyType,
  Role,
} from "@/lib/enums.generated";
import { isLoanTypeEnabled } from "@/lib/products";
import { computeSimulator, bindingConstraintLabel } from "@/lib/eligibility";
import type {
  AgentChecklistOverlay,
  AgentSettingsData,
  AppSettingsData,
  DocChecklistItem,
  IntakeDocumentOverrides,
  OwnedAsset,
  SmartIntakePayload,
} from "@/lib/types";
import type { Role as RoleType } from "@/lib/enums.generated";
import type { QCTokens } from "@/components/design-system/tokens";
import { US_STATES } from "@/lib/usStates";

type DealSide = "buyer" | "seller";

// Loan-program options surfaced in Step 1. The `isLoanTypeEnabled`
// gate from `lib/products` filters out programs the firm doesn't
// run today — so the wizard never asks for one we can't fulfil.
const LOAN_PROGRAM_OPTIONS_ALL: { value: typeof LoanType[keyof typeof LoanType]; label: string }[] = [
  { value: LoanType.DSCR, label: "DSCR Rental" },
  { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip" },
  { value: LoanType.BRIDGE, label: "Bridge" },
  { value: LoanType.GROUND_UP, label: "Ground Up" },
  { value: LoanType.PORTFOLIO, label: "Portfolio" },
  { value: LoanType.CASH_OUT_REFI, label: "Cash-Out Refi" },
];

const LOAN_PROGRAM_LABELS: Record<string, string> = LOAN_PROGRAM_OPTIONS_ALL.reduce(
  (acc, o) => ({ ...acc, [String(o.value)]: o.label }),
  {} as Record<string, string>,
);

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

type SourceAttribution = "direct_borrower" | "agent_referral" | "existing_client" | "website" | "phone_call" | "other";
type InviteBehavior = "send_immediately" | "save_draft" | "send_after_review";

interface FormState {
  // ── Step 1: Side + Purpose + Loan program + Borrower & Entity ────────
  dealSide: DealSide;
  // Source attribution (alembic 0029) — captured by Step 1 alongside
  // borrower fields. Drives downstream rev-share when source is
  // agent_referral.
  sourceAttribution: SourceAttribution;
  referringAgentId: string;  // populated when sourceAttribution = agent_referral
  // Purchase or refinance — drives DSCR LTV cap (80% purchase / 75% refi)
  // and the Step 3 calculator branch. Maps to LoanPurpose on submit.
  loanPurpose: "purchase" | "refinance";
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
  buyerOwnsProperties: boolean;
  ownedAssets: AssetEntry[];

  // ── Step 3: Numbers (calculator-style, program-aware) ───────────────
  loanType: typeof LoanType[keyof typeof LoanType];
  // Common across programs
  targetLTV: string;        // % expressed as a string, e.g. "75"
  baseRate: string;         // % override; defaults via PRODUCT_BASE_RATE
  // Purchase / current-value inputs
  purchasePrice: string;    // Required on every BUYER (purchase) flow
  depositAvailable: string; // Buyer's cash to close (down payment + earnest)
  currentValue: string;     // DSCR refi + Bridge refi (as-is)
  payoff: string;           // DSCR refi only
  // DSCR-only
  expectedRent: string;
  // F&F / GU only
  arv: string;
  rehabBudget: string;
  targetLTC: string;        // % string, default "85"
  // Seller-only — listing price (not a loan number, captured for record)
  salesPrice: string;

  // ── Step 4: AI / Communication ───────────────────────────────────────
  language: string;
  preferredChannel: Channel;
  targetCloseDate: string;
  backstory: string;
  aiInstructions: string;
  // Step 4 ownership + invite behavior (alembic 0029).
  // assignedOwnerId blank → backend defaults to creator. invite_behavior
  // gates whether the Clerk invite fires at submit time.
  assignedOwnerId: string;
  inviteBehavior: InviteBehavior;
}

const INITIAL: FormState = {
  dealSide: "buyer",
  sourceAttribution: "direct_borrower",
  referringAgentId: "",
  loanPurpose: "purchase",
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
  buyerOwnsProperties: false,
  ownedAssets: [],
  loanType: LoanType.DSCR,
  targetLTV: "75",
  baseRate: "7.5",
  purchasePrice: "",
  depositAvailable: "",
  currentValue: "",
  payoff: "",
  expectedRent: "",
  arv: "",
  rehabBudget: "",
  targetLTC: "85",
  salesPrice: "",
  language: "en",
  preferredChannel: "sms+email",
  targetCloseDate: "",
  backstory: "",
  aiInstructions: "",
  assignedOwnerId: "",
  inviteBehavior: "send_immediately",
};

const STEPS = [
  { id: "borrower", label: "Borrower" },
  { id: "asset", label: "Asset" },
  { id: "numbers", label: "Numbers" },
  { id: "ai", label: "AI & Messaging" },
] as const;

// ── Step 4 doc-collection preview state + resolver ───────────────────

interface DocOverridesState {
  skipNames: Set<string>;
  // Maps checklist item name → days. NaN / 0 means no override; the
  // UI normalizes to integer day counts.
  dueOverrides: Record<string, number>;
}

interface CustomDocDraft {
  name: string;
  dueOffsetDays: number;
}

// Pure-TS port of the agent_checklist resolver — feeds Step 4's
// preview without needing a new backend endpoint. Mirrors the
// overlay logic in app/services/agent_checklist.py.
function resolveDocPreview({
  role,
  loanType,
  side,
  appSettings,
  brokerSettings,
}: {
  role: RoleType | undefined;
  loanType: typeof LoanType[keyof typeof LoanType];
  side: DealSide;
  appSettings: AppSettingsData | null;
  brokerSettings: AgentSettingsData | null;
}): DocChecklistItem[] {
  if (!appSettings) return [];

  // Agent path — buyer/seller transaction list + per-broker overlay.
  if (role === "broker") {
    const baseList = appSettings.transaction_checklists?.[side]?.docs ?? [];
    const overlay: AgentChecklistOverlay | undefined =
      brokerSettings?.checklists?.[side];
    return applyChecklistOverlay(baseList, overlay, side);
  }

  // Super-admin / underwriter — firm per-loan-type checklist.
  const firmList = appSettings.checklists?.[String(loanType)]?.docs ?? [];
  // Filter to items relevant to this side (or "both"). Loan-type
  // checklists may be side-aware via DocChecklistItem.side.
  return firmList.filter((it) => !it.side || it.side === "both" || it.side === side);
}

// Pack Step 4's UI state into the wire-shape IntakeDocumentOverrides.
// Returns null when there are no overrides at all (omits the field
// from the payload entirely so backend takes the default checklist).
function buildDocOverridesPayload(
  state: DocOverridesState,
  customs: CustomDocDraft[],
): IntakeDocumentOverrides | null {
  const skip_names = Array.from(state.skipNames).filter((n) => n.trim().length > 0);
  const due_offset_overrides: Record<string, number> = {};
  for (const [name, days] of Object.entries(state.dueOverrides)) {
    if (Number.isFinite(days) && days > 0) due_offset_overrides[name] = days;
  }
  const today = new Date();
  const add_items = customs
    .filter((c) => c.name.trim().length > 0)
    .map((c) => {
      const due = new Date(today);
      due.setDate(due.getDate() + (c.dueOffsetDays > 0 ? c.dueOffsetDays : 7));
      return {
        name: c.name.trim(),
        due_date: due.toISOString().slice(0, 10),
      };
    });
  if (
    skip_names.length === 0 &&
    Object.keys(due_offset_overrides).length === 0 &&
    add_items.length === 0
  ) {
    return null;
  }
  return { skip_names, due_offset_overrides, add_items };
}

function applyChecklistOverlay(
  base: DocChecklistItem[],
  overlay: AgentChecklistOverlay | undefined,
  side: DealSide,
): DocChecklistItem[] {
  const filtered = base.filter(
    (it) => !it.side || it.side === "both" || it.side === side,
  );
  if (!overlay) return filtered;
  const disabled = new Set((overlay.disabled_firm_items ?? []).map((n) => n.trim()));
  const survived = filtered.filter((it) => !disabled.has(it.name));
  const extras = (overlay.extra_items ?? []).filter(
    (it) => !it.side || it.side === "both" || it.side === side,
  );
  return [...survived, ...extras];
}

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

  // Step 4 doc-collection preview state. Loaded from the existing
  // useSettings (firm) + useBrokerSettings (per-broker overlay) hooks
  // and resolved to a flat list the UI can toggle / edit.
  const settingsQ = useSettings();
  const brokerQ = useBrokerSettings();
  const [docOverrides, setDocOverrides] = useState<DocOverridesState>({
    skipNames: new Set(),
    dueOverrides: {},
  });
  const [customDocs, setCustomDocs] = useState<CustomDocDraft[]>([]);
  const previewItems = useMemo(
    () =>
      resolveDocPreview({
        role: user?.role,
        loanType: form.loanType,
        side: form.dealSide,
        appSettings: settingsQ.data?.data ?? null,
        brokerSettings: brokerQ.data?.data ?? null,
      }),
    [user?.role, form.loanType, form.dealSide, settingsQ.data, brokerQ.data],
  );

  // Refinance is DSCR-only today (F&F / Bridge / Ground Up / Portfolio
  // are purchase-only or construction-tied). When the user flips the
  // purpose to Refinance, snap any non-DSCR program selection to DSCR
  // so they don't carry an invalid combination into Step 3.
  useEffect(() => {
    if (form.loanPurpose !== "refinance") return;
    if (form.loanType !== LoanType.DSCR) {
      setForm((f) => ({ ...f, loanType: LoanType.DSCR }));
    }
  }, [form.loanPurpose, form.loanType]);

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
      // Sellers need a subject property address. Buyers can move on
      // without one (they may not have picked a target yet). Asking-price /
      // sqft / taxes / insurance moved to the loan-detail editor — not
      // collected at intake time.
      if (isSeller) {
        return form.subjectAddress.trim().length > 0;
      }
      return true;
    }
    if (step === 2) {
      // Step 3 is being rebuilt around computeEligibility(). For now
      // require a positive computed loan amount on submit; for the
      // canAdvance gate, allow movement to step 4 always — the final
      // submit will validate via the calculator.
      return true;
    }
    return true;
  };

  const handleActivate = async () => {
    setSubmitErr(null);
    try {
      const payload = mapToPayload(form);
      // Pack Step 4's doc-preview edits into the existing
      // IntakeDocumentOverrides shape. Empty sets/maps drop out.
      const docOverridesPayload = buildDocOverridesPayload(
        docOverrides,
        customDocs,
      );
      if (docOverridesPayload) {
        payload.document_overrides = docOverridesPayload;
      }
      const result = await createIntake.mutateAsync(payload);
      setForm(INITIAL);
      setStep(0);
      setDocOverrides({ skipNames: new Set(), dueOverrides: {} });
      setCustomDocs([]);
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
      eyebrow={(() => {
        const purposeLabel = form.loanPurpose === "refinance" ? "Refinance" : "Purchase";
        const sideLabel = showSideToggle ? ` · ${isSeller ? "Seller" : "Buyer"}` : "";
        const programLabel = LOAN_PROGRAM_LABELS[form.loanType] ?? "";
        return `New Deal · ${purposeLabel}${programLabel ? ` · ${programLabel}` : ""}${sideLabel}`;
      })()}
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
          pickedClientId={pickedClient?.id ?? null}
        />
      )}
      {step === 2 && <NumbersStepView t={t} form={form} update={update} />}
      {step === 3 && (
        <CommunicationStepView
          t={t}
          form={form}
          update={update}
          docOverrides={docOverrides}
          setDocOverrides={setDocOverrides}
          customDocs={customDocs}
          setCustomDocs={setCustomDocs}
          previewItems={previewItems}
        />
      )}
    </RightPanel>
  );
}

// ── Map flat form → backend nested payload (backward-compatible) ──────────

function mapToPayload(form: FormState): SmartIntakePayload {
  const isSeller = form.dealSide === "seller";

  // Subject property: for sellers it's the listing; for buyers it's the
  // (optional) target they may have already identified. If buyer with no
  // subject, send placeholder data — the loan row exists as a working
  // file until the borrower locks a property. Asking-price / sqft /
  // taxes / insurance moved to the loan-detail editor (Phase B).
  const subjectAddressRaw = form.subjectAddress.trim();
  const address = subjectAddressRaw || (isSeller ? "" : "Property TBD");
  const city = form.subjectCity.trim();
  const state = form.subjectState.trim().toUpperCase() || null;

  // Step 3 calculator output — re-run computeSimulator() with the same
  // inputs the UI showed so the persisted Loan amount matches what the
  // operator saw on screen. Sellers carry no loan number — passes 0.
  const ltvPctRaw = parseFloat(form.targetLTV) || 0;
  const ltvFraction = ltvPctRaw / 100;
  const ltcFraction = (parseFloat(form.targetLTC) || 0) / 100;
  const isRefi = form.loanPurpose === "refinance";
  const isReno =
    form.loanType === LoanType.FIX_AND_FLIP ||
    form.loanType === LoanType.GROUND_UP;
  const subjectValueDollars = isRefi
    ? parseUSD(form.currentValue)
    : parseUSD(form.purchasePrice);
  const arvDollars = parseUSD(form.arv);
  const productKey = loanTypeToProductKey(form.loanType);
  const sim = isSeller
    ? null
    : computeSimulator({
        arv: isReno ? arvDollars : subjectValueDollars,
        ltv: isReno ? ltcFraction : ltvFraction,
        discountPoints: 0,
        productKey,
        transactionType: isRefi ? "refi" : "purchase",
        payoff: isRefi ? parseUSD(form.payoff) || undefined : undefined,
        brv: isReno ? parseUSD(form.currentValue) || undefined : undefined,
        rehabBudget: isReno ? parseUSD(form.rehabBudget) || undefined : undefined,
        monthlyRent: parseUSD(form.expectedRent) || undefined,
      });
  const amount = isSeller ? 0 : Math.round(sim?.maxLoan ?? 0);
  const ltvDecimal = isReno ? ltcFraction : ltvFraction;
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
      // sqft / annual_taxes / annual_insurance / as_is_value are
      // captured later via the loan-detail editor — not at intake.
      annual_taxes: 0,
      annual_insurance: 0,
    },
    numbers: {
      type: form.loanType,
      // Map binary toggle → backend LoanPurpose. Refi → cash-out (the
      // conservative LTV cap). Rate-term as a v2 follow-up.
      purpose: form.loanPurpose === "refinance" ? "cash_out_refi" : "purchase",
      amount,
      ltv: ltvDecimal,
      ltc: null,
      arv: parseUSD(form.arv) || null,
      monthly_rent: parseUSD(form.expectedRent) || null,
      base_rate: baseRate,
      // Phase C: cash_available / max_purchase_price / sales_price are
      // no longer collected by the wizard. Kept null for backward compat
      // until the NumbersStep schema retires them.
      cash_available: null,
      max_purchase_price: null,
      sales_price: isSeller ? parseUSD(form.salesPrice) || null : null,
      deposit_available: isSeller ? null : parseUSD(form.depositAvailable) || null,
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
    // Source attribution + ownership + invite-behavior (alembic 0029).
    // Backend accepts these on SmartIntakePayload — set via Step 1 +
    // Step 4 dropdowns. referring_agent_id only sent when source is
    // agent_referral.
    source_attribution: form.sourceAttribution,
    referring_agent_id:
      form.sourceAttribution === "agent_referral" && form.referringAgentId
        ? form.referringAgentId
        : null,
    assigned_owner_id: form.assignedOwnerId || null,
    invite_behavior: form.inviteBehavior,
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

      {/* Loan purpose — drives the Step 3 calculator branch + persists
          on Loan.purpose. Refinance maps to CASH_OUT_REFI on the wire
          (the conservative LTV cap; rate-term refi is a v2 follow-up). */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Purpose" required>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <SideButton t={t} active={form.loanPurpose === "purchase"} onClick={() => update("loanPurpose", "purchase")}>
              Purchase
            </SideButton>
            <SideButton t={t} active={form.loanPurpose === "refinance"} onClick={() => update("loanPurpose", "refinance")}>
              Refinance
            </SideButton>
          </div>
        </Field>
        <Field t={t} label="Loan program" required>
          <Select
            t={t}
            value={String(form.loanType)}
            onChange={(v) => update("loanType", v as FormState["loanType"])}
            options={LOAN_PROGRAM_OPTIONS_ALL
              .filter((o) => isLoanTypeEnabled(o.value))
              // DSCR is the only program that supports refinance today —
              // F&F / Bridge / Ground Up / Portfolio are purchase-only or
              // construction-tied, so hide them when the purpose toggle
              // is set to Refinance to keep operators from picking an
              // invalid combination.
              .filter((o) => form.loanPurpose !== "refinance" || o.value === LoanType.DSCR)
              .map((o) => ({ value: String(o.value), label: o.label }))}
          />
        </Field>
      </div>

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

      {/* Source attribution (alembic 0029). When set to agent_referral
          surfaces the broker picker so the originating agent gets
          credit on the resulting Loan row. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Source attribution" required>
          <Select
            t={t}
            value={form.sourceAttribution}
            onChange={(v) => update("sourceAttribution", v as SourceAttribution)}
            options={[
              { value: "direct_borrower", label: "Direct borrower" },
              { value: "agent_referral", label: "Agent referral" },
              { value: "existing_client", label: "Existing client" },
              { value: "website", label: "Website" },
              { value: "phone_call", label: "Phone call" },
              { value: "other", label: "Other" },
            ]}
          />
        </Field>
        {form.sourceAttribution === "agent_referral" && (
          <Field t={t} label="Referring agent" required>
            <AgentPicker
              t={t}
              value={form.referringAgentId}
              onChange={(v) => update("referringAgentId", v)}
            />
          </Field>
        )}
      </div>

      <Note t={t}>
        Submitting Step 1 creates the Client record. The rest of the flow enriches it.
      </Note>
    </div>
  );
}

// Picker for users with role=BROKER. Used by SmartIntakeModal Step 1
// when source_attribution = agent_referral, and Step 4's assigned-owner
// dropdown which spans operators broadly. Filtering happens client-side.
function AgentPicker({
  t,
  value,
  onChange,
  filterRoles,
  emptyLabel = "Select agent…",
}: {
  t: QCTokens;
  value: string;
  onChange: (id: string) => void;
  filterRoles?: Role[];
  emptyLabel?: string;
}) {
  const { data: users = [] } = useUsers();
  const filtered = useMemo(() => {
    if (!filterRoles || filterRoles.length === 0) {
      return users.filter((u) => u.role === Role.BROKER);
    }
    return users.filter((u) => filterRoles.includes(u.role));
  }, [users, filterRoles]);
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
      <option value="">{emptyLabel}</option>
      {filtered.map((u) => (
        <option key={u.id} value={u.id}>{u.name} · {u.email}</option>
      ))}
    </select>
  );
}

// Read-only summary of a linked client's investor context.
// Pulled live from /clients/{id} so freshly-edited tier / fico /
// experience text reflects without the wizard caller passing it.
function ClientContextCard({
  t,
  clientId,
}: {
  t: QCTokens;
  clientId: string;
}) {
  const { data: client, isLoading } = useClient(clientId);
  if (isLoading || !client) return null;
  const hasContext =
    !!client.experience ||
    !!client.properties ||
    !!client.fico ||
    (client.tier && client.tier !== "standard");
  if (!hasContext) return null;
  return (
    <div
      style={{
        padding: "10px 12px",
        borderRadius: 9,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{
        fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
        textTransform: "uppercase", color: t.ink3,
      }}>
        Borrower context
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{client.name}</span>
        {client.tier && client.tier !== "standard" && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px",
            borderRadius: 999, background: t.brandSoft, color: t.brand,
          }}>
            {client.tier}
          </span>
        )}
        {client.fico != null && (
          <span style={{
            fontSize: 10, fontWeight: 700, padding: "2px 8px",
            borderRadius: 999, background: t.surface, color: t.ink2,
            border: `1px solid ${t.line}`,
          }}>
            FICO {client.fico}
          </span>
        )}
      </div>
      {client.experience && (
        <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
          <strong style={{ color: t.ink3, fontWeight: 700, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>
            Experience
          </strong>
          <div style={{ marginTop: 2 }}>{client.experience}</div>
        </div>
      )}
      {client.properties && (
        <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.5 }}>
          <strong style={{ color: t.ink3, fontWeight: 700, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase" }}>
            Properties
          </strong>
          <div style={{ marginTop: 2 }}>{client.properties}</div>
        </div>
      )}
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
  pickedClientId,
}: StepProps & {
  onAddAsset: () => void;
  onRemoveAsset: (idx: number) => void;
  onUpdateAsset: (idx: number, patch: Partial<AssetEntry>) => void;
  pickedClientId: string | null;
}) {
  const isSeller = form.dealSide === "seller";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Auto-display the linked client's investor context. The
          borrower's experience / properties / tier / FICO live on the
          Client row already — no need to retype on every new deal. */}
      {pickedClientId && (
        <ClientContextCard t={t} clientId={pickedClientId} />
      )}

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
          {/* Asking price / sqft / taxes / insurance moved to the
              loan-detail editor — they're not needed at intake time
              and clutter the wizard. */}
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

// Map LoanType → computeSimulator productKey. Portfolio + Cash-Out
// Refi land on the DSCR sizing model (the same long-term amortized
// product family).
function loanTypeToProductKey(
  loanType: typeof LoanType[keyof typeof LoanType],
): "dscr" | "ff" | "gu" | "br" {
  if (loanType === LoanType.FIX_AND_FLIP) return "ff";
  if (loanType === LoanType.GROUND_UP) return "gu";
  if (loanType === LoanType.BRIDGE) return "br";
  return "dscr";
}

function NumbersStepView({ t, form, update }: StepProps) {
  const isSeller = form.dealSide === "seller";
  const isDscr =
    form.loanType === LoanType.DSCR ||
    form.loanType === LoanType.PORTFOLIO ||
    form.loanType === LoanType.CASH_OUT_REFI;
  const isReno =
    form.loanType === LoanType.FIX_AND_FLIP ||
    form.loanType === LoanType.GROUND_UP;
  const isBridge = form.loanType === LoanType.BRIDGE;
  const isRefi = form.loanPurpose === "refinance";

  // Sellers don't have loan numbers — they're listing the property.
  // Capture the listing price for the record and skip the calculator.
  if (isSeller) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field t={t} label="Listing price" required full>
            <Input t={t} value={form.salesPrice} onChange={(v) => update("salesPrice", v)} placeholder="485,000" prefix="$" />
          </Field>
        </div>
        <Note t={t}>
          Listings don&apos;t carry loan terms — submit to create the seller-side
          deal record.
        </Note>
      </div>
    );
  }

  // Buyer flow — feed the simulator engine to compute live max-loan +
  // binding-cap readout. Sliders intentionally absent: this is intake,
  // operators tune precise numbers on the loan detail post-create.
  const productKey = loanTypeToProductKey(form.loanType);
  const ltvPct = parseFloat(form.targetLTV) || 0;
  const ltvFraction = ltvPct / 100;
  const ltcPct = parseFloat(form.targetLTC) || 0;
  const ltcFraction = ltcPct / 100;
  // Purchase price drives sizing on every BUYER program. Refis use
  // current as-is value instead since there's no acquisition. F&F /
  // GU's BRV is just the purchase price (you buy it then renovate).
  const purchasePriceDollars = parseUSD(form.purchasePrice);
  const subjectValue = isRefi ? parseUSD(form.currentValue) : purchasePriceDollars;
  const arv = parseUSD(form.arv);
  const rehab = parseUSD(form.rehabBudget);
  const payoffDollars = parseUSD(form.payoff);
  const monthlyRent = parseUSD(form.expectedRent);

  const simInputs = {
    arv: isReno ? arv : subjectValue,
    ltv: isReno ? ltcFraction : ltvFraction,  // Reno: LTC slider drives sizing
    discountPoints: 0,
    productKey,
    transactionType: isRefi ? ("refi" as const) : ("purchase" as const),
    payoff: isRefi ? payoffDollars || undefined : undefined,
    // BRV = the purchase price for F&F / GU (you buy then renovate).
    brv: isReno ? purchasePriceDollars || undefined : undefined,
    rehabBudget: isReno ? rehab || undefined : undefined,
    monthlyRent: monthlyRent || undefined,
  };
  const sim = computeSimulator(simInputs);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* BANKING DETAILS — required for every buyer (purchase) flow.
          Captures the price they're buying at + the cash they have on
          hand to bring to closing. Listings (seller side) never see
          these — that path is short-circuited above. */}
      {!isRefi && (
        <div>
          <SectionHeader t={t}>
            {isReno ? "Acquisition" : "Purchase & banking"}
          </SectionHeader>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Purchase price" required>
              <Input t={t} value={form.purchasePrice} onChange={(v) => update("purchasePrice", v)} placeholder="485,000" prefix="$" />
            </Field>
            <Field t={t} label="Deposit available">
              <Input t={t} value={form.depositAvailable} onChange={(v) => update("depositAvailable", v)} placeholder="125,000" prefix="$" />
            </Field>
          </div>
        </div>
      )}

      {/* PROGRAM-SPECIFIC inputs — what the simulator needs to size
          the loan beyond price + deposit. */}
      <div>
        <SectionHeader t={t}>
          {isRefi ? "Refinance terms" : "Loan terms"}
        </SectionHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>

          {/* DSCR refi: current value + payoff replace purchase price */}
          {isDscr && isRefi && (
            <>
              <Field t={t} label="Current as-is value" required>
                <Input t={t} value={form.currentValue} onChange={(v) => update("currentValue", v)} placeholder="500,000" prefix="$" />
              </Field>
              <Field t={t} label="Existing payoff" required>
                <Input t={t} value={form.payoff} onChange={(v) => update("payoff", v)} placeholder="320,000" prefix="$" />
              </Field>
            </>
          )}

          {/* DSCR (purchase or refi): monthly rent drives the DSCR calc */}
          {isDscr && (
            <Field t={t} label="Expected monthly rent" full={isRefi}>
              <Input t={t} value={form.expectedRent} onChange={(v) => update("expectedRent", v)} placeholder="3,650" prefix="$" />
            </Field>
          )}

          {/* F&F / GU purchase: ARV + rehab. BRV = purchase price above. */}
          {isReno && (
            <>
              <Field t={t} label="ARV (after-repair value)" required>
                <Input t={t} value={form.arv} onChange={(v) => update("arv", v)} placeholder="640,000" prefix="$" />
              </Field>
              <Field t={t} label="Rehab budget">
                <Input t={t} value={form.rehabBudget} onChange={(v) => update("rehabBudget", v)} placeholder="60,000" prefix="$" />
              </Field>
            </>
          )}

          {/* LTV / LTC selector — DSCR / Bridge use LTV; Reno uses LTC. */}
          {isReno ? (
            <Field t={t} label="Target LTC (%)">
              <Input t={t} value={form.targetLTC} onChange={(v) => update("targetLTC", v)} placeholder="85" suffix="%" />
            </Field>
          ) : (
            <Field t={t} label={`Target LTV (%) · cap ${isRefi ? "75" : "80"}%`}>
              <Input t={t} value={form.targetLTV} onChange={(v) => update("targetLTV", v)} placeholder={isRefi ? "70" : "75"} suffix="%" />
            </Field>
          )}
          <Field t={t} label="Base rate (%)">
            <Input t={t} value={form.baseRate} onChange={(v) => update("baseRate", v)} placeholder="7.500" suffix="%" />
          </Field>
        </div>
      </div>

      {/* Bridge purchase carries no extra fields beyond the banking
          block + LTV — the simulator sizes off purchase price × LTV. */}

      {/* Live readout — mirrors the simulator's eligibility chip */}
      <div
        style={{
          padding: "12px 14px",
          borderRadius: 10,
          background: t.brandSoft,
          border: `1px solid ${t.brand}30`,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
          textTransform: "uppercase", color: t.brand,
        }}>
          Live calc · {isRefi ? "Refinance" : "Purchase"} · {LOAN_PROGRAM_LABELS[String(form.loanType)] ?? "—"}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "baseline" }}>
          <div>
            <div style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>Max loan</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
              {sim.maxLoan > 0 ? `$${Math.round(sim.maxLoan).toLocaleString("en-US")}` : "—"}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>Binding cap</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink2 }}>
              {bindingConstraintLabel(sim.bindingConstraint)}
            </div>
          </div>
          {isDscr && sim.dscr != null && (
            <div>
              <div style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>DSCR</div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: sim.dscr >= 1.20 ? t.profit : sim.dscr >= 1.0 ? t.warn : t.danger,
              }}>
                {sim.dscr.toFixed(2)}x
              </div>
            </div>
          )}
          {isDscr && sim.cashFlow != null && (
            <div>
              <div style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>Cash flow / mo</div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: sim.cashFlow >= 0 ? t.profit : t.danger,
                fontFeatureSettings: '"tnum"',
              }}>
                ${Math.round(sim.cashFlow).toLocaleString("en-US")}
              </div>
            </div>
          )}
          {isDscr && isRefi && sim.cashToBorrower != null && (
            <div>
              <div style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>Cash to borrower</div>
              <div style={{
                fontSize: 13, fontWeight: 700,
                color: sim.cashToBorrower >= 0 ? t.profit : t.warn,
                fontFeatureSettings: '"tnum"',
              }}>
                ${Math.round(sim.cashToBorrower).toLocaleString("en-US")}
              </div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          <div>
            <div style={{ fontSize: 11, color: t.ink3, fontWeight: 600 }}>Rate</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink2 }}>
              {sim.rate.toFixed(3)}%
            </div>
          </div>
        </div>
      </div>

      <Note t={t}>
        Type the numbers — operators tune precise terms on the loan detail
        after submit. Caps mirror the firm&apos;s underwriting matrix.
      </Note>
    </div>
  );
}

function CommunicationStepView({
  t,
  form,
  update,
  docOverrides,
  setDocOverrides,
  customDocs,
  setCustomDocs,
  previewItems,
}: StepProps & {
  docOverrides: DocOverridesState;
  setDocOverrides: React.Dispatch<React.SetStateAction<DocOverridesState>>;
  customDocs: CustomDocDraft[];
  setCustomDocs: React.Dispatch<React.SetStateAction<CustomDocDraft[]>>;
  previewItems: DocChecklistItem[];
}) {
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

      {/* Ownership + invite behavior (alembic 0029). assigned_owner_id
          blank → backend defaults to the creator. invite_behavior gates
          whether the Clerk invite fires at submit time. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
        <Field t={t} label="Assigned funding owner">
          <AgentPicker
            t={t}
            value={form.assignedOwnerId}
            onChange={(v) => update("assignedOwnerId", v)}
            filterRoles={[Role.SUPER_ADMIN, Role.LOAN_EXEC]}
            emptyLabel="Funding Team queue"
          />
        </Field>
        <Field t={t} label="Borrower invite behavior">
          <Select
            t={t}
            value={form.inviteBehavior}
            onChange={(v) => update("inviteBehavior", v as InviteBehavior)}
            options={[
              { value: "send_immediately", label: "Send invite immediately" },
              { value: "save_draft", label: "Save draft only" },
              { value: "send_after_review", label: "Send after review" },
            ]}
          />
        </Field>
      </div>

      <DocPreviewSection
        t={t}
        items={previewItems}
        docOverrides={docOverrides}
        setDocOverrides={setDocOverrides}
        customDocs={customDocs}
        setCustomDocs={setCustomDocs}
      />
    </div>
  );
}

// Step 4 doc-collection preview — renders the resolved checklist with
// per-item skip / due-offset edit, plus an "+ Add custom doc" appender.
function DocPreviewSection({
  t,
  items,
  docOverrides,
  setDocOverrides,
  customDocs,
  setCustomDocs,
}: {
  t: QCTokens;
  items: DocChecklistItem[];
  docOverrides: DocOverridesState;
  setDocOverrides: React.Dispatch<React.SetStateAction<DocOverridesState>>;
  customDocs: CustomDocDraft[];
  setCustomDocs: React.Dispatch<React.SetStateAction<CustomDocDraft[]>>;
}) {
  const toggleSkip = (name: string) => {
    setDocOverrides((s) => {
      const next = new Set(s.skipNames);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { ...s, skipNames: next };
    });
  };
  const setDueOverride = (name: string, days: number) => {
    setDocOverrides((s) => {
      const next = { ...s.dueOverrides };
      if (!Number.isFinite(days) || days <= 0) {
        delete next[name];
      } else {
        next[name] = Math.round(days);
      }
      return { ...s, dueOverrides: next };
    });
  };
  const addCustom = () => {
    setCustomDocs((arr) => [...arr, { name: "", dueOffsetDays: 7 }]);
  };
  const updateCustom = (idx: number, patch: Partial<CustomDocDraft>) => {
    setCustomDocs((arr) =>
      arr.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };
  const removeCustom = (idx: number) => {
    setCustomDocs((arr) => arr.filter((_, i) => i !== idx));
  };

  const visibleCount = items.length - docOverrides.skipNames.size + customDocs.length;

  return (
    <div
      style={{
        marginTop: 8,
        padding: "12px 14px",
        borderRadius: 10,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div>
        <div style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
          textTransform: "uppercase", color: t.ink3,
        }}>
          Doc collection — preview
        </div>
        <div style={{ fontSize: 11.5, color: t.ink2, lineHeight: 1.5, marginTop: 2 }}>
          The AI will request these {visibleCount} files from the borrower
          starting at deal kickoff. Toggle off anything you don&apos;t need
          for this deal. Edit due offsets if you want a tighter / looser
          cadence. Add custom rows for one-off items unique to this deal.
        </div>
      </div>

      {items.length === 0 ? (
        <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic", padding: "8px 0" }}>
          No checklist configured for this loan type yet — the AI will start with no
          default file list. Add custom rows below if you want to seed it.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {items.map((item) => {
            const isSkipped = docOverrides.skipNames.has(item.name);
            const defaultOffset = item.due_offset_days ?? 3;
            const overrideValue = docOverrides.dueOverrides[item.name];
            const offsetValue = overrideValue ?? defaultOffset;
            return (
              <div
                key={item.name}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 10px", borderRadius: 8,
                  background: isSkipped ? "transparent" : t.surface,
                  border: `1px solid ${t.line}`,
                  opacity: isSkipped ? 0.55 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={!isSkipped}
                  onChange={() => toggleSkip(item.name)}
                  style={{ width: 15, height: 15, cursor: "pointer" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12.5, fontWeight: 700, color: t.ink,
                    textDecoration: isSkipped ? "line-through" : "none",
                  }}>
                    {item.display_name || item.name}
                  </div>
                  {item.type === "internal" && (
                    <div style={{ fontSize: 10.5, color: t.ink3 }}>internal · operator-ordered</div>
                  )}
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600 }}>+</span>
                  <input
                    type="number"
                    min={0}
                    value={offsetValue}
                    onChange={(e) => setDueOverride(item.name, Number(e.target.value))}
                    disabled={isSkipped}
                    style={{
                      width: 44, padding: "4px 6px",
                      fontSize: 12, borderRadius: 6,
                      border: `1px solid ${t.line}`,
                      background: t.surface2, color: t.ink,
                      textAlign: "center", outline: "none",
                      fontFamily: "inherit",
                    }}
                  />
                  <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600 }}>d</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {customDocs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1.2,
            textTransform: "uppercase", color: t.ink3, marginTop: 6,
          }}>
            Custom — this deal only
          </div>
          {customDocs.map((c, idx) => (
            <div
              key={idx}
              style={{
                display: "grid", gridTemplateColumns: "1fr 90px 32px", gap: 8,
                padding: "8px 10px", borderRadius: 8,
                background: t.surface, border: `1px solid ${t.line}`,
                alignItems: "center",
              }}
            >
              <input
                value={c.name}
                onChange={(e) => updateCustom(idx, { name: e.target.value })}
                placeholder="e.g. Notarized power of attorney"
                style={{
                  padding: "6px 8px", fontSize: 12, borderRadius: 6,
                  border: `1px solid ${t.line}`, background: t.surface2,
                  color: t.ink, outline: "none", fontFamily: "inherit",
                }}
              />
              <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600 }}>+</span>
                <input
                  type="number"
                  min={1}
                  value={c.dueOffsetDays}
                  onChange={(e) => updateCustom(idx, { dueOffsetDays: Number(e.target.value) || 7 })}
                  style={{
                    width: 44, padding: "4px 6px",
                    fontSize: 12, borderRadius: 6,
                    border: `1px solid ${t.line}`,
                    background: t.surface2, color: t.ink,
                    textAlign: "center", outline: "none",
                    fontFamily: "inherit",
                  }}
                />
                <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600 }}>d</span>
              </div>
              <button
                onClick={() => removeCustom(idx)}
                aria-label="Remove custom doc"
                style={{
                  all: "unset", cursor: "pointer",
                  width: 28, height: 28, borderRadius: 6,
                  border: `1px solid ${t.line}`, background: "transparent",
                  color: t.ink3,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Icon name="x" size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={addCustom}
        style={{
          ...qcBtn(t),
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          marginTop: 4,
        }}
      >
        <Icon name="plus" size={11} /> Add custom doc
      </button>
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
