import { describe, expect, it } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { clientTermsSummaryKey, fileAuthScope, fileDetailKey, fileDetailPath, needsFullFileAnalysis } from "../fileOpening";

describe("file-opening identity and load boundaries", () => {
  const auth = { isLoaded: true, isSignedIn: true, userId: "staff-a", sessionId: "session-a", orgId: "org-a" };
  it("separates principals, sessions, organisations and QA identities", () => {
    const scope = fileAuthScope(auth);
    for (const changed of [{ userId: "staff-b" }, { sessionId: "session-b" }, { orgId: "org-b" }]) {
      expect(fileAuthScope({ ...auth, ...changed })).not.toBe(scope);
    }
    expect(fileAuthScope(auth, "admin@qc.dev")).not.toBe(fileAuthScope(auth, "agent@qc.dev"));
    expect(fileAuthScope({ ...auth, isSignedIn: false })).toBe("signed-out");
    expect(fileAuthScope({ ...auth, isLoaded: false })).toBe("auth-pending");
  });
  it("never shares factual and derived snapshots or different files", () => {
    const scope = fileAuthScope(auth);
    expect(fileDetailKey(scope, "file-a")).not.toEqual(fileDetailKey(scope, "file-b"));
    expect(fileDetailKey(scope, "file-a")).not.toEqual(fileDetailKey(scope, "file-a", true));
    expect(fileDetailPath("file a")).toBe("/admin/ai-underwriter-leads/file%20a?include_derived=false");
    expect(fileDetailPath("file-a", true)).toContain("include_derived=true");
  });
  it("does not calculate full analysis on routine opening or communication sections", () => {
    for (const section of ["overview", "conversation", "documents", "banking", "evidence", "communications", "payments", "timeline"]) expect(needsFullFileAnalysis(section)).toBe(false);
    expect(needsFullFileAnalysis("review")).toBe(true);
    expect(needsFullFileAnalysis("package")).toBe(true);
  });
  it("keeps reduced terms reads away from the editor while prefix invalidation refreshes both", async () => {
    const client = new QueryClient();
    const editorKey = ["application-client-terms", "profile-a"];
    const summaryKey = clientTermsSummaryKey("profile-a");
    client.setQueryData(editorKey, { version: 3, plan: { loan: { amount: 200000 } } });
    client.setQueryData(summaryKey, { version: 3, plan: null });
    expect(client.getQueryData(editorKey)).toMatchObject({ plan: { loan: { amount: 200000 } } });
    await client.invalidateQueries({ queryKey: editorKey, refetchType: "none" });
    expect(client.getQueryState(editorKey)?.isInvalidated).toBe(true);
    expect(client.getQueryState(summaryKey)?.isInvalidated).toBe(true);
    client.clear();
  });
});
