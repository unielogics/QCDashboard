"use client";

// Lender connection panel on the loan's thread tab.
//
// Empty state: dropdown of active lenders matching loan.type +
// "Connect" button → opens the notify-list inline form, then on
// save calls /loans/{id}/connect-lender. The connect call:
//   1. sets loan.lender_id
//   2. ensures a hide_identity LENDER participant row
//   3. flips cc_outbound / bcc_outbound on the broker / super-admin
//      participants the operator picked
//   4. promotes stage to LENDER_CONNECTED if not already there
//
// Connected state: shows "Connected: <name>", a CC/BCC summary, and
// CTAs for "Send package" (opens LenderSendModal) and "Disconnect".

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useConnectLender,
  useDisconnectLender,
  useLender,
  useLenders,
  useLoanParticipants,
} from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { Role } from "@/lib/enums.generated";
import type { ConnectLenderNotifyToggle, Lender, Loan, LoanParticipant } from "@/lib/types";
import { LenderSendModal } from "./LenderSendModal";
import { LenderThread } from "./LenderThread";

interface Props {
  loan: Loan;
}

export function LenderConnectCard({ loan }: Props) {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const isSuperAdmin = profile.role === Role.SUPER_ADMIN;

  const { data: matchingLenders = [], isLoading: matchLoading } = useLenders({
    product: loan.type,
    activeOnly: true,
  });
  const { data: allLenders = [] } = useLenders({ activeOnly: true });
  const { data: participants = [] } = useLoanParticipants(loan.id);
  const connect = useConnectLender();
  const disconnect = useDisconnectLender();

  const { data: connectedLender } = useLender(loan.lender_id ?? null);

  const [showAll, setShowAll] = useState(false);
  const [pickedLenderId, setPickedLenderId] = useState<string>("");
  const [editingNotify, setEditingNotify] = useState(false);
  const [toggles, setToggles] = useState<Record<string, { cc: boolean; bcc: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [showSend, setShowSend] = useState(false);

  const dropdownLenders: Lender[] = showAll ? allLenders : matchingLenders;

  const startEdit = (lender: Lender | null) => {
    setError(null);
    // Seed defaults: brokers/loan-execs CC=on, super-admins BCC=on,
    // clients can't be touched.
    const seed: Record<string, { cc: boolean; bcc: boolean }> = {};
    for (const p of participants) {
      if (p.role === "lender" || p.role === "client") continue;
      seed[p.id] = {
        cc: lender ? p.cc_outbound : p.role === "broker",
        bcc: lender ? p.bcc_outbound : p.role === "super_admin",
      };
    }
    setToggles(seed);
    if (lender) setPickedLenderId(lender.id);
    setEditingNotify(true);
  };

  const closeEdit = () => {
    setEditingNotify(false);
    setError(null);
  };

  const submitConnect = async () => {
    setError(null);
    if (!pickedLenderId) {
      setError("Pick a lender first.");
      return;
    }
    const notify: ConnectLenderNotifyToggle[] = Object.entries(toggles).map(([id, v]) => ({
      participant_id: id,
      cc_outbound: v.cc,
      bcc_outbound: v.bcc,
    }));
    try {
      await connect.mutateAsync({
        loanId: loan.id,
        payload: { lender_id: pickedLenderId, notify },
      });
      closeEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connect failed.");
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm("Disconnect this lender? The hide-identity participant row will be removed; stage stays unchanged.")) return;
    try {
      await disconnect.mutateAsync(loan.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disconnect failed.");
    }
  };

  const summary = useMemo(() => {
    const cc = participants.filter((p) => p.cc_outbound && p.role !== "lender").length;
    const bcc = participants.filter((p) => p.bcc_outbound && p.role !== "lender").length;
    return { cc, bcc };
  }, [participants]);

  if (!isSuperAdmin) {
    return null; // Only super-admins manage lender connection
  }

  return (
    <Card pad={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <SectionLabel>Lender connection</SectionLabel>
        {connectedLender ? (
          <Pill bg={t.profitBg} color={t.profit}>Connected</Pill>
        ) : (
          <Pill bg={t.warnBg} color={t.warn}>Not connected</Pill>
        )}
      </div>

      <div style={{ padding: 16 }}>
        {connectedLender ? (
          <ConnectedView
            t={t}
            lender={connectedLender}
            ccCount={summary.cc}
            bccCount={summary.bcc}
            onSend={() => setShowSend(true)}
            onEditNotify={() => startEdit(connectedLender)}
            onDisconnect={handleDisconnect}
            disconnecting={disconnect.isPending}
          />
        ) : editingNotify ? (
          <NotifyForm
            t={t}
            participants={participants}
            toggles={toggles}
            setToggles={setToggles}
            onCancel={closeEdit}
            onSubmit={submitConnect}
            submitting={connect.isPending}
            error={error}
          />
        ) : (
          <EmptyView
            t={t}
            matchLoading={matchLoading}
            dropdownLenders={dropdownLenders}
            allLenders={allLenders}
            matchingCount={matchingLenders.length}
            showAll={showAll}
            setShowAll={setShowAll}
            pickedLenderId={pickedLenderId}
            setPickedLenderId={setPickedLenderId}
            onConnect={() => {
              if (!pickedLenderId) {
                setError("Pick a lender first.");
                return;
              }
              startEdit(null);
            }}
            error={error}
          />
        )}
      </div>

      {connectedLender ? (
        <LenderSendModal
          open={showSend}
          onClose={() => setShowSend(false)}
          loan={loan}
          lender={connectedLender}
        />
      ) : null}
      {connectedLender ? (
        <div style={{ padding: "0 16px 16px" }}>
          <LenderThread loan={loan} lender={connectedLender} />
        </div>
      ) : null}
    </Card>
  );
}

interface EmptyViewProps {
  t: ReturnType<typeof useTheme>["t"];
  matchLoading: boolean;
  dropdownLenders: Lender[];
  allLenders: Lender[];
  matchingCount: number;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  pickedLenderId: string;
  setPickedLenderId: (v: string) => void;
  onConnect: () => void;
  error: string | null;
}

function EmptyView({
  t,
  matchLoading,
  dropdownLenders,
  allLenders,
  matchingCount,
  showAll,
  setShowAll,
  pickedLenderId,
  setPickedLenderId,
  onConnect,
  error,
}: EmptyViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
        Connecting a lender wires this deal to the One-Way Mirror redaction pipeline,
        adds a hide-identity participant row, and promotes stage to LENDER_CONNECTED.
      </div>
      {matchLoading ? (
        <div style={{ fontSize: 12.5, color: t.ink3 }}>Loading matching lenders…</div>
      ) : dropdownLenders.length === 0 ? (
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.5 }}>
          No active lenders {showAll ? "exist" : `service this loan's product yet (${allLenders.length} active overall)`}.
          {!showAll && allLenders.length > 0 ? (
            <>
              {" "}
              <button
                type="button"
                onClick={() => setShowAll(true)}
                style={{
                  all: "unset",
                  cursor: "pointer",
                  color: t.brand,
                  textDecoration: "underline",
                  fontWeight: 700,
                }}
              >
                Show all
              </button>
            </>
          ) : null}{" "}
          Or add one in <strong>Admin → Lenders</strong>.
        </div>
      ) : (
        <>
          <select
            value={pickedLenderId}
            onChange={(e) => setPickedLenderId(e.target.value)}
            style={{
              width: "100%",
              padding: "10px 12px",
              background: t.surface2,
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              color: t.ink,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          >
            <option value="">— pick a lender —</option>
            {dropdownLenders.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
                {l.contact_name ? ` · ${l.contact_name}` : ""}
              </option>
            ))}
          </select>
          {!showAll && matchingCount < allLenders.length ? (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 11.5,
                color: t.ink3,
                textDecoration: "underline",
                alignSelf: "flex-start",
              }}
            >
              Show all {allLenders.length} lenders (currently filtered to product match)
            </button>
          ) : showAll ? (
            <button
              type="button"
              onClick={() => setShowAll(false)}
              style={{
                all: "unset",
                cursor: "pointer",
                fontSize: 11.5,
                color: t.ink3,
                textDecoration: "underline",
                alignSelf: "flex-start",
              }}
            >
              Filter back to product matches
            </button>
          ) : null}
        </>
      )}
      {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onConnect}
          disabled={!pickedLenderId || dropdownLenders.length === 0}
          style={{
            all: "unset",
            cursor: pickedLenderId ? "pointer" : "not-allowed",
            padding: "9px 16px",
            borderRadius: 10,
            background: pickedLenderId ? t.petrol : t.chip,
            color: pickedLenderId ? "#fff" : t.ink4,
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="link" size={12} stroke={3} /> Connect lender
        </button>
      </div>
    </div>
  );
}

interface ConnectedViewProps {
  t: ReturnType<typeof useTheme>["t"];
  lender: Lender;
  ccCount: number;
  bccCount: number;
  onSend: () => void;
  onEditNotify: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}

function ConnectedView({
  t,
  lender,
  ccCount,
  bccCount,
  onSend,
  onEditNotify,
  onDisconnect,
  disconnecting,
}: ConnectedViewProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, letterSpacing: -0.2 }}>
          {lender.name}
        </div>
        {lender.contact_name || lender.contact_email ? (
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 2 }}>
            {lender.contact_name}
            {lender.contact_email ? ` · ${lender.contact_email}` : ""}
            {lender.contact_phone ? ` · ${lender.contact_phone}` : ""}
          </div>
        ) : null}
        {lender.submission_email ? (
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
            Submissions → {lender.submission_email}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 11.5, color: t.ink3 }}>
        Notify list: {ccCount} CC · {bccCount} BCC.{" "}
        <button
          type="button"
          onClick={onEditNotify}
          style={{
            all: "unset",
            cursor: "pointer",
            textDecoration: "underline",
            color: t.brand,
            fontWeight: 700,
          }}
        >
          Edit
        </button>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={onSend}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "9px 16px",
            borderRadius: 10,
            background: t.petrol,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="external" size={12} stroke={3} /> Send package
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={disconnecting}
          style={{
            all: "unset",
            cursor: disconnecting ? "wait" : "pointer",
            padding: "9px 14px",
            borderRadius: 10,
            border: `1px solid ${t.line}`,
            fontSize: 12.5,
            color: t.danger,
            opacity: disconnecting ? 0.6 : 1,
          }}
        >
          {disconnecting ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
    </div>
  );
}

interface NotifyFormProps {
  t: ReturnType<typeof useTheme>["t"];
  participants: LoanParticipant[];
  toggles: Record<string, { cc: boolean; bcc: boolean }>;
  setToggles: (next: Record<string, { cc: boolean; bcc: boolean }>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

function NotifyForm({
  t,
  participants,
  toggles,
  setToggles,
  onCancel,
  onSubmit,
  submitting,
  error,
}: NotifyFormProps) {
  const visible = participants.filter((p) => p.role !== "lender");
  const flip = (id: string, key: "cc" | "bcc") => {
    const cur = toggles[id] ?? { cc: false, bcc: false };
    setToggles({ ...toggles, [id]: { ...cur, [key]: !cur[key] } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.55 }}>
        Pick which broker / super-admin participants should be looped in on every email
        going to or from this lender. Toggles apply to outbound mail going out via the
        Gmail relay; inbound from the lender always gets redacted before broker view
        regardless.
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {visible.length === 0 ? (
          <div style={{ fontSize: 12, color: t.ink3, fontStyle: "italic" }}>
            No broker / super-admin participants on this loan yet — add them in the
            participants table below first.
          </div>
        ) : (
          visible.map((p) => {
            const isClient = p.role === "client";
            const v = toggles[p.id] ?? { cc: false, bcc: false };
            return (
              <div
                key={p.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${t.line}`,
                  background: isClient ? t.surface2 : "transparent",
                  opacity: isClient ? 0.55 : 1,
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink }}>
                    {p.display_name || p.email}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3 }}>
                    {p.role.replace(/_/g, " ")}
                  </div>
                </div>
                {isClient ? (
                  <span style={{ fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
                    clients are never CC&apos;d on lender mail
                  </span>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <PillToggle t={t} label="CC" on={v.cc} onClick={() => flip(p.id, "cc")} />
                    <PillToggle t={t} label="BCC" on={v.bcc} onClick={() => flip(p.id, "bcc")} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "9px 14px",
            borderRadius: 10,
            border: `1px solid ${t.line}`,
            fontSize: 12.5,
            color: t.ink2,
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          style={{
            all: "unset",
            cursor: submitting ? "wait" : "pointer",
            padding: "9px 16px",
            borderRadius: 10,
            background: t.petrol,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          {submitting ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function PillToggle({
  t,
  label,
  on,
  onClick,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${on ? t.petrol : t.line}`,
        background: on ? t.petrolSoft : "transparent",
        color: on ? t.petrol : t.ink3,
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      {label}
    </button>
  );
}
