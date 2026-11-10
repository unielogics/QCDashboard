export type OfferDeliveryItem = {
  id: string;
  item_key?: string;
  source_id?: string;
  source_version?: number;
  kind: "merchant_offer" | "production_term_sheet" | "application_term_sheet" | "evidence_file";
  label: string;
  title: string;
  file_name: string;
  content_type: string;
  status: string;
  decision_status: string;
  responded_at?: string | null;
  responded_name?: string | null;
  expires_at?: string | null;
};

export type OfferDelivery = {
  id: string;
  subject: string;
  status: string;
  sent_at?: string | null;
  expires_at?: string | null;
  recipient_emails: string[];
  items: OfferDeliveryItem[];
};

export function termsReferenceMatches(reference: { kind: string; id: string; version: number } | null, terms: { kind: string; id: string; version: number } | null) {
  if (!reference || !terms) return false;
  const kind = reference.kind === "client_terms" ? "application_term_sheet" : reference.kind;
  return kind === terms.kind && reference.id === terms.id && reference.version === terms.version;
}

/** A response always answers the immutable terms version that was delivered. */
export function currentTermsDelivery(deliveries: OfferDelivery[], terms: { kind: string; id: string; version: number } | null) {
  if (!terms) return null;
  const key = `${terms.kind}:${terms.id}:v${terms.version}`;
  const matching = deliveries.flatMap(delivery => {
    if (!delivery.sent_at || ["sending", "failed"].includes(delivery.status)) return [];
    return delivery.items.filter(item => item.kind === terms.kind && (item.item_key === key || (item.source_id === terms.id && item.source_version === terms.version)))
      .map(item => ({ delivery, item }));
  });
  matching.sort((a, b) => Date.parse(b.delivery.sent_at!) - Date.parse(a.delivery.sent_at!));
  return matching[0] ?? null;
}
