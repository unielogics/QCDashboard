"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { ClientSearchBlock, type ClientPickResult } from "@/components/ClientSearchBlock";
import { RecentAnalysisRunsCard } from "@/components/analysis/RecentAnalysisRunsCard";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import {
  useAnalysisRuns,
  useConvertAnalysisRunToPrequal,
  useCreateAnalysisRun,
  useCurrentCredit,
  useFreeCalc,
  usePropertyIntelligenceLookup,
  useShareAnalysisRun,
  useUpdateAnalysisRun,
} from "@/hooks/useApi";
import { LoanType, PropertyType } from "@/lib/enums.generated";
import type { AddressParts, AnalysisProduct, AnalysisRun, PropertyIntelligenceSnapshot, RecalcResponse } from "@/lib/types";

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "-";
const pct = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "-";

function numFrom(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value.replace(/[^0-9.-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function estimateRange(raw: Record<string, unknown> | null | undefined, key: "value" | "rent") {
  if (!raw) return null;
  const estimate = numFrom(raw[key], raw.price, raw.rent);
  const low = numFrom(raw[`${key}RangeLow`], raw.priceRangeLow, raw.rentRangeLow);
  const high = numFrom(raw[`${key}RangeHigh`], raw.priceRangeHigh, raw.rentRangeHigh);
  if (estimate == null && low == null && high == null) return null;
  return { estimate, low, high };
}

function canLookupAddress(parts: AddressParts | null): parts is AddressParts {
  if (!parts) return false;
  if (parts.full?.trim()) return true;
  return Boolean(parts.street?.trim() && parts.city?.trim() && parts.state?.trim());
}

export default function DealAnalyzerPage() {
  const { t } = useTheme();
  const sp = useSearchParams();
  const [product, setProduct] = useState<AnalysisProduct>((sp?.get("product") as AnalysisProduct) || "dscr_purchase");
  const [selectedClient, setSelectedClient] = useState<ClientPickResult | null>(null);
  const [addressParts, setAddressParts] = useState<AddressParts | null>(null);
  const [snapshot, setSnapshot] = useState<PropertyIntelligenceSnapshot | null>(null);
  const [savedRun, setSavedRun] = useState<AnalysisRun | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [purchasePrice, setPurchasePrice] = useState(575_000);
  const [loanAmount, setLoanAmount] = useState(431_250);
  const [monthlyRent, setMonthlyRent] = useState(3900);
  const [annualTaxes, setAnnualTaxes] = useState(13_620);
  const [annualInsurance, setAnnualInsurance] = useState(2000);
  const [monthlyHoa, setMonthlyHoa] = useState(0);
  const [ratePct, setRatePct] = useState(7.75);
  const [points, setPoints] = useState(1);
  const [overrideFicoText, setOverrideFicoText] = useState("");
  const lastPropertyLookupKey = useRef<string | null>(null);

  const credit = useCurrentCredit(selectedClient?.id);
  const borrowerFico = credit.data?.fico ?? null;
  const overrideFico = (() => {
    const n = Number(overrideFicoText.replace(/[^0-9]/g, ""));
    return Number.isFinite(n) && n >= 300 && n <= 850 ? n : null;
  })();
  const effectiveFico = borrowerFico ?? overrideFico;

  const propertyLookup = usePropertyIntelligenceLookup();
  const calc = useFreeCalc();
  const createRun = useCreateAnalysisRun();
  const updateRun = useUpdateAnalysisRun();
  const shareRun = useShareAnalysisRun();
  const convertRun = useConvertAnalysisRunToPrequal();
  const recentSince = useMemo(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(), []);
  const { data: recentRuns = [] } = useAnalysisRuns({
    tool_source: "deal_analyzer",
    updated_since: recentSince,
    limit: 50,
  });

  const fullAddress = formatAddressParts(addressParts);
  const propertyLookupKey = useMemo(() => {
    if (!canLookupAddress(addressParts)) return "";
    return [
      selectedClient?.id ?? "",
      fullAddress,
      addressParts.latitude ?? "",
      addressParts.longitude ?? "",
    ].join("|");
  }, [addressParts, fullAddress, selectedClient?.id]);
  const ltv = purchasePrice > 0 ? loanAmount / purchasePrice : null;
  const valueRange = estimateRange(snapshot?.rentcast_value, "value");
  const rentRange = estimateRange(snapshot?.rentcast_rent, "rent");
  const report = savedRun?.ai_report ?? null;

  useEffect(() => {
    setSavedRun(null);
  }, [product, selectedClient?.id, fullAddress, purchasePrice, loanAmount, monthlyRent, annualTaxes, annualInsurance, monthlyHoa, ratePct, points, effectiveFico]);

  const setCurrency = (setter: (n: number) => void) => (raw: string) => {
    const n = Number(raw.replace(/[^0-9.]/g, ""));
    setter(Number.isFinite(n) ? n : 0);
  };

  const calculate = async (): Promise<RecalcResponse> => {
    const out = await calc.mutateAsync({
      type: LoanType.DSCR,
      property_type: PropertyType.SFR,
      loan_amount: loanAmount,
      base_rate: ratePct / 100,
      discount_points: points,
      term_months: 360,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      monthly_rent: monthlyRent,
    });
    setMessage("Calculation refreshed.");
    return out;
  };

  const lookupProperty = useCallback(async (parts: AddressParts) => {
    setMessage(null);
    if (!canLookupAddress(parts)) {
      setMessage("Complete the property address before property intelligence runs.");
      return;
    }
    try {
      const row = await propertyLookup.mutateAsync({
        address: parts,
        client_id: selectedClient?.id ?? null,
        property_type: "single_family",
        force_refresh: false,
      });
      setSnapshot(row);
      const vr = estimateRange(row.rentcast_value, "value");
      const rr = estimateRange(row.rentcast_rent, "rent");
      if (vr?.estimate && purchasePrice === 575_000) setPurchasePrice(Math.round(vr.estimate));
      if (rr?.estimate && monthlyRent === 3900) setMonthlyRent(Math.round(rr.estimate));
      setMessage("Property intelligence attached automatically.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Property intelligence could not be attached.");
    }
  }, [monthlyRent, propertyLookup, purchasePrice, selectedClient?.id]);

  useEffect(() => {
    if (!addressParts || !propertyLookupKey) return;
    if (lastPropertyLookupKey.current === propertyLookupKey) return;
    const id = window.setTimeout(() => {
      lastPropertyLookupKey.current = propertyLookupKey;
      void lookupProperty(addressParts);
    }, 500);
    return () => window.clearTimeout(id);
  }, [addressParts, lookupProperty, propertyLookupKey]);

  const ensureSavedRun = async (): Promise<AnalysisRun | null> => {
    setMessage(null);
    const output = calc.data ?? (await calculate());
    const inputs: Record<string, unknown> = {
      product,
      address: fullAddress,
      purchase_price: purchasePrice,
      market_value: purchasePrice,
      requested_loan_amount: loanAmount,
      loan_amount: loanAmount,
      monthly_rent: monthlyRent,
      annual_taxes: annualTaxes,
      annual_insurance: annualInsurance,
      monthly_hoa: monthlyHoa,
      rate: ratePct / 100,
      discount_points: points,
      fico: effectiveFico,
      ltv,
    };
    const payload = {
      product,
      tool_source: "deal_analyzer" as const,
      title: `${product === "dscr_refi" ? "DSCR refinance" : "DSCR purchase"} - ${fullAddress || "Property TBD"}`,
      client_id: selectedClient?.id ?? null,
      property_snapshot_id: snapshot?.id ?? null,
      target_property_address: fullAddress || null,
      inputs,
      calculator_output: output as unknown as Record<string, unknown>,
    };
    const row = savedRun
      ? await updateRun.mutateAsync({ id: savedRun.id, patch: payload })
      : await createRun.mutateAsync(payload);
    setSavedRun(row);
    setMessage("Analysis saved.");
    return row;
  };

  const shareToClient = async () => {
    if (!selectedClient) {
      setMessage("Link a client before sharing an analysis.");
      return;
    }
    const row = await ensureSavedRun();
    if (!row) return;
    const result = await shareRun.mutateAsync(row.id);
    setSavedRun(result.analysis_run);
    setMessage("Shared to the client portal.");
  };

  const createPrequal = async () => {
    if (!selectedClient) {
      setMessage("Link one of your clients before creating a prequalification.");
      return;
    }
    if (!effectiveFico) {
      setMessage("Add borrower FICO or an analyzer-only override before creating a prequalification.");
      return;
    }
    const row = await ensureSavedRun();
    if (!row) return;
    const result = await convertRun.mutateAsync({
      runId: row.id,
      payload: {
        notes: "Created from DSCR Deal Analyzer.",
        manual_credit_override: {
          fico: effectiveFico,
          property_count: 0,
          has_year_of_ownership: false,
        },
      },
    });
    setSavedRun(result.analysis_run);
    setMessage("Pending prequalification created for funding review.");
  };

  const input = {
    width: "100%",
    marginTop: 4,
    padding: "9px 11px",
    borderRadius: 8,
    border: `1px solid ${t.line}`,
    background: t.surface,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
  } as const;

  const field = (label: string, value: string | number, onChange: (s: string) => void, opts?: { type?: string; suffix?: string }) => (
    <label style={{ display: "block" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7 }}>{label}</span>
      <div style={{ position: "relative" }}>
        <input value={value === 0 ? "" : String(value)} onChange={(e) => onChange(e.target.value)} inputMode={opts?.type === "number" ? "decimal" : undefined} style={input} />
        {opts?.suffix ? <span style={{ position: "absolute", right: 10, top: 14, fontSize: 12, color: t.ink3 }}>{opts.suffix}</span> : null}
      </div>
    </label>
  );

  const busy =
    calc.isPending ||
    propertyLookup.isPending ||
    createRun.isPending ||
    updateRun.isPending ||
    shareRun.isPending ||
    convertRun.isPending;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1120, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: t.petrol, fontWeight: 800, letterSpacing: 1.4, textTransform: "uppercase" }}>Deal Analyzer</div>
          <h1 style={{ margin: "4px 0 0", color: t.ink, fontSize: 25, lineHeight: 1.1 }}>DSCR Deal Screen</h1>
        </div>
        <Link href="/deal-analyzer/fix-and-flip" style={{ ...qcBtn(t), textDecoration: "none" }}>
          <Icon name="hammer" size={14} /> Fix &amp; Flip Analyzer
        </Link>
      </div>

      <RecentAnalysisRunsCard
        runs={recentRuns}
        title="Saved analyzer runs - last 30 days"
        emptyText="Saved Deal Analyzer runs will appear here after you save, share, or create a prequalification."
      />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, .95fr)", gap: 14, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Card pad={14}>
            <SectionLabel>Client link</SectionLabel>
            {selectedClient ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div>
                  <div style={{ color: t.ink, fontWeight: 800, fontSize: 14 }}>{selectedClient.name}</div>
                  <div style={{ color: t.ink3, fontSize: 12 }}>{selectedClient.email ?? selectedClient.phone ?? "Client record linked"}</div>
                </div>
                <button onClick={() => setSelectedClient(null)} style={qcBtn(t)}>
                  <Icon name="x" size={13} /> Clear
                </button>
              </div>
            ) : (
              <ClientSearchBlock
                t={t}
                onPick={setSelectedClient}
                label="Search client"
                helperText="Required before sharing to client or creating a pending prequalification."
              />
            )}
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
              {borrowerFico ? (
                <Pill bg={t.petrolSoft} color={t.petrol}>Borrower FICO {borrowerFico}</Pill>
              ) : effectiveFico ? (
                <Pill bg={t.warnBg} color={t.warn}>Override FICO {effectiveFico}</Pill>
              ) : (
                <Pill bg={t.chip} color={t.ink3}>No borrower FICO</Pill>
              )}
              {!borrowerFico ? (
                <input
                  value={overrideFicoText}
                  onChange={(e) => setOverrideFicoText(e.target.value)}
                  placeholder="FICO override"
                  inputMode="numeric"
                  style={{ ...input, marginTop: 0, width: 150 }}
                />
              ) : null}
            </div>
          </Card>

          <Card pad={14}>
            <SectionLabel>Property intelligence</SectionLabel>
            <GoogleAddressInput
              value={addressParts}
              onChange={(next) => {
                setAddressParts(next);
                setSnapshot(null);
              }}
              helperText="RentCast, Google, and FEMA checks run automatically once a complete address is selected or entered."
            />
            <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {propertyLookup.isPending ? (
                <Pill bg={t.petrolSoft} color={t.petrol}>Checking RentCast / FEMA</Pill>
              ) : snapshot ? (
                <Pill bg={t.profitBg} color={t.profit}>Snapshot attached</Pill>
              ) : canLookupAddress(addressParts) ? (
                <Pill bg={t.chip} color={t.ink3}>Property intelligence queued</Pill>
              ) : (
                <Pill bg={t.chip} color={t.ink3}>Waiting for complete address</Pill>
              )}
            </div>
            {snapshot ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginTop: 12 }}>
                <MiniStat label="Value" value={valueRange?.estimate ? money(valueRange.estimate) : "-"} sub={valueRange?.low || valueRange?.high ? `${money(valueRange.low)} - ${money(valueRange.high)}` : undefined} />
                <MiniStat label="Rent" value={rentRange?.estimate ? money(rentRange.estimate) : "-"} sub={rentRange?.low || rentRange?.high ? `${money(rentRange.low)} - ${money(rentRange.high)}` : undefined} />
                <MiniStat label="Flood" value={String((snapshot.fema_flood?.primary as Record<string, unknown> | undefined)?.FLD_ZONE ?? "Checked")} sub={String(snapshot.source_status?.fema_flood ?? "")} />
              </div>
            ) : null}
          </Card>

          <Card pad={14}>
            <SectionLabel>Loan request</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
              <label style={{ display: "block" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7 }}>Product</span>
                <select value={product} onChange={(e) => setProduct(e.target.value as AnalysisProduct)} style={input}>
                  <option value="dscr_purchase">DSCR purchase</option>
                  <option value="dscr_refi">DSCR refinance</option>
                </select>
              </label>
              {field(product === "dscr_refi" ? "Estimated value" : "Purchase price", purchasePrice, setCurrency(setPurchasePrice))}
              {field("Loan amount", loanAmount, setCurrency(setLoanAmount))}
              {field("Monthly rent", monthlyRent, setCurrency(setMonthlyRent))}
              {field("Annual taxes", annualTaxes, setCurrency(setAnnualTaxes))}
              {field("Annual insurance", annualInsurance, setCurrency(setAnnualInsurance))}
              {field("Monthly HOA", monthlyHoa, setCurrency(setMonthlyHoa))}
              {field("Rate", ratePct, (s) => setRatePct(Number(s.replace(/[^0-9.]/g, "")) || 0), { suffix: "%" })}
              {field("Points", points, (s) => setPoints(Number(s.replace(/[^0-9.]/g, "")) || 0), { suffix: "%" })}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <Card pad={14}>
            <SectionLabel>Results</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
              <KPI label="LTV" value={pct(ltv)} accent={ltv && ltv > 0.8 ? t.warn : t.profit} />
              <KPI label="DSCR" value={calc.data?.dscr != null ? `${calc.data.dscr.toFixed(2)}x` : "-"} accent={calc.data?.dscr != null && calc.data.dscr >= 1.1 ? t.profit : t.warn} />
              <KPI label="PITIA" value={money(calc.data?.effective_pitia ?? calc.data?.monthly_pi)} />
              <KPI label="Cash to close" value={money(calc.data?.total_cash_to_close ?? calc.data?.cash_to_close_pricing)} />
            </div>
            {calc.data?.warnings?.length ? (
              <div style={{ marginTop: 10, display: "grid", gap: 6 }}>
                {calc.data.warnings.slice(0, 3).map((w) => (
                  <Pill key={w.code} bg={w.severity === "error" ? t.dangerBg : t.warnBg} color={w.severity === "error" ? t.danger : t.warn}>{w.message}</Pill>
                ))}
              </div>
            ) : null}
          </Card>

          <Card pad={14}>
            <SectionLabel>Report</SectionLabel>
            {report ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <Pill bg={t.petrolSoft} color={t.petrol}>{String(report.status ?? "Analysis saved")}</Pill>
                  <Pill bg={t.chip} color={t.ink2}>Confidence {String(report.confidence ?? "Medium")}</Pill>
                </div>
                <p style={{ color: t.ink2, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{String(report.narrative ?? "")}</p>
                <ReportBullets title="Strengths" items={Array.isArray(report.strengths) ? report.strengths : []} />
                <ReportBullets title="Risks" items={Array.isArray(report.weaknesses) ? report.weaknesses : []} />
              </div>
            ) : (
              <div style={{ color: t.ink3, fontSize: 13 }}>Save the analysis to generate the internal and sanitized client reports.</div>
            )}
          </Card>

          <Card pad={14}>
            <SectionLabel>Actions</SectionLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button onClick={calculate} disabled={busy} style={qcBtn(t)}>
                <Icon name="refresh" size={14} /> {calc.isPending ? "Calculating..." : "Calculate"}
              </button>
              <button onClick={ensureSavedRun} disabled={busy} style={qcBtnPrimary(t)}>
                <Icon name="docCheck" size={14} /> {createRun.isPending || updateRun.isPending ? "Saving..." : "Save analysis"}
              </button>
              <button onClick={shareToClient} disabled={busy || !selectedClient} style={qcBtn(t)}>
                <Icon name="send" size={14} /> Share to client
              </button>
              <button onClick={createPrequal} disabled={busy || !selectedClient} style={qcBtn(t)}>
                <Icon name="flag" size={14} /> Create prequalification
              </button>
            </div>
            {message ? (
              <div style={{ marginTop: 10, fontSize: 12.5, color: /created|saved|shared|refreshed|attached/i.test(message) ? t.profit : t.warn, fontWeight: 700 }}>
                {message}
              </div>
            ) : null}
            {savedRun ? (
              <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
                <Pill bg={t.chip} color={t.ink2}>Status {savedRun.status.replace(/_/g, " ")}</Pill>
                {savedRun.shared_at ? <Pill bg={t.profitBg} color={t.profit}>Shared</Pill> : null}
                {savedRun.prequal_request_id ? <Pill bg={t.petrolSoft} color={t.petrol}>Prequal queued</Pill> : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const { t } = useTheme();
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 8, padding: 10, minWidth: 0 }}>
      <div style={{ fontSize: 10.5, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7, fontWeight: 800 }}>{label}</div>
      <div style={{ color: t.ink, fontSize: 16, fontWeight: 800, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      {sub ? <div style={{ color: t.ink3, fontSize: 11, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</div> : null}
    </div>
  );
}

function ReportBullets({ title, items }: { title: string; items: unknown[] }) {
  const { t } = useTheme();
  if (!items.length) return null;
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 800, color: t.ink3, textTransform: "uppercase", letterSpacing: 0.7, marginBottom: 5 }}>{title}</div>
      <div style={{ display: "grid", gap: 5 }}>
        {items.slice(0, 4).map((item, idx) => (
          <div key={idx} style={{ display: "flex", gap: 7, alignItems: "flex-start", color: t.ink2, fontSize: 12.5, lineHeight: 1.4 }}>
            <Icon name="check" size={12} style={{ marginTop: 2, color: t.petrol }} />
            <span>{String(item)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
