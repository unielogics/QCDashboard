"use client";

// LoanAgentPicker — shared popover for assigning / reassigning the
// agent (broker) on a Loan. Used in two places:
//
//   1. Loan header (/loans/[id]) — super_admin/loan_exec see an
//      "AGENT" chip; click opens this picker.
//   2. Pipeline table (funding mode) — right-click a row, "Reassign
//      agent…" opens this picker at the cursor.
//
// After a successful reassign the picker opens MultiLoanReassignModal
// so the operator can sweep the other open loans of the same client
// onto the same agent in a single decision.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useBrokers, useUpdateLoan } from "@/hooks/useApi";
import { MultiLoanReassignModal } from "@/components/MultiLoanReassignModal";
import type { Broker, Loan } from "@/lib/types";

interface Props {
  loan: Loan;
  // Pixel anchor — when set, the popover renders fixed-positioned at
  // these coordinates (right-click on a pipeline row). When null, the
  // popover sits inline below its caller (header chip).
  anchor?: { x: number; y: number } | null;
  onClose: () => void;
}

export function LoanAgentPicker({ loan, anchor, onClose }: Props) {
  const { t } = useTheme();
  const { data: brokers = [], isLoading } = useBrokers();
  const update = useUpdateLoan();

  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sweepFor, setSweepFor] = useState<Broker | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter((b) => b.display_name.toLowerCase().includes(q));
  }, [brokers, search]);

  // Close on Escape + outside click. The outside-click detection is
  // wired against the popover ref so users can interact with inputs
  // inside without dismissing.
  const popRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (!popRef.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("keydown", onKey);
    // Defer the click listener by a tick so the click that opened
    // the popover doesn't immediately close it.
    const id = window.setTimeout(() => {
      window.addEventListener("click", onClick);
    }, 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.clearTimeout(id);
    };
  }, [onClose]);

  async function pick(b: Broker | null) {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await update.mutateAsync({ loanId: loan.id, broker_id: b?.id ?? null });
      if (b) {
        // Hand off to the cross-loan sweep modal if the client has
        // other open loans on a different broker. The modal
        // auto-dismisses when there's nothing to ask.
        setSweepFor(b);
      } else {
        onClose();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't reassign");
    } finally {
      setBusy(false);
    }
  }

  // Position: fixed when anchored, absolute (inline) otherwise.
  const popoverStyle: React.CSSProperties = anchor
    ? {
        position: "fixed",
        top: anchor.y,
        left: anchor.x,
        zIndex: 80,
      }
    : {
        position: "absolute",
        top: "100%",
        left: 0,
        marginTop: 6,
        zIndex: 50,
      };

  return (
    <>
      <div
        ref={popRef}
        // Stop propagation so the body click listener that closes the
        // popover doesn't fire when interacting inside it.
        onClick={(e) => e.stopPropagation()}
        onContextMenu={(e) => e.preventDefault()}
        style={{
          ...popoverStyle,
          width: 280,
          background: t.surface,
          border: `1px solid ${t.line}`,
          borderRadius: 10,
          boxShadow: "0 18px 40px rgba(0,0,0,0.32)",
          padding: 10,
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Icon name="user" size={12} stroke={2.2} />
          <span style={{ fontSize: 10.5, fontWeight: 900, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>
            Reassign agent
          </span>
          <span style={{ flex: 1 }} />
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: t.ink3, cursor: "pointer", padding: 2 }}
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        <input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search agents…"
          style={{
            padding: "7px 9px",
            fontSize: 12.5,
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface2,
            color: t.ink,
            outline: "none",
          }}
        />

        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {isLoading ? (
            <div style={{ padding: 10, fontSize: 12, color: t.ink3 }}>Loading agents…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: 10, fontSize: 12, color: t.ink3 }}>
              {search ? "No agents match that search." : "No agents available."}
            </div>
          ) : (
            filtered.map((b) => {
              const isCurrent = b.id === loan.broker_id;
              return (
                <button
                  key={b.id}
                  onClick={() => pick(b)}
                  disabled={busy || isCurrent}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 10px",
                    borderRadius: 6,
                    border: "none",
                    background: isCurrent ? t.brandSoft : "transparent",
                    color: t.ink,
                    fontSize: 12.5,
                    cursor: busy || isCurrent ? "default" : "pointer",
                    textAlign: "left",
                    fontFamily: "inherit",
                    opacity: busy && !isCurrent ? 0.6 : 1,
                  }}
                  onMouseOver={(e) => {
                    if (!isCurrent && !busy) (e.currentTarget as HTMLElement).style.background = t.surface2;
                  }}
                  onMouseOut={(e) => {
                    if (!isCurrent) (e.currentTarget as HTMLElement).style.background = "transparent";
                  }}
                >
                  <span style={{ flex: 1 }}>{b.display_name}</span>
                  {isCurrent ? (
                    <span style={{ fontSize: 10, fontWeight: 800, color: t.brand, letterSpacing: 0.5 }}>
                      CURRENT
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>

        {loan.broker_id ? (
          <button
            onClick={() => pick(null)}
            disabled={busy}
            style={{
              padding: "6px 10px",
              fontSize: 11.5,
              fontWeight: 700,
              borderRadius: 6,
              border: `1px solid ${t.line}`,
              background: t.surface2,
              color: t.danger,
              cursor: busy ? "default" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            Unassign current agent
          </button>
        ) : null}

        {err ? <div style={{ fontSize: 11.5, color: t.danger }}>{err}</div> : null}
      </div>

      {sweepFor ? (
        <MultiLoanReassignModal
          clientId={loan.client_id}
          newBroker={sweepFor}
          brokerName={sweepFor.display_name}
          onClose={() => {
            setSweepFor(null);
            onClose();
          }}
        />
      ) : null}
    </>
  );
}
