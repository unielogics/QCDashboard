"use client";

// Tasks tab — agent-side CRM (open houses, listing prep, CMA, photography,
// document collection). Distinct from the AI Follow-Up workbench which
// drives borrower-facing requirements.
//
// When an AI-owned task is "promoted to AI" the backend creates a
// synthetic ClientRequirementStatus row with requirement_key
// 'agent_task:{id}' so DealSecretaryPicker can render the task in
// its AI column — see services/agent_task_promote (Phase 7 plan).

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
  useUpdateAgentTask,
  type AgentTaskCreateBody,
} from "@/hooks/useApi";
import type {
  AgentTask,
  AgentTaskCategory,
  AgentTaskOwnerType,
  AgentTaskVisibility,
  RolePermissions,
  WorkspaceData,
} from "@/lib/types";
import { AiStatusBadge } from "./AiStatusBadge";

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

const CATEGORY_OPTIONS: AgentTaskCategory[] = [
  "buyer_workflow",
  "seller_workflow",
  "funding_prep",
  "showing",
  "open_house",
  "listing_prep",
  "cma",
  "photography",
  "document_collection",
  "other",
];

const VISIBILITY_OPTIONS: AgentTaskVisibility[] = [
  "agent_private",
  "team_visible",
  "funding_visible",
  "client_visible",
];

type FilterChip = "all" | AgentTaskCategory | "ai" | "human";

const FILTERS: { id: FilterChip; label: string }[] = [
  { id: "all", label: "All" },
  { id: "buyer_workflow", label: "Buyer" },
  { id: "seller_workflow", label: "Seller" },
  { id: "funding_prep", label: "Funding" },
  { id: "showing", label: "Showings" },
  { id: "open_house", label: "Open houses" },
  { id: "ai", label: "AI-owned" },
  { id: "human", label: "Human-owned" },
];

export function TasksPanel({
  clientId,
  data,
}: {
  clientId: string;
  data: WorkspaceData;
}) {
  const { t } = useTheme();
  const [filter, setFilter] = useState<FilterChip>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const { data: tasks = [], isLoading } = useClientTasks(clientId);
  const complete = useCompleteAgentTask(clientId);
  const del = useDeleteAgentTask(clientId);
  const promote = usePromoteAgentTaskToAi(clientId);

  const filtered = useMemo(() => {
    if (filter === "all") return tasks;
    if (filter === "ai") return tasks.filter((tk) => tk.owner_type === "ai");
    if (filter === "human") return tasks.filter((tk) => tk.owner_type === "human");
    return tasks.filter((tk) => tk.category === filter);
  }, [tasks, filter]);

  const canCreate = data.role_permissions.can_create_deals;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionLabel>Agent tasks · {tasks.length}</SectionLabel>
        {canCreate ? (
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
            <Icon name="plus" size={12} /> Add task
          </button>
        ) : null}
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
        <Card pad={20}>
          <div style={{ color: t.ink3, fontSize: 13 }}>Loading tasks…</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            {filter === "all"
              ? "No agent tasks yet. Add one to track CRM workflow alongside AI follow-up."
              : "No tasks match this filter."}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              role={data.role_permissions}
              onComplete={() => complete.mutate(task.id)}
              onDelete={() => {
                if (confirm(`Delete "${task.title}"?`)) del.mutate(task.id);
              }}
              onPromote={() => promote.mutate(task.id)}
              promoting={promote.isPending}
            />
          ))}
        </div>
      )}

      {createOpen ? (
        <NewTaskModal
          clientId={clientId}
          data={data}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  role,
  onComplete,
  onDelete,
  onPromote,
  promoting,
}: {
  task: AgentTask;
  role: RolePermissions;
  onComplete: () => void;
  onDelete: () => void;
  onPromote: () => void;
  promoting: boolean;
}) {
  const { t } = useTheme();
  const isDone = task.status === "done" || task.status === "cancelled";
  const canPromote =
    task.owner_type === "ai" &&
    !task.ai_assignment_id &&
    role.can_assign_ai;
  return (
    <Card pad={14}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 3 }}>
            {task.due_at ? `Due ${new Date(task.due_at).toLocaleString()}` : "No due date"} ·{" "}
            {task.visibility.replace(/_/g, " ")} · {task.status}
          </div>
          {task.description ? (
            <div style={{ fontSize: 12, color: t.ink2, marginTop: 4 }}>{task.description}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
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
              title="Promote to AI Follow-Up — drives this task through the AI workbench"
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

function NewTaskModal({
  clientId,
  data,
  onClose,
}: {
  clientId: string;
  data: WorkspaceData;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const create = useCreateAgentTask(clientId);
  const [body, setBody] = useState<AgentTaskCreateBody>({
    title: "",
    category: "other",
    visibility: "team_visible",
    owner_type: "human",
    priority: "medium",
  });
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    if (!body.title.trim()) {
      setErr("Title is required");
      return;
    }
    setErr(null);
    try {
      await create.mutateAsync(body);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't create task");
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
          maxWidth: 560,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>New task</div>
        <Field label="Title">
          <input
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            placeholder='e.g. "Open house 123 Main St Sat 2pm"'
            style={inputStyle(t)}
          />
        </Field>
        <Field label="Description">
          <textarea
            value={body.description ?? ""}
            onChange={(e) => setBody({ ...body, description: e.target.value })}
            rows={3}
            style={{ ...inputStyle(t), fontFamily: "inherit", resize: "vertical" }}
          />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Category">
            <select
              value={body.category ?? "other"}
              onChange={(e) => setBody({ ...body, category: e.target.value as AgentTaskCategory })}
              style={inputStyle(t)}
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Visibility">
            <select
              value={body.visibility ?? "team_visible"}
              onChange={(e) => setBody({ ...body, visibility: e.target.value as AgentTaskVisibility })}
              style={inputStyle(t)}
            >
              {VISIBILITY_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Owner">
            <select
              value={body.owner_type ?? "human"}
              onChange={(e) => setBody({ ...body, owner_type: e.target.value as AgentTaskOwnerType })}
              style={inputStyle(t)}
            >
              <option value="human">Human</option>
              <option value="ai">AI</option>
              <option value="shared">Shared</option>
            </select>
          </Field>
          <Field label="Priority">
            <select
              value={body.priority ?? "medium"}
              onChange={(e) => setBody({ ...body, priority: e.target.value as "low" | "medium" | "high" })}
              style={inputStyle(t)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
        {data.deals.length > 0 ? (
          <Field label="Related deal (optional)">
            <select
              value={body.deal_id ?? ""}
              onChange={(e) => setBody({ ...body, deal_id: e.target.value || null })}
              style={inputStyle(t)}
            >
              <option value="">— None —</option>
              {data.deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Due (optional)">
          <input
            type="datetime-local"
            value={body.due_at ?? ""}
            onChange={(e) => setBody({ ...body, due_at: e.target.value || null })}
            style={inputStyle(t)}
          />
        </Field>
        {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 6 }}>
          <button
            onClick={onClose}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface,
              color: t.ink,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={create.isPending}
            style={{
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 700,
              borderRadius: 6,
              border: "none",
              background: t.brand,
              color: t.inverse,
              cursor: "pointer",
              opacity: create.isPending ? 0.6 : 1,
            }}
          >
            {create.isPending ? "Creating…" : "Create task"}
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
      <span style={{ fontSize: 12, color: t.ink3, fontWeight: 600 }}>{label}</span>
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
