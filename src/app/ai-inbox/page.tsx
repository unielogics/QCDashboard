"use client";

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useAITasks } from "@/hooks/useApi";
import type { AITask } from "@/lib/types";

const SOURCE_FILTERS = ["all", "underwriting", "messages", "risk", "calendar", "documents", "pipeline", "rates"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

export default function AIInboxPage() {
  const { t } = useTheme();
  const { data: tasks = [] } = useAITasks();
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () => tasks.filter((task) => filter === "all" || task.source === filter),
    [tasks, filter]
  );
  const selected = filtered.find((t) => t.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>AI Inbox</h1>
        <Pill>{tasks.length} pending</Pill>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {SOURCE_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: filter === s ? t.brandSoft : "transparent",
              color: filter === s ? t.ink : t.ink3,
              border: `1px solid ${filter === s ? t.line : "transparent"}`,
              textTransform: "capitalize",
            }}>{s}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(380px, 1fr) 2fr", gap: 14, flex: 1, minHeight: 0 }}>
        {/* Master list */}
        <Card pad={0} style={{ overflow: "auto" }}>
          {filtered.map((task) => (
            <button key={task.id} onClick={() => setSelectedId(task.id)} style={{
              width: "100%", textAlign: "left", padding: "12px 16px",
              borderBottom: `1px solid ${t.line}`,
              background: selected?.id === task.id ? t.brandSoft : "transparent",
              borderLeft: `3px solid ${task.priority === "high" ? t.danger : task.priority === "medium" ? t.warn : t.line}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Pill>{task.source}</Pill>
                <Pill bg={task.priority === "high" ? t.dangerBg : t.chip} color={task.priority === "high" ? t.danger : t.ink2}>
                  {task.priority}
                </Pill>
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 2 }}>{task.title}</div>
              <div style={{ fontSize: 11.5, color: t.ink3 }}>conf {(task.confidence * 100).toFixed(0)}% · {task.agent}</div>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>No pending tasks.</div>}
        </Card>

        {/* Detail */}
        <Card pad={0}>
          {selected ? <Detail task={selected} /> : <div style={{ padding: 24, color: t.ink3 }}>Select a task to view details.</div>}
        </Card>
      </div>
    </div>
  );
}

function Detail({ task }: { task: AITask }) {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Pill>{task.source}</Pill>
          <Pill bg={task.priority === "high" ? t.dangerBg : t.chip} color={task.priority === "high" ? t.danger : t.ink2}>{task.priority}</Pill>
          <span style={{ fontSize: 11, color: t.ink3 }}>· {task.agent} · conf {(task.confidence * 100).toFixed(0)}%</span>
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: t.ink, margin: 0 }}>{task.title}</h2>
        <div style={{ fontSize: 13, color: t.ink2, marginTop: 8 }}>{task.summary}</div>
      </div>

      <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
        <SectionLabel>Drafted artifact</SectionLabel>
        <div style={{ background: t.surface2, borderRadius: 10, padding: 14, fontSize: 13, color: t.ink2, whiteSpace: "pre-wrap" }}>
          {task.draft_payload ? JSON.stringify(task.draft_payload, null, 2) : `(No drafted payload yet for action "${task.action}")`}
        </div>
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button style={{ padding: "10px 14px", borderRadius: 10, color: t.ink3, fontSize: 13, fontWeight: 700 }}>Dismiss</button>
        <button style={{ padding: "10px 14px", borderRadius: 10, background: t.surface2, color: t.ink, fontSize: 13, fontWeight: 700, border: `1px solid ${t.line}` }}>Edit</button>
        <button style={{ padding: "10px 16px", borderRadius: 10, background: t.brand, color: t.inverse, fontSize: 13, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 6 }}>
          <Icon name="check" size={14} /> Approve & Run
        </button>
      </div>
    </div>
  );
}
