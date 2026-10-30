"use client";

import { useCallback } from "react";
import { api } from "@/lib/api";
import type { UseOfFundsBudget } from "@/lib/useOfFunds";
import { UseOfFundsBudgetEditor, type BudgetSaveInput } from "@/components/application/UseOfFundsBudgetEditor";

/** Uses the current room credential, never an operator session or a supplied profile ID. */
/**
 * `secondary` is the Documents-tab placement: the editor sits under the
 * uploads as the second thing on the page, so it drops the section's
 * tab-height minimum and takes a divider instead.
 */
export function RoomUseOfFunds({ token, passcode, secondary = false }: { token: string; passcode: string; secondary?: boolean }) {
  const path = `/application-profiles/public/room/${encodeURIComponent(token)}/use-of-funds`;
  const loadBudget = useCallback(() => api<UseOfFundsBudget>(path, { method: "POST", body: JSON.stringify({ passcode }) }), [path, passcode]);
  const saveBudget = useCallback((input: BudgetSaveInput) => api<UseOfFundsBudget>(path, { method: "PATCH", body: JSON.stringify({ ...input, passcode }) }), [path, passcode]);
  return <section className={secondary ? "application-room-section application-room-section--secondary" : "application-room-section"}><UseOfFundsBudgetEditor key={token} audience="client" loadBudget={loadBudget} saveBudget={saveBudget} /></section>;
}
