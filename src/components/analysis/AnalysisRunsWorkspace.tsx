"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { QC_FMT } from "@/components/design-system/tokens";
import { ContextMenu, useContextMenu, type ContextMenuItem } from "@/components/ContextMenu";
import { useClients } from "@/hooks/useApi";
import type { AnalysisRun } from "@/lib/types";

export interface AnalysisRunAction {
  label: string;
  description?: string;
  icon?: string;
  onClick: () => void;
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

function dateLabel(iso: string, withTime = false) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });
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
  const cash = readNumber(run.calculator_output, ["cash_to_close_pricing", "total_cash_to_close", "estimatedCashToClose", "cashToClose"]);
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
  const { t } = useTheme();
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

  const th: CSSProperties = {
    textAlign: "left",
    padding: "11px 12px",
    fontSize: 10.5,
    fontWeight: 800,
    textTransform: "uppercase",
    letterSpacing: 0.7,
    color: t.ink3,
    borderBottom: `1px solid ${t.line}`,
    whiteSpace: "nowrap",
  };
  const td: CSSProperties = {
    padding: "11px 12px",
    fontSize: 12.5,
    color: t.ink,
    borderBottom: `1px solid ${t.line}`,
    verticalAlign: "middle",
  };

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>{title}</h1>
          <div style={{ fontSize: 13, color: t.ink3, marginTop: 4 }}>{description}</div>
        </div>
        {actions.length ? <AnalysisActionsMenu actions={actions} /> : null}
      </div>

      <Card pad={10}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon name="search" size={15} color={t.ink3} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by client, property, product, or status..."
            style={{
              width: "100%",
              border: "none",
              outline: "none",
              background: "transparent",
              color: t.ink,
              fontSize: 13,
              fontFamily: "inherit",
            }}
          />
        </div>
      </Card>

      <Card pad={0}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr>
                {["Run", "Client", "Product", "Amount", "Metric", "State", "Updated"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ ...td, color: t.ink3 }}>Loading runs...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} style={{ ...td, color: t.ink3 }}>{emptyText}</td></tr>
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
                      <td style={td}>
                        <div style={{ fontWeight: 800, color: t.ink, maxWidth: 360, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {titleFor(run)}
                        </div>
                        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                          {SOURCE_LABEL[run.tool_source] ?? run.tool_source}
                        </div>
                      </td>
                      <td style={td}>{clientNameFor(run, clients)}</td>
                      <td style={td}>{PRODUCT_LABEL[run.product] ?? run.product}</td>
                      <td style={td}>{amount ? QC_FMT.usd(amount, 0) : "-"}</td>
                      <td style={td}>{metricFor(run)}</td>
                      <td style={td}>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <Pill bg={t.chip} color={t.ink2}>{run.status.replace(/_/g, " ")}</Pill>
                          {run.shared_at ? <Pill bg={t.profitBg} color={t.profit}>Shared</Pill> : null}
                          {run.prequal_request_id ? <Pill bg={t.petrolSoft} color={t.petrol}>Prequal</Pill> : null}
                        </div>
                      </td>
                      <td style={{ ...td, color: t.ink3, whiteSpace: "nowrap" }}>{dateLabel(run.updated_at, true)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
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
  backLabel = "Back to runs",
  onBack,
}: {
  run: AnalysisRun | undefined;
  loading?: boolean;
  backLabel?: string;
  onBack: () => void;
}) {
  const { t } = useTheme();
  const amount = run ? amountFor(run) : null;
  const metric = run ? metricFor(run) : "-";

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
        <Card pad={20}><div style={{ fontSize: 13, color: t.ink3 }}>Loading run...</div></Card>
      </div>
    );
  }

  if (!run) {
    return (
      <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        <BackButton label={backLabel} onBack={onBack} />
        <Card pad={20}><div style={{ fontSize: 13, color: t.ink2 }}>Run not found.</div></Card>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <BackButton label={backLabel} onBack={onBack} />
      <div>
        <div style={{ fontSize: 11, color: t.petrol, fontWeight: 800, letterSpacing: 1.2, textTransform: "uppercase" }}>
          {SOURCE_LABEL[run.tool_source] ?? run.tool_source}
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: "3px 0 0" }}>{titleFor(run)}</h1>
        <div style={{ fontSize: 12.5, color: t.ink3, marginTop: 4 }}>
          {PRODUCT_LABEL[run.product] ?? run.product} - updated {dateLabel(run.updated_at, true)}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
        <Mini t={t} label="Amount" value={amount ? QC_FMT.usd(amount, 0) : "-"} />
        <Mini t={t} label="Metric" value={metric} />
        <Mini t={t} label="Status" value={run.status.replace(/_/g, " ")} />
        <Mini t={t} label="Shared" value={run.shared_at ? dateLabel(run.shared_at) : "No"} />
      </div>

      <Card pad={14}>
        <SectionLabel>Links</SectionLabel>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {run.loan_id ? <Link href={`/loans/${run.loan_id}`} style={linkButton(t)}><Icon name="layers" size={13} /> Loan file</Link> : null}
          {run.client_id ? <Link href={`/clients/${run.client_id}/workspace`} style={linkButton(t)}><Icon name="clients" size={13} /> Client workspace</Link> : null}
          {run.prequal_request_id ? <Link href="/admin/prequal-requests" style={linkButton(t)}><Icon name="docCheck" size={13} /> Prequalification queue</Link> : null}
          {!run.loan_id && !run.client_id && !run.prequal_request_id ? (
            <div style={{ fontSize: 12.5, color: t.ink3 }}>This run is not linked to a client, loan, or prequalification yet.</div>
          ) : null}
        </div>
      </Card>

      <Card pad={14}>
        <SectionLabel>Saved report</SectionLabel>
        {run.ai_report ? (
          <ReportBlock report={run.ai_report} />
        ) : run.sanitized_client_report ? (
          <ReportBlock report={run.sanitized_client_report} />
        ) : (
          <div style={{ fontSize: 13, color: t.ink3 }}>No generated report is attached to this run yet.</div>
        )}
      </Card>
    </div>
  );
}

function ReportBlock({ report }: { report: Record<string, unknown> }) {
  const { t } = useTheme();
  const narrative = String(report.narrative ?? report.summary ?? "");
  const strengths = Array.isArray(report.strengths) ? report.strengths : [];
  const risks = Array.isArray(report.weaknesses) ? report.weaknesses : Array.isArray(report.risks) ? report.risks : [];
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {narrative ? <p style={{ margin: 0, color: t.ink2, fontSize: 13, lineHeight: 1.55 }}>{narrative}</p> : null}
      {[...strengths.slice(0, 4), ...risks.slice(0, 4)].length ? (
        <div style={{ display: "grid", gap: 5 }}>
          {[...strengths.slice(0, 4), ...risks.slice(0, 4)].map((item, idx) => (
            <div key={idx} style={{ display: "flex", gap: 7, fontSize: 12.5, color: t.ink2 }}>
              <Icon name="check" size={12} color={t.petrol} />
              <span>{String(item)}</span>
            </div>
          ))}
        </div>
      ) : !narrative ? (
        <div style={{ fontSize: 13, color: t.ink3 }}>Report data is present, but no narrative fields were found.</div>
      ) : null}
    </div>
  );
}

function AnalysisActionsMenu({ actions }: { actions: AnalysisRunAction[] }) {
  const { t } = useTheme();
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
    <div ref={ref} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
        aria-expanded={open}
        style={{
          all: "unset",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          minHeight: 34,
          padding: "0 12px",
          borderRadius: 9,
          border: `1px solid ${t.line}`,
          background: t.surface,
          color: t.ink,
          fontSize: 12.5,
          fontWeight: 800,
          boxShadow: "0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <Icon name="plus" size={13} />
        Actions
        <Icon name={open ? "chevU" : "chevD"} size={12} color={t.ink3} />
      </button>
      {open ? (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            zIndex: 80,
            width: 268,
            border: `1px solid ${t.lineStrong}`,
            borderRadius: 10,
            background: t.surface,
            boxShadow: t.shadowLg,
            padding: 5,
            display: "grid",
            gap: 3,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "9px 10px",
                borderRadius: 8,
                color: t.ink,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = t.surface2; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 24, color: t.petrol, display: "inline-flex", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={action.icon ?? "plus"} size={14} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 12.5, fontWeight: 800 }}>{action.label}</span>
                {action.description ? (
                  <span style={{ display: "block", fontSize: 11.2, color: t.ink3, marginTop: 1 }}>{action.description}</span>
                ) : null}
              </span>
            </button>
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
  const { t } = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "fixed", right: 24, bottom: 24, zIndex: 90 }}>
      {open ? (
        <div
          style={{
            width: 286,
            marginBottom: 10,
            border: `1px solid ${t.line}`,
            borderRadius: 12,
            background: t.surface,
            boxShadow: t.shadowLg,
            padding: 6,
            display: "grid",
            gap: 4,
          }}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
              style={{
                all: "unset",
                cursor: "pointer",
                display: "flex",
                gap: 10,
                alignItems: "center",
                padding: "10px 11px",
                borderRadius: 9,
                color: t.ink,
              }}
            >
              <span style={{ width: 28, height: 28, borderRadius: 8, background: t.petrolSoft, color: t.petrol, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon name={action.icon ?? "plus"} size={14} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 800 }}>{action.label}</span>
                {action.description ? (
                  <span style={{ display: "block", fontSize: 11.5, color: t.ink3, marginTop: 1 }}>{action.description}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        style={{
          all: "unset",
          cursor: "pointer",
          width: 56,
          height: 56,
          borderRadius: 18,
          background: t.petrol,
          color: "#fff",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: t.shadowLg,
        }}
      >
        <Icon name={open ? "x" : "plus"} size={24} stroke={2.6} />
      </button>
    </div>
  );
}

function Mini({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <Card pad={14}>
      <div style={{ fontSize: 10.5, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 18, color: t.ink, fontWeight: 800, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
    </Card>
  );
}

function BackButton({ label, onBack }: { label: string; onBack: () => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onBack} style={{ all: "unset", cursor: "pointer", color: t.petrol, fontSize: 13, fontWeight: 800, alignSelf: "flex-start" }}>
      <Icon name="chevL" size={13} /> {label}
    </button>
  );
}

function linkButton(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 7,
    padding: "9px 12px",
    borderRadius: 9,
    border: `1px solid ${t.line}`,
    color: t.ink,
    textDecoration: "none",
    fontSize: 12.5,
    fontWeight: 800,
  };
}
