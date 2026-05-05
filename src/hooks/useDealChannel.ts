"use client";

// WebSocket subscription to /messages/ws/{deal_id}.
// On every {kind: "message", message} event, push into React Query cache for the
// matching loan so the UI updates without polling. Reconnects with backoff.

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiBase } from "@/lib/api";
import { useActiveProfile } from "@/store/role";
import type { Message } from "@/lib/types";

interface ChannelEvent {
  kind: "message" | string;
  message?: Message;
}

export function useDealChannel(loanId: string | null | undefined, dealId: string | null | undefined) {
  const qc = useQueryClient();
  const devUser = useActiveProfile().email;

  useEffect(() => {
    if (!dealId || !loanId) return;

    const wsBase = apiBase.replace(/^http/, "ws");
    // The dev backend doesn't enforce auth on WS; carry devUser via query string
    // anyway so logs/observability can attribute it.
    const url = `${wsBase}/api/v1/messages/ws/${encodeURIComponent(dealId)}?dev_user=${encodeURIComponent(devUser)}`;

    let ws: WebSocket | null = null;
    let attempt = 0;
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      try {
        ws = new WebSocket(url);
      } catch {
        scheduleReconnect();
        return;
      }
      ws.onmessage = (ev) => {
        try {
          const data: ChannelEvent = JSON.parse(ev.data);
          if (data.kind === "message" && data.message) {
            const incoming = data.message;
            qc.setQueryData<Message[]>(["messages", loanId, devUser], (old) => {
              const list = old ?? [];
              if (list.some((m) => m.id === incoming.id)) return list;
              return [...list, incoming];
            });
          }
        } catch {
          // ignore malformed events
        }
      };
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onclose = () => {
        if (!cancelled) scheduleReconnect();
      };
      ws.onerror = () => {
        // onclose fires after onerror, scheduling happens there
      };
    };

    const scheduleReconnect = () => {
      attempt += 1;
      const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000);
      reconnectTimer = setTimeout(() => connect(), delay);
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onmessage = null;
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
    };
  }, [dealId, loanId, devUser, qc]);
}
