"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Panel } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useRunUnifiedAction } from "@/hooks/useApi";
import { stageTone, type UnifiedActionDefinition, type UnifiedFileDetail } from "@/lib/unifiedOperator";

export function UnifiedFileWorkspace({ detail, onManageEvidence }: { detail: UnifiedFileDetail; onManageEvidence?: () => void }) {
  const { file, ladder, gate, document_pack: pack } = detail;
  const [action, setAction] = useState<UnifiedActionDefinition | null>(null);
  const executable = detail.actions.filter((item) => item.key === "promote_deal" || item.key === "promote_intake");
  const visibleLadder = file.source_kind === "loan" ? ladder.filter((stage) => stage.family === "funding") : ladder.filter((stage) => stage.family === "working");

  return (
    <>
      <div className="cg unified-workspace">
        <div className="s3">
          <Panel title={file.vertical === "real_estate" ? "Relationship sequence" : "Application sequence"} actions={<span className="sub num">{file.stage.index} of {file.stage.total}</span>}>
            <div className="ladder">
              {visibleLadder.map((stage) => {
                const current = stage.key === file.stage.key;
                const complete = stage.family === file.stage.family && stage.index < file.stage.index;
                return (
                  <div key={`${stage.family}-${stage.key}`}>
                    <div className={`workspace-step${current ? " on" : complete ? " done" : ""}`}>
                      <span className="workspace-step-n">{complete ? <Icon name="check" size={11} /> : stage.index}</span>
                      <span className="grow"><b>{stage.label}</b><span className="sub">{stage.family === "funding" ? "Shared funding ladder" : "Vertical working ladder"}</span></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Panel>
        </div>

        <div className="s6">
          <Panel title="What this file needs" actions={<CellChip tone={gate.ready ? "ok" : "warn"}>{gate.label}</CellChip>}>
            <p className="workspace-copy">Requirements are derived from the {file.vertical_label.toLowerCase()} blueprint. Evidence stays in its source room and is read by reference.</p>
            <RequirementList title="Documents" rows={pack.documents} />
            <RequirementList title="Signatures" rows={pack.signatures} />
          </Panel>

          <Panel className="mt" title={gate.ready ? "Funding handoff" : "Gate and blockers"} actions={<CellChip tone={gate.state === "passed" ? "ok" : gate.ready ? "acc" : "warn"}>{gate.state}</CellChip>}>
            {detail.blockers.length ? detail.blockers.map((blocker) => <div className="req" key={blocker}><span className="ic no">!</span><span>{blocker}</span></div>) : <div className="req"><span className="ic yes">✓</span><span>All current gate requirements are satisfied.</span></div>}
            {executable.map((item) => <Btn key={item.key} variant="pri" className="mt full" onClick={() => setAction(item)}>{item.label}</Btn>)}
          </Panel>

          {detail.linked_sources.length ? (
            <Panel className="mt" title="Linked sources">
              {detail.linked_sources.map((source) => (
                <div className="kv" key={`${source.kind}-${source.id}`}><span>{source.relationship}</span>{source.route ? <Link className="linky" href={source.route}>{source.label} · {source.ref}</Link> : <b>{source.label}</b>}</div>
              ))}
            </Panel>
          ) : null}
        </div>

        <div className="s3">
          <ProfilePanel detail={detail} />
          {file.rep_name || file.dealer_name ? (
            <Panel className="mt rep-panel" title={file.rep_name ? "Opened on the rep desk" : "Dealer attribution"}>
              {file.rep_name ? <div className="kv"><span>Field rep</span><b>{file.rep_name}</b></div> : null}
              {file.case_ref ? <div className="kv"><span>Rep case</span><b className="num">{file.case_ref}</b></div> : null}
              {file.dealer_name ? <div className="kv"><span>Dealer partner</span><b>{file.dealer_name}</b></div> : null}
            </Panel>
          ) : null}
          <Panel className="mt" title="Document room">
            <div className="kv"><span>Bucket</span><b className="num">{file.bucket_id ? file.bucket_id.slice(0, 8) : "Not linked"}</b></div>
            <div className="kv"><span>Received</span><b>{file.document_progress.bucket_progress_label}</b></div>
            {onManageEvidence ? <Btn className="mt full" onClick={onManageEvidence}>Manage linked evidence</Btn> : null}
          </Panel>
          <Panel className="mt" title="Audit trail">
            {(detail.activities.length ? detail.activities : detail.audit).slice(0, 6).map((item) => (
              <div className="kv audit-brief" key={item.id}><span>{"action" in item ? item.action : "Activity"}<small>{item.detail}</small></span><b className="sub num">{formatWhen(item.created_at)}</b></div>
            ))}
            {!detail.activities.length && !detail.audit.length ? <div className="sub">No activity has been recorded.</div> : null}
          </Panel>
        </div>
      </div>

      <UnifiedActionReviewDrawer action={action} onClose={() => setAction(null)} />
    </>
  );
}

function RequirementList({ title, rows }: { title: string; rows: UnifiedFileDetail["document_pack"]["documents"] }) {
  return (
    <div className="workspace-reqs">
      <span className="lbl">{title}</span>
      {rows.map((row) => <div className="req" key={row.key}><span className={`ic ${row.status === "complete" || row.status === "received" ? "yes" : "no"}`}>{row.status === "complete" || row.status === "received" ? "✓" : "!"}</span><span className="grow">{row.label}</span><CellChip tone={row.status === "complete" ? "ok" : row.status === "received" ? "acc" : row.status === "requested" ? "warn" : "mut"}>{row.status}</CellChip></div>)}
      {!rows.length ? <div className="sub">No requirements in this pack.</div> : null}
    </div>
  );
}

function ProfilePanel({ detail }: { detail: UnifiedFileDetail }) {
  const entries = [...Object.entries(detail.profile.person), ...Object.entries(detail.profile.business)].filter(([, value]) => value != null && value !== "");
  return (
    <Panel title={detail.profile.shape.replaceAll("_", " ")}>
      {entries.slice(0, 8).map(([key, value]) => <div className="kv" key={key}><span>{key.replaceAll("_", " ")}</span><b>{String(value)}</b></div>)}
      {!entries.length ? <div className="sub">No profile fields are available.</div> : null}
      {detail.participants.length ? <><span className="lbl mt">Participants</span>{detail.participants.map((person) => <div className="kv" key={`${person.role}-${person.name}`}><span>{person.role}</span><b>{person.name}</b></div>)}</> : null}
    </Panel>
  );
}

export function UnifiedActionReviewDrawer({ action, onClose }: { action: UnifiedActionDefinition | null; onClose: () => void }) {
  const run = useRunUnifiedAction();
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!action) return;
    setError(null);
    try {
      await run.mutateAsync({ action });
      setComplete(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to run this action.");
    }
  }

  function close() {
    setComplete(false);
    setError(null);
    onClose();
  }

  return (
    <Drawer open={action != null} onClose={close} title={complete ? "Action completed" : "Review before running"} sub={action?.label} width="md" closeOnBackdrop={!run.isPending} footer={<><Btn onClick={close}>{complete ? "Done" : "Cancel"}</Btn><span className="sp" />{!complete ? <Btn variant="pri" onClick={confirm} disabled={run.isPending}>{run.isPending ? "Running..." : action?.confirmation_label}</Btn> : null}</>}>
      {complete ? <div className="completed-state"><span className="botmark pet"><Icon name="check" size={22} /></span><h3>{action?.label} completed</h3><p className="sub">The logical file and audit projection are refreshing.</p></div> : (
        <div className="grid">
          <div className="hintbox"><b>Effects</b><div className="sub">This action runs against the live domain record and writes the corresponding audit activity.</div></div>
          {action?.effects.map((effect) => <div className="req" key={effect}><span className="ic yes">✓</span><span>{effect}</span></div>)}
          <div className="kv"><span>Actor</span><b>Current signed-in operator</b></div>
          <div className="kv"><span>Execution</span><b>Immediately after confirmation</b></div>
          <div className="kv"><span>Reversible</span><b>{action?.reversible ? "Yes" : "No"}</b></div>
          {error ? <div className="warnline">{error}</div> : null}
        </div>
      )}
    </Drawer>
  );
}

function formatWhen(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
