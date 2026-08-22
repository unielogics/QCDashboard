"use client";

// Tasks tab — agent CRM workflow tasks on this deal. Distinct from
// the Schedule tab (calendar events) and Elara tab (CRS-
// backed AI tasks). Two surfaces:
//
//   1. The tasks already saved on this deal (AgentTask rows whose
//      category is NOT a schedule category — those live on Schedule).
//   2. "Draft from template" — pulls the agent's buyer/seller
//      playbook configured in Settings → AI → Lead Templates, and
//      lets the agent bulk-create AgentTasks from a checklist.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Card, CellChip, Empty, Field, Input, Panel, Seg, Select, Sub, Tag, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
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

const FILTERS: { value: Filter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "done", label: "Done" },
  { value: "ai", label: "AI" },
  { value: "human", label: "Mine" },
];

export function TasksTab({ deal }: { deal: Deal }) {
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
    <div className="grid">
      <div className="pagebar" style={{ padding: 0 }}>
        <span className="lbl">Workflow tasks</span>
        <Tag>{workflowTasks.length}</Tag>
        <Seg as="filter" ariaLabel="Task filter" value={filter} onChange={setFilter} options={FILTERS} />
        <span className="spacer" />
        <Btn onClick={() => setTemplateOpen(true)}>
          <Icon name="spark" size={12} /> Draft from template
        </Btn>
        <Btn variant="pri" onClick={() => setCreateOpen(true)}>
          <Icon name="plus" size={12} /> New task
        </Btn>
      </div>

      {isLoading ? (
        <Card>
          <Sub>Loading…</Sub>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <Sub>
            {workflowTasks.length === 0
              ? "No workflow tasks on this deal yet. Click “Draft from template” to pull from your buyer or seller playbook, or “New task” to add one manually."
              : `No tasks match the "${filter}" filter.`}
          </Sub>
        </Card>
      ) : (
        <div className="grid g8">
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
        <NewTaskDrawer
          clientId={deal.client_id}
          dealId={deal.id}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}
      {templateOpen ? (
        <TemplateDrawer deal={deal} onClose={() => setTemplateOpen(false)} />
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
  const isDone = task.status === "done" || task.status === "cancelled";
  const canPromote = task.owner_type === "ai" && !task.ai_assignment_id;
  return (
    <Card style={{ padding: 13, opacity: isDone ? 0.65 : 1 }}>
      <div className="row" style={{ gap: 10, alignItems: "flex-start", flexWrap: "nowrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <b style={{ fontSize: 13.5, textDecoration: isDone ? "line-through" : "none" }}>
              {task.title}
            </b>
            <Tag>{CATEGORY_LABELS[task.category]}</Tag>
            {task.owner_type === "ai" ? (
              <AiStatusBadge state={task.ai_assignment_id ? "deployed" : "draft_first"} size="sm" />
            ) : null}
            {task.priority === "high" ? <CellChip tone="warn">High</CellChip> : null}
          </div>
          {task.due_at ? <Sub>Due {new Date(task.due_at).toLocaleString()}</Sub> : null}
          {task.description ? (
            <div style={{ fontSize: 12.5, marginTop: 4 }}>{task.description}</div>
          ) : null}
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "nowrap", flexShrink: 0 }}>
          {canPromote ? (
            <Btn variant="pri" size="sm" onClick={onPromote} disabled={promoting}>
              {promoting ? "Promoting…" : "Promote to AI"}
            </Btn>
          ) : null}
          {!isDone ? (
            <Btn size="sm" onClick={onComplete}>
              Complete
            </Btn>
          ) : null}
          <Btn size="sm" className="danger" onClick={onDelete}>
            Delete
          </Btn>
        </div>
      </div>
    </Card>
  );
}

function NewTaskDrawer({
  clientId,
  dealId,
  onClose,
}: {
  clientId: string;
  dealId: string;
  onClose: () => void;
}) {
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
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="New task"
      footer={
        <>
          {err ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span> : null}
          <span style={{ flex: 1 }} />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={create.isPending}>
            {create.isPending ? "Saving…" : "Create"}
          </Btn>
        </>
      }
    >
      <div className="grid g10">
        <Field label="Title">
          <Input
            value={body.title}
            onChange={(e) => setBody({ ...body, title: e.target.value })}
            placeholder='e.g. "Send pre-approval letter"'
          />
        </Field>
        <Field label="Description">
          <Textarea
            value={body.description ?? ""}
            onChange={(e) => setBody({ ...body, description: e.target.value })}
            rows={3}
          />
        </Field>
        <div className="fldgrid two">
          <Field label="Category">
            <Select
              value={body.category ?? "other"}
              onChange={(e) => setBody({ ...body, category: e.target.value as AgentTaskCategory })}
            >
              <option value="buyer_workflow">Buyer workflow</option>
              <option value="seller_workflow">Seller workflow</option>
              <option value="funding_prep">Funding prep</option>
              <option value="document_collection">Document collection</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Owner">
            <Select
              value={body.owner_type ?? "human"}
              onChange={(e) => setBody({ ...body, owner_type: e.target.value as "human" | "ai" | "shared" })}
            >
              <option value="human">Me</option>
              <option value="ai">AI</option>
              <option value="shared">Shared</option>
            </Select>
          </Field>
        </div>
      </div>
    </Drawer>
  );
}

function TemplateDrawer({ deal, onClose }: { deal: Deal; onClose: () => void }) {
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
    <Drawer
      open
      onClose={onClose}
      title={`Draft from ${side} template`}
      sub="Tasks come from your Settings → AI → Lead Templates. Pick the ones relevant to this deal; you can edit or delete them per-file afterward."
      footer={
        <>
          {err ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span> : null}
          <span style={{ flex: 1 }} />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={addSelected} disabled={busy || picked.size === 0}>
            {busy ? "Adding…" : `Add ${picked.size || ""} task${picked.size === 1 ? "" : "s"}`}
          </Btn>
        </>
      }
    >
      <div className="pagebar" style={{ padding: "0 0 12px" }}>
        <Btn size="sm" onClick={selectAll}>
          Select all
        </Btn>
        <Btn size="sm" onClick={selectNone}>
          Clear
        </Btn>
        <span className="spacer" />
        <span className="lbl">
          {picked.size}/{requirements.length} selected
        </span>
      </div>
      <div className="picklist">
        {playbook.isLoading ? (
          <Sub>Loading playbook…</Sub>
        ) : requirements.length === 0 ? (
          <Empty>
            No requirements in your {side} playbook yet. Configure them in Settings → AI → Lead
            Templates and they&apos;ll show up here.
          </Empty>
        ) : (
          requirements.map((r) => {
            const checked = picked.has(r.requirement_key);
            return (
              <label key={r.requirement_key} className={checked ? "pick on" : "pick"} style={{ alignItems: "flex-start" }}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(r.requirement_key)}
                  style={{ marginTop: 3 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: 13 }}>{r.label}</b>
                  <Sub>
                    {r.required_level} · {r.category} · default owner:{" "}
                    {r.default_owner_type ?? "human"}
                  </Sub>
                  {r.objective_text ? (
                    <div style={{ fontSize: 11.5, marginTop: 4 }}>{r.objective_text}</div>
                  ) : null}
                </div>
              </label>
            );
          })
        )}
      </div>
    </Drawer>
  );
}
