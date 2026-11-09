"use client";

import { useCallback } from "react";
import { useAuthedApi } from "@/hooks/useApi";
import type { UseOfFundsBudget } from "@/lib/useOfFunds";
import { UseOfFundsBudgetEditor, type BudgetSaveInput, type BudgetEditorControls } from "./UseOfFundsBudgetEditor";

export function UseOfFundsEditor({ profileId, onSaved, initiallyOpen = false, showActions = true, onControlsChange }: { profileId: string; onSaved: () => Promise<unknown> | void; initiallyOpen?: boolean; showActions?: boolean; onControlsChange?: (controls: BudgetEditorControls | null) => void }) {
  const api = useAuthedApi();
  const loadBudget = useCallback(() => api<UseOfFundsBudget>(`/application-profiles/${profileId}/use-of-funds`), [api, profileId]);
  const saveBudget = useCallback((input: BudgetSaveInput) => api<UseOfFundsBudget>(`/application-profiles/${profileId}/use-of-funds`, { method: "PATCH", body: JSON.stringify(input) }), [api, profileId]);
  return <UseOfFundsBudgetEditor key={profileId} loadBudget={loadBudget} saveBudget={saveBudget} onSaved={onSaved} initiallyOpen={initiallyOpen} showActions={showActions} onControlsChange={onControlsChange} />;
}
