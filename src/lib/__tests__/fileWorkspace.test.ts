import { describe, expect, it } from "vitest";
import { FILE_WORKSPACE_TOOLS, fileWorkspaceHref, isFileWorkspaceSaved, parseFileWorkspaceRequest } from "../fileWorkspace";

const intake = "99000000-0000-4000-8000-000000000001";
describe("staff file workspace URLs", () => {
  it.each(FILE_WORKSPACE_TOOLS)("round trips the allowlisted %s workspace without financial payloads", tool => {
    const url = new URL(fileWorkspaceHref(intake, { tool }), "https://workspace.example.test");
    expect(url.pathname).toBe(`/files/${intake}/workspace`);
    expect(parseFileWorkspaceRequest(url.searchParams)?.tool).toBe(tool);
    expect([...url.searchParams.keys()]).toEqual(["tool"]);
  });
  it("retains the requested financial form, view and loan-row identity", () => {
    const request = { tool: "forms" as const, kind: "debt_schedule" as const, view: "worksheet" as const, debtId: "99000000-0000-4000-8000-000000000020" };
    const url = new URL(fileWorkspaceHref(intake, request), "https://workspace.example.test");
    expect(parseFileWorkspaceRequest(url.searchParams)).toMatchObject(request);
  });
  it("keeps the destination internal when the path identity contains URL punctuation", () => {
    const url = new URL(fileWorkspaceHref("a/b?return=https://elsewhere.example", { tool: "forms" }), "https://workspace.example.test");
    expect(url.origin).toBe("https://workspace.example.test");
    expect(url.pathname).toBe("/files/a%2Fb%3Freturn%3Dhttps%3A%2F%2Felsewhere.example/workspace");
    expect([...url.searchParams.keys()]).toEqual(["tool"]);
  });
  it("never interprets unrelated query parameters as save actions or source authority", () => {
    const request = parseFileWorkspaceRequest(new URLSearchParams("tool=marketplace&publish=true&profile_id=forged&loan_amount=999999&return=https://elsewhere.example"));
    expect(request?.tool).toBe("marketplace");
    for (const key of ["publish", "profile_id", "loan_amount", "return"]) expect(request).not.toHaveProperty(key);
  });
  it("does not pass unknown form kinds or views into the editor", () => {
    const request = parseFileWorkspaceRequest(new URLSearchParams("tool=forms&kind=private_secret&view=publish"));
    expect(request?.kind).not.toBe("private_secret"); expect(request?.view).not.toBe("publish");
  });
});

describe("cross-tab saved notices", () => {
  const saved = { version: 1, type: "saved", eventId: "event-1", intakeId: intake, profileId: "profile-1", authScope: "operator:session", tool: "forms" };
  it("accepts the bounded IDs-and-authority envelope", () => expect(isFileWorkspaceSaved(saved)).toBe(true));
  it.each([
    { ...saved, body: { loan_amount: 123 } }, { ...saved, token: "secret" }, { ...saved, tool: "publish" },
    { ...saved, profileId: "" }, { ...saved, authScope: "" }, { ...saved, eventId: "x".repeat(257) },
    { ...saved, type: "saved-and-send" }, { ...saved, version: 2 }, null,
  ])("rejects malformed, oversized or financial-bearing messages %j", value => expect(isFileWorkspaceSaved(value)).toBe(false));
  it.each(["", "unknown", "forms&publish=true"])("rejects the unallowlisted tool %s", tool => expect(parseFileWorkspaceRequest(new URLSearchParams({ tool }))).toBeNull());
});
