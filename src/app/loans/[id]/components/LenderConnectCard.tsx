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
//
// Restyled onto the plain-CSS design system. The tab is now a STACK of
// flat panels rather than one card wrapping three more — the packages
// panel and the lender thread are siblings, not nested cards.

import { useMemo, useState } from "react";
import { Btn, CellChip, Empty, Linky, Panel, Select, StatusLine, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
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
import { LenderPackagesPanel } from "./LenderPackagesPanel";
import { LenderThread } from "./LenderThread";

interface Props {
  loan: Loan;
}

export function LenderConnectCard({ loan }: Props) {
  const confirmAction = useConfirmAction();
  const profile = useActiveProfile();
  const isInternal = profile.role === Role.SUPER_ADMIN || profile.role === Role.LOAN_EXEC;
  const canManageConnection = profile.role === Role.SUPER_ADMIN;

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
    const confirmed = await confirmAction({
      title: "Disconnect lender",
      body: "The hidden lender participant will be removed. The funding stage will remain unchanged.",
      confirmLabel: "Disconnect lender",
      tone: "danger",
      reversible: true,
    });
    if (!confirmed) return;
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

  if (!isInternal) {
    return null;
  }

  return (
    <div className="grid">
      <Panel
        title="Lender connection"
        actions={
          connectedLender ? (
            <CellChip tone="ok">Connected</CellChip>
          ) : (
            <CellChip tone="warn">Not connected</CellChip>
          )
        }
        bodyClass="grid"
      >
        {connectedLender ? (
          <ConnectedView
            lender={connectedLender}
            ccCount={summary.cc}
            bccCount={summary.bcc}
            onSend={() => setShowSend(true)}
            onEditNotify={() => startEdit(connectedLender)}
            onDisconnect={handleDisconnect}
            disconnecting={disconnect.isPending}
            canManageConnection={canManageConnection}
          />
        ) : editingNotify ? (
          <NotifyForm
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
            onSend={() => setShowSend(true)}
            canManageConnection={canManageConnection}
            error={error}
          />
        )}
      </Panel>

      <LenderSendModal
        open={showSend}
        onClose={() => setShowSend(false)}
        loan={loan}
        primaryLender={connectedLender ?? null}
      />
      <LenderPackagesPanel loan={loan} />
      {connectedLender ? <LenderThread loan={loan} lender={connectedLender} /> : null}
    </div>
  );
}

interface EmptyViewProps {
  matchLoading: boolean;
  dropdownLenders: Lender[];
  allLenders: Lender[];
  matchingCount: number;
  showAll: boolean;
  setShowAll: (v: boolean) => void;
  pickedLenderId: string;
  setPickedLenderId: (v: string) => void;
  onConnect: () => void;
  onSend: () => void;
  canManageConnection: boolean;
  error: string | null;
}

function EmptyView({
  matchLoading,
  dropdownLenders,
  allLenders,
  matchingCount,
  showAll,
  setShowAll,
  pickedLenderId,
  setPickedLenderId,
  onConnect,
  onSend,
  canManageConnection,
  error,
}: EmptyViewProps) {
  return (
    <div className="grid g10">
      {canManageConnection ? (
        <>
          <div>
            Connecting a lender wires this deal to the One-Way Mirror redaction pipeline,
            adds a hide-identity participant row, and promotes stage to LENDER_CONNECTED.
          </div>
          {matchLoading ? (
            <Sub>Loading matching lenders…</Sub>
          ) : dropdownLenders.length === 0 ? (
            <div className="sub">
              No active lenders {showAll ? "exist" : `service this loan's product yet (${allLenders.length} active overall)`}.
              {!showAll && allLenders.length > 0 ? (
                <>
                  {" "}
                  <Linky onClick={() => setShowAll(true)}>Show all</Linky>
                </>
              ) : null}{" "}
              Or add one in <strong>Admin → Lenders</strong>.
            </div>
          ) : (
            <>
              <Select
                grow
                value={pickedLenderId}
                onChange={(e) => setPickedLenderId(e.target.value)}
              >
                <option value="">— pick a lender —</option>
                {dropdownLenders.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.contact_name ? ` · ${l.contact_name}` : ""}
                  </option>
                ))}
              </Select>
              {!showAll && matchingCount < allLenders.length ? (
                <div>
                  <Linky onClick={() => setShowAll(true)}>
                    Show all {allLenders.length} lenders (currently filtered to product match)
                  </Linky>
                </div>
              ) : showAll ? (
                <div>
                  <Linky onClick={() => setShowAll(false)}>Filter back to product matches</Linky>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      <div className="row end">
        <Btn onClick={onSend} disabled={allLenders.length === 0}>
          <Icon name="shield" size={12} stroke={3} /> Send package
        </Btn>
        {canManageConnection ? (
          <Btn
            variant="pri"
            onClick={onConnect}
            disabled={!pickedLenderId || dropdownLenders.length === 0}
          >
            <Icon name="link" size={12} stroke={3} /> Connect lender
          </Btn>
        ) : null}
      </div>
    </div>
  );
}

interface ConnectedViewProps {
  lender: Lender;
  ccCount: number;
  bccCount: number;
  onSend: () => void;
  onEditNotify: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
  canManageConnection: boolean;
}

function ConnectedView({
  lender,
  ccCount,
  bccCount,
  onSend,
  onEditNotify,
  onDisconnect,
  disconnecting,
  canManageConnection,
}: ConnectedViewProps) {
  return (
    <div className="grid g10">
      <div>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{lender.name}</div>
        {lender.contact_name || lender.contact_email ? (
          <Sub>
            {lender.contact_name}
            {lender.contact_email ? ` · ${lender.contact_email}` : ""}
            {lender.contact_phone ? ` · ${lender.contact_phone}` : ""}
          </Sub>
        ) : null}
        {lender.submission_email ? (
          <div className="sub">Submissions → {lender.submission_email}</div>
        ) : null}
      </div>
      {canManageConnection ? (
        <div className="sub">
          Notify list: {ccCount} CC · {bccCount} BCC.{" "}
          <Linky onClick={onEditNotify}>Edit</Linky>
        </div>
      ) : null}
      <div className="row">
        <Btn variant="pri" onClick={onSend}>
          <Icon name="external" size={12} stroke={3} /> Send package
        </Btn>
        {canManageConnection ? (
          <Btn className="danger" onClick={onDisconnect} disabled={disconnecting}>
            {disconnecting ? "Disconnecting…" : "Disconnect"}
          </Btn>
        ) : null}
      </div>
    </div>
  );
}

interface NotifyFormProps {
  participants: LoanParticipant[];
  toggles: Record<string, { cc: boolean; bcc: boolean }>;
  setToggles: (next: Record<string, { cc: boolean; bcc: boolean }>) => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitting: boolean;
  error: string | null;
}

function NotifyForm({
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
    <div className="grid g10">
      <div>
        Pick which broker / super-admin participants should be looped in on every email
        going to or from this lender. Toggles apply to outbound mail going out via the
        Gmail relay; inbound from the lender always gets redacted before broker view
        regardless.
      </div>
      <div className="grid g6">
        {visible.length === 0 ? (
          <Empty>
            No broker / super-admin participants on this loan yet — add them in the
            participants table below first.
          </Empty>
        ) : (
          visible.map((p) => {
            const isClient = p.role === "client";
            const v = toggles[p.id] ?? { cc: false, bcc: false };
            return (
              <div
                key={p.id}
                className="itemrow"
                // A client row is present but untouchable. The dimming is the
                // state marker; no class owns opacity, so it stays here.
                style={isClient ? { opacity: 0.55 } : undefined}
              >
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{p.display_name || p.email}</div>
                  <div className="sub">{p.role.replace(/_/g, " ")}</div>
                </div>
                {isClient ? (
                  <Sub>clients are never CC&apos;d on lender mail</Sub>
                ) : (
                  <div className="row">
                    <PillToggle label="CC" on={v.cc} onClick={() => flip(p.id, "cc")} />
                    <PillToggle label="BCC" on={v.bcc} onClick={() => flip(p.id, "bcc")} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      <div className="row end">
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="pri" onClick={onSubmit} disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Btn>
      </div>
    </div>
  );
}

function PillToggle({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  // A two-state toggle, not a navigation control — `aria-pressed` is what
  // tells a screen reader that CC is currently on. `.btn.tone-pet` rather
  // than a bare `.c-pet`, which `.btn:hover` would out-specify.
  return (
    <Btn size="sm" aria-pressed={on} className={on ? "tone-pet" : undefined} onClick={onClick}>
      {label}
    </Btn>
  );
}
