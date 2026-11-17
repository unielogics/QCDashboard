// One vocabulary for what a real-estate intake says about the deal. The backend
// folds every way of saying these (app/services/real_estate_vocabulary.py);
// keep the labels and slugs identical to it.

export const RE_TRANSACTION_TYPES = [
  "Purchase",
  "Refinance",
  "Cash-out refinance",
  "Home equity (HELOC)",
  "Bridge",
  "Construction",
  "Portfolio review",
  "Not sure yet",
] as const;

export type Occupancy = "investment" | "primary_residence" | "second_home";

export const OCCUPANCY_LABELS: Record<Occupancy, string> = {
  investment: "Investment property",
  primary_residence: "Primary residence",
  second_home: "Second home",
};

export const OWNER_OCCUPIED: ReadonlySet<string> = new Set<Occupancy>(["primary_residence", "second_home"]);

export function isKnownTransactionType(value: string | null | undefined): boolean {
  return Boolean(value) && (RE_TRANSACTION_TYPES as readonly string[]).includes(value as string);
}
