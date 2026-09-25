"use client";

import { Field, Input, Textarea } from "@/components/ds";
import {
  PIPELINE_APPROVAL_NOTE_MAX_LENGTH,
  type PipelineApprovalDraft,
} from "@/lib/pipelineApproval";

export function PipelineApprovalFields({
  value,
  onChange,
  error,
  autoFocus = false,
}: {
  value: PipelineApprovalDraft;
  onChange: (value: PipelineApprovalDraft) => void;
  error?: string | null;
  autoFocus?: boolean;
}) {
  const amountError = error?.toLowerCase().includes("approved amount") ? error : null;
  const dscrError = error?.toLowerCase().includes("dscr") ? error : null;
  const noteError = error?.toLowerCase().includes("notes") ? error : null;

  return (
    <div className="grid g12">
      <div className="fldgrid two">
        <Field label="Approved amount (USD)" req error={amountError}>
          <Input
            autoFocus={autoFocus}
            aria-label="Approved amount"
            aria-invalid={Boolean(amountError)}
            className={amountError ? "bad" : undefined}
            inputMode="decimal"
            value={value.approvedAmount}
            onChange={(event) => onChange({ ...value, approvedAmount: event.target.value })}
            placeholder="0.00"
            style={{ minHeight: 44 }}
          />
        </Field>
        <Field label="Approved DSCR" hint="Optional. Leave blank when DSCR does not apply." error={dscrError}>
          <Input
            aria-label="Approved DSCR"
            aria-invalid={Boolean(dscrError)}
            className={dscrError ? "bad" : undefined}
            inputMode="decimal"
            value={value.approvedDscr}
            onChange={(event) => onChange({ ...value, approvedDscr: event.target.value })}
            placeholder="1.25"
            style={{ minHeight: 44 }}
          />
        </Field>
      </div>
      <Field
        label="Internal / reviewer notes"
        hint="Optional. Stored on the file for the desk; not added to client-facing documents."
        error={noteError}
      >
        <Textarea
          aria-label="Internal / reviewer notes"
          aria-invalid={Boolean(noteError)}
          className={noteError ? "bad" : undefined}
          rows={4}
          maxLength={PIPELINE_APPROVAL_NOTE_MAX_LENGTH}
          value={value.note}
          onChange={(event) => onChange({ ...value, note: event.target.value })}
          placeholder="Conditions, exceptions, committee notes, or context for the approval"
          style={{ minHeight: 104 }}
        />
      </Field>
    </div>
  );
}
