// The Elara inbox is retired. Nothing in any role's navigation points at it,
// and the badge that counted its queue is gone with it.
import { describe, expect, it } from "vitest";
import { Role } from "@/lib/enums.generated";
import { NAV_BY_ROLE, navForRole } from "../nav.config";

const everyLink = (role: string) => {
  const nav = navForRole(role);
  return [
    ...nav.groups.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, badge: item.badge as string | undefined }))),
    ...nav.tools.flatMap((group) => group.items.map((item) => ({ label: item.label, href: item.href, badge: undefined as string | undefined }))),
  ];
};

describe("navigation after the Elara inbox", () => {
  it("has no entry for the inbox in any role's menu or tools", () => {
    for (const role of Object.keys(NAV_BY_ROLE)) {
      for (const link of everyLink(role)) {
        expect(link.href, `${role}: ${link.label}`).not.toContain("/ai-inbox");
        expect(link.label.toLowerCase(), `${role}: ${link.label}`).not.toContain("elara inbox");
        expect(link.badge, `${role}: ${link.label}`).not.toBe("elaraTasks");
      }
    }
  });

  it("keeps the desk's working set: dashboard, files, clients", () => {
    for (const role of [Role.SUPER_ADMIN, Role.LOAN_EXEC]) {
      const hrefs = everyLink(role).map((link) => link.href);
      expect(hrefs).toContain("/");
      expect(hrefs).toContain("/admin/ai-underwriter-leads");
      expect(hrefs).toContain("/clients");
    }
  });

  it("leaves the agent their outreach tools", () => {
    const hrefs = everyLink(Role.BROKER).map((link) => link.href);
    expect(hrefs).toContain("/ai-agents");
    expect(hrefs).toContain("/clients");
  });
});
