"use client";

// The checking accounts the AI found on the statements, and which ones
// count. A business often banks at more than one account; a savings
// account's statements should not fill the six-month requirement, and the
// cockpit should open on the operating account. The desk ticks the accounts
// that count; readiness, the evidence workspace and the cockpit re-read.

import { useEffect, useState } from "react";
import { Btn, CellChip, Panel, StatusLine } from "@/components/ds";
import { errorMessage } from "@/components/marketplace/shared";
import { useBankAccounts, useSaveBankAccounts } from "@/hooks/useApi";
import { monthShort } from "@/lib/financialCockpit";

export function BankAccountsCard({ profileId, canEdit, onSaved, compact = false }: { profileId: string; canEdit: boolean; onSaved?: () => Promise<unknown> | void; compact?: boolean }) {
  const accounts = useBankAccounts(profileId);
  const save = useSaveBankAccounts(profileId);
  const [counted, setCounted] = useState<Set<string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (accounts.data && counted == null) setCounted(new Set(accounts.data.counted));
  }, [accounts.data, counted]);
  const rows = accounts.data?.accounts ?? [];
  if (accounts.isLoading && !accounts.data) return compact ? null : <Panel title="Checking accounts"><div className="sub">Looking for accounts on the statements…</div></Panel>;
  if (!rows.length) return compact ? null : <Panel title="Checking accounts"><div className="sub">No bank statement analyzed yet; accounts appear as statements are read.</div></Panel>;
  const current = counted ?? new Set(accounts.data?.counted ?? []);
  const everything = current.size === 0;
  const dirty = counted != null && (counted.size !== (accounts.data?.counted.length ?? 0) || [...counted].some((k) => !(accounts.data?.counted ?? []).includes(k)));
  const toggle = (key: string) => {
    setSaved(null);
    setCounted((prev) => {
      const next = new Set(prev ?? accounts.data?.counted ?? []);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const submit = async () => {
    setError(null);
    try {
      const result = await save.mutateAsync([...current].filter((k) => rows.some((r) => r.key === k)));
      setCounted(new Set(result.counted));
      setSaved(result.counted.length ? `Counting ${result.counted.length} of ${rows.length} accounts. Readiness and the cockpit re-read.` : "Every account counts again.");
      await onSaved?.();
    } catch (e) {
      setError(errorMessage(e, "The account choice could not be saved."));
    }
  };
  return (
    <Panel
      title="Checking accounts the AI found"
      sub={everything ? "Every account counts toward the statement months until you choose. Untick a savings or secondary account so its statements stop filling the requirement." : "Only the ticked accounts count toward the statement months and open the cockpit by default."}
      actions={canEdit ? <Btn size="sm" variant="pri" disabled={!dirty || save.isPending} onClick={() => void submit()}>{save.isPending ? "Saving…" : "Save accounts"}</Btn> : null}
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {saved && !dirty ? <StatusLine tone="ok">{saved}</StatusLine> : null}
      <div className="fc-listing-grid">
        {rows.map((account) => {
          const on = everything || current.has(account.key);
          return (
            <label key={account.key} className="fc-listing-item" style={{ cursor: canEdit ? "pointer" : "default" }}>
              <span className="row" style={{ gap: 8, alignItems: "center" }}>
                <input type="checkbox" checked={current.has(account.key)} disabled={!canEdit} onChange={() => toggle(account.key)} aria-label={`Count ${account.label}`} />
                <strong>{account.label}</strong>
                <CellChip tone={on ? "ok" : "mut"}>{on ? (everything ? "Counts (all)" : "Counts") : "Not counted"}</CellChip>
              </span>
              <span className="sub">
                {account.months.length} month{account.months.length === 1 ? "" : "s"} on file{account.months.length ? ` (${monthShort(account.months[0])} to ${monthShort(account.months[account.months.length - 1])})` : ""} · {account.accepted_months.length} accepted
              </span>
            </label>
          );
        })}
      </div>
    </Panel>
  );
}
