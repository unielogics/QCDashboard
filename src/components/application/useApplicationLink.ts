"use client";

// The link that opens a file's real estate loan application, for the desk to
// copy or email from wherever it is working (the file header, the checklist
// row, the application drawer, the new-file screen). The address is the
// file's own: the same one every time it is copied. The client opens it with
// a code emailed to them, so the link alone opens nothing.

import { useCallback } from "react";
import { useAuthedApi } from "@/hooks/useApi";
import { applicationLinkPath, type ApplicationLinkReply } from "@/lib/reApplication";

export type ApplicationLinkOptions = { sendEmail?: boolean; role?: "borrower" | "coborrower"; reset?: boolean };
export type ApplicationLinkResult = ApplicationLinkReply & { copied: boolean };

export function applicationLinkWords(result: ApplicationLinkResult): string {
  const who = result.role === "coborrower" ? "The co-borrower" : "The client";
  const code = `${who} opens it with a code we email to ${result.email || "them"}.`;
  if (result.emailed) return `Link emailed to ${result.email || "the client"}.`;
  if (result.copied) return `Application link copied. ${code}`;
  return `Copying was blocked by the browser. The link is ${result.url}`;
}

export function useApplicationLink() {
  const apiCall = useAuthedApi();
  return useCallback(async (profileId: string, options: ApplicationLinkOptions = {}): Promise<ApplicationLinkResult> => {
    const reply = await apiCall<ApplicationLinkReply>(applicationLinkPath(profileId), {
      method: "POST",
      body: JSON.stringify({ send_email: Boolean(options.sendEmail), role: options.role ?? "borrower", reset: Boolean(options.reset) }),
    });
    let copied = false;
    if (!options.sendEmail) {
      try {
        await navigator.clipboard.writeText(reply.url);
        copied = true;
      } catch {
        copied = false;
      }
    }
    return { ...reply, copied };
  }, [apiCall]);
}
