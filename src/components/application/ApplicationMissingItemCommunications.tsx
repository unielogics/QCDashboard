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

  async function toggleAutomation() {
    if (!readiness) return;
    const enabled = !readiness.automation.enabled;
    setBusy("automation");
    setError(null);
    try {
      const next = await authenticated<ApplicationProgramReadiness>(
        `/application-profiles/${profileId}/missing-item-automation`,
        { method: "PATCH", body: JSON.stringify({ enabled }) },
      );
      setReadiness(next);
    } catch (reason) {
      setError(errorMessage(reason));
    } finally {
      setBusy("");
    }
  }

  const automation = readiness?.automation;
  const status = automation?.enabled
    ? automation.eligible ? "On · ready" : "On · paused"
    : "Off";
  const schedule = automation?.enabled
    ? automation.next_send_at ? `Next ${when(automation.next_send_at)}` : "No send scheduled"
    : automation?.eligible ? "Ready to turn on" : automation?.stop_reason || "Not ready";

  return (
    <section className="missing-communications" aria-label="Missing evidence communications">
      <div className="missing-communications-bar">
        <div className="missing-communications-copy">
          <div className="missing-communications-title">
            <h3>Missing evidence follow-up</h3>
            <CellChip tone={semanticChipTone(automation?.enabled && automation?.eligible ? "ready" : "pending")}>
              {status}
            </CellChip>
          </div>
          <p>
            <b>{nextRequirement?.label ?? "No client action pending"}</b>
            <span aria-hidden="true"> · </span>
            {schedule}
            {automation ? <><span aria-hidden="true"> · </span>{automation.attempts} of {automation.max_attempts} attempts</> : null}
          </p>
        </div>
        <Btn
          size="sm"
          variant={automation?.enabled ? "default" : "pri"}
          aria-pressed={Boolean(automation?.enabled)}
          disabled={!readiness || Boolean(busy)}
          onClick={() => void toggleAutomation()}
        >
          {busy === "automation" ? "Saving..." : automation?.enabled ? "Turn off" : "Turn on"}
        </Btn>
      </div>
      {error ? <Callout tone="bad">{error}</Callout> : null}
      {deliveries.length ? (
        <details className="missing-communications-history">
          <summary>Delivery history <span>{deliveries.length}</span></summary>
          <div className="missing-communications-history-list">
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
          </div>
        </details>
      ) : null}
      {busy === "load" ? (
        <div className="missing-communications-loading" aria-live="polite">
          Loading follow-up status...
        </div>
      ) : null}
    </section>
  );
}
