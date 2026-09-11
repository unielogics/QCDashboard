"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { Btn, Callout, CellChip } from "@/components/ds";
import { api, ApiError } from "@/lib/api";
import type {
  ApplicationProgramReadiness,
  RoomDeliveryReceipt,
} from "@/lib/applicationProfile";
import { semanticChipTone, semanticStatusClass } from "@/lib/semanticStatus";

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Delivery history could not be loaded.";
}

function when(value: string | null): string {
  if (!value) return "Not scheduled";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export function ApplicationMissingItemCommunications({ profileId }: { profileId: string }) {
  const { getToken } = useAuth();
  const [readiness, setReadiness] = useState<ApplicationProgramReadiness | null>(null);
  const [deliveries, setDeliveries] = useState<RoomDeliveryReceipt[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  const authenticated = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const token = await getToken();
    return api<T>(path, { ...init, authToken: token ?? undefined });
  }, [getToken]);

  const load = useCallback(async () => {
    setBusy("load");
    setError(null);
    try {
      const [nextReadiness, nextDeliveries] = await Promise.all([
        authenticated<ApplicationProgramReadiness>(`/application-profiles/${profileId}/program-readiness`),
        authenticated<RoomDeliveryReceipt[]>(`/application-profiles/${profileId}/room/deliveries`),
      ]);
      setReadiness(nextReadiness);
      setDeliveries(nextDeliveries);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }, [authenticated, profileId]);

  useEffect(() => {
    void load();
  }, [load]);

  const requirementByDocument = useMemo(
    () => new Map(
      (readiness?.requirements ?? [])
        .filter((item) => item.requested_document_id)
        .map((item) => [item.requested_document_id as string, item]),
    ),
    [readiness],
  );
  const nextRequirement = readiness?.requirements.find(
    (item) => item.requirement_key === readiness.automation.next_requirement_key,
  );

  async function retry(receipt: RoomDeliveryReceipt) {
    const requirement = receipt.requested_document_id
      ? requirementByDocument.get(receipt.requested_document_id)
      : nextRequirement;
    if (!requirement) {
      setError("The failed delivery is no longer linked to an active requirement.");
      return;
    }
    setBusy(receipt.id);
    setError(null);
    try {
      await authenticated(
        `/application-profiles/${profileId}/requirements/${requirement.requirement_key}/reminders`,
        { method: "POST", body: JSON.stringify({ retry_failed: true }) },
      );
      await load();
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="missing-communications" aria-label="Missing evidence communications">
      <header>
        <div>
          <h3>Missing evidence follow-up</h3>
          <p>Delivery state is provider-confirmed and scoped to this application room.</p>
        </div>
        <CellChip tone={semanticChipTone(readiness?.automation.eligible ? "ready" : "pending")}>
          {readiness?.automation.enabled ? "Automation on" : "Automation off"}
        </CellChip>
      </header>
      {error ? <Callout tone="bad">{error}</Callout> : null}
      <div className="missing-communications-summary">
        <div><span>Next missing action</span><b>{nextRequirement?.label ?? "No client action pending"}</b></div>
        <div><span>Next send</span><b>{when(readiness?.automation.next_send_at ?? null)}</b></div>
        <div><span>Attempts</span><b>{readiness?.automation.attempts ?? 0} of 3 automatic</b></div>
        <div><span>Eligibility</span><b>{readiness?.automation.eligible ? "Ready" : readiness?.automation.stop_reason ?? "Not ready"}</b></div>
      </div>
      <div className="missing-communications-history">
        {deliveries.map((receipt) => (
          <div key={receipt.id} className={semanticStatusClass(receipt.status)}>
            <div>
              <b>{receipt.action_kind.replaceAll("_", " ")}</b>
              <span>{receipt.channel.toUpperCase()}{receipt.recipient_masked ? ` to ${receipt.recipient_masked}` : ""}{` · ${when(receipt.created_at)}`}</span>
              <small>{receipt.detail || "No provider detail"}</small>
            </div>
            <div className="missing-communications-result">
              <CellChip tone={semanticChipTone(receipt.provider_accepted ? "delivered" : receipt.status)}>{receipt.provider_accepted ? "Provider accepted" : receipt.status}</CellChip>
              <span>Attempt {receipt.attempt_number}</span>
              {!receipt.provider_accepted && receipt.channel !== "none" ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => void retry(receipt)}>{busy === receipt.id ? "Retrying..." : "Retry"}</Btn> : null}
            </div>
          </div>
        ))}
        {!deliveries.length && busy !== "load" ? <p className="empty">No room-link or missing-item delivery has been attempted.</p> : null}
        {busy === "load" ? <p className="empty">Loading delivery history...</p> : null}
      </div>
    </section>
  );
}
