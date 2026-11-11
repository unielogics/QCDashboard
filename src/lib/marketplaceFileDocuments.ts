export type MarketplaceFileDocuments = {
  access: { state: "staff_preview" | "locked" | "granted" };
  groups: Array<{ category: string; label: string; year: number | string | null; file_count: number; releasable_count: number }>;
  originals: Array<{ file_id: string; file_name: string; category: string; year: number | string | null; version: number; content_type: string | null; size_bytes: number | null; releasable: boolean; previewable?: boolean }>;
  summaries: {
    bank_activity: Array<{ month: string; deposits: number | null; withdrawals: number | null; net: number | null; currency: string | null }>;
    tax_years: Array<{ year: number | string; gross_receipts: number | null; income: number | null; total_deductions: number | null; gross_receipts_change_pct: number | null; income_change_pct: number | null; currency: string | null }>;
  };
};
