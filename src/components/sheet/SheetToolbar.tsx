"use client";

// The strip above the grid: what this is, whether it is saved, who else is
// here, and the two things a person does when they have finished — take a copy
// and send it.
//
// `presenceSlot` is an empty div this file knows nothing about. The live half
// fills it with the participant strip; the grid must not grow a dependency on
// presence to render, because the desk opens this worksheet whether or not a
// stream is connected.
//
// The save state is worded rather than iconified. "Saving…" and "Saved at
// 4:12 PM" are what somebody typing into a shared sheet actually wants to
// know, and the one thing they must not have to wonder about is whether the
// number they just typed is on the file.

import type { ReactNode } from "react";
import { Btn } from "@/components/ds";

export type SheetToolbarProps = {
  title: string;
  subtitle?: string | null;
  saving?: boolean;
  savedAt?: number | null;
  dirty?: number;
  error?: string | null;
  /** The one 409: this browser is too far behind to patch and must reload. */
  stale?: boolean;
  canEdit?: boolean;
  /** The live half's participant strip. */
  presenceSlot?: ReactNode;
  /** Row buttons and anything else the container wants beside the actions. */
  actions?: ReactNode;
  notice?: string | null;
  onDismissNotice?: () => void;
  onDownload?: () => void;
  onSubmit?: () => void;
  submitting?: boolean;
  submitLabel?: string;
};

function clockOf(at: number | null | undefined): string | null {
  if (!at) return null;
  try {
    return new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return null;
  }
}

export function SheetToolbar({
  title,
  subtitle,
  saving,
  savedAt,
  dirty = 0,
  error,
  stale,
  canEdit = true,
  presenceSlot,
  actions,
  notice,
  onDismissNotice,
  onDownload,
  onSubmit,
  submitting,
  submitLabel = "Send it",
}: SheetToolbarProps) {
  const saved = clockOf(savedAt);
  const state = stale
    ? "This page is out of date — reload to keep editing"
    : error
      ? error
      : saving
        ? "Saving…"
        : dirty > 0
          ? "Saving in a moment…"
          : saved
            ? `Saved at ${saved}`
            : canEdit
              ? "Saves as you type"
              : "Nothing here can be changed from this link";

  return (
    <div className="sg-toolbar">
      <div className="sg-toolbar-main">
        <div className="sg-name">
          <strong>{title}</strong>
          {subtitle ? <span className="sg-sub">{subtitle}</span> : null}
        </div>
        <span className={stale || error ? "sg-state sg-state-bad" : "sg-state"} role="status" aria-live="polite">
          {state}
        </span>
        <div className="sg-presence">{presenceSlot}</div>
        <div className="sg-toolbar-actions">
          {actions}
          {onDownload ? (
            <Btn size="sm" onClick={onDownload} title="Download these four sheets as one Excel workbook">
              Download
            </Btn>
          ) : null}
          {onSubmit && canEdit ? (
            <Btn size="sm" variant="pri" onClick={onSubmit} disabled={!!submitting}>
              {submitting ? "Sending…" : submitLabel}
            </Btn>
          ) : null}
        </div>
      </div>
      {notice ? (
        <p className="sg-notice" role="status">
          <span>{notice}</span>
          {onDismissNotice ? (
            <button type="button" className="linky" onClick={onDismissNotice}>
              Dismiss
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
