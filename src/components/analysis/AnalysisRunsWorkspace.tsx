"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/lib/fmt";
import {
  CellChip,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Lbl,
  PageHeader,
  Panel,
  Row,
  Sub,
  Td,
} from "@/components/ds";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { FinancialInsightPanel } from "@/components/analysis/FinancialInsightPanel";
import { useClients } from "@/hooks/useApi";
import type { AnalysisRun } from "@/lib/types";

export interface AnalysisRunAction {
  label: string;
  description?: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
  disabledHint?: string;
}

const PRODUCT_LABEL: Record<AnalysisRun["product"], string> = {
  dscr_purchase: "DSCR purchase",
  dscr_refi: "DSCR refi",
  fix_flip: "Fix & Flip",
};

const SOURCE_LABEL: Record<AnalysisRun["tool_source"], string> = {
  deal_analyzer: "Analyzer",
  simulator: "Simulator",
  loan_recalc: "File recalc",
};

/** `r` right-aligns the figure column via `.tbl .r`. */
const RUN_COLS: Array<{ label: string; align?: "r" }> = [
  { label: "Run" },
  { label: "Client" },
  { label: "Product" },
  { label: "Amount", align: "r" },
  { label: "Metric" },
  { label: "State" },
  { label: "Updated" },
];

function dateLabel(iso: string, withTime = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const base = `${months[date.getUTCMonth()]} ${date.getUTCDate()}`;
  if (!withTime) return base;
  const hours = date.getUTCHours();
  const mins = String(date.getUTCMinutes()).padStart(2, "0");
  const hour12 = hours % 12 || 12;
  return `${base}, ${hour12}:${mins} ${hours >= 12 ? "PM" : "AM"} UTC`;
}

function readNumber(payload: Record<string, unknown> | null | undefined, keys: string[]) {
  if (!payload) return null;
  for (const key of keys) {
    const value = payload[key];
    const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

function amountFor(run: AnalysisRun) {
  return (
    readNumber(run.inputs, ["requested_loan_amount", "loan_amount", "amount", "purchase_price", "property_value", "market_value"]) ??
    readNumber(run.calculator_output, ["loan_amount", "loanAmount", "maxLoan", "requested_loan_amount"])
  );
}

function metricFor(run: AnalysisRun) {
  const dscr = readNumber(run.calculator_output, ["dscr"]);
  if (dscr) return `${dscr.toFixed(2)}x DSCR`;
  const rate = readNumber(run.calculator_output, ["final_rate", "rate"]);
  if (rate) return `${(rate * 100).toFixed(3)}%`;
  const cash = readNumber(run.calculator_output, ["total_cash_to_close", "cash_to_close_pricing", "estimatedCashToClose", "cashToClose"]);
  if (cash) return `${QC_FMT.usd(cash, 0)} cash`;
  return "-";
}

function titleFor(run: AnalysisRun) {
  return run.title || run.target_property_address || "Saved run";
}

function clientNameFor(run: AnalysisRun, clients: Array<{ id: string; name?: string | null }>) {
  if (!run.client_id) return "Unlinked";
  return clients.find((client) => client.id === run.client_id)?.name ?? "Linked client";
}

export function AnalysisRunsTable({
  title,
  description,
  emptyText,
  runs,
  loading,
  onOpen,
  actions = [],
}: {
  title: string;
  description: string;
  emptyText: string;
  runs: AnalysisRun[];
  loading?: boolean;
  onOpen: (runId: string) => void;
  actions?: AnalysisRunAction[];
}) {
  const router = useRouter();
  const { data: clients = [] } = useClients("mine");
  const rowMenu = useContextMenu<AnalysisRun>();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      runs
        .slice()
        .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
        .filter((run) => {
          if (!q) return true;
          const clientName = clientNameFor(run, clients);
          return [
            titleFor(run),
            run.target_property_address,
            clientName,
            PRODUCT_LABEL[run.product],
            SOURCE_LABEL[run.tool_source],
            run.status,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q);
        }),
    [clients, q, runs],
  );

  return (
    <div className="grid">
      <PageHeader
        title={title}
        lede={description}
        actions={actions.length ? <AnalysisActionsMenu actions={actions} /> : undefined}
      />

      <div className="row">
        <Icon name="search" size={15} className="sub" />
        <Input
          grow
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by client, property, product, or status..."
          aria-label="Search saved runs"
        />
      </div>

      <Panel noPad>
        {/* Hand-rolled rather than the ds `Table` for one reason: the 960px
            floor. Seven columns squeezed into a phone width wrap into mush,
            and `.tbl` carries no min-width, so the table has to state its own
            and let `.tblwrap` scroll it. Everything else here is class-owned. */}
        <div className="tblwrap">
          <table className="tbl" style={{ minWidth: 960 }}>
            <caption className="sr-only">Saved analysis runs</caption>
            <thead>
              <tr>
                {RUN_COLS.map((c) => (
                  <th key={c.label} scope="col" className={c.align === "r" ? "r" : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <Td colSpan={7}>
                    <Sub>Loading runs...</Sub>
                  </Td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <Td colSpan={7}>
                    <Sub>{emptyText}</Sub>
                  </Td>
                </tr>
              ) : (
                filtered.map((run) => {
                  const amount = amountFor(run);
                  return (
                    <tr
                      key={run.id}
                      onClick={() => onOpen(run.id)}
                      onContextMenu={(e) => rowMenu.open(e, run)}
                      title="Right-click for actions"
                      style={{ cursor: "pointer" }}
                    >
                      <Td>
                        {/* Bespoke truncation: a long property address must not push
                            the other six columns off the table. */}
                        <b className="trunc" style={{ display: "block", maxWidth: 360 }}>
                          {titleFor(run)}
                        </b>
                        <div className="sub">{SOURCE_LABEL[run.tool_source] ?? run.tool_source}</div>
                      </Td>
                      <Td>{clientNameFor(run, clients)}</Td>
                      <Td>{PRODUCT_LABEL[run.product] ?? run.product}</Td>
                      <Td align="r" className="num">{amount ? QC_FMT.usd(amount, 0) : "-"}</Td>
                      <Td>{metricFor(run)}</Td>
                      <Td>
                        <Row>
                          <CellChip tone="mut">{run.status.replace(/_/g, " ")}</CellChip>
                          {run.shared_at ? <CellChip tone="ok">Shared</CellChip> : null}
                          {run.prequal_request_id ? <CellChip tone="pet">Prequal</CellChip> : null}
                        </Row>
                      </Td>
                      <Td className="num">{dateLabel(run.updated_at, true)}</Td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      <ContextMenu
        state={rowMenu.state}
        onClose={rowMenu.close}
        items={(run): ContextMenuItem[] => [
          { label: "Open run", icon: "eye", onSelect: () => onOpen(run.id) },
          ...(run.client_id
            ? [{ label: "Open client workspace", icon: "clients", onSelect: () => router.push(`/clients/${run.client_id}/workspace`) }]
            : []),
          ...(run.loan_id
            ? [{ label: "Open funding file", icon: "layers", onSelect: () => router.push(`/loans/${run.loan_id}`) }]
            : []),
          ...(run.prequal_request_id
            ? [{ label: "Open prequalification queue", icon: "docCheck", onSelect: () => router.push("/admin/prequal-requests") }]
            : []),
        ]}
      />
    </div>
  );
}

export function AnalysisRunInspect({
  run,
  loading,
  onBack,
}: {
  run: AnalysisRun | undefined;
  loading?: boolean;
  onBack: () => void;
}) {
  const amount = run ? amountFor(run) : null;
  const metric = run ? metricFor(run) : "-";

  if (loading) {
    return (
      <div className="grid">
        <Panel>
          <Sub>Loading run...</Sub>
        </Panel>
      </div>
    );
  }

  if (!run) {
    return (
      <div className="grid">
        <div className="hd">
          <span className="grow" />
          <CloseButton onClose={onBack} />
        </div>
        <Panel>
          <div>Run not found.</div>
        </Panel>
      </div>
    );
  }

  return (
    <div className="grid">
      <div>
        <Lbl>{SOURCE_LABEL[run.tool_source] ?? run.tool_source}</Lbl>
        <PageHeader
          title={titleFor(run)}
          lede={`${PRODUCT_LABEL[run.product] ?? run.product} - updated ${dateLabel(run.updated_at, true)}`}
          actions={<CloseButton onClose={onBack} />}
        />
      </div>

      <KpiRow>
        <Mini label="Amount" value={amount ? QC_FMT.usd(amount, 0) : "-"} />
        <Mini label="Metric" value={metric} />
        <Mini label="Status" value={run.status.replace(/_/g, " ")} />
        <Mini label="Shared" value={run.shared_at ? dateLabel(run.shared_at) : "No"} />
      </KpiRow>

      <FinancialInsightPanel product={run.product} inputs={run.inputs} output={run.calculator_output} />

      <Panel title="Links">
        <Row>
          {run.loan_id ? (
            <Link className="btn" href={`/loans/${run.loan_id}`}>
              <Icon name="layers" size={13} /> Loan file
            </Link>
          ) : null}
          {run.client_id ? (
            <Link className="btn" href={`/clients/${run.client_id}/workspace`}>
              <Icon name="clients" size={13} /> Client workspace
            </Link>
          ) : null}
          {run.prequal_request_id ? (
            <Link className="btn" href="/admin/prequal-requests">
              <Icon name="docCheck" size={13} /> Prequalification queue
            </Link>
          ) : null}
          {!run.loan_id && !run.client_id && !run.prequal_request_id ? (
            <Sub>This run is not linked to a client, loan, or prequalification yet.</Sub>
          ) : null}
        </Row>
      </Panel>

      <Panel title="Saved report">
        {run.ai_report ? (
          <ReportBlock report={run.ai_report} />
        ) : run.sanitized_client_report ? (
          <ReportBlock report={run.sanitized_client_report} />
        ) : (
          <Sub>No generated report is attached to this run yet.</Sub>
        )}
      </Panel>
    </div>
  );
}

function ReportBlock({ report }: { report: Record<string, unknown> }) {
  const narrative = String(report.narrative ?? report.summary ?? "");
  const strengths = Array.isArray(report.strengths) ? report.strengths : [];
  const risks = Array.isArray(report.weaknesses) ? report.weaknesses : Array.isArray(report.risks) ? report.risks : [];
  const points = [...strengths.slice(0, 4), ...risks.slice(0, 4)];
  return (
    <div>
      {narrative ? <p>{narrative}</p> : null}
      {points.length ? (
        <div className={narrative ? "mt" : undefined}>
          {points.map((item, idx) => (
            <div className="req" key={idx}>
              <span className="ic ok">
                <Icon name="check" size={11} />
              </span>
              <span>{String(item)}</span>
            </div>
          ))}
        </div>
      ) : !narrative ? (
        <Sub>Report data is present, but no narrative fields were found.</Sub>
      ) : null}
    </div>
  );
}

export function AnalysisActionsMenu({ actions }: { actions: AnalysisRunAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="popwrap">
      <button
        type="button"
        className="btn"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Icon name="plus" size={13} />
        Actions
        <Icon name={open ? "chevU" : "chevD"} size={12} />
      </button>
      {open ? (
        // Fixed width: the descriptions wrap, so without one the menu sizes to
        // its longest sentence.
        <div role="menu" className="popmenu" style={{ width: 268 }}>
          {actions.map((action) => (
            <ActionRow
              key={action.label}
              action={action}
              disabled={action.disabled}
              onSelect={() => {
                if (action.disabled) return;
                setOpen(false);
                action.onClick();
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AnalysisFloatingAction({
  label = "Start a new run",
  actions,
}: {
  label?: string;
  actions: AnalysisRunAction[];
}) {
  const [open, setOpen] = useState(false);
  return (
    // Bespoke: a viewport-anchored FAB. Nothing in the sheet floats.
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 90 }}>
      {open ? (
        <div role="menu" className="panel" style={{ width: 286, marginBottom: 10 }}>
          {actions.map((action) => (
            <ActionRow
              key={action.label}
              action={action}
              onSelect={() => {
                setOpen(false);
                action.onClick();
              }}
            />
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        title={label}
        style={{
          all: "unset",
          cursor: "pointer",
          width: 56,
          height: 56,
          borderRadius: 18,
          background: "var(--petrol)",
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "var(--sh2)",
        }}
      >
        <Icon name={open ? "x" : "plus"} size={24} stroke={2.6} />
      </button>
    </div>
  );
}

/**
 * One menu row shared by the Actions popover and the floating action list.
 *
 * `disabled` is passed in rather than read off `action` on purpose: the
 * floating list has never honoured `action.disabled`, and reading it here
 * would quietly change that behaviour for every caller.
 */
function ActionRow({
  action,
  disabled,
  onSelect,
}: {
  action: AnalysisRunAction;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      className="toollink"
      disabled={disabled}
      onClick={onSelect}
    >
      <Icon name={action.icon ?? "plus"} size={14} />
      {/* A grid stack, so the label, the description and the reason it is
          unavailable are each their own line without three display:block. */}
      <span className="grow grid g4">
        <b>{action.label}</b>
        {action.description ? <span className="sub">{action.description}</span> : null}
        {disabled && action.disabledHint ? (
          <span className="warnline">{action.disabledHint}</span>
        ) : null}
      </span>
    </button>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  // `.knum` is white-space:nowrap, so a long figure needs the clamp or it
  // escapes the tile — the one thing the Kpi wrapper cannot express.
  return (
    <Kpi
      label={label}
      value={<div className="trunc">{value}</div>}
    />
  );
}

function CloseButton({ onClose }: { onClose: () => void }) {
  return (
    <IconBtn onClick={onClose} aria-label="Close" title="Close">
      <Icon name="x" size={15} />
    </IconBtn>
  );
}
