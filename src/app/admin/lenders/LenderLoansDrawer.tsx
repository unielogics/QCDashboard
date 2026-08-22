"use client";

// Right-side drawer surfaced from a lender row on the Lenders tab.
// Lists every loan currently connected to this lender PLUS every
// loan that's connectable (stage in PREQUALIFIED/COLLECTING_DOCS,
// product matches). Each row links into the loan page with a focus
// hint so the LenderConnectCard auto-scrolls into view.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css). The hand-rolled fixed <aside> is now
// ds/Drawer — the app's one dialog shape — which additionally brings Escape to
// close, a body scroll lock, and focus restored to whatever opened it. None of
// those existed on the hand-rolled sheet. The sheet was edge-anchored and the
// Drawer is centred; see the migration notes.
//   hand-rolled section cards → Panel (title + sub carry the count and hint)
//   hand-rolled link rows     → `a.pick`, the selectable list row
//   status Pill               → CellChip tone

import Link from "next/link";
import { CellChip, Panel, Sub } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useLenderLoans } from "@/hooks/useApi";
import type { Lender, LenderLoanSummary } from "@/lib/types";

interface Props {
  lender: Lender | null;
  onClose: () => void;
}

export function LenderLoansDrawer({ lender, onClose }: Props) {
  const { data, isLoading, isError, error } = useLenderLoans(lender?.id ?? null);

  if (!lender) return null;

  return (
    <Drawer
      open
      onClose={onClose}
      width="md"
      // The visible title is the lender's name; the announced name of the
      // dialog has to say what the dialog IS.
      ariaLabel="Lender loans"
      title={lender.name}
      sub={
        lender.contact_email || lender.submission_email
          ? `Lender loans · ${lender.contact_email || lender.submission_email}`
          : "Lender loans"
      }
      bodyClass="grid"
    >
      {isLoading ? (
        <Panel><Sub>Loading loans…</Sub></Panel>
      ) : isError ? (
        <Panel>
          <div className="statusline c-bad">
            Couldn&rsquo;t load loans: {(error as Error)?.message ?? "Unknown error"}
          </div>
        </Panel>
      ) : data ? (
        <>
          <Section
            title="Connected"
            hint="Loans where this lender is already on file."
            loans={data.connected}
            emptyText="No loans connected to this lender yet."
          />
          <Section
            title="Connectable"
            hint="Loans in PREQUALIFIED or COLLECTING_DOCS whose product matches this lender."
            loans={data.connectable}
            emptyText="No matching loans waiting for connection."
          />
        </>
      ) : null}
    </Drawer>
  );
}

function Section({
  title,
  hint,
  loans,
  emptyText,
}: {
  title: string;
  hint: string;
  loans: LenderLoanSummary[];
  emptyText: string;
}) {
  return (
    <Panel title={`${title} (${loans.length})`} sub={hint} bodyClass="grid g6">
      {loans.length === 0 ? (
        <Sub>{emptyText}</Sub>
      ) : (
        loans.map((l) => (
          <Link
            key={l.id}
            href={`/loans/${l.id}?focus=lender-connect`}
            className="pick"
          >
            <div className="grow">
              <b>{l.address || l.deal_id}</b>
              <div className="sub">{l.deal_id} · {l.type} · {l.stage}</div>
            </div>
            {l.connected ? (
              <CellChip tone="ok">Connected</CellChip>
            ) : (
              <CellChip tone="warn">Connectable</CellChip>
            )}
            <Icon name="chevR" size={12} stroke={3} />
          </Link>
        ))
      )}
    </Panel>
  );
}
