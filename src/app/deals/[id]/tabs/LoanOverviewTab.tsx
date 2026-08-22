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
import { Icon } from "@/components/design-system/Icon";
import { Btn, BtnLink, Callout, CellChip, Empty, Field, Input, ItemRow, Kpi, KpiRow, Panel, Sub, Table, Tag, Td, Tr } from "@/components/ds";
import {
  useCreateHudLine,
  useDocuments,
  useDownloadTermSheet,
  useHudLines,
  useLoanPrequalRequests,
  useLoanWorkflow,
  useUpdateHudLine,
} from "@/hooks/useApi";
import type { DSTaskRow, HudLine, Loan } from "@/lib/types";

const AGENT_COMMISSION_CODE = "agent_commission";

export function LoanOverviewTab({
  loan,
  pendingBorrowerRows = [],
  pendingCreditRows = [],
}: {
  loan: Loan;
  // Open borrower_info / credit requirements lifted out of the AI
  // Resolution Queue. The AI can't fill these — they have to be set
  // on the borrower / credit record. We surface the list at the top
  // of the tab so the agent knows what's pending without hunting.
  pendingBorrowerRows?: DSTaskRow[];
  pendingCreditRows?: DSTaskRow[];
}) {
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
    <div className="grid">
      {pendingBorrowerRows.length + pendingCreditRows.length > 0 ? (
        <BorrowerCreditCallout
          borrowerRows={pendingBorrowerRows}
          creditRows={pendingCreditRows}
          clientId={loan.client_id}
        />
      ) : null}

      {/* 1 — Current loan terms */}
      <LoanTermsCard loan={loan} />

      {/* 2 — Amortization */}
      <AmortizationCard loan={loan} />

      {/* 3 — Agent commission */}
      <AgentCommissionCard loan={loan} existing={agentCommissionLine} loading={hudLoading} />

      {/* 4 — All other HUD lines, read-only */}
      <HudReadOnlyCard lines={otherHudLines} loading={hudLoading} />

      {/* 5 — Prequalifications */}
      <PrequalListCard prequals={prequals} loading={prequalLoading} />

      {/* 6 — Conditions */}
      <ConditionsCard workflow={workflow} loading={wfLoading} openCount={openConditions.length} />

      {/* 7 — Documents */}
      <DocumentsReadOnlyCard docs={docs} loading={docsLoading} openCount={openDocs.length} />
    </div>
  );
}

/** Shared loading line, so all seven sections say it the same way. */
function Loading({ what = "" }: { what?: string }) {
  return <Sub>{what ? `Loading ${what}…` : "Loading…"}</Sub>;
}


// ── 0. Borrower + credit fields the AI can't fill ───────────────────


function BorrowerCreditCallout({
  borrowerRows,
  creditRows,
  clientId,
}: {
  borrowerRows: DSTaskRow[];
  creditRows: DSTaskRow[];
  clientId: string;
}) {
  const items = [
    ...borrowerRows.map((r) => ({ key: r.requirement_key, label: r.label, kind: "Borrower" as const })),
    ...creditRows.map((r) => ({ key: r.requirement_key, label: r.label, kind: "Credit" as const })),
  ];
  if (items.length === 0) return null;
  return (
    <Callout tone="bad" icon={<Icon name="alert" size={15} stroke={2.2} />}>
      <b style={{ fontSize: 13 }}>
        {items.length} borrower / credit field{items.length === 1 ? "" : "s"} need data
      </b>
      <Sub>
        The AI can&apos;t fill these for you. Update them on the client profile to clear the badge.
      </Sub>
      <div className="grid g4" style={{ margin: "8px 0 10px" }}>
        {items.slice(0, 6).map((it) => (
          <div key={it.key} className="row" style={{ gap: 8, fontSize: 12 }}>
            <span className="mlbl">{it.kind}</span>
            {it.label}
          </div>
        ))}
        {items.length > 6 ? <Sub>+{items.length - 6} more…</Sub> : null}
      </div>
      <BtnLink href={`/clients/${clientId}/workspace`} size="sm">
        Open client profile <Icon name="chevR" size={11} />
      </BtnLink>
    </Callout>
  );
}


// ── 1. Current loan terms ────────────────────────────────────────────


function LoanTermsCard({ loan }: { loan: Loan }) {
  const fmt$ = (n: number | null | undefined) =>
    n == null ? "—" : `$${Number(n).toLocaleString()}`;
  const fmtRate = (n: number | null | undefined) =>
    n == null ? "—" : `${(Number(n) * 100).toFixed(3)}%`;
  const fmtPct = (n: number | null | undefined) =>
    n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;
  return (
    <Panel
      title="Loan terms"
      actions={
        <>
          <span className="lbl">{loan.deal_id}</span>
          <Tag>{loan.stage}</Tag>
          <Tag>{loan.type.replace(/_/g, " ")}</Tag>
          {loan.purpose ? <Tag>{loan.purpose.replace(/_/g, " ")}</Tag> : null}
        </>
      }
    >
      <KpiRow>
        <Kpi label="Loan amount" value={fmt$(loan.amount)} />
        <Kpi label="Base rate" value={fmtRate(loan.base_rate)} />
        <Kpi label="Final rate" value={fmtRate(loan.final_rate)} />
        <Kpi label="Term" value={loan.term_months ? `${loan.term_months} mo` : "—"} />
        <Kpi label="LTV" value={fmtPct(loan.ltv)} />
        <Kpi label="LTC" value={fmtPct(loan.ltc)} />
        <Kpi label="ARV" value={fmt$(loan.arv)} />
        <Kpi label="DSCR" value={loan.dscr != null ? Number(loan.dscr).toFixed(2) : "—"} />
        <Kpi label="Monthly rent" value={fmt$(loan.monthly_rent)} />
        <Kpi
          label="Close date"
          value={loan.close_date ? new Date(loan.close_date).toLocaleDateString() : "—"}
        />
      </KpiRow>
    </Panel>
  );
}


// ── 2. Amortization (client-side compute) ────────────────────────────


function AmortizationCard({ loan }: { loan: Loan }) {
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
      <Panel title="Amortization">
        <Sub>
          Schedule is unavailable — the loan needs an amount, rate, and term before we can
          compute it.
        </Sub>
      </Panel>
    );
  }

  const monthly = schedule[0].principal + schedule[0].interest;
  const totalInterest = schedule.reduce((s, r) => s + r.interest, 0);
  const visible = showAll ? schedule : schedule.slice(0, 12);

  return (
    <Panel
      title="Amortization"
      actions={
        <Btn onClick={onDownload} disabled={busy} size="sm">
          <Icon name="doc" size={11} /> {busy ? "Generating…" : "Download term sheet PDF"}
        </Btn>
      }
    >
      <KpiRow>
        <Kpi label="Monthly P+I" value={`$${monthly.toFixed(2)}`} />
        <Kpi
          label="Total interest"
          value={`$${totalInterest.toLocaleString(undefined, { maximumFractionDigits: 0 })}`}
        />
        <Kpi label="Payments" value={`${schedule.length}`} />
      </KpiRow>
      {err ? (
        <div className="warnline" style={{ margin: "12px 0 0" }}>
          {err}
        </div>
      ) : null}
      <div style={{ marginTop: 14 }}>
        <Table
          caption="Amortization schedule"
          cols={[
            { label: "#", width: 60 },
            { label: "Payment" },
            { label: "Principal" },
            { label: "Interest" },
            { label: "Balance", align: "r" },
          ]}
        >
          {visible.map((row) => (
            <Tr key={row.n} className="num">
              <Td>{row.n}</Td>
              <Td>${(row.principal + row.interest).toFixed(2)}</Td>
              <Td>${row.principal.toFixed(2)}</Td>
              <Td>${row.interest.toFixed(2)}</Td>
              <Td align="r">${row.balance.toFixed(2)}</Td>
            </Tr>
          ))}
        </Table>
      </div>
      {schedule.length > 12 ? (
        <Btn size="sm" onClick={() => setShowAll((v) => !v)} style={{ marginTop: 10 }}>
          {showAll ? "Show first 12 only" : `Show all ${schedule.length} payments`}
        </Btn>
      ) : null}
    </Panel>
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
  loan,
  existing,
  loading,
}: {
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
    <Panel
      title="Agent commission"
      sub="Set as a percentage of the loan amount — the system converts to a $ figure on the HUD."
    >
      {loading ? (
        <Loading what="HUD" />
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) auto auto",
            gap: 12,
            alignItems: "end",
          }}
        >
          <Field label="Commission %">
            <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
              <Input
                type="number"
                step="0.001"
                value={pct}
                onChange={(e) => setPct(e.target.value)}
                placeholder="e.g. 2.5"
                style={{ width: 140 }}
              />
              <span className="sub">%</span>
            </div>
          </Field>
          <Field label="Computed $">
            {/* Deliberately not an Input: it is a readout, and looking like a
                field would invite an agent to type the dollar figure into the
                half of the pair that does not accept it. */}
            <div className="num" style={{ fontSize: 14, fontWeight: 800, padding: "9px 12px", background: "var(--sunken)", borderRadius: 8 }}>
              ${dollarPreview.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>
          </Field>
          <div className="row" style={{ gap: 8, flexWrap: "nowrap" }}>
            {err ? <span style={{ fontSize: 12, color: "var(--danger)" }}>{err}</span> : null}
            {savedAt && !err ? <CellChip tone="ok">Saved</CellChip> : null}
            <Btn variant="pri" onClick={save} disabled={busy || !pct}>
              {busy ? "Saving…" : existing ? "Update commission" : "Add commission"}
            </Btn>
          </div>
        </div>
      )}
      <Sub className="mt">
        Agents can edit only this row. All other HUD lines below are read-only — the funding
        team manages them on /loans/{loan.deal_id}.
      </Sub>
    </Panel>
  );
}


// ── 4. All HUD lines, read-only ─────────────────────────────────────


function HudReadOnlyCard({ lines, loading }: { lines: HudLine[]; loading: boolean }) {
  const [open, setOpen] = useState(false);
  if (loading) {
    return (
      <Panel title="Settlement statement">
        <Loading />
      </Panel>
    );
  }
  if (lines.length === 0) return null;
  const total = lines.reduce((s, l) => s + Number(l.amount || 0), 0);
  return (
    <Panel
      title="Settlement statement"
      actions={
        <>
          <Tag>{lines.length} lines</Tag>
          <span className="num" style={{ fontSize: 12.5, fontWeight: 800 }}>
            ${total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          <Btn size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
            {open ? "Hide" : "View"}
          </Btn>
        </>
      }
      noPad
    >
      {open ? (
        <Table
          caption="Settlement statement lines"
          cols={[
            { label: "Code", width: 120 },
            { label: "Line" },
            { label: "Amount", align: "r", width: 150 },
          ]}
        >
          {lines.map((l) => (
            <Tr key={l.id}>
              <Td>
                <span className="lbl" style={{ letterSpacing: "0.04em" }}>
                  {l.code}
                </span>
              </Td>
              <Td>{l.label}</Td>
              <Td align="r">
                <span className="num" style={{ fontWeight: 700 }}>
                  ${Number(l.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </Td>
            </Tr>
          ))}
        </Table>
      ) : null}
    </Panel>
  );
}


// ── 5. Prequalifications ────────────────────────────────────────────


function PrequalListCard({
  prequals,
  loading,
}: {
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
    <Panel title="Pre-approvals" actions={<Tag>{prequals.length}</Tag>}>
      {loading ? (
        <Loading />
      ) : prequals.length === 0 ? (
        <Empty>
          No prequalification history yet for this loan.
        </Empty>
      ) : (
        <div>
          {prequals.map((p) => (
            <ItemRow
              key={p.id}
              icon={<Icon name="docCheck" size={15} />}
              right={
                p.pdf_url ? (
                  <BtnLink href={p.pdf_url} target="_blank" rel="noopener noreferrer" size="sm">
                    <Icon name="doc" size={11} /> Download PDF
                  </BtnLink>
                ) : (
                  <Sub>
                    <i>No PDF yet</i>
                  </Sub>
                )
              }
            >
              <div className="row" style={{ gap: 8 }}>
                <CellChip tone={p.status === "approved" ? "ok" : "mut"}>{p.status}</CellChip>
                <b style={{ fontSize: 13 }}>{p.loan_type?.toUpperCase()}</b>
                {p.approved_loan_amount != null ? (
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--accent)" }}>
                    Approved ${Number(p.approved_loan_amount).toLocaleString()}
                  </span>
                ) : p.requested_loan_amount != null ? (
                  <span style={{ fontSize: 12, fontWeight: 600 }}>
                    Requested ${Number(p.requested_loan_amount).toLocaleString()}
                  </span>
                ) : null}
              </div>
              <Sub>
                {p.target_property_address ? `${p.target_property_address} · ` : ""}
                {new Date(p.created_at).toLocaleDateString()}
              </Sub>
            </ItemRow>
          ))}
        </div>
      )}
    </Panel>
  );
}


// ── 6. Conditions (read-only) ────────────────────────────────────────


function ConditionsCard({
  workflow,
  loading,
  openCount,
}: {
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
    <Panel
      title="Conditions"
      actions={
        <>
          <Tag>{workflow.length}</Tag>
          {openCount > 0 ? <CellChip tone="warn">{openCount} open</CellChip> : null}
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : workflow.length === 0 ? (
        <Empty>
          No conditions on file yet — the funding team adds these as the loan progresses.
        </Empty>
      ) : (
        <div>
          {workflow.map((c) => (
            <ItemRow
              key={c.document_id}
              icon={<Icon name="docCheck" size={15} />}
              right={
                <CellChip tone={c.status === "verified" ? "ok" : "mut"}>{c.status}</CellChip>
              }
            >
              <b style={{ fontSize: 13 }}>{c.name}</b>
              {c.days_until_due != null ? (
                <div
                  style={{
                    fontSize: 11.5,
                    marginTop: 2,
                    color: c.days_until_due < 0 ? "var(--danger)" : "var(--muted)",
                  }}
                >
                  {c.days_until_due < 0
                    ? `${Math.abs(c.days_until_due)}d overdue`
                    : c.days_until_due === 0
                    ? "Due today"
                    : `${c.days_until_due}d to go`}
                </div>
              ) : null}
            </ItemRow>
          ))}
        </div>
      )}
    </Panel>
  );
}


// ── 7. Documents (read-only) ─────────────────────────────────────────


function DocumentsReadOnlyCard({
  docs,
  loading,
  openCount,
}: {
  docs: Array<{ id: string; name: string; status: string }>;
  loading: boolean;
  openCount: number;
}) {
  return (
    <Panel
      title="Loan documents"
      actions={
        <>
          <Tag>{docs.length}</Tag>
          {openCount > 0 ? <CellChip tone="warn">{openCount} outstanding</CellChip> : null}
        </>
      }
    >
      {loading ? (
        <Loading />
      ) : docs.length === 0 ? (
        <Empty>
          No loan documents yet. Funding-side uploads will appear here as the borrower submits
          them.
        </Empty>
      ) : (
        <div>
          {docs.map((d) => (
            <ItemRow
              key={d.id}
              icon={<Icon name="doc" size={15} />}
              right={
                <CellChip tone={d.status === "verified" ? "ok" : "mut"}>{d.status}</CellChip>
              }
            >
              <b style={{ fontSize: 13, fontWeight: 600 }}>{d.name}</b>
            </ItemRow>
          ))}
        </div>
      )}
    </Panel>
  );
}
