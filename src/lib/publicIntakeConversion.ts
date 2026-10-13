import type { Lang } from "@/lib/intakeCopy";
import type { PublicIntakeAttribution } from "@/lib/publicIntakeAttribution";

export type PublicIntakeConversionEvent =
  | "qc_application_start"
  | "qc_application_complete"
  | "qc_qualified_file";

export type PublicIntakeConversionPayload = {
  event: PublicIntakeConversionEvent;
  source?: string;
  program?: string;
  campaign?: string;
  cta?: string;
  page?: string;
  vertical?: string;
  funding_intent?: string;
  locale: Lang;
};

export function canonicalEquipmentAttribution(
  attribution: PublicIntakeAttribution,
): PublicIntakeAttribution {
  return {
    ...attribution,
    source: attribution.source || "public_site",
    page: attribution.page || "/equipment-financing",
    program: "equipment_financing",
    vertical: "business",
    funding_intent: "equipment",
    campaign: attribution.campaign || "equipment_financing",
  };
}

/**
 * Build the deliberately small, provider-neutral public funnel payload.
 * Contact and file identity never enter this boundary, even if a caller has
 * accidentally mixed extra properties into its attribution object.
 */
export function publicIntakeConversionPayload(
  event: PublicIntakeConversionEvent,
  attribution: PublicIntakeAttribution,
  locale: Lang,
): PublicIntakeConversionPayload {
  return {
    event,
    source: attribution.source,
    program: attribution.program,
    campaign: attribution.campaign,
    cta: attribution.cta,
    page: attribution.page,
    vertical: attribution.vertical,
    funding_intent: attribution.funding_intent,
    locale,
  };
}

export function emitPublicIntakeConversion(
  event: PublicIntakeConversionEvent,
  attribution: PublicIntakeAttribution,
  locale: Lang,
): void {
  if (typeof window === "undefined") return;
  const detail = publicIntakeConversionPayload(event, attribution, locale);
  const browserWindow = window as Window & { dataLayer?: Array<Record<string, unknown>> };
  browserWindow.dataLayer?.push(detail);
  window.dispatchEvent(new CustomEvent("qc:conversion", { detail }));
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function candidates(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.map(record).filter((item): item is Record<string, unknown> => item !== null);
}

/** True only for an explicit good screen or a recommended equipment program. */
export function isQualifiedEquipmentReview(result: unknown): boolean {
  const review = record(result);
  if (!review) return false;
  if (review.probability_status === "Good probability - book call") return true;

  const containers = [
    review,
    record(review.program_fit),
    record(review.program_readiness),
    record(review.application_readiness),
  ].filter((item): item is Record<string, unknown> => item !== null);
  return containers.some((container) =>
    candidates(container.candidates).some((candidate) =>
      candidate.program_key === "equipment_financing"
      && candidate.recommendation_status === "recommended"
      && candidate.eligible !== false,
    ),
  );
}
