"use client";

// Standalone Simulator — role-aware:
//
//   CLIENT  → ARV-driven "ClientSimulator" with credit + experience gating.
//             Mirrors the mobile app, so the borrower experience is identical
//             across platforms. No backend recalc — instant client-side math.
//
//   !CLIENT → advanced "Free calc" + "From loan" modes that hit the backend
//             pricing engine (POST /loans/calc and /loans/{id}/recalc). All
//             the operator wiggle-room: product, property type, base rate,
//             taxes / insurance / HOA, raw loan amount, full HUD-1 detail.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useCurrentUser,
  useFreeCalc,
  useFredSeries,
  useLoans,
  useMyCredit,
  useMyPrequalRequests,
  useRecalc,
  useSettings,
} from "@/hooks/useApi";
import { PreQualRequestList } from "@/components/PreQualRequestList";
import { PreQualRequestModal } from "@/components/PreQualRequestModal";
import { LoanType, PropertyType, Role } from "@/lib/enums.generated";
import { QC_FMT } from "@/components/design-system/tokens";
import type { FredSeriesSummary, RecalcResponse, SimulatorSettings } from "@/lib/types";
import { EligibilityBanner } from "@/components/EligibilityBanner";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { useCreditSummary } from "@/hooks/useApi";
import { RangeGauge } from "@/components/RangeGauge";
import {
  bindingConstraintLabel,
  cappedReasonLabel,
  computeEligibility,
  computeSimulator,
  ltvLabel,
  type SimulatorInputs,
  type TransactionType,
} from "@/lib/eligibility";
import { isLoanTypeEnabled, isProductKeyEnabled } from "@/lib/products";
import { LoanSimulator } from "@/components/LoanSimulator";
import type { Loan } from "@/lib/types";

const DEFAULT_SIM: SimulatorSettings = {
  points_min: 0,
  points_max: 3,
  points_step: 0.5,
  amount_min: 100_000,
  amount_max: 5_000_000,
  amount_step: 25_000,
  ltv_min: 0.5,
  ltv_max: 0.9,
  ltv_step: 0.05,
  advanced_mode_enabled: true,
  show_taxes: true,
  show_insurance: true,
  show_hoa: true,
  show_ltv_toggle: true,
};

const LOAN_TYPE_OPTIONS: { value: LoanType; label: string }[] = [
  { value: LoanType.DSCR, label: "DSCR Rental (30-yr)" },
  { value: LoanType.FIX_AND_FLIP, label: "Fix & Flip (12-mo)" },
  { value: LoanType.GROUND_UP, label: "Ground Up (18-mo)" },
  { value: LoanType.BRIDGE, label: "Bridge (24-mo)" },
].filter((o) => isLoanTypeEnabled(o.value));

type Mode = "free" | "loan";

export default function SimulatorPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: settings } = useSettings();
  const sim: SimulatorSettings = settings?.data?.simulator ?? DEFAULT_SIM;

  const isClient = user?.role === Role.CLIENT;
  const [mode, setMode] = useState<Mode>("free");

  // CLIENT view — same gated, ARV-driven simulator as mobile.
  if (isClient) {
    return (
      <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Simulate</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Model what a deal looks like at different points and LTV tiers. Higher LTVs unlock as you
            verify credit and add experience to your investor profile.
          </div>
        </div>
        <ClientSimulator />
      </div>
    );
  }

  // OPERATOR view — full advanced flow against the backend.
  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>Simulate</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>
            Run pricing math from scratch or against any loan in your pipeline. Operators set the
            allowed ranges in Settings → Simulator.
          </div>
        </div>
        <div style={{ display: "inline-flex", gap: 4 }}>
          <ModeButton t={t} active={mode === "free"} onClick={() => setMode("free")}>
            <Icon name="calc" size={12} /> Free calculation
          </ModeButton>
          <ModeButton t={t} active={mode === "loan"} onClick={() => setMode("loan")}>
            <Icon name="layers" size={12} /> From a loan
          </ModeButton>
        </div>
      </div>

      {mode === "free" ? <FreeCalcMode t={t} sim={sim} /> : <FromLoanMode t={t} sim={sim} loans={loans} />}
    </div>
  );
}

// ── Client simulator — ARV + DP slider + LTV slider (gated) ────────────────

function ClientSimulator() {
  const { t } = useTheme();
  const { data: credit } = useMyCredit();
  const { data: creditSummary } = useCreditSummary(credit?.id);
  const { data: loans = [] } = useLoans();
  const { data: fred } = useFredSeries();

  // Segmented-control state — Free Simulate | My Loans.
  const [simTab, setSimTab] = useState<"free" | "started">("free");
  const [pickedLoanId, setPickedLoanId] = useState<string | null>(null);
  const pickedLoan = pickedLoanId ? loans.find((l) => l.id === pickedLoanId) ?? null : null;

  const propertyCount = loans.length;
  const hasYearOfOwnership = useMemo(() => {
    const oneYearMs = 365 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    return loans.some(
      (l) => l.stage === "funded" && l.close_date && now - new Date(l.close_date).getTime() >= oneYearMs
    );
  }, [loans]);

  const eligibility = computeEligibility({
    fico: credit?.fico ?? null,
    propertyCount,
    hasYearOfOwnership,
    creditExpired: credit?.is_expired ?? false,
    creditExpiringSoon: credit?.expiring_soon ?? false,
    daysUntilExpiry: credit?.days_until_expiry ?? null,
  });

  const [productKey, setProductKey] = useState<SimulatorInputs["productKey"]>("dscr");
  const [transactionType, setTransactionType] = useState<TransactionType>("purchase");
  const [arvText, setArvText] = useState("500000");
  const [brvText, setBrvText] = useState("400000");
  const [rehabText, setRehabText] = useState("80000");
  const [payoffText, setPayoffText] = useState("0");
  const [points, setPoints] = useState(1);
  const initialLtvPct = Math.min(eligibility.maxLTV * 100 || 65, 65);
  const [ltvPct, setLtvPct] = useState(initialLtvPct);
  // Manual loan-amount override. null = derive from LTV slider.
  const [requestedLoanText, setRequestedLoanText] = useState<string | null>(null);
  // DSCR — borrower's actual monthly rent. Empty string falls back to the
  // 0.85% of loan-amount estimate inside computeSimulator.
  const [monthlyRentText, setMonthlyRentText] = useState("");
  // HUD detail expander — opens when the borrower clicks "Estimated cash to close".
  const [showHud, setShowHud] = useState(false);

  const arvNum = Number(arvText.replace(/[^0-9.]/g, "")) || 0;
  const brvNum = Number(brvText.replace(/[^0-9.]/g, "")) || 0;
  const rehabNum = Number(rehabText.replace(/[^0-9.]/g, "")) || 0;
  const payoffNum = Number(payoffText.replace(/[^0-9.]/g, "")) || 0;
  const monthlyRentNum = Number(monthlyRentText.replace(/[^0-9.]/g, "")) || 0;
  const requestedLoanNum =
    requestedLoanText != null ? Number(requestedLoanText.replace(/[^0-9.]/g, "")) || 0 : null;
  const isBlocked = eligibility.tier === "blocked";
  const maxLtvPct = eligibility.maxLTV * 100;
  const reno = productKey === "ff" || productKey === "gu";
  const isRefi = productKey === "dscr" && transactionType === "refi";
  const propertyLabel = reno
    ? "ARV (After Repair Value)"
    : isRefi
      ? "Property Value"
      : "Market Value";

  // Map the client-simulator product key to a FRED series and use today's
  // rate (index + spread). Falls back to the hardcoded table inside
  // computeSimulator when FRED isn't available.
  const clientSeriesId = ((): string => {
    switch (productKey) {
      case "dscr": return "DGS10";
      case "ff":   return "DPRIME";
      case "gu":   return "DPRIME";
      case "br":   return "SOFR";
    }
  })();
  const liveRate = fred?.find((s) => s.series_id === clientSeriesId);
  const baseRatePct = liveRate?.estimated_rate ?? undefined;

  const result = useMemo(() => {
    if (isBlocked || arvNum <= 0) return null;
    return computeSimulator({
      arv: arvNum,
      ltv: ltvPct / 100,
      discountPoints: points,
      productKey,
      baseRatePct,
      transactionType: productKey === "dscr" ? transactionType : undefined,
      payoff: isRefi ? payoffNum : undefined,
      brv: reno ? brvNum : undefined,
      rehabBudget: reno ? rehabNum : undefined,
      requestedLoanAmount: requestedLoanNum ?? undefined,
      ltvTierCap: eligibility.maxLTV > 0 ? eligibility.maxLTV : undefined,
      monthlyRent: productKey === "dscr" && monthlyRentNum > 0 ? monthlyRentNum : undefined,
    });
  }, [
    isBlocked,
    arvNum,
    ltvPct,
    points,
    productKey,
    baseRatePct,
    transactionType,
    isRefi,
    payoffNum,
    reno,
    brvNum,
    rehabNum,
    requestedLoanNum,
    monthlyRentNum,
    eligibility.maxLTV,
  ]);

  // When the loan amount is manually entered and clamps, snap the LTV
  // slider to match — otherwise the slider lies about what the borrower
  // is actually getting.
  useEffect(() => {
    if (!result || requestedLoanText == null || arvNum <= 0) return;
    const matchedLtv = Math.round((result.loanAmount / arvNum) * 100);
    if (Math.abs(matchedLtv - ltvPct) > 0) setLtvPct(matchedLtv);
  }, [result?.loanAmount, requestedLoanText, arvNum]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Segmented control — Free Simulate | My Loans */}
      <div
        style={{
          display: "flex",
          gap: 4,
          background: t.chip,
          borderRadius: 12,
          padding: 3,
          alignSelf: "stretch",
        }}
      >
        {(
          [
            { id: "free" as const, label: "Free Simulate" },
            {
              id: "started" as const,
              label: `My Loans${loans.length ? ` (${loans.length})` : ""}`,
            },
          ]
        ).map((opt) => {
          const active = simTab === opt.id;
          return (
            <button
              key={opt.id}
              onClick={() => {
                setSimTab(opt.id);
                setPickedLoanId(null);
              }}
              style={{
                all: "unset",
                flex: 1,
                padding: "9px 0",
                borderRadius: 9,
                background: active ? t.surface : "transparent",
                color: active ? t.ink : t.ink3,
                fontSize: 13,
                fontWeight: 700,
                cursor: "pointer",
                textAlign: "center",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {simTab === "started" ? (
        pickedLoan ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <button
              onClick={() => setPickedLoanId(null)}
              style={{
                all: "unset",
                cursor: "pointer",
                color: t.brand,
                fontSize: 13,
                fontWeight: 700,
                alignSelf: "flex-start",
              }}
            >
              ‹ My Loans
            </button>
            <LoanSimulator loan={pickedLoan} />
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PrequalRequestsSection />
            <DesktopMyLoansList
              loans={loans}
              onPick={setPickedLoanId}
              onSwitchToFree={() => setSimTab("free")}
            />
          </div>
        )
      ) : (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 20 }}>
      {/* LEFT — calculator, controls, results, amortization. The focal area. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        {/* Slim 2-line results header with DP slider attached, cash-to-close clickable. */}
        <SlimTermsHeader
          t={t}
          result={result}
          isBlocked={isBlocked}
          productKey={productKey}
          points={points}
          setPoints={setPoints}
          showHud={showHud}
          setShowHud={setShowHud}
        />

        {/* Amortization at the bottom of the focal column. */}
        {result && result.loanAmount > 0 && result.rate > 0 ? (
          <AmortizationSchedule
            loanAmount={result.loanAmount}
            annualRate={result.rate}
            termMonths={productKey === "dscr" ? 360 : 0}
            monthlyPI={result.monthlyPI}
          />
        ) : null}
      </div>

      {/* RIGHT — controls panel: credit (compact) → product → property+sizing.
          Stacked vertically so the borrower reads identity → product →
          deal inputs in one column. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <CollapsibleCreditSummary
          summary={creditSummary ?? null}
          fico={credit?.fico ?? null}
          propertyCount={propertyCount}
          hasYearOfOwnership={hasYearOfOwnership}
          banner={eligibility.banner ?? null}
        />

        {/* Product selector — directly under the credit pill. */}
        <Card pad={14}>
          <div style={{ display: "flex", gap: 4, background: t.chip, borderRadius: 11, padding: 3 }}>
            {(
              [
                { id: "dscr", label: "DSCR Rental",   sub: "30 yr" },
                { id: "ff",   label: "Fix & Flip",    sub: "12 mo" },
                { id: "gu",   label: "Ground Up",     sub: "18 mo" },
                { id: "br",   label: "Bridge",        sub: "24 mo" },
              ] as const
            ).filter((p) => isProductKeyEnabled(p.id)).map((p) => {
              const active = productKey === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setProductKey(p.id)}
                  style={{
                    all: "unset",
                    flex: 1,
                    padding: "8px 0",
                    borderRadius: 9,
                    background: active ? t.surface : "transparent",
                    color: active ? t.ink : t.ink3,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: "pointer",
                    textAlign: "center",
                  }}
                >
                  {p.label}
                  <div style={{ fontSize: 9.5, fontWeight: 600, color: active ? t.ink3 : t.ink4, marginTop: 2 }}>{p.sub}</div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Merged Property + Rent + Loan amount + LTV card. Loan amount
            sits directly under the property values so the borrower reads
            "property worth → loan" as one unit. */}
        <Card pad={18}>
          <SectionLabel>{reno ? "Property values & loan sizing" : "Property & loan sizing"}</SectionLabel>

          {productKey === "dscr" ? (
            <div style={{ marginBottom: 12, display: "flex", gap: 4, background: t.chip, borderRadius: 11, padding: 3 }}>
              {(["purchase", "refi"] as const).map((tx) => {
                const active = transactionType === tx;
                return (
                  <button
                    key={tx}
                    onClick={() => setTransactionType(tx)}
                    style={{
                      all: "unset",
                      flex: 1,
                      padding: "7px 0",
                      borderRadius: 9,
                      background: active ? t.surface : "transparent",
                      color: active ? t.ink : t.ink3,
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                      textAlign: "center",
                    }}
                  >
                    {tx === "purchase" ? "Purchase" : "Refinance"}
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Property values — single column in the narrow right rail. */}
          {reno ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ArvField label="Purchase price (BRV)" value={brvText} onChange={setBrvText} hint="As-is purchase" />
              <ArvField label="Rehab budget" value={rehabText} onChange={setRehabText} hint="Repair cost" />
              <ArvField label={propertyLabel} value={arvText} onChange={setArvText} hint="After repair value" />
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <ArvField label={propertyLabel} value={arvText} onChange={setArvText} hint={isRefi ? "Today's appraised value" : "Loan = Market Value × LTV"} />
              {/* Loan amount sits directly beneath Market Value. */}
              <ArvField
                label={`Loan amount${result ? ` · max ${QC_FMT.usd(result.maxLoan, 0)}` : ""}`}
                value={
                  requestedLoanText ??
                  (result ? Math.round(result.loanAmount).toString() : "")
                }
                onChange={(v) => setRequestedLoanText(v)}
                hint={
                  result?.clamped
                    ? cappedReasonLabel(result.bindingConstraint, result.maxLoan)
                    : "Type to override; will clamp to cap on blur"
                }
              />
              {isRefi ? (
                <ArvField label="Existing payoff" value={payoffText} onChange={setPayoffText} hint="Mortgage balance to pay off" />
              ) : null}
              {productKey === "dscr" ? (
                <ArvField
                  label="Monthly rent"
                  value={monthlyRentText}
                  onChange={setMonthlyRentText}
                  hint={
                    monthlyRentNum > 0
                      ? "Drives DSCR + cash flow"
                      : "Auto ≈ 0.85% of loan if blank"
                  }
                />
              ) : null}
            </div>
          )}

          {reno ? (
            // For reno, loan-amount lives under the renovation grid for
            // the same "property → loan" reading order.
            <div style={{ marginTop: 12 }}>
              <ArvField
                label={`Loan amount${result ? ` · max ${QC_FMT.usd(result.maxLoan, 0)}` : ""}`}
                value={
                  requestedLoanText ??
                  (result ? Math.round(result.loanAmount).toString() : "")
                }
                onChange={(v) => setRequestedLoanText(v)}
                hint={
                  result?.clamped
                    ? cappedReasonLabel(result.bindingConstraint, result.maxLoan)
                    : "Type to override; will clamp to cap on blur"
                }
              />
            </div>
          ) : null}

          {liveRate?.estimated_rate != null ? (
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 10 }}>
              Today's base rate · {liveRate.label} +{liveRate.spread_bps} bps · <strong>{liveRate.estimated_rate.toFixed(3)}%</strong>
            </div>
          ) : null}

          {/* LTV section. */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginTop: 16, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
                {reno ? "Loan sizing" : "Loan-to-value"}
              </div>
              <div style={{ fontSize: 11, color: t.ink4, marginTop: 1 }}>
                {result ? bindingConstraintLabel(result.bindingConstraint) : ltvLabel(ltvPct / 100)}
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
              {result ? `${(result.effectiveLtv * 100).toFixed(0)}%` : `${ltvPct}%`}
            </div>
          </div>

          {result && arvNum > 0 ? (
            <div style={{ marginBottom: 10 }}>
              <RangeGauge
                current={result.effectiveLtv}
                max={reno ? Math.max(0.001, result.maxLoan / Math.max(arvNum, 1)) : result.effectiveLtvCap ?? eligibility.maxLTV}
                tiers={[0.6, 0.65, 0.7, 0.75]}
                lockedAbove={eligibility.maxLTV}
                binding={result.clamped ? result.bindingConstraint as ("ltv" | "ltc" | "arv" | "refi-cap") : undefined}
                markers={
                  isRefi && payoffNum > 0 && arvNum > 0
                    ? [{ at: payoffNum / arvNum, label: "payoff", tone: "muted" }]
                    : undefined
                }
                secondaryCap={
                  reno && arvNum > 0
                    ? { at: 0.7, label: "ARV cap" }
                    : undefined
                }
              />
            </div>
          ) : null}

          {!reno ? (
            <>
              <input
                type="range"
                min={60}
                max={isBlocked ? 60 : Math.min(maxLtvPct, isRefi ? 75 : 80)}
                step={1}
                value={ltvPct}
                disabled={isBlocked}
                onChange={(e) => {
                  setLtvPct(Number(e.target.value));
                  setRequestedLoanText(null);
                }}
                style={{ width: "100%", accentColor: t.petrol, opacity: isBlocked ? 0.4 : 1 }}
              />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
                {[60, 65, 70, 75].map((tick) => {
                  const locked = !isBlocked && tick > maxLtvPct;
                  return (
                    <span
                      key={tick}
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 0.4,
                        color: locked ? t.ink4 : ltvPct === tick ? t.ink : t.ink3,
                      }}
                    >
                      {tick}%{locked ? " 🔒" : ""}
                    </span>
                  );
                })}
              </div>
            </>
          ) : null}

          {!isBlocked && eligibility.maxLTV < 0.75 && !reno ? (
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
              70% and 75% locked at this tier.
            </div>
          ) : null}
        </Card>
      </div>
    </div>
      )}
    </div>
  );
}

function DesktopMyLoansList({
  loans,
  onPick,
  onSwitchToFree,
}: {
  loans: Loan[];
  onPick: (loanId: string) => void;
  onSwitchToFree: () => void;
}) {
  const { t } = useTheme();
  if (loans.length === 0) {
    return (
      <Card pad={24}>
        <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, letterSpacing: -0.3 }}>
          No started loans yet
        </div>
        <div style={{ fontSize: 13, color: t.ink3, marginTop: 6, lineHeight: 1.5 }}>
          Once a loan is started, you'll see it here with a locked-terms view. Until then, use Free
          Simulate to model what a deal could look like.
        </div>
        <button
          onClick={onSwitchToFree}
          style={{
            all: "unset",
            marginTop: 14,
            padding: "11px 16px",
            borderRadius: 10,
            background: t.brand,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open Free Simulate
        </button>
      </Card>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {loans.map((loan) => {
        const arvNum = loan.arv != null ? Number(loan.arv) : 0;
        const ltvPct = loan.ltv != null ? Math.round(Number(loan.ltv) * 100) : null;
        return (
          <button
            key={loan.id}
            onClick={() => onPick(loan.id)}
            style={{
              all: "unset",
              cursor: "pointer",
              display: "block",
            }}
          >
            <Card pad={16}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: t.ink,
                      letterSpacing: -0.3,
                    }}
                  >
                    {loan.address || "Unnamed loan"}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                    {loan.type.replace(/_/g, " ")} · {loan.stage.replace(/_/g, " ")}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 800,
                      color: t.ink,
                      fontFeatureSettings: '"tnum"',
                    }}
                  >
                    {arvNum > 0 ? QC_FMT.short(arvNum) : "—"}
                  </div>
                  <div style={{ fontSize: 10.5, color: t.ink3, marginTop: 1 }}>
                    {ltvPct != null ? `${ltvPct}% LTV` : "—"}
                  </div>
                </div>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

function ArvField({
  value,
  onChange,
  label = "ARV (After Repair Value)",
  hint = "Loan amount = ARV × LTV.",
}: {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  hint?: string;
}) {
  const { t } = useTheme();
  const num = Number(value.replace(/[^0-9.]/g, "")) || 0;
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.2,
          textTransform: "uppercase",
          color: t.ink3,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${t.lineStrong}`,
          borderRadius: 11,
          background: t.surface2,
          padding: "0 12px",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, color: t.ink3, marginRight: 4 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
          placeholder="500000"
          style={{
            flex: 1,
            padding: "12px 0",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 18,
            fontWeight: 700,
            color: t.ink,
            fontFamily: "inherit",
            fontFeatureSettings: '"tnum"',
          }}
        />
        {num >= 1000 ? (
          <span style={{ fontSize: 12, color: t.ink3, marginLeft: 8, whiteSpace: "nowrap" }}>
            {QC_FMT.short(num)}
          </span>
        ) : null}
      </div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>{hint}</div>
    </div>
  );
}

// ── Free-calc mode (no loan record) ────────────────────────────────────────

// Mirrors backend `PRODUCT_SERIES_MAP` in services/fred.py — keep in sync.
// The base rate fed to /loans/calc comes from the FRED card for whichever
// series this loan type is benchmarked against, plus the active lender spread.
const LOAN_TYPE_TO_SERIES: Record<LoanType, string> = {
  [LoanType.DSCR]: "DGS10",
  [LoanType.FIX_AND_FLIP]: "DPRIME",
  [LoanType.GROUND_UP]: "DPRIME",
  [LoanType.BRIDGE]: "SOFR",
  [LoanType.PORTFOLIO]: "DGS5",
  [LoanType.CASH_OUT_REFI]: "DGS10",
};

const FALLBACK_RATE_BY_TYPE: Record<LoanType, number> = {
  [LoanType.DSCR]: 0.0775,
  [LoanType.FIX_AND_FLIP]: 0.1075,
  [LoanType.GROUND_UP]: 0.1125,
  [LoanType.BRIDGE]: 0.0925,
  [LoanType.PORTFOLIO]: 0.0825,
  [LoanType.CASH_OUT_REFI]: 0.0825,
};

function pickRate(type: LoanType, fred: FredSeriesSummary[] | undefined): {
  rate: number;
  source: "live" | "fallback";
  series?: FredSeriesSummary;
} {
  const seriesId = LOAN_TYPE_TO_SERIES[type];
  const match = fred?.find((s) => s.series_id === seriesId);
  if (match && match.estimated_rate != null) {
    return { rate: match.estimated_rate / 100, source: "live", series: match };
  }
  return { rate: FALLBACK_RATE_BY_TYPE[type], source: "fallback" };
}

function isReno(type: LoanType): boolean {
  return type === LoanType.FIX_AND_FLIP || type === LoanType.GROUND_UP;
}

function FreeCalcMode({ t, sim }: { t: ReturnType<typeof useTheme>["t"]; sim: SimulatorSettings }) {
  const calc = useFreeCalc();
  const { data: fred } = useFredSeries();
  const [type, setType] = useState<LoanType>(LoanType.DSCR);
  const [propertyType, setPropertyType] = useState<PropertyType>(PropertyType.SFR);
  // Property values — Market Value for stabilized products, BRV+ARV for reno.
  const [marketValue, setMarketValue] = useState(650_000);
  const [brv, setBrv] = useState(450_000);
  const [arv, setArv] = useState(750_000);
  const [amount, setAmount] = useState(500_000);
  const [points, setPoints] = useState(0);
  const [annualTaxes, setAnnualTaxes] = useState(6000);
  const [annualInsurance, setAnnualInsurance] = useState(1800);
  const [monthlyHoa, setMonthlyHoa] = useState(0);
  const [monthlyRent, setMonthlyRent] = useState(4500);

  const isDscr = type === LoanType.DSCR;
  const reno = isReno(type);

  const { rate: baseRate, source: rateSource, series: rateSeries } = pickRate(type, fred);
  // Effective rate after points buy-down (matches backend pricing_quote): each
  // discount point trims 25 bps off the base rate, capped at the floor.
  const finalRate = Math.max(0.04, baseRate - (points * 25) / 10_000);
  // HUD impact: discount points line item = points% × loan amount.
  const pointsCost = (points / 100) * amount;
  // Reno LTV reference (FF/GU typically priced off ARV).
  const arvLtv = reno && arv > 0 ? amount / arv : null;
  const marketLtv = !reno && marketValue > 0 ? amount / marketValue : null;

  const submit = () => {
    calc.mutate({
      type,
      property_type: propertyType,
      loan_amount: amount,
      base_rate: baseRate,
      discount_points: points,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: isDscr ? monthlyRent : null,
    });
  };

  return (
    <>
      <Card pad={16}>
        <SectionLabel>Loan parameters</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          <Field t={t} label="Loan type">
            <select value={type} onChange={(e) => setType(e.target.value as LoanType)} style={inputStyle(t)}>
              {LOAN_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field t={t} label="Property type">
            <select
              value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as PropertyType)}
              style={inputStyle(t)}
            >
              <option value={PropertyType.SFR}>Single family</option>
              <option value={PropertyType.UNITS_2_4}>2-4 units</option>
              <option value={PropertyType.UNITS_5_8}>5-8 units</option>
              <option value={PropertyType.MIXED_USE}>Mixed use</option>
              <option value={PropertyType.COMMERCIAL}>Commercial</option>
            </select>
          </Field>
        </div>

        <div style={{ height: 14 }} />
        <SectionLabel>{reno ? "Property values" : "Property"}</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: reno ? "1fr 1fr" : "1fr 1fr", gap: 12 }}>
          {reno ? (
            <>
              <CurrencyField t={t} label="Before Repair Value (BRV)" value={brv} onChange={setBrv} />
              <CurrencyField t={t} label="After Repair Value (ARV)" value={arv} onChange={setArv} />
            </>
          ) : (
            <CurrencyField t={t} label="Market Value" value={marketValue} onChange={setMarketValue} />
          )}
          <CurrencyField
            t={t}
            label="Loan amount"
            value={amount}
            onChange={setAmount}
            hint={
              reno
                ? arvLtv != null
                  ? `${(arvLtv * 100).toFixed(1)}% loan-to-ARV`
                  : undefined
                : marketLtv != null
                  ? `${(marketLtv * 100).toFixed(1)}% LTV`
                  : undefined
            }
          />
        </div>

        <div style={{ height: 14 }} />
        <SectionLabel>Today's rate</SectionLabel>
        <RateCard
          t={t}
          baseRate={baseRate}
          finalRate={finalRate}
          points={points}
          source={rateSource}
          series={rateSeries}
        />

        <div style={{ height: 14 }} />
        <SectionLabel>Discount points (alters HUD)</SectionLabel>
        <PointsSlider
          t={t}
          value={points}
          onChange={setPoints}
          min={sim.points_min}
          max={sim.points_max}
          step={sim.points_step}
          loanAmount={amount}
          pointsCost={pointsCost}
        />

        <div style={{ height: 14 }} />
        <SectionLabel>Carrying costs (monthly P&I and DSCR)</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {sim.show_taxes && (
            <NumberField t={t} label="Annual taxes ($)" value={annualTaxes} onChange={setAnnualTaxes} step={100} />
          )}
          {sim.show_insurance && (
            <NumberField t={t} label="Annual insurance ($)" value={annualInsurance} onChange={setAnnualInsurance} step={100} />
          )}
          {sim.show_hoa && (
            <NumberField t={t} label="Monthly HOA ($)" value={monthlyHoa} onChange={setMonthlyHoa} step={25} />
          )}
          {isDscr && (
            <NumberField t={t} label="Monthly rent ($)" value={monthlyRent} onChange={setMonthlyRent} step={50} />
          )}
        </div>
      </Card>

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button onClick={submit} disabled={calc.isPending} style={qcBtnPrimary(t)}>
          <Icon name="refresh" size={13} /> {calc.isPending ? "Calculating…" : "Calculate"}
        </button>
      </div>

      {calc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {calcErrorMessage(calc.error)}
        </Pill>
      )}
      {calc.data && <ResultsCard t={t} result={calc.data} />}
    </>
  );
}

// 405/404 from /loans/calc means the backend route isn't on this environment
// yet — surface a friendlier message than the raw status text.
function calcErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Calculation failed";
  if (/\b(404|405)\b/.test(msg)) {
    return "Pricing engine isn't deployed on this environment yet. Redeploy qcbackend to enable Calculate.";
  }
  return msg;
}

// ── From-loan mode (existing pipeline loan) ────────────────────────────────

function FromLoanMode({
  t,
  sim,
  loans,
}: {
  t: ReturnType<typeof useTheme>["t"];
  sim: SimulatorSettings;
  loans: ReturnType<typeof useLoans>["data"];
}) {
  const recalc = useRecalc();
  const [activeLoanId, setActiveLoanId] = useState<string | null>(null);
  const [points, setPoints] = useState(0);

  const activeLoan = useMemo(() => loans?.find((l) => l.id === activeLoanId) ?? null, [loans, activeLoanId]);

  useEffect(() => {
    if (activeLoan) setPoints(Number(activeLoan.discount_points ?? 0));
  }, [activeLoan]);

  const pointsOptions = useMemo(() => {
    const out: number[] = [];
    for (let p = sim.points_min; p <= sim.points_max + 1e-9; p += sim.points_step) {
      out.push(+p.toFixed(2));
    }
    return out;
  }, [sim.points_min, sim.points_max, sim.points_step]);

  const submit = () => {
    if (!activeLoanId) return;
    recalc.mutate({ loanId: activeLoanId, discount_points: points });
  };

  return (
    <>
      <Card pad={16}>
        <SectionLabel>Pick a loan</SectionLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(loans ?? []).length === 0 && (
            <div style={{ fontSize: 13, color: t.ink3 }}>
              No loans yet. Switch to <strong>Free calculation</strong> above, or create one from
              the <strong>Pipeline</strong> page.
            </div>
          )}
          {(loans ?? []).map((l) => {
            const active = activeLoanId === l.id;
            return (
              <button
                key={l.id}
                onClick={() => setActiveLoanId(l.id)}
                style={{
                  ...qcBtn(t),
                  background: active ? t.ink : t.surface,
                  color: active ? t.inverse : t.ink2,
                  border: active ? "none" : `1px solid ${t.lineStrong}`,
                }}
              >
                {l.deal_id} · {l.type.replace("_", " ")}
              </button>
            );
          })}
        </div>
      </Card>

      {activeLoan && (
        <Card pad={16}>
          <SectionLabel>Discount points</SectionLabel>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {pointsOptions.map((p) => {
              const active = points === p;
              return (
                <button
                  key={p}
                  onClick={() => setPoints(p)}
                  style={{
                    ...qcBtn(t),
                    minWidth: 60,
                    justifyContent: "center",
                    padding: "5px 10px",
                    fontSize: 12,
                    background: active ? t.petrol : t.surface,
                    color: active ? "#fff" : t.ink2,
                    border: active ? "none" : `1px solid ${t.lineStrong}`,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {p.toFixed(2)}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {activeLoan && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={submit} disabled={recalc.isPending} style={qcBtnPrimary(t)}>
            <Icon name="refresh" size={13} /> {recalc.isPending ? "Recalculating…" : "Recalculate"}
          </button>
        </div>
      )}

      {recalc.error && (
        <Pill bg={t.dangerBg} color={t.danger}>
          {recalc.error instanceof Error ? recalc.error.message : "Recalc failed"}
        </Pill>
      )}
      {recalc.data && <ResultsCard t={t} result={recalc.data} />}
    </>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────

function ResultsCard({ t, result }: { t: ReturnType<typeof useTheme>["t"]; result: RecalcResponse }) {
  return (
    <Card pad={20}>
      <SectionLabel>Results</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <ResultStat t={t} label="Final rate" value={`${(result.final_rate * 100).toFixed(3)}%`} />
        <ResultStat t={t} label="Monthly P&I" value={QC_FMT.usd(result.monthly_pi)} />
        {result.dscr != null ? (
          <ResultStat t={t} label="DSCR" value={result.dscr.toFixed(2)} />
        ) : (
          <div />
        )}
        <ResultStat t={t} label="Cash to close" value={QC_FMT.usd(result.cash_to_close_pricing)} />
        <ResultStat t={t} label="HUD-1 total" value={QC_FMT.usd(result.hud_total)} />
      </div>
      {result.warnings && result.warnings.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {result.warnings.map((w, i) => {
            const isBlock = w.severity === "block";
            return (
              <Pill
                key={(w.code ?? `w-${i}`) as string}
                bg={isBlock ? t.dangerBg : t.warnBg}
                color={isBlock ? t.danger : t.warn}
              >
                {w.message}
              </Pill>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function ModeButton({
  t,
  active,
  onClick,
  children,
}: {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 14px",
        borderRadius: 9,
        background: active ? t.ink : t.surface,
        color: active ? t.inverse : t.ink2,
        border: active ? "none" : `1px solid ${t.lineStrong}`,
        fontSize: 12.5,
        fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function ResultStat({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <div
      style={{
        background: t.surface2,
        border: `1px solid ${t.line}`,
        borderRadius: 10,
        padding: 14,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function NumberField({
  t,
  label,
  value,
  onChange,
  step,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  onChange: (n: number) => void;
  step: number;
}) {
  return (
    <Field t={t} label={label}>
      <input
        type="number"
        value={value}
        step={step}
        min={0}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        style={inputStyle(t)}
      />
    </Field>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    fontFeatureSettings: '"tnum"',
  };
}

function CurrencyField({
  t,
  label,
  value,
  onChange,
  hint,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: number;
  onChange: (n: number) => void;
  hint?: string;
}) {
  // Render the digits formatted with thousands separators while editing —
  // operators size up loan amounts in chunks of $25k, raw "500000" is hard
  // to scan.
  const display = Number.isFinite(value) ? value.toLocaleString("en-US") : "";
  return (
    <Field t={t} label={label}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          border: `1px solid ${t.lineStrong}`,
          borderRadius: 11,
          background: t.surface2,
          padding: "0 12px",
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: t.ink3, marginRight: 4 }}>$</span>
        <input
          type="text"
          inputMode="numeric"
          value={display}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^0-9]/g, "");
            onChange(raw === "" ? 0 : Number(raw));
          }}
          style={{
            flex: 1,
            padding: "11px 0",
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 16,
            fontWeight: 700,
            color: t.ink,
            fontFamily: "inherit",
            fontFeatureSettings: '"tnum"',
          }}
        />
        {value >= 1000 ? (
          <span style={{ fontSize: 11, color: t.ink3, marginLeft: 8, whiteSpace: "nowrap" }}>
            {QC_FMT.short(value)}
          </span>
        ) : null}
      </div>
      {hint ? (
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 6, fontFeatureSettings: '"tnum"' }}>{hint}</div>
      ) : null}
    </Field>
  );
}

function RateCard({
  t,
  baseRate,
  finalRate,
  points,
  source,
  series,
}: {
  t: ReturnType<typeof useTheme>["t"];
  baseRate: number;
  finalRate: number;
  points: number;
  source: "live" | "fallback";
  series?: FredSeriesSummary;
}) {
  const isLive = source === "live";
  return (
    <div
      style={{
        border: `1px solid ${t.lineStrong}`,
        borderRadius: 12,
        padding: "14px 16px",
        background: t.surface2,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
          {isLive && series ? `${series.label} + ${series.spread_bps} bps` : "Fallback (FRED unavailable)"}
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 3 }}>
          {isLive && series?.current_date
            ? `As of ${new Date(series.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · index ${series.current_value?.toFixed(3)}%`
            : "Backend isn't returning today's rate yet — using a sensible default."}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
          {(finalRate * 100).toFixed(3)}%
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
          {points > 0
            ? `Base ${(baseRate * 100).toFixed(3)}% · −${Math.round(points * 25)} bps`
            : `Base rate · no buy-down`}
        </div>
      </div>
    </div>
  );
}

function PointsSlider({
  t,
  value,
  onChange,
  min,
  max,
  step,
  loanAmount,
  pointsCost,
}: {
  t: ReturnType<typeof useTheme>["t"];
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
  step: number;
  loanAmount: number;
  pointsCost: number;
}) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>
            {min}–{max} pts · step {step}
          </div>
          <div style={{ fontSize: 10.5, color: t.ink4, marginTop: 1 }}>
            {value > 0
              ? `−${Math.round(value * 25)} bps off base · adds ${QC_FMT.usd(pointsCost, 0)} to HUD line 802`
              : "No buy-down · base rate · no HUD impact"}
          </div>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.4 }}>
          {value.toFixed(2)} pts
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: t.petrol }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        {Array.from({ length: Math.floor((max - min) / step) + 1 }).map((_, i) => {
          const tick = +(min + i * step).toFixed(2);
          const active = Math.abs(value - tick) < step / 2;
          return (
            <span
              key={tick}
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: active ? t.ink : t.ink3,
                fontFeatureSettings: '"tnum"',
              }}
            >
              {tick}
            </span>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: t.ink3, marginTop: 8 }}>
        Loan amount × points% = HUD line 802. {QC_FMT.usd(loanAmount, 0)} × {value.toFixed(2)}% = {QC_FMT.usd(pointsCost, 0)}.
      </div>
    </div>
  );
}

// ── Slim 2-line terms header with attached DP slider + HUD expander ────
// Replaces the previous tall "Simulated terms" Card. Line 1: 4 headline
// metrics (loan amount / rate / monthly P&I / DSCR-or-cash-to-close).
// Line 2: discount-points slider inline. Cash-to-close is a button that
// reveals the full HUD-style breakdown beneath the card.
function SlimTermsHeader({
  t,
  result,
  isBlocked,
  productKey,
  points,
  setPoints,
  showHud,
  setShowHud,
}: {
  t: ReturnType<typeof useTheme>["t"];
  result: import("@/lib/eligibility").SimulatorOutputs | null;
  isBlocked: boolean;
  productKey: "dscr" | "ff" | "gu" | "br";
  points: number;
  setPoints: (n: number) => void;
  showHud: boolean;
  setShowHud: (v: boolean) => void;
}) {
  if (!result) {
    return (
      <Card pad={16}>
        <div style={{ fontSize: 12.5, color: t.ink3 }}>
          {isBlocked
            ? "Resolve the eligibility issue in the right panel to run a simulation."
            : "Enter ARV to see simulated terms."}
        </div>
      </Card>
    );
  }
  const isDscr = productKey === "dscr";
  const dscrAccent = result.dscr == null ? t.ink2 : result.dscr > 1.25 ? t.profit : result.dscr > 1 ? t.warn : t.danger;
  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      {/* Line 1: 4 headline KPIs in a single row. */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isDscr ? "1.1fr 0.9fr 0.9fr 0.9fr 0.9fr" : "1.1fr 0.9fr 0.9fr 0.9fr",
          gap: 0,
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
          alignItems: "stretch",
        }}
      >
        <SlimStat t={t} label="Loan amount" value={QC_FMT.usd(result.loanAmount, 0)} />
        <SlimStat t={t} label="Final rate" value={`${(result.rate * 100).toFixed(3)}%`} accent={t.brand} />
        <SlimStat t={t} label="Monthly P&I" value={QC_FMT.usd(result.monthlyPI, 0)} />
        {isDscr && result.dscr != null ? (
          <SlimStat t={t} label="DSCR" value={result.dscr.toFixed(2)} accent={dscrAccent} />
        ) : null}
        <button
          onClick={() => setShowHud(!showHud)}
          aria-expanded={showHud}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "0 10px",
            borderLeft: `1px solid ${t.line}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              color: t.ink3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Cash to close <Icon name={showHud ? "chevU" : "chevD"} size={10} />
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
            {QC_FMT.usd(result.totalToClose, 0)}
          </div>
        </button>
      </div>

      {/* Line 2: DP slider + binding pill inline. */}
      <div
        style={{
          padding: "10px 18px 12px",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 140 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
            DP
          </span>
          <span style={{ fontSize: 14, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>
            {points.toFixed(2)}
          </span>
          <span style={{ fontSize: 10.5, color: t.ink3 }}>
            {points > 0 ? `−${Math.round(points * 25)} bps` : "no buy-down"}
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={2}
          step={0.25}
          value={points}
          disabled={isBlocked}
          onChange={(e) => setPoints(Number(e.target.value))}
          style={{ flex: 1, accentColor: t.petrol, opacity: isBlocked ? 0.4 : 1 }}
        />
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Pill bg={t.surface2} color={t.ink2}>
            {bindingConstraintLabel(result.bindingConstraint)}
          </Pill>
          {result.clamped ? <Pill bg={t.warnBg} color={t.warn}>capped</Pill> : null}
        </div>
      </div>

      {/* Inline HUD breakdown — expands below when cash-to-close is clicked. */}
      {showHud ? <HudBreakdown t={t} result={result} /> : null}
    </Card>
  );
}

function SlimStat({
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
    <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", paddingRight: 14, minWidth: 0 }}>
      <div style={{ fontSize: 9.5, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase", whiteSpace: "nowrap" }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 800,
          color: accent ?? t.ink,
          marginTop: 2,
          fontFeatureSettings: '"tnum"',
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
    </div>
  );
}

// HUD-1 style breakdown — the line items rolled up into Cash to Close.
// Hidden by default; revealed when the user clicks the Cash-to-close stat.
function HudBreakdown({
  t,
  result,
}: {
  t: ReturnType<typeof useTheme>["t"];
  result: import("@/lib/eligibility").SimulatorOutputs;
}) {
  const rows: Array<{ label: string; value: number; muted?: boolean }> = [
    { label: "Discount points", value: result.pointsCost },
    { label: "Origination (0.75%)", value: result.origination },
    { label: "Processing + underwriting", value: result.fixedFees },
    { label: "Title insurance (0.5%)", value: result.titleIns },
    { label: "Appraisal", value: result.appraisal },
    { label: "Recording + filing", value: result.recording },
  ];
  const sum = rows.reduce((s, r) => s + r.value, 0);
  return (
    <div style={{ borderTop: `1px solid ${t.line}`, padding: "12px 18px", background: t.surface2 }}>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Cash-to-close breakdown
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((r) => (
          <div
            key={r.label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12.5,
              color: t.ink2,
              fontFeatureSettings: '"tnum"',
            }}
          >
            <span>{r.label}</span>
            <span>{QC_FMT.usd(r.value, 0)}</span>
          </div>
        ))}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 13,
            fontWeight: 800,
            color: t.ink,
            borderTop: `1px solid ${t.line}`,
            paddingTop: 6,
            marginTop: 4,
            fontFeatureSettings: '"tnum"',
          }}
        >
          <span>Estimated cash to close</span>
          <span>{QC_FMT.usd(sum, 0)}</span>
        </div>
        {result.cashToBorrower != null ? (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: result.cashToBorrower >= 0 ? t.profit : t.danger,
              marginTop: 6,
              fontFeatureSettings: '"tnum"',
            }}
          >
            <span>{result.cashToBorrower >= 0 ? "Cash to borrower (refi)" : "Cash to close (refi gap)"}</span>
            <span>
              {result.cashToBorrower >= 0 ? "+" : ""}
              {QC_FMT.usd(result.cashToBorrower, 0)}
            </span>
          </div>
        ) : null}
        {result.cashToClose != null ? (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.ink2, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
            <span>Borrower equity into deal</span>
            <span>{QC_FMT.usd(result.cashToClose, 0)}</span>
          </div>
        ) : null}
        {result.totalCost != null ? (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: t.ink2, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
            <span>Total project cost</span>
            <span>{QC_FMT.usd(result.totalCost, 0)}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ── Collapsible credit + experience header ───────────────────────────────
// One compact pill at the top of the right column showing FICO + tier +
// experience signal + (if present) the eligibility banner — all clickable
// to expand into the full summary. Replaces the previous wider banner +
// CreditSummaryCard stack so the page can focus on the calculator.
function CollapsibleCreditSummary({
  summary,
  fico,
  propertyCount,
  hasYearOfOwnership,
  banner,
}: {
  summary: import("@/lib/types").CreditSummary | null;
  fico: number | null;
  propertyCount: number;
  hasYearOfOwnership: boolean;
  banner: import("@/lib/eligibility").EligibilityBanner | null;
}) {
  const { t } = useTheme();
  const [open, setOpen] = useState(false);

  // Compact experience label: "5 properties" / "2 properties · 1+ yr held"
  // / "no experience yet". Single-line, lives next to the credit tier.
  const expLabel =
    propertyCount === 0
      ? "no experience yet"
      : `${propertyCount} ${propertyCount === 1 ? "property" : "properties"}${
          hasYearOfOwnership ? " · 1+ yr held" : ""
        }`;

  const tierLabel = summary?.tier ?? (fico == null ? "no pull" : "tier unknown");
  const hasBanner = banner != null;

  // The whole header row is the toggle target — chevron sits inside the
  // same Card so it never visually escapes the container.
  return (
    <Card pad={0} style={{ overflow: "hidden" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          width: "100%",
          padding: "12px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          boxSizing: "border-box",
        }}
      >
        <div
          style={{
            fontSize: 20,
            fontWeight: 800,
            color: fico == null ? t.ink3 : t.ink,
            fontFeatureSettings: '"tnum"',
            minWidth: 36,
            textAlign: "center",
          }}
        >
          {fico ?? "—"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: t.ink3,
              letterSpacing: 0.8,
              textTransform: "uppercase",
            }}
          >
            Credit · {tierLabel}
          </div>
          <div
            style={{
              fontSize: 11.5,
              color: t.ink2,
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {expLabel}
            {hasBanner ? <span style={{ color: t.warn, fontWeight: 700 }}>  ·  ⚠ action</span> : null}
          </div>
        </div>
        <Icon name={open ? "chevU" : "chevD"} size={14} color={t.ink3} />
      </button>
      {open ? (
        <div
          style={{
            borderTop: `1px solid ${t.line}`,
            padding: 14,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {hasBanner ? <EligibilityBanner banner={banner} /> : null}
          {summary ? <CreditSummaryCard summary={summary} /> : (
            <div style={{ fontSize: 12, color: t.ink3 }}>
              No credit summary yet. Run a soft pull to see your file.
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

// ── Amortization schedule + P&I breakdown ─────────────────────────────────
// Client-side computation. For amortizing products (DSCR rental, term=360),
// renders a full month-by-month schedule with principal / interest / balance.
// For interest-only products (F&F, GU, Bridge), the schedule shows the
// fixed monthly interest payment plus a balloon principal payoff at term.
function AmortizationSchedule({
  loanAmount,
  annualRate,
  termMonths,
  monthlyPI,
}: {
  loanAmount: number;
  annualRate: number;
  termMonths: number;
  monthlyPI: number;
}) {
  const { t } = useTheme();
  const [showAll, setShowAll] = useState(false);

  const rows = useMemo(() => {
    const r = annualRate / 12;
    if (termMonths === 0) {
      // Interest-only — represent as a single recurring row + balloon note.
      return [{
        n: 1,
        principal: 0,
        interest: loanAmount * r,
        balance: loanAmount,
        cumulativePrincipal: 0,
        cumulativeInterest: loanAmount * r,
        isIO: true,
      }];
    }
    let balance = loanAmount;
    let cumPrin = 0;
    let cumInt = 0;
    const rows = [] as Array<{
      n: number; principal: number; interest: number; balance: number;
      cumulativePrincipal: number; cumulativeInterest: number; isIO?: boolean;
    }>;
    for (let n = 1; n <= termMonths; n++) {
      const interest = balance * r;
      const principal = Math.max(0, monthlyPI - interest);
      balance = Math.max(0, balance - principal);
      cumPrin += principal;
      cumInt += interest;
      rows.push({ n, principal, interest, balance, cumulativePrincipal: cumPrin, cumulativeInterest: cumInt });
    }
    return rows;
  }, [loanAmount, annualRate, termMonths, monthlyPI]);

  const isIO = rows[0]?.isIO === true;
  const totalInterest = isIO
    ? loanAmount * (annualRate / 12) * 12 // 1 yr of interest as ballpark for IO
    : rows[rows.length - 1]?.cumulativeInterest ?? 0;
  const visibleRows = isIO
    ? rows
    : showAll
      ? rows
      : [...rows.slice(0, 6), ...rows.slice(-6)];

  return (
    <Card pad={16}>
      <SectionLabel>Amortization & P&I breakdown</SectionLabel>
      {isIO ? (
        <div>
          <div style={{ fontSize: 12, color: t.ink2, lineHeight: 1.55, marginBottom: 12 }}>
            This is an <strong style={{ color: t.ink }}>interest-only</strong> product — the borrower
            pays interest each month and the full principal balloons at maturity.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Stat t={t} label="Monthly interest" value={QC_FMT.usd(rows[0].interest, 2)} />
            <Stat t={t} label="Balloon principal at maturity" value={QC_FMT.usd(loanAmount, 0)} accent={t.warn} />
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
            <Stat t={t} label="Total interest (life of loan)" value={QC_FMT.usd(totalInterest, 0)} accent={t.warn} />
            <Stat t={t} label="Total principal" value={QC_FMT.usd(loanAmount, 0)} />
            <Stat t={t} label="Total paid" value={QC_FMT.usd(loanAmount + totalInterest, 0)} />
          </div>
          <div
            style={{
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              overflow: "hidden",
              fontFeatureSettings: '"tnum"',
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "52px 1fr 1fr 1fr 1fr 60px 1fr",
                background: t.surface2,
                padding: "8px 12px",
                fontSize: 10,
                fontWeight: 700,
                color: t.ink3,
                letterSpacing: 0.6,
                textTransform: "uppercase",
                gap: 6,
              }}
            >
              <div>Month</div>
              <div>Principal</div>
              <div>Interest</div>
              <div>Interest paid</div>
              <div>Equity $</div>
              <div>Equity %</div>
              <div>Balance</div>
            </div>
            {visibleRows.map((row, idx) => {
              const prevRow = idx > 0 ? visibleRows[idx - 1] : null;
              const isGap = prevRow && row.n - prevRow.n > 1;
              const equityPct = loanAmount > 0 ? (row.cumulativePrincipal / loanAmount) * 100 : 0;
              return (
                <div key={row.n}>
                  {isGap ? (
                    <div
                      style={{
                        padding: "6px 12px",
                        fontSize: 11,
                        color: t.ink3,
                        background: t.surface2,
                        borderTop: `1px dashed ${t.line}`,
                        borderBottom: `1px dashed ${t.line}`,
                        textAlign: "center",
                      }}
                    >
                      … {prevRow ? row.n - prevRow.n - 1 : 0} months …
                    </div>
                  ) : null}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "52px 1fr 1fr 1fr 1fr 60px 1fr",
                      padding: "8px 12px",
                      fontSize: 11.5,
                      color: t.ink2,
                      borderTop: idx === 0 ? "none" : `1px solid ${t.line}`,
                      gap: 6,
                    }}
                  >
                    <div style={{ fontWeight: 700, color: t.ink }}>{row.n}</div>
                    <div>{QC_FMT.usd(row.principal, 2)}</div>
                    <div>{QC_FMT.usd(row.interest, 2)}</div>
                    <div style={{ color: t.warn }}>{QC_FMT.usd(row.cumulativeInterest, 0)}</div>
                    <div style={{ color: t.profit }}>{QC_FMT.usd(row.cumulativePrincipal, 0)}</div>
                    <div style={{ color: t.profit, fontWeight: 600 }}>{equityPct.toFixed(1)}%</div>
                    <div>{QC_FMT.usd(row.balance, 0)}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {!showAll && rows.length > 12 ? (
            <button
              onClick={() => setShowAll(true)}
              style={{
                ...qcBtn(t),
                marginTop: 10,
                width: "100%",
                fontSize: 12,
              }}
            >
              Show all {rows.length} months
            </button>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Stat({
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
    <div style={{ background: t.surface2, padding: "10px 12px", borderRadius: 9 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: t.ink3, letterSpacing: 0.8, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ fontSize: 16, fontWeight: 800, color: accent ?? t.ink, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}

// ── Borrower's Pre-Qualification requests block ─────────────────────────
// Lives at the top of the My Loans tab. Shows the borrower's recent
// requests with their status badges + a primary button to start a new
// request. Submitting from here also spawns a Loan stub in the pipeline.
function PrequalRequestsSection() {
  const { t } = useTheme();
  const { data: requests = [], isLoading } = useMyPrequalRequests();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.ink, letterSpacing: -0.2 }}>
            Pre-qualification letters
          </div>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
            Submit a target property → an underwriter reviews → letter PDF arrives here.
          </div>
        </div>
        <button onClick={() => setOpen(true)} style={qcBtnPrimary(t)}>
          <Icon name="plus" size={13} /> Request Pre-Qualification
        </button>
      </div>
      <PreQualRequestList
        requests={requests}
        isLoading={isLoading}
        emptyState="No pre-qualification requests yet. Click 'Request Pre-Qualification' to start your first one."
      />
      <PreQualRequestModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
