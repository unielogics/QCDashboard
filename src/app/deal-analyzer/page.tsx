"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/design-system/Icon";
import {
  CellChip,
  Btn,
  Field,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Lbl,
  Note,
  PageHeader,
  Panel,
  Select,
  Sub,
  WarnLine,
} from "@/components/ds";
import { ClientSearchBlock, type ClientPickResult } from "@/components/ClientSearchBlock";
import { AnalysisActionsMenu, AnalysisFloatingAction, AnalysisRunInspect, AnalysisRunsTable } from "@/components/analysis/AnalysisRunsWorkspace";
import { FinancialInsightPanel } from "@/components/analysis/FinancialInsightPanel";
import { GoogleAddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";
import {
  useAnalysisRun,
  useAnalysisRuns,
  useConvertAnalysisRunToPrequal,
  useCreateAnalysisRun,
  useCurrentUser,
  useCurrentCredit,
  useFreeCalc,
  usePropertyIntelligenceLookup,
  useShareAnalysisRun,
  useUpdateAnalysisRun,
} from "@/hooks/useApi";
import { LoanType, PropertyType, Role } from "@/lib/enums.generated";
import type { AddressParts, AnalysisProduct, AnalysisRun, PropertyIntelligenceSnapshot, RecalcResponse } from "@/lib/types";

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `$${Math.round(n).toLocaleString()}` : "-";
const pct = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : "-";

/** Data-derived tint on a KPI figure — the pass/fail read that `accent` used to carry. */
const tinted = (value: ReactNode, color: string) => <span style={{ color }}>{value}</span>;

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
  // Still read for ClientSearchBlock, which takes `t` and is shared with routes
  // that have not migrated yet.
  const router = useRouter();
  const sp = useSearchParams();
  const { data: currentUser } = useCurrentUser();
  const isBroker = currentUser?.role === Role.BROKER;
  const isListFirstRole =
    isBroker ||
    currentUser?.role === Role.SUPER_ADMIN ||
    currentUser?.role === Role.LOAN_EXEC;
  const wantNew = sp?.get("new") === "1";
  const showRuns = sp?.get("view") === "runs";
  const runId = sp?.get("run") ?? null;
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
  const lastAutosaveKey = useRef<string | null>(null);

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
  const { data: recentRuns = [], isLoading: recentRunsLoading } = useAnalysisRuns({
    tool_source: "deal_analyzer",
    updated_since: recentSince,
    limit: 50,
  });
  const { data: inspectedRun, isLoading: inspectedRunLoading } = useAnalysisRun(runId);

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
    if (isListFirstRole && !runId && !wantNew && !showRuns) {
      router.replace("/deal-analyzer/fix-and-flip?new=1");
    }
  }, [isListFirstRole, router, runId, showRuns, wantNew]);

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

  const ensureSavedRun = async (opts?: { quiet?: boolean }): Promise<AnalysisRun | null> => {
    if (!opts?.quiet) setMessage(null);
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
    if (!opts?.quiet) setMessage("Analysis saved.");
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

  // JSX-returning helper (NOT a component) so the inputs keep focus across
  // re-renders.
  const field = (label: string, value: string | number, onChange: (s: string) => void, opts?: { type?: string; suffix?: string }) => (
    <Field label={label} className="s6">
      {opts?.suffix ? (
        <div style={{ position: "relative" }}>
          <Input
            value={value === 0 ? "" : String(value)}
            onChange={(e) => onChange(e.target.value)}
            inputMode={opts?.type === "number" ? "decimal" : undefined}
            style={{ width: "100%" }}
          />
          <span
            className="sub"
            style={{ position: "absolute", right: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
          >
            {opts.suffix}
          </span>
        </div>
      ) : (
        <Input
          value={value === 0 ? "" : String(value)}
          onChange={(e) => onChange(e.target.value)}
          inputMode={opts?.type === "number" ? "decimal" : undefined}
        />
      )}
    </Field>
  );

  const busy =
    calc.isPending ||
    propertyLookup.isPending ||
    createRun.isPending ||
    updateRun.isPending ||
    shareRun.isPending ||
    convertRun.isPending;
  const autosaveKey = useMemo(
    () =>
      JSON.stringify({
        product,
        selectedClientId: selectedClient?.id ?? null,
        fullAddress,
        purchasePrice,
        loanAmount,
        monthlyRent,
        annualTaxes,
        annualInsurance,
        monthlyHoa,
        ratePct,
        points,
        effectiveFico,
      }),
    [annualInsurance, annualTaxes, effectiveFico, fullAddress, loanAmount, monthlyHoa, monthlyRent, points, product, purchasePrice, ratePct, selectedClient?.id],
  );

  useEffect(() => {
    if (!calc.data || createRun.isPending || updateRun.isPending) return;
    if (lastAutosaveKey.current === autosaveKey) return;
    lastAutosaveKey.current = autosaveKey;
    void ensureSavedRun({ quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveKey, calc.data, createRun.isPending, updateRun.isPending]);

  const workflowActions = [
    {
      label: calc.data ? "Refresh and autosave" : "Calculate and autosave",
      description: "Runs pricing and saves this analyzer file.",
      icon: "refresh",
      onClick: () => { void ensureSavedRun(); },
      disabled: busy,
    },
    {
      label: "Share to client",
      description: "Auto-saves first, then shares the client report.",
      icon: "send",
      onClick: () => { void shareToClient(); },
      disabled: busy,
      disabledHint: !selectedClient ? "Link a client first" : undefined,
    },
    {
      label: "Create prequalification",
      description: "Auto-saves first, then creates funding review.",
      icon: "flag",
      onClick: () => { void createPrequal(); },
      disabled: busy,
      disabledHint: !selectedClient ? "Link a client first" : !effectiveFico ? "FICO required" : undefined,
    },
    {
      label: "New Fix & Flip analysis",
      description: "Switch to the renovation analyzer workflow.",
      icon: "hammer",
      onClick: () => router.push("/deal-analyzer/fix-and-flip?new=1"),
      disabled: busy,
    },
  ];

  if (isListFirstRole && runId) {
    return (
      <AnalysisRunInspect
        run={inspectedRun}
        loading={inspectedRunLoading}
        onBack={() => router.push("/deal-analyzer")}
      />
    );
  }

  if (isListFirstRole && !wantNew && !showRuns) {
    return <div className="empty">Opening Deal Analyzer...</div>;
  }

  if (isListFirstRole && !wantNew && showRuns) {
    const actions = [
      {
        label: "New DSCR analysis",
        description: "Screen rent, value, PITIA, and DSCR.",
        icon: "calc",
        onClick: () => router.push("/deal-analyzer?new=1&product=dscr_purchase"),
      },
      {
        label: "New Fix & Flip analysis",
        description: "Open the renovation analyzer workflow.",
        icon: "hammer",
        onClick: () => router.push("/deal-analyzer/fix-and-flip?new=1"),
      },
    ];
    return (
      <>
        <AnalysisRunsTable
          title="Deal Analyzer"
          description="Saved analyzer files from the last 30 days. Open a run to review the report, linked client, loan, share state, or prequalification handoff."
          emptyText="No saved Deal Analyzer runs in the last 30 days."
          runs={recentRuns}
          loading={recentRunsLoading}
          onOpen={(id) => router.push(`/deal-analyzer?view=runs&run=${id}`)}
          actions={isBroker ? actions : undefined}
        />
        {!isBroker ? <AnalysisFloatingAction label="Start a new analysis" actions={actions} /> : null}
      </>
    );
  }

  return (
    <div className="grid">
      <div>
        <Lbl>Deal Analyzer</Lbl>
        <PageHeader
          title="DSCR Deal Screen"
          actions={
            <>
              <AnalysisActionsMenu actions={workflowActions} />
              {isListFirstRole ? (
                <IconBtn
                  onClick={() => router.push("/deal-analyzer")}
                  aria-label="Close"
                  title="Close"
                >
                  <Icon name="x" size={15} />
                </IconBtn>
              ) : null}
            </>
          }
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.05fr) minmax(320px, .95fr)", gap: 14, alignItems: "start" }}>
        <div className="grid" style={{ minWidth: 0 }}>
          <Panel title="Client link">
            {selectedClient ? (
              <div className="row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{selectedClient.name}</div>
                  <Sub>{selectedClient.email ?? selectedClient.phone ?? "Client record linked"}</Sub>
                </div>
                <Btn onClick={() => setSelectedClient(null)}>
                  <Icon name="x" size={13} /> Clear
                </Btn>
              </div>
            ) : (
              <ClientSearchBlock
                onPick={setSelectedClient}
                label="Search client"
                helperText="Required before sharing to client or creating a pending prequalification."
              />
            )}
            <div className="row mt">
              {borrowerFico ? (
                <CellChip tone="pet">Borrower FICO {borrowerFico}</CellChip>
              ) : effectiveFico ? (
                <CellChip tone="warn">Override FICO {effectiveFico}</CellChip>
              ) : (
                <CellChip tone="mut">No borrower FICO</CellChip>
              )}
              {!borrowerFico ? (
                <Input
                  value={overrideFicoText}
                  onChange={(e) => setOverrideFicoText(e.target.value)}
                  placeholder="FICO override"
                  inputMode="numeric"
                  style={{ width: 150 }}
                />
              ) : null}
            </div>
          </Panel>

          <Panel title="Property intelligence">
            <GoogleAddressInput
              value={addressParts}
              onChange={(next) => {
                setAddressParts(next);
                setSnapshot(null);
              }}
              helperText="RentCast, Google, and FEMA checks run automatically once a complete address is selected or entered."
            />
            <div className="row mt">
              {propertyLookup.isPending ? (
                <CellChip tone="pet">Checking RentCast / FEMA</CellChip>
              ) : snapshot ? (
                <CellChip tone="ok">Snapshot attached</CellChip>
              ) : canLookupAddress(addressParts) ? (
                <CellChip tone="mut">Property intelligence queued</CellChip>
              ) : (
                <CellChip tone="mut">Waiting for complete address</CellChip>
              )}
            </div>
            {snapshot ? (
              <KpiRow className="mt">
                <Kpi label="Value" value={valueRange?.estimate ? money(valueRange.estimate) : "-"} sub={valueRange?.low || valueRange?.high ? `${money(valueRange.low)} - ${money(valueRange.high)}` : undefined} />
                <Kpi label="Rent" value={rentRange?.estimate ? money(rentRange.estimate) : "-"} sub={rentRange?.low || rentRange?.high ? `${money(rentRange.low)} - ${money(rentRange.high)}` : undefined} />
                <Kpi label="Flood" value={String((snapshot.fema_flood?.primary as Record<string, unknown> | undefined)?.FLD_ZONE ?? "Checked")} sub={String(snapshot.source_status?.fema_flood ?? "")} />
              </KpiRow>
            ) : null}
          </Panel>

          <Panel title="Loan request">
            <div className="cg">
              <Field label="Product" className="s6">
                <Select value={product} onChange={(e) => setProduct(e.target.value as AnalysisProduct)}>
                  <option value="dscr_purchase">DSCR purchase</option>
                  <option value="dscr_refi">DSCR refinance</option>
                </Select>
              </Field>
              {field(product === "dscr_refi" ? "Estimated value" : "Purchase price", purchasePrice, setCurrency(setPurchasePrice))}
              {field("Loan amount", loanAmount, setCurrency(setLoanAmount))}
              {field("Monthly rent", monthlyRent, setCurrency(setMonthlyRent))}
              {field("Annual taxes", annualTaxes, setCurrency(setAnnualTaxes))}
              {field("Annual insurance", annualInsurance, setCurrency(setAnnualInsurance))}
              {field("Monthly HOA", monthlyHoa, setCurrency(setMonthlyHoa))}
              {field("Rate", ratePct, (s) => setRatePct(Number(s.replace(/[^0-9.]/g, "")) || 0), { suffix: "%" })}
              {field("Points", points, (s) => setPoints(Number(s.replace(/[^0-9.]/g, "")) || 0), { suffix: "%" })}
            </div>
          </Panel>
        </div>

        <div className="grid" style={{ minWidth: 0 }}>
          <Panel title="Results">
            <KpiRow>
              <Kpi label="LTV" value={tinted(pct(ltv), ltv && ltv > 0.8 ? "var(--warn)" : "var(--ok)")} />
              <Kpi
                label="DSCR"
                value={tinted(
                  calc.data?.dscr != null ? `${calc.data.dscr.toFixed(2)}x` : "-",
                  calc.data?.dscr != null && calc.data.dscr >= 1.1 ? "var(--ok)" : "var(--warn)",
                )}
              />
              <Kpi label="PITIA" value={money(calc.data?.effective_pitia ?? calc.data?.monthly_pi)} />
              <Kpi label="Cash to close" value={money(calc.data?.total_cash_to_close ?? calc.data?.cash_to_close_pricing)} />
            </KpiRow>
            {calc.data?.warnings?.length ? (
              <div className="mt" style={{ display: "grid", gap: 6 }}>
                {calc.data.warnings.slice(0, 3).map((w) => (
                  <CellChip key={w.code} tone={w.severity === "error" ? "bad" : "warn"}>{w.message}</CellChip>
                ))}
              </div>
            ) : null}
          </Panel>

          {calc.data ? (
            <FinancialInsightPanel
              product={product}
              inputs={{
                purchase_price: purchasePrice,
                market_value: purchasePrice,
                loan_amount: loanAmount,
                requested_loan_amount: loanAmount,
                monthly_rent: monthlyRent,
                annual_taxes: annualTaxes,
                annual_insurance: annualInsurance,
                monthly_hoa: monthlyHoa,
                rate: ratePct / 100,
                discount_points: points,
              }}
              output={calc.data as unknown as Record<string, unknown>}
            />
          ) : null}

          <Panel title="Report">
            {report ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div className="row">
                  <CellChip tone="pet">{String(report.status ?? "Analysis saved")}</CellChip>
                  <CellChip tone="mut">Confidence {String(report.confidence ?? "Medium")}</CellChip>
                </div>
                <p style={{ margin: 0 }}>{String(report.narrative ?? "")}</p>
                <ReportBullets title="Strengths" items={Array.isArray(report.strengths) ? report.strengths : []} />
                <ReportBullets title="Risks" items={Array.isArray(report.weaknesses) ? report.weaknesses : []} />
              </div>
            ) : (
              <Sub>Save the analysis to generate the internal and sanitized client reports.</Sub>
            )}
          </Panel>

          <Panel title="Status">
            <Sub>
              Runs auto-save after calculation. Use the top-right Actions menu to refresh, share, or create a pending prequalification.
            </Sub>
            {message ? (
              /created|saved|shared|refreshed|attached/i.test(message) ? (
                <Note>{message}</Note>
              ) : (
                <WarnLine className="mt">{message}</WarnLine>
              )
            ) : null}
            {savedRun ? (
              <div className="row mt">
                <CellChip tone="mut">Status {savedRun.status.replace(/_/g, " ")}</CellChip>
                {savedRun.shared_at ? <CellChip tone="ok">Shared</CellChip> : null}
                {savedRun.prequal_request_id ? <CellChip tone="pet">Prequal queued</CellChip> : null}
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ReportBullets({ title, items }: { title: string; items: unknown[] }) {
  if (!items.length) return null;
  return (
    <div>
      <Lbl>{title}</Lbl>
      <div style={{ display: "grid", gap: 5, marginTop: 5 }}>
        {items.slice(0, 4).map((item, idx) => (
          <div key={idx} style={{ display: "flex", gap: 7, alignItems: "flex-start" }}>
            <Icon name="check" size={12} style={{ marginTop: 4, color: "var(--petrol)", flexShrink: 0 }} />
            <span>{String(item)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
