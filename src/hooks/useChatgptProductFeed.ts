"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi, useDevUser } from "@/hooks/useApi";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { ApiError, apiBase } from "@/lib/api";
import { CHATGPT_FEED_API, feedSettingsWrite, type ChatgptFeedPreview, type ChatgptFeedRun, type ChatgptFeedSettings } from "@/lib/chatgptProductFeed";

export function useChatgptProductFeed(userId: string) {
  const call = useAuthedApi();
  const { getToken } = useConsoleAuth();
  const devUser = useDevUser();
  const cache = useQueryClient();
  const key = ["chatgpt-product-feed", userId];
  const settings = useQuery({ queryKey: [...key, "settings"], queryFn: () => call<ChatgptFeedSettings>(`${CHATGPT_FEED_API}/settings`), retry: false, refetchInterval: 30000 });
  const runs = useQuery({
    queryKey: [...key, "runs"], queryFn: () => call<ChatgptFeedRun[]>(`${CHATGPT_FEED_API}/runs`), retry: false,
    refetchInterval: (query) => query.state.data?.some((run) => run.status === "running" || run.status === "queued") ? 4000 : 30000,
  });
  const save = useMutation({
    mutationFn: (value: ChatgptFeedSettings) => call<ChatgptFeedSettings>(`${CHATGPT_FEED_API}/settings`, { method: "PUT", body: JSON.stringify(feedSettingsWrite(value)) }),
    onSuccess: (value) => cache.setQueryData([...key, "settings"], value),
  });
  const generateKey = useMutation({
    mutationFn: () => call<ChatgptFeedSettings>(`${CHATGPT_FEED_API}/key-pair`, { method: "POST", body: JSON.stringify({ rotate: false }) }),
    onSuccess: (value) => cache.setQueryData([...key, "settings"], value),
  });
  const preview = useMutation({ mutationFn: (value: ChatgptFeedSettings) => call<ChatgptFeedPreview>(`${CHATGPT_FEED_API}/preview`, { method: "POST", body: JSON.stringify({ settings: feedSettingsWrite(value) }) }) });
  const test = useMutation({
    mutationFn: () => call<{ message?: string; settings?: ChatgptFeedSettings }>(`${CHATGPT_FEED_API}/test-connection`, { method: "POST" }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: [...key, "settings"] }); },
  });
  const sync = useMutation({
    mutationFn: (idempotencyKey: string) => call<ChatgptFeedRun>(`${CHATGPT_FEED_API}/sync`, { method: "POST", body: JSON.stringify({ idempotency_key: idempotencyKey }) }),
    onSuccess: () => { void cache.invalidateQueries({ queryKey: key }); },
  });
  const download = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const response = await fetch(`${apiBase}/api/v1${CHATGPT_FEED_API}/download`, {
        cache: "no-store", headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) },
      });
      if (!response.ok) {
        let detail: unknown;
        try { detail = (await response.json()).detail; } catch { /* generic message */ }
        throw new ApiError(response.status, typeof detail === "string" ? detail : "The validated feed could not be downloaded. Preview the saved catalog for details.");
      }
      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = href; link.download = settings.data?.filename || "qualified-commercial.csv.gz";
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    },
  });
  return { settings, runs, save, generateKey, preview, test, sync, download };
}
