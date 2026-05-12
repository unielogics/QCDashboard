"use client";

// Loan Overview tab — appears on /deals/[id] once the deal has been
// promoted to a Loan. Read-mostly surface for the agent that mirrors
// the funding workbench at /loans/[id]:
//
//   1. Current loan terms          — read-only snapshot
//   2. Amortization                — client-side schedule + term-sheet PDF
//   3. Agent commission            — the ONE editable HUD row for agents
//   4. Settlement statement (HUD)  — all other lines read-only
//   5. Prequalification history    — list with Download PDF
//   6. Conditions                  — read-only with status
//   7. Documents                   — read-only with status

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useCreateHudLine,
  useDocuments,
  useDownloadTermSheet,
  useHudLines,
  useLoanPrequalRequests,
  useLoanWorkflow,
  useUpdateHudLine,
} from "@/hooks/useApi";
import type { HudLine, Loan } from "@/lib/types";

const AGENT_COMMISSION_CODE = "agent_commission";

export function LoanOverviewTab({ loan }: { loan: Loan }) {
  const { t } = useTheme();
  const { data: prequals = [], isLoading: prequalLoading } = useLoanPrequalRequests(loan.id);
  const { data: workflow = [], isLoading: wfLoading } = useLoanWorkflow(loan.id);
  const { data: docs = [], isLoading: docsLoading } = useDocuments(loan.id);
  const { data: hudLines = [], isLoading: hudLoading } = useHudLines(loan.id);

  const agentCommissionLine = useMemo(() => {
    return hudLines.find(
      (l: HudLine) =>
        l.code === AGENT_COMMISSION_CODE ||
        l.label.toLowerCase().includes("agent commission"),
    );
  }, [hudLines]);

  const otherHudLines = useMemo(
    () => hudLines.filter((l: HudLine) => l.id !== agentCommissionLine?.id),
    [hudLines, agentCommissionLine],
  );

  // Conditions + documents totals for the section pills.
  const openConditions = workflow.filter(
    (c) => c.status !== "verified" && c.status !== "skipped",
  );
  const openDocs = docs.filter(
    (d) => d.status === "pending" || d.status === "requested",
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 1 — Current loan terms */}
      <LoanTermsCard t={t} loan={loan} />

      {/* 2 — Amortization */}
      <AmortizationCard t={t} loan={loan} />

      {/* 3 — Agent commission */}
      <AgentCommissionCard
        t={t}
        loan={loan}
        existing={agentCommissionLine}
        loading={hudLoading}
      />

      {/* 4 — All other HUD lines, read-only */}
      <HudReadOnlyCard t={t} lines={otherHudLines} loading={hudLoading} />

      {/* 5 — Prequalifications */}
      <PrequalListCard t={t} prequals={prequals} loading={prequalLoading} />

      {/* 6 — Conditions */}
      <ConditionsCard t={t} workflow={workflow} loading={wfLoading} openCount={openConditions.length} />

      {/* 7 — Documents */}
      <DocumentsReadOnlyCard t={t} docs={docs} loading={docsLoading} openCount={openDocs.length} />
    </div>
  );
}


// ── 1. Current loan terms ────────────────────────────────────────────


function LoanTermsCard({ t, loan }: { t: ReturnType<typeof useTheme>["t"]; loan: Loan }) {
  const fmt$ = (n: number | null | undefined) =>
    n == null ? "—" : `$${Number(n).toLocaleString()}`;
  const fmtRate = (n: number | null | undefined) =>
    n == null ? "—" : `${(Number(n) * 100).toFixed(3)}%`;
  const fmtPct = (n: number | null | undefined) =>
    n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <SectionLabel>Loan terms</SectionLabel>
        <span style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.2 }}>
          {loan.deal_id}
        </span>
        <Pill>{loan.stage}</Pill>
        <Pill>{loan.type.replace(/_/g, " ")}</Pill>
        {loan.purpose ? <Pill>{loan.purpose.replace(/_/g, " ")}</Pill> : null}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
        <KPI label="Loan amount" value={fmt$(loan.amount)} />
        <KPI label="Base rate" value={fmtRate(loan.base_rate)} />
        <KPI label="Final rate" value={fmtRate(loan.final_rate)} />
        <KPI label="Term" value={loan.term_months ? `${loan.term_months} mo` : "—"} />
        <KPI label="LTV" value={fmtPct(loan.ltv)} />
        <KPI label="LTC" value={fmtPct(loan.ltc)} />
        <KPI label="ARV" value={fmt$(loan.arv)} />
        <KPI label="DSCR" value={loan.dscr != null ? Number(loan.dscr).toFixed(2) : "—"} />
        <KPI label="Monthly rent" value={fmt$(loan.monthly_rent)} />
        <KPI label="Close date" value={loan.close_date ? new Date(loan.close_date).toLocaleDateString() : "—"} />
      </div>
    </Card>
  );
}


// ── 2. Amortization (client-side compute) ────────────────────────────


function AmortizationCard({ t, loan }: { t: ReturnType<typeof useTheme>["t"]; loan: Loan }) {
  const download = useDownloadTermSheet();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const rate = loan.final_rate ?? loan.base_rate;
  const term = loan.term_months;
  const principal = Number(loan.amount || 0);
  const schedule = useMemo(
    () => buildSchedule(principal, rate, term),
    [principal, rate, term],
  );

  async function onDownload() {
    setBusy(true);
    setErr(null);
    try {
      const blob = await download.mutateAsync({ loanId: loan.id });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
      // Revoke after the new tab has had a moment to load it.
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't generate PDF");
    } finally {
      setBusy(false);
    }
  }

  if (schedule.length === 0) {
    return (
      <Card pad={16}>
        <SectionLabel>Amortization</SectionLabel>
        <div style={{ marginTop: 6, fontSize: 13, color: t.ink3 }}>
          Schedule is unavailable — the loan needs an amount, rate, and term before we can compute it.
        </div>
      </Card>
    );
  }

  const monthly = schedule[0].principal + schedule[0].interest;
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const visible = showAll ? schedule : schedule.slice(0, 12);

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <SectionLabel>Amortization</SectionLabel>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button onClick={onDownload} disabled={busy} style={btnSecondary(t)}>
            <Icon name="doc" size={11} /> {busy ? "Generating…" : "Download term sheet PDF"}
          </button>
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 12 }}>
        <KPI label="Monthly P+I" value={`$${monthly.toFixed(2)}`} />
        <KPI label="Total interest" value={`$${totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} />
        <KPI label="Payments" value={`${schedule.length}`} />
      </div>
      {err ? <div style={{ fontSize: 12, color: t.danger, marginBottom: 8 }}>{err}</div> : null}
      <div style={{ border: `1px solid ${t.line}`, borderRadius: 8, overflow: "hidden" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px 1fr 1fr 1fr 1fr",
            background: t.surface2,
            padding: "8px 12px",
            fontSize: 10.5,
            fontWeight: 800,
            color: t.ink3,
            letterSpacing: 0.6,
            textTransform: "uppercase",
          }}
        >
          <div>#</div>
          <div>Payment</div>
          <div>Principal</div>
          <div>Interest</div>
          <div style={{ textAlign: "right" }}>Balance</div>
        </div>
        {visible.map((row) => (
          <div
            key={row.n}
            style={{
              display: "grid",
              gridTemplateColumns: "60px 1fr 1fr 1fr 1fr",
              padding: "6px 12px",
              borderTop: `1px solid ${t.line}`,
              fontSize: 12,
              color: t.ink2,
              fontFeatureSettings: '"tnum"',
            }}
          >
            <div>{row.n}</div>
            <div>${(row.principal + row.interest).toFixed(2)}</div>
            <div>${row.principal.toFixed(2)}</div>
            <div>${row.interest.toFixed(2)}</div>
            <div style={{ textAlign: "right" }}>${row.balance.toFixed(2)}</div>
          </div>
        ))}
      </div>
      {schedule.length > 12 ? (
        <button
          onClick={() => setShowAll((v) => !v)}
          style={{
            marginTop: 8,
            padding: "5px 12px",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink2,
            cursor: "pointer",
          }}
        >
          {showAll ? "Show first 12 only" : `Show all ${schedule.length} payments`}
        </button>
      ) : null}
    </Card>
  );
}

interface ScheduleRow {
  n: number;
  principal: number;
  interest: number;
  balance: number;
}

function buildSchedule(
  principal: number,
  rate: number | null | undefined,
  termMonths: number | null | undefined,
): ScheduleRow[] {
  if (!principal || !rate || !termMonths || termMonths <= 0) return [];
  const r = Number(rate) / 12; // monthly rate (rate field is annual decimal)
  const n = Math.floor(termMonths);
  const payment = r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
  const rows: ScheduleRow[] = [];
  let balance = principal;
  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const principalPart = payment - interest;
    balance = Math.max(0, balance - principalPart);
    rows.push({ n: i, principal: principalPart, interest, balance });
  }
  return rows;
}


// ── 3. Agent commission (the only editable HUD line) ─────────────────


function AgentCommissionCard({
  t,
  loan,
  existing,
  loading,
}: {
  t: ReturnType<typeof useTheme>["t"];
  loan: Loan;
  existing: HudLine | undefined;
  loading: boolean;
}) {
  const create = useCreateHudLine(loan.id);
  const update = useUpdateHudLine();
  // Derive the % the agent will see from the existing $ amount, so
  // edits round-trip without surprise. Stored as $; UI works in %.
  const principal = Number(loan.amount || 0);
  const initialPct = existing && principal > 0 ? ((existing.amount / principal) * 100).toFixed(3) : "";
  const [pct, setPct] = useState<string>(initialPct);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const pctNum = pct ? Number(pct) : 0;
  const dollarPreview = principal && Number.isFinite(pctNum) ? (pctNum / 100) * principal : 0;

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const amount = Math.round(dollarPreview * 100) / 100;
      if (existing) {
        await update.mutateAsync({ loanId: loan.id, lineId: existing.id, amount });
      } else {
        await create.mutateAsync({
          code: AGENT_COMMISSION_CODE,
          label: "Agent Commission",
          category: "variable",
          amount,
        });
      }
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <SectionLabel>Agent commission</SectionLabel>
        <span style={{ fontSize: 11, color: t.ink3 }}>
          Set as a percentage of the loan amount — the system converts to a $ figure on the HUD.
        </span>
      </div>
      {loading ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>Loading HUD…</div>
      ) : (
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: 12, alignItems: "end" }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Commission %
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
              <input
                type="number"
                step="0.001"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="e.g. 2.5"
                style={{
                  width: 140,
                  padding: 8,
                  fontSize: 14,
                  borderRadius: 6,
                  border: `1px solid ${t.line}`,
                  background: t.surface,
                  color: t.ink,
                }}
              />
              <span style={{ fontSize: 14, color: t.ink3 }}>%</span>
            </div>
          </label>
          <div>
            <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase" }}>
              Computed $
            </div>
            <div style={{ marginTop: 4, padding: "8px 12px", fontSize: 14, color: t.ink, fontWeight: 800, fontFeatureSettings: '"tnum"', background: t.surface2, borderRadius: 6 }}>
              ${dollarPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {err ? <span style={{ fontSize: 12, color: t.danger }}>{err}</span> : null}
            {savedAt && !err ? <span style={{ fontSize: 11, color: t.ink3 }}>Saved</span> : null}
            <button onClick={save} disabled={busy || !pct} style={btnPrimary(t, busy || !pct)}>
              {busy ? "Saving…" : existing ? "Update commission" : "Add commission"}
            </button>
          </div>
        </div>
      )}
      <div style={{ marginTop: 10, fontSize: 11, color: t.ink3 }}>
        Agents can edit only this row. All other HUD lines below are read-only — the funding team
        manages them on /loans/{loan.deal_id}.
      </div>
    </Card>
  );
}


// ── 4. All HUD lines, read-only ─────────────────────────────────────


function HudReadOnlyCard({
  t,
  lines,
  loading,
}: {
  t: ReturnType<typeof useTheme>["t"];
  lines: HudLine[];
  loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  if (loading) {
    return (
      <Card pad={16}>
        <SectionLabel>Settlement statement</SectionLabel>
        <div style={{ marginTop: 6, fontSize: 13, color: t.ink3 }}>Loading…</div>
      </Card>
    );
  }
  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <SectionLabel>Settlement statement</SectionLabel>
        <Pill>{lines.length} lines</Pill>
        <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 800, color: t.ink2, fontFeatureSettings: '"tnum"' }}>
          ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: "4px 10px",
            fontSize: 11,
            fontWeight: 700,
            borderRadius: 6,
            border: `1px solid ${t.line}`,
            background: t.surface,
            color: t.ink2,
            cursor: "pointer",
          }}
        >
          {open ? "Hide" : "View"}
        </button>
      </div>
      {open ? (
        <div style={{ marginTop: 10, border: `1px solid ${t.line}`, borderRadius: 8, overflow: "hidden" }}>
          {lines.map((l) => (
            <div
              key={l.id}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 140px",
                padding: "8px 12px",
                borderTop: `1px solid ${t.line}`,
                fontSize: 12,
                background: t.surface,
              }}
            >
              <div style={{ fontFamily: "ui-monospace, SF Mono, monospace", color: t.ink3, fontSize: 11, letterSpacing: 0.4 }}>
                {l.code}
              </div>
              <div style={{ color: t.ink }}>{l.label}</div>
              <div style={{ textAlign: "right", color: t.ink, fontWeight: 700, fontFeatureSettings: '"tnum"' }}>
                ${Number(l.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </Card>
  );
}


// ── 5. Prequalifications ────────────────────────────────────────────


function PrequalListCard({
  t,
  prequals,
  loading,
}: {
  t: ReturnType<typeof useTheme>["t"];
  prequals: Array<{
    id: string;
    status: string;
    created_at: string;
    loan_type: string;
    purchase_price?: number;
    requested_loan_amount?: number;
    approved_loan_amount?: number | null;
    pdf_url?: string | null;
    target_property_address?: string;
  }>;
  loading: boolean;
}) {
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SectionLabel>Pre-approvals</SectionLabel>
        <Pill>{prequals.length}</Pill>
      </div>
      {loading ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>Loading…</div>
      ) : prequals.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>
          No prequalification history yet for this loan.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {prequals.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 8,
                background: t.surface2,
                border: `1px solid ${t.line}`,
              }}
            >
              <Icon name="docCheck" size={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Pill>{p.status}</Pill>
                  <span style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>
                    {p.loan_type?.toUpperCase()}
                  </span>
                  {p.approved_loan_amount != null ? (
                    <span style={{ fontSize: 12, color: t.brand, fontWeight: 700 }}>
                      Approved ${Number(p.approved_loan_amount).toLocaleString()}
                    </span>
                  ) : p.requested_loan_amount != null ? (
                    <span style={{ fontSize: 12, color: t.ink2, fontWeight: 600 }}>
                      Requested ${Number(p.requested_loan_amount).toLocaleString()}
                    </span>
                  ) : null}
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                  {p.target_property_address ? `${p.target_property_address} · ` : ""}
                  {new Date(p.created_at).toLocaleDateString()}
                </div>
              </div>
              {p.pdf_url ? (
                <a
                  href={p.pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: "5px 12px",
                    fontSize: 12,
                    fontWeight: 700,
                    borderRadius: 6,
                    border: `1px solid ${t.line}`,
                    background: t.surface,
                    color: t.ink,
                    cursor: "pointer",
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  <Icon name="doc" size={11} /> Download PDF
                </a>
              ) : (
                <span style={{ fontSize: 11, color: t.ink3, fontStyle: "italic" }}>No PDF yet</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// ── 6. Conditions (read-only) ────────────────────────────────────────


function ConditionsCard({
  t,
  workflow,
  loading,
  openCount,
}: {
  t: ReturnType<typeof useTheme>["t"];
  workflow: Array<{
    document_id: string;
    name: string;
    status: string;
    category?: string | null;
    days_until_due?: number | null;
  }>;
  loading: boolean;
  openCount: number;
}) {
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SectionLabel>Conditions</SectionLabel>
        <Pill>{workflow.length}</Pill>
        {openCount > 0 ? (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: t.warn, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {openCount} open
          </span>
        ) : null}
      </div>
      {loading ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>Loading…</div>
      ) : workflow.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>
          No conditions on file yet — the funding team adds these as the loan progresses.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {workflow.map((c) => (
            <div
              key={c.document_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 8,
                background: t.surface2,
                border: `1px solid ${t.line}`,
              }}
            >
              <Icon name="docCheck" size={14} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{c.name}</div>
                {c.days_until_due != null ? (
                  <div style={{ fontSize: 11, color: c.days_until_due < 0 ? t.danger : t.ink3, marginTop: 2 }}>
                    {c.days_until_due < 0
                      ? `${Math.abs(c.days_until_due)}d overdue`
                      : c.days_until_due === 0
                      ? "Due today"
                      : `${c.days_until_due}d to go`}
                  </div>
                ) : null}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: c.status === "verified" ? t.brandSoft : t.chip,
                  color: c.status === "verified" ? t.brand : t.ink2,
                  textTransform: "uppercase",
                }}
              >
                {c.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// ── 7. Documents (read-only) ─────────────────────────────────────────


function DocumentsReadOnlyCard({
  t,
  docs,
  loading,
  openCount,
}: {
  t: ReturnType<typeof useTheme>["t"];
  docs: Array<{ id: string; name: string; status: string }>;
  loading: boolean;
  openCount: number;
}) {
  return (
    <Card pad={16}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <SectionLabel>Loan documents</SectionLabel>
        <Pill>{docs.length}</Pill>
        {openCount > 0 ? (
          <span style={{ fontSize: 10.5, fontWeight: 800, color: t.warn, letterSpacing: 0.4, textTransform: "uppercase" }}>
            {openCount} outstanding
          </span>
        ) : null}
      </div>
      {loading ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>Loading…</div>
      ) : docs.length === 0 ? (
        <div style={{ marginTop: 10, fontSize: 13, color: t.ink3 }}>
          No loan documents yet. Funding-side uploads will appear here as the borrower submits them.
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          {docs.map((d) => (
            <div
              key={d.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: 10,
                borderRadius: 8,
                background: t.surface2,
                border: `1px solid ${t.line}`,
              }}
            >
              <Icon name="doc" size={14} />
              <div style={{ flex: 1, fontSize: 13, color: t.ink, fontWeight: 600 }}>{d.name}</div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: d.status === "verified" ? t.brandSoft : t.chip,
                  color: d.status === "verified" ? t.brand : t.ink2,
                  textTransform: "uppercase",
                }}
              >
                {d.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}


// ── shared button styles ────────────────────────────────────────────


function btnPrimary(t: ReturnType<typeof useTheme>["t"], disabled: boolean): React.CSSProperties {
  return {
    padding: "7px 14px",
    fontSize: 12,
    fontWeight: 800,
    borderRadius: 6,
    border: "none",
    background: t.brand,
    color: t.inverse,
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

function btnSecondary(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    padding: "6px 12px",
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 6,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink2,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  };
}
