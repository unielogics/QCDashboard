"use client";

// FollowUpRhythmModal — operator-side per-file follow-up config.
// Opened from the AI Secretary header's "Follow-up rhythm" button.
// PATCHes ClientAIPlan.ai_secretary_settings.follow_up.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { FollowUpEditor, type FollowUpSettings } from "@/components/FollowUpEditor";
import { useFundingMetaRules, useUpdateFileSettings } from "@/hooks/useApi";

interface Props {
  open: boolean;
  onClose: () => void;
  loanId: string;
  value: FollowUpSettings | null;
}

// System floor — matches app/services/ai/follow_up.py DEFAULT_*.
const SYSTEM_FLOOR: FollowUpSettings = {
  stall_threshold_minutes: 60 * 24,
  max_attempts_per_day: 3,
  max_days_without_reply: 14,
};

export function FollowUpRhythmModal({ open, onClose, loanId, value }: Props) {
  const { t } = useTheme();
  const updateFileSettings = useUpdateFileSettings(loanId);
  const firmDefaults = useFundingMetaRules("follow_up");
  const [draft, setDraft] = useState<FollowUpSettings>(value ?? {});

  useEffect(() => {
    if (open) setDraft(value ?? {});
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Merge firm-default → floor for the placeholder/preview fallback.
  const firmDefault = (firmDefaults.data?.rules ?? {}) as FollowUpSettings;
  const fallback: FollowUpSettings = {
    stall_threshold_minutes: firmDefault.stall_threshold_minutes ?? SYSTEM_FLOOR.stall_threshold_minutes,
    max_attempts_per_day: firmDefault.max_attempts_per_day ?? SYSTEM_FLOOR.max_attempts_per_day,
    max_days_without_reply: firmDefault.max_days_without_reply ?? SYSTEM_FLOOR.max_days_without_reply,
    quiet_hours_start: firmDefault.quiet_hours_start ?? null,
    quiet_hours_end: firmDefault.quiet_hours_end ?? null,
  };
  const usingFirmDefault = Object.keys(firmDefault).length > 0;

  const hasOverride = value !== null && Object.values(value).some((v) => v !== null && v !== undefined);

  const save = () => {
    // Strip any keys that are explicit null/undefined — backend treats
    // omitted as "use fallback."
    const clean: FollowUpSettings = {};
    if (draft.stall_threshold_minutes) clean.stall_threshold_minutes = draft.stall_threshold_minutes;
    if (draft.max_attempts_per_day) clean.max_attempts_per_day = draft.max_attempts_per_day;
    if (draft.max_days_without_reply) clean.max_days_without_reply = draft.max_days_without_reply;
    if (draft.quiet_hours_start != null) clean.quiet_hours_start = draft.quiet_hours_start;
    if (draft.quiet_hours_end != null) clean.quiet_hours_end = draft.quiet_hours_end;
    updateFileSettings.mutate(
      { follow_up: Object.keys(clean).length ? clean : null },
      { onSuccess: () => onClose() },
    );
  };

  const reset = () => {
    updateFileSettings.mutate(
      { follow_up: null },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(0,0,0,0.32)", zIndex: 70,
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        width: "min(720px, 96vw)",
        maxHeight: "86vh",
        background: t.surface,
        borderRadius: 14,
        border: `1px solid ${t.line}`,
        boxShadow: "0 24px 48px rgba(0,0,0,0.22)",
        display: "flex", flexDirection: "column",
      }}>
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
        }}>
          <Icon name="cal" size={14} />
          <span style={{ fontSize: 14, fontWeight: 900, color: t.ink }}>AI follow-up rhythm</span>
          <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
            How often the AI nudges this borrower if the conversation stalls
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset", cursor: "pointer",
              padding: 6, borderRadius: 6,
              color: t.ink3, fontSize: 18, fontWeight: 900, lineHeight: 1,
            }}
          >×</button>
        </header>

        <div style={{ padding: 16, overflow: "auto", flex: 1, minHeight: 0 }}>
          <FollowUpEditor
            value={draft}
            onChange={setDraft}
            fallback={fallback}
            fallbackLabel={usingFirmDefault ? "firm default" : "system floor"}
            title="Per-file follow-up"
            subtitle="Overrides the firm default for this loan only. Empty fields fall back to the firm default or the system floor."
            saving={updateFileSettings.isPending}
            hasOverride={hasOverride}
            onReset={reset}
          />
        </div>

        <footer style={{
          display: "flex", gap: 8, justifyContent: "flex-end",
          padding: "12px 18px",
          borderTop: `1px solid ${t.line}`,
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: `1px solid ${t.lineStrong}`,
              background: t.surface, color: t.ink2,
              fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={updateFileSettings.isPending}
            style={{
              padding: "8px 14px", borderRadius: 8,
              border: "none",
              background: t.brand, color: t.inverse,
              fontSize: 12, fontWeight: 900, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            {updateFileSettings.isPending ? "Saving…" : "Save rhythm"}
          </button>
        </footer>
      </div>
    </div>
  );
}
