"use client";

// The platform-document acknowledgment, once per team login and once more
// whenever the documents change. Rendered by AppShell instead of the app when
// /auth/me says needs_acknowledgment; the screen's content — the versions in
// force, the three documents, the person's latest row, the linked company's
// signed agreement — comes from GET /legal/acknowledgment, so the three apps
// cannot drift on substance. The click posts back exactly the versions it was
// handed and lands a legal_acceptances row with the time, IP, browser and
// versions: a click-through, the sign-up checkbox's class, not an electronic
// signature. Upgrading it to a signed instrument is a ContractType plus a
// PlatformAccessGate-style ceremony and counsel's wording.
//
// No skip for anyone. Never a trap either: an error keeps Try again and the
// sign-out control in reach.

import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { Btn, PageHeader, Panel, StatusLine, Sub } from "@/components/ds";
import { useAcceptLegal, useAcknowledgment } from "@/hooks/useApi";
import { SIGN_IN_URL } from "@/lib/appUrl";

function effectiveDate(version: string): string {
  // A YYYY-MM-DD version string, read at noon UTC so no timezone slides it a day.
  const d = new Date(`${version}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? version : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}
function shortDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function AcknowledgmentGate() {
  const { data, isLoading, error, refetch } = useAcknowledgment();
  const accept = useAcceptLegal();
  const clerk = useClerk();
  const [problem, setProblem] = useState("");

  const submit = async () => {
    if (!data) return;
    setProblem("");
    try {
      await accept.mutateAsync(data.current);
    } catch (e) {
      setProblem(e instanceof Error ? e.message : "That did not save. Try again.");
    }
  };
  const signOut = async () => {
    try { await clerk.signOut({ redirectUrl: SIGN_IN_URL }); } catch { window.location.assign(SIGN_IN_URL); }
  };

  return (
    <div className="bareshell" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px" }}>
      <div className="grid" style={{ width: "min(640px, 100%)" }}>
        <div>
          <PageHeader title="Before you continue" />
          {data ? (
            <Sub>
              {data.latest
                ? `The platform documents changed since you acknowledged them on ${shortDate(data.latest.created_at)}. Read the current versions, then continue.`
                : "Every Qualified Commercial login — Funding, Field Desk and Audit — works under the same company-wide platform documents. Read them once, then continue. You will only be asked again if they change."}
            </Sub>
          ) : null}
        </div>
        {isLoading ? <Panel><Sub>Loading…</Sub></Panel> : null}
        {error ? (
          <Panel>
            <div className="grid g10">
              <StatusLine tone="bad">The documents could not be loaded. {error instanceof Error ? error.message : ""}</StatusLine>
              <div className="row" style={{ gap: 8 }}>
                <Btn onClick={() => { void refetch(); }}>Try again</Btn>
                <Btn onClick={signOut}>Sign out</Btn>
              </div>
            </div>
          </Panel>
        ) : null}
        {data ? (
          <Panel>
            <div className="grid g10">
              <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
                {data.documents.map((d) => (
                  <li key={d.key}>
                    <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> — effective {effectiveDate(d.version)}
                  </li>
                ))}
              </ul>
              {data.company_agreement ? (
                <Sub>
                  Your company&apos;s agreement is on file. {data.company_agreement.company_name} signed the {data.company_agreement.title} (No. {data.company_agreement.contract_number})
                  {data.company_agreement.signed_at ? ` on ${shortDate(data.company_agreement.signed_at)}` : ""}.
                </Sub>
              ) : null}
              {problem ? <StatusLine tone="bad">{problem}</StatusLine> : null}
              <div className="row end" style={{ gap: 8 }}>
                <Btn variant="pri" onClick={submit} disabled={accept.isPending}>{accept.isPending ? "Saving…" : "I have read them — continue"}</Btn>
              </div>
              <Sub>
                This records an acknowledgment — the time, your IP address, your browser and the document versions. It is not an electronic signature and no certificate is issued.
              </Sub>
            </div>
          </Panel>
        ) : null}
      </div>
    </div>
  );
}
