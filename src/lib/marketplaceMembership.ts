export type MarketplaceMembershipPolicy = {
  policy_version: string;
  label: string;
  summary: string;
  requirements: Array<{ key: string; label: string; detail: string }>;
  waiting_period_days: number;
  limitations: string[];
  approved_status: string;
  waiting_end_must_have_passed_if_set: boolean;
  requires_accreditation_acknowledgement: boolean;
  requires_ppm_acknowledgement: boolean;
  independent_accreditation_verification: boolean;
  operator_subscriptions_allowed: boolean;
};
