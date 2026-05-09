import type { Document, Loan } from "@/lib/types";

export const FILE_STAGE_KEYS = [
  "prequalified",
  "collecting_docs",
  "lender_connected",
  "processing",
  "closing",
  "funded",
] as const;

export const FILE_STAGE_LABELS = [
  "Prequal",
  "Docs",
  "Lender",
  "Processing",
  "Closing",
  "Funded",
] as const;

function money(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "Missing";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function pct(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return "Missing";
  return `${(value * 100).toFixed(digits)}%`;
}

export function getDocStats(docs: Document[]) {
  const verified = docs.filter((doc) => doc.status === "verified").length;
  const received = docs.filter((doc) => doc.status === "received" || doc.status === "verified").length;
  const flagged = docs.filter((doc) => doc.status === "flagged").length;
  const open = docs.filter((doc) => doc.status !== "verified").length;
  const requested = docs.filter((doc) => doc.status === "requested" || doc.status === "pending").length;
  const total = docs.length;
  const score = total ? Math.round(((verified / total) * 0.75 + (received / total) * 0.25) * 100) : 0;
  return { total, verified, received, flagged, open, requested, score };
}

export function getCriteriaItems(loan: Loan) {
  return [
    {
      id: "amount",
      label: "Loan amount",
      value: money(Number(loan.amount || 0)),
      ready: Number(loan.amount) > 0,
      group: "core",
    },
    {
      id: "rate",
      label: "Base rate",
      value: loan.base_rate ? pct(loan.base_rate, 3) : "Missing",
      ready: !!loan.base_rate,
      group: "pricing",
    },
    {
      id: "purpose",
      label: "Purpose",
      value: loan.purpose ? loan.purpose.replace(/_/g, " ") : "Missing",
      ready: !!loan.purpose,
      group: "core",
    },
    {
      id: "value",
      label: "ARV / value",
      value: loan.arv ? money(Number(loan.arv)) : "Missing",
      ready: !!loan.arv,
      group: "collateral",
    },
    {
      id: "ltv",
      label: "LTV",
      value: loan.ltv ? pct(loan.ltv, 1) : "Missing",
      ready: !!loan.ltv || (!!loan.arv && Number(loan.amount) > 0),
      group: "collateral",
    },
    {
      id: "income",
      label: "Income",
      value: loan.monthly_rent ? money(Number(loan.monthly_rent)) : loan.type === "dscr" ? "Missing rent" : "Not required",
      ready: loan.type !== "dscr" || !!loan.monthly_rent,
      group: "cashflow",
    },
    {
      id: "term",
      label: "Term",
      value: loan.term_months ? `${loan.term_months} months` : "Missing",
      ready: !!loan.term_months,
      group: "pricing",
    },
    {
      id: "close",
      label: "Close date",
      value: loan.close_date
        ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
        : "Unset",
      ready: !!loan.close_date,
      group: "workflow",
    },
  ];
}

export function getCriteriaStats(loan: Loan) {
  const items = getCriteriaItems(loan);
  const ready = items.filter((item) => item.ready).length;
  const score = items.length ? Math.round((ready / items.length) * 100) : 0;
  return { items, ready, total: items.length, score };
}

export function getStageStats(loan: Loan) {
  const index = Math.max(0, FILE_STAGE_KEYS.indexOf(loan.stage as (typeof FILE_STAGE_KEYS)[number]));
  const score = Math.round(((index + 1) / FILE_STAGE_KEYS.length) * 100);
  return {
    index,
    total: FILE_STAGE_KEYS.length,
    score,
    label: FILE_STAGE_LABELS[index] ?? "Prequal",
  };
}

export function getFileCompletion(loan: Loan, docs: Document[], warningCount = 0) {
  const docsStats = getDocStats(docs);
  const criteriaStats = getCriteriaStats(loan);
  const stageStats = getStageStats(loan);
  const warningPenalty = warningCount > 0 ? Math.min(12, warningCount * 4) : 0;
  const score = Math.max(
    0,
    Math.min(
      100,
      Math.round(criteriaStats.score * 0.42 + docsStats.score * 0.38 + stageStats.score * 0.2 - warningPenalty),
    ),
  );
  const label = score >= 85 ? "Underwriting ready" : score >= 65 ? "Needs review" : score >= 40 ? "Building file" : "Intake incomplete";
  return {
    score,
    label,
    docs: docsStats,
    criteria: criteriaStats,
    stage: stageStats,
    warningPenalty,
  };
}
