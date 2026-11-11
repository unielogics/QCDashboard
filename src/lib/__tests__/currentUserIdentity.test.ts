import { describe, expect, it } from "vitest";
import { currentUserIdentity } from "@/hooks/useApi";

const signed = { isLoaded: true, isSignedIn: true, userId: "synthetic-user-a", sessionId: "synthetic-session-a" };
describe("current user cache identity", () => {
  it("partitions signed-in users and sessions, not just a signed-in boolean", () => {
    const first = currentUserIdentity(signed, "unused-dev", false);
    expect(first).toBe("clerk:synthetic-user-a:synthetic-session-a");
    expect(currentUserIdentity({ ...signed, userId: "synthetic-user-b" }, "unused-dev", false)).not.toBe(first);
    expect(currentUserIdentity({ ...signed, sessionId: "synthetic-session-b" }, "unused-dev", false)).not.toBe(first);
  });
  it.each([{ ...signed, isLoaded: false }, { ...signed, isSignedIn: false }, { ...signed, isSignedIn: undefined }, { ...signed, userId: null }])("hides cached permissions while identity is unavailable", auth => {
    expect(currentUserIdentity(auth, "unused-dev", false)).toBeNull();
  });
  it("retains explicit visual QA identity isolation without relying on a real Clerk session", () => {
    const visual = { isLoaded: true, isSignedIn: true, userId: null, sessionId: null };
    expect(currentUserIdentity(visual, "desk-a@example.test", true)).toBe("visual:desk-a@example.test");
    expect(currentUserIdentity(visual, "desk-b@example.test", true)).not.toBe(currentUserIdentity(visual, "desk-a@example.test", true));
  });
});
