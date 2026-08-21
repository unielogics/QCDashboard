"use client";

// Manual prequalification creation for brokers and funding operators. Mirrors the
// borrower-side PreQualRequestModal wizard (loan type, deal details,
// LTV math, F&F scope-of-work) but adds two broker/funding-team pieces:
//
//   1. Client linkage (mandatory). The operator either searches for an
//      existing client or creates one inline. The picked client_id
//      becomes the requester for the prequal — backend is responsible
//      for stamping requester_id from it.
//
//   2. Credit override panel. Manually-created prequals usually have
//      no ISoftPull on file, which would normally block the eligibility
//      math. The operator enters FICO + property count + year-of-ownership
//      so computeEligibility() unlocks the same tier-cap math the
//      borrower wizard uses. Override is per-prequal and persists on
//      the request row — it does NOT touch the Client's credit record.
//
// On submit, the new request lands as `pending` and is picked up by
// the existing admin queue + PrequalReviewModal — approve / regenerate
// PDF / accept-decline are unchanged from the borrower flow.
//
// ── Design-system migration note ──────────────────────────────────────
// Restyled onto globals.css/app-extras.css classes. The shell moved from
// RightPanel (a right-edge slide-in) to ds/Drawer (the one centred dialog
// shape), which is a strict superset of the behaviour: Escape-to-close and
// backdrop-click survive, and body scroll lock + focus-into-dialog +
// focus-restore-on-close are gained. Every control, callback, endpoint,
// validation gate and empty/loading/error/disabled state below is the same
// one that was here before — only the paint changed. Public props
// (`open`, `onClose`) are untouched.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  Btn,
  CG,
  Card,
  CellChip,
  Field,
  Input,
  Linky,
  Panel,
  Textarea,
  cx,
} from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import {
  useAdminCreateManualPrequal,
  useCreateClient,
} from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import {
  ClientSearchBlock,
  type ClientPickResult,
} from "@/components/ClientSearchBlock";
import { PrequalSowEditor } from "@/components/PrequalSowEditor";
import { computeEligibility } from "@/lib/eligibility";
import {
  type AddressParts,
  PREQUAL_LOAN_TYPE_LABELS,
  PREQUAL_LTV_CAPS,
  type PrequalLoanType,
  type PrequalSowLineItem,
} from "@/lib/types";

const FF_LTARV_CAP = 0.75;
const PRODUCT_OPTIONS: PrequalLoanType[] = [
  "dscr_purchase",
  "dscr_refi",
  "fix_flip",
  "bridge",
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AdminPrequalCreateModal({ open, onClose }: Props) {
  // Still read: ClientSearchBlock takes `t` as a prop and is not this
  // agent's file to change. Nothing else in here reads a token.
  const { t } = useTheme();
  const submit = useAdminCreateManualPrequal();
  const createClient = useCreateClient();

  // ── Client linkage state ──────────────────────────────────────────
  const [pickedClient, setPickedClient] = useState<ClientPickResult | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");

  // ── Credit override state ─────────────────────────────────────────
  const [overrideFicoText, setOverrideFicoText] = useState("");
  const [overridePropertyCountText, setOverridePropertyCountText] = useState("0");
  const [overrideOwnership, setOverrideOwnership] = useState(false);

  // ── Deal fields (mirrors borrower modal) ──────────────────────────
  const [loanType, setLoanType] = useState<PrequalLoanType>("dscr_purchase");
  const [address, setAddress] = useState("");
  const [addressParts, setAddressParts] = useState<AddressParts | null>(null);
  const [purchaseText, setPurchaseText] = useState("");
  const [loanText, setLoanText] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [notes, setNotes] = useState("");
  const [entityTBD, setEntityTBD] = useState(true);
  const [entityName, setEntityName] = useState("");
  const [arvText, setArvText] = useState("");
  const [sowItems, setSowItems] = useState<PrequalSowLineItem[]>([]);

  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [doneFlash, setDoneFlash] = useState(false);

  // Reset on open so stale values from a prior open don't leak.
  useEffect(() => {
    if (!open) return;
    setPickedClient(null);
    setCreateMode(false);
    setNewName("");
    setNewEmail("");
    setNewPhone("");
    setOverrideFicoText("");
    setOverridePropertyCountText("0");
    setOverrideOwnership(false);
    setLoanType("dscr_purchase");
    setAddress("");
    setAddressParts(null);
    setPurchaseText("");
    setLoanText("");
    setClosingDate("");
    setNotes("");
    setEntityTBD(true);
    setEntityName("");
    setArvText("");
    setSowItems([]);
    setStep(1);
    setError(null);
    setDoneFlash(false);
  }, [open]);

  const purchaseNum = Number(purchaseText.replace(/[^0-9.]/g, "")) || 0;
  const loanNum = Number(loanText.replace(/[^0-9.]/g, "")) || 0;
  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  // Standard LTV (loan / purchase) — used for DSCR purchase / refi /
  // bridge. For fix-and-flip we display loan/ARV instead since ARV is
  // the regulating value (see maxLoan + the LTV line below).
  const ltv = purchaseNum > 0 ? loanNum / purchaseNum : 0;

  const overrideFico = (() => {
    const n = Number(overrideFicoText);
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const overridePropertyCount = (() => {
    const n = Number(overridePropertyCountText);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  })();

  // Run eligibility against the override values (no real credit pull
  // exists for manually-created prequals). creditExpired is forced false
  // — the admin override is itself the verification.
  const eligibility = useMemo(
    () =>
      computeEligibility({
        fico: overrideFico,
        propertyCount: overridePropertyCount,
        hasYearOfOwnership: overrideOwnership,
        creditExpired: false,
      }),
    [overrideFico, overridePropertyCount, overrideOwnership],
  );

  const programCap = PREQUAL_LTV_CAPS[loanType];
  const tierCap = eligibility.maxLTV;
  // tierCap of 0 means blocked. We still let the admin enter numbers
  // (so they see the LTV line), but submit is gated on a non-zero cap.
  const tierConstrained = tierCap > 0 && tierCap < programCap;
  const effectiveCap = tierCap > 0 ? Math.min(programCap, tierCap) : programCap;
  const isFixFlip = loanType === "fix_flip";

  const totalConstruction = sowItems.reduce(
    (sum, item) => sum + (Number(item.total_usd) || 0),
    0,
  );
  const allInBasis = purchaseNum + totalConstruction;

  // Max loan is regulated by ARV for fix-and-flip — the lender caps
  // the loan at FF_LTARV_CAP (75%) of the After Repair Value, not the
  // BRV (purchase price). For DSCR purchase / refi / bridge the cap
  // still applies to purchase price (the standard LTV math).
  //
  // For F&F we ALSO honor the LTC ceiling (loan-to-cost on all-in
  // basis) since some lenders use both — final cap is the lower of
  // the two. ARV-based number is the binding constraint in practice.
  const maxLoan = isFixFlip
    ? (() => {
        if (arvNum <= 0) return 0;
        const arvCap = arvNum * FF_LTARV_CAP;
        const ltcCap = allInBasis > 0 ? allInBasis * effectiveCap : Infinity;
        return Math.min(arvCap, ltcCap);
      })()
    : purchaseNum > 0 ? purchaseNum * effectiveCap : 0;

  // The "loan / regulating value" ratio shown in the LTV line. For
  // fix-and-flip this is loan/ARV (the binding constraint); for
  // everything else it's the standard loan/purchase LTV.
  const displayLtvRatio = isFixFlip
    ? (arvNum > 0 ? loanNum / arvNum : 0)
    : ltv;
  const displayLtvCap = isFixFlip ? FF_LTARV_CAP : effectiveCap;
  const ltvOverCap = displayLtvRatio > displayLtvCap + 1e-6;

  // All-in basis vs ARV — fix-and-flip "project viability" check.
  // Surfaced separately on the F&F SOW step.
  const ltarv = arvNum > 0 ? allInBasis / arvNum : 0;
  const ltarvOverCap = ltarv > FF_LTARV_CAP + 1e-6;

  const overrideValid = overrideFico != null && overrideFico >= 300 && overrideFico <= 850 && tierCap > 0;
  const clientLinked = !!pickedClient;
  const step1Valid =
    clientLinked &&
    overrideValid &&
    address.trim().length >= 3 &&
    purchaseNum > 0 &&
    loanNum > 0 &&
    (!isFixFlip || arvNum > 0);
  const formValid = isFixFlip ? step1Valid && sowItems.length > 0 : step1Valid;

  const onLinkNewClient = async () => {
    setError(null);
    if (newName.trim().length < 2) {
      setError("Client name is required.");
      return;
    }
    try {
      const created = await createClient.mutateAsync({
        name: newName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        stage: "lead",
      });
      setPickedClient({
        id: created.id,
        name: created.name,
        email: created.email,
        phone: created.phone,
      });
      setCreateMode(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create client.");
    }
  };

  const onSubmit = async () => {
    setError(null);
    if (!formValid || !pickedClient || !overrideFico) {
      setError(
        isFixFlip
          ? "Please link a client, set a valid FICO override, and complete address, BRV, ARV, requested loan, and at least one SOW line."
          : "Please link a client, set a valid FICO override, and complete address, purchase price, and requested loan amount.",
      );
      return;
    }
    try {
      await submit.mutateAsync({
        client_id: pickedClient.id,
        target_property_address: address.trim(),
        purchase_price: purchaseNum,
        requested_loan_amount: loanNum,
        loan_type: loanType,
        expected_closing_date: closingDate || null,
        borrower_notes: notes.trim() || null,
        borrower_entity: entityTBD ? null : (entityName.trim() || null),
        arv_estimate: isFixFlip ? arvNum : null,
        sow_items: isFixFlip ? sowItems : null,
        manual_credit_override: {
          fico: overrideFico,
          property_count: overridePropertyCount,
          has_year_of_ownership: overrideOwnership,
        },
      });
      setDoneFlash(true);
      setTimeout(() => onClose(), 1200);
    } catch (e) {
      // 405 Method Not Allowed / 404 Not Found here means the qcbackend
      // production deploy is older than commit 778dad9 — POST handler
      // for /admin/prequal-requests + alembic 0036 (client_id +
      // manual_credit_override columns) haven't shipped yet. Surface
      // a clear "deploy the backend" message instead of a generic
      // retry prompt so the operator knows it isn't a data error.
      if (e instanceof ApiError && (e.status === 405 || e.status === 404)) {
        setError(
          "Manual prequal isn't live on the backend yet. Trigger a qcbackend deploy and run alembic upgrade head, then retry.",
        );
        return;
      }
      setError(e instanceof Error ? e.message : "Submission failed — please retry.");
    }
  };

  // `.drawer-f` is a left-aligned flex row, so Back sits first and `.sp`
  // (flex: 1) pushes Cancel + the primary to the right edge — the same
  // arrangement `marginRight: auto` produced in the old footer.
  const footer = doneFlash ? null : (
    <>
      {isFixFlip && step === 2 ? (
        <Btn onClick={() => setStep(1)}>← Back</Btn>
      ) : null}
      <span className="sp" />
      <Btn onClick={onClose}>Cancel</Btn>
      {isFixFlip && step === 1 ? (
        <Btn
          variant="pri"
          onClick={() => {
            if (!step1Valid) {
              setError("Complete client linkage, FICO override, address, BRV, ARV, and requested loan before continuing.");
              return;
            }
            setError(null);
            setStep(2);
          }}
          disabled={!step1Valid}
        >
          Continue → Scope of Work
        </Btn>
      ) : (
        <Btn
          variant="pri"
          onClick={onSubmit}
          disabled={!formValid || submit.isPending}
        >
          {submit.isPending ? "Submitting…" : "Submit prequalification"}
        </Btn>
      )}
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Create prequalification"
      sub="Manual prequalification — the request lands in the funding queue as pending."
      width="md"
      footer={footer}
    >
      {doneFlash ? (
        <Card style={{ textAlign: "center" }}>
          <CellChip tone="ok">
            <Icon name="check" size={11} stroke={3} /> Created
          </CellChip>
          <h3 className="mt">Pending review</h3>
          <p className="sub mt">
            The new prequalification is in the queue. The funding team can
            approve it and generate the letter PDF.
          </p>
        </Card>
      ) : (
        <>
          {/* Step indicator (F&F only, since non-F&F is a single page). */}
          {isFixFlip ? (
            <DrawerSteps steps={["Client + deal", "Scope of work"]} current={step} />
          ) : null}

          <CG>
            {step === 1 ? (
              <>
                {/* ── Client linkage ─────────────────────────────────── */}
                <Panel className="s12" title="Client (required)">
                  {pickedClient ? (
                    <div className="pick on">
                      <Icon name="check" size={12} stroke={3} />
                      <div>
                        <b>{pickedClient.name}</b>
                        <div className="sub">
                          {pickedClient.email ?? "—"}
                          {pickedClient.phone ? ` · ${pickedClient.phone}` : ""}
                        </div>
                      </div>
                      <span className="sp" />
                      <Btn size="sm" onClick={() => setPickedClient(null)}>
                        Change
                      </Btn>
                    </div>
                  ) : createMode ? (
                    <CG>
                      <div className="row s12">
                        <span className="sub">New client</span>
                        <span className="sp" />
                        <Btn size="sm" onClick={() => setCreateMode(false)}>
                          ← Search instead
                        </Btn>
                      </div>
                      <TextField className="s12" label="Name" value={newName} onChange={setNewName} placeholder="Marcus Holloway" />
                      <TextField className="s6" label="Email" value={newEmail} onChange={setNewEmail} placeholder="marcus@holloway.cap" type="email" />
                      <TextField className="s6" label="Phone" value={newPhone} onChange={setNewPhone} placeholder="(917) 555-0148" />
                      <div className="s12">
                        <Btn
                          variant="pri"
                          onClick={onLinkNewClient}
                          disabled={createClient.isPending || newName.trim().length < 2}
                        >
                          {createClient.isPending ? "Creating…" : "Save & link"}
                        </Btn>
                      </div>
                    </CG>
                  ) : (
                    <CG>
                      <div className="s12">
                        <ClientSearchBlock
                          t={t}
                          label="Search by name or email"
                          onPick={(c) => setPickedClient(c)}
                        />
                      </div>
                      <div className="s12">
                        <Btn onClick={() => setCreateMode(true)}>+ Create new client</Btn>
                      </div>
                    </CG>
                  )}
                </Panel>

                {/* ── Credit override ────────────────────────────────── */}
                <Panel className="s12" title="Credit override">
                  <CG>
                    <p className="sub s12">
                      Manually-created prequals usually don&apos;t have a soft pull on file.
                      Set the FICO + portfolio context here so the LTV math unlocks. The
                      override persists on this prequal only.
                    </p>
                    <TextField
                      className="s6"
                      label="FICO (300–850)"
                      value={overrideFicoText}
                      onChange={setOverrideFicoText}
                      placeholder="720"
                      inputMode="numeric"
                    />
                    <TextField
                      className="s6"
                      label="Property count"
                      value={overridePropertyCountText}
                      onChange={setOverridePropertyCountText}
                      placeholder="0"
                      inputMode="numeric"
                    />
                    <div className="s12">
                      <label className={cx("pick", overrideOwnership && "on")}>
                        <input
                          type="checkbox"
                          checked={overrideOwnership}
                          onChange={(e) => setOverrideOwnership(e.target.checked)}
                        />
                        Has 1+ year of property ownership
                      </label>
                    </div>

                    <div className="s12">
                      {eligibility.banner ? (
                        <StatusLine tone={eligibility.tier === "blocked" ? "bad" : "warn"}>
                          <b>{eligibility.banner.title}</b> — {eligibility.banner.body}
                        </StatusLine>
                      ) : (
                        <CellChip tone="ok">
                          Tier {eligibility.tier} · max LTV {Math.round(tierCap * 100)}%
                        </CellChip>
                      )}
                    </div>
                  </CG>
                </Panel>

                {/* ── Loan program ───────────────────────────────────── */}
                <Panel className="s12" title="Loan program">
                  <CG>
                    {PRODUCT_OPTIONS.map((id) => {
                      const meta = PREQUAL_LOAN_TYPE_LABELS[id];
                      const active = loanType === id;
                      const progCap = PREQUAL_LTV_CAPS[id];
                      const optEffective = tierCap > 0 ? Math.min(progCap, tierCap) : progCap;
                      const optTierBound = tierCap > 0 && tierCap < progCap;
                      return (
                        // Wrapped so `.pick + .pick` (a 7px stacking margin)
                        // cannot fire between grid cells and knock the row
                        // out of alignment.
                        <div className="s6" key={id}>
                          <label className={cx("pick", active && "on")}>
                            <input
                              type="radio"
                              name="qc-manual-prequal-loan-type"
                              value={id}
                              checked={active}
                              onChange={() => setLoanType(id)}
                            />
                            <div>
                              <b>{meta.title}</b>
                              <div className="sub">{meta.sub}</div>
                              <div className="lbl">
                                Max LTV {Math.round(optEffective * 100)}%
                              </div>
                              {optTierBound ? (
                                <CellChip tone="warn">tier-capped</CellChip>
                              ) : null}
                            </div>
                          </label>
                        </div>
                      );
                    })}
                  </CG>
                </Panel>

                {/* ── Deal details ───────────────────────────────────── */}
                <Panel className="s12" title="Deal details">
                  <CG>
                    <div className="s12">
                      <GoogleAddressInput
                        value={addressParts}
                        onChange={(next) => {
                          setAddressParts(next);
                          setAddress(formatAddressParts(next));
                        }}
                        label="Target property address"
                        helperText="Search Google and select the property, or use manual entry if the address is not listed."
                      />
                    </div>

                    <TextField
                      className="s6"
                      label={
                        loanType === "dscr_refi"
                          ? "Estimated property value"
                          : isFixFlip
                            ? "Purchase price (BRV)"
                            : "Estimated purchase price"
                      }
                      value={purchaseText}
                      onChange={setPurchaseText}
                      placeholder="400000"
                      inputMode="numeric"
                    />

                    {/* The "Max …" affordance moved from the label row into
                        the field hint. Same one-click fill of the computed
                        ceiling, same conditional on maxLoan > 0. */}
                    <Field
                      className="s6"
                      label="Requested loan amount"
                      hint={
                        maxLoan > 0 ? (
                          <Linky onClick={() => setLoanText(String(Math.round(maxLoan)))}>
                            Max {QC_FMT.usd(maxLoan, 0)}
                          </Linky>
                        ) : undefined
                      }
                    >
                      <Input
                        value={loanText}
                        onChange={(e) => setLoanText(e.target.value)}
                        placeholder="320000"
                        inputMode="numeric"
                      />
                    </Field>

                    {isFixFlip ? (
                      <TextField
                        className="s6"
                        label="Estimated ARV (After Repair Value)"
                        value={arvText}
                        onChange={setArvText}
                        placeholder="600000"
                        inputMode="numeric"
                      />
                    ) : null}

                    {((isFixFlip ? arvNum : purchaseNum) > 0 && loanNum > 0) ? (
                      <div className="s12">
                        <StatusLine tone={ltvOverCap ? "bad" : "ok"}>
                          {isFixFlip ? "Requested LTARV" : "Requested LTV"} {(displayLtvRatio * 100).toFixed(1)}% ·{" "}
                          {ltvOverCap
                            ? `over ${Math.round(displayLtvCap * 100)}% cap${!isFixFlip && tierConstrained ? " (tier)" : ""} — adjust loan${isFixFlip ? " or ARV" : " or override"}`
                            : `within ${Math.round(displayLtvCap * 100)}% cap${!isFixFlip && tierConstrained ? " (tier-adjusted)" : ""}`}
                        </StatusLine>
                      </div>
                    ) : null}

                    <TextField
                      className="s6"
                      label="Expected closing date"
                      value={closingDate}
                      onChange={setClosingDate}
                      type="date"
                    />

                    {/* Entity: the TBD toggle and the "issues to the legal
                        name" consequence now read as one sentence on the
                        checkbox instead of a separate dashed hint box. */}
                    <div className="s12">
                      <label className={cx("pick", entityTBD && "on")}>
                        <input
                          type="checkbox"
                          checked={entityTBD}
                          onChange={(e) => setEntityTBD(e.target.checked)}
                        />
                        <span>
                          <b>LLC / entity TBD — not formed yet.</b>{" "}
                          <span className="sub">
                            Letter will issue to the client&apos;s individual legal name.
                          </span>
                        </span>
                      </label>
                    </div>

                    {!entityTBD ? (
                      <TextField
                        className="s12"
                        label="LLC / entity name"
                        value={entityName}
                        onChange={setEntityName}
                        placeholder="e.g. Riverside Holdings LLC"
                      />
                    ) : null}

                    <Field
                      className="s12"
                      label="Borrower notes (optional)"
                      hint={`${notes.length}/500 characters`}
                    >
                      <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                        placeholder="Captured during phone intake, reference docs, special instructions for the underwriter…"
                        rows={3}
                        // `.field` sets no resize rule; left vertical so a
                        // dragged textarea cannot widen the drawer column.
                        style={{ resize: "vertical" }}
                      />
                    </Field>
                  </CG>
                </Panel>
              </>
            ) : null}

            {isFixFlip && step === 2 ? (
              <Panel className="s12" title="Scope of work">
                <p className="sub">
                  Add a row for each major rehab category. The total drives the
                  project-viability check ({Math.round(FF_LTARV_CAP * 100)}% of ARV cap on BRV +
                  construction).
                </p>

                <div className="mt">
                  <PrequalSowEditor items={sowItems} onChange={setSowItems} />
                </div>

                {arvNum > 0 && allInBasis > 0 ? (
                  <div className="mt">
                    <StatusLine tone={ltarvOverCap ? "bad" : "ok"}>
                      All-in basis {QC_FMT.usd(allInBasis, 0)} ÷ ARV {QC_FMT.usd(arvNum, 0)} = {(ltarv * 100).toFixed(1)}% ·{" "}
                      {ltarvOverCap
                        ? `over ${Math.round(FF_LTARV_CAP * 100)}% project cap`
                        : `within ${Math.round(FF_LTARV_CAP * 100)}% project cap`}
                    </StatusLine>
                  </div>
                ) : null}
              </Panel>
            ) : null}

            {error ? (
              <div className="s12">
                <StatusLine tone="bad" role="alert">
                  {error}
                </StatusLine>
              </div>
            ) : null}
          </CG>
        </>
      )}
    </Drawer>
  );
}

/**
 * Sentence-length status block.
 *
 * `.c-ok` / `.c-warn` / `.c-bad` own the tint and the text colour; the inline
 * values are box geometry only, because the sheet carries no block-level
 * status surface and `.cellchip` is `white-space: nowrap` — these run to a
 * sentence. Same pattern as settings/page.tsx and rates/page.tsx.
 */
function StatusLine({
  tone,
  role,
  children,
}: {
  tone: "ok" | "warn" | "bad";
  role?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`c-${tone}`}
      role={role}
      style={{ borderRadius: 8, padding: "8px 11px", fontSize: 12.5, fontWeight: 620, lineHeight: 1.45 }}
    >
      {children}
    </div>
  );
}

/** Label + text input, stacked. `.lbl` + `.field` carry the paint. */
function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
  className,
}: {
  label: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "email" | "date";
  inputMode?: "text" | "numeric";
  className?: string;
}) {
  return (
    <Field label={label} className={className}>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
      />
    </Field>
  );
}
