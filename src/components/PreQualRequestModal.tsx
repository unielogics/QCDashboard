"use client";

// Borrower-facing pre-qualification request form. Right-side panel (mirrors
// CreditPullModal). On submit, hits the backend; backend either attaches
// to an existing loan at the same property or spawns a Loan stub so the
// operator pipeline picks it up.
//
// LTV cap is shown live (informational only) — backend doesn't reject on
// submit; the underwriter is the one bound by the matrix.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useMyCredit, useCreditSummary, useSubmitPrequalRequest } from "@/hooks/useApi";
import {
  PREQUAL_LOAN_TYPE_LABELS,
  PREQUAL_LTV_CAPS,
  type PrequalLoanType,
  type PrequalSowLineItem,
} from "@/lib/types";
import { PrequalSowEditor } from "./PrequalSowEditor";

// F&F project-viability cap: BRV + total construction must be ≤ this
// fraction of ARV. Industry standard ~75%; the borrower sees a live
// pill when their numbers blow through it.
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
  const { t } = useTheme();
  const submit = useSubmitPrequalRequest();
  // Pull the borrower's current credit + summary so we can derive the
  // tier_max_ltv ceiling. If they haven't run credit yet, summary stays
  // null and we fall back to the program LTV cap only.
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);

  const [loanType, setLoanType] = useState<PrequalLoanType>(initialLoanType ?? "dscr_purchase");
  const [address, setAddress] = useState(initialAddress ?? "");
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

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Request pre-qualification letter"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(580px, 95vw)",
          background: t.bg,
          boxShadow: t.shadowLg,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "18px 24px",
            borderBottom: `1px solid ${t.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              Underwriter review · async
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              Request Pre-Qualification
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{ all: "unset", cursor: "pointer", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, color: t.ink2 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        {doneFlash ? (
          <div style={{ padding: 28, flex: 1 }}>
            <Card pad={28}>
              <div style={{ textAlign: "center" }}>
                <Pill bg={t.profitBg} color={t.profit}>
                  <Icon name="check" size={11} stroke={3} /> Submitted
                </Pill>
                <div style={{ marginTop: 14, fontSize: 16, fontWeight: 700, color: t.ink }}>
                  Under review
                </div>
                <div style={{ marginTop: 8, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
                  An underwriter will review your request and either approve with a
                  signed letter or send back notes. You'll see the status update
                  here when they're done.
                </div>
              </div>
            </Card>
          </div>
        ) : (
          <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "20px 24px 28px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 13.5, color: t.ink2, lineHeight: 1.55 }}>
              Pre-qualification letters are issued by an underwriter — never
              auto-generated. Submit your request and we'll review against
              today&apos;s matrix and your credit profile.
            </div>

            {/* F&F gets a 2-step flow: Step 1 collects the deal
                fundamentals (BRV / ARV / loan ask). Step 2 collects
                the scope-of-work line items so the system can run
                LTARV math. Other products stay single-step. */}
            {isFixFlip ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: t.ink3 }}>
                <span style={{ color: step === 1 ? t.brand : t.ink3 }}>1 · Deal fundamentals</span>
                <span style={{ color: t.ink4 }}>›</span>
                <span style={{ color: step === 2 ? t.brand : t.ink4 }}>2 · Scope of work</span>
              </div>
            ) : null}

            {step === 1 ? (
            <>

            {/* Loan type */}
            <Card pad={16}>
              <SectionLabel>Loan program</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
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
                    <button
                      key={id}
                      onClick={() => setLoanType(id)}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: 12,
                        borderRadius: 12,
                        border: `1.5px solid ${active ? t.brand : t.line}`,
                        background: active ? t.brandSoft : t.surface2,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{meta.title}</span>
                      <span style={{ fontSize: 11, color: t.ink2, lineHeight: 1.35 }}>{meta.sub}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: optTierBound ? t.warn : t.ink3, marginTop: 2, letterSpacing: 0.6, textTransform: "uppercase" }}>
                        Max LTV {Math.round(optEffective * 100)}%
                        {optTierBound ? " · tier-capped" : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
              {tierMaxLtv != null && tierMaxLtv > 0 ? (
                <div style={{ marginTop: 10, fontSize: 11, color: t.ink3, lineHeight: 1.45 }}>
                  Your credit profile{creditSummary?.tier ? ` (${creditSummary.tier} tier)` : ""}{" "}
                  caps leverage at <strong style={{ color: t.ink2 }}>{Math.round((tierMaxLtv as number) * 100)}% LTV</strong>{" "}
                  across all programs. Programs whose ceiling is higher use the tier number.
                </div>
              ) : tierMaxLtv != null && tierMaxLtv === 0 ? (
                <div style={{ marginTop: 10, fontSize: 11, color: t.danger, lineHeight: 1.45 }}>
                  Your credit profile is currently blocked from new commercial financing.
                  An underwriter will follow up on next steps.
                </div>
              ) : (
                <div style={{ marginTop: 10, fontSize: 11, color: t.ink3, lineHeight: 1.45 }}>
                  Caps shown are the program ceiling. Once your credit pull is on file
                  we&apos;ll show your tier-adjusted maximum here.
                </div>
              )}
            </Card>

            {/* Property + numbers */}
            <Card pad={16}>
              <SectionLabel>Deal details</SectionLabel>
              <Field
                t={t}
                label="Target property address"
                value={address}
                onChange={setAddress}
                placeholder="123 Main St, Anytown, NJ 07026"
              />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field
                  t={t}
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
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                      Requested loan amount
                    </span>
                    {maxLoan > 0 ? (
                      <button
                        type="button"
                        onClick={() => setLoanText(String(Math.round(maxLoan)))}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: t.petrol,
                          letterSpacing: 0.4,
                        }}
                      >
                        Max {QC_FMT.usd(maxLoan, 0)}
                      </button>
                    ) : null}
                  </div>
                  <input
                    value={loanText}
                    onChange={(e) => setLoanText(e.target.value)}
                    placeholder="320000"
                    inputMode="numeric"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 9,
                      background: t.surface2,
                      border: `1px solid ${t.line}`,
                      color: t.ink,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              {/* F&F-only: Estimated ARV (After Repair Value). Lives
                  on Step 1 alongside BRV so the borrower sees the
                  delta before they're walked into Scope of Work. */}
              {isFixFlip ? (
                <>
                  <div style={{ height: 10 }} />
                  <Field
                    t={t}
                    label="Estimated ARV (After Repair Value)"
                    value={arvText}
                    onChange={setArvText}
                    placeholder="600000"
                    inputMode="numeric"
                  />
                </>
              ) : null}

              {/* Live LTV pill — informational. */}
              {purchaseNum > 0 && loanNum > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <Pill
                    bg={ltvOverCap ? t.dangerBg : t.profitBg}
                    color={ltvOverCap ? t.danger : t.profit}
                  >
                    Requested LTV {(ltv * 100).toFixed(1)}% ·{" "}
                    {ltvOverCap
                      ? `over ${Math.round(effectiveCap * 100)}% cap${tierConstrained ? " (tier)" : ""} — underwriter will adjust`
                      : `within ${Math.round(effectiveCap * 100)}% cap${tierConstrained ? " (tier-adjusted)" : ""}`}
                  </Pill>
                </div>
              ) : null}

              <div style={{ height: 10 }} />
              <Field
                t={t}
                label="Expected closing date"
                value={closingDate}
                onChange={setClosingDate}
                type="date"
              />

              <div style={{ height: 10 }} />
              {/* LLC / entity name. TBD toggle stores null — underwriter
                  can fill it in later, or the letter falls back to the
                  borrower's individual legal name. */}
              <div>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 5,
                }}>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                    LLC / entity name
                  </span>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 11.5, color: t.ink2 }}>
                    <input
                      type="checkbox"
                      checked={entityTBD}
                      onChange={(e) => setEntityTBD(e.target.checked)}
                      style={{ accentColor: t.brand }}
                    />
                    TBD — I haven&apos;t formed the LLC yet
                  </label>
                </div>
                {!entityTBD ? (
                  <input
                    type="text"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    placeholder="e.g. Riverside Holdings LLC"
                    style={{
                      width: "100%",
                      padding: "10px 12px",
                      borderRadius: 9,
                      background: t.surface2,
                      border: `1px solid ${t.line}`,
                      color: t.ink,
                      fontSize: 13,
                      fontFamily: "inherit",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div style={{
                    fontSize: 11.5,
                    color: t.ink3,
                    background: t.surface2,
                    border: `1px dashed ${t.line}`,
                    borderRadius: 9,
                    padding: "8px 12px",
                    lineHeight: 1.4,
                  }}>
                    Letter will be issued to your individual legal name. The
                    underwriter can re-issue under your LLC once it&apos;s formed.
                  </div>
                )}
              </div>

              <div style={{ height: 10 }} />
              <Textarea
                t={t}
                label="Borrower notes (optional)"
                value={notes}
                onChange={setNotes}
                placeholder="e.g. Need this letter by Friday EOD to submit my offer."
              />
            </Card>

            </>
            ) : null}

            {/* Step 2 — F&F Scope of Work editor. Hidden on Step 1
                and on non-F&F products. */}
            {isFixFlip && step === 2 ? (
              <Card pad={16}>
                <SectionLabel>Scope of work</SectionLabel>
                <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
                  Add a row for each major rehab category. The total
                  here drives our project-viability check ({Math.round(FF_LTARV_CAP * 100)}% of ARV cap on
                  BRV + construction). The list isn&apos;t shown on the
                  printed letter — sellers continue to see only the
                  Negotiation-Shield version.
                </div>

                <PrequalSowEditor
                  items={sowItems}
                  onChange={setSowItems}
                />

                {/* Live LTARV pill — informational. */}
                {arvNum > 0 && allInBasis > 0 ? (
                  <div style={{ marginTop: 12 }}>
                    <Pill
                      bg={ltarvOverCap ? t.dangerBg : t.profitBg}
                      color={ltarvOverCap ? t.danger : t.profit}
                    >
                      All-in basis {QC_FMT.usd(allInBasis, 0)} ÷ ARV {QC_FMT.usd(arvNum, 0)} = {(ltarv * 100).toFixed(1)}% ·{" "}
                      {ltarvOverCap
                        ? `over ${Math.round(FF_LTARV_CAP * 100)}% project cap — underwriter will review`
                        : `within ${Math.round(FF_LTARV_CAP * 100)}% project cap`}
                    </Pill>
                  </div>
                ) : null}
              </Card>
            ) : null}

            {error ? (
              <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill>
            ) : null}

            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div>
                {isFixFlip && step === 2 ? (
                  <button onClick={() => setStep(1)} style={qcBtn(t)}>
                    ← Back
                  </button>
                ) : null}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
                {isFixFlip && step === 1 ? (
                  <button
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
                    style={{
                      ...qcBtnPrimary(t),
                      opacity: !step1Valid ? 0.5 : 1,
                      cursor: !step1Valid ? "not-allowed" : "pointer",
                    }}
                  >
                    Continue → Scope of Work
                  </button>
                ) : (
                  <button
                    onClick={onSubmit}
                    disabled={!formValid || submit.isPending}
                    style={{
                      ...qcBtnPrimary(t),
                      opacity: !formValid || submit.isPending ? 0.5 : 1,
                      cursor: !formValid || submit.isPending ? "not-allowed" : "pointer",
                    }}
                  >
                    {submit.isPending ? "Submitting…" : "Submit for review"}
                  </button>
                )}
              </div>
            </div>

            <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.4 }}>
              Submitting just opens an underwriter review — no loan file is
              created yet. Once approved, you&apos;ll download the letter, present
              the offer, and report back here whether the seller accepted.
              That&apos;s when the deal moves into the pipeline.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  t,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  inputMode,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "date";
  inputMode?: "text" | "numeric";
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 9,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

function Textarea({
  t,
  label,
  value,
  onChange,
  placeholder,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, 500))}
        placeholder={placeholder}
        rows={3}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 9,
          background: t.surface2,
          border: `1px solid ${t.line}`,
          color: t.ink,
          fontSize: 13,
          fontFamily: "inherit",
          outline: "none",
          boxSizing: "border-box",
          resize: "vertical",
          minHeight: 60,
        }}
      />
      <div style={{ fontSize: 10, color: t.ink4, marginTop: 4, textAlign: "right" }}>
        {value.length}/500
      </div>
    </div>
  );
}

