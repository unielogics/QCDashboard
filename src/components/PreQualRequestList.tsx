"use client";

// Borrower-side list of their pre-qualification requests. Status badges:
//   pending          — amber "Under review"
//   approved         — green "Ready" + Download Letter + report-back buttons
//   offer_accepted   — blue "Loan opened — Q-XXXX"
//   offer_declined   — gray "Closed"
//   rejected         — red "Returned" + reviewer notes shown italicized
//
// Used inside the simulator's My Loans tab AND the borrower view of the
// loan detail page.

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { QC_FMT } from "@/components/design-system/tokens";
import { useAcceptPrequalOffer, useDeclinePrequalOffer } from "@/hooks/useApi";
import type { PrequalRequest } from "@/lib/types";

export function PreQualRequestList({
  requests,
  isLoading,
  emptyState,
}: {
  requests: PrequalRequest[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
}) {
  const { t } = useTheme();

  if (isLoading) {
    return (
      <Card pad={20}>
        <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading requests…</div>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card pad={20}>
        <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.5 }}>
          {emptyState ?? "No pre-qualification requests yet."}
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {requests.map((r) => (
        <RequestRow key={r.id} req={r} />
      ))}
    </div>
  );
}

function RequestRow({ req }: { req: PrequalRequest }) {
  const { t } = useTheme();
  const accept = useAcceptPrequalOffer();
  const decline = useDeclinePrequalOffer();
  const [showOutcome, setShowOutcome] = useState<null | "accept" | "decline">(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const statusInfo = (() => {
    if (req.status === "approved") return { label: "Ready", bg: t.profitBg, fg: t.profit, icon: "check" as const };
    if (req.status === "offer_accepted") return { label: req.quote_number ? `Loan opened · ${req.quote_number}` : "Loan opened", bg: t.brandSoft, fg: t.brand, icon: "check" as const };
    if (req.status === "offer_declined") return { label: "Closed — seller declined", bg: t.surface2, fg: t.ink3, icon: "x" as const };
    if (req.status === "rejected") return { label: "Returned", bg: t.dangerBg, fg: t.danger, icon: "x" as const };
    return { label: "Under review", bg: t.warnBg, fg: t.warn, icon: "audit" as const };
  })();

  const requestedAmount = Number(req.requested_loan_amount);
  const approvedAmount = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const showApproved = approvedAmount != null && approvedAmount !== requestedAmount;
  const programLabel = req.loan_type === "dscr" ? "DSCR Rental (30-yr fixed)" : "Bridge / Purchase";

  const submitOutcome = async () => {
    if (showOutcome == null) return;
    setOutcomeError(null);
    try {
      const payload = { note: outcomeNote.trim() || null };
      if (showOutcome === "accept") {
        await accept.mutateAsync({ requestId: req.id, payload });
      } else {
        await decline.mutateAsync({ requestId: req.id, payload });
      }
      setShowOutcome(null);
      setOutcomeNote("");
    } catch (e) {
      setOutcomeError(e instanceof Error ? e.message : "Update failed.");
    }
  };

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Pill bg={statusInfo.bg} color={statusInfo.fg}>
              <Icon name={statusInfo.icon} size={11} stroke={3} /> {statusInfo.label}
            </Pill>
            <Pill>{programLabel}</Pill>
            {req.borrower_entity ? (
              <span style={{ fontSize: 11, color: t.ink3 }}>
                Issued to {req.borrower_entity}
              </span>
            ) : null}
            {req.expected_closing_date ? (
              <span style={{ fontSize: 11, color: t.ink3 }}>
                Close {new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            ) : null}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginTop: 6, letterSpacing: -0.2 }}>
            {req.target_property_address}
          </div>
          <div style={{ fontSize: 12, color: t.ink2, marginTop: 4, fontFeatureSettings: '"tnum"' }}>
            Requested {QC_FMT.usd(requestedAmount, 0)} of {QC_FMT.usd(Number(req.purchase_price), 0)}
            {showApproved ? (
              <span style={{ color: t.profit, fontWeight: 700 }}>
                {" "}· approved at {QC_FMT.usd(approvedAmount as number, 0)}
              </span>
            ) : null}
          </div>
          {req.admin_notes ? (
            <div
              style={{
                marginTop: 10,
                padding: "8px 12px",
                borderLeft: `3px solid ${req.status === "rejected" ? t.danger : t.petrol}`,
                background: t.surface2,
                fontSize: 12,
                fontStyle: "italic",
                color: t.ink2,
                lineHeight: 1.45,
              }}
            >
              <strong style={{ fontStyle: "normal", color: t.ink }}>Underwriter notes:</strong>{" "}
              {req.admin_notes}
            </div>
          ) : null}

          {/* Approved → present-and-report flow. Once the borrower
              clicks "Seller accepted offer" we spawn a Loan; "Seller
              declined" closes the request. */}
          {req.status === "approved" ? (
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${t.line}` }}>
              <div style={{ fontSize: 11.5, color: t.ink3, marginBottom: 8, lineHeight: 1.45 }}>
                Once you&apos;ve presented this letter to the seller, let us
                know how it landed:
              </div>
              {showOutcome == null ? (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={() => setShowOutcome("accept")}
                    style={qcBtnPrimary(t)}
                  >
                    <Icon name="check" size={13} stroke={3} /> Seller accepted offer
                  </button>
                  <button
                    onClick={() => setShowOutcome("decline")}
                    style={qcBtn(t)}
                  >
                    Seller declined / I walked away
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 12, color: t.ink, fontWeight: 700 }}>
                    {showOutcome === "accept"
                      ? "Confirm: seller accepted my offer"
                      : "Confirm: seller declined / I walked away"}
                  </div>
                  <textarea
                    value={outcomeNote}
                    onChange={(e) => setOutcomeNote(e.target.value.slice(0, 500))}
                    placeholder={
                      showOutcome === "accept"
                        ? "Optional — accepted at $X, closing in N weeks…"
                        : "Optional — what happened?"
                    }
                    rows={2}
                    style={{
                      width: "100%",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: t.surface2,
                      border: `1px solid ${t.line}`,
                      color: t.ink,
                      fontSize: 12,
                      fontFamily: "inherit",
                      outline: "none",
                      resize: "vertical",
                      boxSizing: "border-box",
                    }}
                  />
                  {showOutcome === "accept" ? (
                    <div style={{ fontSize: 11, color: t.petrol, lineHeight: 1.4 }}>
                      Confirming will create a real loan file in the pipeline
                      under {req.quote_number ?? "your quote#"}. Your team
                      starts processing immediately.
                    </div>
                  ) : null}
                  {outcomeError ? (
                    <Pill bg={t.dangerBg} color={t.danger}>{outcomeError}</Pill>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button
                      onClick={() => { setShowOutcome(null); setOutcomeNote(""); setOutcomeError(null); }}
                      style={qcBtn(t)}
                    >
                      Back
                    </button>
                    <button
                      onClick={submitOutcome}
                      disabled={accept.isPending || decline.isPending}
                      style={{
                        ...qcBtnPrimary(t),
                        opacity: (accept.isPending || decline.isPending) ? 0.5 : 1,
                      }}
                    >
                      {accept.isPending || decline.isPending ? "Saving…" : "Confirm"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {(req.status === "approved" || req.status === "offer_accepted") && req.pdf_url ? (
          <a
            href={req.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              ...qcBtnPrimary(t),
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              flexShrink: 0,
            }}
          >
            <Icon name="docCheck" size={13} /> Download Letter
          </a>
        ) : null}
      </div>
    </Card>
  );
}
