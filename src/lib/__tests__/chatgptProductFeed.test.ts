import { describe, expect, it } from "vitest";
import {
  canManageChatgptFeed, feedRunLabel, feedSettingsWrite, feedSourceApproved, feedSyncProblem, mergeFeedServerState, patchFeedOffer, publicFeedUrl,
  type ChatgptFeedPreview, type ChatgptFeedSettings,
} from "../chatgptProductFeed";

const settings = (): ChatgptFeedSettings => ({
  revision: 3, enabled: false, acceptance_confirmed: true, acceptance_reference: "Confirmed financing format and price treatment",
  sftp_host: "sftp.example.com", sftp_port: 22, sftp_username: "qc", server_fingerprint: "SHA256:example",
  remote_directory: "/import", staging_directory: "/staging", staging_isolation_confirmed: false, filename: "qualified-commercial.csv.gz", schedule_hour_utc: 10,
  brand: "Qualified Commercial", seller_name: "Qualified Commercial", catalog_overrides: {},
  public_key: "ssh-ed25519 PUBLIC", private_key_configured: true, delivery_verified_at: "2026-11-12T15:00:00Z",
});
const preview = (): ChatgptFeedPreview => ({ generated_at: "2026-11-12T15:00:00Z", source_count: 5, eligible_count: 1, excluded_count: 4, ready_for_upload: true, blockers: [], items: [] });

describe("ChatGPT product feed controls", () => {
  it("requires the actual active super-admin principal", () => {
    expect(canManageChatgptFeed({ role: "super_admin", account_status: "active" })).toBe(true);
    for (const user of [undefined, { role: "super_admin" }, { role: "super_admin", account_status: "suspended" }, { role: "underwriter", account_status: "active" }, { role: "client", account_status: "active" }]) expect(canManageChatgptFeed(user)).toBe(false);
  });
  it("never submits server state or a secret leaked into a settings object", () => {
    const payload = feedSettingsWrite({ ...settings(), private_key: "DO NOT SEND", updated_by: "actor" } as ChatgptFeedSettings);
    expect(JSON.stringify(payload)).not.toContain("DO NOT SEND");
    expect(payload).not.toHaveProperty("public_key");
    expect(payload).not.toHaveProperty("private_key_configured");
    expect(payload).not.toHaveProperty("delivery_verified_at");
    expect(payload.currency).toBe("USD");
  });
  it("keeps a parked draft and its original revision when another admin saves", () => {
    const draft = { ...settings(), catalog_overrides: { merchant_cash_advance: { description: "My unsaved copy" } } };
    const server = { ...settings(), revision: 4, catalog_overrides: { merchant_cash_advance: { description: "Other admin copy" } }, public_key: "ssh-ed25519 NEW" };
    const refreshed = mergeFeedServerState(draft, server);
    expect(refreshed.catalog_overrides.merchant_cash_advance.description).toBe("My unsaved copy");
    expect(refreshed.revision).toBe(3);
    expect(refreshed.public_key).toBe("ssh-ed25519 NEW");
    expect(mergeFeedServerState(draft, server, true).revision).toBe(4);
  });
  it("requires reapproval after copy, source or payable price changes", () => {
    const approved = { title: "MCA", content_approved: true, pricing_confirmed: true, actual_price: "100.00", approved_source_revision: "v1" };
    expect(patchFeedOffer(approved, { title: "MCA working capital" })).toMatchObject({ content_approved: false, approved_source_revision: null, pricing_confirmed: true });
    expect(patchFeedOffer(approved, { actual_price: "200.00" })).toMatchObject({ pricing_confirmed: false, content_approved: true });
    expect(patchFeedOffer(approved, { included: false }).content_approved).toBe(true);
    expect(feedSourceApproved({ source_revision: "v1" }, approved)).toBe(true);
    expect(feedSourceApproved({ source_revision: "v2" }, approved)).toBe(false);
  });
  it("blocks upload for unsaved edits, stale previews and unconfirmed financing prices", () => {
    expect(feedSyncProblem(settings(), preview(), false, true)).toBeNull();
    expect(feedSyncProblem(settings(), preview(), true, true)).toMatch(/Save changes/);
    expect(feedSyncProblem(settings(), preview(), false, false)).toMatch(/Preview/);
    expect(feedSyncProblem({ ...settings(), acceptance_confirmed: false }, preview(), false, true)).toMatch(/acceptance/);
    expect(feedSyncProblem({ ...settings(), delivery_verified_at: null }, preview(), false, true)).toMatch(/Test/);
    expect(feedSyncProblem(settings(), { ...preview(), eligible_count: 0 }, false, true)).toMatch(/validation/);
    expect(feedSyncProblem(settings(), { ...preview(), eligible_count: 0, export_count: 1, disabled_count: 1 }, false, true)).toBeNull();
    expect(feedSyncProblem(settings(), { ...preview(), ready_for_upload: false, blockers: ["Missing payable price"] }, false, true)).toBe("Missing payable price");
  });
  it("distinguishes a successful transfer from product ingestion", () => {
    expect(feedRunLabel({ status: "uploaded" })).toBe("Uploaded · processing not verified");
    expect(feedRunLabel({ status: "failed" })).toBe("Failed");
  });
  it("limits previews to credential-free public HTTPS URLs", () => {
    expect(publicFeedUrl("https://qualifiedcommercial.com/images/products/mca.png")).toBe("https://qualifiedcommercial.com/images/products/mca.png");
    for (const value of ["javascript:alert(1)", "http://example.com/a", "https://127.0.0.1/a", "https://[::1]/a", "https://localhost/a", "https://host.internal/a", "https://user:secret@example.com/a", "https://example.com/a?token=secret", "https://example.com:8443/a"]) expect(publicFeedUrl(value)).toBeNull();
  });
});
