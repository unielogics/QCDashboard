"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { canUseReferralIntake } from "@/lib/roleAccess";

export type ReferralProgram = {
  program_key: string;
  name: string;
  short_description?: string | null;
  variants: string[];
  intent_keys_by_variant?: Record<string, string[]>;
};

export const REFERRAL_TYPE_LABELS: Record<string, string> = {
  dealer: "Auto dealer",
  real_estate: "Real estate",
  main_street: "Operating business",
  mca_refinance: "MCA refinance",
  foreclosure_rescue: "Commercial foreclosure rescue",
};

export function useReferralPrograms() {
  const api = useAuthedApi();
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["referral-programs", user?.id],
    queryFn: () => api<ReferralProgram[]>("/broker/ai-underwriter-leads/programs"),
    enabled: canUseReferralIntake(user?.role),
    staleTime: 30_000,
  });
}
