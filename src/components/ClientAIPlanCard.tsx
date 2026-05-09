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
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { AINotDeployedBanner } from "@/components/AINotDeployedBanner";

interface Props {
  clientId: string;
  loanId?: string | null;
  onOpenChat?: () => void;
}


export function ClientAIPlanCard({ clientId, loanId, onOpenChat }: Props) {
  const { t } = useTheme();
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
      <Card pad={16}>
        <div style={{ color: t.ink3, fontSize: 13 }}>Loading AI plan…</div>
      </Card>
    );
  }
  if (!plan) {
    return (
      <Card pad={16}>
        <div style={{ color: t.ink3, fontSize: 13 }}>No AI plan yet for this client.</div>
      </Card>
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
    <Card pad={16}>
      {/* ── Block 1: Status ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <SectionLabel>Client AI Plan</SectionLabel>
        <span style={{
          fontSize: 12, fontWeight: 600, color: t.ink3,
        }}>
          {leadKind} · {phaseLabel} · {plan.readiness_score ?? 0}% Ready
        </span>
      </div>

      {/* ── Block 2: AI's Next Move ─────────────────────────────── */}
      {plan.next_best_question ? (
        <div style={{
          padding: 12, marginBottom: 16, borderRadius: 8,
          background: t.surface2,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: t.ink3, marginBottom: 6,
            textTransform: "uppercase",
          }}>
            AI&apos;s Next Move
          </div>
          <div style={{ fontSize: 14, color: t.ink, lineHeight: 1.5 }}>
            {plan.next_best_question}
          </div>
          {onOpenChat ? (
            <button onClick={onOpenChat} style={{ ...btnGhost(t), marginTop: 8 }}>
              Open AI chat →
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Block 3: What We Know ───────────────────────────────── */}
      {known.length > 0 ? (
        <Bucket title="What We Know" t={t}>
          {known.map((k, i) => (
            <div key={i} style={{ fontSize: 13, color: t.ink, padding: "4px 0" }}>
              · {k}
            </div>
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 4: What We Still Need ─────────────────────────── */}
      {facts.length > 0 ? (
        <Bucket title="What We Still Need" t={t}>
          {facts.map(item => (
            <PlainRow key={item.requirement_key} item={item} t={t} onToggleWaiver={toggleWaiver} />
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 5: Documents ──────────────────────────────────── */}
      {docs.length > 0 ? (
        <Bucket title="Documents" t={t}>
          {docs.map(item => (
            <PlainRow key={item.requirement_key} item={item} t={t} onToggleWaiver={toggleWaiver} />
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 6: Appointments ───────────────────────────────── */}
      {appts.length > 0 ? (
        <Bucket title="Appointments" t={t}>
          {appts.map(item => (
            <PlainRow key={item.requirement_key} item={item} t={t} onToggleWaiver={toggleWaiver} />
          ))}
        </Bucket>
      ) : null}

      {/* Waived items, if any */}
      {(plan.waived_items || []).length > 0 ? (
        <Bucket title="Waived for this client" t={t}>
          {plan.waived_items.map(w => (
            <div key={w.requirement_key} style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "4px 0", fontSize: 13, color: t.ink3,
            }}>
              <span style={{ flex: 1, textDecoration: "line-through" }}>{w.label}</span>
              <button
                onClick={() => toggleWaiver(w)}
                style={btnGhost(t)}
              >
                Un-waive
              </button>
            </div>
          ))}
        </Bucket>
      ) : null}

      {/* ── Block 7: Custom Instructions ────────────────────────── */}
      <Bucket title="Custom Instructions" t={t}>
        <textarea
          value={instr}
          onChange={e => setInstr(e.target.value)}
          rows={3}
          placeholder='e.g. "For this client, don&apos;t push prequal too hard yet."'
          style={{
            width: "100%", padding: 10, fontSize: 13,
            borderRadius: 8, border: `1px solid ${t.line}`,
            background: t.surface, color: t.ink, fontFamily: "inherit",
            resize: "vertical",
          }}
        />
      </Bucket>

      {/* Preview output */}
      {previewQuestion ? (
        <div style={{
          marginTop: 12, padding: 10, borderRadius: 8,
          border: `1px dashed ${t.line}`, fontSize: 13, color: t.ink,
        }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, marginBottom: 4, textTransform: "uppercase" }}>
            AI Preview
          </div>
          {previewQuestion}
        </div>
      ) : null}

      {/* ── Block 8: Buttons ────────────────────────────────────── */}
      <div style={{
        display: "flex", gap: 8, flexWrap: "wrap",
        marginTop: 16, paddingTop: 14, borderTop: `1px solid ${t.line}`,
      }}>
        <button
          onClick={saveInstr}
          disabled={patch.isPending || instr === (plan.custom_instructions || "")}
          style={btnPrimary(t)}
        >
          {patch.isPending ? "Saving…" : "Save Instructions"}
        </button>
        <button
          onClick={testNextMove}
          disabled={preview.isPending}
          style={btnSecondary(t)}
        >
          {preview.isPending ? "Testing…" : "Test AI Next Move"}
        </button>
        {plan.current_phase === "realtor" ? (
          <button
            onClick={onMarkReady}
            disabled={markReady.isPending}
            style={{ ...btnSecondary(t), marginLeft: "auto" }}
          >
            {markReady.isPending ? "Sending…" : "Mark Ready for Lending"}
          </button>
        ) : null}
      </div>
    </Card>
  );
}


// ─── Helpers ────────────────────────────────────────────────────────


function PlainRow({
  item, t, onToggleWaiver,
}: {
  item: ClientAIPlanItem;
  t: ReturnType<typeof useTheme>["t"];
  onToggleWaiver: (i: ClientAIPlanItem) => Promise<void>;
}) {
  const chip = chipFor(item);
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "6px 0", borderBottom: `1px solid ${t.line}`,
    }}>
      <span style={{ flex: 1, fontSize: 13, color: t.ink }}>{item.label}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
        background: chip.bg, color: chip.color, textTransform: "uppercase",
      }}>
        {chip.label}
      </span>
      {item.can_agent_override ? (
        <button
          onClick={() => onToggleWaiver(item)}
          style={{
            background: "transparent", border: `1px solid ${t.line}`,
            padding: "2px 8px", borderRadius: 4, color: t.ink3,
            cursor: "pointer", fontSize: 11,
          }}
          title="Don't ask for this item on this client"
        >
          Waive
        </button>
      ) : null}
    </div>
  );
}


/** Plain-language chip for one requirement row. The chip rolls up
 * source + required_level into the simplest label the agent should
 * read. */
function chipFor(item: ClientAIPlanItem): { label: string; bg: string; color: string } {
  if (item.status === "needed_later") return { label: "Needed Later", bg: "#f0e5d0", color: "#7a5e22" };
  if (item.source === "funding_required" && !item.can_agent_override) {
    return { label: "🔒 Locked by Funding", bg: "#fff2dd", color: "#a06000" };
  }
  if (item.required_level === "required") return { label: "Required", bg: "#fde0e0", color: "#c14444" };
  if (item.required_level === "recommended") return { label: "Recommended", bg: "#e0e8fd", color: "#3a55b8" };
  return { label: "Optional", bg: "#eee", color: "#666" };
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


function btnPrimary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.petrol, color: "#fff", cursor: "pointer",
  } as const;
}


function btnSecondary(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "8px 14px", fontSize: 13, fontWeight: 600,
    borderRadius: 6, border: `1px solid ${t.line}`,
    background: t.surface, color: t.ink, cursor: "pointer",
  } as const;
}


function btnGhost(t: ReturnType<typeof useTheme>["t"]) {
  return {
    padding: "4px 10px", fontSize: 11, fontWeight: 600,
    borderRadius: 4, border: `1px solid ${t.line}`,
    background: "transparent", color: t.ink3, cursor: "pointer",
  } as const;
}


function Bucket({
  title, children, t,
}: {
  title: string;
  children: React.ReactNode;
  t: ReturnType<typeof useTheme>["t"];
}) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: t.ink3,
        marginBottom: 6, textTransform: "uppercase",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}
