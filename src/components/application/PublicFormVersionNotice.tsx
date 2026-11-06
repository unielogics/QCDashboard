"use client";

import { publicFinancialPdfUrl, type PublicFinancialWorkspace, type PublicFinancialVersion } from "@/lib/publicFinancialForms";

function localDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function PublicFormVersionNotice({ workspace, savedVersion, canEdit = true, onOpenPdf, busy = false }: {
  workspace?: PublicFinancialWorkspace | null;
  savedVersion?: PublicFinancialVersion | null;
  canEdit?: boolean;
  onOpenPdf?: (version: PublicFinancialVersion) => void;
  busy?: boolean;
}) {
  if (!workspace) return null;
  const latest = workspace.current_version ?? savedVersion;
  const pdf = publicFinancialPdfUrl(latest?.pdf_url);
  return <section className="fp-note fp-version-note" aria-label="Saved form versions">
    <div>
      <p role="status">{latest ? <>Saved version <strong>v{latest.version_number}</strong> · {localDate(latest.created_at)}{onOpenPdf ? <> · <button type="button" className="linky" disabled={busy} onClick={() => onOpenPdf(latest)}>Open PDF</button></> : pdf ? <> · <a href={pdf} target="_blank" rel="noreferrer">Open PDF</a></> : null}</> : "No completed version has been saved yet."}</p>
      {savedVersion && latest && savedVersion.id !== latest.id ? <p>Your submitted v{savedVersion.version_number} is kept in history. The latest saved version is shown above.</p> : null}
      {canEdit ? <p>{workspace.dirty ? "Your working changes are separate from the saved PDF. " : ""}Save a version to generate a dated PDF and send your updated answers. Earlier versions and original documents are kept.</p> : <p>This link allows viewing only.</p>}
      {workspace.versions.length > 1 ? <details><summary>Earlier versions ({workspace.versions.length - 1})</summary><ul>{workspace.versions.filter((version) => version.id !== latest?.id).map((version) => {
        const url = publicFinancialPdfUrl(version.pdf_url);
        return <li key={version.id}>v{version.version_number} · {localDate(version.created_at)}{onOpenPdf ? <> · <button type="button" className="linky" disabled={busy} onClick={() => onOpenPdf(version)}>Open PDF</button></> : url ? <> · <a href={url} target="_blank" rel="noreferrer">Open PDF</a></> : null}</li>;
      })}</ul></details> : null}
    </div>
  </section>;
}
