"use client";

import React from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip } from "@/components/ds";
import {
  unlockedCopyActionState,
  type LockedEvidencePresentation,
  type UnlockedCopyRequestLike,
} from "@/lib/lockedEvidence";

export function LockedEvidenceBadge({
  presentation,
}: {
  presentation: LockedEvidencePresentation;
}) {
  return <span className="cellchip c-warn locked-evidence-badge" aria-label={`${presentation.title}: ${presentation.badge}`}><Icon name="lock" size={12} aria-hidden="true" />{presentation.badge}</span>;
}

export function UnlockedCopyRequestControl({
  request,
  busy = false,
  onRequest,
  onCopyRoomLink,
}: {
  request?: UnlockedCopyRequestLike;
  busy?: boolean;
  onRequest?: (retryFailed: boolean) => Promise<void> | void;
  onCopyRoomLink?: () => Promise<void> | void;
}) {
  const state = unlockedCopyActionState(request);
  if (state.kind === "replacement_received") {
    return <CellChip tone="ok"><Icon name="check" size={12} aria-hidden="true" />{state.label}</CellChip>;
  }
  if (state.kind === "replacement_checking") {
    return <CellChip tone="acc"><Icon name="refresh" size={12} aria-hidden="true" />{state.label}</CellChip>;
  }
  if (state.kind === "needs_another_copy") {
    return <span className="locked-evidence-request-controls" aria-live="polite"><CellChip tone="warn"><Icon name="lock" size={12} aria-hidden="true" />{state.label}</CellChip>{onRequest ? <Btn disabled={busy} onClick={() => void onRequest(true)}><Icon name="send" size={13} />{busy ? "Sending..." : "Send request again"}</Btn> : null}{onCopyRoomLink ? <Btn disabled={busy} onClick={() => void onCopyRoomLink()}><Icon name="copy" size={13} />Copy room link</Btn> : null}</span>;
  }
  if (state.kind === "requested") {
    return <span className="locked-evidence-request-controls" aria-live="polite"><CellChip tone="acc"><Icon name="send" size={12} aria-hidden="true" />{state.label}</CellChip>{state.offerRetry && onRequest ? <Btn disabled={busy} onClick={() => void onRequest(true)}><Icon name="refresh" size={13} />{busy ? "Retrying..." : "Retry email"}</Btn> : null}{state.offerRoomLink && onCopyRoomLink ? <Btn disabled={busy} onClick={() => void onCopyRoomLink()}><Icon name="copy" size={13} />Copy room link</Btn> : null}</span>;
  }
  if (!onRequest) return null;
  return <span className="locked-evidence-request-controls" aria-live="polite"><Btn disabled={busy} onClick={() => void onRequest(state.retryFailed)}><Icon name={state.kind === "retry" ? "refresh" : "send"} size={13} />{busy ? state.kind === "retry" ? "Retrying..." : "Sending..." : state.label}</Btn>{state.offerRoomLink && onCopyRoomLink ? <Btn disabled={busy} onClick={() => void onCopyRoomLink()}><Icon name="copy" size={13} />Copy room link</Btn> : null}</span>;
}
