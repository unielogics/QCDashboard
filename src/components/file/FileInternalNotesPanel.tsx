"use client";

import { useEffect, useState } from "react";
import { UnifiedThreadConversation } from "@/components/communications/UnifiedThreadConversation";
import { useCurrentUser } from "@/hooks/useApi";
import styles from "./FileInternalNotesPanel.module.css";

export type FileInternalNotesPanelProps = {
  intakeId: string;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
};

/** Keep a file's note composer mounted while its side panel is collapsed. */
export function FileInternalNotesPanel({ intakeId, open, onOpenChange, className }: FileInternalNotesPanelProps) {
  const user = useCurrentUser();
  const authScope = user.authReady === false ? null : user.authScope ?? user.data?.id ?? null;
  const scope = authScope ? `${authScope}:${intakeId}` : null;
  const [mountedScope, setMountedScope] = useState<string | null>(open ? scope : null);
  useEffect(() => { if (open && scope) setMountedScope(scope); }, [scope, open]);
  return <section className={[styles.panel, className].filter(Boolean).join(" ")} hidden={!open} aria-label="Internal file notes">
    <header className={styles.header}>
      <h3>Internal notes</h3>
      {onOpenChange ? <button type="button" onClick={() => onOpenChange(false)} aria-label="Collapse internal notes">Collapse</button> : null}
    </header>
    <p className={styles.description}>Selected notes can inform future staff AI replies.</p>
    <div className={styles.body}>
      {scope && mountedScope === scope ? <UnifiedThreadConversation key={scope} threadId={`intake:${intakeId}:internal`} compact active={open} emptyLabel="No internal notes yet." /> : null}
    </div>
  </section>;
}
