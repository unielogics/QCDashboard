"use client";

// Underwriter-side review of a borrower's pre-qualification request.
// Full-screen overlay (not a side panel) — the underwriter needs room
// to run a calculator scenario alongside the borrower's submission.
//
// Layout:
//   ┌──── Header (property, borrower, status) ────────────┐
//   │  Left column           │   Right column            │
//   │  - Borrower submission │  - Approval fields        │
//   │  - Calculator scenario │    (purchase, loan, LTV,  │
//   │    (product-aware)     │     LLC, expiration days, │
//   │                        │     underwriter notes)    │
//   │                        │  - Approve / Reject       │
//   └─────────────────────────────────────────────────────┘
//
// Calculator output is saved to approved_scenario (JSONB on the request)
// so the PDF and the spawned-on-acceptance Loan can both read from it
// without the underwriter retyping.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  useApprovePrequalRequest,
  useRejectPrequalRequest,
} from "@/hooks/useApi";
import {
  PREQUAL_LOAN_TYPE_LABELS,
  PREQUAL_LTV_CAPS,
  type PrequalRequest,
  type PrequalSowLineItem,
} from "@/lib/types";
import { PrequalSowEditor } from "./PrequalSowEditor";

// F&F project-viability cap — keep in sync with the borrower form.
const FF_LTARV_CAP = 0.75;

const LTV_CAPS = PREQUAL_LTV_CAPS;
const DEFAULT_EXPIRATION_DAYS = 90;

// DSCR variants share calculator inputs (rate/rent/taxes/ins/HOA →
// P&I/NOI/DSCR). F&F + Bridge share the short-term IO calc (rate/term/
// points → monthly interest, fee, IR estimate).
function isDscrLike(loanType: string): boolean {
  return loanType === "dscr_purchase" || loanType === "dscr_refi";
}

interface Props {
  open: boolean;
  onClose: () => void;
  request: PrequalRequest | null;
  // Optional FICO context for the underwriter (most recent valid pull).
  borrowerFico?: number | null;
}

// ── Calculator math ─────────────────────────────────────────────────────
//
// DSCR scenario (30-yr fixed): given purchase, loan, rate%, monthly rent,
// taxes/ins/HOA — compute monthly P&I and DSCR ratio.
//
// Bridge scenario: short-term IO. Given purchase, loan, rate%, term
// months, points% — compute monthly interest, total points, interest
// reserve estimate.

function pmt(rateMonthly: number, nper: number, principal: number): number {
  if (rateMonthly <= 0) return principal / nper;
  const r = rateMonthly;
  return (principal * r) / (1 - Math.pow(1 + r, -nper));
}

interface DscrInputs { rate: number; termMonths: number; rent: number; taxes: number; insurance: number; hoa: number; }
interface DscrOutputs { monthlyPI: number; monthlyExpenses: number; noi: number; dscr: number; }
function computeDscr(loan: number, i: DscrInputs): DscrOutputs {
  const monthlyPI = pmt(i.rate / 100 / 12, i.termMonths, loan);
  // For DSCR we use property NOI (rent − tax/ins/hoa) over P&I.
  const monthlyExpenses = i.taxes / 12 + i.insurance / 12 + i.hoa;
  const noi = i.rent - monthlyExpenses;
  const debtService = monthlyPI;
  const dscr = debtService > 0 ? noi / debtService : 0;
  return { monthlyPI, monthlyExpenses, noi, dscr };
}

interface BridgeInputs { rate: number; termMonths: number; points: number; }
interface BridgeOutputs { monthlyInterest: number; totalPoints: number; interestReserve: number; }
function computeBridge(loan: number, i: BridgeInputs): BridgeOutputs {
  const monthlyInterest = (loan * (i.rate / 100)) / 12;
  const totalPoints = loan * (i.points / 100);
  // Simple interest reserve: 6 months of interest if term > 6mo, else full term.
  const reserveMonths = Math.min(6, Math.max(0, i.termMonths));
  const interestReserve = monthlyInterest * reserveMonths;
  return { monthlyInterest, totalPoints, interestReserve };
}

export function PrequalReviewModal({ open, onClose, request, borrowerFico }: Props) {
  const { t } = useTheme();
  const approve = useApprovePrequalRequest();
  const reject = useRejectPrequalRequest();

  // ── Approval fields ───────────────────────────────────────────────────
  const [purchaseText, setPurchaseText] = useState("");
  const [loanText, setLoanText] = useState("");
  const [notes, setNotes] = useState("");
  const [entityTBD, setEntityTBD] = useState(true);
  const [entityName, setEntityName] = useState("");
  const [expirationText, setExpirationText] = useState(String(DEFAULT_EXPIRATION_DAYS));

  // ── Calculator inputs (product-aware) ─────────────────────────────────
  const [calcRate, setCalcRate] = useState("7.625");
  const [calcTerm, setCalcTerm] = useState("360");
  const [calcRent, setCalcRent] = useState("");
  const [calcTaxes, setCalcTaxes] = useState("");
  const [calcInsurance, setCalcInsurance] = useState("");
  const [calcHoa, setCalcHoa] = useState("0");
  const [calcPoints, setCalcPoints] = useState("1.0");

  // F&F-only — admin overrides for ARV + SOW. Seeded from the request
  // so re-approvals carry the previous edits forward.
  const [arvText, setArvText] = useState("");
  const [sowItems, setSowItems] = useState<PrequalSowLineItem[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);

  // Re-seed every time we open the modal with a new request.
  useEffect(() => {
    if (!open || !request) return;
    const seedPurchase = request.approved_purchase_price ?? request.purchase_price;
    const seedLoan = request.approved_loan_amount ?? request.requested_loan_amount;
    setPurchaseText(String(Math.round(Number(seedPurchase))));
    setLoanText(String(Math.round(Number(seedLoan))));
    setNotes(request.admin_notes ?? "");
    // LLC seed: prefer existing on the request; otherwise show TBD.
    const existingEntity = request.borrower_entity ?? "";
    setEntityTBD(!existingEntity);
    setEntityName(existingEntity);
    setExpirationText(String(DEFAULT_EXPIRATION_DAYS));
    // Calculator seed: pull from approved_scenario if the underwriter
    // already saved one (re-approval flow). Otherwise sensible defaults.
    const sc = (request.approved_scenario ?? {}) as Record<string, unknown>;
    setCalcRate(String(sc.rate ?? (isDscrLike(request.loan_type) ? 7.625 : 11.0)));
    setCalcTerm(String(sc.term_months ?? (isDscrLike(request.loan_type) ? 360 : 12)));
    setCalcRent(String(sc.rent ?? ""));
    setCalcTaxes(String(sc.taxes_annual ?? ""));
    setCalcInsurance(String(sc.insurance_annual ?? ""));
    setCalcHoa(String(sc.hoa_monthly ?? 0));
    setCalcPoints(String(sc.points ?? 1.0));
    // F&F seed — prefer admin overrides on re-approval, fall back to
    // borrower-submitted values, then to empty.
    const seedArv = request.approved_arv ?? request.arv_estimate ?? null;
    setArvText(seedArv != null ? String(Math.round(Number(seedArv))) : "");
    setSowItems(
      Array.isArray(request.sow_items)
        ? request.sow_items.map((item) => ({
            category: String(item?.category ?? ""),
            description: String(item?.description ?? ""),
            total_usd: Number(item?.total_usd ?? 0) || 0,
          }))
        : [],
    );
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

  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;

  const purchaseNum = num(purchaseText);
  const loanNum = num(loanText);
  // F&F gets ARV-based LTV (loan / ARV) — project is sized against
  // the after-repair value, not the as-is BRV. Other products use
  // the standard loan / purchase math. Without this branch the F&F
  // pill shows nonsense like 352% when you finance $300K against an
  // $85K BRV that's projected to $450K ARV.
  const isFixFlip = request?.loan_type === "fix_flip";
  const arvNumLive =
    isFixFlip
      ? num(arvText) || (request?.approved_arv ?? request?.arv_estimate ?? 0)
      : 0;
  const ltvBasis = isFixFlip ? Number(arvNumLive) : purchaseNum;
  const ltv = ltvBasis > 0 ? loanNum / ltvBasis : 0;
  const cap = request ? (LTV_CAPS[request.loan_type] ?? 0) : 0;
  const ltvOverCap = ltv > cap + 1e-6;
  const expirationNum = Math.max(1, Math.min(365, num(expirationText) || DEFAULT_EXPIRATION_DAYS));

  // Build the scenario JSON snapshot the calculator outputs. Backend
  // stores this on approved_scenario; the spawned Loan reads from it on
  // borrower-accepted-offer.
  const scenario = useMemo(() => {
    if (!request) return null;
    if (isDscrLike(request.loan_type)) {
      const out = computeDscr(loanNum, {
        rate: num(calcRate),
        termMonths: num(calcTerm) || 360,
        rent: num(calcRent),
        taxes: num(calcTaxes),
        insurance: num(calcInsurance),
        hoa: num(calcHoa),
      });
      return {
        loan_type: request.loan_type,
        rate: num(calcRate),
        term_months: num(calcTerm) || 360,
        rent: num(calcRent),
        taxes_annual: num(calcTaxes),
        insurance_annual: num(calcInsurance),
        hoa_monthly: num(calcHoa),
        ltv,
        monthly_pi: out.monthlyPI,
        monthly_expenses: out.monthlyExpenses,
        noi: out.noi,
        dscr: out.dscr,
      };
    }
    // Fix & Flip + Bridge share the short-term IO calculator.
    const out = computeBridge(loanNum, {
      rate: num(calcRate),
      termMonths: num(calcTerm) || 12,
      points: num(calcPoints),
    });
    return {
      loan_type: request.loan_type,
      rate: num(calcRate),
      term_months: num(calcTerm) || 12,
      points: num(calcPoints),
      ltv,
      monthly_interest: out.monthlyInterest,
      total_points: out.totalPoints,
      interest_reserve: out.interestReserve,
    };
  }, [request, loanNum, ltv, calcRate, calcTerm, calcRent, calcTaxes, calcInsurance, calcHoa, calcPoints]);

  if (!open || !request) return null;

  // Editable statuses:
  //   pending        — first-time approval (button: "Approve & Generate PDF")
  //   approved       — re-issue with edited values (button: "Save changes & regenerate PDF")
  //   offer_accepted — borrower already accepted; admin can still
  //                    correct the printed letter. Status stays put,
  //                    spawned Loan is unaffected (label: "Save changes & regenerate PDF")
  // Non-editable: rejected (resubmit instead) and offer_declined (deal is dead).
  const isEditableStatus =
    request.status === "pending" ||
    request.status === "approved" ||
    request.status === "offer_accepted";
  const canApprove =
    purchaseNum > 0 &&
    loanNum > 0 &&
    !ltvOverCap &&
    isEditableStatus &&
    !approve.isPending;
  const isReissue = request.status === "approved" || request.status === "offer_accepted";
  const approveLabel = (() => {
    if (approve.isPending) return isReissue ? "Regenerating PDF…" : "Generating PDF…";
    if (request.status === "offer_accepted") return "Save changes & regenerate letter";
    if (request.status === "approved") return "Save changes & regenerate PDF";
    return "Approve & Generate PDF";
  })();

  const onApprove = async () => {
    setError(null);
    try {
      const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
      const totalConstruction = sowItems.reduce(
        (sum, item) => sum + (Number(item.total_usd) || 0),
        0,
      );
      await approve.mutateAsync({
        requestId: request.id,
        payload: {
          approved_purchase_price: purchaseNum,
          approved_loan_amount: loanNum,
          admin_notes: notes.trim() || null,
          approved_scenario: scenario,
          expiration_days: expirationNum,
          borrower_entity: entityTBD ? null : (entityName.trim() || null),
          // F&F-only overrides — backend ignores them on non-F&F.
          approved_arv: !isDscrLike(request.loan_type) && request.loan_type === "fix_flip" && arvNum > 0 ? arvNum : null,
          approved_sow_items: request.loan_type === "fix_flip" && sowItems.length > 0 ? sowItems : null,
          approved_total_construction: request.loan_type === "fix_flip" && totalConstruction > 0 ? totalConstruction : null,
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

  const programLabel = (() => {
    const meta = PREQUAL_LOAN_TYPE_LABELS[request.loan_type];
    return meta ? `${meta.title} · ${meta.sub}` : request.loan_type;
  })();

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Review pre-qualification request"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.65)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          width: "min(1280px, 100%)",
          background: t.bg,
          boxShadow: t.shadowLg,
          borderRadius: 18,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "18px 28px",
          borderBottom: `1px solid ${t.line}`,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
              Pre-qualification review · {programLabel}
              {request.quote_number ? <span style={{ color: t.ink3 }}>{" · "}{request.quote_number}</span> : null}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.ink, marginTop: 2, letterSpacing: -0.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {request.target_property_address}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ all: "unset", cursor: "pointer", width: 36, height: 36, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 9, color: t.ink2 }}>
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{
          flex: "1 1 auto",
          overflowY: "auto",
          padding: "20px 28px 24px",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.05fr) minmax(0, 1fr)",
          gap: 18,
          alignItems: "start",
        }}>
          {/* ── LEFT: borrower submission + calculator ─────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            {/* Borrower's submission — read-only */}
            <Card pad={16} style={{ background: t.surface2 }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                Borrower&apos;s submission
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 12.5, color: t.ink2, fontFeatureSettings: '"tnum"' }}>
                <ReadRow t={t} label="Requested purchase" value={QC_FMT.usd(Number(request.purchase_price), 0)} />
                <ReadRow t={t} label="Requested loan" value={QC_FMT.usd(Number(request.requested_loan_amount), 0)} />
                <ReadRow t={t} label="Requested LTV" value={
                  Number(request.purchase_price) > 0
                    ? `${((Number(request.requested_loan_amount) / Number(request.purchase_price)) * 100).toFixed(1)}%`
                    : "—"
                } />
                <ReadRow t={t} label="Matrix cap" value={`${Math.round(cap * 100)}% LTV`} />
                <ReadRow t={t} label="Expected closing" value={
                  request.expected_closing_date
                    ? new Date(request.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
                    : "—"
                } />
                <ReadRow t={t} label="LLC / entity" value={request.borrower_entity ?? "TBD"} />
                {borrowerFico != null ? (
                  <ReadRow t={t} label="Borrower FICO" value={String(borrowerFico)} accent={borrowerFico >= 680 ? t.profit : t.warn} />
                ) : null}
                <ReadRow t={t} label="Submitted" value={new Date(request.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} />
              </div>
              {request.borrower_notes ? (
                <div style={{ marginTop: 12, padding: "10px 12px", borderLeft: `3px solid ${t.brand}`, background: t.bg, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
                  <strong style={{ color: t.ink }}>Borrower notes:</strong> {request.borrower_notes}
                </div>
              ) : null}
            </Card>

            {/* Calculator scenario — product-aware */}
            <Card pad={16}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
              }}>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                  Calculator scenario
                </div>
                <Pill bg={t.brandSoft} color={t.brand}>
                  Saves to letter & loan
                </Pill>
              </div>
              <div style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.45, marginBottom: 10 }}>
                These numbers ride along with the approval. The borrower never
                sees them on the PDF, but they pre-fill the Loan when the seller
                accepts the offer.
              </div>

              {isDscrLike(request.loan_type) ? (
                <DscrCalc
                  t={t}
                  loanNum={loanNum}
                  rate={calcRate} setRate={setCalcRate}
                  term={calcTerm} setTerm={setCalcTerm}
                  rent={calcRent} setRent={setCalcRent}
                  taxes={calcTaxes} setTaxes={setCalcTaxes}
                  insurance={calcInsurance} setInsurance={setCalcInsurance}
                  hoa={calcHoa} setHoa={setCalcHoa}
                />
              ) : (
                <BridgeCalc
                  t={t}
                  loanNum={loanNum}
                  rate={calcRate} setRate={setCalcRate}
                  term={calcTerm} setTerm={setCalcTerm}
                  points={calcPoints} setPoints={setCalcPoints}
                />
              )}
            </Card>

            {/* F&F-specific — Scope of Work + ARV. Admin can edit
                every line, override ARV, and the LTARV pill
                re-validates live. Lives only on F&F prequals; other
                products skip the entire card. */}
            {request.loan_type === "fix_flip" ? (
              <Card pad={16}>
                <div style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  marginBottom: 8,
                }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                    Scope of work · ARV
                  </div>
                  <Pill bg={t.brandSoft} color={t.brand}>
                    Hidden from PDF
                  </Pill>
                </div>
                <div style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
                  Borrower-submitted SOW + ARV. Edit any field; the saved
                  approval row updates accordingly. Total construction is
                  re-derived from the line items unless you override it
                  explicitly via the standalone field below.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginBottom: 14 }}>
                  <Field
                    t={t}
                    label="Estimated ARV (After Repair Value)"
                    value={arvText}
                    onChange={setArvText}
                  />
                </div>
                <PrequalSowEditor items={sowItems} onChange={setSowItems} />
                {/* Live LTARV pill — informational. */}
                {(() => {
                  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
                  const total = sowItems.reduce(
                    (s, it) => s + (Number(it.total_usd) || 0), 0
                  );
                  const allInBasis = purchaseNum + total;
                  const ltarv = arvNum > 0 ? allInBasis / arvNum : 0;
                  const overCap = ltarv > FF_LTARV_CAP + 1e-6;
                  if (arvNum <= 0 || allInBasis <= 0) return null;
                  return (
                    <div style={{ marginTop: 12 }}>
                      <Pill
                        bg={overCap ? t.dangerBg : t.profitBg}
                        color={overCap ? t.danger : t.profit}
                      >
                        All-in {QC_FMT.usd(allInBasis, 0)} ÷ ARV {QC_FMT.usd(arvNum, 0)} = {(ltarv * 100).toFixed(1)}% ·{" "}
                        {overCap
                          ? `over ${Math.round(FF_LTARV_CAP * 100)}% project cap`
                          : `within ${Math.round(FF_LTARV_CAP * 100)}% project cap`}
                      </Pill>
                    </div>
                  );
                })()}
              </Card>
            ) : null}
          </div>

          {/* ── RIGHT: approval fields ─────────────────────────────── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
            <Card pad={16}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                Approval values
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field
                  t={t}
                  label={isFixFlip ? "Approved BRV (purchase price)" : "Approved purchase price"}
                  value={purchaseText}
                  onChange={setPurchaseText}
                />
                <Field t={t} label="Approved loan amount" value={loanText} onChange={setLoanText} />
              </div>
              <div style={{ marginTop: 8 }}>
                <Pill bg={ltvOverCap ? t.dangerBg : t.profitBg} color={ltvOverCap ? t.danger : t.profit}>
                  {isFixFlip ? (
                    arvNumLive > 0
                      ? <>
                          LTARV {(ltv * 100).toFixed(1)}% (loan ÷ ARV) ·{" "}
                          {ltvOverCap
                            ? `over ${Math.round(cap * 100)}% cap — lower the loan amount`
                            : `within ${Math.round(cap * 100)}% cap — OK to approve`}
                        </>
                      : <>Add an ARV in the Scope of Work card to compute LTARV</>
                  ) : (
                    <>
                      LTV {(ltv * 100).toFixed(1)}% ·{" "}
                      {ltvOverCap
                        ? `over ${Math.round(cap * 100)}% cap — lower the loan amount`
                        : `within ${Math.round(cap * 100)}% cap — OK to approve`}
                    </>
                  )}
                </Pill>
              </div>
            </Card>

            <Card pad={16}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 8 }}>
                Letter details
              </div>
              {/* LLC override */}
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
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
                    TBD — issue to individual name
                  </label>
                </div>
                {!entityTBD ? (
                  <input
                    type="text"
                    value={entityName}
                    onChange={(e) => setEntityName(e.target.value)}
                    placeholder="e.g. Riverside Holdings LLC"
                    style={fieldInputStyle(t)}
                  />
                ) : (
                  <div style={{
                    fontSize: 11.5, color: t.ink3, background: t.surface2,
                    border: `1px dashed ${t.line}`, borderRadius: 9,
                    padding: "8px 12px", lineHeight: 1.4,
                  }}>
                    Letter will be issued to the borrower&apos;s individual legal name.
                  </div>
                )}
              </div>

              <div style={{ height: 12 }} />

              {/* Expiration override */}
              <div>
                <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
                  Letter validity
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    value={expirationText}
                    onChange={(e) => setExpirationText(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))}
                    inputMode="numeric"
                    style={{ ...fieldInputStyle(t), width: 80 }}
                  />
                  <span style={{ fontSize: 12, color: t.ink2 }}>days from today</span>
                  {num(expirationText) !== DEFAULT_EXPIRATION_DAYS ? (
                    <button
                      onClick={() => setExpirationText(String(DEFAULT_EXPIRATION_DAYS))}
                      style={{ all: "unset", cursor: "pointer", fontSize: 11, color: t.petrol, fontWeight: 700 }}
                    >
                      Reset to 90
                    </button>
                  ) : null}
                </div>
                <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 4 }}>
                  Default 90 days. Capped at 365.
                </div>
              </div>
            </Card>

            <Card pad={16}>
              <Textarea
                t={t}
                label="Underwriter notes (visible to borrower in-app · NEVER on the PDF)"
                value={notes}
                onChange={setNotes}
                placeholder="e.g. Capped at 75% LTV per today's matrix. Call me if you need to discuss."
              />
            </Card>

            {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}

            {/* Action bar */}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              {confirmReject ? (
                <button
                  onClick={onReject}
                  disabled={reject.isPending}
                  style={{ ...qcBtnPrimary(t), background: t.danger, opacity: reject.isPending ? 0.5 : 1 }}
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
                  {approveLabel}
                </button>
              </div>
            </div>

            {request.status === "approved" && request.pdf_url ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                Letter already issued.{" "}
                <a href={request.pdf_url} target="_blank" rel="noopener noreferrer" style={{ color: t.petrol, fontWeight: 700 }}>
                  Open the current PDF →
                </a>
                {"  "}Edit any field above and click <em>Save changes &amp; regenerate PDF</em>{" "}
                to re-issue.
              </div>
            ) : null}
            {request.status === "offer_accepted" ? (
              <div style={{
                fontSize: 12,
                color: t.ink2,
                background: t.brandSoft,
                border: `1px solid ${t.brand}30`,
                padding: "8px 12px",
                borderRadius: 8,
                lineHeight: 1.5,
              }}>
                <strong style={{ color: t.brand }}>Loan {request.quote_number ?? ""} is already opened.</strong>{" "}
                Editing fields here will regenerate the printed letter only — the
                spawned loan record is left untouched. Update the loan file from
                the loans page if you also need to change the underlying deal.
              </div>
            ) : null}
            {request.status === "offer_declined" ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                Borrower walked away — request is closed and no longer editable.
                If they come back with the same property, ask them to submit a
                new pre-qualification.
              </div>
            ) : null}
            {request.status === "rejected" ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                This request was rejected. Editing isn&apos;t supported — the
                borrower can submit a new request whenever they&apos;re ready.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── DSCR calculator card ───────────────────────────────────────────────

function DscrCalc({
  t, loanNum, rate, setRate, term, setTerm, rent, setRent,
  taxes, setTaxes, insurance, setInsurance, hoa, setHoa,
}: {
  t: ReturnType<typeof useTheme>["t"];
  loanNum: number;
  rate: string; setRate: (v: string) => void;
  term: string; setTerm: (v: string) => void;
  rent: string; setRent: (v: string) => void;
  taxes: string; setTaxes: (v: string) => void;
  insurance: string; setInsurance: (v: string) => void;
  hoa: string; setHoa: (v: string) => void;
}) {
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;
  const out = computeDscr(loanNum, {
    rate: num(rate),
    termMonths: num(term) || 360,
    rent: num(rent),
    taxes: num(taxes),
    insurance: num(insurance),
    hoa: num(hoa),
  });
  const dscrOk = out.dscr >= 1.0;

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Field t={t} label="Note rate %" value={rate} onChange={setRate} />
        <Field t={t} label="Term (months)" value={term} onChange={setTerm} />
        <Field t={t} label="Monthly rent" value={rent} onChange={setRent} />
        <Field t={t} label="Annual taxes" value={taxes} onChange={setTaxes} />
        <Field t={t} label="Annual insurance" value={insurance} onChange={setInsurance} />
        <Field t={t} label="Monthly HOA" value={hoa} onChange={setHoa} />
      </div>
      <div style={{
        marginTop: 12, padding: 12, borderRadius: 10, background: t.surface2,
        display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8,
      }}>
        <Output t={t} label="Monthly P&I" value={QC_FMT.usd(out.monthlyPI, 0)} />
        <Output t={t} label="Monthly NOI" value={QC_FMT.usd(out.noi, 0)} />
        <Output t={t} label="Monthly OpEx" value={QC_FMT.usd(out.monthlyExpenses, 0)} />
        <Output
          t={t}
          label="DSCR"
          value={out.dscr ? out.dscr.toFixed(2) : "—"}
          accent={dscrOk ? t.profit : t.danger}
        />
      </div>
    </>
  );
}

// ── Bridge calculator card ─────────────────────────────────────────────

function BridgeCalc({
  t, loanNum, rate, setRate, term, setTerm, points, setPoints,
}: {
  t: ReturnType<typeof useTheme>["t"];
  loanNum: number;
  rate: string; setRate: (v: string) => void;
  term: string; setTerm: (v: string) => void;
  points: string; setPoints: (v: string) => void;
}) {
  const num = (s: string) => Number(s.replace(/[^0-9.]/g, "")) || 0;
  const out = computeBridge(loanNum, {
    rate: num(rate),
    termMonths: num(term) || 12,
    points: num(points),
  });
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        <Field t={t} label="Note rate %" value={rate} onChange={setRate} />
        <Field t={t} label="Term (months)" value={term} onChange={setTerm} />
        <Field t={t} label="Origination points %" value={points} onChange={setPoints} />
      </div>
      <div style={{
        marginTop: 12, padding: 12, borderRadius: 10, background: t.surface2,
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8,
      }}>
        <Output t={t} label="Monthly interest" value={QC_FMT.usd(out.monthlyInterest, 0)} />
        <Output t={t} label="Origination fee" value={QC_FMT.usd(out.totalPoints, 0)} />
        <Output t={t} label="Interest reserve" value={QC_FMT.usd(out.interestReserve, 0)} />
      </div>
    </>
  );
}

// ── Reusable cells ─────────────────────────────────────────────────────

function ReadRow({ t, label, value, accent }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; accent?: string; }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: accent ?? t.ink, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function fieldInputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
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
  };
}

function Field({ t, label, value, onChange }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; onChange: (v: string) => void; }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
        {label}
      </div>
      <input value={value} onChange={(e) => onChange(e.target.value)} inputMode="decimal" style={fieldInputStyle(t)} />
    </div>
  );
}

function Output({ t, label, value, accent }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; accent?: string; }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: accent ?? t.ink, marginTop: 3, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}

function Textarea({ t, label, value, onChange, placeholder }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string; onChange: (v: string) => void; placeholder?: string; }) {
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
        style={{ ...fieldInputStyle(t), resize: "vertical", minHeight: 70 }}
      />
    </div>
  );
}
