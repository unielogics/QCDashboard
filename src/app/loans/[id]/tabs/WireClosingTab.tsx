"use client";

// WireClosingTab — closing facts on the left, the wire-fraud caution and the
// title-company hand-off on the right.
//
// Styling lives in globals.css / app-extras.css. The caution is `.warnline`,
// the sheet's amber line for an action with a consequence worth naming.

import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { Panel, WarnLine } from "@/components/ds";
import type { Loan } from "@/lib/types";

export function WireClosingTab({ loan }: { loan: Loan }) {
  return (
    <div className="cg">
      <Panel className="s6" title="Closing details">
        <KV label="Closing date" value={loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) : "—"} />
        <KV label="Loan amount" value={QC_FMT.usd(Number(loan.amount))} bold />
        <KV label="Loan type" value={loan.type.replace("_", " ")} />
        <KV label="Stage" value={loan.stage.replace("_", " ")} />
      </Panel>

      <Panel className="s6" title="Wire instructions">
        <WarnLine>
          <Icon name="shield" size={13} />{" "}
          Confirm wire details by phone before sending.
        </WarnLine>
        <p className="sub mt">
          Wire instructions are coordinated with the title company at closing. The platform stores closing date and amount; the title company supplies the bank, routing, and beneficiary fields directly to closing counsel.
        </p>
      </Panel>
    </div>
  );
}

function KV({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="kv">
      <span className="lbl">{label}</span>
      {/* `.kv b` is the emphasised value; the plain span is the ordinary one.
          The weight difference is the sheet's, not a second scale. */}
      {bold ? <b className="num">{value}</b> : <span className="num">{value}</span>}
    </div>
  );
}
