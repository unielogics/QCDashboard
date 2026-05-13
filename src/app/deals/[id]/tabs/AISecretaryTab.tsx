"use client";

// AI Secretary tab — agent-side workbench. Same shape as the funding
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
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
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
  const { t } = useTheme();
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
      <Card pad={20}>
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading AI Secretary…</div>
      </Card>
    );
  }
  if (!view) {
    return (
      <Card pad={20}>
        <SectionLabel>AI Secretary unavailable</SectionLabel>
        <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>Couldn&apos;t load the view. Try refreshing.</div>
      </Card>
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
  // OUT of the queue here — the AI can't help fill a form, so we route
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
    <Card pad={12}>
      {/* Header strip — bot avatar + status + Pause + Outreach mode */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: t.surface2,
            border: `1px solid ${t.line}`,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          🤖
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.4, textTransform: "uppercase" }}>
            AI Secretary
          </span>
          <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>
            {mode === "off" || aiTasksCount === 0
              ? "Standing by — drop tasks into AI to start"
              : `${aiIsLive ? "Working" : "Drafting"} · ${aiTasksCount} task${aiTasksCount === 1 ? "" : "s"} active`}
          </div>
        </div>
        {aiTasksCount > 0 ? (
          <Pill bg={t.brandSoft} color={t.brand}>
            <Icon name="bolt" size={10} /> {aiTasksCount} active
          </Pill>
        ) : null}
        <div style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() =>
            updateSettings.mutate({
              body: { outreach_mode: mode === "off" ? "portal_auto" : "off" },
              dealId: scope.dealId,
              loanId: scope.loanId,
            })
          }
          style={pillBtn(t)}
        >
          <Icon name={mode === "off" ? "send" : "pause"} size={12} />
          {mode === "off" ? "Resume" : "Pause"}
        </button>
        <select
          value={mode}
          onChange={(e) =>
            updateSettings.mutate({
              body: { outreach_mode: e.target.value as DSOutreachMode },
              dealId: scope.dealId,
              loanId: scope.loanId,
            })
          }
          style={{
            padding: "6px 8px",
            borderRadius: 9,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink2,
            fontSize: 11,
            cursor: "pointer",
          }}
        >
          <option value="off">Off</option>
          <option value="draft_first">Draft first</option>
          <option value="portal_auto">Portal</option>
          <option value="portal_email">Portal + Email</option>
          <option value="portal_email_sms">Portal + Email + SMS</option>
        </select>
      </div>

      {/* Action pill row */}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
        <ActionPill t={t} icon="sliders" label="Instructions" onClick={() => setPanel("instructions")} />
        <ActionPill
          t={t}
          icon="cal"
          label="Follow-up rhythm"
          hint={hasFollowUpOverride ? "overridden" : undefined}
          onClick={() => setPanel("follow-up")}
        />
        {scope.loanId ? (
          <a href={`/loans/${scope.loanId}?tab=workspace`} style={{ ...pillBtn(t), textDecoration: "none" }}>
            <Icon name="file" size={12} /> Open funding workbench
          </a>
        ) : null}
        <span style={{ marginLeft: "auto", fontSize: 11, color: t.ink3, fontWeight: 700 }}>
          Drag work between the queue and AI / Human columns
        </span>
      </div>

      {flash ? (
        <div
          style={{
            marginBottom: 10,
            padding: "6px 10px",
            borderRadius: 6,
            background: t.brandSoft,
            color: t.brand,
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          {flash}
        </div>
      ) : null}

      {fieldFillCount > 0 ? (
        <FieldFillBanner
          t={t}
          property={fieldFill.property.length}
          borrower={fieldFill.borrower.length}
          credit={fieldFill.credit.length}
          hasLoanOverview={!!scope.loanId}
          onJumpToProperty={() => onJumpToTab?.("property")}
          onJumpToLoanOverview={() => onJumpToTab?.("loan")}
        />
      ) : null}

      {isEmpty ? (
        <Card pad={16} style={{ borderLeft: `3px solid ${t.brand}`, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: 1 }}>
              <SectionLabel>Bootstrap requirements</SectionLabel>
              <div style={{ fontSize: 12.5, color: t.ink2, marginTop: 4 }}>
                Pull from your buyer/seller playbook (Settings → AI → Lead Templates) to seed the workbench.
              </div>
            </div>
            <button
              onClick={async () => {
                setBootstrapErr(null);
                try {
                  await bootstrap.mutateAsync(scope);
                } catch (e) {
                  setBootstrapErr(e instanceof Error ? e.message : "Bootstrap failed");
                }
              }}
              disabled={bootstrap.isPending}
              style={{
                padding: "8px 14px",
                fontSize: 12,
                fontWeight: 800,
                borderRadius: 8,
                border: "none",
                background: t.brand,
                color: t.inverse,
                cursor: "pointer",
              }}
            >
              <Icon name="bolt" size={12} /> {bootstrap.isPending ? "Bootstrapping…" : "Bootstrap from playbook"}
            </button>
          </div>
          {bootstrapErr ? <div style={{ marginTop: 8, fontSize: 12, color: t.danger }}>{bootstrapErr}</div> : null}
        </Card>
      ) : null}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setActiveDrag(null)}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(280px, 0.85fr) minmax(420px, 1.3fr)",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          {/* LEFT — Resolution Queue */}
          <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                Resolution Queue
              </span>
              <Pill bg={queue.length > 0 ? t.warnBg : t.surface2} color={queue.length > 0 ? t.warn : t.ink3}>
                {queue.length} open
              </Pill>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>
                Drag → row cell
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 540, overflow: "auto", paddingRight: 2 }}>
              {queue.length === 0 ? (
                <div style={{ padding: "16px 8px", fontSize: 12, color: t.ink3 }}>
                  {totalRows === 0
                    ? "Nothing yet — bootstrap from your playbook above to populate the queue."
                    : "Every task is already placed in the handoff table on the right."}
                </div>
              ) : (
                queue.map((row) => <QueueRow key={row.requirement_key} row={row} onOpen={() => setEditing(row)} />)
              )}
            </div>
          </div>

          {/* RIGHT — Delegation (numbered handoff table) */}
          <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, background: t.surface, padding: 12, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                Delegation
              </span>
              <Pill>Work handoff</Pill>
              <span style={{ marginLeft: "auto", fontSize: 11, color: t.ink3 }}>
                Drop tasks into a numbered row&apos;s AI or Human column
              </span>
            </div>
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
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDrag ? (
            <span
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                background: activeDrag.owner === "ai" ? t.brandSoft : t.surface2,
                color: activeDrag.owner === "ai" ? t.brand : t.ink2,
                fontSize: 11.5,
                fontWeight: 800,
                border: `1px solid ${activeDrag.owner === "ai" ? t.brand : t.line}`,
              }}
            >
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
      <InstructionsEditor
        open={panel === "instructions"}
        onClose={() => setPanel(null)}
      />
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
    </Card>
  );
}

function FieldFillBanner({
  t,
  property,
  borrower,
  credit,
  hasLoanOverview,
  onJumpToProperty,
  onJumpToLoanOverview,
}: {
  t: ReturnType<typeof useTheme>["t"];
  property: number;
  borrower: number;
  credit: number;
  hasLoanOverview: boolean;
  onJumpToProperty: () => void;
  onJumpToLoanOverview: () => void;
}) {
  const borrowerPlusCredit = borrower + credit;
  return (
    <div
      style={{
        marginBottom: 12,
        padding: 12,
        borderRadius: 10,
        border: `1px solid ${t.danger}55`,
        background: `${t.danger}10`,
        display: "flex",
        gap: 12,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Icon name="alert" size={14} color={t.danger} stroke={2.2} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ink }}>
          Field data the AI can&apos;t fill for you
        </div>
        <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
          These rows were pulled out of the queue — finish them on the tab where they live.
        </div>
      </div>
      {property > 0 ? (
        <button
          type="button"
          onClick={onJumpToProperty}
          style={fieldFillJumpBtn(t)}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 22,
              height: 22,
              padding: "0 7px",
              borderRadius: 11,
              background: t.danger,
              color: "#fff",
              fontSize: 11,
              fontWeight: 900,
              fontFeatureSettings: '"tnum"',
            }}
          >
            {property}
          </span>
          Property tab
          <Icon name="chevR" size={11} />
        </button>
      ) : null}
      {borrowerPlusCredit > 0 ? (
        <button
          type="button"
          onClick={onJumpToLoanOverview}
          disabled={!hasLoanOverview}
          title={
            hasLoanOverview
              ? "Open the Loan Overview tab to fill borrower + credit details."
              : "Borrower + credit fields show up on Loan Overview once the deal is promoted to a funding file."
          }
          style={{
            ...fieldFillJumpBtn(t),
            opacity: hasLoanOverview ? 1 : 0.6,
            cursor: hasLoanOverview ? "pointer" : "not-allowed",
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minWidth: 22,
              height: 22,
              padding: "0 7px",
              borderRadius: 11,
              background: t.danger,
              color: "#fff",
              fontSize: 11,
              fontWeight: 900,
              fontFeatureSettings: '"tnum"',
            }}
          >
            {borrowerPlusCredit}
          </span>
          Loan Overview {borrower > 0 && credit > 0 ? "· borrower + credit" : borrower > 0 ? "· borrower" : "· credit"}
          <Icon name="chevR" size={11} />
        </button>
      ) : null}
    </div>
  );
}

function fieldFillJumpBtn(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 10px 6px 6px",
    borderRadius: 8,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
  };
}

function defaultHandoffRows(): HandoffRow[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `row_${i + 1}`,
    owner: null,
    taskKeys: [],
  }));
}

function QueueRow({ row, onOpen }: { row: DSTaskRow; onOpen: () => void }) {
  const { t } = useTheme();
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
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 8,
        background: t.surface2,
        border: `1px solid ${t.line}`,
        cursor: "grab",
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, lineHeight: 1.3 }}>{row.label}</div>
        <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>
          {row.status}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
        style={{
          padding: "4px 10px",
          fontSize: 11,
          fontWeight: 700,
          borderRadius: 6,
          border: `1px solid ${t.line}`,
          background: t.surface,
          color: t.ink2,
          cursor: "pointer",
        }}
      >
        Edit
      </button>
    </div>
  );
}

function ActionPill({
  t,
  icon,
  label,
  hint,
  onClick,
}: {
  t: ReturnType<typeof useTheme>["t"];
  icon: "sliders" | "cal" | "alert" | "chat";
  label: string;
  hint?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={pillBtn(t)}>
      <Icon name={icon} size={12} stroke={2.2} />
      <span style={{ fontWeight: 800 }}>{label}</span>
      {hint ? (
        <span style={{ marginLeft: 4, fontSize: 9.5, color: t.brand, fontWeight: 900, textTransform: "uppercase", letterSpacing: 0.5 }}>
          {hint}
        </span>
      ) : null}
    </button>
  );
}

function pillBtn(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "6px 12px",
    borderRadius: 9,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink2,
    fontSize: 11.5,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
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
  const { t } = useTheme();
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
    <ModalShell onClose={onClose} title="Follow-up rhythm" icon="cal">
      <div style={{ fontSize: 12, color: t.ink3 }}>
        Controls how often the AI re-engages this client between replies. Per-deal overrides win; otherwise the
        firm default or system floor applies.
      </div>
      <FollowUpEditor value={draft} onChange={setDraft} fallback={SYSTEM_FLOOR} fallbackLabel="System floor" />
      {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => onSave(null).then(onClose)} disabled={busy} style={btnSecondary(t)}>
          Reset to firm default
        </button>
        <button onClick={save} disabled={busy} style={btnPrimary(t, busy)}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function InstructionsEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTheme();
  if (!open) return null;
  return (
    <ModalShell onClose={onClose} title="Instructions" icon="sliders">
      <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.5 }}>
        Standing rules the AI honors across every task on this file are configured in{" "}
        <strong>Settings → AI → Lead Templates</strong>. Per-task instructions live on each task itself —
        click a task in the Resolution Queue or in a numbered row to edit.
      </div>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnPrimary(t, false)}>Got it</button>
      </div>
    </ModalShell>
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
  const { t } = useTheme();
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
    <ModalShell onClose={onClose} title={task.label} icon="spark" subtitle={`${task.requirement_key} · ${task.owner_type} · ${task.status}`}>
      <div style={{ fontSize: 12, color: t.ink3 }}>
        Free-text instructions the AI uses when chasing this requirement. Stays per-task, never leaks to the
        borrower unless you flag it borrower-visible.
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={6}
        placeholder='e.g. "Ask the buyer for their pre-approval letter from Chase…"'
        style={{
          width: "100%",
          padding: 10,
          fontSize: 13,
          fontFamily: "inherit",
          borderRadius: 6,
          border: `1px solid ${t.line}`,
          background: t.surface,
          color: t.ink,
          resize: "vertical",
          lineHeight: 1.4,
          boxSizing: "border-box",
        }}
      />
      {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={onClose} style={btnSecondary(t)}>Cancel</button>
        <button onClick={save} disabled={busy} style={btnPrimary(t, busy)}>
          {busy ? "Saving…" : "Save instructions"}
        </button>
      </div>
    </ModalShell>
  );
}

function ModalShell({
  onClose,
  title,
  icon,
  subtitle,
  children,
}: {
  onClose: () => void;
  title: string;
  icon: "sliders" | "cal" | "spark";
  subtitle?: string;
  children: React.ReactNode;
}) {
  const { t } = useTheme();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          width: 560,
          maxWidth: "100%",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name={icon} size={15} stroke={2.2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>{title}</div>
            {subtitle ? <div style={{ fontSize: 11.5, color: t.ink3 }}>{subtitle}</div> : null}
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", padding: 4 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
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
  };
}
