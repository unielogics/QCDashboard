"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Field, IconBtn, Input, Row, Select, Textarea, cx } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import type {
  ApplicationClientTerms,
  ApplicationClientTermsWrite,
  ClientTermsDebtTreatment,
  ClientTermsFunderType,
  ClientTermsRepaymentFrequency,
} from "@/lib/applicationProfile";
import { useActiveProfile } from "@/store/role";
import type { OfferSelection } from "@/components/communications/OfferDeliveryComposer";

type Draft = {
  loan_type: string;
  amount: string;
  apr_pct: string;
  term_months: string;
  funder_type: ClientTermsFunderType | "";
  funder_name: string;
  repayment_frequency: ClientTermsRepaymentFrequency;
  custom_payments_per_year: string;
  custom_repayment_label: string;
  debt_service_treatment: ClientTermsDebtTreatment;
  retained_annual_debt_service: string;
  expiration_days: string;
  closing_estimate_days: string;
  co_brand_enabled: boolean;
  sponsor_name: string;
  client_note: string;
  conditions: string;
};

const FUNDER_OPTIONS: Array<[ClientTermsFunderType, string]> = [
  ["bank", "Bank"],
  ["credit_union", "Credit union"],
  ["private_fund", "Private fund"],
  ["private_capital", "Private capital"],
  ["family_office", "Family office"],
  ["balance_sheet", "Balance-sheet lender"],
  ["warehouse", "Warehouse line"],
  ["table_funder", "Table funder"],
  ["other", "Other"],
];

const FREQUENCY_OPTIONS: Array<[ClientTermsRepaymentFrequency, string]> = [
  ["daily", "Daily (business days)"],
  ["weekly", "Weekly"],
  ["biweekly", "Every two weeks"],
  ["monthly", "Monthly"],
  ["custom", "Custom schedule"],
];

const PERIODS: Record<Exclude<ClientTermsRepaymentFrequency, "custom">, number> = {
  daily: 252,
  weekly: 51.96,
  biweekly: 25.98,
  monthly: 12,
};

function emptyDraft(): Draft {
  return {
    loan_type: "",
    amount: "",
    apr_pct: "",
    term_months: "",
    funder_type: "",
    funder_name: "",
    repayment_frequency: "monthly",
    custom_payments_per_year: "",
    custom_repayment_label: "",
    debt_service_treatment: "additive",
    retained_annual_debt_service: "",
    expiration_days: "7",
    closing_estimate_days: "5",
    co_brand_enabled: true,
    sponsor_name: "UrChoice",
    client_note: "",
    conditions: "",
  };
}

function draftFromTerms(terms: ApplicationClientTerms): Draft {
  return {
    loan_type: terms.loan_type ?? terms.loan_type_options[0]?.value ?? "",
    amount: terms.amount == null ? "" : String(terms.amount),
    apr_pct: terms.apr_pct == null ? "" : String(terms.apr_pct),
    term_months: terms.term_months == null ? "" : String(terms.term_months),
    funder_type: terms.funder_type ?? "",
    funder_name: terms.funder_name ?? "",
    repayment_frequency: terms.repayment_frequency ?? "monthly",
    custom_payments_per_year: terms.custom_payments_per_year == null ? "" : String(terms.custom_payments_per_year),
    custom_repayment_label: terms.custom_repayment_label ?? "",
    debt_service_treatment: terms.debt_service_treatment ?? "additive",
    retained_annual_debt_service: terms.retained_annual_debt_service == null ? "" : String(terms.retained_annual_debt_service),
    expiration_days: String(terms.expiration_days ?? 7),
    closing_estimate_days: String(terms.closing_estimate_days ?? 5),
    co_brand_enabled: terms.co_brand_enabled,
    sponsor_name: terms.sponsor_name ?? "UrChoice",
    client_note: terms.client_note ?? "",
    conditions: terms.conditions.join("\n"),
  };
}

function finite(value: string): number | null {
  const normalized = value.trim().replace(/[$,%\s]/g, "");
  const number = Number(normalized);
  return normalized && Number.isFinite(number) ? number : null;
}

function money(value: number | null | undefined, digits = 0) {
  if (value == null || !Number.isFinite(value)) return "Needs evidence";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);
}

function ratio(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? "Needs evidence" : `${value.toFixed(2)}x`;
}

function paymentPreview(draft: Draft) {
  const amount = finite(draft.amount);
  const apr = finite(draft.apr_pct);
  const rawMonths = finite(draft.term_months);
  const months = rawMonths == null ? null : Math.round(rawMonths);
  const periods = draft.repayment_frequency === "custom"
    ? (() => {
        const custom = finite(draft.custom_payments_per_year);
        return custom == null ? null : Math.round(custom);
      })()
    : PERIODS[draft.repayment_frequency];
  if (amount == null || amount <= 0 || apr == null || apr < 0 || months == null || months <= 0 || periods == null || periods <= 0) return null;
  const count = Math.max(1, Math.round((months * periods) / 12));
  const rate = (apr / 100) / periods;
  const payment = rate === 0 ? amount / count : (amount * rate) / (1 - Math.pow(1 + rate, -count));
  return { payment, count, periods, annual: payment * Math.min(count, periods), total: payment * count };
}

function payloadFromDraft(draft: Draft, expectedVersion: number): ApplicationClientTermsWrite {
  const amount = finite(draft.amount);
  const apr = finite(draft.apr_pct);
  const term = finite(draft.term_months);
  const expiration = finite(draft.expiration_days);
  const close = finite(draft.closing_estimate_days);
  if (!draft.loan_type || !draft.funder_type || amount == null || amount <= 0 || apr == null || apr < 0 || term == null || term < 1 || expiration == null || expiration < 1 || close == null || close < 0) {
    throw new Error("Complete the loan type, amount, APR, time, funder type, and timeline before saving.");
  }
  const custom = finite(draft.custom_payments_per_year);
  if (draft.repayment_frequency === "custom" && (custom == null || custom < 1)) throw new Error("Enter how many payments occur per year for the custom schedule.");
  const retained = finite(draft.retained_annual_debt_service);
  if (draft.debt_service_treatment === "refinance" && retained == null) throw new Error("Enter the annual debt service that remains after payoff. Enter 0 for a full payoff.");
  return {
    expected_version: expectedVersion,
    loan_type: draft.loan_type,
    amount,
    apr_pct: apr,
    term_months: Math.round(term),
    funder_type: draft.funder_type,
    funder_name: draft.funder_name.trim() || null,
    repayment_frequency: draft.repayment_frequency,
    custom_payments_per_year: draft.repayment_frequency === "custom" ? Math.round(custom!) : null,
    custom_repayment_label: draft.repayment_frequency === "custom" ? draft.custom_repayment_label.trim() || null : null,
    debt_service_treatment: draft.debt_service_treatment,
    retained_annual_debt_service: draft.debt_service_treatment === "refinance" ? retained : null,
    expiration_days: Math.round(expiration),
    closing_estimate_days: Math.round(close),
    co_brand_enabled: draft.co_brand_enabled,
    sponsor_name: draft.co_brand_enabled ? draft.sponsor_name.trim() || "UrChoice" : null,
    client_note: draft.client_note.trim() || null,
    conditions: draft.conditions.split("\n").map((line) => line.trim()).filter(Boolean),
  };
}

export function ApplicationClientTermsPanel({
  profileId,
  onSaved,
  selected = false,
  onSelectedChange,
  onOfferReady,
  onCompose,
}: {
  profileId: string;
  onSaved?: () => void;
  selected?: boolean;
  onSelectedChange?: (selected: boolean) => void;
  onOfferReady?: (selection: OfferSelection | null) => void;
  onCompose?: () => void;
}) {
  const api = useAuthedApi();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = visualQaUser(useActiveProfile().email);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const draftRef = useRef<Draft>(draft);
  const [savedFingerprint, setSavedFingerprint] = useState("");
  const savedFingerprintRef = useRef("");
  const [draftVersion, setDraftVersion] = useState(0);
  const draftVersionRef = useRef(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [downloading, setDownloading] = useState(false);
  const query = useQuery({
    queryKey: ["application-client-terms", profileId],
    queryFn: () => api<ApplicationClientTerms>(`/application-profiles/${profileId}/client-terms`),
  });

  useEffect(() => {
    if (!query.data) return;
    const hasUnsavedWork = savedFingerprintRef.current !== ""
      && savedFingerprintRef.current !== JSON.stringify(draftRef.current);
    if (hasUnsavedWork) {
      if (query.data.version !== draftVersionRef.current) {
        setError("A newer terms version is available. Your unsaved edits were preserved; reload the file before saving or sending.");
      }
      return;
    }
    const next = draftFromTerms(query.data);
    const fingerprint = JSON.stringify(next);
    draftRef.current = next;
    savedFingerprintRef.current = fingerprint;
    draftVersionRef.current = query.data.version;
    setDraft(next);
    setSavedFingerprint(fingerprint);
    setDraftVersion(query.data.version);
  }, [query.data]);

  const preview = useMemo(() => paymentPreview(draft), [draft]);
  const afterDscr = useMemo(() => {
    const calc = query.data?.calculation;
    if (calc?.cash_flow_value == null || preview?.annual == null) return null;
    let denominator: number | null = null;
    if (calc.dscr_method === "real_estate") {
      if (draft.debt_service_treatment === "refinance") {
        const retained = finite(draft.retained_annual_debt_service);
        denominator = calc.annual_property_carrying_costs == null || retained == null
          ? null
          : calc.annual_property_carrying_costs + retained + preview.annual;
      } else {
        denominator = calc.current_annual_debt_service == null
          ? null
          : calc.current_annual_debt_service + preview.annual;
      }
    } else if (draft.debt_service_treatment === "refinance") {
      const retained = finite(draft.retained_annual_debt_service);
      denominator = retained == null ? null : retained + preview.annual;
    } else {
      denominator = calc.current_annual_debt_service == null ? null : calc.current_annual_debt_service + preview.annual;
    }
    return denominator && denominator > 0 ? calc.cash_flow_value / denominator : null;
  }, [draft.debt_service_treatment, draft.retained_annual_debt_service, preview, query.data?.calculation]);

  const dirty = savedFingerprint !== JSON.stringify(draft);
  const offerSelection = useMemo<OfferSelection | null>(() => {
    const terms = query.data;
    if (!terms?.term_sheet_id || !terms.version || dirty) return null;
    return {
      key: `application_term_sheet:${terms.term_sheet_id}:${terms.version}`,
      ref: { kind: "application_term_sheet", term_sheet_id: terms.term_sheet_id, expected_version: terms.version },
      label: "Financing terms",
      description: `${money(terms.amount, 0)} at ${terms.apr_pct == null ? "—" : `${terms.apr_pct}% APR`} for ${terms.term_months || "—"} months · version ${terms.version}`,
      fileName: `financing-terms-v${terms.version}.pdf`,
    };
  }, [dirty, query.data]);

  useEffect(() => {
    onOfferReady?.(offerSelection);
  }, [offerSelection, onOfferReady]);

  const save = useMutation({
    mutationFn: async () => api<ApplicationClientTerms>(`/application-profiles/${profileId}/client-terms`, { method: "PUT", body: JSON.stringify(payloadFromDraft(draft, draftVersion)) }),
    onSuccess: (data) => {
      const next = draftFromTerms(data);
      const fingerprint = JSON.stringify(next);
      draftRef.current = next;
      savedFingerprintRef.current = fingerprint;
      draftVersionRef.current = data.version;
      setDraft(next);
      setSavedFingerprint(fingerprint);
      setDraftVersion(data.version);
      setError("");
      setNotice(`Client terms v${data.version} saved. Payment and DSCR were recalculated from the stored evidence.`);
      query.refetch();
      onSaved?.();
    },
    onError: (reason) => {
      setNotice("");
      setError(reason instanceof Error ? reason.message : "The client terms could not be saved.");
    },
  });

  async function downloadPdf() {
    if (!query.data?.version || dirty) return;
    setDownloading(true);
    setError("");
    try {
      const token = isSignedIn ? await getToken() : null;
      const issued = query.data.status === "issued";
      const action = issued ? "client-terms.pdf" : "client-terms/issue.pdf";
      const response = await fetch(`${apiBase}/api/v1/application-profiles/${profileId}/${action}?expected_version=${draftVersion}`, {
        method: issued ? "GET" : "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(!token && devUser ? { "X-Dev-User": devUser } : {}) },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { detail?: string } | null;
        throw new Error(body?.detail || "The terms PDF could not be created.");
      }
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename = /filename="?([^";]+)"?/i.exec(disposition)?.[1] ?? "financing-terms.pdf";
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice(`${filename} downloaded.`);
      await query.refetch();
      onSaved?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The terms PDF could not be created.");
    } finally {
      setDownloading(false);
    }
  }

  function patch<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => {
      const next = { ...current, [key]: value };
      draftRef.current = next;
      return next;
    });
    setNotice("");
  }

  if (query.isLoading) return <div className="empty">Loading client terms...</div>;
  if (query.isError || !query.data) return <Callout tone="bad">Client terms are unavailable for this file.</Callout>;
  const terms = query.data;
  const loanLabel = terms.loan_type_options.find((option) => option.value === draft.loan_type)?.label ?? "Select a loan type";
  const cadenceLabel = FREQUENCY_OPTIONS.find(([value]) => value === draft.repayment_frequency)?.[1] ?? "Repayment";

  return <section className="client-terms-shell" aria-label="Client financing terms">
    <header className="client-terms-heading">
      <div>
        <span className="lbl">Client-ready financing terms</span>
        <h3>Structure the offer once. Payment, DSCR, PDF, and email stay in sync.</h3>
        <p className="sub">APR and time drive the repayment schedule. DSCR is read-only and recalculated from file evidence.</p>
      </div>
      <div className="client-terms-heading-actions">
        <CellChip tone={terms.status === "issued" ? "ok" : terms.version ? "warn" : "mut"}>{terms.version ? `${terms.status === "issued" ? "Issued" : "Draft"} · v${terms.version}` : "Not started"}</CellChip>
        {onSelectedChange ? <button
          type="button"
          className={cx("offer-row-select", selected && "on")}
          role="checkbox"
          aria-checked={selected}
          aria-label={`${selected ? "Remove" : "Select"} financing terms for client email`}
          title={offerSelection ? `${selected ? "Remove" : "Select"} financing terms` : dirty ? "Save your changes before selecting these terms" : "Save financing terms before selecting them"}
          disabled={!offerSelection}
          onClick={() => onSelectedChange(!selected)}
        ><span aria-hidden="true">{selected ? <Icon name="check" size={13} /> : null}</span><span>Financing terms</span></button> : null}
        <Btn onClick={downloadPdf} disabled={!terms.version || dirty || downloading}>{downloading ? "Building PDF..." : terms.status === "issued" ? "Download issued PDF" : "Issue & download"}</Btn>
        <IconBtn className="pri" onClick={() => { setError(""); onSelectedChange?.(true); onCompose?.(); }} aria-label="Compose client email with financing terms" title="Add to client offer email" disabled={!offerSelection || terms.direct_client_contact_suppressed}><Icon name="mail" size={15} /></IconBtn>
      </div>
    </header>
    {terms.direct_client_contact_suppressed ? <Callout tone="warn">Direct client contact is suppressed on this referral-managed file. Download the PDF and route it through the referring professional.</Callout> : null}
    {!terms.loan_type_options.length ? <Callout tone="bad">No active loan type is scoped to this file. Publish or scope a funding program before creating client terms.</Callout> : null}
    {error ? <Callout tone="bad">{error}</Callout> : null}
    {notice ? <Callout tone="ok">{notice}</Callout> : null}
    <div className="client-terms-layout">
      <div className="client-terms-editor">
        <section className="terms-form-section">
          <div className="terms-section-title"><span>1</span><div><b>Offer basics</b><small>Amount, APR, and time are the calculation anchors.</small></div></div>
          <div className="fldgrid two">
            <Field label="Loan type"><Select aria-label="Loan type" value={draft.loan_type} onChange={(event) => patch("loan_type", event.target.value)}><option value="">Choose from funding catalog</option>{terms.loan_type_options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</Select></Field>
            <Field label="Amount"><Input aria-label="Amount" inputMode="decimal" value={draft.amount} onChange={(event) => patch("amount", event.target.value)} placeholder="750,000" /></Field>
            <Field label="APR"><div className="terms-input-suffix"><Input aria-label="APR" inputMode="decimal" value={draft.apr_pct} onChange={(event) => patch("apr_pct", event.target.value)} placeholder="12.99" /><span>%</span></div></Field>
            <Field label="Time"><div className="terms-input-suffix"><Input aria-label="Time in months" inputMode="numeric" value={draft.term_months} onChange={(event) => patch("term_months", event.target.value)} placeholder="24" /><span>months</span></div></Field>
          </div>
        </section>
        <section className="terms-form-section">
          <div className="terms-section-title"><span>2</span><div><b>Funding and repayment</b><small>Define who is funding and how the client pays.</small></div></div>
          <div className="fldgrid two">
            <Field label="Funder type"><Select aria-label="Funder type" value={draft.funder_type} onChange={(event) => patch("funder_type", event.target.value as ClientTermsFunderType)}><option value="">Choose funder type</option>{FUNDER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Funder name (optional)"><Input aria-label="Funder name" value={draft.funder_name} onChange={(event) => patch("funder_name", event.target.value)} placeholder="Capital source or bank" /></Field>
            <Field label="Repayment"><Select aria-label="Repayment frequency" value={draft.repayment_frequency} onChange={(event) => patch("repayment_frequency", event.target.value as ClientTermsRepaymentFrequency)}>{FREQUENCY_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Debt-service impact"><Select aria-label="Debt-service impact" value={draft.debt_service_treatment} onChange={(event) => patch("debt_service_treatment", event.target.value as ClientTermsDebtTreatment)}><option value="additive">Add to current obligations</option><option value="refinance">Refinance / payoff current obligations</option></Select></Field>
            {draft.repayment_frequency === "custom" ? <><Field label="Payments per year"><Input aria-label="Payments per year" inputMode="numeric" value={draft.custom_payments_per_year} onChange={(event) => patch("custom_payments_per_year", event.target.value)} placeholder="18" /></Field><Field label="Custom schedule label"><Input aria-label="Custom schedule label" value={draft.custom_repayment_label} onChange={(event) => patch("custom_repayment_label", event.target.value)} placeholder="Every 20 days" /></Field></> : null}
            {draft.debt_service_treatment === "refinance" ? <Field label="Annual debt service remaining after payoff"><Input aria-label="Annual debt service remaining after payoff" inputMode="decimal" value={draft.retained_annual_debt_service} onChange={(event) => patch("retained_annual_debt_service", event.target.value)} placeholder="0 for a full payoff" /></Field> : null}
          </div>
        </section>
        <section className="terms-form-section">
          <div className="terms-section-title"><span>3</span><div><b>Timing and presentation</b><small>Set validity, closing expectation, and co-branding.</small></div></div>
          <div className="fldgrid two">
            <Field label="Time before expiration"><div className="terms-input-suffix"><Input aria-label="Time before expiration in days" inputMode="numeric" value={draft.expiration_days} onChange={(event) => patch("expiration_days", event.target.value)} /><span>days</span></div></Field>
            <Field label="Closing estimate after approval"><div className="terms-input-suffix"><Input aria-label="Closing estimate after approval in business days" inputMode="numeric" value={draft.closing_estimate_days} onChange={(event) => patch("closing_estimate_days", event.target.value)} /><span>business days</span></div></Field>
          </div>
          <label className="terms-check"><input type="checkbox" checked={draft.co_brand_enabled} onChange={(event) => patch("co_brand_enabled", event.target.checked)} /><span><b>Co-brand this PDF</b><small>Show Qualified Commercial with the sponsor partner.</small></span></label>
          {draft.co_brand_enabled ? <Field label="Sponsor partner"><Input aria-label="Sponsor partner" value={draft.sponsor_name} onChange={(event) => patch("sponsor_name", event.target.value)} placeholder="UrChoice" /></Field> : null}
          <Field label="Client note (optional)"><Textarea aria-label="Client note" rows={3} value={draft.client_note} onChange={(event) => patch("client_note", event.target.value)} placeholder="A short, client-facing explanation of this structure." /></Field>
          <Field label="Conditions (one per line)"><Textarea aria-label="Conditions" rows={4} value={draft.conditions} onChange={(event) => patch("conditions", event.target.value)} placeholder={"Final verification of financial information\nSatisfactory closing documentation"} /></Field>
        </section>
        <Row><Btn variant="pri" onClick={() => { setError(""); save.mutate(); }} disabled={save.isPending || !dirty}>{save.isPending ? "Recalculating..." : terms.version ? "Save new version" : "Save client terms"}</Btn>{dirty ? <span className="terms-unsaved">Unsaved changes</span> : <span className="sub">Everything shown in the PDF matches version {terms.version || "—"}.</span>}</Row>
      </div>
      <aside className="terms-live-preview" aria-label="Live client terms preview">
        <div className="terms-preview-brand"><div className="qc-mini">QC</div><div><b>Qualified Commercial</b><span>Financing terms</span></div>{draft.co_brand_enabled ? <div className="terms-preview-sponsor"><small>with</small><b>{draft.sponsor_name || "UrChoice"}</b></div> : null}</div>
        <div className="terms-preview-title"><span>Prepared structure</span><h4>{loanLabel}</h4></div>
        <div className="terms-preview-hero"><span>Proposed amount</span><strong>{money(finite(draft.amount), 0)}</strong><div><b>{finite(draft.apr_pct) == null ? "—" : `${finite(draft.apr_pct)!.toFixed(2)}%`}</b><small>APR</small><b>{finite(draft.term_months) == null ? "—" : `${Math.round(finite(draft.term_months)!)} mo`}</b><small>Time</small></div></div>
        <div className="terms-preview-payment"><span>Estimated {draft.repayment_frequency === "custom" ? draft.custom_repayment_label || "custom" : cadenceLabel.toLowerCase()} payment</span><strong>{money(preview?.payment, 2)}</strong><small>{preview ? `${preview.count} payments · ${money(preview.annual, 0)} annual debt service` : "Enter amount, APR, and time to calculate"}</small></div>
        <div className="terms-preview-dscr"><div><span>Before acceptance</span><strong>{ratio(terms.calculation.dscr_before)}</strong></div><i>→</i><div className="after"><span>After acceptance</span><strong>{ratio(afterDscr)}</strong></div></div>
        <p className="terms-preview-source">{terms.calculation.dscr_explanation}<br />{terms.calculation.source}</p>
        <div className="terms-preview-timing"><span><small>Valid for</small><b>{draft.expiration_days || "—"} days</b></span><span><small>Estimated close</small><b>{draft.closing_estimate_days || "—"} business days</b></span></div>
        <p className="terms-preview-disclaimer">Indicative terms only. Subject to final underwriting, documentation, and funding-source approval.</p>
      </aside>
    </div>
  </section>;
}
