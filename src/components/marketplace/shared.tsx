"use client";

// Shared bits for the Marketplace admin pages: the super-admin wall, number
// and date formatting, and the status vocabularies as chip tones.

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { Btn, CellChip, Loading, Panel, type ChipTone } from "@/components/ds";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import type { CpFilingStatus, CpListingStatus, CpMemberStatus, CpServicerStatus, CpSubscriptionStatus, CpTransferStatus } from "@/hooks/useCapitalPartners";

export function SuperAdminOnly({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useCurrentUser();
  const router = useRouter();
  if (isLoading || !me) return <Loading />;
  if (me.role !== Role.SUPER_ADMIN) {
    return (
      <Panel title="Super-admin only">
        <div className="sub">The Capital Partners marketplace is administered by super-admin only.</div>
        <div className="row mt">
          <Btn onClick={() => router.push("/")}>Back to dashboard</Btn>
        </div>
      </Panel>
    );
  }
  return <>{children}</>;
}

export const money = (v: string | number | null | undefined, compact = false) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 2).replace(/\.?0+$/, "")}M`;
    if (Math.abs(n) >= 1_000) return `$${Math.round(n / 1_000)}K`;
  }
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
};
export const pct = (v: string | number | null | undefined, digits = 2) => {
  if (v == null || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? `${n.toFixed(digits)}%` : String(v);
};
export const day = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = v.length <= 10 ? new Date(`${v}T12:00:00`) : new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
export const when = (v: string | null | undefined) => {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
};
export const label = (v: string | null | undefined) => (v ? v.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()) : "—");

export const LISTING_TONE: Record<CpListingStatus, ChipTone> = { draft: "mut", open: "ok", closing: "warn", fully_subscribed: "acc", funded: "acc", repaid: "ok", workout: "bad", withdrawn: "mut" };
export const MEMBER_TONE: Record<CpMemberStatus, ChipTone> = { requested: "mut", questionnaire: "mut", under_review: "warn", waiting: "warn", approved: "ok", suspended: "bad" };
export const SUB_TONE: Record<CpSubscriptionStatus, ChipTone> = { requested: "warn", documents_sent: "acc", signed: "acc", funded: "ok", cancelled: "mut", declined: "bad" };
export const SERVICER_TONE: Record<CpServicerStatus, ChipTone> = { current: "ok", late: "warn", paid_in_full: "mut", in_workout: "bad" };
export const TRANSFER_TONE: Record<CpTransferStatus, ChipTone> = { listed: "acc", requested: "warn", pending_consent: "warn", approved: "ok", completed: "ok", withdrawn: "mut", declined: "bad" };
export const FILING_TONE: Record<CpFilingStatus, ChipTone> = { due: "warn", filed: "ok", not_required: "mut", cleared: "ok", pending: "warn" };

export function Status<T extends string>({ value, tones }: { value: T; tones: Record<T, ChipTone> }) {
  return <CellChip tone={tones[value] ?? "mut"}>{label(value)}</CellChip>;
}

export const VERTICAL_LABEL: Record<string, string> = { real_estate: "Real estate", auto: "Auto", business: "Business" };
export const LIEN_LABEL: Record<string, string> = { first: "1st", second: "2nd" };
export const FREQ_LABEL: Record<string, string> = { monthly: "Monthly", quarterly: "Quarterly", at_maturity: "At maturity" };
export const DOC_KINDS: { value: "ppm" | "subscription_agreement" | "note" | "valuation" | "title" | "servicing_summary" | "other"; label: string }[] = [
  { value: "ppm", label: "Private placement memorandum" },
  { value: "subscription_agreement", label: "Participation and subscription agreement" },
  { value: "note", label: "Promissory note and security instrument" },
  { value: "valuation", label: "Valuation report" },
  { value: "title", label: "Title and lien search" },
  { value: "servicing_summary", label: "Servicing agreement summary" },
  { value: "other", label: "Other document" },
];

export function errorMessage(e: unknown, fallback = "Something went wrong."): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
