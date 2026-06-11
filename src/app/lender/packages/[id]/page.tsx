"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import {
  useCurrentUser,
  useLenderPackageDownload,
  useLenderPortalPackage,
  useMarkLenderNoQuote,
  useSubmitLenderPortalTerms,
} from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { LenderTermFields, LenderTermRead } from "@/lib/types";

type TermsDraft = {
  requestedAmount: string;
  approvedAmount: string;
  baseRatePct: string;
  finalRatePct: string;
  points: string;
  originationPct: string;
  lenderFees: string;
  termMonths: string;
  amortizationStyle: string;
  interestOnly: boolean;
  prepayPenalty: string;
  ltvPct: string;
  ltcPct: string;
  dscr: string;
  reserves: string;
  closeDays: string;
  constructionHoldbackPct: string;
  drawCount: string;
  exitStrategy: string;
  conditions: string;
  missingItems: string;
  notes: string;
};

export default function LenderPackageDetailPage() {
  const { t } = useTheme();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const packageId = typeof params.id === "string" ? params.id : "";
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const pkg = useLenderPortalPackage(packageId);
  const download = useLenderPackageDownload();
  const submitTerms = useSubmitLenderPortalTerms();
  const noQuote = useMarkLenderNoQuote();
  const recipient = pkg.data?.recipients[0] ?? null;
  const term = recipient?.term ?? null;
  const [draft, setDraft] = useState<TermsDraft>(() => toDraft(null));
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.LENDER) router.replace("/");
  }, [me, meLoading, router]);

  useEffect(() => {
    if (term) setDraft(toDraft(term));
  }, [term?.id, term?.updated_at]);

  const disabled = useMemo(() => {
    const status = recipient?.status;
    return status === "expired" || status === "revoked" || pkg.data?.revoked_at;
  }, [pkg.data?.revoked_at, recipient?.status]);

  const set = (key: keyof TermsDraft, value: string | boolean) => {
    setDraft((cur) => ({ ...cur, [key]: value }));
  };

  const handleDownload = async (documentId: string) => {
    setError(null);
    try {
      const res = await download.mutateAsync({ packageId, documentId });
      window.open(res.download_url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed.");
    }
  };

  const handleSubmitTerms = async () => {
    setError(null);
    setSuccess(null);
    try {
      await submitTerms.mutateAsync({ packageId, payload: toPayload(draft) });
      setSuccess("Terms submitted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit terms.");
    }
  };

  const handleNoQuote = async () => {
    if (!window.confirm("Mark this package as no quote?")) return;
    setError(null);
    try {
      await noQuote.mutateAsync(packageId);
      setSuccess("Marked no quote.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not mark no quote.");
    }
  };

  if (meLoading) {
    return <Card pad={18}><span style={{ color: t.ink3, fontSize: 13 }}>Loading...</span></Card>;
  }
  if (me && me.role !== Role.LENDER) return null;

  if (pkg.isLoading) {
    return <Card pad={18}><span style={{ color: t.ink3, fontSize: 13 }}>Loading package...</span></Card>;
  }

  if (pkg.isError || !pkg.data) {
    return (
      <Card pad={18}>
        <div style={{ color: t.danger, fontSize: 13 }}>
          {pkg.error instanceof Error ? pkg.error.message : "Package unavailable."}
        </div>
      </Card>
    );
  }

  const data = pkg.data;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Link href="/lender/packages" style={{ color: t.brand, fontSize: 12.5, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
        <Icon name="chevL" size={13} /> Packages
      </Link>

      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: 1.5, textTransform: "uppercase", color: t.petrol }}>
            Secure package
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 850, margin: "6px 0 0", color: t.ink }}>
            {data.deal_id} - {data.address}
          </h1>
          <div style={{ fontSize: 12.5, color: t.ink3, marginTop: 5 }}>
            Expires {fmtDate(data.expires_at)}
          </div>
        </div>
        {recipient ? <StatusPill t={t} status={recipient.status} /> : null}
      </div>

      {error ? <Pill bg={t.dangerBg} color={t.danger}>{error}</Pill> : null}
      {success ? <Pill bg={t.profitBg} color={t.profit}>{success}</Pill> : null}

      <Card pad={0}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${t.line}` }}>
          <SectionLabel>Documents</SectionLabel>
        </div>
        {data.documents.map((doc) => (
          <div
            key={doc.id}
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) auto",
              gap: 12,
              alignItems: "center",
              padding: "12px 16px",
              borderTop: `1px solid ${t.line}`,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {doc.display_name}
              </div>
              <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 3 }}>
                {doc.status ?? "document"}
              </div>
            </div>
            <button type="button" disabled={!!disabled || download.isPending} onClick={() => handleDownload(doc.document_id)} style={buttonStyle(t, "primary", !!disabled)}>
              <Icon name="download" size={13} /> Download
            </button>
          </div>
        ))}
      </Card>

      <Card pad={0}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <SectionLabel>Proposed terms</SectionLabel>
          {term ? <Pill bg={t.profitBg} color={t.profit}>Saved</Pill> : null}
        </div>

        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 13 }}>
          <Grid4>
            <Field t={t} label="Requested amount"><input value={draft.requestedAmount} onChange={(e) => set("requestedAmount", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Approved amount"><input value={draft.approvedAmount} onChange={(e) => set("approvedAmount", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Base rate %"><input value={draft.baseRatePct} onChange={(e) => set("baseRatePct", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Final rate %"><input value={draft.finalRatePct} onChange={(e) => set("finalRatePct", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
          </Grid4>
          <Grid4>
            <Field t={t} label="Points"><input value={draft.points} onChange={(e) => set("points", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Origination %"><input value={draft.originationPct} onChange={(e) => set("originationPct", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Lender fees"><input value={draft.lenderFees} onChange={(e) => set("lenderFees", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Term months"><input value={draft.termMonths} onChange={(e) => set("termMonths", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
          </Grid4>
          <Grid4>
            <Field t={t} label="LTV %"><input value={draft.ltvPct} onChange={(e) => set("ltvPct", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="LTC %"><input value={draft.ltcPct} onChange={(e) => set("ltcPct", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="DSCR"><input value={draft.dscr} onChange={(e) => set("dscr", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Reserves"><input value={draft.reserves} onChange={(e) => set("reserves", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
          </Grid4>
          <Grid4>
            <Field t={t} label="Amortization"><input value={draft.amortizationStyle} onChange={(e) => set("amortizationStyle", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Prepay"><input value={draft.prepayPenalty} onChange={(e) => set("prepayPenalty", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Close days"><input value={draft.closeDays} onChange={(e) => set("closeDays", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <label style={{ display: "flex", alignItems: "end", gap: 8, paddingBottom: 8, fontSize: 12.5, color: t.ink2 }}>
              <input type="checkbox" checked={draft.interestOnly} onChange={(e) => set("interestOnly", e.target.checked)} disabled={!!disabled} />
              Interest only
            </label>
          </Grid4>
          <Grid4>
            <Field t={t} label="Holdback %"><input value={draft.constructionHoldbackPct} onChange={(e) => set("constructionHoldbackPct", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Draws"><input value={draft.drawCount} onChange={(e) => set("drawCount", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
            <Field t={t} label="Exit strategy"><input value={draft.exitStrategy} onChange={(e) => set("exitStrategy", e.target.value)} disabled={!!disabled} style={inputStyle(t)} /></Field>
          </Grid4>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field t={t} label="Conditions"><textarea value={draft.conditions} onChange={(e) => set("conditions", e.target.value)} disabled={!!disabled} rows={4} style={textareaStyle(t)} /></Field>
            <Field t={t} label="Missing items"><textarea value={draft.missingItems} onChange={(e) => set("missingItems", e.target.value)} disabled={!!disabled} rows={4} style={textareaStyle(t)} /></Field>
          </div>
          <Field t={t} label="Notes"><textarea value={draft.notes} onChange={(e) => set("notes", e.target.value)} disabled={!!disabled} rows={4} style={textareaStyle(t)} /></Field>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={handleNoQuote} disabled={!!disabled || noQuote.isPending} style={buttonStyle(t)}>
              No quote
            </button>
            <button type="button" onClick={handleSubmitTerms} disabled={!!disabled || submitTerms.isPending} style={buttonStyle(t, "primary", !!disabled)}>
              {submitTerms.isPending ? "Submitting..." : "Submit terms"}
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Grid4({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>{children}</div>;
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
  if (status === "terms_submitted") return <Pill bg={t.profitBg} color={t.profit}>terms submitted</Pill>;
  if (status === "expired" || status === "revoked" || status === "no_quote") return <Pill bg={t.dangerBg} color={t.danger}>{status.replace("_", " ")}</Pill>;
  return <Pill bg={t.brandSoft} color={t.brand}>{status}</Pill>;
}

function toDraft(term: LenderTermRead | null): TermsDraft {
  return {
    requestedAmount: text(term?.requested_amount),
    approvedAmount: text(term?.approved_amount),
    baseRatePct: pctText(term?.base_rate),
    finalRatePct: pctText(term?.final_rate),
    points: text(term?.discount_points),
    originationPct: pctText(term?.origination_pct),
    lenderFees: text(term?.lender_fees),
    termMonths: text(term?.term_months),
    amortizationStyle: term?.amortization_style ?? "",
    interestOnly: !!term?.interest_only,
    prepayPenalty: term?.prepay_penalty ?? "",
    ltvPct: pctText(term?.ltv),
    ltcPct: pctText(term?.ltc),
    dscr: text(term?.dscr),
    reserves: text(term?.reserves_required),
    closeDays: text(term?.estimated_close_days),
    constructionHoldbackPct: pctText(term?.construction_holdback_pct),
    drawCount: text(term?.draw_count),
    exitStrategy: term?.exit_strategy ?? "",
    conditions: (term?.conditions ?? []).join("\n"),
    missingItems: (term?.missing_items ?? []).join("\n"),
    notes: term?.notes ?? "",
  };
}

function toPayload(draft: TermsDraft): LenderTermFields {
  return {
    requested_amount: moneyNum(draft.requestedAmount),
    approved_amount: moneyNum(draft.approvedAmount),
    base_rate: pctNum(draft.baseRatePct),
    final_rate: pctNum(draft.finalRatePct),
    discount_points: numOrNull(draft.points),
    origination_pct: pctNum(draft.originationPct),
    lender_fees: moneyNum(draft.lenderFees),
    term_months: intOrNull(draft.termMonths),
    amortization_style: emptyToNull(draft.amortizationStyle),
    interest_only: draft.interestOnly,
    prepay_penalty: emptyToNull(draft.prepayPenalty),
    ltv: pctNum(draft.ltvPct),
    ltc: pctNum(draft.ltcPct),
    dscr: numOrNull(draft.dscr),
    reserves_required: moneyNum(draft.reserves),
    estimated_close_days: intOrNull(draft.closeDays),
    construction_holdback_pct: pctNum(draft.constructionHoldbackPct),
    draw_count: intOrNull(draft.drawCount),
    exit_strategy: emptyToNull(draft.exitStrategy),
    conditions: lines(draft.conditions),
    missing_items: lines(draft.missingItems),
    notes: emptyToNull(draft.notes),
  };
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

function buttonStyle(t: ReturnType<typeof useTheme>["t"], tone: "default" | "primary" = "default", disabled = false): CSSProperties {
  const primary = tone === "primary";
  return {
    all: "unset",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    padding: "9px 13px",
    borderRadius: 8,
    border: primary ? "none" : `1px solid ${t.line}`,
    background: primary ? t.petrol : "transparent",
    color: primary ? "#fff" : t.ink2,
    fontSize: 12.5,
    fontWeight: 850,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
