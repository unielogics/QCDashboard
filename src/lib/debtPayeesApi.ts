import type { AuthedApi } from "@/lib/worksheetApi";

export type DebtPayeeInventory = {
  obligations: Array<{ id: string; lender: string; vendor_key: string | null; monthly_payment: string | number | null }>;
  payees: Array<{ vendor_key: string; label: string; category: string | null; monthly_average: number | null; months: number; count: number }>;
  schedule_complete: boolean;
  available?: boolean;
};
const base = (profileId: string) => `/application-profiles/${encodeURIComponent(profileId)}/banking/debt-payees`;
export function readDebtPayees(api: AuthedApi, profileId: string) { return api<DebtPayeeInventory>(base(profileId)); }
export function linkDebtPayee(api: AuthedApi, profileId: string, rowId: string, vendorKey: string | null) {
  return api<DebtPayeeInventory>(`${base(profileId)}/${encodeURIComponent(rowId)}`, { method: "PUT", body: JSON.stringify({ vendor_key: vendorKey }) });
}
