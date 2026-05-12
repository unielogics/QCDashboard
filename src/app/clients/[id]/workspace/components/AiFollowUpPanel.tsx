"use client";

// AI Follow-Up tab. Mounts the existing drag-and-drop workbench
// (DealSecretaryPicker) scoped to one of three contexts:
//   - Client-level (pre-deal, pre-loan)
//   - Deal-level (one of WorkspaceData.deals[])
//   - Funding-file-level (one of WorkspaceData.funding_files[], i.e. a Loan)
//
// The same picker the loan workbench renders is reused unchanged via
// WorkspaceAiWorkbench (only the surrounding hooks differ).

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { useCurrentUser } from "@/hooks/useApi";
import type { WorkspaceData } from "@/lib/types";
import { WorkspaceAiWorkbench } from "./WorkspaceAiWorkbench";

type ScopeKey = "client" | `deal:${string}` | `loan:${string}`;

export function AiFollowUpPanel({
  clientId,
  data,
  initialScope,
}: {
  clientId: string;
  data: WorkspaceData;
  initialScope?: { dealId?: string | null; loanId?: string | null };
}) {
  const { t } = useTheme();
  const { data: currentUser } = useCurrentUser();
  const isOperator = currentUser?.role === "super_admin" || currentUser?.role === "loan_exec";

  const initial: ScopeKey = initialScope?.loanId
    ? `loan:${initialScope.loanId}`
    : initialScope?.dealId
    ? `deal:${initialScope.dealId}`
    : "client";
  const [scope, setScope] = useState<ScopeKey>(initial);

  const scopeParts: { dealId?: string | null; loanId?: string | null } = {};
  if (scope.startsWith("deal:")) scopeParts.dealId = scope.slice(5);
  if (scope.startsWith("loan:")) scopeParts.loanId = scope.slice(5);

  const hasAnyScope = data.deals.length > 0 || data.funding_files.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionLabel>AI Follow-Up</SectionLabel>
        {hasAnyScope ? (
          <div style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            <ScopeChip
              t={t}
              label="Client-level"
              active={scope === "client"}
              onClick={() => setScope("client")}
            />
            {data.deals.map((d) => (
              <ScopeChip
                key={d.id}
                t={t}
                label={`${d.deal_type} · ${d.title.slice(0, 24)}${d.title.length > 24 ? "…" : ""}`}
                active={scope === `deal:${d.id}`}
                onClick={() => setScope(`deal:${d.id}` as ScopeKey)}
              />
            ))}
            {data.funding_files.map((f) => (
              <ScopeChip
                key={f.id}
                t={t}
                label={`Loan · ${f.deal_id ?? f.id.slice(0, 6)}`}
                active={scope === `loan:${f.id}`}
                onClick={() => setScope(`loan:${f.id}` as ScopeKey)}
              />
            ))}
          </div>
        ) : null}
      </div>

      {!hasAnyScope ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            Showing client-level AI follow-up. Once you create a deal or fire Ready-for-Lending,
            you can switch scopes here to manage deal-specific or funding-file follow-ups.
          </div>
        </Card>
      ) : null}

      <WorkspaceAiWorkbench
        clientId={clientId}
        scope={scopeParts}
        isOperator={isOperator}
      />
    </div>
  );
}

function ScopeChip({
  t,
  label,
  active,
  onClick,
}: {
  t: ReturnType<typeof import("@/components/design-system/ThemeProvider").useTheme>["t"];
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 700,
        borderRadius: 999,
        border: `1px solid ${active ? t.brand : t.line}`,
        background: active ? t.brandSoft : t.surface,
        color: active ? t.brand : t.ink2,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}
