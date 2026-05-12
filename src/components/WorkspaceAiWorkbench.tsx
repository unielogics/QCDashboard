"use client";

// Thin wrapper that mounts the existing DealSecretaryPicker (drag-drop
// AI workbench) scoped to a (client, deal?, loan?) tuple. Same picker
// the funding /loans/[id] page renders, just hitting the client-scoped
// endpoints so it can drive deal-stage requirements before a loan
// exists.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { DealSecretaryPicker } from "@/components/DealSecretaryPicker";
import {
  useClientAiFollowUp,
  useAssignClientTask,
  useUnassignClientTask,
  useUpdateClientFileSettings,
} from "@/hooks/useApi";
import type { DSOutreachMode, DSTaskRow } from "@/lib/types";

export interface WorkspaceAiWorkbenchProps {
  clientId: string;
  scope: { dealId?: string | null; loanId?: string | null };
  isOperator: boolean;
}

export function WorkspaceAiWorkbench({ clientId, scope, isOperator }: WorkspaceAiWorkbenchProps) {
  const { t } = useTheme();
  const router = useRouter();
  const { data: view, isLoading, error } = useClientAiFollowUp({
    clientId,
    dealId: scope.dealId ?? null,
    loanId: scope.loanId ?? null,
  });
  const assign = useAssignClientTask(clientId);
  const unassign = useUnassignClientTask(clientId);
  const updateSettings = useUpdateClientFileSettings(clientId);

  if (isLoading) {
    return (
      <Card pad={20}>
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading AI Secretary…</div>
      </Card>
    );
  }
  if (error || !view) {
    return (
      <Card pad={20}>
        <SectionLabel>AI Secretary unavailable</SectionLabel>
        <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>
          Couldn&apos;t load the AI Secretary view. Try refreshing.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <DealSecretaryPicker
        view={view}
        isOperator={isOperator}
        onAssign={(requirement_key) =>
          assign.mutate({
            body: { requirement_key },
            dealId: scope.dealId,
            loanId: scope.loanId,
          })
        }
        onUnassign={(requirement_key) =>
          unassign.mutate({
            requirementKey: requirement_key,
            dealId: scope.dealId,
            loanId: scope.loanId,
          })
        }
        onChangeOutreachMode={(mode: DSOutreachMode) =>
          updateSettings.mutate({
            body: { outreach_mode: mode },
            dealId: scope.dealId,
            loanId: scope.loanId,
          })
        }
        onOpenAssignment={(task: DSTaskRow) => {
          if (scope.loanId) {
            router.push(`/loans/${scope.loanId}?tab=workspace&focus=${task.requirement_key}`);
          }
        }}
      />

      {scope.loanId ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Link
            href={`/loans/${scope.loanId}?tab=workspace`}
            style={{
              padding: "6px 12px",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            Open funding workbench <Icon name="chevR" size={11} />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
