"use client";

// AI Secretary tab — the agent's drag-drop workbench scoped to this
// deal (pre-promotion) or to the linked funding loan (post-promotion).
// Adds three controls the funding /loans/[id] page has that were
// missing from the bare picker:
//
//   1. Cadence editor — opens FollowUpEditor in a modal, writes
//      ai_secretary_settings.follow_up via PATCH file-settings
//   2. Bootstrap repair — visible when the workbench is empty;
//      seeds CRS + plan from the agent's buyer/seller playbook
//   3. Per-task assignment drawer — opens when the agent clicks a
//      task; edits instructions + outreach instructions visibility

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { DealSecretaryPicker } from "@/components/DealSecretaryPicker";
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

// System floor — matches qcbackend app/services/ai/follow_up.py.
const SYSTEM_FLOOR: FollowUpSettings = {
  stall_threshold_minutes: 60 * 24,
  max_attempts_per_day: 3,
  max_days_without_reply: 14,
};

export function AISecretaryTab({
  clientId,
  dealId,
  loanId,
}: {
  clientId: string;
  dealId: string;
  loanId: string | null;
}) {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const isOperator = user?.role === "super_admin" || user?.role === "loan_exec";
  const scope = loanId ? { loanId } : { dealId };

  const { data: view, isLoading } = useClientAiFollowUp({
    clientId,
    dealId: scope.dealId ?? null,
    loanId: scope.loanId ?? null,
  });
  const assign = useAssignClientTask(clientId);
  const unassign = useUnassignClientTask(clientId);
  const updateSettings = useUpdateClientFileSettings(clientId);
  const bootstrap = useBootstrapClientAiFollowUp(clientId);

  const [rhythmOpen, setRhythmOpen] = useState(false);
  const [editing, setEditing] = useState<DSTaskRow | null>(null);
  const [bootstrapErr, setBootstrapErr] = useState<string | null>(null);

  const totalRows = (view?.left.length ?? 0) + (view?.right.length ?? 0);
  const isEmpty = !!view && totalRows === 0;
  const followUp = (view?.file_settings?.follow_up ?? null) as FollowUpSettings | null;

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
        <div style={{ marginTop: 8, fontSize: 13, color: t.ink3 }}>
          Couldn&apos;t load the view. Try refreshing.
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header — cadence + bootstrap + funding workbench link */}
      <Card pad={14}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
              AI Secretary {scope.loanId ? "· funding scope" : "· realtor scope"}
            </div>
            <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
              {totalRows === 0
                ? "No requirements yet — bootstrap from your buyer/seller playbook below."
                : `${view.right.length} AI-owned · ${view.left.length} you handle · ${view.funding_locked_count} funding-locked`}
            </div>
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setRhythmOpen(true)} style={btnSecondary(t)}>
              <Icon name="cal" size={12} /> Follow-up rhythm
              {followUp && Object.values(followUp).some((v) => v !== null && v !== undefined) ? (
                <span
                  style={{
                    marginLeft: 4,
                    padding: "1px 5px",
                    fontSize: 9.5,
                    fontWeight: 800,
                    background: t.brandSoft,
                    color: t.brand,
                    borderRadius: 999,
                    textTransform: "uppercase",
                  }}
                >
                  override
                </span>
              ) : null}
            </button>
            {scope.loanId ? (
              <a
                href={`/loans/${scope.loanId}?tab=workspace`}
                style={{ ...btnSecondary(t), textDecoration: "none" }}
              >
                <Icon name="file" size={12} /> Open funding workbench
              </a>
            ) : null}
          </div>
        </div>
        {bootstrapErr ? (
          <div style={{ marginTop: 8, fontSize: 12, color: t.danger }}>{bootstrapErr}</div>
        ) : null}
      </Card>

      {isEmpty ? (
        <Card pad={20} style={{ borderLeft: `3px solid ${t.brand}` }}>
          <SectionLabel>Bootstrap requirements</SectionLabel>
          <div style={{ fontSize: 13, color: t.ink2, marginTop: 6 }}>
            This file has no AI requirements yet. Pull from your buyer/seller playbook (the templates
            you configured in <strong>Settings → AI → Lead Templates</strong>) to seed the workbench.
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
              marginTop: 12,
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: 800,
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
            <Icon name="bolt" size={12} /> {bootstrap.isPending ? "Bootstrapping…" : "Bootstrap from playbook"}
          </button>
        </Card>
      ) : null}

      <DealSecretaryPicker
        view={view}
        isOperator={isOperator}
        onAssign={(requirement_key) =>
          assign.mutate({ body: { requirement_key }, dealId: scope.dealId, loanId: scope.loanId })
        }
        onUnassign={(requirement_key) =>
          unassign.mutate({ requirementKey: requirement_key, dealId: scope.dealId, loanId: scope.loanId })
        }
        onChangeOutreachMode={(mode: DSOutreachMode) =>
          updateSettings.mutate({
            body: { outreach_mode: mode },
            dealId: scope.dealId,
            loanId: scope.loanId,
          })
        }
        onOpenAssignment={(task) => setEditing(task)}
      />

      <FollowUpRhythmEditor
        open={rhythmOpen}
        onClose={() => setRhythmOpen(false)}
        value={followUp}
        onSave={(next) =>
          updateSettings.mutateAsync({
            body: { follow_up: next },
            dealId: scope.dealId,
            loanId: scope.loanId,
          })
        }
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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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

  async function reset() {
    setBusy(true);
    setErr(null);
    try {
      await onSave(null);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't reset");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.32)",
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
          width: 520,
          maxWidth: "100%",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="cal" size={15} stroke={2.2} />
          <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>Follow-up rhythm</div>
          <button
            onClick={onClose}
            style={{ marginLeft: "auto", background: "transparent", border: "none", color: t.ink3, cursor: "pointer", padding: 4 }}
            title="Close"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: t.ink3 }}>
          Controls how often the AI re-engages this client between replies. Per-deal overrides win; otherwise the
          firm default or system floor applies.
        </div>
        <FollowUpEditor
          value={draft}
          onChange={setDraft}
          fallback={SYSTEM_FLOOR}
          fallbackLabel="System floor"
        />
        {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={reset} disabled={busy} style={btnSecondary(t)}>Reset to firm default</button>
          <button onClick={save} disabled={busy} style={btnPrimary(t, busy)}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.32)",
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
          <Icon name="spark" size={15} stroke={2.2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>{task.label}</div>
            <div style={{ fontSize: 11.5, color: t.ink3 }}>
              {task.requirement_key} · {task.owner_type} · {task.status}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", padding: 4 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: t.ink3 }}>
          Free-text instructions the AI uses when chasing this requirement. Stays per-task, never leaks to the
          borrower unless you flag it borrower-visible.
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder='e.g. "Ask the buyer for their pre-approval letter from Chase. If they push back, offer alternative lenders we work with."'
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
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}
