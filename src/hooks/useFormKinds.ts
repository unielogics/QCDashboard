"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import type { FormKindCatalog } from "@/lib/formKinds";

/** The online-form registry (GET /form-kinds), cached for ten minutes. */
export function useFormKinds() {
  const apiCall = useAuthedApi();
  return useQuery({
    queryKey: ["form-kinds"],
    queryFn: () => apiCall<FormKindCatalog>("/form-kinds"),
    staleTime: 10 * 60_000,
  });
}
