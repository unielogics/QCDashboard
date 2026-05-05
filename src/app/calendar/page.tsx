"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { useCalendar } from "@/hooks/useApi";

export default function CalendarPage() {
  const { t } = useTheme();
  const { data: events = [] } = useCalendar();

  // Group by day
  const byDay = events.reduce<Record<string, typeof events>>((acc, ev) => {
    const k = new Date(ev.starts_at).toISOString().slice(0, 10);
    (acc[k] ||= []).push(ev);
    return acc;
  }, {});
  const days = Object.keys(byDay).sort();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Calendar</h1>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {days.map((day) => (
          <Card key={day} pad={16}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: t.ink3, textTransform: "uppercase" }}>
              {new Date(day).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              {byDay[day].map((ev) => (
                <div key={ev.id} style={{ display: "flex", gap: 12, padding: 10, borderRadius: 10, border: `1px solid ${t.line}` }}>
                  <div style={{ width: 56, fontSize: 12, fontWeight: 700, color: t.ink2 }}>
                    {new Date(ev.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{ev.title}</div>
                    <div style={{ fontSize: 11.5, color: t.ink3 }}>{ev.who} · {ev.duration_min ?? 0}m</div>
                  </div>
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
