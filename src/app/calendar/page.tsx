"use client";

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useCalendar } from "@/hooks/useApi";
import { EventModal } from "./components/EventModal";

export default function CalendarPage() {
  const { t } = useTheme();
  const { data: events = [] } = useCalendar();
  const [createOpen, setCreateOpen] = useState(false);

  // Group by day
  const byDay = events.reduce<Record<string, typeof events>>((acc, ev) => {
    const k = new Date(ev.starts_at).toISOString().slice(0, 10);
    (acc[k] ||= []).push(ev);
    return acc;
  }, {});
  const days = Object.keys(byDay).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Calendar</h1>
        <Pill>{events.length} events</Pill>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            padding: "8px 14px", borderRadius: 10, background: t.brand, color: t.inverse,
            fontSize: 13, fontWeight: 700,
            display: "inline-flex", alignItems: "center", gap: 6,
            cursor: "pointer", border: "none",
          }}
        >
          <Icon name="plus" size={14} /> New event
        </button>
      </div>
      <EventModal open={createOpen} onClose={() => setCreateOpen(false)} />

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {days.length === 0 && (
          <Card pad={16}>
            <div style={{ fontSize: 13, color: t.ink3 }}>No events yet — create one to get started.</div>
          </Card>
        )}
        {days.map((day) => (
          <Card key={day} pad={16}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase" }}>
              {new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {byDay[day].map((ev) => (
                <div key={ev.id} style={{ display: "flex", gap: 12, padding: 10, borderRadius: 10, border: `1px solid ${t.line}`, alignItems: "center" }}>
                  <div style={{ width: 56, fontSize: 12, fontWeight: 700, color: t.ink2 }}>
                    {new Date(ev.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{ev.title}</div>
                    <div style={{ fontSize: 11.5, color: t.ink3 }}>{ev.who ?? "—"} · {ev.duration_min ?? 0}m</div>
                  </div>
                  {ev.priority === "high" && <Pill bg={t.dangerBg} color={t.danger}>high</Pill>}
                  <Pill>{ev.kind}</Pill>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
