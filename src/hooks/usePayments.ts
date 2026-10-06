"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import {
  paymentIdempotencyKey,
  paymentPaths,
  paymentsQueueQuery,
  normalizePaymentSummary,
  normalizePaymentsQueue,
  type FeeAllocation,
  type FeeAllocationInput,
  type PaymentSummary,
  type PaymentSummaryWire,
  type PaymentsQueueFilters,
  type PaymentsQueueResponse,
  type PaymentsQueueResponseWire,
} from "@/lib/payments";

export function paymentSummaryKey(profileId: string | null | undefined) {
  return ["payments", "summary", profileId ?? ""] as const;
}

export function usePaymentSummary(profileId: string | null | undefined, enabled = true) {
  const call = useAuthedApi();
  return useQuery({
    queryKey: paymentSummaryKey(profileId),
    queryFn: async () => {
      const response = await call<PaymentSummaryWire | PaymentSummary>(paymentPaths.summary(profileId!));
      return "economics" in response ? normalizePaymentSummary(response as PaymentSummaryWire) : response as PaymentSummary;
    },
    enabled: Boolean(profileId && enabled),
    staleTime: 15_000,
    retry: (count, error) => !(error instanceof Error && /\b(401|403|404)\b/.test(error.message)) && count < 1,
  });
}

export function useSaveFeeAllocation(profileId: string | null | undefined) {
  const call = useAuthedApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: FeeAllocationInput) => {
      const response = await call<PaymentSummaryWire | PaymentSummary | FeeAllocation>(paymentPaths.allocation(profileId!), {
      method: "PUT",
      headers: { "Idempotency-Key": paymentIdempotencyKey("fee-allocation", profileId!) },
      body: JSON.stringify({
        collection_mode: body.collection_mode,
        expected_record_version: body.expected_version,
        client_ach_amount: body.client_ach_amount,
        origination_client_ach_amount: body.origination_client_ach_amount,
        consulting_client_ach_amount: body.consulting_client_ach_amount,
        bank_direct_amount: body.bank_direct_amount,
        external_amount: body.external_amount,
        deferred_amount: body.deferred_amount,
        waived_amount: body.waived_amount,
        reason: "Operator updated the fee payment allocation",
      }),
    });
      if ("client_ach_amount" in response) return response as FeeAllocation;
      if ("economics" in response) return normalizePaymentSummary(response as PaymentSummaryWire).allocation as FeeAllocation;
      return (response as PaymentSummary).allocation as FeeAllocation;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: paymentSummaryKey(profileId) }),
  });
}

export function usePaymentCommand(profileId: string | null | undefined) {
  const call = useAuthedApi();
  const queryClient = useQueryClient();
  // Keep the same command key while an outcome is uncertain (network loss,
  // timeout, or a retry click). A completed command clears the key so a later,
  // explicitly initiated operation receives a new identity.
  const pendingKeys = useRef(new Map<string, string>());
  return useMutation({
    mutationFn: async ({ path, action, entityId, body }: { path: string; action: string; entityId: string; body?: Record<string, unknown> }) => {
      const operation = `${action}:${entityId}`;
      const idempotencyKey = pendingKeys.current.get(operation) ?? paymentIdempotencyKey(action, entityId);
      pendingKeys.current.set(operation, idempotencyKey);
      const result = await call<PaymentSummaryWire | Record<string, unknown>>(path, {
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({ ...(body ?? {}), idempotency_key: idempotencyKey }),
      });
      if (result && "economics" in result) return normalizePaymentSummary(result as PaymentSummaryWire);
      return result;
    },
    onSuccess: (_result, variables) => {
      pendingKeys.current.delete(`${variables.action}:${variables.entityId}`);
      queryClient.invalidateQueries({ queryKey: paymentSummaryKey(profileId) });
      queryClient.invalidateQueries({ queryKey: ["payments", "queue"] });
    },
    onError: (error, variables) => {
      // The server conclusively rejected these client errors. A corrected
      // submission needs a fresh identity; uncertain timeout/server outcomes
      // intentionally retain the original key for safe replay.
      if (error instanceof ApiError && error.status >= 400 && error.status < 500 && ![408, 429].includes(error.status)) {
        pendingKeys.current.delete(`${variables.action}:${variables.entityId}`);
      }
    },
  });
}

export function usePaymentsQueue(filters: PaymentsQueueFilters) {
  const call = useAuthedApi();
  return useQuery({
    queryKey: ["payments", "queue", filters],
    queryFn: async () => {
      const response = await call<PaymentsQueueResponseWire | PaymentsQueueResponse>(paymentsQueueQuery(filters));
      return "page" in response ? normalizePaymentsQueue(response as PaymentsQueueResponseWire) : response as PaymentsQueueResponse;
    },
    staleTime: 20_000,
    retry: (count, error) => !(error instanceof Error && /\b(401|403|404)\b/.test(error.message)) && count < 1,
  });
}
