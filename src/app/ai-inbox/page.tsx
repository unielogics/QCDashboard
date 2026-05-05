"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useAITasks, useAITaskDecision } from "@/hooks/useApi";
import type { AITask } from "@/lib/types";

const SOURCE_FILTERS = ["all", "underwriting", "messages", "risk", "calendar", "documents", "pipeline", "rates"] as const;
type SourceFilter = (typeof SOURCE_FILTERS)[number];

const PRIORITY_FILTERS = ["all", "high", "medium", "low"] as const;
type PriorityFilter = (typeof PRIORITY_FILTERS)[number];

export default function AIInboxPage() {
  const { t } = useTheme();
  const { data: tasks = [] } = useAITasks();
  const [filter, setFilter] = useState<SourceFilter>("all");
  const [priority, setPriority] = useState<PriorityFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      tasks.filter(
        (task) =>
          (filter === "all" || task.source === filter) &&
          (priority === "all" || task.priority === priority) &&
          task.status === "pending",
      ),
    [tasks, filter, priority],
  );
  const selected = filtered.find((task) => task.id === selectedId) ?? filtered[0] ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>AI Inbox</h1>
        <Pill>{filtered.length} pending</Pill>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 4 }}>
          {PRIORITY_FILTERS.map((p) => (
            <button key={p} onClick={() => setPriority(p)} style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: priority === p ? (p === "high" ? t.dangerBg : p === "medium" ? t.warnBg : t.brandSoft) : "transparent",
              color: priority === p ? t.ink : t.ink3,
              border: `1px solid ${priority === p ? t.line : "transparent"}`,
              textTransform: "capitalize",
              cursor: "pointer",
            }}>{p}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {SOURCE_FILTERS.map((s) => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: filter === s ? t.brandSoft : "transparent",
              color: filter === s ? t.ink : t.ink3,
              border: `1px solid ${filter === s ? t.line : "transparent"}`,
              textTransform: "capitalize",
              cursor: "pointer",
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
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <Pill>{task.source}</Pill>
                <Pill bg={task.priority === "high" ? t.dangerBg : task.priority === "medium" ? t.warnBg : t.chip} color={task.priority === "high" ? t.danger : task.priority === "medium" ? t.warn : t.ink2}>
                  {task.priority}
                </Pill>
                {task.loan_id && (
                  <span style={{ marginLeft: "auto", fontSize: 10.5, fontFamily: "ui-monospace, SF Mono, monospace", color: t.ink3 }}>
                    {task.loan_id.slice(0, 8)}
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginBottom: 2 }}>{task.title}</div>
              <div style={{ fontSize: 11.5, color: t.ink3 }}>conf {(task.confidence * 100).toFixed(0)}% · {task.agent}</div>
            </button>
          ))}
          {filtered.length === 0 && <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>No pending tasks.</div>}
        </Card>

        {/* Detail */}
        <Card pad={0}>
          {selected ? <Detail task={selected} key={selected.id} /> : <div style={{ padding: 24, color: t.ink3 }}>Select a task to view details.</div>}
        </Card>
      </div>
    </div>
  );
}

function Detail({ task }: { task: AITask }) {
  const { t } = useTheme();
  const decision = useAITaskDecision();
  const [editMode, setEditMode] = useState(false);
  const [draftJson, setDraftJson] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Reset edit state when task changes
  useEffect(() => {
    setEditMode(false);
    setDraftJson(task.draft_payload ? JSON.stringify(task.draft_payload, null, 2) : "");
    setEditError(null);
    setFeedback(null);
  }, [task.id]);

  const handleApprove = async () => {
    setEditError(null);
    setFeedback(null);
    let editedPayload: Record<string, unknown> | undefined = undefined;
    if (editMode) {
      try {
        editedPayload = JSON.parse(draftJson);
      } catch (e) {
        setEditError("Drafted payload is not valid JSON.");
        return;
      }
    }
    try {
      await decision.mutateAsync({
        taskId: task.id,
        decision: "approved",
        edited_payload: editedPayload ?? null,
        loanId: task.loan_id ?? undefined,
      });
      setFeedback("Approved & queued for execution.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to approve.");
    }
  };

  const handleDismiss = async () => {
    setEditError(null);
    setFeedback(null);
    try {
      await decision.mutateAsync({
        taskId: task.id,
        decision: "dismissed",
        loanId: task.loan_id ?? undefined,
      });
      setFeedback("Dismissed.");
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Failed to dismiss.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: 20, borderBottom: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <Pill>{task.source}</Pill>
          <Pill bg={task.priority === "high" ? t.dangerBg : t.chip} color={task.priority === "high" ? t.danger : t.ink2}>{task.priority}</Pill>
          <span style={{ fontSize: 11, color: t.ink3 }}>· {task.agent} · conf {(task.confidence * 100).toFixed(0)}%</span>
          {task.loan_id && (
            <Link href={`/loans/${task.loan_id}`} style={{ marginLeft: "auto", fontSize: 12, color: t.petrol, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
              Open loan <Icon name="chevR" size={12} />
            </Link>
          )}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: t.ink, margin: 0 }}>{task.title}</h2>
        <div style={{ fontSize: 13, color: t.ink2, marginTop: 8 }}>{task.summary}</div>
      </div>

      <div style={{ flex: 1, padding: 20, overflowY: "auto" }}>
        <SectionLabel action={
          editMode ? (
            <button onClick={() => setEditMode(false)} style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Cancel edit</button>
          ) : (
            task.draft_payload ? (
              <button onClick={() => setEditMode(true)} style={{ background: "transparent", border: "none", color: t.petrol, cursor: "pointer", fontSize: 12, fontWeight: 700 }}>Edit draft</button>
            ) : null
          )
        }>
          Drafted artifact ({task.action})
        </SectionLabel>
        {editMode ? (
          <textarea
            value={draftJson}
            onChange={(e) => setDraftJson(e.target.value)}
            style={{
              width: "100%",
              minHeight: 200,
              padding: 12,
              borderRadius: 10,
              border: `1px solid ${t.line}`,
              background: t.surface2,
              color: t.ink,
              fontFamily: "ui-monospace, SF Mono, monospace",
              fontSize: 12,
              lineHeight: 1.5,
              outline: "none",
              resize: "vertical",
            }}
          />
        ) : (
          <div style={{ background: t.surface2, borderRadius: 10, padding: 14, fontSize: 13, color: t.ink2, whiteSpace: "pre-wrap", fontFamily: "ui-monospace, SF Mono, monospace" }}>
            {task.draft_payload ? JSON.stringify(task.draft_payload, null, 2) : `(No drafted payload yet for action "${task.action}")`}
          </div>
        )}
        {editError && <div style={{ marginTop: 8, color: t.danger, fontSize: 12, fontWeight: 700 }}>{editError}</div>}

        {/* Confidence bar */}
        <div style={{ marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <SectionLabel>Confidence</SectionLabel>
            <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>{(task.confidence * 100).toFixed(0)}%</div>
          </div>
          <div style={{ height: 6, background: t.line, borderRadius: 999, overflow: "hidden" }}>
            <div style={{
              width: `${task.confidence * 100}%`,
              height: "100%",
              background: task.confidence >= 0.85 ? t.profit : task.confidence >= 0.7 ? t.warn : t.danger,
            }} />
          </div>
        </div>
      </div>

      <div style={{ padding: 16, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
        {feedback && <span style={{ flex: 1, fontSize: 12, color: t.ink2, fontWeight: 600 }}>{feedback}</span>}
        <button
          onClick={handleDismiss}
          disabled={decision.isPending}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            color: t.ink3,
            fontSize: 13,
            fontWeight: 700,
            background: "transparent",
            border: "none",
            cursor: decision.isPending ? "wait" : "pointer",
          }}
        >
          Dismiss
        </button>
        <button
          onClick={() => setEditMode((m) => !m)}
          disabled={decision.isPending || !task.draft_payload}
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            background: t.surface2,
            color: t.ink,
            fontSize: 13,
            fontWeight: 700,
            border: `1px solid ${t.line}`,
            cursor: !task.draft_payload ? "not-allowed" : decision.isPending ? "wait" : "pointer",
            opacity: !task.draft_payload ? 0.5 : 1,
          }}
        >
          {editMode ? "Editing…" : "Edit"}
        </button>
        <button
          onClick={handleApprove}
          disabled={decision.isPending}
          style={{
            padding: "10px 16px",
            borderRadius: 10,
            background: t.brand,
            color: t.inverse,
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            border: "none",
            cursor: decision.isPending ? "wait" : "pointer",
            opacity: decision.isPending ? 0.6 : 1,
          }}
        >
          <Icon name="check" size={14} /> {decision.isPending ? "Working…" : "Approve & Run"}
        </button>
      </div>
    </div>
  );
}
