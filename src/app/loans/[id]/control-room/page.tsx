"use client";

// Deal Control Room — 3-column post-activation workspace.
// Port of .design/qualified-commercial/project/desktop/screens/deal-control-room.jsx.
//
// Migrated to the plain-CSS design system. The three-column split, the stage
// tracker and the chat bubble alignment stay inline: they are bespoke layout,
// not vocabulary. Everything with a name in globals.css/app-extras.css uses it.

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Icon } from "@/components/design-system/Icon";
import { GoogleAddressInput } from "@/components/property/GoogleAddressInput";
import { useDocuments, useLoan, useMessages, useRecalc, useSendMessage, useUpdateLoan, useUpdateProperty } from "@/hooks/useApi";
import { useDealChannel } from "@/hooks/useDealChannel";
import { useActiveProfile } from "@/store/role";
import { Role, MessageFrom, PropertyTypeOptions } from "@/lib/enums.generated";
import { QC_FMT } from "@/lib/fmt";
import { parseUSD } from "@/lib/formCoerce";
import type { Document, Loan } from "@/lib/types";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";
import { Btn, CellChip, Kpi, KpiRow, Select, cx } from "@/components/ds";

const STAGES = ["AI Intake", "Soft Pull", "Doc Collection", "Underwriting", "Clear to Close"];

export default function DealControlRoomPage() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
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
      recalc.mutate({
        loanId: loan.id,
        discount_points: loan.discount_points || 0,
        loan_amount: loan.amount,
        base_rate: loan.base_rate ?? undefined,
        annual_taxes: loan.annual_taxes,
        annual_insurance: loan.annual_insurance,
        monthly_hoa: loan.monthly_hoa,
        term_months: loan.term_months,
        monthly_rent: loan.monthly_rent,
        purpose: loan.purpose,
        arv: loan.arv,
        ltv: loan.ltv ?? undefined,
      });
    }
  }, [loan?.id]);

  if (!loan) return <div className="sub" style={{ padding: 24 }}>Loading…</div>;
  const canEdit = profile.role !== Role.CLIENT;

  return (
    // Full-bleed: the control room owns the viewport, so it cancels .content's
    // padding rather than guessing at a fixed 24px the shell no longer uses.
    <div style={{
      display: "flex", flexDirection: "column", height: "100%", overflow: "hidden",
      margin: "calc(var(--pad-y) * -1) calc(var(--pad-x) * -1) -44px",
    }}>
      {/* Header */}
      <div className="row" style={{ padding: "14px 20px", background: "var(--surface)", borderBottom: "1px solid var(--line)" }}>
        <Btn onClick={() => router.push(`/loans/${loan.id}`)}>
          <Icon name="x" size={13} /> Exit control room
        </Btn>
        <div className="sp grid g4" style={{ minWidth: 0 }}>
          <div className="row">
            <CellChip tone="pet">Deal Control Room</CellChip>
            <span className="sub num" style={{ fontFamily: "ui-monospace, SF Mono, monospace", fontWeight: 700 }}>
              {loan.deal_id}
            </span>
            {justCreated && <CellChip tone="ok">just created</CellChip>}
          </div>
          {/* The page's only h1 — the shell renders none. */}
          <h1 style={{ fontSize: 16 }}>{loan.address}</h1>
        </div>
        <Link href={`/loans/${loan.id}`} className="btn">
          Full loan view
        </Link>
      </div>

      {/* Stage tracker */}
      <div style={{ display: "flex", padding: "10px 20px", gap: 4, background: "var(--sunken2)", borderBottom: "1px solid var(--line)" }}>
        {STAGES.map((s, i) => {
          const active = i === 0; // Always at AI Intake on entry; refined as backend signals advance
          return (
            <div key={s} style={{ flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
              <span className={cx("stepdot", active && "on")}>
                <i>{i + 1}</i>
                {s}
              </span>
              {i < STAGES.length - 1 && <span style={{ flex: 1, height: 1, background: "var(--line)" }} />}
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
  const updateProperty = useUpdateProperty();
  const [draft, setDraft] = useState({
    address: loan.address,
    city: loan.city ?? "",
    state: loan.state ?? "",
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
      state: loan.state ?? "",
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

  const addressChanged =
    draft.address !== loan.address ||
    draft.city !== (loan.city ?? "") ||
    draft.state !== (loan.state ?? "");

  const commitAddress = () => {
    if (!canEdit || !addressChanged) return;
    updateProperty.mutate({
      loanId: loan.id,
      address: draft.address,
      city: draft.city || null,
      state: draft.state || null,
    });
  };

  return (
    <div className="grid" style={{ borderRight: "1px solid var(--line)", padding: 16, overflowY: "auto", alignContent: "start" }}>
      <div className="lbl">Living loan file</div>

      <div>
        <GoogleAddressInput
          value={{ street: draft.address, city: draft.city, state: draft.state }}
          onChange={(next) =>
            setDraft((d) => ({
              ...d,
              address: next.street ?? "",
              city: next.city ?? "",
              state: next.state ?? "",
            }))
          }
          showZip={false}
          disabled={!canEdit}
          helperText="Search Google and select the property, or use manual entry if the address is not listed."
        />
        {canEdit ? (
          <Btn
            className="mt"
            onClick={commitAddress}
            disabled={!addressChanged || updateProperty.isPending}
          >
            <Icon name="check" size={13} /> {updateProperty.isPending ? "Saving..." : "Apply address"}
          </Btn>
        ) : null}
      </div>
      <Field label="Property type">
        <Select
          value={draft.property_type}
          onChange={(e) => {
            const v = e.target.value as Loan["property_type"];
            setDraft((d) => ({ ...d, property_type: v }));
            commit({ property_type: v });
          }}
          disabled={!canEdit}
        >
          {PropertyTypeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
      </Field>
      <Field label="Annual taxes">
        <Input
          value={draft.annual_taxes}
          onChange={(v) => setDraft((d) => ({ ...d, annual_taxes: v }))}
          onBlur={() => commit({ annual_taxes: parseUSD(draft.annual_taxes) })}
          disabled={!canEdit}
          prefix="$"
        />
      </Field>
      {(loan.type === "dscr") && (
        <Field label="Expected monthly rent">
          <Input
            value={draft.monthly_rent}
            onChange={(v) => setDraft((d) => ({ ...d, monthly_rent: v }))}
            onBlur={() => commit({ monthly_rent: parseUSD(draft.monthly_rent) || null })}
            disabled={!canEdit}
            prefix="$"
          />
        </Field>
      )}

      {/* Live calc */}
      <KpiRow>
        <Kpi label="Loan amount" value={QC_FMT.short(Number(loan.amount))} />
        <Kpi label="LTV" value={loan.ltv ? `${(loan.ltv * 100).toFixed(0)}%` : "—"} />
        <Kpi label="Final rate" value={recalcData ? `${(recalcData.final_rate * 100).toFixed(3)}%` : loan.final_rate ? `${(loan.final_rate * 100).toFixed(3)}%` : "—"} />
        <Kpi label="Monthly P&I" value={recalcData ? QC_FMT.usd(recalcData.monthly_pi) : "—"} />
        <Kpi label="DSCR" value={recalcData?.dscr ? recalcData.dscr.toFixed(2) : loan.dscr ? loan.dscr.toFixed(2) : "—"} />
        <Kpi label="HUD total" value={recalcData ? QC_FMT.usd(recalcData.hud_total) : "—"} />
      </KpiRow>
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
    <div style={{ borderRight: "1px solid var(--line)", display: "flex", flexDirection: "column", minHeight: 0 }}>
      <div className="row" style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
        <div className="lbl">Center of Truth · AI ↔ {loan.deal_id}</div>
        <span className="sp" />
        <CellChip tone={paused ? "warn" : "ok"}>
          {paused ? "AI Paused · broker driving" : "AI Active"}
        </CellChip>
        {canEdit && (
          <Btn size="sm" variant={paused ? "pri" : "default"} onClick={() => setPaused((p) => !p)}>
            <Icon name={paused ? "play" : "pause"} size={11} />
            {paused ? "Resume AI" : "Pause AI"}
          </Btn>
        )}
      </div>

      {/* Bubble alignment is per-message and axis-sensitive, so this column
          stays flex: in a grid, align-self would move bubbles vertically. */}
      <div ref={scrollerRef} style={{ flex: 1, padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {(!messages || messages.length === 0) && (
          <div className="thr-empty">
            No conversation yet — once Elara sends the intro message, the live thread appears here.
          </div>
        )}
        {messages?.map((m) => (
          <div
            key={m.id}
            className={cx("msg", m.from_role === "client" && "client-ch", m.from_role === "ai" && "ai")}
            style={{
              alignSelf: m.from_role === "lender" ? "flex-start" : m.from_role === "client" ? "flex-end" : "center",
              maxWidth: "85%",
            }}
          >
            <div className="msg-h">
              <CellChip tone="mut">{m.from_role}</CellChip>
              {m.is_draft && <CellChip tone="warn">Draft</CellChip>}
              {m.is_system && <CellChip tone="pet">System</CellChip>}
            </div>
            <div className="msg-b">{m.body}</div>
          </div>
        ))}
      </div>

      {paused && canEdit && (
        <div className="row" style={{ padding: 12, borderTop: "1px solid var(--line)", background: "var(--warn-tint)" }}>
          <input
            className="field grow"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a direct message to the client…"
            onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
          />
          <Btn variant="pri" onClick={handleSend} disabled={!draft.trim() || sendMessage.isPending}>
            <Icon name="bolt" size={13} /> Send
          </Btn>
        </div>
      )}
    </div>
  );
}

// ── Right: Document Vault grouped by category ─────────────────────────────
function DocVault({ loan, docs, canEdit }: { loan: Loan; docs: Document[]; canEdit: boolean }) {
  const grouped = useMemo(() => {
    const g: Record<string, Document[]> = {};
    for (const d of docs) {
      const k = (d.category ?? "other").toLowerCase();
      (g[k] ||= []).push(d);
    }
    return g;
  }, [docs]);

  const verified = docs.filter((d) => d.status === "received" || d.status === "verified").length;

  // Flex, not grid: the lender-package button is pinned to the bottom with
  // margin-top:auto and there is no grid equivalent that survives a short list.
  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="lbl">Document Vault</div>
      <div className="grid g6">
        <div className="lbl">{verified}/{docs.length} verified</div>
        <div className="track">
          <div className="fill" style={{ width: `${docs.length ? (verified / docs.length) * 100 : 0}%` }} />
        </div>
      </div>
      {Object.keys(grouped).length === 0 && (
        <div className="sub">No documents yet — request them as needed.</div>
      )}
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat} className="grid g8">
          <div className="lbl">{cat}</div>
          <div>
            {items.map((d) => (
              <div key={d.id} className="itemrow">
                <Icon name="doc" size={13} />
                <div className="grow">
                  <div style={{ fontSize: 12.5, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div className="sub">{d.status}</div>
                </div>
                {canEdit && (d.status === "requested" || d.status === "pending" || d.status === "flagged") && (
                  <DocUploadButton loanId={loan.id} category={d.category ?? undefined} compact />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
      <Btn variant="pri" style={{ marginTop: "auto", width: "100%", justifyContent: "center" }}>
        <Icon name="download" size={13} /> Download lender package
      </Btn>
    </div>
  );
}

// ── Tiny form primitives ──────────────────────────────────────────────────
// Local to this file (never exported), so dropping the `t` argument changes no
// caller outside it.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid g6">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

function Input({ value, onChange, onBlur, prefix, disabled }: { value: string; onChange: (v: string) => void; onBlur?: () => void; prefix?: string; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, opacity: disabled ? 0.6 : 1 }}>
      {prefix && <span className="lbl">{prefix}</span>}
      <input
        className="field grow"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        disabled={disabled}
      />
    </div>
  );
}
