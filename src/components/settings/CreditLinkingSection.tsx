"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Sub, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { fileHref } from "@/lib/fileRoutes";
import { reportWords, scoreWords, shortDate, type CreditLinkRunReport, type CreditLinkingMode, type CreditLinkingSettings } from "@/lib/creditLinks";

// Firm-level switch for credit pull linking plus the sweep and its report.
// Per-file linking lives on the file's owner credit cards.

const MODES: { id: CreditLinkingMode; title: string; body: string }[] = [
  {
    id: "manual",
    title: "Manual",
    body: "A completed pull stays with the client until someone links it to an owner from the file. Nothing moves on its own.",
  },
  {
    id: "automatic",
    title: "Automatic",
    body: "Every completed pull is matched to the one owner on the same client who carries its name, the moment it lands and again on a half-hourly sweep. The desk is notified with what connected; anything ambiguous waits for a person.",
  },
];

function when(value: string | null | undefined): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ReportView({ report, heading }: { report: CreditLinkRunReport; heading: string }) {
  return (
    <div className="card grid g8">
      <div className="row">
        <strong className="grow">{heading}</strong>
        <CellChip tone={report.linked.length ? "ok" : "mut"}>{report.words || reportWords(report)}</CellChip>
      </div>
      <Sub>Ran {when(report.at)}.</Sub>
      {report.linked.length ? (
        <ul className="credit-link-list">
          {report.linked.map((entry) => (
            <li key={`${entry.owner_id}-${entry.pull_id}`}>
              <Icon name="check" size={13} />
              <span className="grow">
                <strong>{entry.owner_name}</strong> · {entry.words}
              </span>
              {entry.intake_id ? <Link className="linklike" href={fileHref(entry.intake_id)}>Open file</Link> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {report.unmatched.length ? (
        <>
          <Sub>Still unmatched. Link these by hand from the file, or leave them if the person has no file.</Sub>
          <ul className="credit-link-list">
            {report.unmatched.map((entry) => (
              <li key={entry.pull_id}>
                <Icon name="alert" size={13} />
                <span className="grow">
                  <strong>{entry.name}</strong> · pulled {shortDate(entry.pulled_at)} · {entry.score_words} · {entry.reason}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function CreditLinkingSection() {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [report, setReport] = useState<CreditLinkRunReport | null>(null);
  const [error, setError] = useState("");
  const settings = useQuery({
    queryKey: ["credit-linking-settings"],
    queryFn: () => apiCall<CreditLinkingSettings>("/credit-links/settings"),
  });
  const save = useMutation({
    mutationFn: (mode: CreditLinkingMode) => apiCall<CreditLinkingSettings>("/credit-links/settings", { method: "PUT", body: JSON.stringify({ mode }) }),
    onSuccess: (data) => {
      setError("");
      qc.setQueryData(["credit-linking-settings"], data);
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The mode could not be saved."),
  });
  const run = useMutation({
    mutationFn: () => apiCall<CreditLinkRunReport>("/credit-links/run", { method: "POST" }),
    onSuccess: (data) => {
      setError("");
      setReport(data);
      void qc.invalidateQueries({ queryKey: ["credit-linking-settings"] });
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The sweep could not run."),
  });

  const mode = settings.data?.mode ?? "manual";
  const lastRun = settings.data?.last_run ?? null;
  return (
    <div className="grid g12">
      <div>
        <h3 style={{ margin: 0 }}>Credit pulls</h3>
        <Sub>
          A soft pull lands on the client; an owner&apos;s credit step reads the owner row. This decides who joins the two. Either way, a file&apos;s owner cards can link or unlink a pull by hand.
        </Sub>
      </div>
      {settings.isLoading ? <div className="empty"><span className="spinner solo" />Loading...</div> : null}
      <div className="credit-mode-grid" role="radiogroup" aria-label="Credit pull linking">
        {MODES.map((option) => {
          const on = mode === option.id;
          return (
            <label key={option.id} className={cx("credit-mode-card", on && "on")}>
              <input
                type="radio"
                name="credit-linking-mode"
                value={option.id}
                checked={on}
                disabled={save.isPending || settings.isLoading}
                onChange={() => save.mutate(option.id)}
              />
              <span className="grow">
                <strong>{option.title}</strong>
                <Sub>{option.body}</Sub>
              </span>
              {on ? <CellChip tone="ok">Active</CellChip> : null}
            </label>
          );
        })}
      </div>
      <div className="row g8">
        <Btn variant="pri" disabled={run.isPending} onClick={() => run.mutate()}>
          <Icon name="link" size={14} />
          {run.isPending ? "Connecting..." : "Connect all now"}
        </Btn>
        <Sub>Goes through every completed pull nobody owns yet, in either mode, and reports what it connected.</Sub>
      </div>
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      {report ? <ReportView report={report} heading="This run" /> : lastRun ? <ReportView report={lastRun} heading="Last run" /> : (
        <Sub>No sweep has run yet.</Sub>
      )}
    </div>
  );
}
