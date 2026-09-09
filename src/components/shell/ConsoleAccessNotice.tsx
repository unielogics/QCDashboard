"use client";

// A team login whose console list does not include Funding, opening the
// Funding app. Today that is only a field rep without the Funding chip. The
// server's list is advisory for operator roles (it says which sign-ins to
// offer); this is the UX half — the dealer-OS guards and the external product
// boundary remain the enforced ones.
import { Btn, PageHeader, Panel, Sub } from "@/components/ds";
import type { ConsoleLink } from "@/lib/types";

export function ConsoleAccessNotice({ consoles }: { consoles: ConsoleLink[] }) {
  return (
    <div className="bareshell" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 20px" }}>
      <div className="grid" style={{ width: "min(560px, 100%)" }}>
        <div>
          <PageHeader title="This login doesn't open the Funding console" />
          <Sub>Your sign-in is set up for{consoles.length ? ":" : " no console yet."}</Sub>
        </div>
        {consoles.length ? (
          <Panel>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {consoles.map((c) => <Btn key={c.key} variant="pri" onClick={() => window.location.assign(c.url)}>Open {c.label} →</Btn>)}
            </div>
          </Panel>
        ) : null}
        <Sub>Ask a super admin to add Funding under Settings → Team if you need it here.</Sub>
      </div>
    </div>
  );
}
