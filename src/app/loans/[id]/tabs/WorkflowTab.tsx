"use client";

// Per-loan Workflow tab — the operator's view of what the AI is
// going to do (and when) for this borrower's docs, with knobs to
// alter timing without touching settings.
//
// One row per Document on the loan: name, current status, scenario
// chip, effective due date (editable date picker), days-until-due,
// and a per-row clear button when the row has an override set.
// Bulk actions in the header shift all REQUESTED docs by N days
// or reset everything to the default cadence. "Send reminders now"
// fires the AI evaluator scoped to this loan and surfaces what got
// posted in a toast.
//
// Styling lives in globals.css / app-extras.css. The list is a `.gridrow`
// stack (a grid pretending to be a table — the 8-column track is data about
// this screen and stays inline); the add-custom dialog is ds/Drawer, which
// carries Escape, backdrop click, body-scroll lock and focus restore that the
// hand-rolled overlay it replaced did not have.

import { useMemo, useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  CellChip,
  Field,
  IconBtn,
  Input,
  Panel,
  StatusLine,
  cx,
  type ChipTone,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import {
  useAddCustomDocument,
  useLoanWorkflow,
  useMarkDocumentVerified,
  usePatchDocument,
  useRunDocReminders,
  type WorkflowDoc,
} from "@/hooks/useApi";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import type { Loan } from "@/lib/types";

// Maps each scenario to a (label, tone) pair. heads_up + due_today are
// calm/neutral; just_late warns; week_late + escalating signal blocking.
// Matches the chat-message tone gradient. The tones are the sheet's chip
// vocabulary rather than a second set of hex pairs, so "escalating" is the
// same red here as it is in a table cell.
const SCENARIO_META: Record<string, { label: string; tone: ChipTone }> = {
  heads_up: { label: "Heads-up", tone: "pet" },
  due_today: { label: "Due today", tone: "acc" },
  just_late: { label: "1-3d late", tone: "warn" },
  week_late: { label: "Week late", tone: "bad" },
  escalating: { label: "Escalating", tone: "bad" },
};

// Which side of the transaction the doc belongs to. Same reasoning as above:
// buyer reads accent, seller reads gold, unknown stays muted.
const SIDE_TONE: Record<string, ChipTone> = {
  buyer: "acc",
  seller: "gold",
};

export function WorkflowTab({
  loan,
  canEdit,
}: {
  loan: Loan;
  canEdit: boolean;
}) {
  const workflowQ = useLoanWorkflow(loan.id);
  const patchDoc = usePatchDocument();
  const runReminders = useRunDocReminders();
  const addCustom = useAddCustomDocument();
  const markVerified = useMarkDocumentVerified();
  const ctxMenu = useContextMenu<WorkflowDoc>();

  const [shiftDays, setShiftDays] = useState<number>(7);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [showSkipped, setShowSkipped] = useState<boolean>(false);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  const docs = workflowQ.data ?? [];
  const visibleDocs = useMemo(
    () => (showSkipped ? docs : docs.filter((d) => d.status !== "skipped")),
    [docs, showSkipped],
  );
  const requestedDocs = useMemo(
    () => docs.filter((d) => d.status === "requested"),
    [docs],
  );
  const skippedCount = docs.filter((d) => d.status === "skipped").length;

  // Counts for the header pills
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of requestedDocs) {
      const s = d.scenario ?? "scheduled";
      c[s] = (c[s] || 0) + 1;
    }
    return c;
  }, [requestedDocs]);

  const onSetDate = async (doc: WorkflowDoc, value: string | null) => {
    setFeedback(null);
    try {
      await patchDoc.mutateAsync({ documentId: doc.document_id, due_date: value });
      setFeedback(
        value
          ? `Set ${doc.name} due date to ${value}.`
          : `Cleared override on ${doc.name} (back to default cadence).`,
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Update failed.");
    }
  };

  const onShiftAll = async (deltaDays: number) => {
    setFeedback(null);
    try {
      const today = new Date();
      const updates = await Promise.all(
        requestedDocs.map((d) => {
          if (!d.effective_due_date) return null;
          const newDate = new Date(d.effective_due_date);
          newDate.setDate(newDate.getDate() + deltaDays);
          // Don't go before today — accelerate caps at today.
          if (newDate < today) newDate.setTime(today.getTime());
          const iso = newDate.toISOString().slice(0, 10);
          return patchDoc.mutateAsync({
            documentId: d.document_id,
            due_date: iso,
          });
        }),
      );
      setFeedback(
        `${updates.filter(Boolean).length} doc${updates.filter(Boolean).length === 1 ? "" : "s"} shifted by ${deltaDays > 0 ? "+" : ""}${deltaDays}d.`,
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Bulk shift failed.");
    }
  };

  const onResetAll = async () => {
    setFeedback(null);
    try {
      const updates = await Promise.all(
        requestedDocs.filter((d) => d.due_date).map((d) =>
          patchDoc.mutateAsync({ documentId: d.document_id, due_date: null }),
        ),
      );
      setFeedback(
        updates.length === 0
          ? "No overrides to clear."
          : `Cleared ${updates.length} override${updates.length === 1 ? "" : "s"}.`,
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Reset failed.");
    }
  };

  const onRunNow = async () => {
    setFeedback(null);
    try {
      const result = await runReminders.mutateAsync(loan.id);
      const total = Object.values(result.counts).reduce((a, b) => a + b, 0);
      const breakdown = Object.entries(result.counts)
        .filter(([_, n]) => n > 0)
        .map(([k, n]) => `${n} ${k}`)
        .join(", ");
      setFeedback(
        total === 0
          ? "No reminders fired — every scenario was already sent or no docs are in range."
          : `Sent: ${breakdown}. Check the Thread tab for the new messages.`,
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Run failed.");
    }
  };

  // Toggle a doc in/out of the AI's collection plan. Skipped docs
  // dim in the list and don't contribute to scenario counts.
  const onToggleSkip = async (doc: WorkflowDoc) => {
    setFeedback(null);
    try {
      const next = doc.status === "skipped" ? "requested" : "skipped";
      await patchDoc.mutateAsync({ documentId: doc.document_id, status: next });
      setFeedback(
        next === "skipped"
          ? `Skipped ${doc.name} — AI won't chase it.`
          : `Re-enabled ${doc.name}.`,
      );
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Toggle failed.");
    }
  };

  // Add a custom one-off doc to this loan's collection plan.
  const onAddCustom = async (name: string, dueDate: string | null) => {
    setFeedback(null);
    try {
      await addCustom.mutateAsync({
        loanId: loan.id,
        name,
        due_date: dueDate,
        checklist_key: null,
      });
      setShowAddModal(false);
      setFeedback(`Added "${name}" to the collection plan.`);
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Add failed.");
    }
  };

  return (
    <Panel
      title={`AI Collection Schedule · ${requestedDocs.length} open`}
      sub={
        <>
          {Object.entries(counts).map(([key, n]) => {
            const meta = SCENARIO_META[key];
            return (
              <CellChip key={key} tone={meta?.tone ?? "mut"}>
                {(meta?.label ?? key)}: {n}
              </CellChip>
            );
          })}
        </>
      }
      actions={
        canEdit ? (
          <>
            <Btn onClick={() => setShowAddModal(true)}>
              <Icon name="plus" size={13} /> Add custom item
            </Btn>
            <Btn variant="pri" onClick={onRunNow} disabled={runReminders.isPending}>
              <Icon name="bell" size={13} />
              {runReminders.isPending ? "Sending…" : "Send reminders now"}
            </Btn>
          </>
        ) : undefined
      }
      noPad
    >
      {canEdit && (
        // A second header strip under the title row — same padding and
        // hairline, so the bulk controls read as part of the panel's head
        // rather than as the first row of the list.
        <div className="panel-h">
          <span className="lbl">Bulk shift all due dates</span>
          <Input
            type="number"
            value={shiftDays}
            onChange={(e) => setShiftDays(Number(e.target.value) || 0)}
            aria-label="Days to shift"
            // Bespoke: a two-digit spinner, not a text field. `.field` owns
            // everything else about the box.
            style={{ width: 68, textAlign: "center" }}
          />
          <span className="sub">days</span>
          <Btn
            size="sm"
            onClick={() => onShiftAll(-Math.abs(shiftDays))}
            disabled={patchDoc.isPending || requestedDocs.length === 0}
          >
            Accelerate
          </Btn>
          <Btn
            size="sm"
            onClick={() => onShiftAll(Math.abs(shiftDays))}
            disabled={patchDoc.isPending || requestedDocs.length === 0}
          >
            Delay
          </Btn>
          <Btn
            size="sm"
            onClick={onResetAll}
            disabled={patchDoc.isPending || requestedDocs.length === 0}
          >
            Reset all to defaults
          </Btn>
          {skippedCount > 0 && (
            <>
              <span className="grow" />
              <label className="row sub">
                <input
                  type="checkbox"
                  checked={showSkipped}
                  onChange={(e) => setShowSkipped(e.target.checked)}
                />
                Show skipped ({skippedCount})
              </label>
            </>
          )}
        </div>
      )}
      {feedback && (
        <div className="panel-b">
          <StatusLine tone="mut">{feedback}</StatusLine>
        </div>
      )}
      {workflowQ.isLoading && <div className="panel-b sub">Loading…</div>}
      {!workflowQ.isLoading && visibleDocs.length === 0 && (
        <div className="panel-b sub">
          {docs.length === 0
            ? "No documents on file yet."
            : "Everything's been skipped — toggle \"Show skipped\" to see them."}
        </div>
      )}
      {visibleDocs.map((d) => (
        <WorkflowRow
          key={d.document_id}
          doc={d}
          canEdit={canEdit}
          onSetDate={(v) => onSetDate(d, v)}
          onToggleSkip={() => onToggleSkip(d)}
          onContextMenu={canEdit ? (e) => ctxMenu.open(e, d) : undefined}
        />
      ))}
      {/* Mounted only while open, exactly as the modal it replaces was: the
          drawer's own state (name, due date) has to start empty each time it
          is opened, and a component that stays mounted keeps the last entry. */}
      {showAddModal && (
        <AddCustomDrawer
          open
          busy={addCustom.isPending}
          onClose={() => setShowAddModal(false)}
          onSave={onAddCustom}
        />
      )}
      <ContextMenu
        state={ctxMenu.state}
        onClose={ctxMenu.close}
        items={(d): ContextMenuItem[] => {
          const alreadyDone = d.status === "verified";
          return [
            {
              label: alreadyDone ? "Already complete" : "Mark complete",
              icon: "check",
              disabled: alreadyDone || !canEdit || markVerified.isPending,
              hint: alreadyDone ? undefined : "operator override",
              onSelect: () => markVerified.mutate({ documentId: d.document_id, loanId: loan.id }),
            },
            {
              label: d.status === "skipped" ? "Re-enable AI collection" : "Skip (AI stops chasing)",
              icon: d.status === "skipped" ? "send" : "pause",
              disabled: !canEdit,
              onSelect: () => onToggleSkip(d),
            },
          ];
        }}
      />
    </Panel>
  );
}

function AddCustomDrawer({
  open,
  busy,
  onClose,
  onSave,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (name: string, dueDate: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [dueDate, setDueDate] = useState<string>("");
  const canSave = name.trim().length > 0 && !busy;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Add custom doc to this loan"
      width="md"
      footer={
        <>
          <span className="grow" />
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="pri" onClick={() => onSave(name.trim(), dueDate || null)} disabled={!canSave}>
            {busy ? "Adding…" : "Add"}
          </Btn>
        </>
      }
    >
      <div className="grid g10">
        <Field label="Name (what the borrower sees)">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. HOA Estoppel Letter"
            autoFocus
          />
        </Field>
        <Field label="Due date (optional — defaults to firm cadence)">
          <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>
    </Drawer>
  );
}

function WorkflowRow({
  doc,
  canEdit,
  onSetDate,
  onToggleSkip,
  onContextMenu,
}: {
  doc: WorkflowDoc;
  canEdit: boolean;
  onSetDate: (value: string | null) => void;
  onToggleSkip: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const meta = doc.scenario ? SCENARIO_META[doc.scenario] : null;
  const dueValue = doc.effective_due_date ?? "";
  const isSkipped = doc.status === "skipped";

  let timeline = "scheduled";
  if (doc.days_until_due !== null && doc.days_until_due !== undefined) {
    if (doc.days_until_due > 0) timeline = `due in ${doc.days_until_due}d`;
    else if (doc.days_until_due === 0) timeline = "due today";
    else timeline = `${Math.abs(doc.days_until_due)}d overdue`;
  }

  const nextLine =
    doc.next_scenario && doc.next_scenario_in_days !== null
      ? `Next: ${SCENARIO_META[doc.next_scenario]?.label ?? doc.next_scenario} in ${doc.next_scenario_in_days}d`
      : null;

  const isOverridden = !!doc.due_date;

  return (
    <div
      // `.gridrow.done` carries the dimmed, sunken surface a skipped row had
      // as an inline opacity + background pair.
      className={cx("gridrow", isSkipped && "done")}
      onContextMenu={onContextMenu}
      // Bespoke 8-column track: this is data about this screen, not a page
      // grid, so it stays inline (`.cg` is the 12-column PAGE grid).
      style={{ gridTemplateColumns: "30px 1.1fr 95px 95px 95px 1fr 110px 80px" }}
      title={onContextMenu ? "Right-click for actions" : undefined}
    >
      <input
        type="checkbox"
        checked={!isSkipped}
        onChange={onToggleSkip}
        disabled={!canEdit}
        title={isSkipped ? "Re-enable AI collection" : "Skip — AI won't chase this doc"}
      />
      <div className="row">
        <Icon name="doc" size={14} />
        <div className="grow">
          <div
            className="trunc"
            // Struck through because the AI has been told to stop chasing it —
            // derived from the row's own status, so it lives at the site.
            style={{ textDecoration: isSkipped ? "line-through" : undefined }}
          >
            <strong>{doc.name}</strong>
          </div>
          <div className="sub">
            {doc.status} {doc.checklist_key ? `· ${doc.checklist_key}` : doc.is_other ? "· custom" : ""}
          </div>
        </div>
      </div>
      <div>
        <CellChip tone={SIDE_TONE[doc.side ?? ""] ?? "mut"}>{doc.side ?? "both"}</CellChip>
      </div>
      <div>
        {isSkipped ? (
          <CellChip tone="mut">skipped</CellChip>
        ) : meta ? (
          <CellChip tone={meta.tone}>{meta.label}</CellChip>
        ) : (
          <CellChip tone="mut">{doc.scenario ?? "scheduled"}</CellChip>
        )}
      </div>
      <div className="num">{timeline}</div>
      <div className="row">
        <Input
          type="date"
          value={dueValue}
          onChange={(e) => onSetDate(e.target.value || null)}
          disabled={!canEdit || doc.status !== "requested"}
          // Gold rim = an operator has pinned this date. Paired with the
          // OVERRIDE label in the last column so the signal is not colour alone.
          className={cx(isOverridden && "tone-gold")}
        />
        {isOverridden && canEdit && doc.status === "requested" && (
          <IconBtn onClick={() => onSetDate(null)} title="Clear override (back to default cadence)">
            <Icon name="x" size={11} />
          </IconBtn>
        )}
      </div>
      <div className="sub">{nextLine ?? ""}</div>
      <div className="lbl align-r">{isOverridden ? "OVERRIDE" : "default"}</div>
    </div>
  );
}
