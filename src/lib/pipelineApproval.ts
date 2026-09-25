export const PIPELINE_APPROVAL_NOTE_MAX_LENGTH = 1000;

export type PipelineApprovalDraft = {
  approvedAmount: string;
  approvedDscr: string;
  note: string;
};

export type PipelineApprovalValues = {
  approved_amount: number;
  approved_dscr: number | null;
  note: string | null;
};

export type PipelineApprovalValidation =
  | { value: PipelineApprovalValues; error: null }
  | { value: null; error: string };

function draftNumber(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

function parseNumber(value: string): number {
  return Number(value.replace(/[$,\s]/g, ""));
}

export function pipelineApprovalDraft({
  approvedAmount,
  approvedDscr,
  note,
}: {
  approvedAmount?: number | null;
  approvedDscr?: number | null;
  note?: string | null;
} = {}): PipelineApprovalDraft {
  return {
    approvedAmount: draftNumber(approvedAmount),
    approvedDscr: draftNumber(approvedDscr),
    note: note ?? "",
  };
}

export function validatePipelineApprovalDraft(draft: PipelineApprovalDraft): PipelineApprovalValidation {
  const approvedAmount = parseNumber(draft.approvedAmount);
  if (!draft.approvedAmount.trim() || !Number.isFinite(approvedAmount) || approvedAmount <= 0) {
    return { value: null, error: "Enter an approved amount greater than 0." };
  }

  const dscrText = draft.approvedDscr.trim();
  const approvedDscr = dscrText ? parseNumber(dscrText) : null;
  if (approvedDscr != null && (!Number.isFinite(approvedDscr) || approvedDscr < 0)) {
    return { value: null, error: "Approved DSCR must be 0 or greater." };
  }

  const note = draft.note.trim();
  if (note.length > PIPELINE_APPROVAL_NOTE_MAX_LENGTH) {
    return {
      value: null,
      error: `Internal notes must be ${PIPELINE_APPROVAL_NOTE_MAX_LENGTH.toLocaleString("en-US")} characters or fewer.`,
    };
  }

  return {
    value: {
      approved_amount: approvedAmount,
      approved_dscr: approvedDscr,
      note: note || null,
    },
    error: null,
  };
}
