"use client";

// Deal Control Room — 3-column post-activation workspace.
// Port of .design/qualified-commercial/project/desktop/screens/deal-control-room.jsx.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useDocuments, useLoan, useMessages, useRecalc, useSendMessage, useUpdateLoan } from "@/hooks/useApi";
import { useDealChannel } from "@/hooks/useDealChannel";
import { useActiveProfile } from "@/store/role";
import { Role, MessageFrom, PropertyType, PropertyTypeOptions } from "@/lib/enums.generated";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseUSD } from "@/lib/formCoerce";
import type { Document, Loan } from "@/lib/types";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";

const STAGES = ["AI Intake", "Soft Pull", "Doc Collection", "Underwriting", "Clear to Close"];

export default function DealControlRoomPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { t } = useTheme();
  const profile = useActiveProfile();
  const justCreated = search.get("just-created") === "1";

  const { data: loan } = useLoan(params.id);
  const { data: docs = [] } = useDocuments(params.id);
  const { data: messages = [] } = useMessages(params.id);
  const updateLoan = useUpdateLoan();
  const sendMessage = useSendMessage();
  const recalc = useRecalc();

  // Subscribe to live AI chat
  useDealChannel(params.id, loan?.deal_id ?? null);

  // Recalc on mount so we have live pricing
  useEffect(() => {
    if (loan && !recalc.data && !recalc.isPending) {
      recalc.mutate({ loanId: loan.id, discount_points: loan.discount_points || 0 });
    }
  }, [loan?.id]);

  if (!loan) return <div style={{ color: t.ink3, padding: 24 }}>Loading…</div>;
  const canEdit = profile.role !== Role.CLIENT;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", margin: -24 }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px", background: t.surface, borderBottom: `1px solid ${t.line}`,
        display: "flex", alignItems: "center", gap: 14,
      }}>
        <button onClick={() => router.push(`/loans/${loan.id}`)} style={{
          ...qcBtn(t),
          padding: "6px 10px",
        }}>
          <Icon name="x" size={13} /> Exit control room
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: t.petrol, letterSpacing: 1.4, textTransform: "uppercase" }}>
              Deal Control Room
            </span>
            <span style={{ fontFamily: "ui-monospace, SF Mono, monospace", fontSize: 11, color: t.ink3, fontWeight: 700 }}>
              {loan.deal_id}
            </span>
            {justCreated && <Pill bg={t.profitBg} color={t.profit}>just created</Pill>}
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: t.ink, marginTop: 2 }}>{loan.address}</div>
        </div>
        <Link href={`/loans/${loan.id}`} style={{ ...qcBtn(t), textDecoration: "none" }}>
          Full loan view
        </Link>
      </div>

      {/* Stage tracker */}
      <div style={{ display: "flex", padding: "10px 20px", gap: 4, background: t.surface2, borderBottom: `1px solid ${t.line}` }}>
        {STAGES.map((s, i) => {
          const active = i === 0; // Always at AI Intake on entry; refined as backend signals advance
          return (
            <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 999,
                background: active ? t.petrol : t.line,
                color: active ? "#fff" : t.ink3,
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800,
              }}>{i + 1}</div>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: active ? t.ink : t.ink3 }}>{s}</div>
              {i < STAGES.length - 1 && <div style={{ flex: 1, height: 1, background: t.line }} />}
            </div>
          );
        })}
      </div>

      {/* 3-column body */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 1.3fr 1fr", gap: 0, minHeight: 0, overflow: "hidden" }}>
        <LivingForm loan={loan} canEdit={canEdit} updateLoan={updateLoan} recalcData={recalc.data} />
        <AIMonitor loan={loan} messages={messages} sendMessage={sendMessage} canEdit={canEdit} />
        <DocVault loan={loan} docs={docs} canEdit={canEdit} />
      </div>
    </div>
  );
}

// ── Left: Living Form + HUD Sim ───────────────────────────────────────────
function LivingForm({
  loan,
  canEdit,
  updateLoan,
  recalcData,
}: {
  loan: Loan;
  canEdit: boolean;
  updateLoan: ReturnType<typeof useUpdateLoan>;
  recalcData: ReturnType<typeof useRecalc>["data"];
}) {
  const { t } = useTheme();
  const [draft, setDraft] = useState({
    address: loan.address,
    city: loan.city ?? "",
    property_type: loan.property_type,
    annual_taxes: String(loan.annual_taxes ?? ""),
    monthly_rent: loan.monthly_rent != null ? String(loan.monthly_rent) : "",
    base_rate: loan.base_rate != null ? String(loan.base_rate) : "",
  });

  // Sync draft when loan ID changes
  useEffect(() => {
    setDraft({
      address: loan.address,
      city: loan.city ?? "",
      property_type: loan.property_type,
      annual_taxes: String(loan.annual_taxes ?? ""),
      monthly_rent: loan.monthly_rent != null ? String(loan.monthly_rent) : "",
      base_rate: loan.base_rate != null ? String(loan.base_rate) : "",
    });
  }, [loan.id]);

  const commit = (patch: Partial<Loan>) => {
    if (!canEdit) return;
    updateLoan.mutate({ loanId: loan.id, ...patch });
  };

  return (
    <div style={{ borderRight: `1px solid ${t.line}`, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel>Living loan file</SectionLabel>

      <Field t={t} label="Property address">
        <Input t={t} value={draft.address} onChange={(v) => setDraft((d) => ({ ...d, address: v }))} onBlur={() => commit({ address: draft.address })} disabled={!canEdit} />
      </Field>
      <Field t={t} label="City">
        <Input t={t} value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} onBlur={() => commit({ city: draft.city || null })} disabled={!canEdit} />
      </Field>
      <Field t={t} label="Property type">
        <select
          value={draft.property_type}
          onChange={(e) => {
            const v = e.target.value as Loan["property_type"];
            setDraft((d) => ({ ...d, property_type: v }));
            commit({ property_type: v });
          }}
          disabled={!canEdit}
          style={inputStyle(t)}
        >
          {PropertyTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>
      <Field t={t} label="Annual taxes">
        <Input
          t={t}
          value={draft.annual_taxes}
          onChange={(v) => setDraft((d) => ({ ...d, annual_taxes: v }))}
          onBlur={() => commit({ annual_taxes: parseUSD(draft.annual_taxes) })}
          disabled={!canEdit}
          prefix="$"
        />
      </Field>
      {(loan.type === "dscr") && (
        <Field t={t} label="Expected monthly rent">
          <Input
            t={t}
            value={draft.monthly_rent}
            onChange={(v) => setDraft((d) => ({ ...d, monthly_rent: v }))}
            onBlur={() => commit({ monthly_rent: parseUSD(draft.monthly_rent) || null })}
            disabled={!canEdit}
            prefix="$"
          />
        </Field>
      )}

      {/* Live calc */}
      <div style={{
        marginTop: 4, padding: 12, borderRadius: 11,
        background: t.petrolSoft, border: `1px solid ${t.petrol}30`,
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10,
      }}>
        <Stat t={t} label="Loan amount" value={QC_FMT.short(Number(loan.amount))} accent />
        <Stat t={t} label="LTV" value={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}%` : "—"} />
        <Stat t={t} label="Final rate" value={recalcData ? `${(recalcData.final_rate * 100).toFixed(3)}%` : loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} />
        <Stat t={t} label="Monthly P&I" value={recalcData ? QC_FMT.usd(recalcData.monthly_pi) : "—"} />
        <Stat t={t} label="DSCR" value={recalcData?.dscr ? recalcData.dscr.toFixed(2) : loan.dscr ? loan.dscr.toFixed(2) : "—"} />
        <Stat t={t} label="HUD total" value={recalcData ? QC_FMT.usd(recalcData.hud_total) : "—"} />
      </div>
    </div>
  );
}

// ── Middle: AI conversation monitor ───────────────────────────────────────
function AIMonitor({
  loan,
  messages,
  sendMessage,
  canEdit,
}: {
  loan: Loan;
  messages: ReturnType<typeof useMessages>["data"] extends infer T ? T : never;
  sendMessage: ReturnType<typeof useSendMessage>;
  canEdit: boolean;
}) {
  const { t } = useTheme();
  const [paused, setPaused] = useState(false);
  const [draft, setDraft] = useState("");
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [messages?.length]);

  const handleSend = async () => {
    if (!draft.trim()) return;
    const body = draft.trim();
    setDraft("");
    try {
      await sendMessage.mutateAsync({
        loan_id: loan.id,
        body,
        from_role: MessageFrom.LENDER,
        is_draft: false,
      });
    } catch {
      setDraft(body);
    }
  };

  return (
    <div style={{ borderRight: `1px solid ${t.line}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div style={{ padding: "12px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", gap: 10 }}>
        <SectionLabel>Center of Truth · AI ↔ {loan.deal_id}</SectionLabel>
        <div style={{ flex: 1 }} />
        <Pill bg={paused ? t.warnBg : t.profitBg} color={paused ? t.warn : t.profit}>
          {paused ? "AI Paused · broker driving" : "AI Active"}
        </Pill>
        {canEdit && (
          <button
            onClick={() => setPaused((p) => !p)}
            style={{
              padding: "6px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700,
              background: paused ? t.profit : t.warn, color: "#fff", border: "none", cursor: "pointer",
              display: "inline-flex", alignItems: "center", gap: 5,
            }}
          >
            <Icon name={paused ? "play" : "pause"} size={11} />
            {paused ? "Resume AI" : "Pause AI"}
          </button>
        )}
      </div>

      <div ref={scrollerRef} style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {(!messages || messages.length === 0) && (
          <div style={{ fontSize: 12.5, color: t.ink3, padding: 12, borderRadius: 9, background: t.surface2, border: `1px solid ${t.line}` }}>
            No conversation yet — once the AI sends the intro message, the live thread appears here.
          </div>
        )}
        {messages?.map((m) => (
          <div key={m.id} style={{
            alignSelf: m.from_role === "lender" ? "flex-start" : m.from_role === "client" ? "flex-end" : "center",
            maxWidth: "85%",
          }}>
            <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
              <Pill>{m.from_role}</Pill>
              {m.is_draft && <Pill bg={t.warnBg} color={t.warn}>Draft</Pill>}
              {m.is_system && <Pill bg={t.petrolSoft} color={t.petrol}>System</Pill>}
            </div>
            <div style={{
              padding: "10px 12px", borderRadius: 12, fontSize: 12.5, lineHeight: 1.5,
              background: m.from_role === "client" ? t.brandSoft : m.from_role === "ai" ? t.petrolSoft : t.surface2,
              color: t.ink,
            }}>
              {m.body}
            </div>
          </div>
        ))}
      </div>

      {paused && canEdit && (
        <div style={{ padding: 12, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8, background: t.warnBg + "55" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a direct message to the borrower…"
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
            style={{
              flex: 1, padding: "10px 12px", borderRadius: 10,
              background: t.surface, border: `1px solid ${t.line}`, color: t.ink, fontSize: 13,
              fontFamily: "inherit", outline: "none",
            }}
          />
          <button onClick={handleSend} disabled={!draft.trim() || sendMessage.isPending} style={qcBtnPrimary(t)}>
            <Icon name="bolt" size={13} /> Send
          </button>
        </div>
      )}
    </div>
  );
}

// ── Right: Document Vault grouped by category ─────────────────────────────
function DocVault({ loan, docs, canEdit }: { loan: Loan; docs: Document[]; canEdit: boolean }) {
  const { t } = useTheme();
  const grouped = useMemo(() => {
    const g: Record<string, Document[]> = {};
    for (const d of docs) {
      const k = (d.category ?? "other").toLowerCase();
      (g[k] ||= []).push(d);
    }
    return g;
  }, [docs]);

  const verified = docs.filter((d) => d.status === "received" || d.status === "verified").length;

  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <SectionLabel>Document Vault</SectionLabel>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>
          {verified}/{docs.length} verified
        </div>
        <div style={{ height: 6, background: t.line, borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${docs.length ? (verified / docs.length) * 100 : 0}%`, height: "100%", background: t.profit }} />
        </div>
      </div>
      {Object.keys(grouped).length === 0 && (
        <div style={{ fontSize: 12.5, color: t.ink3 }}>No documents yet — request them as needed.</div>
      )}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: t.petrol, letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 6 }}>
            {cat}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {items.map((d) => (
              <div key={d.id} style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 10px", borderRadius: 9, border: `1px solid ${t.line}`,
              }}>
                <Icon name="doc" size={13} style={{ color: t.ink3 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div style={{ fontSize: 10.5, color: t.ink3 }}>{d.status}</div>
                </div>
                {canEdit && (d.status === "requested" || d.status === "pending" || d.status === "flagged") && (
                  <DocUploadButton loanId={loan.id} category={d.category ?? undefined} compact />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <button style={{ ...qcBtnPrimary(t), justifyContent: "center", width: "100%", marginTop: "auto" }}>
        <Icon name="download" size={13} /> Download lender package
      </button>
    </div>
  );
}

// ── Tiny form primitives ──────────────────────────────────────────────────

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  );
}

function Input({ t, value, onChange, onBlur, prefix, disabled }: { t: ReturnType<typeof useTheme>["t"]; value: string; onChange: (v: string) => void; onBlur?: () => void; prefix?: string; disabled?: boolean }) {
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      {prefix && <span style={{ position: "absolute", left: 10, fontSize: 12.5, color: t.ink3, fontWeight: 600 }}>{prefix}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
        style={{ ...inputStyle(t), paddingLeft: prefix ? 22 : 12, opacity: disabled ? 0.6 : 1 }}
      />
    </div>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
    border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
  };
}

function Stat({ t, label, value, accent }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string | number; accent?: boolean }) {
  return (
    <div>
      <div style={{
        fontSize: 9.5, fontWeight: 800, color: accent ? t.petrol : t.ink3,
        letterSpacing: 1.0, textTransform: "uppercase",
      }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: t.ink, marginTop: 2, fontFeatureSettings: '"tnum"' }}>{value}</div>
    </div>
  );
}
