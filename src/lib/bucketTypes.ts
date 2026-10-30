/**
 * The closed vocabulary for what kind of room a bucket is.
 *
 * Mirrors `ck_buckets_bucket_type` on the backend. Free text here once held a
 * partner's name as a "type"; the kind is now one of these, and the label is
 * what people read.
 */

export const BUCKET_TYPES = [
  "general",
  "loan_file",
  "underwriting",
  "application_profile",
  "dealer_ai_intake",
  "main_street_intake",
  "real_estate_ai_intake",
  "mca_refinance_intake",
  "commercial_foreclosure_rescue",
  "business_capital_referral",
] as const;

export type BucketType = (typeof BUCKET_TYPES)[number];

const LABELS: Record<BucketType, string> = {
  general: "Document room",
  loan_file: "Loan file",
  underwriting: "Underwriting",
  application_profile: "Application file",
  dealer_ai_intake: "Dealer AI intake",
  main_street_intake: "Main Street intake",
  real_estate_ai_intake: "Real estate AI intake",
  mca_refinance_intake: "MCA refinance intake",
  commercial_foreclosure_rescue: "Commercial foreclosure rescue",
  business_capital_referral: "Business capital referral",
};

/** Kinds an operator may pick when creating or editing a room by hand. */
export const OPERATOR_BUCKET_TYPES: BucketType[] = ["general", "loan_file", "underwriting"];

export function isBucketType(value: unknown): value is BucketType {
  return typeof value === "string" && (BUCKET_TYPES as readonly string[]).includes(value);
}

/** Human label for a kind; an unknown or legacy value is shown as it was stored. */
export function bucketTypeLabel(value: string | null | undefined): string {
  if (!value) return LABELS.general;
  return isBucketType(value) ? LABELS[value] : value;
}
