// A client reads back as their files and their messages. These pin what the
// two panels say: the file's status in the directory's own words, where each
// link goes, and that a message is only offered for reading to someone the
// communications log would let read it.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientCommunicationRow, ClientFileRow } from "@/hooks/useApi";

const state = vi.hoisted(() => ({
  files: { data: undefined as unknown, isLoading: false, isError: false },
  messages: { data: undefined as unknown, isLoading: false, isError: false },
  unread: { data: undefined as unknown, isLoading: false, isError: false },
}));

vi.mock("@/hooks/useApi", () => ({
  useClientFiles: () => ({ ...state.files, refetch: vi.fn() }),
  useClientCommunications: () => ({ ...state.messages, refetch: vi.fn() }),
  useIntakeCommunicationUnreadBatch: () => state.unread,
  useCommsMessage: () => ({ data: undefined, isLoading: false, isError: false }),
}));

import { ClientFilesPanel, ClientMessagesPanel, contextLabel, fileTitle, lastActivityAt, sinceLabel } from "../ClientFilesAndMessages";

const file = (overrides: Partial<ClientFileRow> = {}): ClientFileRow => ({
  id: "file-a", profile_id: "profile-a", bucket_id: "bucket-a", variant: "dealer_gatekeeper_v1",
  full_name: "Dana Ruiz", business_name: "Ruiz Auto Group", loan_purpose: null,
  status: "reviewed", outcome_status: "submitted", underwriting_status: "in_underwriting",
  workspace_state: "active", workspace_state_reason: null, requested_loan_amount: 250000,
  file_count: 3, missing_required_count: 2, created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-15T10:00:00Z", last_message_at: null, archived_at: null, ...overrides,
});

const message = (overrides: Partial<ClientCommunicationRow> = {}): ClientCommunicationRow => ({
  id: "sms:1", channel: "sms", direction: "outbound", occurred_at: "2026-11-15T15:00:00Z",
  counterpart: "+17025550101", subject: null, snippet: "Your secure room is ready.", status: "delivered",
  detail: "", context: "room_link", actor_name: null, delivered_at: "2026-11-15T15:00:05Z", opened_at: null,
  can_open: false, intake_id: "file-a", file_title: "Ruiz Auto Group", ...overrides,
});

const filesPanel = () => renderToStaticMarkup(createElement(ClientFilesPanel, { clientId: "client-a", clientName: "Dana Ruiz" }));
const messagesPanel = () => renderToStaticMarkup(createElement(ClientMessagesPanel, { clientId: "client-a", clientName: "Dana Ruiz" }));

beforeEach(() => {
  state.files = { data: undefined, isLoading: false, isError: false };
  state.messages = { data: undefined, isLoading: false, isError: false };
  state.unread = { data: undefined, isLoading: false, isError: false };
});

describe("how recently something moved", () => {
  const now = Date.parse("2026-11-16T12:00:00Z");
  it("counts minutes, hours and days before falling back to a date", () => {
    expect(sinceLabel("2026-11-16T11:59:40Z", now)).toBe("just now");
    expect(sinceLabel("2026-11-16T11:15:00Z", now)).toBe("45m ago");
    expect(sinceLabel("2026-11-16T07:00:00Z", now)).toBe("5h ago");
    expect(sinceLabel("2026-11-13T12:00:00Z", now)).toBe("3d ago");
    expect(sinceLabel("2026-09-01T12:00:00Z", now)).toContain("2026");
  });
  it("says nothing for a missing or unreadable time", () => {
    expect(sinceLabel(null, now)).toBe("—");
    expect(sinceLabel("not a date", now)).toBe("—");
  });
  it("takes the later of the last edit and the last message", () => {
    expect(lastActivityAt({ updated_at: "2026-11-10T00:00:00Z", last_message_at: "2026-11-12T00:00:00Z" })).toBe("2026-11-12T00:00:00Z");
    expect(lastActivityAt({ updated_at: "2026-11-10T00:00:00Z", last_message_at: "2026-11-01T00:00:00Z" })).toBe("2026-11-10T00:00:00Z");
    expect(lastActivityAt({ updated_at: "2026-11-10T00:00:00Z" })).toBe("2026-11-10T00:00:00Z");
  });
});

describe("a client's files", () => {
  it("names a file by its business and falls back to the person", () => {
    expect(fileTitle({ business_name: "Ruiz Auto Group", full_name: "Dana Ruiz" })).toBe("Ruiz Auto Group");
    expect(fileTitle({ business_name: null, full_name: "Dana Ruiz" })).toBe("Dana Ruiz");
  });

  it("lists each file with the directory's status, its documents and a way in", () => {
    state.files.data = [
      file(),
      file({ id: "file-b", business_name: "Ruiz Leasing", workspace_state: "archived", archived_at: "2026-10-01T00:00:00Z", file_count: 1, missing_required_count: 0, requested_loan_amount: null }),
    ];
    state.unread.data = { items: [{ intake_id: "file-a", sms: 2, email: 0 }] };
    const html = filesPanel();
    expect(html).toContain("1 open · 1 closed or archived");
    expect(html).toContain('href="/files/file-a"');
    expect(html).toContain("Ruiz Auto Group");
    expect(html).toContain("Dealer · Dana Ruiz");
    expect(html).toContain("In underwriting");
    expect(html).toContain("3 documents");
    expect(html).toContain("2 still needed");
    expect(html).toContain("$250,000");
    expect(html).toContain('href="/files/file-a?section=documents"');
    expect(html).toContain('href="/files/file-a?section=communications&amp;channel=client"');
    // The second file: one document, nothing outstanding, archived.
    expect(html).toContain("1 document</a>");
    expect(html).toContain("Archived");
    expect(html.match(/still needed/g)).toHaveLength(1);
  });

  it("says so when the client has no files, and when they could not be read", () => {
    state.files.data = [];
    expect(filesPanel()).toContain("No files yet");
    state.files = { data: undefined, isLoading: false, isError: true };
    const failed = filesPanel();
    expect(failed).toContain("could not be loaded");
    expect(failed).not.toContain("No files yet");
    state.files = { data: undefined, isLoading: true, isError: false };
    expect(filesPanel()).toContain("Loading files");
  });
});

describe("a client's messages", () => {
  it("labels why a message was sent and shows an unknown reason as written", () => {
    expect(contextLabel("room_link")).toBe("Room link");
    expect(contextLabel("file_updates")).toBe("File update digest");
    expect(contextLabel("precall_nudge")).toBe("precall nudge");
    expect(contextLabel("")).toBeNull();
  });

  it("shows texts and emails together, each with its outcome and its file", () => {
    state.messages.data = {
      items: [
        message(),
        message({ id: "send:2", channel: "email", counterpart: "dana@ruizauto.com", subject: "Documents still needed", snippet: null, status: "sent", opened_at: "2026-11-15T16:00:00Z", can_open: true, actor_name: "Franco", context: "manual" }),
        message({ id: "reply:3", channel: "email", direction: "inbound", counterpart: "dana@ruizauto.com", subject: "Re: Documents still needed", snippet: "Attached.", status: "received", context: "reply" }),
        message({ id: "sms:4", status: "blocked", snippet: null, detail: "This number has opted out of text messages.", intake_id: null, file_title: null }),
      ],
      counts: { sms: 2, email: 2 },
      file_count: 1,
    };
    const html = messagesPanel();
    expect(html).toContain("To +17025550101");
    expect(html).toContain("From dana@ruizauto.com");
    expect(html).toContain("Delivered");
    expect(html).toContain("Opened");
    expect(html).toContain("Room link");
    expect(html).toContain("Sent by Franco");
    expect(html).toContain('href="/files/file-a"');
    // A text opens the client conversation; an email opens the email thread.
    expect(html).toContain('href="/files/file-a?section=communications&amp;channel=client"');
    expect(html).toContain('href="/files/file-a?section=communications&amp;channel=email"');
    // A send that never went shows its reason in place of a body.
    expect(html).toContain("Not sent");
    expect(html).toContain("This number has opted out of text messages.");
    // Only the email this viewer may read offers to open it.
    expect(html.match(/Read the email/g)).toHaveLength(1);
    expect(html).toContain("Texts <span class=\"tag\">2</span>");
    expect(html).toContain("Email <span class=\"tag\">2</span>");
  });

  it("says so when there is nothing, and when it could not be read", () => {
    state.messages.data = { items: [], counts: { sms: 0, email: 0 }, file_count: 0 };
    expect(messagesPanel()).toContain("No texts or emails yet");
    state.messages = { data: undefined, isLoading: false, isError: true };
    expect(messagesPanel()).toContain("could not be loaded");
  });
});
