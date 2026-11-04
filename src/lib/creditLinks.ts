// Words for credit pull linking (qcbackend services/credit_links.py): the
// owner card line, the candidate rows in the link drawer, and the sweep
// report on the settings page.

import type { CreditLinkEntry, FileOwner } from "@/lib/applicationProfile";

export type CreditLinkUnmatched = {
  pull_id: string;
  name: string;
  client_id: string | null;
  pulled_at: string | null;
  score_words: string;
  reason: string;
};

export type CreditLinkRunReport = {
  at: string;
  how: string;
  pulls_checked: number;
  linked: CreditLinkEntry[];
  unmatched: CreditLinkUnmatched[];
  words?: string;
};

export type CreditLinkingMode = "manual" | "automatic";

export type CreditLinkingSettings = {
  mode: CreditLinkingMode;
  last_run: CreditLinkRunReport | null;
  sweep_minutes: number;
};

export function shortDate(value: string | null | undefined): string {
  if (!value) return "an unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function scoreWords(score: number | null | undefined, ficoSource: string | null | undefined): string {
  if (score == null) return "No score returned";
  if (ficoSource === "intelligence-proxy") return `${score} estimated from the identity check, not a bureau score`;
  return `Score ${score}`;
}

export function howWords(how: string | null | undefined): string {
  switch (how) {
    case "manual":
      return "linked by hand";
    case "automatic":
      return "linked automatically";
    case "signature":
      return "linked from the signed authorization";
    case "sweep":
      return "linked by the desk's match";
    default:
      return "linked";
  }
}

export function ownerCreditWords(
  owner: Pick<FileOwner, "credit_score" | "credit_fico_source" | "credit_pulled_at" | "credit_link_how">,
): string {
  const parts = [scoreWords(owner.credit_score, owner.credit_fico_source)];
  if (owner.credit_pulled_at) parts.push(`pulled ${shortDate(owner.credit_pulled_at)}`);
  if (owner.credit_link_how) parts.push(howWords(owner.credit_link_how));
  return parts.join(" · ");
}

export function confidenceTone(level: "exact" | "likely" | "weak"): "ok" | "warn" | "mut" {
  if (level === "exact") return "ok";
  if (level === "likely") return "warn";
  return "mut";
}

const count = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function reportWords(report: { linked: unknown[]; unmatched?: unknown[]; waiting?: unknown[]; pulls_checked?: number }): string {
  const parts = [`${count(report.linked.length, "pull")} connected`];
  if (report.waiting?.length) parts.push(`${count(report.waiting.length, "owner")} still waiting`);
  if (report.unmatched?.length) parts.push(`${count(report.unmatched.length, "pull")} still unmatched`);
  if (typeof report.pulls_checked === "number") parts.push(`${report.pulls_checked} checked`);
  return parts.join(", ");
}
