"use client";

// MultiLoanReassignModal — fires after a super-admin assigns or
// reassigns a broker on a Client. Lists every open loan (non-funded)
// for the client whose current broker_id differs from the new agent
// and asks: "Also sweep these onto the same agent?" Skipping leaves
// the loan on its existing broker so the agent gets the relationship
// but the loan stays in whoever's funding pipeline it was.
//
// Pre-approval / PrequalRequest rows ride with the loans — they're
// joined by loan_id so reassigning the loan implicitly carries them.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useLoans, useUpdateLoan } from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Broker } from "@/lib/types";

interface Props {
  clientId: string;
  // The broker just assigned to the client. NULL when the operator
  // unassigned — in that case we DON'T offer to unassign the loans
  // (unassigning a loan in mid-flight is a different operation).
  newBroker: Broker | null;
  brokerName: string | null;
  onClose: () => void;
}

export function MultiLoanReassignModal({ clientId, newBroker, brokerName, onClose }: Props) {
  const { t } = useTheme();
  const { data: loans = [], isLoading } = useLoans();
  const update = useUpdateLoan();

  // Candidates = the client's loans currently on a different broker
  // (or no broker) AND not yet funded. Funded loans are historical;
  // not worth touching the broker association after closing.
  const candidates = useMemo(() => {
    if (!newBroker) return [];
    return loans.filter(
      (l) =>
        l.client_id === clientId &&
        l.stage !== "funded" &&
        l.broker_id !== newBroker.id,
    );
  }, [loans, clientId, newBroker]);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Default to all selected — the operator almost always wants the
  // sweep; Skip is the explicit opt-out.
  useEffect(() => {
    setPicked(new Set(candidates.map((l) => l.id)));
  }, [candidates]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function toggle(id: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sweep(all: boolean) {
    if (!newBroker) {
      onClose();
      return;
    }
    const ids = all ? candidates.map((l) => l.id) : Array.from(picked);
    if (ids.length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // Sequential — small N (1-3 typically), simpler error reporting
      // than Promise.all and easier to retry on partial failure.
      for (const id of ids) {
        await update.mutateAsync({ loanId: id, broker_id: newBroker.id });
      }
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't sweep loans");
    } finally {
      setBusy(false);
    }
  }

  // Nothing to ask about? Auto-dismiss after a tick so the parent
  // doesn't have to special-case.
  useEffect(() => {
    if (!isLoading && newBroker && candidates.length === 0) {
      const id = window.setTimeout(onClose, 0);
      return () => window.clearTimeout(id);
    }
  }, [isLoading, newBroker, candidates.length, onClose]);

  // Don't render if there's no broker (unassign path) or nothing to ask.
  if (!newBroker) return null;
  if (!isLoading && candidates.length === 0) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        zIndex: 75,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 12,
          width: 560,
          maxWidth: "100%",
          maxHeight: "85vh",
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="user" size={16} stroke={2.2} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: t.ink }}>
              Sweep loans onto {brokerName ?? "this agent"}?
            </div>
            <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
              This client carries {candidates.length} open loan{candidates.length === 1 ? "" : "s"} on a
              different broker. Reassign them so this agent sees the full picture in their pipeline,
              or skip to keep the funding-side ownership where it is.
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", padding: 4 }}
          >
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
          {candidates.map((loan) => {
            const checked = picked.has(loan.id);
            return (
              <label
                key={loan.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: `1px solid ${checked ? t.brand : t.line}`,
                  background: checked ? t.brandSoft : t.surface2,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(loan.id)}
                  style={{ accentColor: t.brand }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{loan.deal_id}</span>
                    <Pill>{loan.stage}</Pill>
                    <span style={{ fontSize: 11, color: t.ink3 }}>
                      {loan.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
                    {loan.address}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink2, fontFeatureSettings: '"tnum"' }}>
                  {QC_FMT.short(Number(loan.amount))}
                </div>
              </label>
            );
          })}
        </div>

        {err ? <div style={{ fontSize: 12, color: t.danger }}>{err}</div> : null}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button onClick={onClose} disabled={busy} style={btnSecondary(t)}>
            Skip — just the client
          </button>
          <button onClick={() => sweep(true)} disabled={busy} style={btnSecondary(t)}>
            Sweep all
          </button>
          <button
            onClick={() => sweep(false)}
            disabled={busy || picked.size === 0}
            style={btnPrimary(t, busy || picked.size === 0)}
          >
            {busy
              ? "Reassigning…"
              : picked.size === 0
              ? "Pick at least one"
              : `Reassign ${picked.size} loan${picked.size === 1 ? "" : "s"}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function btnPrimary(t: ReturnType<typeof useTheme>["t"], disabled: boolean): React.CSSProperties {
  return {
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 800,
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
    padding: "8px 14px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink2,
    cursor: "pointer",
  };
}
