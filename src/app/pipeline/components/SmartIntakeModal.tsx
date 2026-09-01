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
// Container is the shared <Drawer> — the one dialog shape for the whole app,
// which superseded both Modal and RightPanel.
//
// Backend payload (qcbackend POST /api/v1/intake) is preserved on the
// existing borrower/asset/numbers/ai_rules shape, with the new fields
// appended on the same payload. Backend will ignore unknowns until support
// lands.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, IconBtn, Linky, Note as DSNote, Seg, WarnLine, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { GoogleAddressInput } from "@/components/property/GoogleAddressInput";
import {
  useBrokerSettings,
  useClient,
  useCreateIntake,
  useCurrentUser,
  useSettings,
  useUsers,
} from "@/hooks/useApi";
import { ClientSearchBlock } from "@/components/ClientSearchBlock";
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
import type { CssVars } from "@/components/design-system/cssVars";

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
  collectionStartDelayDays = 0,
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
  const delay = collectionStartDelayDays > 0 ? Math.round(collectionStartDelayDays) : 0;
  if (
    skip_names.length === 0 &&
    Object.keys(due_offset_overrides).length === 0 &&
    add_items.length === 0 &&
    delay === 0
  ) {
    return null;
  }
  const out: IntakeDocumentOverrides = { skip_names, due_offset_overrides, add_items };
  if (delay > 0) out.collection_start_delay_days = delay;
  return out;
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
  // Broker-only: delay the start of collection / AI outreach. Default
  // 0 = Immediately. Unit is UI sugar — converted to days on the wire
  // (backend is day-granular).
  const [collectionStartValue, setCollectionStartValue] = useState(0);
  const [collectionStartUnit, setCollectionStartUnit] = useState<"days" | "hours">("days");
  const collectionStartDelayDays =
    collectionStartUnit === "hours"
      ? Math.round(collectionStartValue / 24)
      : Math.round(collectionStartValue);
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

  // Brokers are locked to app-push outreach for now. Force it so the
  // payload is correct even though the Select is read-only.
  useEffect(() => {
    if (isBroker && form.preferredChannel !== "push") {
      update("preferredChannel", "push");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBroker]);

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
        isBroker ? collectionStartDelayDays : 0,
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
      // Every new file starts at the shared ownership gate. Elara and funding
      // actions remain available after the 100% owner schedule is complete.
      router.push(`/loans/${result.loan_id}?tab=verification&step=1&just-created=1`);
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
    <Drawer
      open={open}
      onClose={onClose}
      width="lg"
      sub={(() => {
        const purposeLabel = form.loanPurpose === "refinance" ? "Refinance" : "Purchase";
        const sideLabel = showSideToggle ? ` · ${isSeller ? "Seller" : "Buyer"}` : "";
        const programLabel = LOAN_PROGRAM_LABELS[form.loanType] ?? "";
        return `New File · ${purposeLabel}${programLabel ? ` · ${programLabel}` : ""}${sideLabel}`;
      })()}
      title={STEPS[step].label}
      // The visible title is the STEP. Without this a screen-reader user hears
      // "Borrower" and never learns which dialog they are in.
      ariaLabel="Smart Intake — new file"
      footer={
        <>
          <Btn
            onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
            disabled={createIntake.isPending}
          >
            {step === 0 ? "Cancel" : "← Back"}
          </Btn>
          {/* The step counter doubles as the submit-error line; a failed
              activation has to be readable without hunting for it. */}
          {submitErr ? (
            <WarnLine className="sp">{submitErr}</WarnLine>
          ) : (
            <div className="sub" style={{ flex: 1, textAlign: "center" }}>
              Step {step + 1} of {STEPS.length}
            </div>
          )}
          {step < STEPS.length - 1 ? (
            <Btn
              variant="pri"
              onClick={() => canAdvance() && setStep(step + 1)}
              disabled={!canAdvance()}
            >
              Continue →
            </Btn>
          ) : (
            <Btn variant="pri" onClick={handleActivate} disabled={createIntake.isPending}>
              <Icon name="bolt" size={13} />
              {createIntake.isPending ? "Activating…" : "Activate AI"}
            </Btn>
          )}
        </>
      }
    >
      {/* Stepper — `.stepdot` carries the numbered pip and the done/active
          tone; the connector rule between steps is the one bespoke bit. */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{ flex: 1, display: "flex", alignItems: "center", gap: 6 }}>
            <span className={cx("stepdot", i <= step && "on")}>
              <i>{i < step ? "✓" : i + 1}</i>
              {s.label}
            </span>
            {i < STEPS.length - 1 && (
              <div style={{ flex: 1, height: 1, background: i < step ? "var(--accent)" : "var(--line)" }} />
            )}
          </div>
        ))}
      </div>

      {/* Body — switch on step */}
      {step === 0 && (
        <BorrowerStepView
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
          form={form}
          update={update}
          onAddAsset={handleAddAsset}
          onRemoveAsset={handleRemoveAsset}
          onUpdateAsset={handleUpdateAsset}
          pickedClientId={pickedClient?.id ?? null}
        />
      )}
      {step === 2 && <NumbersStepView form={form} update={update} />}
      {step === 3 && (
        <CommunicationStepView
          form={form}
          update={update}
          docOverrides={docOverrides}
          setDocOverrides={setDocOverrides}
          customDocs={customDocs}
          setCustomDocs={setCustomDocs}
          previewItems={previewItems}
          isBroker={isBroker}
          collectionStartValue={collectionStartValue}
          setCollectionStartValue={setCollectionStartValue}
          collectionStartUnit={collectionStartUnit}
          setCollectionStartUnit={setCollectionStartUnit}
        />
      )}
    </Drawer>
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

interface StepProps {
  form: FormState;
  update: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}

interface BorrowerStepProps extends StepProps {
  /** Only still here for <ClientSearchBlock>, which has not been migrated. */
  showSideToggle: boolean;
  pickedClient: IntakePrefillClient | null;
  onPickClient: (c: IntakePrefillClient) => void;
  clearPickedClient: () => void;
}

function BorrowerStepView({
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
          <Label>Buyer or Seller</Label>
          <div className="cg">
            <SideButton active={form.dealSide === "buyer"} onClick={() => update("dealSide", "buyer")}>
              Buyer
            </SideButton>
            <SideButton active={form.dealSide === "seller"} onClick={() => update("dealSide", "seller")}>
              Seller
            </SideButton>
          </div>
          <Note>
            {form.dealSide === "buyer"
              ? "We'll capture purchase capacity and any properties they currently own."
              : "We'll capture the listing — the property they're selling, plus the sale price."}
          </Note>
        </div>
      )}

      {/* Loan purpose — drives the Step 3 calculator branch + persists
          on Loan.purpose. Refinance maps to CASH_OUT_REFI on the wire
          (the conservative LTV cap; rate-term refi is a v2 follow-up). */}
      <div className="cg">
        <Field label="Purpose" required>
          <div className="cg">
            <SideButton active={form.loanPurpose === "purchase"} onClick={() => update("loanPurpose", "purchase")}>
              Purchase
            </SideButton>
            <SideButton active={form.loanPurpose === "refinance"} onClick={() => update("loanPurpose", "refinance")}>
              Refinance
            </SideButton>
          </div>
        </Field>
        <Field label="Loan program" required>
          <Select
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
        <ClientSearchBlock
          onPick={onPickClient}
          helperText="Don't see them? Skip the search and fill the borrower fields below — we'll create a new client."
        />
      )}

      {locked && pickedClient && (
        <div className="card row">
          <Icon name="check" size={14} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b>Existing client: {pickedClient.name}</b>
            <div className="sub">
              {pickedClient.email ?? "—"}
              {pickedClient.phone ? ` · ${pickedClient.phone}` : ""}
            </div>
          </div>
          <Linky onClick={clearPickedClient}>Choose different client</Linky>
        </div>
      )}

      <div className="cg">
        <Field label="Name" required>
          <Input value={form.borrowerName} onChange={(v) => update("borrowerName", v)} placeholder="Marcus Holloway" disabled={locked} />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={form.borrowerEmail} onChange={(v) => update("borrowerEmail", v)} placeholder="marcus@holloway.cap" disabled={locked} />
        </Field>
        <Field label="Phone">
          <Input value={form.borrowerPhone} onChange={(v) => update("borrowerPhone", v)} placeholder="(917) 555-0148" disabled={locked} />
        </Field>
        <Field label="Entity type">
          <Select
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
        <Field label="Entity name">
          <Input value={form.entityName} onChange={(v) => update("entityName", v)} placeholder="Holloway Capital LLC" />
        </Field>
        <Field label="Experience level">
          <Select
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
      <div className="cg">
        <Field label="Source attribution" required>
          <Select
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
          <Field label="Referring agent" required>
            <AgentPicker
              value={form.referringAgentId}
              onChange={(v) => update("referringAgentId", v)}
            />
          </Field>
        )}
      </div>

      <Note>
        Submitting Step 1 creates the Client record. The rest of the flow enriches it.
      </Note>
    </div>
  );
}

// Picker for users with role=BROKER. Used by SmartIntakeModal Step 1
// when source_attribution = agent_referral, and Step 4's assigned-owner
// dropdown which spans operators broadly. Filtering happens client-side.
function AgentPicker({
  value,
  onChange,
  filterRoles,
  emptyLabel = "Select agent…",
}: {
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
      className="field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
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
  clientId,
}: {
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
    <div className="card">
      <div className="lbl">Borrower context</div>
      <div className="row" style={{ marginTop: 6 }}>
        <b>{client.name}</b>
        {client.tier && client.tier !== "standard" && (
          <CellChip tone="acc">{client.tier}</CellChip>
        )}
        {client.fico != null && <CellChip tone="mut">FICO {client.fico}</CellChip>}
      </div>
      {client.experience && (
        <div className="mt">
          <div className="lbl">Experience</div>
          <div>{client.experience}</div>
        </div>
      )}
      {client.properties && (
        <div className="mt">
          <div className="lbl">Properties</div>
          <div>{client.properties}</div>
        </div>
      )}
    </div>
  );
}

function AssetStepView({
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
        <ClientContextCard clientId={pickedClientId} />
      )}

      {/* Subject property — required for sellers, optional for buyers */}
      <div>
        <SectionHeader>
          {isSeller ? "Property they're selling" : "Target property (optional)"}
        </SectionHeader>
        <div className="cg">
          <div className="s12">
            <GoogleAddressInput
              value={{ street: form.subjectAddress, city: form.subjectCity, state: form.subjectState }}
              onChange={(next) => {
                update("subjectAddress", next.street ?? "");
                update("subjectCity", next.city ?? "");
                update("subjectState", next.state ?? "");
              }}
              showZip={false}
              helperText="Search Google and select the property, or use manual entry if the address is not listed."
            />
          </div>
          <Field label="Property type">
            <Select
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
          <SectionHeader>Properties currently owned</SectionHeader>
          <Toggle
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
                  className="card"
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10 }}
                >
                  <div className="cg">
                    <div className="s12">
                      <GoogleAddressInput
                        value={{ street: asset.address, city: asset.city, state: asset.state }}
                        onChange={(next) =>
                          onUpdateAsset(idx, {
                            address: next.street ?? "",
                            city: next.city ?? "",
                            state: next.state ?? "",
                          })
                        }
                        showZip={false}
                        helperText="Search Google and select the property, or use manual entry if the address is not listed."
                      />
                    </div>
                    <Field label="Use">
                      <Select
                        value={asset.ownership}
                        onChange={(v) => onUpdateAsset(idx, { ownership: v as AssetEntry["ownership"] })}
                        options={[
                          { value: "primary", label: "Primary residence" },
                          { value: "investment", label: "Investment" },
                        ]}
                      />
                    </Field>
                    <Field label="Estimated value">
                      <Input value={asset.marketValue} onChange={(v) => onUpdateAsset(idx, { marketValue: v })} placeholder="525,000" prefix="$" />
                    </Field>
                    <Field label="Balance owed">
                      <Input value={asset.balanceOwed} onChange={(v) => onUpdateAsset(idx, { balanceOwed: v })} placeholder="280,000" prefix="$" />
                    </Field>
                  </div>
                  <IconBtn
                    onClick={() => onRemoveAsset(idx)}
                    title="Remove asset"
                    aria-label="Remove asset"
                    style={{ alignSelf: "start" }}
                  >
                    <Icon name="x" size={13} />
                  </IconBtn>
                </div>
              ))}
              <Btn onClick={onAddAsset} style={{ alignSelf: "flex-start" }}>
                <Icon name="plus" size={12} /> Add property
              </Btn>
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

function NumbersStepView({ form, update }: StepProps) {
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
        <div className="cg">
          <Field label="Listing price" required full>
            <Input value={form.salesPrice} onChange={(v) => update("salesPrice", v)} placeholder="485,000" prefix="$" />
          </Field>
        </div>
        <Note>
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
          <SectionHeader>
            {isReno ? "Acquisition" : "Purchase & banking"}
          </SectionHeader>
          <div className="cg">
            <Field label="Purchase price" required>
              <Input value={form.purchasePrice} onChange={(v) => update("purchasePrice", v)} placeholder="485,000" prefix="$" />
            </Field>
            <Field label="Deposit available">
              <Input value={form.depositAvailable} onChange={(v) => update("depositAvailable", v)} placeholder="125,000" prefix="$" />
            </Field>
          </div>
        </div>
      )}

      {/* PROGRAM-SPECIFIC inputs — what the simulator needs to size
          the loan beyond price + deposit. */}
      <div>
        <SectionHeader>
          {isRefi ? "Refinance terms" : "Loan terms"}
        </SectionHeader>
        <div className="cg">

          {/* DSCR refi: current value + payoff replace purchase price */}
          {isDscr && isRefi && (
            <>
              <Field label="Current as-is value" required>
                <Input value={form.currentValue} onChange={(v) => update("currentValue", v)} placeholder="500,000" prefix="$" />
              </Field>
              <Field label="Existing payoff" required>
                <Input value={form.payoff} onChange={(v) => update("payoff", v)} placeholder="320,000" prefix="$" />
              </Field>
            </>
          )}

          {/* DSCR (purchase or refi): monthly rent drives the DSCR calc */}
          {isDscr && (
            <Field label="Expected monthly rent" full={isRefi}>
              <Input value={form.expectedRent} onChange={(v) => update("expectedRent", v)} placeholder="3,650" prefix="$" />
            </Field>
          )}

          {/* F&F / GU purchase: ARV + rehab. BRV = purchase price above. */}
          {isReno && (
            <>
              <Field label="ARV (after-repair value)" required>
                <Input value={form.arv} onChange={(v) => update("arv", v)} placeholder="640,000" prefix="$" />
              </Field>
              <Field label="Rehab budget">
                <Input value={form.rehabBudget} onChange={(v) => update("rehabBudget", v)} placeholder="60,000" prefix="$" />
              </Field>
            </>
          )}

          {/* LTV / LTC selector — DSCR / Bridge use LTV; Reno uses LTC. */}
          {isReno ? (
            <Field label="Target LTC (%)">
              <Input value={form.targetLTC} onChange={(v) => update("targetLTC", v)} placeholder="85" suffix="%" />
            </Field>
          ) : (
            <Field label={`Target LTV (%) · cap ${isRefi ? "75" : "80"}%`}>
              <Input value={form.targetLTV} onChange={(v) => update("targetLTV", v)} placeholder={isRefi ? "70" : "75"} suffix="%" />
            </Field>
          )}
          <Field label="Base rate (%)">
            <Input value={form.baseRate} onChange={(v) => update("baseRate", v)} placeholder="7.500" suffix="%" />
          </Field>
        </div>
      </div>

      {/* Bridge purchase carries no extra fields beyond the banking
          block + LTV — the simulator sizes off purchase price × LTV. */}

      {/* Live readout — mirrors the simulator's eligibility chip */}
      <div className="card hi">
        <div className="lbl">
          Live calc · {isRefi ? "Refinance" : "Purchase"} · {LOAN_PROGRAM_LABELS[String(form.loanType)] ?? "—"}
        </div>
        <div className="row" style={{ gap: 18, alignItems: "baseline", marginTop: 8 }}>
          <div>
            <div className="lbl">Max loan</div>
            <div className="big num">
              {sim.maxLoan > 0 ? `$${Math.round(sim.maxLoan).toLocaleString("en-US")}` : "—"}
            </div>
          </div>
          <div>
            <div className="lbl">Binding cap</div>
            <b>{bindingConstraintLabel(sim.bindingConstraint)}</b>
          </div>
          {isDscr && sim.dscr != null && (
            <div>
              <div className="lbl">DSCR</div>
              <CellChip tone={sim.dscr >= 1.20 ? "ok" : sim.dscr >= 1.0 ? "warn" : "bad"}>
                {sim.dscr.toFixed(2)}x
              </CellChip>
            </div>
          )}
          {isDscr && sim.cashFlow != null && (
            <div>
              <div className="lbl">Cash flow / mo</div>
              <CellChip tone={sim.cashFlow >= 0 ? "ok" : "bad"}>
                ${Math.round(sim.cashFlow).toLocaleString("en-US")}
              </CellChip>
            </div>
          )}
          {isDscr && isRefi && sim.cashToBorrower != null && (
            <div>
              <div className="lbl">Cash to borrower</div>
              <CellChip tone={sim.cashToBorrower >= 0 ? "ok" : "warn"}>
                ${Math.round(sim.cashToBorrower).toLocaleString("en-US")}
              </CellChip>
            </div>
          )}
          <span className="sp" style={{ flex: 1 }} />
          <div>
            <div className="lbl">Rate</div>
            <b className="num">{sim.rate.toFixed(3)}%</b>
          </div>
        </div>
      </div>

      <Note>
        Type the numbers — operators tune precise terms on the loan detail
        after submit. Caps mirror the firm&apos;s underwriting matrix.
      </Note>
    </div>
  );
}

function CommunicationStepView({
  form,
  update,
  docOverrides,
  setDocOverrides,
  customDocs,
  setCustomDocs,
  previewItems,
  isBroker,
  collectionStartValue,
  setCollectionStartValue,
  collectionStartUnit,
  setCollectionStartUnit,
}: StepProps & {
  docOverrides: DocOverridesState;
  setDocOverrides: React.Dispatch<React.SetStateAction<DocOverridesState>>;
  customDocs: CustomDocDraft[];
  setCustomDocs: React.Dispatch<React.SetStateAction<CustomDocDraft[]>>;
  previewItems: DocChecklistItem[];
  isBroker: boolean;
  collectionStartValue: number;
  setCollectionStartValue: React.Dispatch<React.SetStateAction<number>>;
  collectionStartUnit: "days" | "hours";
  setCollectionStartUnit: React.Dispatch<React.SetStateAction<"days" | "hours">>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <DSNote>
        <Icon name="bolt" size={14} />
        <div>
          <b>How the AI should speak with this client</b>
          <div>
            These instructions guide your client-side AI only — the early-funnel relationship
            work. Once the client moves to <strong>Ready for Lending</strong>, the firm-wide
            Funding Team AI takes over for the lender packaging side.
          </div>
        </div>
      </DSNote>

      <div className="cg">
        <Field label="Preferred language">
          <Select
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
        <Field label="Preferred channel">
          {isBroker ? (
            <div className="field">App push only</div>
          ) : (
            <Select
              value={form.preferredChannel}
              onChange={(v) => update("preferredChannel", v as Channel)}
              options={[
                { value: "sms+email", label: "SMS + Email" },
                { value: "sms", label: "SMS only" },
                { value: "email", label: "Email only" },
                { value: "push", label: "App push only" },
              ]}
            />
          )}
        </Field>
        <Field label="Target close date" full>
          <Input
            type="date"
            value={form.targetCloseDate}
            onChange={(v) => update("targetCloseDate", v)}
          />
        </Field>
      </div>

      <Field label="Backstory / context">
        <textarea
          value={form.backstory}
          onChange={(e) => update("backstory", e.target.value)}
          placeholder="Anything the AI should know up-front — relocation timeline, family situation, prior agent, why they're transacting now…"
          className="field"
          style={TEXTAREA_STYLE}
          rows={3}
        />
      </Field>

      <Field label="AI speaking instructions">
        <textarea
          value={form.aiInstructions}
          onChange={(e) => update("aiInstructions", e.target.value)}
          placeholder="Keep messages short. Avoid jargon. Always copy me on first contact. Use a friendly, lower-pressure tone — they're nervous about timing."
          className="field"
          style={TEXTAREA_STYLE}
          rows={3}
        />
      </Field>

      <Note>
        Compliance: AI drafts for borrower-facing messages always require your approval.
        Forbidden phrasings (&quot;you are approved&quot;, &quot;guaranteed rate&quot;) are
        enforced at prompt level — these instructions can&apos;t override them.
      </Note>

      {/* Ownership + invite behavior (alembic 0029). assigned_owner_id
          blank → backend defaults to the creator. invite_behavior gates
          whether the Clerk invite fires at submit time. */}
      <div className="cg">
        <Field label="Assigned funding owner">
          <AgentPicker
            value={form.assignedOwnerId}
            onChange={(v) => update("assignedOwnerId", v)}
            filterRoles={[Role.SUPER_ADMIN, Role.LOAN_EXEC]}
            emptyLabel="Funding Team queue"
          />
        </Field>
        <Field label="Borrower app invite behavior">
          <Select
            value={form.inviteBehavior}
            onChange={(v) => update("inviteBehavior", v as InviteBehavior)}
            options={[
              { value: "send_immediately", label: "Send app invite immediately" },
              { value: "save_draft", label: "Save draft only" },
              { value: "send_after_review", label: "Send app invite after review" },
            ]}
          />
        </Field>
      </div>

      {isBroker && (
        <div>
          <Label>Start collecting</Label>
          <div className="row">
            <input
              className="field"
              type="number"
              min={0}
              aria-label="Delay before the AI starts collecting"
              value={collectionStartValue}
              onChange={(e) => setCollectionStartValue(Math.max(0, Number(e.target.value) || 0))}
              style={{ width: 80 }}
            />
            <Seg<"hours" | "days">
              ariaLabel="Delay unit"
              value={collectionStartUnit}
              onChange={setCollectionStartUnit}
              options={[
                { value: "hours", label: "Hours" },
                { value: "days", label: "Days" },
              ]}
            />
            <span className="sub">
              {collectionStartValue <= 0
                ? "Immediately when you create the file."
                : `Outreach starts ${collectionStartValue} ${collectionStartUnit} after file creation.`}
            </span>
          </div>
          <Note>
            Documents are still created now; the AI just waits to begin
            chasing them. Hours are converted to whole days.
          </Note>
        </div>
      )}

      <DocPreviewSection
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
  items,
  docOverrides,
  setDocOverrides,
  customDocs,
  setCustomDocs,
}: {
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
    <div className="card mt">
      <div className="lbl">Doc collection — preview</div>
      <div className="sub">
        The AI will request these {visibleCount} files from the borrower
        starting at deal kickoff. Toggle off anything you don&apos;t need
        for this deal. Edit due offsets if you want a tighter / looser
        cadence. Add custom rows for one-off items unique to this deal.
      </div>

      {items.length === 0 ? (
        <div className="sub mt">
          No checklist configured for this loan type yet — the AI will start with no
          default file list. Add custom rows below if you want to seed it.
        </div>
      ) : (
        <div className="mt">
          {items.map((item) => {
            const isSkipped = docOverrides.skipNames.has(item.name);
            const defaultOffset = item.due_offset_days ?? 3;
            const overrideValue = docOverrides.dueOverrides[item.name];
            const offsetValue = overrideValue ?? defaultOffset;
            return (
              // Dimming a skipped row is state, not decoration — it stays inline.
              <div key={item.name} className="filerow" style={{ opacity: isSkipped ? 0.55 : 1 }}>
                <input
                  type="checkbox"
                  checked={!isSkipped}
                  aria-label={`Collect ${item.display_name || item.name}`}
                  onChange={() => toggleSkip(item.name)}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ textDecoration: isSkipped ? "line-through" : "none" }}>
                    {item.display_name || item.name}
                  </b>
                  {item.type === "internal" && (
                    <div className="sub">internal · operator-ordered</div>
                  )}
                </div>
                <span className="sub">+</span>
                <input
                  className="field"
                  type="number"
                  min={0}
                  aria-label={`Due offset in days for ${item.display_name || item.name}`}
                  value={offsetValue}
                  onChange={(e) => setDueOverride(item.name, Number(e.target.value))}
                  disabled={isSkipped}
                  style={{ width: 56, textAlign: "center" }}
                />
                <span className="sub">d</span>
              </div>
            );
          })}
        </div>
      )}

      {customDocs.length > 0 && (
        <div className="mt">
          <div className="lbl">Custom — this deal only</div>
          {customDocs.map((c, idx) => (
            <div key={idx} className="filerow">
              <input
                className="field"
                value={c.name}
                aria-label="Custom document name"
                onChange={(e) => updateCustom(idx, { name: e.target.value })}
                placeholder="e.g. Notarized power of attorney"
                style={{ flex: 1 }}
              />
              <span className="sub">+</span>
              <input
                className="field"
                type="number"
                min={1}
                aria-label="Due offset in days"
                value={c.dueOffsetDays}
                onChange={(e) => updateCustom(idx, { dueOffsetDays: Number(e.target.value) || 7 })}
                style={{ width: 56, textAlign: "center" }}
              />
              <span className="sub">d</span>
              <IconBtn onClick={() => removeCustom(idx)} aria-label="Remove custom doc">
                <Icon name="x" size={11} />
              </IconBtn>
            </div>
          ))}
        </div>
      )}

      <Btn className="mt" onClick={addCustom}>
        <Icon name="plus" size={11} /> Add custom doc
      </Btn>
    </div>
  );
}

// ── Tiny form primitives ──────────────────────────────────────────
//
// These render the shared classes (`.lbl`, `.field`, `.sub`, `.btn`, `.pick`)
// rather than carrying a palette, so the `t` prop they all used to take is
// gone. The step views above still hold a `t` for the layout that has not
// moved yet — that is the remaining half of this file's migration.

function Field({ label, required, children, full }: { label: string; required?: boolean; children: ReactNode; full?: boolean }) {
  return (
    <div className={full ? "s12" : "s6"}>
      <div className="lbl" style={{ marginBottom: 6 }}>
        {label} {required && <span style={{ color: "var(--danger)" }}>*</span>}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="lbl" style={{ marginBottom: 8 }}>
      {children}
    </div>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontWeight: 700, marginBottom: 10, paddingBottom: 6, borderBottom: "1px solid var(--line)" }}>
      {children}
    </div>
  );
}

/** Two-up exclusive choice (buyer/seller, purchase/refinance). A pressed
 *  button, not a radio group — kept as it was so the click targets and the
 *  `active` contract are unchanged. */
function SideButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx("btn", active && "pri", "s6")}
      style={{ justifyContent: "center" }}
    >
      {children}
    </button>
  );
}

/** Hint line under a field — caption weight, NOT the `.note` callout. */
function Note({ children }: { children: ReactNode }) {
  return (
    <div className="sub" style={{ marginTop: 4 }}>
      {children}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  prefix,
  suffix,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  prefix?: string;
  suffix?: string;
  disabled?: boolean;
}) {
  // `.field` owns the box; the inner <input> is a bare text surface inside it
  // so the affix spans sit within the same border.
  return (
    <div
      className="field"
      style={{ display: "inline-flex", alignItems: "center", gap: 6, width: "100%", opacity: disabled ? 0.6 : 1 }}
    >
      {prefix && <span className="sub">{prefix}</span>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          flex: 1,
          minWidth: 0,
          padding: 0,
          background: "transparent",
          border: "none",
          font: "inherit",
          color: "inherit",
          outline: "none",
        }}
      />
      {suffix && <span className="sub">{suffix}</span>}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="field"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: "100%" }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  label,
  sub,
  value,
  onChange,
}: {
  label: string;
  sub?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cx("pick", value && "on")}
      style={{ width: "100%", textAlign: "left" }}
    >
      {/* The knob is a measured 38×22 track with a computed offset — genuinely
          dynamic geometry, so it stays inline. */}
      <div
        style={{
          width: 38,
          height: 22,
          borderRadius: 999,
          background: value ? "var(--accent)" : "var(--line2)",
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
        <b>{label}</b>
        {sub && <div className="sub">{sub}</div>}
      </div>
    </button>
  );
}

/** Textarea geometry only — the surface itself comes from `.field`. */
const TEXTAREA_STYLE: React.CSSProperties = {
  width: "100%",
  minHeight: 70,
  resize: "vertical",
  lineHeight: 1.5,
};
