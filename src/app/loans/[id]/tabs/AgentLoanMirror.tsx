"use client";

// AgentLoanMirror — the agent-facing read-only view of a funding file.
//
// Styling lives in globals.css / app-extras.css. The three status tiles sit on
// `.cg` (the 12-column page grid) and the stat tiles carry `.kpi.tone-*`, so a
// tile that is asking for attention is tinted rather than badged: this band is
// scanned, and a badge inside each tile means reading every tile to find the
// one that matters.

import Link from "next/link";
import { Pill, StageBadge, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import { Callout, ItemRow, Kpi, KpiRow, Panel } from "@/components/ds";
import type { Activity, Document, Loan } from "@/lib/types";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"];

export function AgentLoanMirror({
  loan,
  docs,
  activity,
}: {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
}) {
  const stageIndex = STAGE_KEYS.indexOf(loan.stage);
  const receivedDocs = docs.filter((doc) => doc.status === "received" || doc.status === "verified").length;
  const openDocs = docs.filter((doc) => doc.status !== "verified");
  const recent = activity.slice(0, 5);

  return (
    <div className="cg">
      <Panel
        className="s12"
        title="Agent Funding Mirror"
        actions={
          <Link href={`/clients/${loan.client_id}`} className="btn">
            <Icon name="clients" size={14} />
            Client file
          </Link>
        }
      >
        <h2>Funding status for your client.</h2>
        <p className="sub">
          This view keeps client and transaction coordination visible to the agent while underwriting,
          lender packaging, and internal calculations stay with the Funding Team.
        </p>
      </Panel>

      <Panel className="s4" title="Status">
        <div className="row">
          <StageBadge stage={stageIndex} />
          <Pill>{loan.type.replace(/_/g, " ")}</Pill>
        </div>
        <KpiRow className="mt">
          <Kpi label="Loan amount" value={QC_FMT.short(Number(loan.amount))} prose />
          <Kpi
            label="Close"
            value={loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Unset"}
            prose
          />
        </KpiRow>
      </Panel>

      <Panel className="s4" title="Client Conditions">
        <KpiRow>
          <Kpi label="Docs ready" value={`${receivedDocs}/${docs.length || 0}`} prose />
          {/* The tile carries the state, not a badge inside it. */}
          <Kpi
            label="Open items"
            value={openDocs.length}
            prose
            className={openDocs.length ? "tone-warn" : "tone-ok"}
          />
        </KpiRow>
        <p className="sub mt">
          Use this to keep your buyer or seller updated. The Funding Team owns review and approval.
        </p>
      </Panel>

      <Panel className="s4" title="Agent Next Move">
        <Callout
          tone={openDocs.length ? "warn" : "ok"}
          icon={<Icon name={openDocs.length ? "doc" : "check"} size={15} />}
        >
          {openDocs.length
            ? "Help the client gather open documents and keep transaction parties aligned."
            : "Keep the client informed while funding moves the file through lender milestones."}
        </Callout>
      </Panel>

      <Panel className="s7" title="Visible Document Items">
        {openDocs.length === 0 ? (
          <Callout tone="ok" icon={<Icon name="check" size={15} />}>
            No open client-facing document items.
          </Callout>
        ) : (
          <div className="grid g8">
            {openDocs.slice(0, 8).map((doc) => (
              <ItemRow
                key={doc.id}
                right={<VerifiedBadge kind={doc.status === "flagged" ? "flagged" : "pending"} />}
              >
                <div className="trunc"><strong>{doc.name}</strong></div>
                <div className="sub">{doc.category ?? "Document"}</div>
              </ItemRow>
            ))}
          </div>
        )}
      </Panel>

      <Panel className="s5" title="Recent Updates">
        {recent.length === 0 ? (
          <span className="sub">No recent updates yet.</span>
        ) : (
          <div className="grid g10">
            {recent.map((item) => (
              <div key={item.id} className="row top">
                <Icon name="audit" size={13} />
                <div className="grow">
                  <div>{item.summary}</div>
                  <div className="sub">
                    {new Date(item.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

    </div>
  );
}
