"use client";

import type { SheetKind } from "@/components/sheet/types";
import type { WorksheetSheet } from "@/lib/worksheetApi";
import type { PublicFinancialVersion } from "@/lib/publicFinancialForms";
import { PublicFormVersionNotice } from "./PublicFormVersionNotice";
import styles from "./PublicWorksheetVersionControls.module.css";

export function PublicWorksheetVersionControls({ sheets, canEdit, busy = false, onPublish, onOpenPdf, activeKind }: {
  sheets: WorksheetSheet[];
  canEdit: boolean;
  busy?: boolean;
  activeKind?: SheetKind;
  onPublish: (kind: SheetKind) => Promise<unknown>;
  onOpenPdf?: (kind: SheetKind, version: PublicFinancialVersion) => void;
}) {
  return <section className={styles.controls} aria-label="Save financial form versions">
    {sheets.filter((sheet) => sheet.workspace && (!activeKind || sheet.kind === activeKind)).map((sheet) => <div className={styles.form} key={sheet.kind}>
      <div className={styles.heading}><strong>{sheet.title}</strong>{canEdit ? <button type="button" disabled={busy} onClick={() => void onPublish(sheet.kind)}>Save version</button> : null}</div>
      <PublicFormVersionNotice workspace={sheet.workspace} canEdit={canEdit} busy={busy} onOpenPdf={onOpenPdf ? (version) => onOpenPdf(sheet.kind, version) : undefined} />
    </div>)}
  </section>;
}
