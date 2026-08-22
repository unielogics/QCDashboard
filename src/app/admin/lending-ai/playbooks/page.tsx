"use client";

// Super Admin / UW → Lending AI Settings → Playbooks
// One page. Loan-product picker on top, four stage buckets below
// (Prequalification / Term Sheet / Underwriting / Closing). Advanced
// disclosure for escalations / communication / raw conditions.
//
// Replaces the earlier 5-tab layout. The data model is unchanged —
// requirements still carry blocks_stage; this UI just buckets them.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// Every mutation, permission predicate, confirm() and tooltip survives; only
// the surface vocabulary moved:
//   local OutcomeNote helper   → Note (`.note` is the petrol explanatory block)
//   product picker buttons     → Seg as="tabs" (it switches which playbook you
//                                are looking at, so tablist is correct)
//   local StatusPill helper    → CellChip + `.caps`
//   hard-coded amber blocks    → Callout tone="warn" / Panel, which take their
//                                colour from the sheet instead of hex literals
//   "▸ Advanced" text toggle   → `.disc` / `.disc-h` / `.disc-b`, a real button
//   local btnPrimary/Secondary → Btn
// The page no longer sets its own padding or max-width — the shell's
// `.content` owns both.

import { useEffect, useMemo, useState } from "react";
import { Btn, Callout, CellChip, Note, Panel, Row, Seg, Sub, Textarea, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { LendingAIHeader } from "@/components/LendingAIHeader";
import { StageChecklist } from "@/components/StageChecklist";
import { AIPreviewPanel } from "@/components/AIPreviewPanel";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";
import {
  isAINotDeployed,
  useConfirmInferredDeps,
  useDeleteLendingRequirement,
  useDuplicatePlatformPlaybook,
  useFundingMetaRules,
  useInferPlaybookDeps,
  useLendingPlaybookRequirements,
  useLendingPlaybooks,
  usePatchFundingMetaRules,
  usePublishLendingPlaybook,
  useUpdateLendingPlaybook,
  useUpsertLendingRequirement,
  type LendingPlaybook,
  type PlaybookRequirement,
} from "@/hooks/useApi";

const PRODUCT_LABELS: Record<string, string> = {
  dscr_purchase: "DSCR Purchase",
  dscr_refi: "DSCR Refinance",
  bridge: "Bridge",
  fix_flip: "Fix & Flip",
  construction: "Construction",
};


export default function LendingPlaybooksPage() {
  const { data: allLoanProducts = [], error: lpError } = useLendingPlaybooks("loan_product");

  // For each product key, prefer the funding-owned version; fall back
  // to the platform default (read-only).
  const byProduct = useMemo(() => {
    const out: Record<string, { funding: LendingPlaybook | null; platform: LendingPlaybook | null }> = {};
    for (const p of allLoanProducts) {
      if (!p.product_key) continue;
      out[p.product_key] = out[p.product_key] || { funding: null, platform: null };
      if (p.owner_type === "funding") {
        const cur = out[p.product_key].funding;
        if (!cur || p.version > cur.version) out[p.product_key].funding = p;
      } else if (p.owner_type === "platform") {
        out[p.product_key].platform = p;
      }
    }
    return out;
  }, [allLoanProducts]);

  const productKeys = Object.keys(byProduct);
  const [activeKey, setActiveKey] = useState<string>("");
  useEffect(() => {
    if (!activeKey && productKeys.length > 0) setActiveKey(productKeys[0]);
  }, [productKeys, activeKey]);

  const slot = byProduct[activeKey];
  const activePb = slot?.funding ?? slot?.platform ?? null;

  return (
    <div className="grid">
      <LendingAIHeader
        title="Lending Playbooks"
        subtitle="What the AI collects on every loan, organized by the stage that item blocks. Funding-required items are locked from the agent side; everything else can be overridden per agent or per client."
      />

      {isAINotDeployed(lpError) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : null}

      <div className="grid cols-auto">
        <OutcomeNote
          icon="doc"
          title="External document items"
          body="Create requested document rows and document-due calendar events when the loan checklist materializes."
        />
        <OutcomeNote
          icon="shieldChk"
          title="Internal funding items"
          body="Create AI tasks for the funding team, such as appraisal, title, insurance, or PFS follow-up."
        />
        <OutcomeNote
          icon="cal"
          title="AI next actions"
          body="Loan summaries can also emit calendar events or approval-required AI tasks based on ownership."
        />
      </div>

      {/* Loan product picker */}
      {productKeys.length > 0 ? (
        <Row>
          <Seg
            as="tabs"
            ariaLabel="Loan product"
            value={activeKey}
            onChange={setActiveKey}
            options={productKeys.map((key) => ({
              value: key,
              label: PRODUCT_LABELS[key] || key,
            }))}
          />
        </Row>
      ) : null}

      {activePb ? (
        <PlaybookPanel
          playbook={activePb}
          slot={slot}
          productKey={activeKey}
        />
      ) : null}

      <AIPreviewPanel mode="plan" />
    </div>
  );
}


function PlaybookPanel({
  playbook, slot, productKey: _productKey,
}: {
  playbook: LendingPlaybook;
  slot: { funding: LendingPlaybook | null; platform: LendingPlaybook | null } | undefined;
  /** Carried from the picker. Unused by the render today; kept so the panel
   *  keeps the identity of the product it was opened for. */
  productKey: string;
}) {
  const { data: reqs = [] } = useLendingPlaybookRequirements(playbook.id);
  const upsert = useUpsertLendingRequirement(playbook.id);
  const del = useDeleteLendingRequirement(playbook.id);
  const update = useUpdateLendingPlaybook();
  const publish = usePublishLendingPlaybook();
  const dup = useDuplicatePlatformPlaybook();

  const inferDeps = useInferPlaybookDeps(playbook.id);
  const confirmInferred = useConfirmInferredDeps(playbook.id);

  const isPlatform = playbook.owner_type === "platform";
  const fundingExists = !!slot?.funding;
  const editable = !isPlatform && playbook.status === "draft";

  // Rows that have inferred suggestions waiting for operator review.
  const pendingReview = useMemo(
    () => reqs.filter(r => (r.inferred_depends_on || []).length > 0 && !r.deps_confirmed),
    [reqs],
  );

  return (
    <Panel
      title={
        <>
          {playbook.name}{" "}
          <StatusPill status={playbook.status} version={playbook.version} />
        </>
      }
      sub={isPlatform ? "Platform default — read-only" : "Funding-owned"}
      bodyClass="grid"
      actions={
        <>
          {editable && reqs.length > 0 ? (
            <Btn
              onClick={() => {
                if (confirm("Run AI inference to suggest task dependencies + grouping for this playbook? This overwrites previous suggestions but never your manual depends_on / parent_key.")) {
                  inferDeps.mutate();
                }
              }}
              disabled={inferDeps.isPending}
              title="Ask Claude to suggest task dependencies + parent grouping. Suggestions land in a review panel below — nothing is applied until you confirm per row."
            >
              {inferDeps.isPending ? "Inferring…" : "Run AI inference"}
            </Btn>
          ) : null}
          {isPlatform && !fundingExists ? (
            <Btn variant="pri" onClick={() => dup.mutate({ platformPlaybookId: playbook.id })}>
              {dup.isPending ? "Duplicating…" : "Duplicate to edit"}
            </Btn>
          ) : null}
          {!isPlatform && playbook.status === "draft" ? (
            <Btn variant="pri" onClick={() => publish.mutate(playbook.id)}>
              {publish.isPending ? "Publishing…" : "Publish"}
            </Btn>
          ) : null}
          {!isPlatform && playbook.status === "published" ? (
            <Btn
              onClick={() => update.mutate({ id: playbook.id, fork: true })}
              title="Fork a new draft from this version"
            >
              {update.isPending ? "Forking…" : "Fork to draft"}
            </Btn>
          ) : null}
        </>
      }
    >
      {isPlatform ? (
        <Callout tone="warn" icon={<Icon name="lock" size={14} stroke={2.4} />}>
          Platform defaults are read-only. Click <strong>Duplicate to edit</strong> above to fork a
          funding-owned copy you can customize.
        </Callout>
      ) : null}

      <StageChecklist
        requirements={reqs}
        onUpsert={async (req) => upsert.mutateAsync(req)}
        onDelete={async (id) => del.mutateAsync(id)}
        readOnly={isPlatform || playbook.status === "published"}
      />

      {editable && pendingReview.length > 0 ? (
        <ReviewSuggestionsPanel
          rows={pendingReview}
          allRequirements={reqs}
          onAccept={(key) => confirmInferred.mutate({ requirement_key: key, accept_depends_on: true, accept_parent_key: true })}
          onDismiss={(key) => confirmInferred.mutate({ requirement_key: key, accept_depends_on: false, accept_parent_key: false })}
        />
      ) : null}

      {/* Advanced disclosure — escalations / communication / raw conditions */}
      <Advanced playbookId={playbook.id} />
    </Panel>
  );
}

function ReviewSuggestionsPanel({
  rows, allRequirements, onAccept, onDismiss,
}: {
  rows: PlaybookRequirement[];
  allRequirements: PlaybookRequirement[];
  onAccept: (requirement_key: string) => void;
  onDismiss: (requirement_key: string) => void;
}) {
  const labelOf = (k: string) => allRequirements.find(r => r.requirement_key === k)?.label || k;
  // Not a nested Panel: this block already sits inside the playbook's panel
  // body, and a panel inside a panel is the card-in-card nesting the design
  // system exists to remove. The warn callout carries the heading instead.
  return (
    <div className="grid g8">
      <Callout tone="warn" icon={<Icon name="bolt" size={14} stroke={2.4} />}>
        <b>AI suggestions — {rows.length} row{rows.length === 1 ? "" : "s"} pending review</b>
        <div className="sub">
          Claude proposed dependencies + parent groupings based on each task&apos;s objective and
          completion criteria. Nothing is applied to the live playbook until you click{" "}
          <strong>Accept</strong> per row.
        </div>
      </Callout>
      {rows.map(r => (
        <div key={r.id} className="itemrow">
          <div className="grow">
            <b>{r.label}</b>
            {(r.inferred_depends_on || []).length > 0 ? (
              <div className="sub">
                Suggest <strong>after</strong>: {(r.inferred_depends_on || []).map(labelOf).join(", ")}
              </div>
            ) : null}
            {r.parent_key && !(r.depends_on || []).length ? (
              <div className="sub">
                Suggest grouping <strong>under</strong>: {labelOf(r.parent_key)}
              </div>
            ) : null}
          </div>
          <Row>
            <Btn variant="pri" size="sm" onClick={() => onAccept(r.requirement_key)}>Accept</Btn>
            <Btn size="sm" onClick={() => onDismiss(r.requirement_key)}>Dismiss</Btn>
          </Row>
        </div>
      ))}
    </div>
  );
}


function OutcomeNote({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <Note>
      <Icon name={icon} size={16} />
      <div>
        <b>{title}</b>
        <div className="sub">{body}</div>
      </div>
    </Note>
  );
}


function StatusPill({ status, version }: { status: string; version: number }) {
  const pub = status === "published";
  return (
    <CellChip tone={pub ? "ok" : "warn"} className="caps">
      {status} v{version}
    </CellChip>
  );
}


function Advanced({ playbookId: _playbookId }: { playbookId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cx("disc", open && "on")}>
      <button
        type="button"
        className="disc-h"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        <span className="lbl">
          Advanced — escalation rules · borrower communication tone · raw conditions
        </span>
        <span aria-hidden="true">{open ? "▾" : "▸"}</span>
      </button>
      {open ? (
        <div className="disc-b grid">
          <EscalationEditor />
          <CommunicationEditor />
        </div>
      ) : null}
    </div>
  );
}


function EscalationEditor() {
  const { data, isLoading } = useFundingMetaRules("escalation");
  const patch = usePatchFundingMetaRules("escalation");
  const [text, setText] = useState<string>("");
  useEffect(() => { if (data) setText(JSON.stringify(data.rules || {}, null, 2)); }, [data]);

  return (
    <div className="grid g6">
      <b>Underwriter escalation rules</b>
      <Sub>
        When the AI should escalate vs. continue collecting (DSCR below min, LTV exceeds max, doc contradiction, etc.).
      </Sub>
      {isLoading ? (
        <Sub>Loading…</Sub>
      ) : (
        <>
          <Textarea
            className="mono"
            aria-label="Escalation rules, raw JSON"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
          />
          <Row>
            <Btn
              variant="pri"
              onClick={async () => {
                try { await patch.mutateAsync(JSON.parse(text || "{}")); }
                catch { alert("Invalid JSON"); }
              }}
              disabled={patch.isPending}
            >
              {patch.isPending ? "Saving…" : "Save escalation rules"}
            </Btn>
          </Row>
        </>
      )}
    </div>
  );
}


function CommunicationEditor() {
  const { data, isLoading } = useFundingMetaRules("communication");
  const patch = usePatchFundingMetaRules("communication");
  const [text, setText] = useState<string>("");
  useEffect(() => { if (data) setText(JSON.stringify(data.rules || {}, null, 2)); }, [data]);

  return (
    <div className="grid g6">
      <b>Borrower communication tone + templates</b>
      <Sub>
        Tone, opening line templates, when to copy the agent on a borrower message.
      </Sub>
      {isLoading ? (
        <Sub>Loading…</Sub>
      ) : (
        <>
          <Textarea
            className="mono"
            aria-label="Communication rules, raw JSON"
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
          />
          <Row>
            <Btn
              variant="pri"
              onClick={async () => {
                try { await patch.mutateAsync(JSON.parse(text || "{}")); }
                catch { alert("Invalid JSON"); }
              }}
              disabled={patch.isPending}
            >
              {patch.isPending ? "Saving…" : "Save communication rules"}
            </Btn>
          </Row>
        </>
      )}
    </div>
  );
}
