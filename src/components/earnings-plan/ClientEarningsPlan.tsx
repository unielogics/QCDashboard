"use client";

import { useMemo } from "react";
import { clientPlanTransport, type PlanError } from "@/lib/earningsPlan/api";
import { EarningsPlanWorkspace } from "./EarningsPlanWorkspace";
import styles from "./EarningsPlan.module.css";

/** A link that cannot open its plan ends on a plain page that says why. Other failures keep the workspace's own retry. */
function ended(error: PlanError, retry: () => void) {
  if (error.code === "operating_goal_required") {
    return (
      <section className="fp-card fp-terminal">
        <h1>Your team is setting the annual NOI goal</h1>
        <p>The goal needs to be saved before your plan can be opened. Your team will confirm it with you.</p>
        <button type="button" className={styles.btn} onClick={retry}>Check again</button>
      </section>
    );
  }
  if (error.status === 404 || error.status === 410) {
    return (
      <div className="fp-card fp-terminal">
        <span className="fp-terminal-glyph" aria-hidden="true">⧗</span>
        <h1>This link is no longer available</h1>
        <p>It may have expired or been replaced. Ask your contact at Qualified Commercial to send you a new one.</p>
      </div>
    );
  }
  return null;
}

/**
 * The Earnings Plan as the business opens it from its own link: no sign-in,
 * the same four steps as staff, without staff review and without editing the
 * goal. It stands on the link pages' own ground and header, like the other
 * forms a business is sent.
 */
export function ClientEarningsPlan({ token }: { token: string }) {
  const transport = useMemo(() => clientPlanTransport(token), [token]);
  return (
    <div className="fp">
      <header className="fp-header" style={{ padding: "14px 24px" }}>
        <div className="fp-header-inner" style={{ maxWidth: 1480 }}><span className="fp-mark">Qualified Commercial</span></div>
      </header>
      <main className={styles.clientMain}>
        <EarningsPlanWorkspace transport={transport} renderError={(error, retry) => { const page = ended(error, retry); return page ? <div className={styles.clientEnd}>{page}</div> : null; }} />
      </main>
    </div>
  );
}
