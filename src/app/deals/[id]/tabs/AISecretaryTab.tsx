"use client";

// AI Secretary tab — the drag-drop workbench scoped to this deal
// (or the linked funding loan if the deal has been promoted).

import { WorkspaceAiWorkbench } from "@/components/WorkspaceAiWorkbench";
import { useCurrentUser } from "@/hooks/useApi";

export function AISecretaryTab({
  clientId,
  dealId,
  loanId,
}: {
  clientId: string;
  dealId: string;
  loanId: string | null;
}) {
  const { data: user } = useCurrentUser();
  const isOperator = user?.role === "super_admin" || user?.role === "loan_exec";
  // Once promoted, scope to the loan so the workbench picks up the
  // lending-stage CRS rows. Pre-promotion stays deal-scoped.
  const scope = loanId ? { loanId } : { dealId };
  return <WorkspaceAiWorkbench clientId={clientId} scope={scope} isOperator={isOperator} />;
}
