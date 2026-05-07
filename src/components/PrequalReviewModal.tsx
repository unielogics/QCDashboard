"use client";

// Underwriter-side review of a borrower's pre-qualification request.
// Right-side panel. Top section is read-only (borrower's submission
// verbatim). Editable fields: approved_purchase_price, approved_loan_amount,
// admin_notes (visible to borrower). Live LTV check against the matrix
// cap; Approve disabled when over.
//
// Approve → backend renders PDF + uploads to S3 + flips status.
// Reject  → backend flips status with the admin_notes as reason.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  useApprovePrequalRequest,
  useRejectPrequalRequest,
} from "@/hooks/useApi";
import type { PrequalLoanType, PrequalRequest } from "@/lib/types";

const LTV_CAPS: Record<PrequalLoanType, number> = { dscr: 0.8, bridge: 0.85 };

interface Props {
  open: boolean;
  onClose: () => void;
  request: PrequalRequest | null;
  // Optional FICO context for the underwriter (most recent valid pull).
  // Pass null when not available.
  borrowerFico?: number | null;
}

export function PrequalReviewModal({ open, onClose, request, borrowerFico }: Props) {
  const { t } = useTheme();
  const approve = useApprovePrequalRequest();
  const reject = useRejectPrequalRequest();

  const [purchaseText, setPurchaseText] = useState("");
  const [loanText, setLoanText] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  // Re-seed every time we open the modal with a new request.
  useEffect(() => {
    if (!open || !request) return;
    const seedPurchase =
      request.approved_purchase_price ?? request.purchase_price;
    const seedLoan =
      request.approved_loan_amount ?? request.requested_loan_amount;
    setPurchaseText(String(Math.round(Number(seedPurchase))));
    setLoanText(String(Math.round(Number(seedLoan))));
    setNotes(request.admin_notes ?? "");
    setError(null);
    setConfirmReject(false);
  }, [open, request]);

  // Esc closes
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || !request) return null;

  const purchaseNum = Number(purchaseText.replace(/[^0-9.]/g, "")) || 0;
  const loanNum = Number(loanText.replace(/[^0-9.]/g, "")) || 0;
  const ltv = purchaseNum > 0 ? loanNum / purchaseNum : 0;
  const cap = LTV_CAPS[request.loan_type];
  const ltvOverCap = ltv > cap + 1e-6;
  const canApprove =
    purchaseNum > 0 &&
    loanNum > 0 &&
    !ltvOverCap &&
    request.status !== "approved" &&
    !approve.isPending;

  const onApprove = async () => {
    setError(null);
    try {
      await approve.mutateAsync({
        requestId: request.id,
        payload: {
          approved_purchase_price: purchaseNum,
          approved_loan_amount: loanNum,
          admin_notes: notes.trim() || null,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed.");
    }
  };

  const onReject = async () => {
    setError(null);
    if (!notes.trim() || notes.trim().length < 3) {
      setError("Rejection requires a reason in the Underwriter notes field — the borrower will see it.");
      return;
    }
    try {
      await reject.mutateAsync({
        requestId: request.id,
        payload: { admin_notes: notes.trim() },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reject failed.");
    }
  };

  const programLabel =
    request.loan_type === "dscr" ? "DSCR Rental (30-yr fixed)" : "Bridge / Purchase";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review pre-qualification request"
      style={{ position: "fixed", inset: 0, background: "rgba(6, 7, 11, 0.55)", backdropFilter: "blur(2px)", zIndex: 200 }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: "min(640px, 95vw)",
          background: t.bg,
          boxShadow: t.shadowLg,
          borderTopLeftRadius: 18,
          borderBottomLeftRadius: 18,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: `1px solid ${t.line}` }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              Pre-qualification review
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              {request.target_property_address}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ all: "unset", cursor: "pointer", width: 32, height: 32, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 8, color: t.ink2 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ flex: "1 1 auto", overflowY: "auto", padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Borrower's submission — read-only */}
          <Card pad={16} style={{ background: t.surface2 }}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
              Borrower's request
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12.5, color: t.ink2, fontFeatureSettings: '"tnum"' }}>
              <ReadRow t={t} label="Program" value={programLabel} />
              <ReadRow t={t} label="Status" value={request.status} accent={
                request.status === "approved" ? t.profit :
                request.status === "rejected" ? t.danger : t.warn
              } />
              <ReadRow t={t} label="Requested purchase" value={QC_FMT.usd(Number(request.purchase_price), 0)} />
              <ReadRow t={t} label="Requested loan" value={QC_FMT.usd(Number(request.requested_loan_amount), 0)} />
              <ReadRow t={t} label="Requested LTV" value={
                Number(request.purchase_price) > 0
                  ? `${((Number(request.requested_loan_amount) / Number(request.purchase_price)) * 100).toFixed(1)}%`
                  : "—"
              } />
              <ReadRow t={t} label="Expected closing" value={
                request.expected_closing_date
                  ? new Date(request.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                  : "—"
              } />
              {borrowerFico != null ? (
                <ReadRow t={t} label="Borrower FICO" value={String(borrowerFico)} accent={borrowerFico >= 680 ? t.profit : t.warn} />
              ) : null}
              <ReadRow t={t} label="Matrix cap" value={`${Math.round(cap * 100)}% LTV`} />
            </div>
            {request.borrower_notes ? (
              <div style={{ marginTop: 12, padding: "10px 12px", borderLeft: `3px solid ${t.brand}`, background: t.bg, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
                <strong style={{ color: t.ink }}>Borrower notes:</strong> {request.borrower_notes}
              </div>
            ) : null}
          </Card>

          {/* Editable approval fields */}
          <Card pad={16}>
            <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
              Underwriter authorization
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <Field
                t={t}
                label="Approved purchase price"
                value={purchaseText}
                onChange={setPurchaseText}
                hint="Edit if the borrower's number doesn't match the appraised market value."
              />
              <Field
                t={t}
                label="Approved loan amount"
                value={loanText}
                onChange={setLoanText}
                hint="Lower this to bring the LTV under the matrix cap."
              />
            </div>

            <div style={{ marginTop: 6 }}>
              <Pill bg={ltvOverCap ? t.dangerBg : t.profitBg} color={ltvOverCap ? t.danger : t.profit}>
                LTV {(ltv * 100).toFixed(1)}% ·{" "}
                {ltvOverCap
                  ? `over ${Math.round(cap * 100)}% cap — lower the loan amount`
                  : `within ${Math.round(cap * 100)}% cap — OK to approve`}
              </Pill>
            </div>

            <div style={{ height: 12 }} />
            <Textarea
              t={t}
              label="Underwriter notes (visible to borrower)"
              value={notes}
              onChange={setNotes}
              placeholder="e.g. Capped at 75% LTV per today's matrix. Call me if you need to discuss."
            />
          </Card>

          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
            {confirmReject ? (
              <button
                onClick={onReject}
                disabled={reject.isPending}
                style={{
                  ...qcBtnPrimary(t),
                  background: t.danger,
                  opacity: reject.isPending ? 0.5 : 1,
                }}
              >
                {reject.isPending ? "Rejecting…" : "Confirm reject"}
              </button>
            ) : (
              <button
                onClick={() => setConfirmReject(true)}
                style={{ ...qcBtn(t), color: t.danger, borderColor: `${t.danger}40` }}
              >
                Reject
              </button>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
              <button
                onClick={onApprove}
                disabled={!canApprove}
                style={{
                  ...qcBtnPrimary(t),
                  opacity: canApprove ? 1 : 0.5,
                  cursor: canApprove ? "pointer" : "not-allowed",
                }}
              >
                {approve.isPending ? "Generating PDF…" : "Approve & Generate PDF"}
              </button>
            </div>
          </div>

          {request.status === "approved" && request.pdf_url ? (
            <div style={{ marginTop: 4, fontSize: 12, color: t.ink3 }}>
              Already approved.{" "}
              <a href={request.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: t.petrol, fontWeight: 700 }}>
                Open the current letter →
              </a>{" "}
              · re-clicking Approve will regenerate the PDF with any new numbers.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ReadRow({
  t,
  label,
  value,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent ?? t.ink, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function Field({
  t,
  label,
  value,
  onChange,
  hint,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
          fontFeatureSettings: '"tnum"',
          outline: "none",
          boxSizing: "border-box",
        }}
      />
      {hint ? <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 4 }}>{hint}</div> : null}
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
        onChange={(e) => onChange(e.target.value.slice(0, 1000))}
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
          minHeight: 70,
        }}
      />
    </div>
  );
}
