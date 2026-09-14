import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { LockedEvidenceBadge, UnlockedCopyRequestControl } from "@/components/application/LockedEvidenceStatus";

(globalThis as unknown as { React: typeof React }).React = React;

describe("LockedEvidenceBadge", () => {
  it("announces the locked state without relying on color or the icon", () => {
    const html = renderToStaticMarkup(createElement(LockedEvidenceBadge, {
      presentation: {
        title: "Locked PDF",
        badge: "Password required",
        explanation: "AI cannot read this file.",
      },
    }));

    expect(html).toContain("Password required");
    expect(html).not.toContain('role="status"');
    expect(html).toContain('aria-label="Locked PDF: Password required"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("renders request lifecycle states as text, not color alone", () => {
    const failed = renderToStaticMarkup(createElement(UnlockedCopyRequestControl, {
      request: { request_status: "requested", delivery_status: "failed" },
      onRequest: () => undefined,
      onCopyRoomLink: () => undefined,
    }));
    const created = renderToStaticMarkup(createElement(UnlockedCopyRequestControl, {
      request: { request_status: "requested", delivery_status: "created" },
      onRequest: () => undefined,
      onCopyRoomLink: () => undefined,
    }));
    const received = renderToStaticMarkup(createElement(UnlockedCopyRequestControl, {
      request: { request_status: "uploaded", delivery_status: "sent", replacement_review_state: "received" },
    }));
    const needsAnother = renderToStaticMarkup(createElement(UnlockedCopyRequestControl, {
      request: { request_status: "uploaded", delivery_status: "sent", replacement_review_state: "needs_another_copy" },
      onRequest: () => undefined,
      onCopyRoomLink: () => undefined,
    }));

    expect(failed).toContain("Retry request");
    expect(failed).toContain("Copy room link");
    expect(created).toContain("Unlocked copy requested");
    expect(created).toContain("Retry email");
    expect(created).toContain("Copy room link");
    expect(received).toContain("Replacement received");
    expect(needsAnother).toContain("Another unlocked copy needed");
    expect(needsAnother).toContain("Send request again");
    expect(needsAnother).toContain("Copy room link");
  });
});
