import { describe, expect, it } from "vitest";
import { currentTermsDelivery, termsReferenceMatches, type OfferDelivery } from "../offerDeliveryState";

const terms = { kind: "application_term_sheet", id: "terms-a", version: 2 };
const delivery = (id: string, version: number, sentAt: string, status = "sent"): OfferDelivery => ({
  id, subject: "Synthetic offer", status, sent_at: sentAt, recipient_emails: [],
  items: [{ id: `item-${id}`, kind: "application_term_sheet", item_key: `application_term_sheet:terms-a:v${version}`, label: "Financing terms", title: "Terms", file_name: "terms.pdf", content_type: "application/pdf", status: "pending", decision_status: "pending" }],
});

describe("current immutable client terms response", () => {
  it("recognizes the legacy client_terms reference without accepting another version", () => {
    expect(termsReferenceMatches({ ...terms, kind: "client_terms" }, terms)).toBe(true);
    expect(termsReferenceMatches({ ...terms, kind: "client_terms", version: 1 }, terms)).toBe(false);
    expect(termsReferenceMatches({ ...terms, kind: "production_term_sheet" }, terms)).toBe(false);
    expect(termsReferenceMatches(null, terms)).toBe(false);
  });
  it("matches source identity and version rather than the latest unrelated sent offer", () => {
    const old = delivery("old", 1, "2026-11-10T13:00:00Z"), current = delivery("current", 2, "2026-11-09T13:00:00Z");
    expect(currentTermsDelivery([old, current], terms)?.delivery.id).toBe("current");
    expect(currentTermsDelivery([old], terms)).toBeNull();
  });
  it("uses the latest successfully delivered copy and ignores failed or uncertain handoffs", () => {
    const first = delivery("first", 2, "2026-11-08T13:00:00Z"), latest = delivery("latest", 2, "2026-11-09T13:00:00Z");
    expect(currentTermsDelivery([delivery("failed", 2, "2026-11-10T13:00:00Z", "failed"), first, delivery("uncertain", 2, "2026-11-10T14:00:00Z", "sending"), latest], terms)?.delivery.id).toBe("latest");
  });
  it("supports explicit source metadata and never matches a different instrument or missing source", () => {
    const current = delivery("current", 2, "2026-11-09T13:00:00Z");
    current.items[0].item_key = undefined;
    expect(currentTermsDelivery([current], terms)).toBeNull();
    current.items[0].source_id = "terms-a"; current.items[0].source_version = 2;
    expect(currentTermsDelivery([current], terms)?.item.id).toBe("item-current");
    current.items[0].kind = "production_term_sheet";
    expect(currentTermsDelivery([current], terms)).toBeNull();
    expect(currentTermsDelivery([current], null)).toBeNull();
  });
});
