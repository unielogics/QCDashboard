"use client";

// FollowUpRhythmModal — operator-side per-file follow-up config.
// Opened from Elara header's "Follow-up rhythm" button.
// PATCHes ClientAIPlan.ai_secretary_settings.follow_up.
//
// Restyled onto `Drawer`; the local Escape listener is gone because the
// dialog carries it, along with focus return and a body scroll lock.

import { useEffect, useState } from "react";
import { Btn } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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
  const updateFileSettings = useUpdateFileSettings(loanId);
  const firmDefaults = useFundingMetaRules("follow_up");
  const [draft, setDraft] = useState<FollowUpSettings>(value ?? {});

  useEffect(() => {
    if (open) setDraft(value ?? {});
  }, [open, value]);

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
    <Drawer
      open={open}
      onClose={onClose}
      title="AI follow-up rhythm"
      sub="How often the AI nudges this borrower if the conversation stalls"
      width="md"
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={updateFileSettings.isPending}>
            {updateFileSettings.isPending ? "Saving…" : "Save rhythm"}
          </Btn>
        </>
      }
    >
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
    </Drawer>
  );
}
