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
//
// Restyled onto the plain-CSS design system: each request is a `.card`, the
// status pill is a `.cellchip` with the tone vocabulary standing in for the
// hand-picked bg/fg pairs, the underwriter notes are a `.callout` (which
// wraps, unlike a chip), the present-and-report flow is a `.callout` nudge
// with the consequence line as a `.warnline`, and the buttons are `Btn`.

import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import {
  Btn,
  BtnLink,
  Callout,
  CellChip,
  Panel,
  StatusLine,
  Sub,
  Tag,
  Textarea,
  WarnLine,
  type ChipTone,
} from "@/components/ds";
import { useAcceptPrequalOffer, useDeclinePrequalOffer } from "@/hooks/useApi";
import { PREQUAL_LOAN_TYPE_LABELS, type PrequalRequest } from "@/lib/types";

export function PreQualRequestList({
  requests,
  isLoading,
  emptyState,
}: {
  requests: PrequalRequest[];
  isLoading?: boolean;
  emptyState?: React.ReactNode;
}) {
  if (isLoading) {
    return (
      <Panel>
        <Sub>Loading requests…</Sub>
      </Panel>
    );
  }

  if (requests.length === 0) {
    return (
      <Panel>
        <div>{emptyState ?? "No pre-qualification requests yet."}</div>
      </Panel>
    );
  }

  return (
    <div className="grid g10">
      {requests.map((r) => (
        <RequestRow key={r.id} req={r} />
      ))}
    </div>
  );
}

function RequestRow({ req }: { req: PrequalRequest }) {
  const accept = useAcceptPrequalOffer();
  const decline = useDeclinePrequalOffer();
  const [showOutcome, setShowOutcome] = useState<null | "accept" | "decline">(null);
  const [outcomeNote, setOutcomeNote] = useState("");
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const isSuperseded = req.superseded_by_id != null;
  const isRevision = (req.version_num ?? 1) > 1;
  const statusInfo: { label: string; tone: ChipTone; icon: "audit" | "check" | "x" } = (() => {
    if (isSuperseded) return { label: "Updated — see latest version", tone: "mut", icon: "audit" as const };
    if (req.status === "approved") return { label: isRevision ? `Ready · v${req.version_num}` : "Ready", tone: "ok", icon: "check" as const };
    if (req.status === "offer_accepted") return { label: req.quote_number ? `Loan opened · ${req.quote_number}` : "Loan opened", tone: "acc", icon: "check" as const };
    if (req.status === "offer_declined") return { label: "Closed — seller declined", tone: "mut", icon: "x" as const };
    if (req.status === "rejected") return { label: "Returned", tone: "bad", icon: "x" as const };
    return { label: "Under review", tone: "warn", icon: "audit" as const };
  })();

  const requestedAmount = Number(req.requested_loan_amount);
  const approvedAmount = req.approved_loan_amount != null ? Number(req.approved_loan_amount) : null;
  const showApproved = approvedAmount != null && approvedAmount !== requestedAmount;
  const programLabel = PREQUAL_LOAN_TYPE_LABELS[req.loan_type]?.title ?? req.loan_type;

  const isFixFlip = req.loan_type === "fix_flip";
  const arvNum = req.approved_arv != null
    ? Number(req.approved_arv)
    : req.arv_estimate != null
      ? Number(req.arv_estimate)
      : 0;
  const purchaseNum = Number(req.purchase_price);
  const denomLabel = isFixFlip
    ? (arvNum > 0 ? `${QC_FMT.usd(arvNum, 0)} ARV` : `${QC_FMT.usd(purchaseNum, 0)} BRV`)
    : QC_FMT.usd(purchaseNum, 0);
  const denomConnector = isFixFlip ? "against" : "of";

  // Once a request is approved (or the loan is opened), the
  // "[Auto-approval declined]" admin_notes from the pre-approval
  // tick are stale and confusing. Hide them in the post-approval
  // states; rejected/pending still show whatever's there.
  const visibleAdminNotes = (() => {
    const raw = req.admin_notes ?? "";
    if (!raw) return null;
    if ((req.status === "approved" || req.status === "offer_accepted") && raw.startsWith("[Auto-approval declined]")) {
      return null;
    }
    return raw;
  })();

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
    <div className="card">
      {/* Bespoke split: the request body takes whatever is left, the letter
          button is sized to its own content and must not shrink. Not a
          twelve-column page grid, so the track stays here. */}
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "start" }}>
        <div className="grid g6">
          <div className="row">
            <CellChip tone={statusInfo.tone}>
              <Icon name={statusInfo.icon} size={11} stroke={3} /> {statusInfo.label}
            </CellChip>
            <Tag>{programLabel}</Tag>
            {req.borrower_entity ? (
              <Sub>Issued to {req.borrower_entity}</Sub>
            ) : null}
            {req.expected_closing_date ? (
              <Sub>
                Close {new Date(req.expected_closing_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </Sub>
            ) : null}
          </div>
          <div>
            <b>{req.target_property_address}</b>
          </div>
          <div className="row sub">
            <span>
              Requested {QC_FMT.usd(requestedAmount, 0)} {denomConnector} {denomLabel}
            </span>
            {showApproved ? (
              <CellChip tone="ok">approved at {QC_FMT.usd(approvedAmount as number, 0)}</CellChip>
            ) : null}
          </div>
          {visibleAdminNotes ? (
            <Callout tone={req.status === "rejected" ? "bad" : "acc"}>
              <strong>Underwriter notes:</strong> <em>{visibleAdminNotes}</em>
            </Callout>
          ) : null}

          {/* Approved → present-and-report flow. Once the borrower
              clicks "Seller accepted offer" we spawn a Loan; "Seller
              declined" closes the request. */}
          {req.status === "approved" ? (
            <Callout tone="acc">
              <div className="grid g8">
                <Sub>
                  Once you&apos;ve presented this letter to the seller, let us
                  know how it landed:
                </Sub>
                {showOutcome == null ? (
                  <div className="row">
                    <Btn variant="pri" onClick={() => setShowOutcome("accept")}>
                      <Icon name="check" size={13} stroke={3} /> Seller accepted offer
                    </Btn>
                    <Btn onClick={() => setShowOutcome("decline")}>
                      Seller declined / I walked away
                    </Btn>
                  </div>
                ) : (
                  <>
                    <b>
                      {showOutcome === "accept"
                        ? "Confirm: seller accepted my offer"
                        : "Confirm: seller declined / I walked away"}
                    </b>
                    <Textarea
                      value={outcomeNote}
                      onChange={(e) => setOutcomeNote(e.target.value.slice(0, 500))}
                      placeholder={
                        showOutcome === "accept"
                          ? "Optional — accepted at $X, closing in N weeks…"
                          : "Optional — what happened?"
                      }
                      rows={2}
                    />
                    {showOutcome === "accept" ? (
                      <WarnLine>
                        Confirming will create a real loan file in the pipeline
                        under {req.quote_number ?? "your quote#"}. Your team
                        starts processing immediately.
                      </WarnLine>
                    ) : null}
                    {outcomeError ? (
                      <StatusLine tone="bad">{outcomeError}</StatusLine>
                    ) : null}
                    <div className="row">
                      <span className="sp" />
                      <Btn
                        onClick={() => { setShowOutcome(null); setOutcomeNote(""); setOutcomeError(null); }}
                      >
                        Back
                      </Btn>
                      <Btn
                        variant="pri"
                        onClick={submitOutcome}
                        disabled={accept.isPending || decline.isPending}
                      >
                        {accept.isPending || decline.isPending ? "Saving…" : "Confirm"}
                      </Btn>
                    </div>
                  </>
                )}
              </div>
            </Callout>
          ) : null}
        </div>

        {(req.status === "approved" || req.status === "offer_accepted") && req.pdf_url ? (
          <BtnLink
            variant="pri"
            href={req.pdf_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="docCheck" size={13} /> Download Letter
          </BtnLink>
        ) : null}
      </div>
    </div>
  );
}
