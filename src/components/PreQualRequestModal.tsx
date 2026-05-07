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
import { useSubmitPrequalRequest } from "@/hooks/useApi";
import type { PrequalLoanType } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  // Optional pre-fills — used when the modal is opened from a loan-detail
  // page (so the borrower doesn't retype fields we already know).
  loanId?: string;
  initialAddress?: string;
  initialLoanType?: PrequalLoanType;
}

const LTV_CAPS: Record<PrequalLoanType, number> = { dscr: 0.8, bridge: 0.85 };

export function PreQualRequestModal({
  open,
  onClose,
  loanId,
  initialAddress,
  initialLoanType,
}: Props) {
  const { t } = useTheme();
  const submit = useSubmitPrequalRequest();

  const [loanType, setLoanType] = useState<PrequalLoanType>(initialLoanType ?? "dscr");
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
  const [error, setError] = useState<string | null>(null);
  const [doneFlash, setDoneFlash] = useState(false);

  // Reset on open so the form doesn't carry stale values across opens.
  useEffect(() => {
    if (open) {
      setLoanType(initialLoanType ?? "dscr");
      setAddress(initialAddress ?? "");
      setPurchaseText("");
      setLoanText("");
      setClosingDate("");
      setNotes("");
      setEntityTBD(true);
      setEntityName("");
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
  const ltv = purchaseNum > 0 ? loanNum / purchaseNum : 0;
  const cap = LTV_CAPS[loanType];
  const ltvOverCap = ltv > cap + 1e-6;

  const formValid =
    address.trim().length >= 3 &&
    purchaseNum > 0 &&
    loanNum > 0;

  const onSubmit = async () => {
    setError(null);
    if (!formValid) {
      setError("Please fill in property address, purchase price, and requested loan amount.");
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
              today's matrix and your credit profile.
            </div>

            {/* Loan type */}
            <Card pad={16}>
              <SectionLabel>Loan program</SectionLabel>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {(
                  [
                    { id: "dscr" as const,   title: "DSCR Rental",   sub: "30-yr fixed · long-term hold" },
                    { id: "bridge" as const, title: "Bridge",        sub: "Short-term · purchase / value-add" },
                  ]
                ).map((opt) => {
                  const active = loanType === opt.id;
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setLoanType(opt.id)}
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
                      <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{opt.title}</span>
                      <span style={{ fontSize: 11, color: t.ink2, lineHeight: 1.35 }}>{opt.sub}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: t.ink3, marginTop: 2, letterSpacing: 0.6, textTransform: "uppercase" }}>
                        Max LTV {Math.round(LTV_CAPS[opt.id] * 100)}%
                      </span>
                    </button>
                  );
                })}
              </div>
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
                  label="Estimated purchase price"
                  value={purchaseText}
                  onChange={setPurchaseText}
                  placeholder="400000"
                  inputMode="numeric"
                />
                <Field
                  t={t}
                  label="Requested loan amount"
                  value={loanText}
                  onChange={setLoanText}
                  placeholder="320000"
                  inputMode="numeric"
                />
              </div>

              {/* Live LTV pill — informational. */}
              {purchaseNum > 0 && loanNum > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <Pill
                    bg={ltvOverCap ? t.dangerBg : t.profitBg}
                    color={ltvOverCap ? t.danger : t.profit}
                  >
                    Requested LTV {(ltv * 100).toFixed(1)}% ·{" "}
                    {ltvOverCap
                      ? `over ${Math.round(cap * 100)}% cap — underwriter will adjust`
                      : `within ${Math.round(cap * 100)}% cap`}
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

            {error ? (
              <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
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
