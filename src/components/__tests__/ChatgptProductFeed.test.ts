import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChatgptFeedRun } from "@/lib/chatgptProductFeed";

vi.mock("@/hooks/useApi", () => ({ useCurrentUser: () => ({ authReady: true, isLoading: false, data: { id: "client", role: "client", account_status: "active" } }), useDevUser: vi.fn(), useAuthedApi: vi.fn() }));
import { ChatgptProductFeedSection, FeedDeliveryControls, FeedUploadHistory } from "../settings/ChatgptProductFeedSection";

describe("ChatGPT feed settings presentation", () => {
  it("does not mount management requests for a client accessing the section directly", () => {
    const html = renderToStaticMarkup(createElement(ChatgptProductFeedSection));
    expect(html).toContain("Super-admin access is required");
    expect(html).not.toContain("Create dedicated key");
    expect(html).not.toContain("SFTP host");
  });
  it("shows actionable upload blocking and keeps preview available", () => {
    const html = renderToStaticMarkup(createElement(FeedDeliveryControls, { problem: "Record OpenAI’s acceptance first.", busy: false, dirty: false, hasEligible: false, onPreview: vi.fn(), onDownload: vi.fn(), onSync: vi.fn() }));
    expect(html).toContain("Record OpenAI’s acceptance first.");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Sync now/s);
    expect(html).toMatch(/<button[^>]*>.*?Preview catalog/s);
  });
  it("shows failed runs and unverified processing without implying products are live", () => {
    const base: ChatgptFeedRun = { id: "1", status: "uploaded", trigger: "manual", attempt_count: 1, created_at: "2026-11-12T15:00:00Z", eligible_count: 2, excluded_count: 3, processing_status: "not_verified" };
    const html = renderToStaticMarkup(createElement(FeedUploadHistory, { runs: [base, { ...base, id: "2", status: "failed", last_error: "Server fingerprint did not match." }] }));
    expect(html).toContain("Uploaded · processing not verified");
    expect(html).toContain("Server fingerprint did not match.");
    expect(html).toContain("2 offers · 3 excluded");
    expect(html).not.toContain("Products are live");
  });
});
