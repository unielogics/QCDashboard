"use client";

// Admin "Contracts" workspace tab on an AI Underwriter Lead — request one
// of the 3 client-facing contract types (SBA Engagement, Client Engagement,
// Consulting Addendum) via the existing requested-document/chat sign flow.
// Identical for dealer and real-estate leads. Mirrors LeadCreditPanel.tsx's
// structure (request → status → done), one row per contract type instead
// of a single credit-authorization flow.
//
// MVP scope (confirmed): admin sets the effective date; every other blank
// (notice contacts, per-product fee amounts) renders blank in the signed
// contract via each field's own default — safe (empty cells, not
// placeholder text), editable later if a deal ever needs it filled in.

import { useState } from "react";
import { Btn, CellChip, Field, Input, ItemRow, Panel, StatusLine, Sub } from "@/components/ds";
import { useLeadContractStatus, useRequestLeadContract } from "@/hooks/useApi";
import { ContractType } from "@/lib/enums.generated";
import { ApiError } from "@/lib/api";

const CONTRACT_LABELS: Record<string, string> = {
  [ContractType.SBA_ENGAGEMENT]: "SBA Advisory and Packaging Engagement Agreement",
  [ContractType.CLIENT_ENGAGEMENT]: "Capital Advisory and Placement Engagement Agreement",
  [ContractType.CONSULTING_ADDENDUM]: "Consulting and Fee Schedule Addendum",
};

const REQUESTABLE_CONTRACT_TYPES = [
  ContractType.SBA_ENGAGEMENT,
  ContractType.CLIENT_ENGAGEMENT,
  ContractType.CONSULTING_ADDENDUM,
];

export function LeadContractsPanel({ intakeId }: { intakeId: string }) {
  const status = useLeadContractStatus(intakeId);
  const request = useRequestLeadContract(intakeId);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<string | null>(null);

  if (status.isLoading) {
    return (
      <Panel title="Contracts">
        <Sub>Loading contract status…</Sub>
      </Panel>
    );
  }

  const byType = new Map((status.data ?? []).map((row) => [row.contract_type, row]));

  async function onRequest(contractType: string) {
    setError(null);
    setPendingType(contractType);
    try {
      // consulting_addendum's date field has a different name (it isn't its
      // own effective date -- it's the underlying agreement's date); the
      // other two both use "effective_date".
      const fieldValues: Record<string, string> =
        contractType === ContractType.CONSULTING_ADDENDUM
          ? { underlying_agreement_effective_date: effectiveDate }
          : { effective_date: effectiveDate };
      await request.mutateAsync({ contract_type: contractType, field_values: fieldValues });
    } catch (err) {
      setError(readErrorMessage(err));
    } finally {
      setPendingType(null);
    }
  }

  return (
    <Panel title="Contracts">
      <p className="sub mb">
        Request a client-facing engagement agreement. The client signs it via their intake link chat — same
        signing mechanism as the credit authorization above.
      </p>
      {/* Bespoke width (rule 3): a date field wants to be as wide as a date, not
          as wide as the panel, and it is the only control in its row — so this
          is not a .fldgrid column. */}
      <div className="mb" style={{ maxWidth: 220 }}>
        <Field label="Effective date">
          {/* aria-label because `Field` renders a <span class="lbl">, not a
              <label for>; the old markup wrapped the control in a <label>. */}
          <Input
            aria-label="Effective date"
            type="date"
            value={effectiveDate}
            onChange={(e) => setEffectiveDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid g10">
        {REQUESTABLE_CONTRACT_TYPES.map((contractType) => {
          const row = byType.get(contractType);
          const requested = Boolean(row?.requested);
          const signed = Boolean(row?.signed);
          const isPending = request.isPending && pendingType === contractType;
          return (
            <ItemRow
              key={contractType}
              right={
                signed ? (
                  <CellChip tone="ok">Signed</CellChip>
                ) : requested ? (
                  <CellChip tone="warn">Awaiting signature</CellChip>
                ) : (
                  <Btn variant="pri" onClick={() => onRequest(contractType)} disabled={isPending}>
                    {isPending ? "Requesting…" : "Request"}
                  </Btn>
                )
              }
            >
              <strong>{CONTRACT_LABELS[contractType]}</strong>
            </ItemRow>
          );
        })}
      </div>

      {error ? (
        <StatusLine tone="bad" className="mt">
          {error}
        </StatusLine>
      ) : null}
    </Panel>
  );
}

function readErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: unknown } | undefined;
    const detail = body?.detail;
    if (typeof detail === "string") return detail;
  }
  return err instanceof Error ? err.message : "Request failed. Please retry.";
}
