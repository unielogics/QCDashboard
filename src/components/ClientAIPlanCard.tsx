"use client";

// Client AI Plan Card — plain-language version (Phase 2 simplification).
//
// One card at the top of /clients/[id]. Five blocks the agent can scan:
//
//   1. Status              — buyer/seller, phase, readiness %
//   2. AI's Next Move      — the computed next-best question
//   3. What We Know        — captured facts (from realtor profile)
//   4. What We Still Need  — open required + recommended items
//   5. Documents           — same shape, filtered to docs/agreements
//   6. Appointments        — filtered to appointment/task
//   7. Custom Instructions — free-text textarea
//   8. Buttons             — Save · Test AI Next Move · Mark Ready for Lending
//
// Per-row chips use plain language: Required / Recommended / Optional /
// Locked by Funding / Waived / Needed Later. No backend vocabulary
// (required_level / source / blocks_stage / playbook_id) on this surface.
//
// Restyled onto the plain-CSS design system: the card is a `.panel` whose
// header carries the status line, each block is a `.fldsec`, requirement rows
// are `.itemrow`, and the hand-picked chip hexes in `chipFor` are now the
// shared `.cellchip` tone vocabulary — same five plain-language labels, same
// five distinctions, one palette.

import { useEffect, useMemo, useState } from "react";
import {
  isAINotDeployed,
  useClient,
  useClientAIPlan,
  useMarkClientFinanceReady,
  usePatchClientAIPlan,
  usePreviewAIPlan,
  type ClientAIPlanItem,
} from "@/hooks/useApi";
import {
  Btn,
  Callout,
  CellChip,
  ItemRow,
  Note,
  Panel,
  Sub,
  Textarea,
  type ChipTone,
} from "@/components/ds";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";

interface Props {
  clientId: string;
  loanId?: string | null;
  onOpenChat?: () => void;
}


export function ClientAIPlanCard({ clientId, loanId, onOpenChat }: Props) {
  const { data: plan, isLoading, error: planErr } = useClientAIPlan(clientId, loanId ?? null);
  const { data: client } = useClient(clientId);
  const patch = usePatchClientAIPlan();
  const preview = usePreviewAIPlan();
  const markReady = useMarkClientFinanceReady();

  const [instr, setInstr] = useState<string>("");
  useEffect(() => { setInstr(plan?.custom_instructions || ""); }, [plan?.custom_instructions]);

  const [previewQuestion, setPreviewQuestion] = useState<string | null>(null);

  const open = useMemo(
    () => (plan?.required_items || []).filter(i =>
      i.status === "missing" || i.status === "asked" || i.status === "needed_later",
    ),
    [plan?.required_items],
  );
  const facts = open.filter(i => i.category === "fact");
  const docs = open.filter(i => i.category === "document" || i.category === "agreement");
  const appts = open.filter(i => i.category === "appointment" || i.category === "task");
  const known = useMemo(() => collectKnown(client?.realtor_profile, plan), [client?.realtor_profile, plan]);

  if (isAINotDeployed(planErr)) {
    return <AINotDeployedBanner surface="Client AI Plan" />;
  }
  if (isLoading) {
    return (
      <Panel title="Client AI Plan">
        <Sub>Loading AI plan…</Sub>
      </Panel>
    );
  }
  if (!plan) {
    return (
      <Panel title="Client AI Plan">
        <Sub>No AI plan yet for this client.</Sub>
      </Panel>
    );
  }

  async function toggleWaiver(item: ClientAIPlanItem) {
    if (!item.can_agent_override) return;
    const isWaived = (plan?.waived_items || []).some(w => w.requirement_key === item.requirement_key);
    await patch.mutateAsync({
      clientId,
      loanId: loanId ?? null,
      [isWaived ? "unwaive_keys" : "waive_keys"]: [item.requirement_key],
    });
  }

  async function saveInstr() {
    await patch.mutateAsync({
      clientId,
      loanId: loanId ?? null,
      custom_instructions: instr || null,
    });
  }

  async function testNextMove() {
    const res = await preview.mutateAsync({
      client_id: clientId,
      loan_id: loanId ?? null,
      custom_instructions: instr || undefined,
    });
    setPreviewQuestion(res.next_best_question || "(AI has nothing pressing right now)");
  }

  async function onMarkReady() {
    if (!confirm("Mark this client as ready for lending? This kicks off the lending hand-off.")) return;
    await markReady.mutateAsync(clientId);
  }

  const phaseLabel = plan.current_phase === "lending" ? "Lending Phase" : "Realtor Phase";
  const ctype = client?.realtor_profile?.client_type;
  const leadKind =
    ctype === "buyer" ? "Buyer Lead"
    : ctype === "seller" ? "Seller Lead"
    : ctype === "buyer_and_seller" ? "Buyer + Seller Lead"
    : "Lead";

  return (
    /* ── Block 1: Status ─────────────────────────────────────── */
    <Panel
      title="Client AI Plan"
      sub={`${leadKind} · ${phaseLabel} · ${plan.readiness_score ?? 0}% Ready`}
    >
      {/* ── Block 2: AI's Next Move ─────────────────────────────── */}
      {plan.next_best_question ? (
        <Callout tone="acc" className="mb">
          <div className="lbl">AI&apos;s Next Move</div>
          <div>{plan.next_best_question}</div>
          {onOpenChat ? (
            <Btn size="sm" className="mt" onClick={onOpenChat}>
              Open AI chat →
            </Btn>
          ) : null}
        </Callout>
      ) : null}

      {/* ── Block 3: What We Know ───────────────────────────────── */}
      {known.length > 0 ? (
        <Bucket title="What We Know">
          <div className="grid g4">
            {known.map((k, i) => (
              <div key={i}>· {k}</div>
            ))}
          </div>
        </Bucket>
      ) : null}

      {/* ── Block 4: What We Still Need ─────────────────────────── */}
      {facts.length > 0 ? (
        <Bucket title="What We Still Need">
          {facts.map(item => (
            <PlainRow key={item.requirement_key} item={item} onToggleWaiver={toggleWaiver} />
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 5: Documents ──────────────────────────────────── */}
      {docs.length > 0 ? (
        <Bucket title="Documents">
          {docs.map(item => (
            <PlainRow key={item.requirement_key} item={item} onToggleWaiver={toggleWaiver} />
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 6: Appointments ───────────────────────────────── */}
      {appts.length > 0 ? (
        <Bucket title="Appointments">
          {appts.map(item => (
            <PlainRow key={item.requirement_key} item={item} onToggleWaiver={toggleWaiver} />
          ))}
        </Bucket>
      ) : null}

      {/* Waived items, if any */}
      {(plan.waived_items || []).length > 0 ? (
        <Bucket title="Waived for this client">
          {plan.waived_items.map(w => (
            <ItemRow
              key={w.requirement_key}
              right={
                <Btn size="sm" onClick={() => toggleWaiver(w)}>
                  Un-waive
                </Btn>
              }
            >
              <s>{w.label}</s>
            </ItemRow>
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 7: Custom Instructions ────────────────────────── */}
      <Bucket title="Custom Instructions">
        <div className="grid">
          <Textarea
            value={instr}
            onChange={e => setInstr(e.target.value)}
            rows={3}
            placeholder='e.g. "For this client, don&apos;t push prequal too hard yet."'
          />
        </div>
      </Bucket>

      {/* Preview output */}
      {previewQuestion ? (
        <Note>
          <div>
            <div className="lbl">AI Preview</div>
            {previewQuestion}
          </div>
        </Note>
      ) : null}

      {/* ── Block 8: Buttons ────────────────────────────────────── */}
      {/* Bespoke: a footer action row separated by a hairline. `.row` owns the
          flex box and `.mt` the top margin; neither owns a border. */}
      <div className="row mt" style={{ borderTop: "1px solid var(--line)", paddingTop: 14 }}>
        <Btn
          variant="pri"
          onClick={saveInstr}
          disabled={patch.isPending || instr === (plan.custom_instructions || "")}
        >
          {patch.isPending ? "Saving…" : "Save Instructions"}
        </Btn>
        <Btn onClick={testNextMove} disabled={preview.isPending}>
          {preview.isPending ? "Testing…" : "Test AI Next Move"}
        </Btn>
        {plan.current_phase === "realtor" ? (
          <>
            <span className="sp" />
            <Btn onClick={onMarkReady} disabled={markReady.isPending}>
              {markReady.isPending ? "Sending…" : "Mark Ready for Lending"}
            </Btn>
          </>
        ) : null}
      </div>
    </Panel>
  );
}


// ─── Helpers ────────────────────────────────────────────────────────


function PlainRow({
  item, onToggleWaiver,
}: {
  item: ClientAIPlanItem;
  onToggleWaiver: (i: ClientAIPlanItem) => Promise<void>;
}) {
  const chip = chipFor(item);
  return (
    <ItemRow
      right={
        <>
          <CellChip tone={chip.tone}>{chip.label}</CellChip>
          {item.can_agent_override ? (
            <Btn
              size="sm"
              onClick={() => onToggleWaiver(item)}
              title="Don't ask for this item on this client"
            >
              Waive
            </Btn>
          ) : null}
        </>
      }
    >
      {item.label}
    </ItemRow>
  );
}


/** Plain-language chip for one requirement row. The chip rolls up
 * source + required_level into the simplest label the agent should
 * read.
 *
 * The five hand-picked hex pairs this used to return are now the five
 * `.cellchip` tones, so a "Required" row here matches a "Required" marker
 * anywhere else in the console. */
function chipFor(item: ClientAIPlanItem): { label: string; tone: ChipTone } {
  if (item.status === "needed_later") return { label: "Needed Later", tone: "gold" };
  if (item.source === "funding_required" && !item.can_agent_override) {
    return { label: "🔒 Locked by Funding", tone: "warn" };
  }
  if (item.required_level === "required") return { label: "Required", tone: "bad" };
  if (item.required_level === "recommended") return { label: "Recommended", tone: "acc" };
  return { label: "Optional", tone: "mut" };
}


/** "What We Know" data — pull plain-English bullets from the realtor
 * profile + verified facts on the plan. Cap at ~10 lines. */
function collectKnown(profile: unknown, plan: { required_items?: ClientAIPlanItem[] } | null | undefined): string[] {
  const out: string[] = [];
  const p = (profile || {}) as Record<string, unknown>;
  const bp = (p.buyer_profile || {}) as Record<string, unknown>;
  const sp = (p.seller_profile || {}) as Record<string, unknown>;
  if (bp.target_property_type) out.push(`Looking for ${String(bp.target_property_type).replace(/_/g, " ")} property`);
  if (bp.target_location) out.push(`Wants ${bp.target_location}`);
  if (bp.target_budget) out.push(`Budget around $${Number(bp.target_budget).toLocaleString()}`);
  else if (bp.target_budget_range) {
    const r = bp.target_budget_range as { low?: number; high?: number };
    if (r.low && r.high) out.push(`Budget $${r.low.toLocaleString()}–$${r.high.toLocaleString()}`);
  }
  if (bp.financing_needed === true) out.push("Financing likely needed");
  if (bp.financing_needed === false) out.push("Cash buyer — no financing");
  if (bp.purchase_timeline) out.push(`Timeline: ${String(bp.purchase_timeline).replace(/_/g, "–")}`);

  if (sp.property_address) out.push(`Selling: ${sp.property_address}`);
  if (sp.desired_list_price) out.push(`List price ~$${Number(sp.desired_list_price).toLocaleString()}`);
  if (sp.occupancy_status) out.push(`Property is ${sp.occupancy_status}`);

  // Verified items from the plan that have a value worth surfacing.
  for (const item of plan?.required_items || []) {
    if (item.status === "verified" || item.status === "uploaded") {
      out.push(`✓ ${item.label}`);
    }
  }

  return out.slice(0, 12);
}


/**
 * One labelled block inside the card.
 *
 * Was a hand-rolled label + margin pair; it is now `.fldsec`, which already
 * owns the block spacing (`.fldsec + .fldsec`) and the label's block display.
 * Kept as a component because the three requirement buckets, the known-facts
 * list, the waived list and the instructions box all read as the same object.
 */
function Bucket({
  title, children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fldsec">
      <span className="lbl">{title}</span>
      {children}
    </div>
  );
}
