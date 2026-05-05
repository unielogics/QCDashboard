"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import type { Activity } from "@/lib/types";

export function ActivityTab({ activity, isLoading }: { activity: Activity[]; isLoading: boolean }) {
  const { t } = useTheme();

  if (isLoading) return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>Loading activity…</div></Card>;
  if (activity.length === 0) return <Card pad={16}><div style={{ fontSize: 13, color: t.ink3 }}>No activity yet for this loan.</div></Card>;

  return (
    <Card pad={0}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
        <SectionLabel>Full activity log · {activity.length} entries</SectionLabel>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {activity.map((e, i) => (
          <div
            key={e.id}
            style={{
              display: "grid", gridTemplateColumns: "190px 1fr 100px",
              gap: 16, padding: "12px 16px",
              borderBottom: i === activity.length - 1 ? "none" : `1px solid ${t.line}`,
              alignItems: "flex-start",
            }}
          >
            <div style={{ fontSize: 11.5, color: t.ink3, fontFamily: "ui-monospace, SF Mono, monospace" }}>
              {new Date(e.occurred_at).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
            </div>
            <div>
              <div style={{ fontSize: 13, color: t.ink, fontWeight: 600 }}>{e.summary}</div>
              <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
                <Pill>{e.kind}</Pill>
                {e.actor_label && <span style={{ marginLeft: 8 }}>{e.actor_label}</span>}
              </div>
              {e.payload && Object.keys(e.payload).length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ fontSize: 11, color: t.ink3, cursor: "pointer" }}>payload</summary>
                  <pre style={{ background: t.surface2, padding: 10, borderRadius: 8, fontSize: 11, color: t.ink2, marginTop: 6, overflow: "auto" }}>
                    {JSON.stringify(e.payload, null, 2)}
                  </pre>
                </details>
              )}
            </div>
            <div style={{ fontSize: 11, color: t.ink3, textAlign: "right" }}>
              {e.actor_id ? `actor #${e.actor_id.slice(0, 8)}` : "—"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
