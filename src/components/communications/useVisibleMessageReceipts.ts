"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";

type ReceiptTarget = { intakeId: string; channel: "sms" | "email"; threadId?: string; profileId?: string | null } | { unifiedThreadId: string };

/** A view only acknowledges the inbound messages actually visible to the user. */
export function useVisibleMessageReceipts(container: RefObject<HTMLElement>, target: ReceiptTarget, messageIds: string[], enabled = true) {
  const call = useAuthedApi();
  const qc = useQueryClient();
  const [error, setError] = useState("");
  const acknowledged = useRef<{ key: string; ids: Set<string> }>({ key: "", ids: new Set() });
  const retry = useRef<() => void>(() => {});
  const targetKey = JSON.stringify(target);
  const idsKey = [...new Set(messageIds)].sort().join("\n");

  useEffect(() => {
    const receiptTarget: ReceiptTarget = JSON.parse(targetKey);
    if (acknowledged.current.key !== targetKey) { acknowledged.current = { key: targetKey, ids: new Set() }; setError(""); }
    if (!enabled) return;
    let alive = true;
    let inFlight = false;
    let failed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const eligible = new Set(idsKey.split("\n").filter(Boolean));
    const visibleIds = () => {
      const root = container.current;
      if (!root || document.visibilityState !== "visible" || !document.hasFocus()) return [];
      const boundary = root.getBoundingClientRect();
      return [...root.querySelectorAll<HTMLElement>("[data-communication-message-id]")].filter((element) => {
        const id = element.dataset.communicationMessageId!;
        if (!eligible.has(id) || acknowledged.current.ids.has(id)) return false;
        const rect = element.getBoundingClientRect();
        const left = Math.max(0, boundary.left, rect.left), right = Math.min(innerWidth, boundary.right, rect.right);
        const top = Math.max(0, boundary.top, rect.top), bottom = Math.min(innerHeight, boundary.bottom, rect.bottom);
        if (right <= left || bottom <= top) return false;
        const hit = document.elementFromPoint((left + right) / 2, (top + bottom) / 2);
        return Boolean(hit && element.contains(hit));
      }).map((element) => element.dataset.communicationMessageId!).slice(0, 500);
    };
    const save = async () => {
      timer = null;
      if (!alive || inFlight || failed) return;
      const ids = visibleIds();
      if (!ids.length) return;
      inFlight = true;
      const isFile = "intakeId" in receiptTarget;
      const endpoint = isFile ? `/communications/intakes/${encodeURIComponent(receiptTarget.intakeId)}/seen` : `/communications/threads/${encodeURIComponent(receiptTarget.unifiedThreadId)}/seen`;
      try {
        await call(endpoint, { method: "POST", body: JSON.stringify({ message_ids: ids, ...(isFile ? { channel: receiptTarget.channel, ...(receiptTarget.threadId ? { thread_id: receiptTarget.threadId } : {}) } : {}) }) });
        if (acknowledged.current.key === targetKey) ids.forEach((id) => acknowledged.current.ids.add(id));
        if (alive) setError("");
        for (const key of ["notifications", "intake-communication-unread", "application-email-threads", "unified-communication-contacts", "unified-communication-threads", "inboxThreads", "inboxThread"]) void qc.invalidateQueries({ queryKey: [key] });
      } catch (reason) {
        failed = true;
        if (alive) setError(reason instanceof Error ? reason.message : "Messages loaded, but their read status could not be saved.");
      } finally { inFlight = false; }
    };
    const scan = () => { if (!failed && !inFlight && !timer && visibleIds().length) timer = setTimeout(() => void save(), 200); };
    retry.current = () => { failed = false; setError(""); scan(); };
    scan();
    // The interval also notices a drawer closing above an already mounted view.
    const interval = window.setInterval(scan, 1000);
    const root = container.current;
    root?.addEventListener("scroll", scan, { passive: true });
    window.addEventListener("focus", scan); window.addEventListener("resize", scan);
    document.addEventListener("visibilitychange", scan);
    return () => { alive = false; if (timer) clearTimeout(timer); window.clearInterval(interval); root?.removeEventListener("scroll", scan); window.removeEventListener("focus", scan); window.removeEventListener("resize", scan); document.removeEventListener("visibilitychange", scan); };
  }, [call, container, enabled, idsKey, qc, targetKey]);
  return { error, retry: () => retry.current() };
}
