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
import { createPortal } from "react-dom";
import { V } from "@/components/design-system/cssVars";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { Btn } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useLoans, useUpdateLoan } from "@/hooks/useApi";
import { QC_FMT } from "@/lib/fmt";
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
  const { data: loans = [], isLoading } = useLoans();
  const update = useUpdateLoan();
  const [portalHost, setPortalHost] = useState<HTMLElement | null>(null);

  // This dialog can be triggered by a control inside a focused table. Portal
  // it outside that table's modal subtree so TableWorkspace can yield its
  // focus/scroll ownership to Drawer instead of running two traps at once.
  useEffect(() => {
    setPortalHost(document.body);
    return () => setPortalHost(null);
  }, []);

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
  if (!portalHost) return null;

  return createPortal(
    <Drawer
      open
      onClose={() => { if (!busy) onClose(); }}
      closeOnBackdrop={!busy}
      width="md"
      ariaLabel="Sweep client loans to the assigned agent"
      title={(
        <span className="row">
          <Icon name="user" size={16} stroke={2.2} />
          Sweep loans onto {brokerName ?? "this agent"}?
        </span>
      )}
      sub={isLoading
        ? "Checking this client's open loans…"
        : `This client carries ${candidates.length} open loan${candidates.length === 1 ? "" : "s"} on a different broker. Reassign them so this agent sees the full picture, or skip to keep funding-side ownership where it is.`}
      footer={(
        <>
          <Btn onClick={onClose} disabled={busy}>Skip — just the client</Btn>
          <span className="sp" />
          <Btn onClick={() => void sweep(true)} disabled={busy || isLoading || candidates.length === 0}>Sweep all</Btn>
          <Btn
            variant="pri"
            onClick={() => void sweep(false)}
            disabled={busy || isLoading || picked.size === 0}
          >
            {busy
              ? "Reassigning…"
              : picked.size === 0
                ? "Pick at least one"
                : `Reassign ${picked.size} loan${picked.size === 1 ? "" : "s"}`}
          </Btn>
        </>
      )}
    >
      {isLoading ? (
        <div className="sub">Loading open loans…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                  border: `1px solid ${checked ? V.brand : V.line}`,
                  background: checked ? V.brandSoft : V.surface2,
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(loan.id)}
                  style={{ accentColor: V.brand }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: V.ink }}>{loan.deal_id}</span>
                    <Pill>{loan.stage}</Pill>
                    <span style={{ fontSize: 11, color: V.ink3 }}>
                      {loan.type.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div style={{ fontSize: 11.5, color: V.ink3, marginTop: 2 }}>
                    {loan.address}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: V.ink2, fontFeatureSettings: '"tnum"' }}>
                  {QC_FMT.short(Number(loan.amount))}
                </div>
              </label>
            );
          })}
        </div>
      )}
      {err ? <div className="statusline c-bad mt">{err}</div> : null}
    </Drawer>,
    portalHost,
  );
}
