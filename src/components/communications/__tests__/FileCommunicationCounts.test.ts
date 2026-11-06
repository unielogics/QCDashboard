import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FileCommunicationCounts } from "../FileCommunicationCounts";

const render = (overrides: Partial<Parameters<typeof FileCommunicationCounts>[0]> = {}) => renderToStaticMarkup(createElement(FileCommunicationCounts, {
  intakeId: "file-a", name: "Example Company", loading: false, unavailable: false, ...overrides,
}));

describe("file table communication counts", () => {
  it("opens the corresponding file channel and retains separate unread counts", () => {
    const html = render({ counts: { sms: 3, email: 2 } });
    expect(html).toContain('href="/files/file-a?section=communications&amp;channel=client"');
    expect(html).toContain('href="/files/file-a?section=communications&amp;channel=email"');
    expect(html).toContain('aria-label="3 unread SMS messages"');
    expect(html).toContain('aria-label="2 unread email messages"');
    expect(html).not.toContain("99+");
  });
  it("shows only channels with unread messages and caps the visual badge", () => {
    const html = render({ counts: { sms: 120, email: 0 } });
    expect(html).toContain("99+");
    expect(html).toContain('aria-label="120 unread SMS messages"');
    expect(html).not.toContain("channel=email");
  });
  it("distinguishes a confirmed zero from an unavailable count", () => {
    expect(render({ counts: { sms: 0, email: 0 } })).toContain("No new messages");
    expect(render()).toContain("Counts unavailable");
    expect(render({ unavailable: true })).not.toContain("No new messages");
  });
  it("keeps loading distinct from a confirmed zero", () => {
    expect(render({ loading: true })).toContain("Loading counts");
    expect(render({ loading: true })).not.toContain("No new messages");
  });
  it("retains last loaded positive counts during a failed refresh", () => {
    const html = render({ counts: { sms: 1, email: 2 }, unavailable: true });
    expect(html).toContain("Last loaded counts");
    expect(html).toContain('aria-label="1 unread SMS message"');
    expect(html).toContain("channel=email");
  });
  it("does not present stale zero counts as current after a failed refresh", () => {
    const html = render({ counts: { sms: 0, email: 0 }, unavailable: true });
    expect(html).toContain("Counts unavailable");
    expect(html).not.toContain("No new messages");
  });
});
