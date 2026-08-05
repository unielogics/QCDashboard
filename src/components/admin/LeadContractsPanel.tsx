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
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { qcBtnPrimary } from "@/components/design-system/buttons";
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
  const { t } = useTheme();
  const status = useLeadContractStatus(intakeId);
  const request = useRequestLeadContract(intakeId);
  const [effectiveDate, setEffectiveDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [pendingType, setPendingType] = useState<string | null>(null);

  if (status.isLoading) {
    return (
      <Card pad={20}>
        <SectionLabel>Contracts</SectionLabel>
        <span style={{ color: t.ink3, fontSize: 13 }}>Loading contract status…</span>
      </Card>
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
    <Card pad={20}>
      <SectionLabel>Contracts</SectionLabel>
      <p style={{ margin: "0 0 12px", color: t.ink2, fontSize: 13, lineHeight: 1.5 }}>
        Request a client-facing engagement agreement. The client signs it via their intake link chat — same
        signing mechanism as the credit authorization above.
      </p>
      <label style={{ display: "block", maxWidth: 220, marginBottom: 14 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 5 }}>
          Effective date
        </div>
        <input
          type="date"
          value={effectiveDate}
          onChange={(e) => setEffectiveDate(e.target.value)}
          style={{ width: "100%", boxSizing: "border-box", padding: "9px 10px", borderRadius: 8, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, fontSize: 13 }}
        />
      </label>

      <div style={{ display: "grid", gap: 10 }}>
        {REQUESTABLE_CONTRACT_TYPES.map((contractType) => {
          const row = byType.get(contractType);
          const requested = Boolean(row?.requested);
          const signed = Boolean(row?.signed);
          const isPending = request.isPending && pendingType === contractType;
          return (
            <div
              key={contractType}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                border: `1px solid ${t.line}`,
                borderRadius: 10,
                padding: "10px 12px",
                background: t.surface2,
              }}
            >
              <div style={{ fontSize: 13, color: t.ink, fontWeight: 600 }}>{CONTRACT_LABELS[contractType]}</div>
              {signed ? (
                <Pill bg={t.profitBg} color={t.profit}>Signed</Pill>
              ) : requested ? (
                <Pill bg={t.warnBg} color={t.warn}>Awaiting signature</Pill>
              ) : (
                <button
                  type="button"
                  style={{ ...qcBtnPrimary(t), opacity: isPending ? 0.6 : 1 }}
                  onClick={() => onRequest(contractType)}
                  disabled={isPending}
                >
                  {isPending ? "Requesting…" : "Request"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {error ? <div style={{ color: t.danger, fontSize: 12.5, marginTop: 12 }}>{error}</div> : null}
    </Card>
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
