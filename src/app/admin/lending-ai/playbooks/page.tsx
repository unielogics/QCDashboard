"use client";

// Super Admin / UW → Lending AI Settings → Playbooks
// One page. Loan-product picker on top, four stage buckets below
// (Prequalification / Term Sheet / Underwriting / Closing). Advanced
// disclosure for escalations / communication / raw conditions.
//
// Replaces the earlier 5-tab layout. The data model is unchanged —
// requirements still carry blocks_stage; this UI just buckets them.

import { useEffect, useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <LendingAIHeader
        title="Lending Playbooks"
        subtitle="What the AI collects on every loan, organized by the stage that item blocks. Funding-required items are locked from the agent side; everything else can be overridden per agent or per client."
      />

      {isAINotDeployed(lpError) ? (
        <AINotDeployedBanner surface="Lending AI" />
      ) : null}

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: 10,
        marginBottom: 20,
      }}>
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
      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {productKeys.map(key => (
          <button
            key={key}
            onClick={() => setActiveKey(key)}
            style={{
              padding: "8px 14px", fontSize: 13, fontWeight: 600,
              borderRadius: 8, border: `1px solid ${activeKey === key ? t.petrol : t.line}`,
              background: activeKey === key ? t.petrol : t.surface,
              color: activeKey === key ? "#fff" : t.ink,
              cursor: "pointer",
            }}
          >
            {PRODUCT_LABELS[key] || key}
          </button>
        ))}
      </div>

      {activePb ? (
        <PlaybookPanel
          playbook={activePb}
          slot={slot}
          productKey={activeKey}
        />
      ) : null}

      <div style={{ marginTop: 20 }}>
        <AIPreviewPanel mode="plan" />
      </div>
    </div>
  );
}


function PlaybookPanel({
  playbook, slot, productKey,
}: {
  playbook: LendingPlaybook;
  slot: { funding: LendingPlaybook | null; platform: LendingPlaybook | null } | undefined;
  productKey: string;
}) {
  const { t } = useTheme();
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
    <Card pad={20}>
      {/* Status bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <SectionLabel>{playbook.name}</SectionLabel>
        <StatusPill status={playbook.status} version={playbook.version} t={t} />
        <span style={{ fontSize: 11, color: t.ink3, marginLeft: 4 }}>
          {isPlatform ? "Platform default — read-only" : "Funding-owned"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {editable && reqs.length > 0 ? (
            <button
              onClick={() => {
                if (confirm("Run AI inference to suggest task dependencies + grouping for this playbook? This overwrites previous suggestions but never your manual depends_on / parent_key.")) {
                  inferDeps.mutate();
                }
              }}
              disabled={inferDeps.isPending}
              style={btnSecondary(t)}
              title="Ask Claude to suggest task dependencies + parent grouping. Suggestions land in a review panel below — nothing is applied until you confirm per row."
            >
              {inferDeps.isPending ? "Inferring…" : "Run AI inference"}
            </button>
          ) : null}
          {isPlatform && !fundingExists ? (
            <button
              onClick={() => dup.mutate({ platformPlaybookId: playbook.id })}
              style={btnPrimary(t)}
            >
              {dup.isPending ? "Duplicating…" : "Duplicate to edit"}
            </button>
          ) : null}
          {!isPlatform && playbook.status === "draft" ? (
            <button
              onClick={() => publish.mutate(playbook.id)}
              style={btnPrimary(t)}
            >
              {publish.isPending ? "Publishing…" : "Publish"}
            </button>
          ) : null}
          {!isPlatform && playbook.status === "published" ? (
            <button
              onClick={() => update.mutate({ id: playbook.id, fork: true })}
              style={btnSecondary(t)}
              title="Fork a new draft from this version"
            >
              {update.isPending ? "Forking…" : "Fork to draft"}
            </button>
          ) : null}
        </div>
      </div>

      {isPlatform ? (
        <div style={{
          padding: 12, marginBottom: 20, borderRadius: 8,
          background: "#fff8e0", border: "1px solid #d4a02488",
          fontSize: 12, color: "#7a5e22", display: "flex", gap: 8, alignItems: "flex-start",
        }}>
          <Icon name="lock" size={14} stroke={2.4} />
          <span>Platform defaults are read-only. Click <strong>Duplicate to edit</strong> above to fork a funding-owned copy you can customize.</span>
        </div>
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
          t={t}
        />
      ) : null}

      {/* Advanced disclosure — escalations / communication / raw conditions */}
      <Advanced playbookId={playbook.id} t={t} />
    </Card>
  );
}

function ReviewSuggestionsPanel({
  rows, allRequirements, onAccept, onDismiss, t,
}: {
  rows: PlaybookRequirement[];
  allRequirements: PlaybookRequirement[];
  onAccept: (requirement_key: string) => void;
  onDismiss: (requirement_key: string) => void;
  t: ReturnType<typeof useTheme>["t"];
}) {
  const labelOf = (k: string) => allRequirements.find(r => r.requirement_key === k)?.label || k;
  return (
    <div style={{
      marginTop: 20,
      padding: 14,
      borderRadius: 10,
      border: `1px solid #d4a02488`,
      background: "#fffae0",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <Icon name="bolt" size={14} stroke={2.4} />
        <span style={{ fontSize: 13, fontWeight: 800, color: "#7a5e22" }}>
          AI suggestions — {rows.length} row{rows.length === 1 ? "" : "s"} pending review
        </span>
      </div>
      <div style={{ fontSize: 12, color: "#7a5e22", marginBottom: 10 }}>
        Claude proposed dependencies + parent groupings based on each task&apos;s objective and completion criteria.
        Nothing is applied to the live playbook until you click <strong>Accept</strong> per row.
      </div>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map(r => (
          <div key={r.id} style={{
            background: t.surface,
            border: `1px solid ${t.line}`,
            borderRadius: 8,
            padding: 10,
            display: "grid",
            gap: 6,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{r.label}</div>
            {(r.inferred_depends_on || []).length > 0 ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                Suggest <strong>after</strong>: {(r.inferred_depends_on || []).map(labelOf).join(", ")}
              </div>
            ) : null}
            {r.parent_key && !(r.depends_on || []).length ? (
              <div style={{ fontSize: 12, color: t.ink3 }}>
                Suggest grouping <strong>under</strong>: {labelOf(r.parent_key)}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button onClick={() => onAccept(r.requirement_key)} style={pillAccept(t)}>Accept</button>
              <button onClick={() => onDismiss(r.requirement_key)} style={pillDismiss(t)}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function pillAccept(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "4px 12px", fontSize: 12, fontWeight: 700,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}
function pillDismiss(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "4px 12px", fontSize: 12, fontWeight: 700,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: "transparent", color: t.ink3, cursor: "pointer",
  } as const;
}


function OutcomeNote({ icon, title, body }: { icon: string; title: string; body: string }) {
  const { t } = useTheme();
  return (
    <div style={{
      display: "flex",
      gap: 10,
      padding: 12,
      borderRadius: 8,
      border: `1px solid ${t.line}`,
      background: t.surface2,
    }}>
      <span style={{ color: t.petrol, display: "inline-flex", paddingTop: 1 }}>
        <Icon name={icon} size={16} />
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: t.ink, marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: t.ink3, lineHeight: 1.45 }}>{body}</div>
      </div>
    </div>
  );
}


function StatusPill({ status, version, t }: { status: string; version: number; t: ReturnType<typeof useTheme>["t"] }) {
  const pub = status === "published";
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6,
      background: pub ? "#e0f3e3" : "#fff2dd",
      color: pub ? "#1a8c2a" : "#a06000",
      textTransform: "uppercase",
    }}>
      {status} v{version}
    </span>
  );
}


function Advanced({ t }: { playbookId: string; t: ReturnType<typeof useTheme>["t"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: `1px solid ${t.line}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: "transparent", border: "none",
          padding: 0, color: t.ink3, fontSize: 12, fontWeight: 700,
          cursor: "pointer",
        }}
      >
        {open ? "▾" : "▸"} Advanced — escalation rules · borrower communication tone · raw conditions
      </button>
      {open ? (
        <div style={{ marginTop: 12 }}>
          <EscalationEditor t={t} />
          <CommunicationEditor t={t} />
        </div>
      ) : null}
    </div>
  );
}


function EscalationEditor({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  const { data, isLoading } = useFundingMetaRules("escalation");
  const patch = usePatchFundingMetaRules("escalation");
  const [text, setText] = useState<string>("");
  useEffect(() => { if (data) setText(JSON.stringify(data.rules || {}, null, 2)); }, [data]);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, marginBottom: 6 }}>
        Underwriter escalation rules
      </div>
      <div style={{ fontSize: 12, color: t.ink3, marginBottom: 6 }}>
        When the AI should escalate vs. continue collecting (DSCR below min, LTV exceeds max, doc contradiction, etc.).
      </div>
      {isLoading ? (
        <div style={{ color: t.ink3, fontSize: 12 }}>Loading…</div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            style={{
              width: "100%", fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 12,
              padding: 10, borderRadius: 8, border: `1px solid ${t.line}`,
              background: t.surface, color: t.ink, resize: "vertical",
            }}
          />
          <button
            onClick={async () => {
              try { await patch.mutateAsync(JSON.parse(text || "{}")); }
              catch { alert("Invalid JSON"); }
            }}
            disabled={patch.isPending}
            style={{ ...btnPrimary(t), marginTop: 8 }}
          >
            {patch.isPending ? "Saving…" : "Save escalation rules"}
          </button>
        </>
      )}
    </div>
  );
}


function CommunicationEditor({ t }: { t: ReturnType<typeof useTheme>["t"] }) {
  const { data, isLoading } = useFundingMetaRules("communication");
  const patch = usePatchFundingMetaRules("communication");
  const [text, setText] = useState<string>("");
  useEffect(() => { if (data) setText(JSON.stringify(data.rules || {}, null, 2)); }, [data]);

  return (
    <div>
      <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, marginBottom: 6 }}>
        Borrower communication tone + templates
      </div>
      <div style={{ fontSize: 12, color: t.ink3, marginBottom: 6 }}>
        Tone, opening line templates, when to copy the agent on a borrower message.
      </div>
      {isLoading ? (
        <div style={{ color: t.ink3, fontSize: 12 }}>Loading…</div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={10}
            style={{
              width: "100%", fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 12,
              padding: 10, borderRadius: 8, border: `1px solid ${t.line}`,
              background: t.surface, color: t.ink, resize: "vertical",
            }}
          />
          <button
            onClick={async () => {
              try { await patch.mutateAsync(JSON.parse(text || "{}")); }
              catch { alert("Invalid JSON"); }
            }}
            disabled={patch.isPending}
            style={{ ...btnPrimary(t), marginTop: 8 }}
          >
            {patch.isPending ? "Saving…" : "Save communication rules"}
          </button>
        </>
      )}
    </div>
  );
}


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "6px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}


function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "6px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}
