"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { cx } from "@/components/ds";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationFeed,
  useNotifications,
} from "@/hooks/useApi";
import type { Notification, NotificationGroup } from "@/lib/types";
import styles from "./NotificationCenter.module.css";

const GROUPS = [
  { key: "sms", label: "SMS", title: "SMS alerts", icon: "chat" },
  { key: "email", label: "Email", title: "Email alerts", icon: "mail" },
  { key: "general", label: "Alerts", title: "General notifications", icon: "bell" },
] as const;

export function NotificationCenter() {
  const router = useRouter();
  const pathname = usePathname();
  const wrapper = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState<NotificationGroup | null>(null);
  const [status, setStatus] = useState<"all" | "unread">("unread");
  const [error, setError] = useState<string | null>(null);
  const counts = useNotifications();
  const feed = useNotificationFeed(open, status);
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const group = GROUPS.find((item) => item.key === open);
  const unread = open ? counts.data?.unread_counts?.[open] : 0;
  const items = [...new Map((feed.data?.pages.flatMap((page) => page.items) ?? [])
    .map((item) => [item.id, item])).values()];

  useEffect(() => { setOpen(null); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(null);
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  function toggle(key: NotificationGroup, button: HTMLButtonElement) {
    trigger.current = button;
    setError(null);
    markAllRead.reset();
    if (open === key) { setOpen(null); return; }
    setStatus((counts.data?.unread_counts?.[key] ?? 0) > 0 ? "unread" : "all");
    setOpen(key);
  }

  function openNotification(item: Notification) {
    const link = item.deep_link;
    if (!link?.startsWith("/") || link.startsWith("//")) {
      setError("This alert has no available destination. Refresh and try again.");
      return;
    }
    setOpen(null);
    router.push(link);
    // Incoming communication alerts clear only after the actual conversation
    // loads and reports the messages displayed. A navigation click is not a read.
    if (!item.read_at && item.event_type !== "sms_received" && item.event_type !== "email_received") {
      markRead.mutate(item.id, {
        onError: () => setError("The alert could not be marked read. You can try again from Alerts."),
      });
    }
  }

  return (
    <div ref={wrapper} className={styles.center}>
      <div className={styles.triggers} role="group" aria-label="Communication and general alerts">
        {GROUPS.map((item) => {
          const count = counts.data?.unread_counts?.[item.key];
          const countUnavailable = counts.isError && count === undefined;
          return (
            <button key={item.key} type="button"
              className={cx("btn sm badged", styles.trigger, open === item.key && "tone-pet")}
              title={item.title}
              aria-label={countUnavailable ? `${item.title}, count unavailable` : count ? `${count} unread ${item.title.toLowerCase()}` : item.title}
              aria-haspopup="dialog" aria-expanded={open === item.key}
              aria-controls={open === item.key ? "notification-center-panel" : undefined}
              onClick={(event) => toggle(item.key, event.currentTarget)}>
              <Icon name={item.icon} size={16} />
              <span className={styles.triggerLabel}>{item.label}</span>
              {count !== undefined && count > 0 ? <span className="cnt sm" aria-hidden="true">{count > 99 ? "99+" : count}</span> : null}
              {countUnavailable ? <span className="cnt sm" aria-hidden="true">!</span> : null}
            </button>
          );
        })}
      </div>
      {open && group ? (
        <section id="notification-center-panel" role="dialog" aria-label={group.title} className={styles.panel}>
          <header className={styles.header}>
            <div>
              <b>{group.title}</b>
              <div className="sub">{counts.isError ? unread === undefined ? "Unread count unavailable" : `Last count: ${unread} unread · refresh unavailable` : unread === undefined ? "Checking unread alerts…" : `${unread} unread`}</div>
            </div>
            <button className="btn sm iconbtn" type="button" aria-label="Close alerts" onClick={() => { setOpen(null); trigger.current?.focus(); }}><Icon name="x" size={14} /></button>
          </header>
          <div className={styles.toolbar}>
            <div className="seg" role="group" aria-label="Alert status">
              <button className={status === "unread" ? "on" : ""} type="button" aria-pressed={status === "unread"} onClick={() => setStatus("unread")}>Unread</button>
              <button className={status === "all" ? "on" : ""} type="button" aria-pressed={status === "all"} onClick={() => setStatus("all")}>All</button>
            </div>
            {Boolean(unread) ? <button className="btn sm" type="button" disabled={markAllRead.isPending} onClick={() => markAllRead.mutate(open)}>
              {markAllRead.isPending ? "Marking…" : "Mark alerts read"}
            </button> : null}
          </div>
          {markAllRead.isError ? <div className={styles.error} role="alert">Could not mark these alerts read. Try again.</div> : null}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}
          <div className={styles.list} aria-busy={feed.isFetching}>
            {feed.isPending ? <div className={styles.empty}>Loading alerts…</div> : null}
            {feed.isError ? <div className={styles.empty} role="alert">
              Alerts could not be loaded.
              <button className="btn sm" type="button" onClick={() => void feed.refetch()}>Try again</button>
            </div> : null}
            {!feed.isPending && !feed.isError && !items.length ? <div className={styles.empty}>
              {status === "unread" ? "No unread alerts." : `No ${open === "general" ? "general" : group.label} alerts yet.`}
              {status === "unread" ? <button className="btn sm" type="button" onClick={() => setStatus("all")}>View all alerts</button> : null}
            </div> : null}
            {items.map((item) => (
              <button key={item.id} type="button" className={cx(styles.item, !item.read_at && styles.unread)} onClick={() => openNotification(item)}>
                <span className={styles.dot} aria-hidden="true" style={{ visibility: item.read_at ? "hidden" : "visible" }} />
                <span className={styles.content}>
                  <b>{item.title}</b>
                  <span className="sub">{item.body}</span>
                  <span className={styles.meta}>{item.read_at ? "Read" : "Unread"} · {formatTime(item.created_at)}</span>
                  <span className={styles.openLabel}>{item.event_type === "sms_received" ? "Open conversation" : item.event_type === "email_received" ? "Open email" : "View details"}<Icon name="arrowR" size={12} /></span>
                </span>
              </button>
            ))}
            {feed.hasNextPage ? <div className={styles.more}><button className="btn sm" type="button" disabled={feed.isFetchingNextPage} onClick={() => void feed.fetchNextPage()}>{feed.isFetchingNextPage ? "Loading…" : "Load more"}</button></div> : null}
          </div>
          {open !== "general" ? <footer className={styles.footer}>New message alerts clear after you view the message. Mark alerts read clears this channel’s alerts; messages remain available.</footer> : null}
        </section>
      ) : null}
      {error && !open ? <div className={styles.toast} role="alert">{error}<button className="btn sm iconbtn" type="button" aria-label="Dismiss alert error" onClick={() => setError(null)}><Icon name="x" size={12} /></button></div> : null}
    </div>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const diff = Math.max(0, Date.now() - date.getTime());
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
