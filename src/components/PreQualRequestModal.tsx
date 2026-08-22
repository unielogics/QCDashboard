"use client";

// Borrower-facing pre-qualification request form. On submit, hits the
// backend; backend either attaches to an existing loan at the same property
// or spawns a Loan stub so the operator pipeline picks it up.
//
// LTV cap is shown live (informational only) — backend doesn't reject on
// submit; the underwriter is the one bound by the matrix.
//
// ── Design-system migration note ──────────────────────────────────────
// Restyled onto globals.css/app-extras.css classes, matching the admin twin
// (AdminPrequalCreateModal) so the two sides of the same form read as one
// object. The shell moved from a hand-rolled right-edge overlay to ds/Drawer
// (the one centred dialog shape). Behaviour is a strict superset of what was
// here: Escape-to-close survives, and body scroll lock + focus-into-dialog +
// focus-restore-on-close are gained.
//
// One deliberate exception to Drawer's defaults: `closeOnBackdrop={false}`.
// The old scrim was inert, and this is a long typed form — taking the default
// would add a brand-new way for a borrower to lose everything they entered by
// mis-clicking. Escape (which was already here) and Cancel remain the ways out.
//
// Every control, callback, hook, validation gate, tier conditional and
// empty/loading/error/disabled state below is the one that was here before —
// only the paint changed. Public props (`open`, `onClose`, `loanId`,
// `initialAddress`, `initialLoanType`) are untouched.

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
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
import { useMyCredit, useCreditSummary, useSubmitPrequalRequest } from "@/hooks/useApi";
import {
  PREQUAL_LOAN_TYPE_LABELS,
  PREQUAL_LTV_CAPS,
  type AddressParts,
  type PrequalLoanType,
  type PrequalSowLineItem,
} from "@/lib/types";
import { PrequalSowEditor } from "./PrequalSowEditor";

// F&F project-viability cap: BRV + total construction must be ≤ this
// fraction of ARV. Industry standard ~75%; the borrower sees a live
// status line when their numbers blow through it.
const FF_LTARV_CAP = 0.75;

interface Props {
  open: boolean;
  onClose: () => void;
  // Optional pre-fills — used when the modal is opened from a loan-detail
  // page (so the borrower doesn't retype fields we already know).
  loanId?: string;
  initialAddress?: string;
  initialLoanType?: PrequalLoanType;
}

// Aliases — the source of truth lives in lib/types.ts so backend +
// review modal + this form stay aligned.
const LTV_CAPS = PREQUAL_LTV_CAPS;
const PRODUCT_OPTIONS: PrequalLoanType[] = ["dscr_purchase", "dscr_refi", "fix_flip", "bridge"];

export function PreQualRequestModal({
  open,
  onClose,
  loanId,
  initialAddress,
  initialLoanType,
}: Props) {
  const submit = useSubmitPrequalRequest();
  // Pull the borrower's current credit + summary so we can derive the
  // tier_max_ltv ceiling. If they haven't run credit yet, summary stays
  // null and we fall back to the program LTV cap only.
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);

  const [loanType, setLoanType] = useState<PrequalLoanType>(initialLoanType ?? "dscr_purchase");
  const [address, setAddress] = useState(initialAddress ?? "");
  const [addressParts, setAddressParts] = useState<AddressParts | null>(
    initialAddress ? { street: initialAddress, full: initialAddress } : null,
  );
  const [purchaseText, setPurchaseText] = useState("");
  const [loanText, setLoanText] = useState("");
  const [closingDate, setClosingDate] = useState("");
  const [notes, setNotes] = useState("");
  // LLC / entity name on the letter. The TBD toggle stores null on the
  // request; the underwriter can fill it in later when the borrower has
  // formed the entity, or the letter prints to the individual's name.
  const [entityTBD, setEntityTBD] = useState(true);
  const [entityName, setEntityName] = useState("");
  // F&F-specific: ARV (After Repair Value) + scope-of-work line items.
  // Only collected when loan_type === "fix_flip"; the form gains a
  // second step where the borrower lists category / description /
  // total $. Sum of line items = total construction. Validated
  // against (BRV + total_construction) ≤ ARV × FF_LTARV_CAP.
  const [arvText, setArvText] = useState("");
  const [sowItems, setSowItems] = useState<PrequalSowLineItem[]>([]);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState<string | null>(null);
  const [doneFlash, setDoneFlash] = useState(false);

  // Reset on open so the form doesn't carry stale values across opens.
  useEffect(() => {
    if (open) {
      setLoanType(initialLoanType ?? "dscr_purchase");
      setAddress(initialAddress ?? "");
      setAddressParts(initialAddress ? { street: initialAddress, full: initialAddress } : null);
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
    }
  }, [open, initialAddress, initialLoanType]);

  // Esc closes — now owned by Drawer, which also locks body scroll and
  // returns focus to whatever opened the dialog.

  if (!open) return null;

  const purchaseNum = Number(purchaseText.replace(/[^0-9.]/g, "")) || 0;
  const loanNum = Number(loanText.replace(/[^0-9.]/g, "")) || 0;
  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  const ltv = purchaseNum > 0 ? loanNum / purchaseNum : 0;
  // Effective cap = the tighter of the program ceiling and the
  // borrower's tier ceiling. tier_max_ltv comes from /credit/summary
  // (e.g. blocked → 0, basic/warn → 65%, pro → 75%); see
  // backend services/credit_summary.py:tier_max_ltv. Falls back to the
  // program cap when no credit summary is available.
  const programCap = LTV_CAPS[loanType];
  const tierMaxLtv = creditSummary?.tier_max_ltv ?? null;
  const tierConstrained = tierMaxLtv != null && tierMaxLtv > 0 && tierMaxLtv < programCap;
  const effectiveCap = tierConstrained ? (tierMaxLtv as number) : programCap;
  const maxLoan = purchaseNum > 0 ? purchaseNum * effectiveCap : 0;
  const ltvOverCap = ltv > effectiveCap + 1e-6;
  const isFixFlip = loanType === "fix_flip";

  // F&F project-viability math (only meaningful when loan_type=fix_flip).
  // Underwriting cares about (BRV + total_construction) / ARV ≤ cap —
  // this protects against deals where rehab + purchase eat too much
  // of the projected post-repair value.
  const totalConstruction = sowItems.reduce(
    (sum, item) => sum + (Number(item.total_usd) || 0),
    0,
  );
  const allInBasis = purchaseNum + totalConstruction;
  const ltarv = arvNum > 0 ? allInBasis / arvNum : 0;
  const ltarvOverCap = ltarv > FF_LTARV_CAP + 1e-6;

  // Step 1 validity (Loan program, address, BRV, requested loan,
  // and for F&F also ARV).
  const step1Valid =
    address.trim().length >= 3 &&
    purchaseNum > 0 &&
    loanNum > 0 &&
    (!isFixFlip || arvNum > 0);

  // For F&F the user must also have at least one SOW line on step 2
  // before submitting. For non-F&F the form submits straight from
  // step 1 (step state stays at 1).
  const formValid = isFixFlip ? step1Valid && sowItems.length > 0 : step1Valid;

  const onSubmit = async () => {
    setError(null);
    if (!formValid) {
      setError(
        isFixFlip
          ? "Please fill in address, purchase price (BRV), ARV, requested loan, and at least one Scope of Work line."
          : "Please fill in property address, purchase price, and requested loan amount.",
      );
      return;
    }
    try {
      await submit.mutateAsync({
        loanId,
        payload: {
          target_property_address: address.trim(),
          purchase_price: purchaseNum,
          requested_loan_amount: loanNum,
          loan_type: loanType,
          expected_closing_date: closingDate || null,
          borrower_notes: notes.trim() || null,
          // Null on TBD — underwriter fills in or letter falls back to
          // the borrower's individual legal name.
          borrower_entity: entityTBD ? null : (entityName.trim() || null),
          // F&F-only fields. Backend ignores them on non-F&F loan types.
          arv_estimate: isFixFlip ? arvNum : null,
          sow_items: isFixFlip ? sowItems : null,
        },
      });
      setDoneFlash(true);
      setTimeout(() => onClose(), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed — please retry.");
    }
  };

  // `.drawer-f` is a left-aligned flex row, so Back sits first and `.sp`
  // (flex: 1) pushes Cancel + the primary to the right edge — the same
  // space-between arrangement the old inline footer produced.
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
              setError(
                "Please fill in address, BRV, ARV, and requested loan amount before continuing.",
              );
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
          {submit.isPending ? "Submitting…" : "Submit for review"}
        </Btn>
      )}
    </>
  );

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Request Pre-Qualification"
      sub="Underwriter review · async. Pre-qualification letters are issued by an underwriter — never auto-generated. Submit your request and we'll review against today's matrix and your credit profile."
      width="md"
      closeOnBackdrop={false}
      footer={footer}
    >
      {doneFlash ? (
        <Card style={{ textAlign: "center" }}>
          <CellChip tone="ok">
            <Icon name="check" size={11} stroke={3} /> Submitted
          </CellChip>
          <h3 className="mt">Under review</h3>
          <p className="sub mt">
            An underwriter will review your request and either approve with a
            signed letter or send back notes. You&apos;ll see the status update
            here when they&apos;re done.
          </p>
        </Card>
      ) : (
        <>
          {/* F&F gets a 2-step flow: Step 1 collects the deal
              fundamentals (BRV / ARV / loan ask). Step 2 collects
              the scope-of-work line items so the system can run
              LTARV math. Other products stay single-step. */}
          {isFixFlip ? (
            <DrawerSteps steps={["Deal fundamentals", "Scope of work"]} current={step} />
          ) : null}

          <CG>
            {step === 1 ? (
              <>
                {/* ── Loan program ───────────────────────────────────── */}
                <Panel className="s12" title="Loan program">
                  <CG>
                    {PRODUCT_OPTIONS.map((id) => {
                      const meta = PREQUAL_LOAN_TYPE_LABELS[id];
                      const active = loanType === id;
                      // Per-option effective cap = min(program cap, tier cap).
                      // When the tier is the binding constraint we annotate it
                      // so the borrower understands why the cap is lower than
                      // the program advertises.
                      const progCap = LTV_CAPS[id];
                      const optEffective = tierConstrained ? Math.min(progCap, tierMaxLtv as number) : progCap;
                      const optTierBound = tierConstrained && (tierMaxLtv as number) < progCap;
                      return (
                        // Wrapped so `.pick + .pick` (a 7px stacking margin)
                        // cannot fire between grid cells and knock the row
                        // out of alignment.
                        <div className="s6" key={id}>
                          <label className={cx("pick", active && "on")}>
                            <input
                              type="radio"
                              name="qc-prequal-request-loan-type"
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

                    <div className="s12">
                      {tierMaxLtv != null && tierMaxLtv > 0 ? (
                        <p className="sub">
                          Your credit profile{creditSummary?.tier ? ` (${creditSummary.tier} tier)` : ""}{" "}
                          caps leverage at <b>{Math.round((tierMaxLtv as number) * 100)}% LTV</b>{" "}
                          across all programs. Programs whose ceiling is higher use the tier number.
                        </p>
                      ) : tierMaxLtv != null && tierMaxLtv === 0 ? (
                        <StatusLine tone="bad">
                          Your credit profile is currently blocked from new commercial financing.
                          An underwriter will follow up on next steps.
                        </StatusLine>
                      ) : (
                        <p className="sub">
                          Caps shown are the program ceiling. Once your credit pull is on file
                          we&apos;ll show your tier-adjusted maximum here.
                        </p>
                      )}
                    </div>
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

                    {/* F&F-only: Estimated ARV (After Repair Value). Lives
                        on Step 1 alongside BRV so the borrower sees the
                        delta before they're walked into Scope of Work. */}
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

                    {/* Live LTV line — informational. */}
                    {purchaseNum > 0 && loanNum > 0 ? (
                      <div className="s12">
                        <StatusLine tone={ltvOverCap ? "bad" : "ok"}>
                          Requested LTV {(ltv * 100).toFixed(1)}% ·{" "}
                          {ltvOverCap
                            ? `over ${Math.round(effectiveCap * 100)}% cap${tierConstrained ? " (tier)" : ""} — underwriter will adjust`
                            : `within ${Math.round(effectiveCap * 100)}% cap${tierConstrained ? " (tier-adjusted)" : ""}`}
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

                    {/* LLC / entity name. The TBD toggle stores null, and the
                        "issues to your legal name" consequence now reads as one
                        sentence on the checkbox instead of a separate dashed
                        hint box below it. */}
                    <div className="s12">
                      <label className={cx("pick", entityTBD && "on")}>
                        <input
                          type="checkbox"
                          checked={entityTBD}
                          onChange={(e) => setEntityTBD(e.target.checked)}
                        />
                        <span>
                          <b>LLC / entity TBD — I haven&apos;t formed the LLC yet.</b>{" "}
                          <span className="sub">
                            Letter will be issued to your individual legal name. The
                            underwriter can re-issue under your LLC once it&apos;s formed.
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
                        placeholder="e.g. Need this letter by Friday EOD to submit my offer."
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

            {/* Step 2 — F&F Scope of Work editor. Hidden on Step 1
                and on non-F&F products. */}
            {isFixFlip && step === 2 ? (
              <Panel className="s12" title="Scope of work">
                <p className="sub">
                  Add a row for each major rehab category. The total
                  here drives our project-viability check ({Math.round(FF_LTARV_CAP * 100)}% of ARV cap on
                  BRV + construction). The list isn&apos;t shown on the
                  printed letter — sellers continue to see only the
                  Negotiation-Shield version.
                </p>

                <div className="mt">
                  <PrequalSowEditor items={sowItems} onChange={setSowItems} />
                </div>

                {/* Live LTARV line — informational. */}
                {arvNum > 0 && allInBasis > 0 ? (
                  <div className="mt">
                    <StatusLine tone={ltarvOverCap ? "bad" : "ok"}>
                      All-in basis {QC_FMT.usd(allInBasis, 0)} ÷ ARV {QC_FMT.usd(arvNum, 0)} = {(ltarv * 100).toFixed(1)}% ·{" "}
                      {ltarvOverCap
                        ? `over ${Math.round(FF_LTARV_CAP * 100)}% project cap — underwriter will review`
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

            <p className="sub s12">
              Submitting just opens an underwriter review — no loan file is
              created yet. Once approved, you&apos;ll download the letter, present
              the offer, and report back here whether the seller accepted.
              That&apos;s when the deal moves into the pipeline.
            </p>
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
 * sentence. Same pattern as AdminPrequalCreateModal, settings and rates.
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
  type?: "text" | "date";
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
