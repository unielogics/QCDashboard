"use client";

import { useQuery, useMutation, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useActiveProfile } from "@/store/role";
import type { AITask, Broker, CalendarEvent, Client, Document, Loan, Message, RecalcResponse } from "@/lib/types";

function useDevUser(): string {
  return useActiveProfile().email;
}

export function useLoans() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["loans", devUser],
    queryFn: () => api<Loan[]>("/loans", { devUser }),
  });
}

export function useLoan(loanId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["loan", loanId, devUser],
    queryFn: () => api<Loan>(`/loans/${loanId}`, { devUser }),
    enabled: !!loanId,
  });
}

export function useClients() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["clients", devUser],
    queryFn: () => api<Client[]>("/clients", { devUser }),
  });
}

export function useClient(clientId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["client", clientId, devUser],
    queryFn: () => api<Client>(`/clients/${clientId}`, { devUser }),
    enabled: !!clientId,
  });
}

export function useAITasks() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["aiTasks", devUser],
    queryFn: () => api<AITask[]>("/ai-tasks", { devUser }),
  });
}

export function useDocuments(loanId?: string) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["documents", loanId, devUser],
    queryFn: () => api<Document[]>(loanId ? `/documents?loan_id=${loanId}` : "/documents", { devUser }),
  });
}

export function useMessages(loanId: string | null | undefined) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["messages", loanId, devUser],
    queryFn: () => api<Message[]>(`/messages?loan_id=${loanId}`, { devUser }),
    enabled: !!loanId,
  });
}

export function useCalendar() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["calendar", devUser],
    queryFn: () => api<CalendarEvent[]>("/calendar", { devUser }),
  });
}

export function useBrokerLeaderboard() {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["leaderboard", devUser],
    queryFn: () => api<Broker[]>("/brokers/leaderboard", { devUser }),
  });
}

export function useRecalc() {
  const devUser = useDevUser();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      loanId,
      discount_points,
      loan_amount,
      base_rate,
    }: {
      loanId: string;
      discount_points: number;
      loan_amount?: number;
      base_rate?: number;
    }) =>
      api<RecalcResponse>(`/loans/${loanId}/recalc`, {
        method: "POST",
        devUser,
        body: JSON.stringify({ discount_points, loan_amount, base_rate }),
      }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ["loan", vars.loanId] }),
  });
}

export function useGlobalSearch(query: string) {
  const devUser = useDevUser();
  return useQuery({
    queryKey: ["search", query, devUser],
    queryFn: () =>
      api<{ client_id: string; client_name: string; items: { kind: string; id: string; title: string; subtitle?: string }[] }[]>(
        `/search?q=${encodeURIComponent(query)}`,
        { devUser }
      ),
    enabled: query.trim().length >= 2,
  });
}
