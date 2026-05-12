"use client";

// Schedule tab — unified showings / open houses / listing prep view.
// Each row carries a date/time, type, location, status, and optional
// AI follow-up wire. One filter strip across the top groups by type
// without splitting into multiple sub-tabs (the user explicitly
// wanted them in one view, manageable side by side).

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useClientTasks,
  useCreateAgentTask,
  useCompleteAgentTask,
  useDeleteAgentTask,
  usePromoteAgentTaskToAi,
  type AgentTaskCreateBody,
} from "@/hooks/useApi";
import type { AgentTask, AgentTaskCategory } from "@/lib/types";
import { AiStatusBadge } from "@/components/AiStatusBadge";

// The five categories this tab manages. Other AgentTask categories
// (funding_prep, document_collection, etc.) live on the AI Secretary
// tab or in the catch-all Tasks list inside DocumentsTab.
const SCHEDULE_CATEGORIES: AgentTaskCategory[] = [
  "showing",
  "open_house",
  "listing_prep",
  "cma",
  "photography",
];

const CATEGORY_LABELS: Record<AgentTaskCategory, string> = {
  buyer_workflow: "Buyer workflow",
  seller_workflow: "Seller workflow",
  funding_prep: "Funding prep",
  showing: "Showing",
  open_house: "Open house",
  listing_prep: "Listing prep",
  cma: "CMA",
  photography: "Photography",
  document_collection: "Document collection",
  other: "Other",
};

const CATEGORY_ICONS: Record<AgentTaskCategory, "cal" | "doc" | "spark" | "home" | "photo"> = {
  buyer_workflow: "cal",
  seller_workflow: "cal",
  funding_prep: "doc",
  showing: "home",
  open_house: "home",
  listing_prep: "doc",
  cma: "doc",
  photography: "spark",
  document_collection: "doc",
  other: "cal",
};

type FilterChip = "all" | AgentTaskCategory;

const FILTERS: { id: FilterChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "showing", label: "Showings" },
  { id: "open_house", label: "Open houses" },
  { id: "listing_prep", label: "Listing prep" },
  { id: "cma", label: "CMA" },
  { id: "photography", label: "Photography" },
];

export function ScheduleTab({ clientId, dealId }: { clientId: string; dealId: string }) {
  const { t } = useTheme();
  const [filter, setFilter] = useState<FilterChip>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: tasks = [], isLoading } = useClientTasks(clientId, { dealId });
  const complete = useCompleteAgentTask(clientId);
  const del = useDeleteAgentTask(clientId);
  const promote = usePromoteAgentTaskToAi(clientId);

  const items = useMemo(
    () => tasks.filter((t) => SCHEDULE_CATEGORIES.includes(t.category)),
    [tasks],
  );
  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((t) => t.category === filter)),
    [items, filter],
  );

  // Group by upcoming / past so the daily-driver view is at the top.
  const now = Date.now();
  const upcoming = filtered.filter((t) => !t.due_at || new Date(t.due_at).getTime() >= now);
  const past = filtered.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  upcoming.sort((a, b) => (a.due_at ?? "").localeCompare(b.due_at ?? ""));
  past.sort((a, b) => (b.due_at ?? "").localeCompare(a.due_at ?? ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionLabel>Schedule · {items.length}</SectionLabel>
        <button
          onClick={() => setCreateOpen(true)}
          style={{
            marginLeft: "auto",
            padding: "8px 14px",
            fontSize: 12,
            fontWeight: 700,
            borderRadius: 8,
            border: "none",
            background: t.brand,
            color: t.inverse,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="plus" size={12} /> New event
        </button>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            style={{
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 700,
              borderRadius: 999,
              border: `1px solid ${filter === f.id ? t.brand : t.line}`,
              background: filter === f.id ? t.brandSoft : t.surface,
              color: filter === f.id ? t.brand : t.ink2,
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <Card pad={16}>
          <div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card pad={16}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            No events scheduled. Add a showing, open house, photo session, or CMA prep above.
          </div>
        </Card>
      ) : null}

      {upcoming.length > 0 ? (
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.2, marginBottom: 6 }}>
            UPCOMING · {upcoming.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {upcoming.map((task) => (
              <EventRow
                key={task.id}
                task={task}
                onComplete={() => complete.mutate(task.id)}
                onDelete={() => {
                  if (confirm(`Delete "${task.title}"?`)) del.mutate(task.id);
                }}
                onPromote={() => promote.mutate(task.id)}
                promoting={promote.isPending}
              />
            ))}
          </div>
        </div>
      ) : null}

      {past.length > 0 ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.2, marginBottom: 6 }}>
            PAST · {past.length}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {past.map((task) => (
              <EventRow
                key={task.id}
                task={task}
                past
                onComplete={() => complete.mutate(task.id)}
                onDelete={() => {
                  if (confirm(`Delete "${task.title}"?`)) del.mutate(task.id);
                }}
                onPromote={() => promote.mutate(task.id)}
                promoting={promote.isPending}
              />
            ))}
          </div>
        </div>
      ) : null}

      {createOpen ? (
        <NewEventModal clientId={clientId} dealId={dealId} onClose={() => setCreateOpen(false)} />
      ) : null}
    </div>
  );
}

function EventRow({
  task,
  past = false,
  onComplete,
  onDelete,
  onPromote,
  promoting,
}: {
  task: AgentTask;
  past?: boolean;
  onComplete: () => void;
  onDelete: () => void;
  onPromote: () => void;
  promoting: boolean;
}) {
  const { t } = useTheme();
  const isDone = task.status === "done" || task.status === "cancelled";
  const canPromote = task.owner_type === "ai" && !task.ai_assignment_id;
  return (
    <Card pad={14} style={{ opacity: past || isDone ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div
          style={{
            width: 60,
            textAlign: "center",
            padding: "6px 0",
            borderRadius: 8,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            flexShrink: 0,
          }}
        >
          {task.due_at ? (
            <>
              <div style={{ fontSize: 10, color: t.ink3, fontWeight: 700, textTransform: "uppercase" }}>
                {new Date(task.due_at).toLocaleDateString(undefined, { month: "short" })}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, lineHeight: 1 }}>
                {new Date(task.due_at).getDate()}
              </div>
              <div style={{ fontSize: 10, color: t.ink3, fontWeight: 600 }}>
                {new Date(task.due_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </div>
            </>
          ) : (
            <div style={{ fontSize: 10, color: t.ink3, fontWeight: 600 }}>TBD</div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: isDone ? t.ink3 : t.ink,
                textDecoration: isDone ? "line-through" : "none",
              }}
            >
              {task.title}
            </span>
            <Pill>{CATEGORY_LABELS[task.category]}</Pill>
            {task.owner_type === "ai" ? (
              <AiStatusBadge state={task.ai_assignment_id ? "deployed" : "draft_first"} size="sm" />
            ) : null}
            {task.priority === "high" ? (
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 800,
                  padding: "1px 6px",
                  borderRadius: 4,
                  background: t.warnBg,
                  color: t.warn,
                  textTransform: "uppercase",
                }}
              >
                High
              </span>
            ) : null}
          </div>
          {task.description ? (
            <div style={{ fontSize: 12, color: t.ink2, marginTop: 3 }}>{task.description}</div>
          ) : null}
          {task.notes ? (
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 3, fontStyle: "italic" }}>{task.notes}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {canPromote ? (
            <button
              onClick={onPromote}
              disabled={promoting}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 6,
                border: "none",
                background: t.brand,
                color: t.inverse,
                cursor: "pointer",
                opacity: promoting ? 0.6 : 1,
              }}
            >
              {promoting ? "Promoting…" : "Promote to AI"}
            </button>
          ) : null}
          {!isDone ? (
            <button
              onClick={onComplete}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 6,
                border: `1px solid ${t.line}`,
                background: t.surface,
                color: t.ink,
                cursor: "pointer",
              }}
            >
              Complete
            </button>
          ) : null}
          <button
            onClick={onDelete}
            style={{
              padding: "5px 10px",
              fontSize: 11,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.danger,
              cursor: "pointer",
            }}
          >
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

function NewEventModal({
  clientId,
  dealId,
  onClose,
}: {
  clientId: string;
  dealId: string;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const create = useCreateAgentTask(clientId);
  const [body, setBody] = useState<AgentTaskCreateBody>({
    title: "",
    category: "showing",
    visibility: "team_visible",
    owner_type: "human",
    priority: "medium",
    deal_id: dealId,
  });
  const [dateStr, setDateStr] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!body.title.trim()) {
      setErr("Title is required");
      return;
    }
    setErr(null);
    try {
      await create.mutateAsync({
        ...body,
        due_at: dateStr ? new Date(dateStr).toISOString() : null,
      });
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 10,
          padding: 20,
          minWidth: 420,
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>New schedule event</div>
        <Field label="Type">
          <select
            value={body.category ?? "showing"}
            onChange={(e) => setBody({ ...body, category: e.target.value as AgentTaskCategory })}
            style={inputStyle(t)}
          >
            {SCHEDULE_CATEGORIES.map((c) => (
              <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </Field>
        <Field label="Title">
          <input
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            placeholder='e.g. "Open house 123 Main St Sat 2pm"'
            style={inputStyle(t)}
          />
        </Field>
        <Field label="Date & time">
          <input type="datetime-local" value={dateStr} onChange={(e) => setDateStr(e.target.value)} style={inputStyle(t)} />
        </Field>
        <Field label="Description (location, attendees, talking points)">
          <textarea
            value={body.description ?? ""}
            onChange={(e) => setBody({ ...body, description: e.target.value })}
            rows={3}
            style={{ ...inputStyle(t), fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Owner">
            <select value={body.owner_type ?? "human"} onChange={(e) => setBody({ ...body, owner_type: e.target.value as "human" | "ai" | "shared" })} style={inputStyle(t)}>
              <option value="human">Me / human</option>
              <option value="ai">AI (drag-drop into AI col)</option>
              <option value="shared">Shared</option>
            </select>
          </Field>
          <Field label="Priority">
            <select value={body.priority ?? "medium"} onChange={(e) => setBody({ ...body, priority: e.target.value as "low" | "medium" | "high" })} style={inputStyle(t)}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnSecondary(t)}>Cancel</button>
          <button onClick={save} disabled={create.isPending} style={btnPrimary(t, create.isPending)}>
            {create.isPending ? "Saving…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <div style={{ marginTop: 4 }}>{children}</div>
    </label>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: 8,
    fontSize: 13,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
  };
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"], pending: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 700,
    borderRadius: 6,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: "pointer",
    opacity: pending ? 0.6 : 1,
  };
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    cursor: "pointer",
  };
}
