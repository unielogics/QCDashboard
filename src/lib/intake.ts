// Shared, transport-agnostic types + pure helpers for the AI underwriter
// intake cockpit. Extracted verbatim from
// src/app/dealer-ai-underwriter/page.tsx so the same conversation cockpit can
// be reused by the client pages and the admin lead modal. Nothing here touches
// React, JSX, the theme, or a specific fetch transport — it is all pure data
// shaping.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RequestedDoc = {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  required: boolean;
  allow_multiple_files?: boolean;
  status: string;
};

export type UploadedFile = {
  id: string;
  requested_document_id?: string | null;
  parent_zip_file_id?: string | null;
  zip_entry_path?: string | null;
  extraction_status?: string | null;
  extraction_reason?: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

export type AssetRow = {
  id?: string;
  address: string;
  estimated_loan_amount?: number | null;
  estimated_property_value?: number | null;
  notes?: string | null;
};

export type Intake = {
  id: string;
  bucket_id: string;
  status: string;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  loan_purpose?: string | null;
  requested_loan_amount?: number | null;
  estimated_credit_score?: number | null;
  referral_source?: string | null;
  asset_rows?: AssetRow[] | null;
  intake_state?: Record<string, unknown> | null;
  result_snapshot?: Record<string, unknown> | null;
};

export type BookingSlot = {
  starts_at: string;
  label: string;
  date_label: string;
};

export type Widget = {
  type:
    | "deal_profile"
    | "entity_structure"
    | "real_estate_schedule"
    | "upload_files"
    | "referral"
    | "run_review"
    | "bankability_result"
    | "book_call";
  title: string;
  description: string;
  missing_document_ids?: string[];
  slots?: BookingSlot[];
  host_name?: string;
  duration_min?: number;
  disabled_reason?: string;
  source?: "system_next_step" | "user_intent" | string;
  reason?: string;
};

export type IntakeResponse = {
  intake: Intake;
  token?: string | null;
  session_token?: string | null;
  resume_url?: string | null;
  upload_url?: string | null;
  assistant_message: string;
  widget?: Widget | null;
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  ai_summary?: Record<string, unknown> | null;
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
  messages?: Array<{ id: string; role: "assistant" | "user" | string; content: string; created_at: string }>;
};

export type EntityStructure = {
  primary_operating_entity: string;
  main_operating_bank_account: string;
  related_entities: string;
  relationship_explanation: string;
};

export type WidgetType = Widget["type"];
export type ChatLine = { id: string; role: "assistant" | "user"; content: string };
export type QueuedFile = { id: string; file: File; status: "ready" | "uploading" | "uploaded" | "error"; message?: string };
export type ReviewProgressStage = "idle" | "attaching" | "uploading" | "reading" | "classifying" | "screening" | "preparing" | "complete" | "error";
export type WorkspaceTab = "chat" | "files" | "intelligence";
export type IntelligenceValue = { label: string; value: string; source: "verified" | "extracted" | "estimated" | "unavailable"; detail?: string; raw?: number | null; hint?: string };

export type FundabilityBannerData = {
  tone: "green" | "red" | "amber";
  label: string;
  title: string;
  detail: string;
};

export type IntelligenceModel = {
  status: FundabilityBannerData | null;
  requestedAmount: IntelligenceValue;
  annualizedRevenue: IntelligenceValue;
  debtBurden: IntelligenceValue;
  dscr: IntelligenceValue;
  ltv: IntelligenceValue;
  equity: IntelligenceValue;
  confidence: IntelligenceValue;
  coverage: Array<{ category: string; status: string; evidence: string; gap: string }>;
  strengths: string[];
  risks: string[];
  missing: Array<{ title: string; detail: string; priority: string }>;
  cashFlowBars: Array<{ label: string; value: number | null; source: IntelligenceValue["source"] }>;
  monthlySeries: Array<{ label: string; value: number | null }>;
  yearlySeries: Array<{ label: string; value: number | null }>;
  oneNextStep: string;
  /** True when every baseline category is satisfied and no clarifications remain —
   *  drives the green "ready for lending" border on the intelligence panel. */
  lendingReady: boolean;
};

export type FileEvidence = { classification: string; supports: string };

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export function numericOrNull(value: string): number | null {
  const parsed = Number(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object" && !Array.isArray(item))) : [];
}

export function cryptoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

export function localFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function formatSize(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Uploaded";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function titleize(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

export function fileLabel(file: UploadedFile): string {
  const name = file.file_name.toLowerCase();
  if (name.endsWith(".pdf")) return "PDF";
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) return "XLS";
  if (name.endsWith(".csv")) return "CSV";
  if (name.endsWith(".zip")) return "ZIP";
  if (file.content_type.startsWith("image/")) return "IMG";
  return "FILE";
}

// Stage 1 baseline keyword sets. Dealer keys on tax / P&L / bank statements;
// the real-estate variant keys on lease / rent / PITIA and collateral proof.
// `isStageOneRequestedDoc` defaults to the dealer set; pass a keyword list to
// switch (e.g. RE_STAGE_ONE_KEYWORDS for funding-review).
export const DEALER_STAGE_ONE_KEYWORDS: string[] = ["tax", "p&l", "profit and loss", "bank statement"];
export const RE_STAGE_ONE_KEYWORDS: string[] = [
  "lease",
  "rent",
  "pitia",
  "dscr",
  "appraisal",
  "valuation",
  "purchase contract",
  "payoff",
  "mortgage statement",
  "insurance",
  "hoa",
];

export function isStageOneRequestedDoc(doc: RequestedDoc, keywords: string[] = DEALER_STAGE_ONE_KEYWORDS): boolean {
  const text = `${doc.name} ${doc.category ?? ""} ${doc.description ?? ""}`.toLowerCase();
  return keywords.some((keyword) => text.includes(keyword));
}

export function fundabilityBanner(result: Record<string, unknown> | null, bankability: Record<string, unknown> | null): FundabilityBannerData | null {
  if (!result && !bankability) return null;
  const probability = String(result?.probability_status || "").trim();
  const rawStatus = String(probability || bankability?.status || result?.status || "Preliminary review").trim();
  const reason = String(result?.one_next_step || bankability?.reason || result?.executive_summary || "Review the AI screen in chat for the current underwriting position.");
  if (probability === "Good probability - book call") {
    return {
      tone: "green",
      label: "Stage 1 bankability",
      title: probability,
      detail: reason,
    };
  }
  if (probability === "Poor probability based on current file") {
    return {
      tone: "red",
      label: "Stage 1 bankability",
      title: probability,
      detail: reason,
    };
  }
  if (probability === "Promising but needs one clarification" || probability === "Not enough evidence yet") {
    return {
      tone: "amber",
      label: "Stage 1 bankability",
      title: probability,
      detail: reason,
    };
  }
  const statusOnly = rawStatus.toLowerCase();
  const normalized = `${rawStatus} ${reason}`.toLowerCase();
  const isNegative =
    statusOnly.includes("not fundable") ||
    statusOnly.includes("not bankable") ||
    statusOnly.includes("unfundable") ||
    statusOnly.includes("decline") ||
    normalized.includes("file is not fundable") ||
    normalized.includes("file is not bankable");
  if (isNegative) {
    return {
      tone: "red",
      label: "Preliminary screen",
      title: rawStatus || "Not fundable",
      detail: reason,
    };
  }
  const isConditional =
    normalized.includes("cannot") ||
    normalized.includes("incomplete") ||
    normalized.includes("missing") ||
    normalized.includes("determine") ||
    normalized.includes("preliminary") ||
    normalized.includes("subject to") ||
    normalized.includes("confirmation") ||
    normalized.includes("conditional");
  const isExplicitPositive =
    ["bankable", "fundable", "yes", "approved"].includes(statusOnly) ||
    statusOnly.startsWith("bankable -") ||
    statusOnly.startsWith("fundable -");
  if (isConditional || !isExplicitPositive) {
    return {
      tone: "amber",
      label: "Preliminary screen",
      title: rawStatus || "Cannot determine yet",
      detail: reason,
    };
  }
  if (isExplicitPositive) {
    return {
      tone: "green",
      label: "Preliminary screen",
      title: rawStatus || "Likely fundable",
      detail: reason,
    };
  }
  return {
    tone: "amber",
    label: "Preliminary screen",
    title: rawStatus || "Review ready",
    detail: reason,
  };
}

export function buildIntelligenceModel(
  response: IntakeResponse,
  result: Record<string, unknown> | null,
  missingDocs: RequestedDoc[],
  status: FundabilityBannerData | null,
): IntelligenceModel {
  const keyMetrics = asRecord(result?.key_metrics);
  const evidence = asRecord(result?.document_evidence_map);
  const bankability = asRecord(result?.bankability_assessment);
  const requestedAmount = numberFromUnknown(response.intake.requested_loan_amount ?? keyMetrics?.requested_amount);
  // Revenue is a tax-return figure ONLY — do not fall back to bank deposits (gross
  // deposits include transfers, financing draws, and financed-sale proceeds, which
  // overstate a dealer's true revenue). When there is no tax-verified revenue we
  // surface the annualized gross-deposits figure under its own honest label.
  const annualizedRevenue = numberFromUnknown(keyMetrics?.ytd_annualized_revenue);
  const annualizedDeposits = numberFromUnknown(keyMetrics?.annualized_adjusted_deposits);
  const debtBurden = numberFromUnknown(keyMetrics?.estimated_debt_burden);
  const dscr = numberFromUnknown(keyMetrics?.estimated_dscr);
  const collateral = collateralPosition(response);
  const ltv = collateral.value && (collateral.debt || requestedAmount)
    ? ((collateral.debt || 0) + (requestedAmount || 0)) / collateral.value * 100
    : numberFromUnknown(keyMetrics?.estimated_ltv ?? keyMetrics?.ltv);
  const equity = collateral.value ? collateral.value - (collateral.debt || 0) : numberFromUnknown(keyMetrics?.equity_position ?? keyMetrics?.available_equity);
  const missingRows = arrayOfRecords(result?.missing_or_incomplete_items).map((item) => ({
    title: String(item.title || "Missing item"),
    detail: String(item.detail || ""),
    priority: String(item.priority || "open"),
  }));
  const coverageRows = arrayOfRecords(evidence?.baseline_coverage).map((item) => ({
    category: String(item.category || "Evidence"),
    status: String(item.status || "unclear"),
    evidence: Array.isArray(item.evidence) ? item.evidence.map(String).join(" | ") : String(item.evidence || ""),
    gap: String(item.gap || ""),
  }));
  const fallbackCoverage = missingDocs.map((doc) => ({
    category: doc.name,
    status: "missing",
    evidence: "",
    gap: doc.description || "No supporting file has been matched yet.",
  }));
  // Lending readiness: trust the backend's computed flag when present, else
  // derive it (every baseline category satisfied AND no open items).
  const coverageStatuses = arrayOfRecords(evidence?.baseline_coverage).map((c) => String(c.status || "").toLowerCase());
  const derivedReady =
    coverageStatuses.length > 0 &&
    coverageStatuses.every((s) => ["satisfied", "uploaded", "complete"].includes(s)) &&
    arrayOfRecords(result?.missing_or_incomplete_items).length === 0;
  const lendingReady = typeof result?.lending_ready === "boolean" ? Boolean(result.lending_ready) : derivedReady;

  return {
    status,
    requestedAmount: metricValue("Requested capital", requestedAmount, "estimated", response.intake.requested_loan_amount ? "Entered during intake" : "Awaiting requested amount", "money", "Enter the requested amount"),
    // Prefer tax-verified revenue; otherwise show annualized gross deposits under
    // an honest "gross deposits" label (never call raw deposits "revenue").
    annualizedRevenue: annualizedRevenue !== null
      ? metricValue("Annualized revenue", annualizedRevenue, "extracted", "Most recent tax-return gross receipts", "money")
      : metricValue("Annualized gross deposits", annualizedDeposits, "extracted", "Bank inflow (not tax-verified revenue)", "money", "Needs tax returns for verified revenue"),
    debtBurden: metricValue("Debt burden", debtBurden, "extracted", "Current monthly or annualized debt service", "money", "Needs a debt schedule or stated monthly debt"),
    dscr: metricValue("DSCR estimate", dscr, "extracted", "Coverage based on available cash-flow evidence", "ratio", "Needs a debt schedule to compute coverage"),
    ltv: metricValue("Proposed LTV", ltv, collateral.value ? "estimated" : "unavailable", "Value less debt plus requested capital where available", "percent", "Needs collateral value & mortgage balance"),
    equity: metricValue("Collateral equity", equity, collateral.value ? "estimated" : "unavailable", "Estimated property value less stated debt", "money", "Needs collateral value & mortgage balance"),
    confidence: {
      label: "AI confidence",
      value: String(result?.confidence || "Awaiting review"),
      source: result?.confidence ? "extracted" : "unavailable",
      detail: String(result?.probability_status || bankability?.status || ""),
      raw: null,
    },
    coverage: coverageRows.length ? coverageRows : fallbackCoverage,
    strengths: arrayOfStrings(result?.strengths),
    risks: arrayOfStrings(result?.risks),
    missing: missingRows.length ? missingRows : missingDocs.map((doc) => ({ title: doc.name, detail: doc.description || "Required for Stage 1 bankability.", priority: "high" })),
    cashFlowBars: [
      { label: "Annualized revenue", value: annualizedRevenue, source: annualizedRevenue === null ? "unavailable" : "extracted" },
      { label: "Estimated cash flow", value: numberFromUnknown(keyMetrics?.estimated_ebitda_or_cash_flow), source: keyMetrics?.estimated_ebitda_or_cash_flow ? "extracted" : "unavailable" },
      { label: "Debt burden", value: debtBurden, source: debtBurden === null ? "unavailable" : "extracted" },
      { label: "Net after debt", value: annualizedRevenue !== null && debtBurden !== null ? annualizedRevenue - debtBurden : null, source: annualizedRevenue !== null && debtBurden !== null ? "estimated" : "unavailable" },
    ],
    monthlySeries: seriesFromResult(result, ["monthly_cash_flow", "month_to_month_cash_flow", "monthly_deposits", "bank_statement_months"]),
    yearlySeries: seriesFromResult(result, ["year_to_year_revenue", "annual_revenue", "tax_return_years", "yearly_profit"]),
    oneNextStep: String(result?.one_next_step || asRecord(result?.next_best_action)?.detail || bankability?.reason || "Run the preliminary screen after uploading evidence."),
    lendingReady,
  };
}

export function metricValue(
  label: string,
  raw: number | null,
  source: IntelligenceValue["source"],
  detail: string,
  format: "money" | "ratio" | "percent" | "plain",
  hint?: string,
): IntelligenceValue {
  if (raw === null || !Number.isFinite(raw)) {
    // When the number can't be computed, name the document that would supply it
    // instead of a bare "Awaiting evidence".
    return { label, value: hint ? "Needs evidence" : "Awaiting evidence", source: "unavailable", detail, raw: null, hint };
  }
  let value = `${raw}`;
  if (format === "money") value = formatMoneyCompact(raw);
  if (format === "ratio") value = `${raw.toFixed(2)}x`;
  if (format === "percent") value = `${raw.toFixed(1)}%`;
  return { label, value, source, detail, raw };
}

export function collateralPosition(response: IntakeResponse): { value: number | null; debt: number | null } {
  const rows = response.intake.asset_rows ?? [];
  let value = 0;
  let debt = 0;
  for (const row of rows) {
    value += Number(row.estimated_property_value || 0);
    debt += Number(row.estimated_loan_amount || 0);
  }
  return { value: value > 0 ? value : null, debt: debt > 0 ? debt : null };
}

export function seriesFromResult(result: Record<string, unknown> | null, keys: string[]): Array<{ label: string; value: number | null }> {
  for (const key of keys) {
    const raw = result?.[key];
    if (!Array.isArray(raw)) continue;
    const rows = raw
      .map((item, index) => {
        if (typeof item === "number") return { label: `${index + 1}`, value: item };
        const record = asRecord(item);
        if (!record) return null;
        const label = String(record.month || record.year || record.label || `${index + 1}`);
        const value = numberFromUnknown(record.value ?? record.revenue ?? record.deposits ?? record.cash_flow ?? record.net_income);
        return { label, value };
      })
      .filter((item): item is { label: string; value: number | null } => Boolean(item));
    if (rows.length) return rows.slice(0, 12);
  }
  return [];
}

export function numberFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const lower = value.toLowerCase();
  const multiplier = lower.includes("b") ? 1_000_000_000 : lower.includes("m") ? 1_000_000 : lower.includes("k") ? 1_000 : 1;
  const negative = /\([^)]*\)/.test(value) || lower.trim().startsWith("-");
  const cleaned = lower.replace(/[$,%x,\s,kmb()]/g, "").replace(/[^0-9.-]/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  return Math.abs(parsed) * multiplier * (negative ? -1 : 1);
}

export function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}

export function formatMoneyCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}k`;
  return `${sign}$${abs.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export async function responseMessage(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return typeof body.detail === "string" ? body.detail : `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function evidenceMapByFileId(result: Record<string, unknown> | null): Map<string, FileEvidence> {
  const output = new Map<string, FileEvidence>();
  const evidenceMap = asRecord(result?.document_evidence_map);
  for (const item of arrayOfRecords(evidenceMap?.files)) {
    const id = String(item.file_id || "");
    if (!id) continue;
    const supports = Array.isArray(item.supports) ? item.supports.map((value) => String(value)).filter(Boolean).slice(0, 2).join(" | ") : "";
    output.set(id, {
      classification: humanizeClassification(String(item.ai_classification || item.document_type || "AI classified")),
      supports,
    });
  }
  return output;
}

export function humanizeClassification(value: string): string {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) return "AI classified";
  return normalized.replace(/\b\w/g, (char) => char.toUpperCase());
}
