"use client";

// Elara tab — agent-side workbench. Same shape as the funding
// /loans/[id] surface (DealWorkspaceTab): header strip + action pills
// + two-column body with Resolution Queue (left) and a numbered
// handoff table (right). Phase rendered:
//
//   - Pre-promotion: scope = deal_id. CRS rows materialized via the
//     buyer/seller playbook overlay through bootstrap_deal_requirement_rows.
//   - Post-promotion: scope = loan_id. Bridges to the existing funding
//     workbench at /loans/[id] for advanced controls (lender connect,
//     workflow conditions, HUD); the deal page surfaces the same view
//     so the agent doesn't have to leave their file.

import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  BtnLink,
  Callout,
  Card,
  CellChip,
  Panel,
  Select,
  Sub,
  Tag,
  Textarea,
  cx,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import {
  AISecretaryHandoffTable,
  loadHandoffRows,
  saveHandoffRows,
  type HandoffRow,
} from "@/components/AISecretaryHandoffTable";
import { FollowUpEditor, type FollowUpSettings } from "@/components/FollowUpEditor";
import {
  useAssignClientTask,
  useBootstrapClientAiFollowUp,
  useClientAiFollowUp,
  useCurrentUser,
  useUnassignClientTask,
  useUpdateClientFileSettings,
} from "@/hooks/useApi";
import type { DSOutreachMode, DSTaskRow } from "@/lib/types";
import { useDraggable } from "@dnd-kit/core";
import { partitionFieldFill } from "./fieldFillRequirements";

const SYSTEM_FLOOR: FollowUpSettings = {
  stall_threshold_minutes: 60 * 24,
  max_attempts_per_day: 3,
  max_days_without_reply: 14,
};

export function AISecretaryTab({
  clientId,
  dealId,
  loanId,
  onJumpToTab,
}: {
  clientId: string;
  dealId: string;
  loanId: string | null;
  // Set by the parent /deals/[id] page. Lets the queue's "X property
  // fields need data" banner jump straight to the Property or Loan
  // Overview tab when clicked.
  onJumpToTab?: (tab: "property" | "loan") => void;
}) {
  const { data: user } = useCurrentUser();
  const isOperator = user?.role === "super_admin" || user?.role === "loan_exec";
  const scope = loanId ? { loanId } : { dealId };
  // localStorage key — falls back to the deal id pre-promotion. The
  // handoff table only uses this prop as a per-file storage suffix.
  const localKey = scope.loanId ?? scope.dealId ?? "deal:none";

  const { data: view, isLoading } = useClientAiFollowUp({
    clientId,
    dealId: scope.dealId ?? null,
    loanId: scope.loanId ?? null,
  });
  const assign = useAssignClientTask(clientId);
  const unassign = useUnassignClientTask(clientId);
  const updateSettings = useUpdateClientFileSettings(clientId);
  const bootstrap = useBootstrapClientAiFollowUp(clientId);

  const [panel, setPanel] = useState<"instructions" | "follow-up" | null>(null);
  const [editing, setEditing] = useState<DSTaskRow | null>(null);
  const [bootstrapErr, setBootstrapErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  // Handoff table rows (per-deal/per-loan in localStorage).
  const [handoffRows, setHandoffRows] = useState<HandoffRow[]>([]);
  useEffect(() => {
    const stored = loadHandoffRows(localKey);
    if (stored) setHandoffRows(stored);
    else setHandoffRows(defaultHandoffRows());
  }, [localKey]);
  useEffect(() => {
    if (handoffRows.length > 0) saveHandoffRows(localKey, handoffRows);
  }, [localKey, handoffRows]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const [activeDrag, setActiveDrag] = useState<{ label: string; owner: "ai" | "human" } | null>(null);

  if (isLoading) {
    return (
      <Card>
        <Sub>Loading Elara…</Sub>
      </Card>
    );
  }
  if (!view) {
    return (
      <Panel title="Elara unavailable">
        <Sub>Couldn&apos;t load the view. Try refreshing.</Sub>
      </Panel>
    );
  }

  const totalRows = view.left.length + view.right.length;
  const isEmpty = totalRows === 0;
  const mode = view.file_settings?.outreach_mode ?? "portal_auto";
  const aiIsLive = mode === "portal_auto" || mode === "portal_email" || mode === "portal_email_sms";
  const followUp = (view.file_settings?.follow_up ?? null) as FollowUpSettings | null;
  const hasFollowUpOverride =
    !!followUp && Object.values(followUp).some((v) => v !== null && v !== undefined);

  // Resolution Queue = rows currently owned by Human that aren't slotted
  // into a handoff row yet. Drag into the right column to assign.
  //
  // Field-fill rows (property_data / borrower_info / credit) are pulled
  // OUT of the queue here — Elara can't help fill a form, so we route
  // those to the relevant tab (Property / Loan Overview) as red count
  // badges instead. The classifier lives in fieldFillRequirements.ts.
  const placedKeys = new Set<string>();
  for (const r of handoffRows) for (const k of r.taskKeys) placedKeys.add(k);
  const visibleLeft = view.left.filter((row) => !placedKeys.has(row.requirement_key));
  const { queue, fieldFill } = partitionFieldFill(visibleLeft);
  const fieldFillCount =
    fieldFill.property.length + fieldFill.borrower.length + fieldFill.credit.length;
  const aiTasksCount = view.right.length;

  function handleDragStart(e: DragStartEvent) {
    const data = e.active.data?.current as { label?: string; requirement_key?: string } | undefined;
    if (!data) return;
    setActiveDrag({ label: data.label ?? data.requirement_key ?? "Task", owner: "ai" });
  }
  function handleDragEnd(e: DragEndEvent) {
    setActiveDrag(null);
    const overId = e.over?.id ? String(e.over.id) : "";
    if (!overId.startsWith("handoff:")) return;
    const [, rowId, ownerStr] = overId.split(":");
    const owner: "ai" | "human" = ownerStr === "ai" ? "ai" : "human";
    const data = e.active.data?.current as { requirement_key?: string; label?: string } | undefined;
    const key = data?.requirement_key;
    if (!key) return;
    // Place into the row + flip ownership server-side.
    const target = handoffRows.find((r) => r.id === rowId);
    const targetWasOtherOwner = target?.owner && target.owner !== owner;
    const siblingsToFlip = targetWasOtherOwner ? (target?.taskKeys ?? []).filter((k) => k !== key) : [];
    const next = handoffRows.map((r) =>
      r.id === rowId
        ? { ...r, owner, taskKeys: r.taskKeys.includes(key) ? r.taskKeys : [...r.taskKeys.filter((x) => x !== key), key] }
        : { ...r, taskKeys: r.taskKeys.filter((x) => x !== key) },
    );
    setHandoffRows(next);
    if (owner === "ai") {
      assign.mutate({ body: { requirement_key: key }, dealId: scope.dealId, loanId: scope.loanId });
    } else {
      unassign.mutate({ requirementKey: key, dealId: scope.dealId, loanId: scope.loanId });
    }
    for (const sib of siblingsToFlip) {
      if (owner === "ai") assign.mutate({ body: { requirement_key: sib }, dealId: scope.dealId, loanId: scope.loanId });
      else unassign.mutate({ requirementKey: sib, dealId: scope.dealId, loanId: scope.loanId });
    }
    const rowLabel = rowId.replace(/^row_/, "").split("_")[0];
    setFlash(`Placed "${data?.label ?? key}" in row ${rowLabel} (${owner.toUpperCase()}).`);
    window.setTimeout(() => setFlash(null), 2400);
  }

  function handleUnplaceTask(key: string) {
    const next = handoffRows.map((r) => ({
      ...r,
      taskKeys: r.taskKeys.filter((k) => k !== key),
    }));
    setHandoffRows(next);
    unassign.mutate({ requirementKey: key, dealId: scope.dealId, loanId: scope.loanId });
  }

  return (
    <div className="grid g10">
      {/* Header strip — bot avatar + status + Pause + Outreach mode */}
      <div className="pagebar" style={{ padding: 0 }}>
        <span className="botmark" aria-hidden="true">
          🤖
        </span>
        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <span className="lbl">Elara</span>
          <b style={{ fontSize: 13 }}>
            {mode === "off" || aiTasksCount === 0
              ? "Standing by — drop tasks into Elara to start"
              : `${aiIsLive ? "Working" : "Drafting"} · ${aiTasksCount} task${aiTasksCount === 1 ? "" : "s"} active`}
          </b>
        </span>
        {aiTasksCount > 0 ? (
          <CellChip tone="acc">
            <Icon name="bolt" size={10} /> {aiTasksCount} active
          </CellChip>
        ) : null}
        <span className="spacer" />
        <Btn
          size="sm"
          onClick={() =>
            updateSettings.mutate({
              body: { outreach_mode: mode === "off" ? "portal_auto" : "off" },
              dealId: scope.dealId,
              loanId: scope.loanId,
            })
          }
        >
          <Icon name={mode === "off" ? "send" : "pause"} size={12} />
          {mode === "off" ? "Resume" : "Pause"}
        </Btn>
        <Select
          aria-label="Outreach mode"
          value={mode}
          onChange={(e) =>
            updateSettings.mutate({
              body: { outreach_mode: e.target.value as DSOutreachMode },
              dealId: scope.dealId,
              loanId: scope.loanId,
            })
          }
        >
          <option value="off">Off</option>
          <option value="draft_first">Draft first</option>
          <option value="portal_auto">Portal</option>
          <option value="portal_email">Portal + Email</option>
          <option value="portal_email_sms">Portal + Email + SMS</option>
        </Select>
      </div>

      {/* Action pill row */}
      <div className="pagebar" style={{ padding: 0 }}>
        <Btn size="sm" onClick={() => setPanel("instructions")}>
          <Icon name="sliders" size={12} stroke={2.2} /> Instructions
        </Btn>
        <Btn size="sm" onClick={() => setPanel("follow-up")}>
          <Icon name="cal" size={12} stroke={2.2} /> Follow-up rhythm
          {hasFollowUpOverride ? <CellChip tone="acc">overridden</CellChip> : null}
        </Btn>
        {scope.loanId ? (
          <BtnLink size="sm" href={`/loans/${scope.loanId}?tab=workspace`}>
            <Icon name="file" size={12} /> Open funding workbench
          </BtnLink>
        ) : null}
        <span className="spacer" />
        <Sub>Drag work between the queue and AI / Human columns</Sub>
      </div>

      {flash ? <CellChip tone="acc">{flash}</CellChip> : null}

      {fieldFillCount > 0 ? (
        <FieldFillBanner
          property={fieldFill.property.length}
          borrower={fieldFill.borrower.length}
          credit={fieldFill.credit.length}
          hasLoanOverview={!!scope.loanId}
          onJumpToProperty={() => onJumpToTab?.("property")}
          onJumpToLoanOverview={() => onJumpToTab?.("loan")}
        />
      ) : null}

      {isEmpty ? (
        <Callout tone="acc" icon={<Icon name="bolt" size={15} stroke={2.2} />}>
          <div className="row" style={{ gap: 12, flexWrap: "nowrap", alignItems: "flex-start" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>Bootstrap requirements</b>
              <Sub>
                Pull from your buyer/seller playbook (Settings → AI → Lead Templates) to seed the
                workbench.
              </Sub>
            </div>
            <Btn
              variant="pri"
              onClick={async () => {
                setBootstrapErr(null);
                try {
                  await bootstrap.mutateAsync(scope);
                } catch (e) {
                  setBootstrapErr(e instanceof Error ? e.message : "Bootstrap failed");
                }
              }}
              disabled={bootstrap.isPending}
            >
              <Icon name="bolt" size={12} />{" "}
              {bootstrap.isPending ? "Bootstrapping…" : "Bootstrap from playbook"}
            </Btn>
          </div>
          {bootstrapErr ? (
            <div style={{ marginTop: 8, fontSize: 12, color: "var(--danger)" }}>{bootstrapErr}</div>
          ) : null}
        </Callout>
      ) : null}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
        <div className="wbench">
          {/* LEFT — Resolution Queue */}
          <Panel
            title="Resolution Queue"
            actions={
              <>
                <CellChip tone={queue.length > 0 ? "warn" : "mut"}>{queue.length} open</CellChip>
                <span className="lbl">Drag → row cell</span>
              </>
            }
            bodyClass="qscroll"
          >
            {queue.length === 0 ? (
              <Sub>
                {totalRows === 0
                  ? "Nothing yet — bootstrap from your playbook above to populate the queue."
                  : "Every task is already placed in the handoff table on the right."}
              </Sub>
            ) : (
              queue.map((row) => (
                <QueueRow key={row.requirement_key} row={row} onOpen={() => setEditing(row)} />
              ))
            )}
          </Panel>

          {/* RIGHT — Delegation (numbered handoff table) */}
          <Panel
            title="Delegation"
            actions={
              <>
                <Tag>Work handoff</Tag>
                <Sub>Drop tasks into a numbered row&apos;s AI or Human column</Sub>
              </>
            }
          >
            <AISecretaryHandoffTable
              view={view}
              loanId={localKey}
              isOperator={isOperator}
              onAssign={(key) =>
                assign.mutate({ body: { requirement_key: key }, dealId: scope.dealId, loanId: scope.loanId })
              }
              onUnassign={(key) =>
                unassign.mutate({ requirementKey: key, dealId: scope.dealId, loanId: scope.loanId })
              }
              rows={handoffRows}
              setRows={setHandoffRows}
              onUnplaceTask={handleUnplaceTask}
            />
          </Panel>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <span className={cx("dragchip", activeDrag.owner === "ai" && "ai")}>
              {activeDrag.label}
            </span>
          ) : null}
        </DragOverlay>
      </DndContext>

      <FollowUpRhythmEditor
        open={panel === "follow-up"}
        onClose={() => setPanel(null)}
        value={followUp}
        onSave={(next) =>
          updateSettings.mutateAsync({
            body: { follow_up: next },
            dealId: scope.dealId,
            loanId: scope.loanId,
          })
        }
      />
      <InstructionsEditor open={panel === "instructions"} onClose={() => setPanel(null)} />
      <AssignmentEditor
        task={editing}
        onClose={() => setEditing(null)}
        onSave={(instructions) => {
          if (!editing) return Promise.resolve();
          return assign.mutateAsync({
            body: { requirement_key: editing.requirement_key, instructions },
            dealId: scope.dealId,
            loanId: scope.loanId,
          });
        }}
      />
    </div>
  );
}

function FieldFillBanner({
  property,
  borrower,
  credit,
  hasLoanOverview,
  onJumpToProperty,
  onJumpToLoanOverview,
}: {
  property: number;
  borrower: number;
  credit: number;
  hasLoanOverview: boolean;
  onJumpToProperty: () => void;
  onJumpToLoanOverview: () => void;
}) {
  const borrowerPlusCredit = borrower + credit;
  return (
    <Callout tone="bad" icon={<Icon name="alert" size={15} stroke={2.2} />}>
      <div className="row" style={{ gap: 12 }}>
        <div style={{ flex: 1, minWidth: 180 }}>
          {/* Was "Field datElara can't fill for you" — a rename of
              "AI Secretary" to "Elara" landed inside the word "data". */}
          <b style={{ fontSize: 12.5 }}>Field data Elara can&apos;t fill for you</b>
          <Sub>These rows were pulled out of the queue — finish them on the tab where they live.</Sub>
        </div>
        {property > 0 ? (
          <Btn size="sm" onClick={onJumpToProperty}>
            <span className="cnt">{property}</span>
            Property tab
            <Icon name="chevR" size={11} />
          </Btn>
        ) : null}
        {borrowerPlusCredit > 0 ? (
          <Btn
            size="sm"
            onClick={onJumpToLoanOverview}
            disabled={!hasLoanOverview}
            title={
              hasLoanOverview
                ? "Open the Loan Overview tab to fill borrower + credit details."
                : "Borrower + credit fields show up on Loan Overview once the deal is promoted to a funding file."
            }
          >
            <span className="cnt">{borrowerPlusCredit}</span>
            Loan Overview{" "}
            {borrower > 0 && credit > 0
              ? "· borrower + credit"
              : borrower > 0
              ? "· borrower"
              : "· credit"}
            <Icon name="chevR" size={11} />
          </Btn>
        ) : null}
      </div>
    </Callout>
  );
}

function defaultHandoffRows(): HandoffRow[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `row_${i + 1}`,
    owner: null,
    taskKeys: [],
  }));
}

function QueueRow({ row, onOpen }: { row: DSTaskRow; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `queue:${row.requirement_key}`,
    data: { kind: "queue", label: row.label, requirement_key: row.requirement_key },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      className="itemrow grabbable"
      style={{ opacity: isDragging ? 0.5 : 1 }}
    >
      <div className="grow">
        <b style={{ fontSize: 12.5, lineHeight: 1.35 }}>{row.label}</b>
        <div className="lbl" style={{ marginTop: 2 }}>
          {row.status}
        </div>
      </div>
      <Btn
        size="sm"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        Edit
      </Btn>
    </div>
  );
}

function FollowUpRhythmEditor({
  open,
  onClose,
  value,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  value: FollowUpSettings | null;
  onSave: (v: FollowUpSettings | null) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState<FollowUpSettings>(value ?? {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(value ?? {});
      setErr(null);
    }
  }, [open, value]);

  if (!open) return null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const clean: FollowUpSettings = {};
      if (draft.stall_threshold_minutes) clean.stall_threshold_minutes = draft.stall_threshold_minutes;
      if (draft.max_attempts_per_day) clean.max_attempts_per_day = draft.max_attempts_per_day;
      if (draft.max_days_without_reply) clean.max_days_without_reply = draft.max_days_without_reply;
      if (draft.quiet_hours_start != null) clean.quiet_hours_start = draft.quiet_hours_start;
      if (draft.quiet_hours_end != null) clean.quiet_hours_end = draft.quiet_hours_end;
      await onSave(Object.keys(clean).length ? clean : null);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="Follow-up rhythm"
      sub="Controls how often Elara re-engages this client between replies. Per-deal overrides win; otherwise the firm default or system floor applies."
      footer={
        <>
          {err ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span> : null}
          <span style={{ flex: 1 }} />
          <Btn onClick={() => onSave(null).then(onClose)} disabled={busy}>
            Reset to firm default
          </Btn>
          <Btn variant="pri" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Btn>
        </>
      }
    >
      <FollowUpEditor value={draft} onChange={setDraft} fallback={SYSTEM_FLOOR} fallbackLabel="System floor" />
    </Drawer>
  );
}

function InstructionsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title="Instructions"
      footer={
        <>
          <span style={{ flex: 1 }} />
          <Btn variant="pri" onClick={onClose}>
            Got it
          </Btn>
        </>
      }
    >
      <div style={{ fontSize: 13.5, lineHeight: 1.55 }}>
        Standing rules Elara honors across every task on this file are configured in{" "}
        <strong>Settings → AI → Lead Templates</strong>. Per-task instructions live on each task
        itself — click a task in the Resolution Queue or in a numbered row to edit.
      </div>
    </Drawer>
  );
}

function AssignmentEditor({
  task,
  onClose,
  onSave,
}: {
  task: DSTaskRow | null;
  onClose: () => void;
  onSave: (instructions: string) => Promise<unknown>;
}) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (task) {
      setDraft(task.instructions ?? "");
      setErr(null);
    }
  }, [task]);

  if (!task) return null;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      await onSave(draft.trim());
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      title={task.label}
      sub={`${task.requirement_key} · ${task.owner_type} · ${task.status}`}
      footer={
        <>
          {err ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span> : null}
          <span style={{ flex: 1 }} />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save instructions"}
          </Btn>
        </>
      }
    >
      <Sub>
        Free-text instructions Elara uses when chasing this requirement. Stays per-task, never leaks
        to the borrower unless you flag it borrower-visible.
      </Sub>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        placeholder='e.g. "Ask the buyer for their pre-approval letter from Chase…"'
        style={{ width: "100%", marginTop: 10, resize: "vertical", lineHeight: 1.45 }}
      />
    </Drawer>
  );
}
