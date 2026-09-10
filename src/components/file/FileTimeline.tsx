"use client";

// What happened on a file, newest first, grouped by day.
//
// Reads /application-profiles/{id}/timeline at the caller's tier and polls it
// every thirty seconds; "Load more" pages back with `before`. A row is a title
// — never a message body, a note or a review — so the list is safe to show at
// any tier the server hands back.

import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, CellChip, Empty, Loading, Panel, Row, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import {
  fileEventIcon,
  fileEventLabel,
  groupEventsByDay,
  mergeEvents,
  relativeTime,
  type FileEvent,
  type FileEventVisibility,
  type FileTimelineRead,
} from "@/lib/fileUpdates";

const PAGE = 50;
const POLL_MS = 30_000;

const TIER_NOTE: Record<FileEventVisibility, string> = {
  client: "What the client sees on their file.",
  team: "What the agent and underwriters see.",
  desk: "Everything on this file, including desk-only rows.",
};

export function FileTimeline({
  profileId,
  tier,
  compact = false,
}: {
  profileId: string | null | undefined;
  /** Copy only — the server decides the tier it returns. */
  tier?: FileEventVisibility;
  /** Titles and times only, no bodies. */
  compact?: boolean;
}) {
  const api = useAuthedApi();
  const [events, setEvents] = useState<FileEvent[]>([]);
  const [unread, setUnread] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The oldest row on screen, read by "Load more" without a stale closure.
  const oldestRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!profileId) return;
    try {
      const page = await api<FileTimelineRead>(`/application-profiles/${profileId}/timeline?limit=${PAGE}`);
      setEvents((current) => {
        const merged = mergeEvents(current, page.events);
        oldestRef.current = merged.length ? merged[merged.length - 1].created_at : null;
        return merged;
      });
      setUnread(page.unread_count);
      if (page.events.length < PAGE) setExhausted(true);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The timeline could not be loaded.");
    } finally {
      setLoaded(true);
    }
  }, [api, profileId]);

  useEffect(() => {
    setEvents([]);
    setUnread(0);
    setLoaded(false);
    setExhausted(false);
    setError(null);
    oldestRef.current = null;
    if (!profileId) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [profileId, refresh]);

  const loadMore = async () => {
    const before = oldestRef.current;
    if (!profileId || !before) return;
    setBusy("more");
    try {
      const page = await api<FileTimelineRead>(
        `/application-profiles/${profileId}/timeline?limit=${PAGE}&before=${encodeURIComponent(before)}`,
      );
      setEvents((current) => {
        const merged = mergeEvents(current, page.events);
        oldestRef.current = merged.length ? merged[merged.length - 1].created_at : null;
        return merged;
      });
      if (page.events.length < PAGE) setExhausted(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Older rows could not be loaded.");
    } finally {
      setBusy("");
    }
  };

  const markAllRead = async () => {
    if (!profileId) return;
    setBusy("seen");
    try {
      await api(`/application-profiles/${profileId}/timeline/seen`, { method: "POST" });
      setUnread(0);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not mark the file read.");
    } finally {
      setBusy("");
    }
  };

  if (!profileId) return null;

  const days = groupEventsByDay(events);

  return (
    <Panel
      title="Updates"
      sub={!compact && tier ? TIER_NOTE[tier] : undefined}
      actions={
        <Row>
          {unread > 0 ? <CellChip tone="acc">{unread} unread</CellChip> : null}
          <Btn size="sm" onClick={markAllRead} disabled={busy !== "" || unread === 0}>
            {busy === "seen" ? "Marking…" : unread > 0 ? `Mark all read (${unread})` : "Mark all read"}
          </Btn>
        </Row>
      }
    >
      {error ? <WarnLine>{error}</WarnLine> : null}
      {!loaded && !events.length ? (
        <Loading>Loading the file timeline…</Loading>
      ) : !events.length ? (
        <Empty>Nothing on this file yet.</Empty>
      ) : (
        <div className="grid">
          {days.map((day) => (
            <div key={day.key}>
              <div className="lbl">{day.label}</div>
              <div className="application-audit-timeline">
                {day.events.map((event) => (
                  <article key={event.id}>
                    <span className="application-audit-dot" title={fileEventLabel(event.kind)}>
                      <Icon name={fileEventIcon(event.kind)} size={compact ? 10 : 12} />
                    </span>
                    <div>
                      <header>
                        <b>{event.title}</b>
                        {event.visibility !== "client" ? <CellChip tone="mut">{event.visibility}</CellChip> : null}
                      </header>
                      <div className="sub">
                        {event.actor_label ? `${event.actor_label} · ` : ""}
                        {relativeTime(event.created_at)}
                      </div>
                      {!compact && event.body ? <div className="sub subline">{event.body}</div> : null}
                    </div>
                    <time dateTime={event.created_at}>
                      {new Date(event.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                    </time>
                  </article>
                ))}
              </div>
            </div>
          ))}
          {!exhausted ? (
            <Row>
              <Btn size="sm" onClick={loadMore} disabled={busy !== ""}>
                {busy === "more" ? "Loading…" : "Load more"}
              </Btn>
            </Row>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
