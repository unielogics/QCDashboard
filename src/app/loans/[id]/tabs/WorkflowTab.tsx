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

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useLoanWorkflow,
  usePatchDocument,
  useRunDocReminders,
  type WorkflowDoc,
} from "@/hooks/useApi";
import type { Loan } from "@/lib/types";

// Maps each scenario to a (label, fg, bg) tuple. heads_up + due_today
// are calm/neutral; just_late warns; week_late + escalating signal
// blocking. Matches the chat-message tone gradient.
const SCENARIO_STYLE = (
  t: ReturnType<typeof useTheme>["t"],
): Record<string, { label: string; fg: string; bg: string }> => ({
  heads_up: { label: "Heads-up", fg: t.petrol, bg: t.petrolSoft },
  due_today: { label: "Due today", fg: t.brand, bg: t.brandSoft },
  just_late: { label: "1-3d late", fg: t.warn, bg: t.warnBg },
  week_late: { label: "Week late", fg: t.danger, bg: t.dangerBg },
  escalating: { label: "Escalating", fg: t.danger, bg: t.dangerBg },
});

export function WorkflowTab({
  loan,
  canEdit,
}: {
  loan: Loan;
  canEdit: boolean;
}) {
  const { t } = useTheme();
  const workflowQ = useLoanWorkflow(loan.id);
  const patchDoc = usePatchDocument();
  const runReminders = useRunDocReminders();
  const styles = SCENARIO_STYLE(t);

  const [shiftDays, setShiftDays] = useState<number>(7);
  const [feedback, setFeedback] = useState<string | null>(null);

  const docs = workflowQ.data ?? [];
  const requestedDocs = useMemo(
    () => docs.filter((d) => d.status === "requested"),
    [docs],
  );

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

  return (
    <Card pad={0}>
      <div
        style={{
          padding: 16,
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <SectionLabel>AI Collection Schedule · {requestedDocs.length} open</SectionLabel>
            {Object.entries(counts).map(([key, n]) => {
              const sty = styles[key];
              if (!sty) {
                return (
                  <Pill key={key} bg={t.surface2} color={t.ink3}>
                    {key}: {n}
                  </Pill>
                );
              }
              return (
                <Pill key={key} bg={sty.bg} color={sty.fg}>
                  {sty.label}: {n}
                </Pill>
              );
            })}
          </div>
          {canEdit && (
            <button
              onClick={onRunNow}
              disabled={runReminders.isPending}
              style={{
                padding: "8px 14px",
                borderRadius: 9,
                background: t.petrol,
                color: "#fff",
                fontSize: 13,
                fontWeight: 700,
                border: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                cursor: runReminders.isPending ? "wait" : "pointer",
              }}
            >
              <Icon name="bell" size={13} />
              {runReminders.isPending ? "Sending…" : "Send reminders now"}
            </button>
          )}
        </div>
        {canEdit && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11.5, color: t.ink3, fontWeight: 600 }}>Bulk shift all due dates:</span>
            <input
              type="number"
              value={shiftDays}
              onChange={(e) => setShiftDays(Number(e.target.value) || 0)}
              style={{
                width: 60,
                padding: "5px 8px",
                borderRadius: 6,
                border: `1px solid ${t.line}`,
                background: t.surface2,
                color: t.ink,
                fontSize: 12,
                textAlign: "center",
              }}
            />
            <span style={{ fontSize: 11.5, color: t.ink3 }}>days</span>
            <button
              onClick={() => onShiftAll(-Math.abs(shiftDays))}
              disabled={patchDoc.isPending || requestedDocs.length === 0}
              style={shiftBtn(t)}
            >
              Accelerate
            </button>
            <button
              onClick={() => onShiftAll(Math.abs(shiftDays))}
              disabled={patchDoc.isPending || requestedDocs.length === 0}
              style={shiftBtn(t)}
            >
              Delay
            </button>
            <button
              onClick={onResetAll}
              disabled={patchDoc.isPending || requestedDocs.length === 0}
              style={shiftBtn(t)}
            >
              Reset all to defaults
            </button>
          </div>
        )}
        {feedback && (
          <div style={{ fontSize: 12, color: t.ink3, padding: "6px 10px", background: t.surface2, borderRadius: 8 }}>
            {feedback}
          </div>
        )}
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {workflowQ.isLoading && (
          <div style={{ padding: 20, fontSize: 13, color: t.ink3 }}>Loading…</div>
        )}
        {!workflowQ.isLoading && docs.length === 0 && (
          <div style={{ padding: 20, fontSize: 13, color: t.ink3 }}>
            No documents on file yet.
          </div>
        )}
        {docs.map((d) => (
          <WorkflowRow
            key={d.document_id}
            doc={d}
            canEdit={canEdit}
            onSetDate={(v) => onSetDate(d, v)}
            t={t}
            styles={styles}
          />
        ))}
      </div>
    </Card>
  );
}

function shiftBtn(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "5px 10px",
    borderRadius: 7,
    border: `1px solid ${t.line}`,
    background: t.surface2,
    color: t.ink,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  };
}

function WorkflowRow({
  doc,
  canEdit,
  onSetDate,
  t,
  styles,
}: {
  doc: WorkflowDoc;
  canEdit: boolean;
  onSetDate: (value: string | null) => void;
  t: ReturnType<typeof useTheme>["t"];
  styles: ReturnType<typeof SCENARIO_STYLE>;
}) {
  const sty = doc.scenario ? styles[doc.scenario] : null;
  const dueValue = doc.effective_due_date ?? "";

  let timeline = "scheduled";
  if (doc.days_until_due !== null && doc.days_until_due !== undefined) {
    if (doc.days_until_due > 0) timeline = `due in ${doc.days_until_due}d`;
    else if (doc.days_until_due === 0) timeline = "due today";
    else timeline = `${Math.abs(doc.days_until_due)}d overdue`;
  }

  const nextLine =
    doc.next_scenario && doc.next_scenario_in_days !== null
      ? `Next: ${styles[doc.next_scenario]?.label ?? doc.next_scenario} in ${doc.next_scenario_in_days}d`
      : null;

  const isOverridden = !!doc.due_date;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1.2fr 110px 100px 1fr 110px 80px",
        alignItems: "center",
        gap: 10,
        padding: "11px 16px",
        borderBottom: `1px solid ${t.line}`,
        fontSize: 12.5,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <Icon name="doc" size={14} style={{ color: t.ink3, flex: "0 0 auto" }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {doc.name}
          </div>
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>
            {doc.status} {doc.checklist_key ? `· ${doc.checklist_key}` : doc.is_other ? "· Other" : ""}
          </div>
        </div>
      </div>
      <div>
        {sty ? (
          <Pill bg={sty.bg} color={sty.fg}>
            {sty.label}
          </Pill>
        ) : (
          <Pill bg={t.surface2} color={t.ink3}>
            {doc.scenario ?? "scheduled"}
          </Pill>
        )}
      </div>
      <div style={{ color: t.ink2, fontFeatureSettings: '"tnum"' }}>{timeline}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          type="date"
          value={dueValue}
          onChange={(e) => onSetDate(e.target.value || null)}
          disabled={!canEdit || doc.status !== "requested"}
          style={{
            padding: "5px 8px",
            borderRadius: 6,
            border: `1px solid ${isOverridden ? t.gold : t.line}`,
            background: t.surface2,
            color: t.ink,
            fontSize: 12,
            fontFamily: "inherit",
          }}
        />
        {isOverridden && canEdit && doc.status === "requested" && (
          <button
            onClick={() => onSetDate(null)}
            title="Clear override (back to default cadence)"
            style={{
              border: "none",
              background: "transparent",
              color: t.ink3,
              cursor: "pointer",
              padding: 4,
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <Icon name="x" size={11} />
          </button>
        )}
      </div>
      <div style={{ fontSize: 10.5, color: t.ink3 }}>{nextLine ?? ""}</div>
      <div style={{ fontSize: 10.5, color: t.ink4, textAlign: "right" }}>
        {isOverridden ? "OVERRIDE" : "default"}
      </div>
    </div>
  );
}
