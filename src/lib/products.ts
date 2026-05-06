// Single source of truth for which loan products are visible in the UI.
// MIRROR of qcmobile/src/lib/products.ts — keep both files in sync.
//
// Existing loans of disabled types still display correctly; this only
// filters product pickers used to create new loans or run free simulations.

import type { LoanType } from "./enums.generated";

// Loan types temporarily hidden from product pickers.
const DISABLED_LOAN_TYPES = new Set<LoanType>(["ground_up"]);

export function isLoanTypeEnabled(t: LoanType): boolean {
  return !DISABLED_LOAN_TYPES.has(t);
}

// Maps simulator product keys ("dscr" | "ff" | "gu" | "br") to backend
// LoanType enum values.
const PRODUCT_KEY_TO_LOAN_TYPE: Record<string, LoanType> = {
  dscr: "dscr",
  ff: "fix_and_flip",
  gu: "ground_up",
  br: "bridge",
};

export function isProductKeyEnabled(key: string): boolean {
  const t = PRODUCT_KEY_TO_LOAN_TYPE[key];
  return t == null ? true : isLoanTypeEnabled(t);
}
