"use client";

// A personal financial statement for each owner: who owes one, where each one
// stands, a private link per owner, and every saved version under the owner it
// belongs to. One checklist row used to cover the whole file, so the first
// statement in closed it and nobody could see whose was missing. Only on a file
// that asks for personal statements; on any other the block is not drawn.

import dynamic from "next/dynamic";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, IconBtn, Select, Sub, Textarea, cx } from "@/components/ds";
import { useAuthedApi, useCurrentUser, useDevUser } from "@/hooks/useApi";
import { apiBase } from "@/lib/api";
import { useConsoleAuth } from "@/lib/consoleAuth";
import { financialVersionPdfPath } from "@/lib/financialWorkspaceApi";
import {
  askedByWords,
  assignStatementFile,
  assignStatementOwners,
  canDecideOwnerStatements,
  emailMissingOwnerStatements,
  emailOwnerStatementLink,
  historyOf,
  linkWords,
  matchWords,
  mintOwnerStatementLink,
  missingOwners,
  moneyWords,
  openOwnerStatement,
  ownerStatementsKey,
  readOwnerStatements,
  requirementWords,
  sendWords,
  setOwnerStatementRequirement,
  shortDay,
  statementStatusWords,
  statementWords,
  summaryWords,
  versionWords,
  type OwnerStatement,
  type OwnerStatementRow,
  type OwnerStatementsRead,
} from "@/lib/ownerStatements";
import styles from "./OwnerStatementsPanel.module.css";

const FinancialWorkspace = dynamic(() => import("@/components/application/FinancialWorkspace").then((module) => module.FinancialWorkspace), { ssr: false });

function message(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message ? reason.message : fallback;
}

export function OwnerStatementsPanel({ profileId, variant = "section", onChanged, onPreviewFile }: {
  profileId: string;
  /** "section" is the Ownership step's own block; "inline" sits inside the checklist row. */
  variant?: "section" | "inline";
  /** The checklist reads the same statements, so it reloads when one changes. */
  onChanged?: () => Promise<unknown> | void;
  /** Opens an uploaded file where the host screen previews documents, so the desk can see whose it is. */
  onPreviewFile?: (fileId: string) => void;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const currentUser = useCurrentUser();
  const { getToken, isSignedIn } = useConsoleAuth();
  const devUser = useDevUser();
  const canDecide = canDecideOwnerStatements(currentUser.data?.role);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [workspaceFamily, setWorkspaceFamily] = useState<string | null>(null);

  const statements = useQuery({
    queryKey: ownerStatementsKey(profileId),
    queryFn: () => readOwnerStatements(api, profileId),
    enabled: Boolean(profileId),
  });

  async function reload(next?: OwnerStatementsRead) {
    if (next) queryClient.setQueryData(ownerStatementsKey(profileId), next);
    await Promise.all([
      next ? Promise.resolve() : queryClient.invalidateQueries({ queryKey: ownerStatementsKey(profileId) }),
      queryClient.invalidateQueries({ queryKey: ["application-evidence-workspace", profileId] }),
      queryClient.invalidateQueries({ queryKey: ["application-profile-verification", profileId] }),
    ]);
    await onChanged?.();
  }

  async function run(key: string, work: () => Promise<void>) {
    setBusy(key);
    setError("");
    try {
      await work();
    } catch (problem) {
      setNotice("");
      setError(message(problem, "That could not be done. Try again."));
    } finally {
      setBusy("");
    }
  }

  const sendLink = (row: OwnerStatementRow) => run(`email:${row.owner_id}`, async () => {
    const result = await emailOwnerStatementLink(api, profileId, row.owner_id);
    if (!result.sent) throw new Error(`${row.full_name}: ${result.detail || "the email could not be sent"}`);
    setNotice(`Emailed ${row.full_name} the link to their own statement.`);
    await reload();
  });

  const sendMissing = () => run("email:missing", async () => {
    const result = await emailMissingOwnerStatements(api, profileId);
    setNotice(sendWords(result.items));
    await reload();
  });

  const copyLink = (row: OwnerStatementRow) => run(`copy:${row.owner_id}`, async () => {
    const result = await mintOwnerStatementLink(api, profileId, row.owner_id);
    const until = shortDay(result.expires_at);
    try {
      await navigator.clipboard.writeText(result.url);
      setNotice(`Copied ${row.full_name}'s private link. It opens only their statement${until ? ` and works until ${until}` : ""}.`);
    } catch {
      setNotice(`Clipboard access was blocked. ${row.full_name}'s private link is ${result.url}`);
    }
    await reload();
  });

  const openStatement = (row: OwnerStatementRow) => run(`open:${row.owner_id}`, async () => {
    const result = await openOwnerStatement(api, profileId, row.owner_id);
    setWorkspaceFamily(result.family_id);
  });

  const openPdf = (versionId: string) => run(`pdf:${versionId}`, async () => {
    let token: string | null = null;
    if (isSignedIn) {
      try { token = await getToken(); } catch { token = null; }
    }
    const response = await fetch(`${apiBase}/api/v1${financialVersionPdfPath(profileId, versionId)}`, {
      cache: "no-store",
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(devUser ? { "X-Dev-User": devUser } : {}) },
    });
    if (!response.ok) throw new Error("This version's PDF could not be opened. Try again.");
    const url = URL.createObjectURL(await response.blob());
    window.open(url, "_blank", "noopener");
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  });

  const decide = (row: OwnerStatementRow, required: boolean, why?: string) => run(`decide:${row.owner_id}`, async () => {
    const next = await setOwnerStatementRequirement(api, profileId, row.owner_id, required, why);
    setReasonFor(null);
    setReason("");
    setNotice(required ? `${row.full_name} is asked for a statement again.` : `No statement is needed from ${row.full_name}.`);
    await reload(next);
  });

  const assignStatement = (statement: OwnerStatement, ownerIds: string[], name: string, setAside = false) => run(`assign:${statement.family_id}`, async () => {
    const next = await assignStatementOwners(api, profileId, statement.family_id, ownerIds, setAside);
    setNotice(ownerIds.length
      ? `That statement is now in ${name}'s history.`
      : setAside
        ? "That statement is set aside as no owner's on this file."
        : `That statement is off ${name}'s row. Say whose it is, or set it aside.`);
    await reload(next);
  });

  const assignFile = (fileId: string, ownerId: string, name: string) => run(`assign:${fileId}`, async () => {
    const next = await assignStatementFile(api, profileId, fileId, ownerId);
    setNotice(`That upload is now in ${name}'s history.`);
    await reload(next);
  });

  const data = statements.data;
  const waiting = data ? missingOwners(data) : { reachable: [], noEmail: [] };
  const loose = data ? data.unassigned.length + data.loose_files.length : 0;

  // A file that asks for no personal statements shows no block at all. It
  // appears once a program or lender lists them as required or recommended,
  // or the desk asks (owner_statements.need on the server).
  if (!statements.isError && !data?.needed) return null;

  const header = (
    <header className={variant === "section" ? "verification-section-head" : styles.inlineHead}>
      <div>
        <h3>Owner financial statements</h3>
        <Sub>
          {data
            ? `${askedByWords(data)} Every owner at ${data.threshold_pct.toFixed(2)}% or more gives their own, from a private link. Each saved version stays under that owner.`.trim()
            : "Each owner gives their own personal financial statement, from a private link."}
        </Sub>
      </div>
      {data ? <CellChip tone={!data.required_count ? "mut" : data.complete ? "ok" : "warn"}>{summaryWords(data)}</CellChip> : null}
      {canDecide ? (
        <Btn
          variant="pri"
          disabled={!data || Boolean(busy) || !waiting.reachable.length}
          title={waiting.reachable.length ? "Emails each owner whose statement is missing the link to their own" : "Nobody with an email on file is waiting on a link"}
          onClick={() => void sendMissing()}
        >
          <Icon name="send" size={14} />{busy === "email:missing" ? "Sending..." : "Send missing links"}
        </Btn>
      ) : null}
    </header>
  );

  return (
    <section className={cx(variant === "section" ? "verification-section" : styles.inline, styles.panel)} aria-label="Owner financial statements">
      {header}
      {statements.isLoading ? <div className="empty"><span className="spinner solo" />Loading owner statements...</div> : null}
      {statements.isError ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{message(statements.error, "Owner statements could not be loaded.")}</Callout> : null}
      {data && !data.on_checklist && data.required_count ? (
        <p className={styles.lead}>The personal financial statement is not on this file&apos;s checklist yet. Sending an owner their link adds it.</p>
      ) : null}
      {data && waiting.noEmail.length ? (
        <p className={styles.lead}>
          {waiting.noEmail.map((row) => row.full_name).join(", ")} {waiting.noEmail.length === 1 ? "has" : "have"} no personal email on file. Add it in the ownership table to send their link.
        </p>
      ) : null}

      {data && loose ? (
        <div className={styles.unassigned} role="group" aria-label="Statements not tied to an owner">
          <strong><Icon name="alert" size={14} />{loose} {loose === 1 ? "statement is" : "statements are"} not tied to an owner</strong>
          <span>It counts for nobody until you say whose it is. It then joins that owner&apos;s history.</span>
          {data.unassigned.map((statement) => {
            const chosen = assignTo[statement.family_id] ?? "";
            const owner = data.owners.find((row) => row.owner_id === chosen);
            return (
              <div className={styles.unassignedRow} key={statement.family_id}>
                <div>
                  <b>{statement.applicant_name || "No name on the statement"}</b>
                  <small>
                    {statement.received_version ? `${versionWords(statement.received_version)} · ${shortDay(statement.received_version.created_at)}` : "Started, not filed"}
                    {statement.figures?.net_worth != null ? ` · net worth ${moneyWords(statement.figures.net_worth)}` : ""}
                  </small>
                </div>
                {statement.received_version?.has_pdf ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => void openPdf(statement.received_version!.id)}><Icon name="doc" size={13} />View</Btn> : null}
                {canDecide ? (
                  <>
                    <Select aria-label={`Owner for ${statement.applicant_name || "this statement"}`} value={chosen} disabled={Boolean(busy)} onChange={(event) => setAssignTo((current) => ({ ...current, [statement.family_id]: event.target.value }))}>
                      <option value="">Whose is it?</option>
                      {data.owners.map((row) => <option key={row.owner_id} value={row.owner_id}>{row.full_name}</option>)}
                    </Select>
                    <Btn size="sm" variant="pri" disabled={Boolean(busy) || !owner} onClick={() => owner && void assignStatement(statement, [owner.owner_id], owner.full_name)}>Assign</Btn>
                    <Btn size="sm" disabled={Boolean(busy)} title="A spouse's or another person's statement that belongs to no owner on this file" onClick={() => void assignStatement(statement, [], "", true)}>Not an owner&apos;s</Btn>
                  </>
                ) : null}
              </div>
            );
          })}
          {data.loose_files.map((file) => {
            const chosen = assignTo[file.file_id] ?? "";
            const owner = data.owners.find((row) => row.owner_id === chosen);
            return (
              <div className={styles.unassignedRow} key={file.file_id}>
                <div>
                  <b>{file.applicant_name || file.file_name}</b>
                  <small>
                    Uploaded{shortDay(file.uploaded_at) ? ` ${shortDay(file.uploaded_at)}` : ""}{file.applicant_name ? ` · ${file.file_name}` : ""}
                    {file.figures?.net_worth != null ? ` · net worth ${moneyWords(file.figures.net_worth)}` : ""}
                  </small>
                </div>
                {onPreviewFile ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => onPreviewFile(file.file_id)}><Icon name="doc" size={13} />View</Btn> : null}
                {canDecide ? (
                  <>
                    <Select aria-label={`Owner for ${file.file_name}`} value={chosen} disabled={Boolean(busy)} onChange={(event) => setAssignTo((current) => ({ ...current, [file.file_id]: event.target.value }))}>
                      <option value="">Whose is it?</option>
                      {data.owners.map((row) => <option key={row.owner_id} value={row.owner_id}>{row.full_name}</option>)}
                    </Select>
                    <Btn size="sm" variant="pri" disabled={Boolean(busy) || !owner} onClick={() => owner && void assignFile(file.file_id, owner.owner_id, owner.full_name)}>Assign</Btn>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {data ? (
        <div className="credit-owner-grid">
          {data.owners.map((row) => {
            const status = statementStatusWords(row);
            const statement = row.statement;
            const received = statement?.received_version ?? null;
            const figures = statement?.figures ?? null;
            const history = historyOf(row);
            const match = matchWords(row);
            const asking = row.required || row.status !== "not_required";
            return (
              <article key={row.owner_id} className={cx("credit-owner-box", row.status === "received" && row.required && "complete")} aria-label={`${row.full_name} financial statement`}>
                <header>
                  <span className="credit-owner-avatar" aria-hidden="true">{row.first_name.slice(0, 1)}{row.last_name.slice(0, 1)}</span>
                  <div className="grow">
                    <b>{row.full_name}</b>
                    <Sub>{row.ownership_pct != null ? `${row.ownership_pct.toFixed(2)}% ownership` : "Ownership not entered"}{row.is_primary ? " · primary" : ""}</Sub>
                  </div>
                  <CellChip tone={status.tone}>{status.label}</CellChip>
                </header>
                <dl>
                  <div><dt>Statement</dt><dd title={statementWords(row)}>{statementWords(row)}</dd></div>
                  <div><dt>Private link</dt><dd title={statement?.link?.sent_to ? `Sent to ${statement.link.sent_to}` : undefined}>{linkWords(row)}</dd></div>
                  {figures ? (
                    <>
                      <div><dt>Net worth</dt><dd className="num">{moneyWords(figures.net_worth)}</dd></div>
                      <div><dt>Liquid assets</dt><dd className="num">{moneyWords(figures.liquid_assets)}</dd></div>
                    </>
                  ) : null}
                </dl>
                <ul className={styles.notes}>
                  {row.reason !== "ownership" ? <li>{requirementWords(row, data.threshold_pct)}</li> : null}
                  {row.joint_with.length ? <li>Joint statement with {row.joint_with.join(" and ")}</li> : null}
                  {figures?.statement_date ? <li>As of {shortDay(figures.statement_date) || figures.statement_date}</li> : null}
                  {match ? (
                    <li>
                      {match}
                      {canDecide && statement ? <button type="button" className="linky" disabled={Boolean(busy)} onClick={() => void assignStatement(statement, [], row.full_name)}>Not theirs</button> : null}
                    </li>
                  ) : null}
                  {asking && row.status !== "received" && !row.email ? <li className={styles.warn}>No personal email on file</li> : null}
                </ul>
                {history.length ? (
                  <details className={styles.history}>
                    <summary>History · {history.length} {history.length === 1 ? "version" : "versions"}</summary>
                    <ol>
                      {history.map((version) => (
                        <li key={version.id}>
                          <span>
                            <span><b>v{version.version_number}</b> · {versionWords(version)}</span>
                            <small>{shortDay(version.created_at)}{version.actor_name ? ` · ${version.actor_name}` : ""}{version.figures?.net_worth != null ? ` · net worth ${moneyWords(version.figures.net_worth)}` : ""}</small>
                          </span>
                          {version.is_current ? <CellChip tone="ok">Current</CellChip> : null}
                          {version.has_pdf ? <IconBtn aria-label={`Open version ${version.version_number} of ${row.full_name}'s statement`} title="Open this version" disabled={Boolean(busy)} onClick={() => void openPdf(version.id)}><Icon name="doc" size={13} /></IconBtn> : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
                {reasonFor === row.owner_id ? (
                  <div className={styles.reason}>
                    <label htmlFor={`not-needed-${row.owner_id}`}>Why is no statement needed from {row.full_name}?</label>
                    <Textarea id={`not-needed-${row.owner_id}`} rows={2} autoFocus value={reason} onChange={(event) => setReason(event.target.value)} placeholder="For example: the lender does not require one from a silent partner" />
                    <div className={styles.reasonActions}>
                      <Btn size="sm" disabled={Boolean(busy)} onClick={() => { setReasonFor(null); setReason(""); }}>Cancel</Btn>
                      <Btn size="sm" variant="pri" disabled={Boolean(busy) || reason.trim().length < 8} onClick={() => void decide(row, false, reason.trim())}>Mark not needed</Btn>
                    </div>
                  </div>
                ) : null}
                <footer>
                  {received?.has_pdf ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => void openPdf(received.id)}><Icon name="doc" size={13} />View statement</Btn> : null}
                  {canDecide && row.status !== "not_needed" ? (
                    <Btn size="sm" variant={row.required && row.status !== "received" ? "pri" : "default"} disabled={Boolean(busy) || !row.email} title={row.email ? `Emails ${row.email} the link to their own statement` : "Add a personal email for this owner first"} onClick={() => void sendLink(row)}>
                      <Icon name="mail" size={13} />{busy === `email:${row.owner_id}` ? "Sending..." : statement?.link ? "Resend link" : row.status === "received" ? "Ask for an update" : "Email link"}
                    </Btn>
                  ) : null}
                  {row.status !== "not_needed" ? <IconBtn aria-label={`Copy ${row.full_name}'s private link`} title="Copy their private link" disabled={Boolean(busy)} onClick={() => void copyLink(row)}><Icon name="copy" size={14} /></IconBtn> : null}
                  <Btn size="sm" disabled={Boolean(busy)} title="Fill it in for them, review an upload or see every version" onClick={() => void openStatement(row)}><Icon name="pencil" size={13} />Open statement</Btn>
                  {canDecide && row.status === "not_needed" ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => void decide(row, true)}>Needed after all</Btn> : null}
                  {canDecide && row.required && row.status !== "received" && reasonFor !== row.owner_id ? <Btn size="sm" disabled={Boolean(busy)} onClick={() => { setReasonFor(row.owner_id); setReason(""); }}>Not needed</Btn> : null}
                </footer>
              </article>
            );
          })}
          {!data.owners.length ? <div className="empty">Add the business owners above to track a statement for each.</div> : null}
        </div>
      ) : null}

      {notice ? <Callout tone="acc" icon={<Icon name="check" size={16} />}>{notice}</Callout> : null}
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      {workspaceFamily ? (
        <FinancialWorkspace
          open
          profileId={profileId}
          initialKind="pfs"
          initialFamilyId={workspaceFamily}
          onClose={() => { setWorkspaceFamily(null); void reload(); }}
          onPublished={() => void reload()}
        />
      ) : null}
    </section>
  );
}
