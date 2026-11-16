// The queue the Elara inbox used to hold, answered on the dashboard and on a
// file. These pin who may decide, what can be approved from here, and that a
// file only shows its own suggestions.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BucketAIActionItemQueueItem } from "@/lib/types";

const state = vi.hoisted(() => ({
  role: "super_admin",
  queue: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock("@/hooks/useApi", () => ({
  useCurrentUser: () => ({ data: { role: state.role } }),
  useProposedActionItems: () => ({ ...state.queue, refetch: vi.fn() }),
  useDecideActionItem: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

import { AiSuggestionsPanel, routeLabel, suggestionHref, waitingDays, waitingLabel, waitingTone } from "../AiSuggestionsPanel";

const item = (overrides: Partial<BucketAIActionItemQueueItem> = {}): BucketAIActionItemQueueItem => ({
  id: "item-1", bucket_id: "bucket-a", status: "proposed", route: "admin",
  title: "Ask for the 2025 tax return", instructions: "The file has 2024 only.", rationale: null,
  created_by: "ai", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z",
  bucket_name: "Ruiz Auto Group room", client_name: "Ruiz Auto Group", intake_id: "file-a",
  href: "/admin/ai-underwriter-leads?lead=file-a", approvable_here: true, ...overrides,
});

const panel = (props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(AiSuggestionsPanel, props));

beforeEach(() => {
  state.role = "super_admin";
  state.queue = { data: undefined, isLoading: false, isError: false };
});

describe("how long a suggestion has waited", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("counts whole days and colours a long wait", () => {
    expect(waitingDays("2026-11-16T01:00:00Z", now)).toBe(0);
    expect(waitingLabel("2026-11-16T01:00:00Z", now)).toBe("today");
    expect(waitingLabel("2026-11-10T12:00:00Z", now)).toBe("6d waiting");
    expect(waitingTone("2026-11-10T12:00:00Z", now)).toBe("mut");
    expect(waitingTone("2026-11-08T12:00:00Z", now)).toBe("warn");
    expect(waitingTone("2026-11-01T12:00:00Z", now)).toBe("bad");
    expect(waitingDays("not a date", now)).toBe(0);
  });
});

describe("where a suggestion leads", () => {
  it("opens the file's own page when there is a file, the room otherwise", () => {
    expect(suggestionHref({ intake_id: "file-a", href: "/admin/ai-underwriter-leads?lead=file-a" })).toBe("/files/file-a");
    expect(suggestionHref({ intake_id: null, href: "/admin/buckets?bucket=bucket-b" })).toBe("/admin/buckets?bucket=bucket-b");
  });
  it("names who a suggestion is addressed to", () => {
    expect(routeLabel("admin")).toBe("Desk");
    expect(routeLabel("uploader")).toBe("Client");
    expect(routeLabel("vendor")).toBe("Vendor");
    expect(routeLabel("something")).toBe("something");
  });
});

describe("the suggestions queue", () => {
  it("lets a super admin approve what is addressed to the desk and only dismiss the rest", () => {
    state.queue.data = [item(), item({ id: "item-2", route: "uploader", approvable_here: false, title: "Send the client a reminder" })];
    const html = panel();
    expect(html).toContain("2 waiting for a decision");
    expect(html).toContain("Ask for the 2025 tax return");
    expect(html).toContain("Desk acts");
    expect(html).toContain("Client acts");
    expect(html).toContain('href="/files/file-a"');
    expect(html.match(/>Approve</g)).toHaveLength(1);
    expect(html.match(/>Dismiss</g)).toHaveLength(2);
  });

  it("shows underwriting the queue without the decision", () => {
    state.role = "loan_exec";
    state.queue.data = [item()];
    const html = panel();
    expect(html).toContain("Ask for the 2025 tax return");
    expect(html).not.toContain(">Approve<");
    expect(html).not.toContain(">Dismiss<");
  });

  it("shows nobody outside the desk anything", () => {
    state.role = "broker";
    state.queue.data = [item()];
    expect(panel()).toBe("");
  });

  it("on a file, shows only that file's suggestions and steps aside when there are none", () => {
    state.queue.data = [item(), item({ id: "item-2", bucket_id: "bucket-b", title: "Somebody else's" })];
    const mine = panel({ bucketId: "bucket-a", hideWhenEmpty: true });
    expect(mine).toContain("Ask for the 2025 tax return");
    expect(mine).not.toContain("Somebody else");
    expect(mine).toContain("1 waiting for a decision");
    expect(panel({ bucketId: "bucket-c", hideWhenEmpty: true })).toBe("");
  });

  it("says nothing is waiting on the dashboard rather than disappearing", () => {
    state.queue.data = [];
    expect(panel()).toContain("Nothing is waiting");
    state.queue = { data: undefined, isLoading: false, isError: true };
    expect(panel()).toContain("could not be loaded");
  });

  it("pages a long queue", () => {
    state.queue.data = Array.from({ length: 8 }, (_, index) => item({ id: `item-${index}`, title: `Suggestion ${index}` }));
    const html = panel({ pageSize: 5 });
    expect(html).toContain("Suggestion 4");
    expect(html).not.toContain("Suggestion 5");
    expect(html).toContain("Show more (3 left)");
  });
});
