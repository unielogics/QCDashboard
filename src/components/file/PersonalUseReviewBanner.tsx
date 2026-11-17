"use client";

// QC funds business-purpose loans only. When a real-estate borrower describes a
// personal-use loan on a home they live in, the backend holds the file
// (app/services/business_purpose.py): the AI stops collecting and quotes
// nothing, and a person decides. This is that person's two buttons.

import { useState } from "react";
import { Btn, Callout } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";

export type PersonalUseReview = {
  status: "held" | "needs_review" | "cleared" | string;
  source?: string | null;
  occupancy?: string | null;
  at?: string | null;
  note?: string | null;
  decided_by_name?: string | null;
};

export type PersonalUseDecision = "hold" | "clear";

const OPEN = new Set(["held", "needs_review"]);

export function personalUseReviewIsOpen(review: PersonalUseReview | null | undefined): boolean {
  return Boolean(review && OPEN.has(review.status));
}

export function PersonalUseReviewBanner({
  review,
  onDecide,
}: {
  review: PersonalUseReview | null | undefined;
  onDecide?: (decision: PersonalUseDecision, note?: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState<PersonalUseDecision | null>(null);
  const [error, setError] = useState("");
  if (!review || !personalUseReviewIsOpen(review)) return null;
  const held = review.status === "held";

  async function decide(decision: PersonalUseDecision) {
    if (!onDecide) return;
    setBusy(decision);
    setError("");
    try {
      await onDecide(decision);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save the decision.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Callout tone={held ? "bad" : "warn"} icon={<Icon name="alert" size={16} />}>
      <strong>{held ? "Held: personal-use request" : "Check: possible personal-use request"}</strong>
      <p className="m-0">
        {review.note || "The borrower describes a personal-use loan on their own home."}{" "}
        QC funds business-purpose loans only, so the AI has stopped collecting and quotes nothing. Nothing has been sent to the client.
      </p>
      {onDecide ? (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          {!held ? (
            <Btn size="sm" disabled={busy !== null} onClick={() => void decide("hold")}>
              {busy === "hold" ? "Saving..." : "Confirm personal use (keep on hold)"}
            </Btn>
          ) : null}
          <Btn size="sm" variant="pri" disabled={busy !== null} onClick={() => void decide("clear")}>
            {busy === "clear" ? "Saving..." : "Clear: it is for business use"}
          </Btn>
        </div>
      ) : null}
      {error ? <p className="m-0" role="alert">{error}</p> : null}
    </Callout>
  );
}
