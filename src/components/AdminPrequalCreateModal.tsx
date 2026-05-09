"use client";

// Manual super-admin prequalification creation. Mirrors the
// borrower-side PreQualRequestModal wizard (loan type, deal details,
// LTV math, F&F scope-of-work) but adds two admin-only pieces:
//
//   1. Client linkage (mandatory). The admin either searches for an
//      existing client or creates one inline. The picked client_id
//      becomes the requester for the prequal — backend is responsible
//      for stamping requester_id from it.
//
//   2. Credit override panel. Manually-created prequals usually have
//      no ISoftPull on file, which would normally block the eligibility
//      math. The admin enters FICO + property count + year-of-ownership
//      so computeEligibility() unlocks the same tier-cap math the
//      borrower wizard uses. Override is per-prequal and persists on
//      the request row — it does NOT touch the Client's credit record.
//
// On submit, the new request lands as `pending` and is picked up by
// the existing admin queue + PrequalReviewModal — approve / regenerate
// PDF / accept-decline are unchanged from the borrower flow.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { RightPanel } from "@/components/design-system/RightPanel";
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
  // the regulating value (see maxLoan + the LTV pill below).
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
  // (so they see the LTV pill), but submit is gated on a non-zero cap.
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

  // The "loan / regulating value" ratio shown in the LTV pill. For
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

  const footer = doneFlash ? null : (
    <>
      {isFixFlip && step === 2 ? (
        <button onClick={() => setStep(1)} style={{ ...qcBtn(t), marginRight: "auto" }}>
          ← Back
        </button>
      ) : null}
      <button onClick={onClose} style={qcBtn(t)}>Cancel</button>
      {isFixFlip && step === 1 ? (
        <button
          onClick={() => {
            if (!step1Valid) {
              setError("Complete client linkage, FICO override, address, BRV, ARV, and requested loan before continuing.");
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
          {submit.isPending ? "Submitting…" : "Submit prequalification"}
        </button>
      )}
    </>
  );

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      eyebrow="Manual prequalification · super-admin"
      title="Create prequalification"
      ariaLabel="Create manual prequalification"
      footer={footer}
    >
      {doneFlash ? (
        <Card pad={28}>
          <div style={{ textAlign: "center" }}>
            <Pill bg={t.profitBg} color={t.profit}>
              <Icon name="check" size={11} stroke={3} /> Created
            </Pill>
            <div style={{ marginTop: 14, fontSize: 16, fontWeight: 700, color: t.ink }}>
              Pending review
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
              The new prequalification is in the queue. Open it to approve and
              generate the letter PDF.
            </div>
          </div>
        </Card>
      ) : (
        <>
          {/* Step indicator (F&F only, since non-F&F is a single page). */}
          {isFixFlip ? (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: t.ink3 }}>
              <span style={{ color: step === 1 ? t.brand : t.ink3 }}>1 · Client + deal</span>
              <span style={{ color: t.ink4 }}>›</span>
              <span style={{ color: step === 2 ? t.brand : t.ink4 }}>2 · Scope of work</span>
            </div>
          ) : null}

          {step === 1 ? (
            <>
              {/* ── Client linkage ─────────────────────────────────────── */}
              <Card pad={16}>
                <SectionLabel>Client (required)</SectionLabel>
                {pickedClient ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "10px 12px",
                      background: t.brandSoft,
                      border: `1px solid ${t.brand}`,
                      borderRadius: 9,
                    }}
                  >
                    <Icon name="check" size={12} stroke={3} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pickedClient.name}
                      </div>
                      <div style={{ fontSize: 11, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pickedClient.email ?? "—"}
                        {pickedClient.phone ? ` · ${pickedClient.phone}` : ""}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPickedClient(null)}
                      style={{ ...qcBtn(t), padding: "6px 10px", fontSize: 11 }}
                    >
                      Change
                    </button>
                  </div>
                ) : createMode ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 11.5, color: t.ink3 }}>New client</span>
                      <button
                        type="button"
                        onClick={() => setCreateMode(false)}
                        style={{ ...qcBtn(t), padding: "4px 8px", fontSize: 11 }}
                      >
                        ← Search instead
                      </button>
                    </div>
                    <Input t={t} label="Name" value={newName} onChange={setNewName} placeholder="Marcus Holloway" />
                    <Input t={t} label="Email" value={newEmail} onChange={setNewEmail} placeholder="marcus@holloway.cap" type="email" />
                    <Input t={t} label="Phone" value={newPhone} onChange={setNewPhone} placeholder="(917) 555-0148" />
                    <button
                      type="button"
                      onClick={onLinkNewClient}
                      disabled={createClient.isPending || newName.trim().length < 2}
                      style={{
                        ...qcBtnPrimary(t),
                        alignSelf: "flex-start",
                        opacity: createClient.isPending || newName.trim().length < 2 ? 0.5 : 1,
                      }}
                    >
                      {createClient.isPending ? "Creating…" : "Save & link"}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <ClientSearchBlock
                      t={t}
                      label="Search by name or email"
                      onPick={(c) => setPickedClient(c)}
                    />
                    <button
                      type="button"
                      onClick={() => setCreateMode(true)}
                      style={{ ...qcBtn(t), alignSelf: "flex-start" }}
                    >
                      + Create new client
                    </button>
                  </div>
                )}
              </Card>

              {/* ── Credit override ────────────────────────────────────── */}
              <Card pad={16}>
                <SectionLabel>Credit override (super-admin)</SectionLabel>
                <div style={{ fontSize: 11.5, color: t.ink3, lineHeight: 1.45, marginBottom: 12 }}>
                  Manually-created prequals usually don&apos;t have a soft pull on file.
                  Set the FICO + portfolio context here so the LTV math unlocks. The
                  override persists on this prequal only.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input
                    t={t}
                    label="FICO (300–850)"
                    value={overrideFicoText}
                    onChange={setOverrideFicoText}
                    placeholder="720"
                    inputMode="numeric"
                  />
                  <Input
                    t={t}
                    label="Property count"
                    value={overridePropertyCountText}
                    onChange={setOverridePropertyCountText}
                    placeholder="0"
                    inputMode="numeric"
                  />
                </div>
                <label style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: t.ink2 }}>
                  <input
                    type="checkbox"
                    checked={overrideOwnership}
                    onChange={(e) => setOverrideOwnership(e.target.checked)}
                    style={{ accentColor: t.brand }}
                  />
                  Has 1+ year of property ownership
                </label>

                {eligibility.banner ? (
                  <div style={{ marginTop: 10 }}>
                    <Pill
                      bg={eligibility.tier === "blocked" ? t.dangerBg : t.warnBg}
                      color={eligibility.tier === "blocked" ? t.danger : t.warn}
                    >
                      {eligibility.banner.title}
                    </Pill>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 6, lineHeight: 1.4 }}>
                      {eligibility.banner.body}
                    </div>
                  </div>
                ) : (
                  <div style={{ marginTop: 10 }}>
                    <Pill bg={t.profitBg} color={t.profit}>
                      Tier {eligibility.tier} · max LTV {Math.round(tierCap * 100)}%
                    </Pill>
                  </div>
                )}
              </Card>

              {/* ── Loan program ───────────────────────────────────────── */}
              <Card pad={16}>
                <SectionLabel>Loan program</SectionLabel>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {PRODUCT_OPTIONS.map((id) => {
                    const meta = PREQUAL_LOAN_TYPE_LABELS[id];
                    const active = loanType === id;
                    const progCap = PREQUAL_LTV_CAPS[id];
                    const optEffective = tierCap > 0 ? Math.min(progCap, tierCap) : progCap;
                    const optTierBound = tierCap > 0 && tierCap < progCap;
                    return (
                      <button
                        key={id}
                        type="button"
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
              </Card>

              {/* ── Deal details ───────────────────────────────────────── */}
              <Card pad={16}>
                <SectionLabel>Deal details</SectionLabel>
                <Input
                  t={t}
                  label="Target property address"
                  value={address}
                  onChange={setAddress}
                  placeholder="123 Main St, Anytown, NJ 07026"
                />
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Input
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
                          style={{ all: "unset", cursor: "pointer", fontSize: 10.5, fontWeight: 700, color: t.petrol, letterSpacing: 0.4 }}
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
                      style={inputStyle(t)}
                    />
                  </div>
                </div>

                {isFixFlip ? (
                  <>
                    <div style={{ height: 10 }} />
                    <Input
                      t={t}
                      label="Estimated ARV (After Repair Value)"
                      value={arvText}
                      onChange={setArvText}
                      placeholder="600000"
                      inputMode="numeric"
                    />
                  </>
                ) : null}

                {((isFixFlip ? arvNum : purchaseNum) > 0 && loanNum > 0) ? (
                  <div style={{ marginTop: 8 }}>
                    <Pill
                      bg={ltvOverCap ? t.dangerBg : t.profitBg}
                      color={ltvOverCap ? t.danger : t.profit}
                    >
                      {isFixFlip ? "Requested LTARV" : "Requested LTV"} {(displayLtvRatio * 100).toFixed(1)}% ·{" "}
                      {ltvOverCap
                        ? `over ${Math.round(displayLtvCap * 100)}% cap${!isFixFlip && tierConstrained ? " (tier)" : ""} — adjust loan${isFixFlip ? " or ARV" : " or override"}`
                        : `within ${Math.round(displayLtvCap * 100)}% cap${!isFixFlip && tierConstrained ? " (tier-adjusted)" : ""}`}
                    </Pill>
                  </div>
                ) : null}

                <div style={{ height: 10 }} />
                <Input
                  t={t}
                  label="Expected closing date"
                  value={closingDate}
                  onChange={setClosingDate}
                  type="date"
                />

                <div style={{ height: 10 }} />
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
                      TBD — not formed yet
                    </label>
                  </div>
                  {!entityTBD ? (
                    <input
                      type="text"
                      value={entityName}
                      onChange={(e) => setEntityName(e.target.value)}
                      placeholder="e.g. Riverside Holdings LLC"
                      style={inputStyle(t)}
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
                      Letter will issue to the client&apos;s individual legal name.
                    </div>
                  )}
                </div>

                <div style={{ height: 10 }} />
                <div>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 5 }}>
                    Borrower notes (optional)
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                    placeholder="Captured during phone intake, reference docs, special instructions for the underwriter…"
                    rows={3}
                    style={{ ...inputStyle(t), resize: "vertical", minHeight: 60 }}
                  />
                  <div style={{ fontSize: 10, color: t.ink4, marginTop: 4, textAlign: "right" }}>
                    {notes.length}/500
                  </div>
                </div>
              </Card>
            </>
          ) : null}

          {isFixFlip && step === 2 ? (
            <Card pad={16}>
              <SectionLabel>Scope of work</SectionLabel>
              <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5, marginBottom: 14 }}>
                Add a row for each major rehab category. The total drives the
                project-viability check ({Math.round(FF_LTARV_CAP * 100)}% of ARV cap on BRV +
                construction).
              </div>

              <PrequalSowEditor items={sowItems} onChange={setSowItems} />

              {arvNum > 0 && allInBasis > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <Pill
                    bg={ltarvOverCap ? t.dangerBg : t.profitBg}
                    color={ltarvOverCap ? t.danger : t.profit}
                  >
                    All-in basis {QC_FMT.usd(allInBasis, 0)} ÷ ARV {QC_FMT.usd(arvNum, 0)} = {(ltarv * 100).toFixed(1)}% ·{" "}
                    {ltarvOverCap
                      ? `over ${Math.round(FF_LTARV_CAP * 100)}% project cap`
                      : `within ${Math.round(FF_LTARV_CAP * 100)}% project cap`}
                  </Pill>
                </div>
              ) : null}
            </Card>
          ) : null}

          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
        </>
      )}
    </RightPanel>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]) {
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
    boxSizing: "border-box" as const,
  };
}

function Input({
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
  type?: "text" | "email" | "date";
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
        style={inputStyle(t)}
      />
    </div>
  );
}
