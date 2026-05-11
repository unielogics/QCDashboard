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
import { useUI } from "@/store/ui";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  useApprovePrequalRequest,
  useRejectPrequalRequest,
  useRevisePrequalRequest,
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
  // Read sidebar state so the panel can start just to the right of it
  // instead of covering the global nav (per #facelift — the modal is a
  // "full experience" but the operator should still see their context).
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const sidebarOffset = sidebarCollapsed ? 68 : 232;
  const approve = useApprovePrequalRequest();
  const reject = useRejectPrequalRequest();
  const revise = useRevisePrequalRequest();

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
  // A revision spawns a new versioned row; only allowed on approved
  // requests that haven't been superseded yet. offer_accepted /
  // offer_declined / rejected need different flows (spawned-Loan update
  // or fresh request) and are excluded here.
  const isSuperseded = request.superseded_by_id != null;
  const canRevise =
    purchaseNum > 0 &&
    loanNum > 0 &&
    !ltvOverCap &&
    request.status === "approved" &&
    !isSuperseded &&
    !revise.isPending &&
    !approve.isPending;
  const canApprove =
    purchaseNum > 0 &&
    loanNum > 0 &&
    !ltvOverCap &&
    isEditableStatus &&
    !isSuperseded &&
    !approve.isPending;
  const isReissue = request.status === "approved" || request.status === "offer_accepted";
  const nextVersionNum = (request.version_num ?? 1) + 1;
  const reviseLabel = revise.isPending
    ? "Saving updated version…"
    : `Create updated version (v${nextVersionNum})`;
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

  // Create Updated Version: spawn a new revision linked to this one
  // instead of mutating the source. The payload is identical to approve
  // — the backend distinguishes by endpoint and writes a new row with
  // parent_prequal_request_id set + version_num bumped. Only available
  // on approved requests that haven't been superseded yet.
  const onRevise = async () => {
    setError(null);
    try {
      const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
      const totalConstruction = sowItems.reduce(
        (sum, item) => sum + (Number(item.total_usd) || 0),
        0,
      );
      await revise.mutateAsync({
        requestId: request.id,
        payload: {
          approved_purchase_price: purchaseNum,
          approved_loan_amount: loanNum,
          admin_notes: notes.trim() || null,
          approved_scenario: scenario,
          expiration_days: expirationNum,
          borrower_entity: entityTBD ? null : (entityName.trim() || null),
          approved_arv: request.loan_type === "fix_flip" && arvNum > 0 ? arvNum : null,
          approved_sow_items: request.loan_type === "fix_flip" && sowItems.length > 0 ? sowItems : null,
          approved_total_construction: request.loan_type === "fix_flip" && totalConstruction > 0 ? totalConstruction : null,
        },
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create updated version.");
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
        // Leave the global sidebar visible — the operator should keep
        // their navigation context. Below the topbar we still cover
        // (the topbar lives in a separate column above main content).
        top: 0,
        right: 0,
        bottom: 0,
        left: sidebarOffset,
        background: t.bg,
        zIndex: 200,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: `-12px 0 32px ${t.shadowLg ? "" : ""}rgba(6,7,11,0.18)`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: t.bg,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header — full-bleed title row with prominent X */}
        <div style={{
          flex: "0 0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "20px 32px",
          borderBottom: `1px solid ${t.line}`,
          background: t.surface,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{
                fontSize: 10.5,
                fontWeight: 800,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.petrol,
                padding: "3px 8px",
                background: t.petrolSoft,
                borderRadius: 6,
              }}>
                {programLabel}
              </span>
              {request.quote_number ? (
                <span style={{
                  fontSize: 12,
                  fontWeight: 800,
                  color: t.ink2,
                  fontFeatureSettings: '"tnum"',
                  letterSpacing: 0.3,
                }}>
                  {request.quote_number}
                </span>
              ) : null}
              {(request.version_num ?? 1) > 1 ? (
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: t.petrol,
                  background: t.petrolSoft,
                  padding: "3px 8px",
                  borderRadius: 6,
                  letterSpacing: 0.4,
                }}>
                  Updated · v{request.version_num}
                </span>
              ) : null}
              {isSuperseded ? (
                <span style={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: t.warn,
                  background: t.warnBg,
                  padding: "3px 8px",
                  borderRadius: 6,
                  letterSpacing: 0.4,
                }}>
                  Superseded
                </span>
              ) : null}
            </div>
            <div style={{
              fontSize: 22,
              fontWeight: 800,
              color: t.ink,
              marginTop: 6,
              letterSpacing: -0.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {request.target_property_address}
            </div>
            <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
              {request.borrower_entity ? <span>Issued to <strong style={{ color: t.ink2 }}>{request.borrower_entity}</strong></span> : <span style={{ fontStyle: "italic" }}>Entity TBD</span>}
              {borrowerFico ? <span>{" · "}FICO <strong style={{ color: t.ink2 }}>{borrowerFico}</strong></span> : null}
              {request.expected_closing_date ? <span>{" · "}Closing <strong style={{ color: t.ink2 }}>{new Date(request.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</strong></span> : null}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            title="Close (Esc)"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 44,
              height: 44,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 10,
              color: t.ink2,
              border: `1px solid ${t.line}`,
              flexShrink: 0,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = t.surface2; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
          >
            <Icon name="x" size={20} />
          </button>
        </div>

        {/* Body — form stack on the left, live letter preview on the right.
            Single-column form per #facelift (the previous 2-col internal
            split made fields feel cramped); preview pane mirrors the actual
            PDF and updates as the operator types. */}
        <div style={{
          flex: "1 1 auto",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 0.9fr)",
          alignItems: "stretch",
        }}>
          {/* ── FORM COLUMN: offer numbers → calculator → SOW (F&F) → letter terms → context ── */}
          <div style={{
            overflowY: "auto",
            padding: "22px 28px 22px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
            minWidth: 0,
          }}>
            {/* Offer numbers — primary action; previously "Approval values" */}
            <Card pad={16}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
                Offer numbers
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field
                  t={t}
                  label={isFixFlip ? "Approved BRV (purchase price)" : "Approved purchase price"}
                  value={purchaseText}
                  onChange={setPurchaseText}
                />
                <Field t={t} label="Approved loan amount" value={loanText} onChange={setLoanText} />
              </div>
              <div style={{ marginTop: 10 }}>
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

            {/* F&F-specific — Scope of Work + ARV admin overrides */}
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

            {/* Letter terms — LLC, validity, underwriter notes. Renamed
                from "Letter details" per #facelift section grouping. */}
            <Card pad={16}>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 }}>
                Letter terms
              </div>
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

              <div style={{ height: 14 }} />

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

              <div style={{ height: 14 }} />

              <Textarea
                t={t}
                label="Underwriter notes (visible to borrower in-app · NEVER on the PDF)"
                value={notes}
                onChange={setNotes}
                placeholder="e.g. Capped at 75% LTV per today's matrix. Call me if you need to discuss."
              />
            </Card>

            {/* Borrower's submission — context, moved to bottom as reference */}
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

          </div>

          {/* ── PREVIEW COLUMN: live letter mock that mirrors the PDF and
              updates as the operator types. Sits to the right of the form
              column, scrolls independently, and shows what the borrower
              will actually receive. */}
          <div style={{
            overflowY: "auto",
            padding: "22px 28px 22px 16px",
            borderLeft: `1px solid ${t.line}`,
            background: t.surface2,
            minWidth: 0,
          }}>
            <div style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: t.ink3,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}>
              <span>Live letter preview</span>
              <span style={{ fontSize: 10, color: t.ink4, textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
                Updates as you type
              </span>
            </div>
            <LetterPreview
              t={t}
              request={request}
              isFixFlip={isFixFlip}
              purchase={purchaseNum}
              loan={loanNum}
              ltv={ltv}
              cap={cap}
              scenario={scenario}
              entityName={entityTBD ? null : entityName}
              expirationDays={expirationNum}
              borrowerFico={borrowerFico ?? null}
              arvOverride={Number(arvText.replace(/[^0-9.]/g, "")) || null}
            />
          </div>
        </div>

        {/* ── FOOTER: action bar + status banners. Pinned below the body
            grid so the primary CTA stays visible no matter how long the
            form column scrolls. ── */}
        <div style={{
          flex: "0 0 auto",
          padding: "14px 28px 16px 32px",
          borderTop: `1px solid ${t.line}`,
          background: t.surface,
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}

          {isSuperseded ? (
            <div style={{
              fontSize: 12,
              color: t.ink2,
              background: t.warnBg,
              border: `1px solid ${t.warn}40`,
              padding: "8px 12px",
              borderRadius: 8,
              lineHeight: 1.5,
            }}>
              <strong style={{ color: t.warn }}>
                This version has been superseded.
              </strong>{" "}
              A newer Updated Version has been created. Open the latest
              version from the queue to make further changes — editing
              this row is disabled to keep the revision chain consistent.
            </div>
          ) : null}

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

          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
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
                disabled={isSuperseded}
                style={{
                  ...qcBtn(t),
                  color: t.danger,
                  borderColor: `${t.danger}40`,
                  opacity: isSuperseded ? 0.4 : 1,
                  cursor: isSuperseded ? "not-allowed" : "pointer",
                }}
              >
                Reject
              </button>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
              {request.status === "approved" && !isSuperseded ? (
                <button
                  onClick={onRevise}
                  disabled={!canRevise}
                  title="Spawn a new versioned letter (v2, v3, …) linked to this one. The original PDF is preserved."
                  style={{
                    ...qcBtn(t),
                    borderColor: `${t.petrol}50`,
                    color: t.petrol,
                    fontWeight: 700,
                    opacity: canRevise ? 1 : 0.5,
                    cursor: canRevise ? "pointer" : "not-allowed",
                  }}
                >
                  {reviseLabel}
                </button>
              ) : null}
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

// ── Live letter preview ────────────────────────────────────────────────
//
// Mirrors app/templates/prequal_{dscr,bridge,fix_flip}.html visually so
// the underwriter can see what the borrower will receive BEFORE clicking
// Save. The render is intentionally not pixel-perfect to WeasyPrint —
// goal is "looks like the letter", not "byte-identical." On save the
// server-side WeasyPrint render still produces the canonical PDF and
// replaces what's shown here on the next refetch.
function LetterPreview({
  t,
  request,
  isFixFlip,
  purchase,
  loan,
  ltv,
  cap,
  scenario,
  entityName,
  expirationDays,
  borrowerFico,
  arvOverride,
}: {
  t: ReturnType<typeof useTheme>["t"];
  request: PrequalRequest;
  isFixFlip: boolean;
  purchase: number;
  loan: number;
  ltv: number;            // ratio, e.g. 0.75
  cap: number;            // ratio, e.g. 0.80
  scenario: Record<string, unknown> | null;
  entityName: string | null;
  expirationDays: number;
  borrowerFico: number | null;
  arvOverride: number | null;
}) {
  // Match the template's date rendering. Server formats as "Month D, YYYY".
  const today = new Date();
  const expiry = new Date(today.getTime() + expirationDays * 86_400_000);
  const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const isRefi = request.loan_type === "dscr_refi";
  const isDscr = request.loan_type === "dscr_purchase" || isRefi;
  const titleLabel = isRefi ? "Refinance" : isFixFlip || request.loan_type === "bridge" ? "Bridge" : "Purchase";
  const programLabel = (() => {
    if (isFixFlip) return "Commercial Fix & Flip — Short-Term Bridge";
    if (request.loan_type === "bridge") return "Commercial Bridge — Short-Term";
    return `Commercial DSCR — 30 Year Fixed${isRefi ? " (Refinance)" : ""}`;
  })();
  const issuedTo = entityName ?? "Borrower's individual legal name";
  const versionLabel = (request.version_num ?? 1) > 1 ? ` · Updated v${request.version_num}` : "";
  const arv = arvOverride ?? request.approved_arv ?? request.arv_estimate ?? null;
  const ltvPct = ltv * 100;
  const ltvBasisLabel = isFixFlip ? "Loan-to-After-Repair-Value (LTARV)" : "Maximum Loan-to-Value (LTV)";

  // Paper-like card framing.
  return (
    <div style={{
      background: "#FFFFFF",
      color: "#0B1629",
      borderRadius: 8,
      border: `1px solid ${t.line}`,
      padding: 24,
      fontFamily: '"Helvetica Neue", Helvetica, Arial, sans-serif',
      fontSize: 11,
      lineHeight: 1.45,
      boxShadow: t.shadowLg,
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "2px solid #0B1F3A",
        paddingBottom: 8,
        marginBottom: 12,
        display: "flex",
        alignItems: "center",
        gap: 12,
        position: "relative",
      }}>
        <div style={{
          width: 36, height: 36,
          background: "#0B1F3A",
          color: "#FFFFFF",
          fontSize: 14,
          fontWeight: 800,
          borderRadius: 6,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}>QC</div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#0B1F3A", letterSpacing: 0.5 }}>QUALIFIED COMMERCIAL</div>
          <div style={{ fontSize: 8, color: "#6B7891", textTransform: "uppercase", letterSpacing: 1.4, marginTop: 1 }}>
            Financing &amp; Capital Advisory
          </div>
        </div>
      </div>

      {/* Title */}
      <div style={{
        textAlign: "center",
        fontSize: 12,
        fontWeight: 800,
        marginBottom: 8,
        textTransform: "uppercase",
        letterSpacing: 1,
        color: "#0B1F3A",
      }}>
        {titleLabel} Pre-Qualification
        {request.quote_number ? <span style={{ fontSize: 9, fontWeight: 600, color: "#6B7891", letterSpacing: 0.3, marginLeft: 4 }}>({request.quote_number}{versionLabel})</span> : null}
      </div>

      {/* Dates */}
      <div style={{ marginBottom: 10, fontSize: 9.5 }}>
        <div><strong>Date Issued:</strong> <span style={{ fontWeight: 400 }}>{fmtDate(today)}</span></div>
        <div><strong>Expiration Date:</strong> <span style={{ fontWeight: 400 }}>{fmtDate(expiry)}</span></div>
      </div>

      {/* Intro */}
      <div style={{ marginBottom: 10, fontSize: 10, textAlign: "justify" }}>
        To Whom It May Concern:<br /><br />
        Based on the preliminary information and credit data provided,
        <strong> Qualified Commercial LLC </strong> is pleased to issue this Pre-Qualification
        for the borrower and subject property listed below. The borrower&apos;s credit profile{borrowerFico ? <> (FICO <strong>{borrowerFico}</strong>)</> : null},
        preliminary cash flow estimates, and stated liquidity meet the initial underwriting
        guidelines for our commercial lending programs.
      </div>

      {/* Section: Transaction summary */}
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#0B1F3A", marginBottom: 4, borderBottom: "1px solid rgba(11, 22, 41, 0.10)", paddingBottom: 2 }}>
        TRANSACTION SUMMARY
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 12, fontSize: 9.5 }}>
        <tbody>
          <PreviewRow label="Borrower / Entity Name" value={issuedTo} />
          <PreviewRow label="Subject Property Address" value={request.target_property_address} />
          <PreviewRow label={isRefi ? "Property Value" : isFixFlip ? "Acquisition Price (BRV)" : "Purchase Price"} value={purchase > 0 ? fmtUsd(purchase) : <em style={{ color: "#A2ABBD" }}>—</em>} />
          <PreviewRow label="Maximum Loan Amount" value={loan > 0 ? fmtUsd(loan) : <em style={{ color: "#A2ABBD" }}>—</em>} />
          {isFixFlip && arv && arv > 0 ? (
            <PreviewRow label="After-Repair Value (ARV)" value={fmtUsd(arv)} />
          ) : null}
          <PreviewRow
            label={ltvBasisLabel}
            value={
              <span style={{
                color: ltv > cap + 1e-6 ? "#B0322F" : "#0B7A3E",
                fontWeight: 700,
              }}>
                {ltvPct.toFixed(1)}%
                <span style={{ color: "#6B7891", fontWeight: 400, fontSize: 9, marginLeft: 6 }}>
                  (cap {(cap * 100).toFixed(0)}%)
                </span>
              </span>
            }
          />
          <PreviewRow label="Loan Program" value={programLabel} />
        </tbody>
      </table>

      {/* Section: Status & conditions */}
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#0B1F3A", marginBottom: 4, borderBottom: "1px solid rgba(11, 22, 41, 0.10)", paddingBottom: 2 }}>
        STATUS &amp; CONDITIONS OF ISSUANCE
      </div>
      <ul style={{ paddingLeft: 18, marginTop: 4, marginBottom: 10, fontSize: 9.5 }}>
        <li style={{ marginBottom: 3 }}>
          <strong>Credit Review:</strong> Soft credit inquiry completed{borrowerFico ? <> at FICO <strong>{borrowerFico}</strong></> : null}; meets minimum FICO requirements.
        </li>
        <li style={{ marginBottom: 3 }}>
          {isDscr ? (
            <>
              <strong>Preliminary Cash Flow:</strong> Subject property projected rents meet the minimum
              Debt Service Coverage Ratio (DSCR){scenario && typeof (scenario as Record<string, unknown>)?.dscr === "number"
                ? <> of <strong>{((scenario as { dscr: number }).dscr).toFixed(2)}x</strong></>
                : " of 1.20x"}.
            </>
          ) : isFixFlip ? (
            <>
              <strong>Project Viability:</strong> Acquisition + rehab budget within LTARV cap for the program;
              SOW and reserves under review for final approval.
            </>
          ) : (
            <>
              <strong>Bridge Sizing:</strong> Loan amount supported by as-is property value;
              interest reserve structured to cover the bridge term.
            </>
          )}
        </li>
        <li style={{ marginBottom: 3 }}>
          <strong>Next Steps for Final Approval:</strong> Clear title, acceptable third-party appraisal,
          verification of liquid reserves, entity document review, and final underwriter sign-off.
        </li>
      </ul>

      {/* Signature + disclaimer block — compressed for preview */}
      <div style={{
        display: "flex",
        gap: 10,
        alignItems: "stretch",
        marginTop: 8,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, marginBottom: 12 }}>Sincerely,</div>
          <div style={{ width: 160, borderBottom: "1px solid #0B1629", marginBottom: 4 }} />
          <div style={{ fontSize: 8, color: "#6B7891" }}>Signed: {fmtDate(today)}</div>
          <div style={{ fontSize: 10, fontWeight: 700, marginTop: 2 }}>Authorized Officer</div>
          <div style={{ fontSize: 8.5, color: "#3C4A60" }}>Qualified Commercial LLC</div>
        </div>
        <div style={{
          flex: 1,
          background: "#fdfbf7",
          border: "1px solid #e0dcd3",
          padding: "6px 8px",
          fontSize: 7.5,
          color: "#555",
          textAlign: "justify",
          lineHeight: 1.3,
        }}>
          <strong>DISCLAIMER:</strong> Preliminary pre-qualification based on a soft-inquiry credit
          review and unverified, self-reported financial data. <strong>NOT a commitment to lend</strong>.
          Subject to final underwriting, appraisal, title, reserves verification, and final approval.
          Terms and rates subject to market changes; not locked until a rate lock agreement is executed.
        </div>
      </div>

      {/* Footer matches the WeasyPrint @bottom-left content. */}
      <div style={{
        marginTop: 10,
        paddingTop: 6,
        borderTop: "1px solid rgba(11, 22, 41, 0.08)",
        fontSize: 7.5,
        color: "#6B7891",
        textAlign: "left",
      }}>
        Qualified Commercial LLC{request.quote_number ? ` | ${request.quote_number}${versionLabel ? versionLabel.replace(" · Updated ", "-") : ""}` : ""}
      </div>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <tr>
      <th style={{
        background: "#FAF7F1",
        border: "1px solid rgba(11, 22, 41, 0.16)",
        padding: "4px 8px",
        textAlign: "left",
        width: "50%",
        fontWeight: 700,
        fontSize: 9.5,
      }}>{label}</th>
      <td style={{
        border: "1px solid rgba(11, 22, 41, 0.16)",
        padding: "4px 8px",
        fontSize: 9.5,
        fontFeatureSettings: '"tnum"',
      }}>{value}</td>
    </tr>
  );
}

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
