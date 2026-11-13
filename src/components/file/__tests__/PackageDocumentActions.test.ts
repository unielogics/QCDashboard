import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Artifact } from "../leadFile";

const identity = vi.hoisted(() => ({ isLoaded: true, isSignedIn: true, userId: "operator", sessionId: "session", orgId: null, getToken: async () => "test-token" }));
vi.mock("@/lib/consoleAuth", () => ({ useConsoleAuth: () => identity }));
import { PackageDocumentActions } from "../PackageDocumentActions";

const artifact: Artifact = { id: "saved-report", intake_id: "synthetic-file", artifact_type: "investor_presentation", title: "Saved report", version: 7, status: "current", preview_url: "https://files.example.test/expired-cached-preview", download_url: "https://files.example.test/expired-cached-download", created_at: "2026-11-13T12:00:00Z", updated_at: "2026-11-13T12:00:00Z" };

describe("retained package document actions", () => {
  it("renders real Preview/Download buttons without exposing cached presigned hrefs", () => {
    const markup = renderToStaticMarkup(createElement(PackageDocumentActions, { artifact, label: "Investor report" }));
    expect(markup).toContain('aria-label="Preview Investor report version 7"');
    expect(markup).toContain('aria-label="Download Investor report version 7"');
    expect(markup).toContain("<button"); expect(markup).not.toContain("expired-cached"); expect(markup).not.toContain("<a ");
  });
  it("disables document actions while the authenticated session is unavailable", () => {
    identity.isSignedIn = false;
    try { const markup = renderToStaticMarkup(createElement(PackageDocumentActions, { artifact, label: "Investor report" })); expect(markup.match(/disabled=""/g)).toHaveLength(2); }
    finally { identity.isSignedIn = true; }
  });
});
