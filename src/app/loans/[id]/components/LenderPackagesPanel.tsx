"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import {
  useCreateManualLenderTerms,
  useLoanLenderPackages,
  useRevokeLenderPackage,
  useSelectLenderTerms,
  useUpdateLenderTerms,
} from "@/hooks/useApi";
import type {
  LenderPackageRead,
  LenderPackageRecipientRead,
  LenderTermManualCreate,
  LenderTermRead,
  Loan,
} from "@/lib/types";

interface Props {
  loan: Loan;
}

type ManualDraft = {
  source: "manual" | "email" | "phone";
  approvedAmount: string;
  ratePct: string;
  points: string;
  originationPct: string;
  lenderFees: string;
  termMonths: string;
  ltvPct: string;
  ltcPct: string;
  dscr: string;
  reserves: string;
  closeDays: string;
  interestOnly: boolean;
  amortizationStyle: string;
  prepayPenalty: string;
  constructionHoldbackPct: string;
  drawCount: string;
  exitStrategy: string;
  conditions: string;
  missingItems: string;
  notes: string;
};

export function LenderPackagesPanel({ loan }: Props) {
  const { t } = useTheme();
  const { data: packages = [], isLoading, isError, error } = useLoanLenderPackages(loan.id);
  const revokePackage = useRevokeLenderPackage();
  const selectTerms = useSelectLenderTerms();
  const [editing, setEditing] = useState<{
    packageId: string;
    recipient: LenderPackageRecipientRead;
    term?: LenderTermRead | null;
  } | null>(null);

  const totalRecipients = useMemo(
    () => packages.reduce((sum, p) => sum + p.recipients.length, 0),
    [packages],
  );

  const handleSelect = async (term: LenderTermRead) => {
    const applyToLoan = window.confirm(
      "Select this lender as primary and apply these terms to the loan fields? Press Cancel to select the lender without overwriting loan terms.",
    );
    await selectTerms.mutateAsync({ loanId: loan.id, termId: term.id, applyToLoan });
  };

  const handleRevoke = async (pkg: LenderPackageRead) => {
    if (!window.confirm("Revoke this lender package? Lenders will lose portal access immediately.")) return;
    await revokePackage.mutateAsync({ loanId: loan.id, packageId: pkg.id, reason: "Revoked from loan workspace" });
  };

  return (
    <div style={{ borderTop: `1px solid ${t.line}`, padding: "14px 16px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 10 }}>
        <div>
          <SectionLabel>Lender packages & terms</SectionLabel>
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2 }}>
            {packages.length} package(s) · {totalRecipients} lender recipient(s)
          </div>
        </div>
        {isLoading ? <Pill bg={t.chip} color={t.ink3}>Loading</Pill> : null}
      </div>

      {isError ? (
        <Pill bg={t.dangerBg} color={t.danger}>{error instanceof Error ? error.message : "Could not load lender packages."}</Pill>
      ) : packages.length === 0 && !isLoading ? (
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.45 }}>
          No secure lender packages have been created for this file yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {packages.map((pkg) => (
            <section key={pkg.id} style={{ border: `1px solid ${t.line}`, borderRadius: 10, overflow: "hidden" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                  padding: "10px 12px",
                  borderBottom: `1px solid ${t.line}`,
                  background: t.surface2,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 850, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pkg.subject}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                    {pkg.documents.length} docs · expires {fmtDate(pkg.expires_at)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Pill bg={pkg.revoked_at ? t.dangerBg : t.brandSoft} color={pkg.revoked_at ? t.danger : t.brand}>
                    {pkg.revoked_at ? "revoked" : pkg.status}
                  </Pill>
                  {!pkg.revoked_at ? (
                    <button type="button" onClick={() => handleRevoke(pkg)} style={smallButton(t, "danger")}>
                      Revoke
                    </button>
                  ) : null}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 0 }}>
                {pkg.recipients.map((recipient) => (
                  <RecipientRow
                    key={recipient.id}
                    t={t}
                    recipient={recipient}
                    onEdit={() => setEditing({ packageId: pkg.id, recipient, term: recipient.term })}
                    onSelect={recipient.term ? () => handleSelect(recipient.term as LenderTermRead) : undefined}
                    selecting={selectTerms.isPending}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {editing ? (
        <ManualTermsModal
          loanId={loan.id}
          packageId={editing.packageId}
          recipient={editing.recipient}
          term={editing.term}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function RecipientRow({
  t,
  recipient,
  onEdit,
  onSelect,
  selecting,
}: {
  t: ReturnType<typeof useTheme>["t"];
  recipient: LenderPackageRecipientRead;
  onEdit: () => void;
  onSelect?: () => void;
  selecting: boolean;
}) {
  const term = recipient.term;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(170px, 0.9fr) minmax(220px, 1.1fr) auto",
        gap: 12,
        alignItems: "center",
        padding: "11px 12px",
        borderTop: `1px solid ${t.line}`,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 850, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recipient.lender_name ?? "Lender"}
        </div>
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {recipient.email}
        </div>
        <div style={{ marginTop: 5 }}>
          <StatusPill t={t} status={recipient.status} />
        </div>
      </div>

      <div style={{ minWidth: 0 }}>
        {term ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Metric t={t} label="Amount" value={money(term.approved_amount)} />
              <Metric t={t} label="Rate" value={pct(term.final_rate)} />
              <Metric t={t} label="Points" value={num(term.discount_points)} />
              <Metric t={t} label="Term" value={term.term_months ? `${term.term_months} mo` : "-"} />
            </div>
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 5 }}>
              {term.source} · {term.status}{term.notes ? ` · ${term.notes}` : ""}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 12.5, color: t.ink3 }}>No terms recorded yet.</div>
        )}
      </div>

      <div style={{ display: "flex", gap: 7, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button type="button" onClick={onEdit} style={smallButton(t)}>
          <Icon name="pencil" size={12} /> {term ? "Edit terms" : "Add terms"}
        </button>
        {term && term.status !== "selected" ? (
          <button type="button" onClick={onSelect} disabled={selecting} style={smallButton(t, "primary")}>
            Select
          </button>
        ) : term?.status === "selected" ? (
          <Pill bg={t.profitBg} color={t.profit}>Selected</Pill>
        ) : null}
      </div>
    </div>
  );
}

function ManualTermsModal({
  loanId,
  packageId,
  recipient,
  term,
  onClose,
}: {
  loanId: string;
  packageId: string;
  recipient: LenderPackageRecipientRead;
  term?: LenderTermRead | null;
  onClose: () => void;
}) {
  const { t } = useTheme();
  const createTerms = useCreateManualLenderTerms();
  const updateTerms = useUpdateLenderTerms();
  const [draft, setDraft] = useState<ManualDraft>(() => toDraft(term));
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof ManualDraft, value: string | boolean) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
  };

  const save = async () => {
    setError(null);
    const payload = toPayload(draft);
    try {
      if (term) {
        await updateTerms.mutateAsync({
          loanId,
          termId: term.id,
          payload: { ...payload, source: draft.source, status: "received" },
        });
      } else {
        await createTerms.mutateAsync({
          loanId,
          payload: {
            ...payload,
            lender_id: recipient.lender_id,
            package_recipient_id: recipient.id,
            source: draft.source,
            status: "received",
          } satisfies LenderTermManualCreate,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save terms.");
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lender terms"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        zIndex: 220,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "min(760px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          background: t.bg,
          border: `1px solid ${t.line}`,
          borderRadius: 14,
          boxShadow: t.shadowLg,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "15px 18px", borderBottom: `1px solid ${t.line}` }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 850, color: t.petrol, textTransform: "uppercase", letterSpacing: 1.3 }}>
              Lender terms
            </div>
            <div style={{ fontSize: 17, fontWeight: 850, color: t.ink, marginTop: 2 }}>
              {recipient.lender_name ?? recipient.email}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" style={iconButton(t)}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 13 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            <Field t={t} label="Source">
              <select value={draft.source} onChange={(e) => set("source", e.target.value as ManualDraft["source"])} style={inputStyle(t)}>
                <option value="manual">Manual</option>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
              </select>
            </Field>
            <Field t={t} label="Amount">
              <input value={draft.approvedAmount} onChange={(e) => set("approvedAmount", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Rate %">
              <input value={draft.ratePct} onChange={(e) => set("ratePct", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Points">
              <input value={draft.points} onChange={(e) => set("points", e.target.value)} style={inputStyle(t)} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            <Field t={t} label="Origination %">
              <input value={draft.originationPct} onChange={(e) => set("originationPct", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Lender fees">
              <input value={draft.lenderFees} onChange={(e) => set("lenderFees", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Term months">
              <input value={draft.termMonths} onChange={(e) => set("termMonths", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Close days">
              <input value={draft.closeDays} onChange={(e) => set("closeDays", e.target.value)} style={inputStyle(t)} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            <Field t={t} label="LTV %">
              <input value={draft.ltvPct} onChange={(e) => set("ltvPct", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="LTC %">
              <input value={draft.ltcPct} onChange={(e) => set("ltcPct", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="DSCR">
              <input value={draft.dscr} onChange={(e) => set("dscr", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Reserves">
              <input value={draft.reserves} onChange={(e) => set("reserves", e.target.value)} style={inputStyle(t)} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
            <Field t={t} label="Amortization">
              <input value={draft.amortizationStyle} onChange={(e) => set("amortizationStyle", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Prepay">
              <input value={draft.prepayPenalty} onChange={(e) => set("prepayPenalty", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Holdback %">
              <input value={draft.constructionHoldbackPct} onChange={(e) => set("constructionHoldbackPct", e.target.value)} style={inputStyle(t)} />
            </Field>
            <Field t={t} label="Draws">
              <input value={draft.drawCount} onChange={(e) => set("drawCount", e.target.value)} style={inputStyle(t)} />
            </Field>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field t={t} label="Exit strategy">
              <input value={draft.exitStrategy} onChange={(e) => set("exitStrategy", e.target.value)} style={inputStyle(t)} />
            </Field>
            <label style={{ display: "flex", alignItems: "end", gap: 8, paddingBottom: 8, fontSize: 12.5, color: t.ink2 }}>
              <input type="checkbox" checked={draft.interestOnly} onChange={(e) => set("interestOnly", e.target.checked)} />
              Interest only
            </label>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field t={t} label="Conditions">
              <textarea value={draft.conditions} onChange={(e) => set("conditions", e.target.value)} rows={3} style={textareaStyle(t)} />
            </Field>
            <Field t={t} label="Missing items">
              <textarea value={draft.missingItems} onChange={(e) => set("missingItems", e.target.value)} rows={3} style={textareaStyle(t)} />
            </Field>
          </div>

          <Field t={t} label="Notes">
            <textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={textareaStyle(t)} />
          </Field>

          {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "13px 18px", borderTop: `1px solid ${t.line}` }}>
          <button type="button" onClick={onClose} style={smallButton(t)}>Cancel</button>
          <button type="button" onClick={save} disabled={createTerms.isPending || updateTerms.isPending} style={smallButton(t, "primary")}>
            {createTerms.isPending || updateTerms.isPending ? "Saving..." : "Save terms"}
          </button>
        </div>
      </div>
    </div>
  );
}

function toDraft(term?: LenderTermRead | null): ManualDraft {
  return {
    source: term?.source === "email" || term?.source === "phone" || term?.source === "manual" ? term.source : "manual",
    approvedAmount: text(term?.approved_amount),
    ratePct: pctText(term?.final_rate),
    points: text(term?.discount_points),
    originationPct: pctText(term?.origination_pct),
    lenderFees: text(term?.lender_fees),
    termMonths: text(term?.term_months),
    ltvPct: pctText(term?.ltv),
    ltcPct: pctText(term?.ltc),
    dscr: text(term?.dscr),
    reserves: text(term?.reserves_required),
    closeDays: text(term?.estimated_close_days),
    interestOnly: !!term?.interest_only,
    amortizationStyle: term?.amortization_style ?? "",
    prepayPenalty: term?.prepay_penalty ?? "",
    constructionHoldbackPct: pctText(term?.construction_holdback_pct),
    drawCount: text(term?.draw_count),
    exitStrategy: term?.exit_strategy ?? "",
    conditions: (term?.conditions ?? []).join("\n"),
    missingItems: (term?.missing_items ?? []).join("\n"),
    notes: term?.notes ?? "",
  };
}

function toPayload(draft: ManualDraft) {
  return {
    approved_amount: moneyNum(draft.approvedAmount),
    final_rate: pctNum(draft.ratePct),
    discount_points: numOrNull(draft.points),
    origination_pct: pctNum(draft.originationPct),
    lender_fees: moneyNum(draft.lenderFees),
    term_months: intOrNull(draft.termMonths),
    ltv: pctNum(draft.ltvPct),
    ltc: pctNum(draft.ltcPct),
    dscr: numOrNull(draft.dscr),
    reserves_required: moneyNum(draft.reserves),
    estimated_close_days: intOrNull(draft.closeDays),
    interest_only: draft.interestOnly,
    amortization_style: emptyToNull(draft.amortizationStyle),
    prepay_penalty: emptyToNull(draft.prepayPenalty),
    construction_holdback_pct: pctNum(draft.constructionHoldbackPct),
    draw_count: intOrNull(draft.drawCount),
    exit_strategy: emptyToNull(draft.exitStrategy),
    conditions: lines(draft.conditions),
    missing_items: lines(draft.missingItems),
    notes: emptyToNull(draft.notes),
  };
}

function Field({ label, t, children }: { label: string; t: ReturnType<typeof useTheme>["t"]; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 10.5, fontWeight: 850, color: t.ink3, letterSpacing: 1, textTransform: "uppercase" }}>{label}</span>
      {children}
    </label>
  );
}

function StatusPill({ t, status }: { t: ReturnType<typeof useTheme>["t"]; status: string }) {
  if (status === "terms_submitted") return <Pill bg={t.profitBg} color={t.profit}>terms</Pill>;
  if (status === "downloaded" || status === "viewed") return <Pill bg={t.brandSoft} color={t.brand}>{status}</Pill>;
  if (status === "revoked" || status === "expired" || status === "no_quote") return <Pill bg={t.dangerBg} color={t.danger}>{status.replace("_", " ")}</Pill>;
  return <Pill bg={t.chip} color={t.ink3}>{status}</Pill>;
}

function Metric({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string }) {
  return (
    <span style={{ fontSize: 11.5, color: t.ink2, whiteSpace: "nowrap" }}>
      <strong style={{ color: t.ink }}>{label}:</strong> {value}
    </span>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    width: "100%",
    boxSizing: "border-box",
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    outline: "none",
  };
}

function textareaStyle(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return { ...inputStyle(t), resize: "vertical", lineHeight: 1.45 };
}

function smallButton(t: ReturnType<typeof useTheme>["t"], tone: "default" | "primary" | "danger" = "default"): CSSProperties {
  const primary = tone === "primary";
  const danger = tone === "danger";
  return {
    all: "unset",
    cursor: "pointer",
    padding: "8px 11px",
    borderRadius: 8,
    border: primary ? "none" : `1px solid ${t.line}`,
    background: primary ? t.petrol : "transparent",
    color: primary ? "#fff" : danger ? t.danger : t.ink2,
    fontSize: 12,
    fontWeight: 800,
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
  };
}

function iconButton(t: ReturnType<typeof useTheme>["t"]): CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    width: 32,
    height: 32,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    color: t.ink2,
  };
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function money(value: number | null | undefined): string {
  if (value == null) return "-";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);
}

function pct(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${(value * 100).toFixed(2)}%`;
}

function num(value: number | null | undefined): string {
  if (value == null) return "-";
  return `${value}`;
}

function text(value: number | null | undefined): string {
  return value == null ? "" : `${value}`;
}

function pctText(value: number | null | undefined): string {
  return value == null ? "" : `${(value * 100).toFixed(3).replace(/\.?0+$/, "")}`;
}

function numOrNull(raw: string): number | null {
  const clean = raw.replace(/[$,%]/g, "").trim();
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) ? n : null;
}

function intOrNull(raw: string): number | null {
  const n = numOrNull(raw);
  return n == null ? null : Math.round(n);
}

function moneyNum(raw: string): number | null {
  return numOrNull(raw);
}

function pctNum(raw: string): number | null {
  const n = numOrNull(raw);
  return n == null ? null : n / 100;
}

function emptyToNull(raw: string): string | null {
  const value = raw.trim();
  return value ? value : null;
}

function lines(raw: string): string[] | null {
  const values = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  return values.length ? values : null;
}
