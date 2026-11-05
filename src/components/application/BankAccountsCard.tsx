"use client";

// The checking accounts the AI found on the statements, which ones count,
// and which detected "accounts" are really the same one. The reader prints
// an account's digits differently from statement to statement, or reads
// another account's digits off a multi-account statement, and one checking
// account turns into several: the desk folds them together here. Counting
// decides the statement-months requirement and the cockpit's default view.

import { useEffect, useMemo, useState } from "react";
import { Btn, CellChip, Panel, Select, StatusLine } from "@/components/ds";
import { errorMessage } from "@/components/marketplace/shared";
import { useBankAccounts, useSaveBankAccounts } from "@/hooks/useApi";
import { money, monthShort } from "@/lib/financialCockpit";

export function BankAccountsCard({ profileId, canEdit, onSaved, compact = false }: { profileId: string; canEdit: boolean; onSaved?: () => Promise<unknown> | void; compact?: boolean }) {
  const accounts = useBankAccounts(profileId);
  const save = useSaveBankAccounts(profileId);
  const [counted, setCounted] = useState<Set<string> | null>(null);
  const [aliases, setAliases] = useState<Record<string, string> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  useEffect(() => {
    if (accounts.data && counted == null) setCounted(new Set(accounts.data.counted));
    if (accounts.data && aliases == null) setAliases({ ...accounts.data.aliases });
  }, [accounts.data, counted, aliases]);
  const rows = accounts.data?.accounts ?? [];
  const savedCounted = accounts.data?.counted ?? [];
  const savedAliases = accounts.data?.aliases ?? {};
  const current = counted ?? new Set(savedCounted);
  const currentAliases = aliases ?? savedAliases;
  const everything = current.size === 0;
  const dirty = useMemo(() => {
    const countedChanged = current.size !== savedCounted.length || [...current].some((k) => !savedCounted.includes(k));
    const aliasChanged = JSON.stringify(Object.entries(currentAliases).sort()) !== JSON.stringify(Object.entries(savedAliases).sort());
    return countedChanged || aliasChanged;
  }, [current, savedCounted, currentAliases, savedAliases]);
  // Every detected key (members of each account) is a candidate to fold elsewhere.
  const detected = useMemo(() => rows.flatMap((a) => a.members.map((m) => ({ key: m, account: a }))), [rows]);
  const labelFor = (key: string) => rows.find((a) => a.key === key)?.label ?? rows.find((a) => a.members.includes(key))?.label ?? key;

  if (accounts.isLoading && !accounts.data) return compact ? null : <Panel title="Checking accounts"><div className="sub">Looking for accounts on the statements…</div></Panel>;
  if (!rows.length) return compact ? null : <Panel title="Checking accounts"><div className="sub">No bank statement analyzed yet; accounts appear as statements are read.</div></Panel>;

  const toggle = (key: string) => {
    setSaved(null);
    setCounted((prev) => {
      const next = new Set(prev ?? savedCounted);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const setAlias = (key: string, target: string) => {
    setSaved(null);
    setAliases((prev) => {
      const next = { ...(prev ?? savedAliases) };
      if (!target || target === key) delete next[key];
      else next[key] = target;
      return next;
    });
  };
  const submit = async () => {
    setError(null);
    try {
      const result = await save.mutateAsync({ counted: [...current].filter((k) => rows.some((r) => r.key === k)), aliases: currentAliases });
      setCounted(new Set(result.counted));
      setAliases({ ...result.aliases });
      setSaved(result.counted.length ? `Counting ${result.counted.length} of ${result.accounts.length} accounts. Readiness and the cockpit re-read.` : "Saved. Every account counts.");
      await onSaved?.();
    } catch (e) {
      setError(errorMessage(e, "The account choice could not be saved."));
    }
  };
  return (
    <Panel
      title="Checking accounts the AI found"
      sub={everything ? "One statement file is one account, named by the account the statement is issued for; the other accounts a consolidated statement lists are named below it, never counted as accounts. Every account counts toward the statement months until you choose. Untick a savings or secondary account so its statements stop filling the requirement; use \"Same account as\" only when the reader printed one account's digits two ways." : "Only the ticked accounts count toward the statement months and open the cockpit by default."}
      actions={canEdit ? <Btn size="sm" variant="pri" disabled={!dirty || save.isPending} onClick={() => void submit()}>{save.isPending ? "Saving…" : "Save accounts"}</Btn> : null}
    >
      {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
      {saved && !dirty ? <StatusLine tone="ok">{saved}</StatusLine> : null}
      <div className="fc-listing-grid">
        {rows.map((account) => {
          const on = everything || current.has(account.key);
          const folded = account.members.filter((m) => m !== account.key);
          return (
            <div key={account.key} className="fc-listing-item">
              <label className="row" style={{ gap: 8, alignItems: "center", cursor: canEdit ? "pointer" : "default" }}>
                <input type="checkbox" checked={current.has(account.key)} disabled={!canEdit} onChange={() => toggle(account.key)} aria-label={`Count ${account.label}`} />
                <strong>{account.label}</strong>
                <CellChip tone={on ? "ok" : "mut"}>{on ? (everything ? "Counts (all)" : "Counts") : "Not counted"}</CellChip>
              </label>
              <span className="sub">
                {account.months.length} month{account.months.length === 1 ? "" : "s"} on file{account.months.length ? ` (${monthShort(account.months[0])} to ${monthShort(account.months[account.months.length - 1])})` : ""} · {account.accepted_months.length} accepted
                {folded.length ? ` · includes ${folded.map(labelFor).join(", ")}` : ""}
              </span>
              {account.sub_accounts?.length ? (
                <span className="sub">
                  Also listed on these statements, not accounts of their own: {account.sub_accounts.map((s) => `${s.label ? `${s.label} ` : ""}••${s.last4}${s.ending_balance != null ? ` (${money(s.ending_balance)})` : ""}`).join(", ")}
                </span>
              ) : null}
              {canEdit && rows.length > 1 ? (
                <label className="sub" style={{ display: "grid", gap: 2 }}>
                  Same account as
                  <Select value={currentAliases[account.key] ?? ""} onChange={(e) => setAlias(account.key, e.target.value)} aria-label={`${account.label} is the same account as`}>
                    <option value="">(a separate account)</option>
                    {detected.filter((d) => d.account.key !== account.key && d.key !== account.key).map((d) => (
                      <option key={d.key} value={d.key}>{labelFor(d.key)}{d.key !== d.account.key ? ` (part of ${d.account.label})` : ""}</option>
                    ))}
                  </Select>
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
