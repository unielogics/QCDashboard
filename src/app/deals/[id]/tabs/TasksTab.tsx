"use client";

// Tasks tab — agent CRM workflow tasks on this deal. Distinct from
// the Schedule tab (calendar events) and the AI Secretary tab (CRS-
// backed AI tasks). Two surfaces:
//
//   1. The tasks already saved on this deal (AgentTask rows whose
//      category is NOT a schedule category — those live on Schedule).
//   2. "Draft from template" — pulls the agent's buyer/seller
//      playbook configured in Settings → AI → Lead Templates, and
//      lets the agent bulk-create AgentTasks from a checklist.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useAgentPlaybook,
  useClientTasks,
  useCreateAgentTask,
  useCompleteAgentTask,
  useDeleteAgentTask,
  usePromoteAgentTaskToAi,
  type AgentTaskCreateBody,
  type PlaybookRequirement,
} from "@/hooks/useApi";
import type { AgentTask, AgentTaskCategory, Deal } from "@/lib/types";
import { AiStatusBadge } from "@/components/AiStatusBadge";

// Categories handled by the Schedule tab — we filter them OUT of
// the Tasks tab so the two surfaces don't double-render.
const SCHEDULE_CATEGORIES = new Set<AgentTaskCategory>([
  "showing",
  "open_house",
  "listing_prep",
  "cma",
  "photography",
]);

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

// Map a playbook requirement.category onto an AgentTaskCategory so
// "Draft from template" creates tasks that bucket correctly.
function playbookCategoryToTaskCategory(c: string, side: "buyer" | "seller"): AgentTaskCategory {
  switch (c) {
    case "scheduling":
      return "showing";
    case "communication":
      return side === "buyer" ? "buyer_workflow" : "seller_workflow";
    case "agreements":
      return side === "buyer" ? "buyer_workflow" : "listing_prep";
    case "financials":
    case "credit":
      return "funding_prep";
    case "property_data":
    case "appraisal_and_inspection":
      return "listing_prep";
    case "title_and_escrow":
    case "insurance":
    case "compliance":
      return "funding_prep";
    case "borrower_info":
      return side === "buyer" ? "buyer_workflow" : "seller_workflow";
    case "ai_internal":
      return "other";
    default:
      return "other";
  }
}

type Filter = "all" | "open" | "done" | "ai" | "human";

export function TasksTab({ deal }: { deal: Deal }) {
  const { t } = useTheme();
  const [filter, setFilter] = useState<Filter>("open");
  const [createOpen, setCreateOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);

  const { data: tasks = [], isLoading } = useClientTasks(deal.client_id, { dealId: deal.id });
  const complete = useCompleteAgentTask(deal.client_id);
  const del = useDeleteAgentTask(deal.client_id);
  const promote = usePromoteAgentTaskToAi(deal.client_id);

  const workflowTasks = useMemo(
    () => tasks.filter((task) => !SCHEDULE_CATEGORIES.has(task.category)),
    [tasks],
  );

  const filtered = useMemo(() => {
    switch (filter) {
      case "all":
        return workflowTasks;
      case "open":
        return workflowTasks.filter((t) => t.status !== "done" && t.status !== "cancelled");
      case "done":
        return workflowTasks.filter((t) => t.status === "done" || t.status === "cancelled");
      case "ai":
        return workflowTasks.filter((t) => t.owner_type === "ai");
      case "human":
        return workflowTasks.filter((t) => t.owner_type === "human");
    }
  }, [workflowTasks, filter]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionLabel>Workflow tasks · {workflowTasks.length}</SectionLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["open", "all", "done", "ai", "human"] as Filter[]).map((id) => (
            <button
              key={id}
              onClick={() => setFilter(id)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: 700,
                borderRadius: 999,
                border: `1px solid ${filter === id ? t.brand : t.line}`,
                background: filter === id ? t.brandSoft : t.surface,
                color: filter === id ? t.brand : t.ink2,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {id}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={() => setTemplateOpen(true)} style={btnSecondary(t)}>
            <Icon name="spark" size={12} /> Draft from template
          </button>
          <button onClick={() => setCreateOpen(true)} style={btnPrimary(t, false)}>
            <Icon name="plus" size={12} /> New task
          </button>
        </div>
      </div>

      {isLoading ? (
        <Card pad={16}>
          <div style={{ color: t.ink3, fontSize: 13 }}>Loading…</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            {workflowTasks.length === 0
              ? "No workflow tasks on this deal yet. Click “Draft from template” to pull from your buyer or seller playbook, or “New task” to add one manually."
              : `No tasks match the "${filter}" filter.`}
          </div>
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((task) => (
            <TaskRow
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
      )}

      {createOpen ? (
        <NewTaskModal
          clientId={deal.client_id}
          dealId={deal.id}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {templateOpen ? (
        <TemplateDrawerModal
          deal={deal}
          onClose={() => setTemplateOpen(false)}
        />
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  onComplete,
  onDelete,
  onPromote,
  promoting,
}: {
  task: AgentTask;
  onComplete: () => void;
  onDelete: () => void;
  onPromote: () => void;
  promoting: boolean;
}) {
  const { t } = useTheme();
  const isDone = task.status === "done" || task.status === "cancelled";
  const canPromote = task.owner_type === "ai" && !task.ai_assignment_id;
  return (
    <Card pad={12} style={{ opacity: isDone ? 0.65 : 1 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 700,
                color: t.ink,
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
          {task.due_at ? (
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 3 }}>
              Due {new Date(task.due_at).toLocaleString()}
            </div>
          ) : null}
          {task.description ? (
            <div style={{ fontSize: 12, color: t.ink2, marginTop: 4 }}>{task.description}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          {canPromote ? (
            <button onClick={onPromote} disabled={promoting} style={btnPrimary(t, promoting)}>
              {promoting ? "Promoting…" : "Promote to AI"}
            </button>
          ) : null}
          {!isDone ? (
            <button onClick={onComplete} style={btnSecondary(t)}>Complete</button>
          ) : null}
          <button onClick={onDelete} style={{ ...btnSecondary(t), color: t.danger }}>
            Delete
          </button>
        </div>
      </div>
    </Card>
  );
}

function NewTaskModal({
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
    category: "buyer_workflow",
    visibility: "team_visible",
    owner_type: "human",
    priority: "medium",
    deal_id: dealId,
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
      setErr(e instanceof Error ? e.message : "Couldn't save");
    }
  }

  return (
    <ModalShell onClose={onClose}>
      <div style={{ fontSize: 16, fontWeight: 800, color: t.ink }}>New task</div>
      <Field label="Title">
        <input value={body.title} onChange={(e) => setBody({ ...body, title: e.target.value })} style={inputStyle(t)} placeholder='e.g. "Send pre-approval letter"' />
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
          <select value={body.category ?? "other"} onChange={(e) => setBody({ ...body, category: e.target.value as AgentTaskCategory })} style={inputStyle(t)}>
            <option value="buyer_workflow">Buyer workflow</option>
            <option value="seller_workflow">Seller workflow</option>
            <option value="funding_prep">Funding prep</option>
            <option value="document_collection">Document collection</option>
            <option value="other">Other</option>
          </select>
        </Field>
        <Field label="Owner">
          <select value={body.owner_type ?? "human"} onChange={(e) => setBody({ ...body, owner_type: e.target.value as "human" | "ai" | "shared" })} style={inputStyle(t)}>
            <option value="human">Me</option>
            <option value="ai">AI</option>
            <option value="shared">Shared</option>
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
    </ModalShell>
  );
}

function TemplateDrawerModal({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const { t } = useTheme();
  const side: "buyer" | "seller" = deal.deal_type === "seller" ? "seller" : "buyer";
  const playbook = useAgentPlaybook(side);
  const create = useCreateAgentTask(deal.client_id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Merge platform + agent requirements; agent overrides win when
  // requirement_key matches. Skip AI-internal items (not realtor work).
  const requirements: PlaybookRequirement[] = useMemo(() => {
    const data = playbook.data;
    if (!data) return [];
    const byKey = new Map<string, PlaybookRequirement>();
    for (const r of data.platform_requirements) byKey.set(r.requirement_key, r);
    for (const r of data.agent_requirements) byKey.set(r.requirement_key, r);
    const all = Array.from(byKey.values());
    return all
      .filter((r) => r.category !== "ai_internal")
      .sort((a, b) => a.display_order - b.display_order || a.label.localeCompare(b.label));
  }, [playbook.data]);

  function toggle(key: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function addSelected() {
    if (picked.size === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const chosen = requirements.filter((r) => picked.has(r.requirement_key));
      for (const r of chosen) {
        const body: AgentTaskCreateBody = {
          title: r.label,
          description: r.objective_text || null,
          category: playbookCategoryToTaskCategory(r.category, side),
          visibility: "team_visible",
          owner_type: (r.default_owner_type as "human" | "ai" | "shared") ?? "human",
          priority: r.required_level === "required" ? "high" : "medium",
          deal_id: deal.id,
        };
        await create.mutateAsync(body);
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't add tasks");
    } finally {
      setBusy(false);
    }
  }

  function selectAll() {
    setPicked(new Set(requirements.map((r) => r.requirement_key)));
  }
  function selectNone() {
    setPicked(new Set());
  }

  return (
    <ModalShell onClose={onClose} width={620}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="spark" size={15} stroke={2.2} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>
            Draft from {side} template
          </div>
          <div style={{ fontSize: 11.5, color: t.ink3 }}>
            Tasks come from your <strong>Settings → AI → Lead Templates</strong>. Pick the ones
            relevant to this deal; you can edit or delete them per-file afterward.
          </div>
        </div>
        <button onClick={onClose} style={{ background: "transparent", border: "none", color: t.ink3, padding: 4, cursor: "pointer" }}>
          <Icon name="x" size={16} />
        </button>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button onClick={selectAll} style={btnSecondary(t)}>Select all</button>
        <button onClick={selectNone} style={btnSecondary(t)}>Clear</button>
        <span style={{ marginLeft: "auto", fontSize: 11, color: t.ink3, fontWeight: 700 }}>
          {picked.size}/{requirements.length} selected
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 200, maxHeight: 420, overflowY: "auto", border: `1px solid ${t.line}`, borderRadius: 8 }}>
        {playbook.isLoading ? (
          <div style={{ padding: 14, fontSize: 12, color: t.ink3 }}>Loading playbook…</div>
        ) : requirements.length === 0 ? (
          <div style={{ padding: 14, fontSize: 12, color: t.ink3 }}>
            No requirements in your {side} playbook yet. Configure them in Settings → AI →
            Lead Templates and they&apos;ll show up here.
          </div>
        ) : (
          requirements.map((r) => {
            const checked = picked.has(r.requirement_key);
            return (
              <label
                key={r.requirement_key}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: `1px solid ${t.line}`,
                  cursor: "pointer",
                  background: checked ? t.brandSoft : "transparent",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(r.requirement_key)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                    {r.required_level} · {r.category} · default owner: {r.default_owner_type ?? "human"}
                  </div>
                  {r.objective_text ? (
                    <div style={{ fontSize: 11.5, color: t.ink2, marginTop: 4 }}>
                      {r.objective_text}
                    </div>
                  ) : null}
                </div>
              </label>
            );
          })
        )}
      </div>
      {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecondary(t)}>Cancel</button>
        <button onClick={addSelected} disabled={busy || picked.size === 0} style={btnPrimary(t, busy || picked.size === 0)}>
          {busy ? "Adding…" : `Add ${picked.size || ""} task${picked.size === 1 ? "" : "s"}`}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ onClose, width = 520, children }: { onClose: () => void; width?: number; children: React.ReactNode }) {
  const { t } = useTheme();
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
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          width,
          maxWidth: "100%",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {children}
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
    boxSizing: "border-box",
  };
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"], disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "7px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink2,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}
