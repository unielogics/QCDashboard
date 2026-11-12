"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, Panel, Select, Sub, Textarea } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser } from "@/hooks/useApi";
import { useChatgptProductFeed } from "@/hooks/useChatgptProductFeed";
import {
  canManageChatgptFeed, feedDraftKey, feedRunLabel, feedSourceApproved, feedSyncProblem, mergeFeedServerState, patchFeedOffer, publicFeedUrl,
  type ChatgptFeedPreview, type ChatgptFeedRun, type ChatgptFeedSettings, type FeedCatalogItem, type FeedCatalogOverride,
} from "@/lib/chatgptProductFeed";
import styles from "./ChatgptProductFeedSection.module.css";

function when(value?: string | null): string {
  if (!value) return "Not yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}
function errorWords(value: unknown): string { return value instanceof Error ? value.message : "This action could not be completed. Your edits are still here."; }

export function FeedDeliveryControls({ problem, busy, dirty, hasEligible, onPreview, onDownload, onSync }: {
  problem: string | null; busy: boolean; dirty: boolean; hasEligible: boolean;
  onPreview: () => void; onDownload: () => void; onSync: () => void;
}) {
  return <div className={styles.actions}>
    <Btn disabled={busy} onClick={onPreview}><Icon name="eye" size={14} />Preview catalog</Btn>
    <Btn disabled={busy || dirty || !hasEligible} onClick={onDownload} title={dirty ? "Save and preview the catalog before downloading." : "Download the validated saved snapshot."}><Icon name="download" size={14} />Download feed</Btn>
    <Btn variant="pri" disabled={busy || Boolean(problem)} onClick={onSync} title={problem || "Upload the saved, validated catalog to OpenAI."}><Icon name="arrowR" size={14} />Sync now</Btn>
    {problem ? <Sub>{problem}</Sub> : null}
  </div>;
}

export function FeedUploadHistory({ runs }: { runs: ChatgptFeedRun[] }) {
  return <div className={styles.history}>
    {!runs.length ? <Sub>No uploads yet. Connection testing does not publish your catalog.</Sub> : runs.map((run) => <div key={run.id} className={styles.historyRow}>
      <div><strong>{feedRunLabel(run)}</strong><Sub>{when(run.completed_at || run.created_at)} · {run.trigger.replaceAll("_", " ")} · attempt {run.attempt_count}</Sub></div>
      <div><span>{run.eligible_count} offers · {run.excluded_count} excluded</span>{run.retry_at ? <Sub>Retry: {when(run.retry_at)}</Sub> : null}</div>
      {run.last_error ? <p className={styles.runError}>{run.last_error}</p> : null}
      {run.sha256 ? <code className={styles.hash} title={run.sha256}>Snapshot {run.sha256.slice(0, 16)}</code> : null}
    </div>)}
  </div>;
}

export function ChatgptProductFeedSection() {
  const user = useCurrentUser();
  if (user.isLoading || !user.authReady) return <Sub>Checking super-admin access…</Sub>;
  if (!canManageChatgptFeed(user.data)) return <Callout tone="warn">Super-admin access is required to manage the ChatGPT catalog connection.</Callout>;
  return <ChatgptProductFeedEditor key={user.data!.id} userId={user.data!.id} />;
}

function ChatgptProductFeedEditor({ userId }: { userId: string }) {
  const service = useChatgptProductFeed(userId);
  const [draft, setDraft] = useState<ChatgptFeedSettings | null>(null);
  const [review, setReview] = useState<{ value: ChatgptFeedPreview; key: string } | null>(null);
  const [selected, setSelected] = useState("");
  const [query, setQuery] = useState("");
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const firstPreview = useRef(false);
  const latestDraft = useRef(draft); latestDraft.current = draft;
  const syncIntent = useRef<{ key: string; draftKey: string } | null>(null);

  useEffect(() => {
    if (!service.settings.data) return;
    setDraft((current) => current ? mergeFeedServerState(current, service.settings.data!) : structuredClone(service.settings.data!));
  }, [service.settings.data]);

  async function preview(value: ChatgptFeedSettings) {
    const key = feedDraftKey(value);
    try {
      const result = await service.preview.mutateAsync(value);
      setReview({ value: result, key });
      setSelected((current) => result.items.some((item) => item.item_id === current) ? current : result.items[0]?.item_id || "");
      setFeedback(null);
    } catch (cause) { setFeedback({ error: true, text: errorWords(cause) }); }
  }
  useEffect(() => {
    if (draft && !firstPreview.current) { firstPreview.current = true; void preview(draft); }
    // Initial preview only. Later requests are explicit and never replace an editor draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  if (service.settings.isError && !draft) return <Callout tone="bad"><div>{errorWords(service.settings.error)}</div><Btn onClick={() => { void service.settings.refetch(); }}>Retry loading settings</Btn></Callout>;
  if (!draft) return <div className="empty"><span className="spinner solo" />Loading catalog connection…</div>;

  const saved = service.settings.data;
  const dirty = !saved || feedDraftKey(draft) !== feedDraftKey(saved);
  const previewCurrent = Boolean(review && review.key === feedDraftKey(draft));
  const busy = service.save.isPending || service.generateKey.isPending || service.test.isPending || service.sync.isPending || service.download.isPending;
  const previewValue = review?.value || null;
  const deliveryNeedsReview = draft.enabled && previewCurrent && previewValue && !previewValue.ready_for_upload;
  const syncProblem = feedSyncProblem(draft, previewValue, dirty, previewCurrent);
  const items = (previewValue?.items || []).slice().sort((a, b) => a.priority - b.priority || a.title.localeCompare(b.title));
  const filtered = items.filter((item) => `${item.title} ${item.item_id}`.toLowerCase().includes(query.toLowerCase()));
  const item = items.find((candidate) => candidate.item_id === selected);
  const patch = <K extends keyof ChatgptFeedSettings>(key: K, value: ChatgptFeedSettings[K]) => setDraft((current) => current ? {
    ...current, [key]: value,
    ...(["sftp_host", "sftp_port", "sftp_username", "server_fingerprint", "remote_directory", "staging_directory", "staging_isolation_confirmed", "filename"].includes(key) ? { delivery_verified_at: null, connection_verified: false } : {}),
  } : current);
  const patchOffer = (key: string, changes: FeedCatalogOverride) => setDraft((current) => current ? { ...current, catalog_overrides: { ...current.catalog_overrides, [key]: patchFeedOffer(current.catalog_overrides[key] || {}, changes) } } : current);

  async function save() {
    if (!latestDraft.current) return;
    try {
      const next = await service.save.mutateAsync(latestDraft.current);
      setDraft(next);
      setFeedback({ error: false, text: "Catalog settings saved. No products were uploaded." });
      await preview(next);
    } catch (cause) { setFeedback({ error: true, text: errorWords(cause) }); }
  }
  async function createKey() {
    try {
      const next = await service.generateKey.mutateAsync();
      setDraft((current) => current ? mergeFeedServerState(current, next, true) : next);
      setFeedback({ error: false, text: "The dedicated key is ready. Copy only its public key into OpenAI’s SFTP setup." });
    } catch (cause) { setFeedback({ error: true, text: errorWords(cause) }); }
  }
  async function test() {
    try {
      const result = await service.test.mutateAsync();
      if (result.settings) setDraft((current) => current ? mergeFeedServerState(current, result.settings!) : result.settings!);
      setFeedback({ error: false, text: result.message || "Connection and completed-file delivery verified. No catalog was uploaded." });
    } catch (cause) { setFeedback({ error: true, text: errorWords(cause) }); }
  }
  async function sync() {
    const draftKey = feedDraftKey(draft!);
    if (syncIntent.current?.draftKey !== draftKey) syncIntent.current = { key: crypto.randomUUID(), draftKey };
    try {
      await service.sync.mutateAsync(syncIntent.current.key);
      syncIntent.current = null;
      setFeedback({ error: false, text: "Upload queued. Check upload history for its result; a completed transfer does not confirm ingestion by OpenAI." });
    } catch (cause) { setFeedback({ error: true, text: errorWords(cause) }); }
  }

  return <div className={styles.root} aria-busy={busy || service.preview.isPending}>
    <div className={styles.header}>
      <div><h3>ChatGPT product feed</h3><Sub>Approved public offers, one maintained catalog. Product discovery · US English · USD · checkout disabled.</Sub></div>
      <div className={styles.actions}><CellChip tone={deliveryNeedsReview ? "warn" : draft.enabled ? "ok" : "mut"}>{deliveryNeedsReview ? "Needs review · delivery blocked" : draft.enabled ? "Daily delivery enabled" : "Delivery paused"}</CellChip>{dirty && saved ? <Btn disabled={busy} onClick={() => { const next = structuredClone(saved); setDraft(next); void preview(next); }}>Discard local changes</Btn> : null}<Btn variant="pri" disabled={!dirty || busy} onClick={() => { void save(); }}>{service.save.isPending ? "Saving…" : "Save settings"}</Btn></div>
    </div>
    {feedback ? <div role={feedback.error ? "alert" : "status"}><Callout tone={feedback.error ? "bad" : "ok"}>{feedback.text}</Callout></div> : null}
    {service.settings.isError && draft ? <Callout tone="warn">Settings could not refresh. Your unsaved edits are preserved. {errorWords(service.settings.error)}</Callout> : null}

    <div className={styles.stats}>
      <div><span>Ready offers</span><strong>{previewValue?.eligible_count ?? "—"}</strong></div>
      <div><span>Excluded / needs attention</span><strong>{previewValue?.excluded_count ?? "—"}</strong></div>
      <div><span>Last successful upload</span><strong className={styles.statDate}>{when(draft.last_success_at)}</strong></div>
      <div><span>Next scheduled delivery</span><strong className={styles.statDate}>{when(draft.next_run_at)}</strong></div>
    </div>

    <Panel title="1. Register the dedicated public key" sub="The private key stays encrypted on the server.">
      <div className={styles.keyRow}>
        <Textarea aria-label="SSH public key" readOnly value={draft.public_key || "Create a key, then paste the public key shown here into OpenAI’s Configure SFTP screen."} rows={3} className={styles.publicKey} />
        {draft.public_key ? <Btn disabled={busy} onClick={() => { void navigator.clipboard.writeText(draft.public_key!).then(() => setFeedback({ error: false, text: "Public key copied." })).catch(() => setFeedback({ error: true, text: "Copy was unavailable. Select and copy the public key above." })); }}><Icon name="copy" size={14} />Copy public key</Btn> : <Btn disabled={busy} onClick={() => { void createKey(); }}>{service.generateKey.isPending ? "Creating…" : "Create dedicated key"}</Btn>}
      </div>
      <Sub>After you register this public key with OpenAI, enter the connection details they provide below.</Sub>
    </Panel>

    <Panel title="2. Connect SFTP" actions={<Btn disabled={busy || dirty || !draft.private_key_configured || !draft.sftp_host || !draft.server_fingerprint} onClick={() => { void test(); }} title={dirty ? "Save connection settings before testing." : undefined}>{service.test.isPending ? "Testing…" : "Test connection"}</Btn>}>
      <fieldset disabled={busy} className={styles.fields}>
        <Field label="Host"><Input aria-label="SFTP host" readOnly={Boolean(draft.last_success_at)} value={draft.sftp_host} onChange={(event) => patch("sftp_host", event.target.value)} autoComplete="off" placeholder="From OpenAI connection info" /></Field>
        <Field label="Port"><Input aria-label="SFTP port" readOnly={Boolean(draft.last_success_at)} type="number" min={1} max={65535} value={draft.sftp_port} onChange={(event) => patch("sftp_port", Number(event.target.value))} /></Field>
        <Field label="Username"><Input aria-label="SFTP username" readOnly={Boolean(draft.last_success_at)} value={draft.sftp_username} onChange={(event) => patch("sftp_username", event.target.value)} autoComplete="off" /></Field>
        <Field label="Server key fingerprint" hint="Verify the SHA256 fingerprint through OpenAI’s connection instructions."><Input aria-label="Server key fingerprint" value={draft.server_fingerprint} onChange={(event) => patch("server_fingerprint", event.target.value)} placeholder="SHA256:…" autoComplete="off" /></Field>
        <Field label="Import directory"><Input aria-label="Import directory" readOnly={Boolean(draft.last_success_at)} value={draft.remote_directory} onChange={(event) => patch("remote_directory", event.target.value)} /></Field>
        <Field label="Staging directory" hint="Use a separate path outside imports, or a folder OpenAI explicitly excludes from ingestion."><Input aria-label="Staging directory" value={draft.staging_directory || ""} onChange={(event) => patch("staging_directory", event.target.value || null)} placeholder="Separate path supplied for staging" /></Field>
        <Field label="Snapshot filename"><Input aria-label="Snapshot filename" readOnly={Boolean(draft.last_success_at)} value={draft.filename} onChange={(event) => patch("filename", event.target.value)} /></Field>
        <Field label="Daily delivery time" hint="Shown in UTC; run timestamps use your local time."><Select aria-label="Daily delivery hour UTC" value={draft.schedule_hour_utc} onChange={(event) => patch("schedule_hour_utc", Number(event.target.value))}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, "0")}:00 UTC</option>)}</Select></Field>
        <label className={styles.check}><input type="checkbox" checked={Boolean(draft.staging_isolation_confirmed)} onChange={(event) => patch("staging_isolation_confirmed", event.target.checked)} />OpenAI confirms this staging directory is excluded from catalog imports.</label>
      </fieldset>
      {draft.last_success_at ? <Sub>The upload destination is locked after its first successful delivery to prevent earlier catalog copies from remaining active elsewhere.</Sub> : null}
      <Sub>{draft.delivery_verified_at && draft.connection_verified !== false ? `Completed-file delivery last verified ${when(draft.delivery_verified_at)}.` : "The current connection and completed-file delivery have not been verified."}</Sub>
    </Panel>

    <Panel title="3. Review the catalog" sub="MCA working capital first, then term loans, Capital OS and SBA.">
      <fieldset disabled={busy} className={styles.fields}>
        <Field label="Brand"><Input aria-label="Catalog brand" value={draft.brand} onChange={(event) => patch("brand", event.target.value)} /></Field>
        <Field label="Public seller name"><Input aria-label="Public seller name" value={draft.seller_name} onChange={(event) => patch("seller_name", event.target.value)} /></Field>
      </fieldset>
      <div className={styles.catalog}>
        <div className={styles.catalogList}>
          <Input aria-label="Find an offer" placeholder="Find an offer…" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className={styles.offerList}>{filtered.map((offer) => <button type="button" key={offer.item_id} className={`${styles.offer} ${selected === offer.item_id ? styles.selected : ""}`} onClick={() => setSelected(offer.item_id)} aria-pressed={selected === offer.item_id}>
            <strong>{offer.title}</strong><span>{offer.retired_record ? "Retiring from search" : offer.eligible ? "Ready" : !offer.included ? "Excluded" : `${offer.issues.length} ${offer.issues.length === 1 ? "issue" : "issues"}`}</span>
          </button>)}{!items.length ? <Sub>{service.preview.isPending ? "Preparing catalog…" : "Preview the catalog to load its public offers."}</Sub> : !filtered.length ? <Sub>No matching offers.</Sub> : null}</div>
        </div>
        {item ? <OfferEditor item={item} value={draft.catalog_overrides[item.item_id] || {}} busy={busy} patch={(changes) => patchOffer(item.item_id, changes)} /> : <div className={styles.offerEditor}><Sub>Select an offer to review its title, description, image and actual purchase price.</Sub></div>}
      </div>
      {!previewCurrent && previewValue ? <Sub>Catalog changes await a new preview. The previous validation results are shown for reference.</Sub> : null}
      {previewValue?.blockers.length ? <Callout tone="warn"><strong>Before delivery</strong><ul className={styles.issues}>{previewValue.blockers.map((issue, index) => <li key={index}>{issue}</li>)}</ul></Callout> : null}
    </Panel>

    <Panel title="4. Enable delivery" sub="Save, validate and upload from the same approved catalog.">
      <fieldset disabled={busy} className={styles.fields}>
        <Field label="OpenAI acceptance reference" hint="Record confirmation covering financing/consulting eligibility and how the required purchase price must be represented."><Textarea aria-label="OpenAI acceptance reference" value={draft.acceptance_reference} rows={3} onChange={(event) => patch("acceptance_reference", event.target.value)} /></Field>
        <div className={styles.checks}>
          <label><input type="checkbox" checked={draft.acceptance_confirmed} onChange={(event) => patch("acceptance_confirmed", event.target.checked)} />OpenAI has confirmed acceptance and pricing treatment for these offers.</label>
          <label><input type="checkbox" checked={draft.enabled} disabled={!draft.enabled && Boolean(feedSyncProblem(draft, previewValue, false, previewCurrent))} onChange={(event) => patch("enabled", event.target.checked)} />Enable daily delivery and approved catalog updates.</label>
          <Sub>Pausing delivery keeps the connection and approved catalog. Uploading does not guarantee ChatGPT placement.</Sub>
        </div>
      </fieldset>
      {previewCurrent && Boolean(previewValue?.disabled_count) ? <CellChip tone="warn">Retiring {previewValue!.disabled_count} {previewValue!.disabled_count === 1 ? "offer" : "offers"} from search</CellChip> : null}
      <FeedDeliveryControls problem={syncProblem} busy={busy || service.preview.isPending} dirty={dirty} hasEligible={previewCurrent && Boolean(previewValue?.ready_for_upload && (previewValue.export_count ?? previewValue.eligible_count))} onPreview={() => { void preview(draft); }} onDownload={() => { void service.download.mutateAsync().catch((cause) => setFeedback({ error: true, text: errorWords(cause) })); }} onSync={() => { void sync(); }} />
      <Sub>Loan principal, APR, factor rates and percentage fees are not purchase prices. Incomplete offers remain excluded; a failed export does not clear the last valid catalog.</Sub>
    </Panel>

    <Panel title="Upload history" sub="A successful transfer is recorded separately from OpenAI’s ingestion.">
      {service.runs.isError ? <Callout tone="warn">Upload history could not load. <Btn onClick={() => { void service.runs.refetch(); }}>Retry history</Btn></Callout> : <FeedUploadHistory runs={service.runs.data || []} />}
    </Panel>
    <Sub>Reference: <a href="https://developers.openai.com/commerce/specs/file-upload/products" target="_blank" rel="noreferrer">OpenAI product schema</a> · <a href="https://developers.openai.com/commerce/specs/file-upload/overview" target="_blank" rel="noreferrer">SFTP delivery guide</a></Sub>
  </div>;
}

function OfferEditor({ item, value, busy, patch }: { item: FeedCatalogItem; value: FeedCatalogOverride; busy: boolean; patch: (value: FeedCatalogOverride) => void }) {
  const approved = feedSourceApproved(item, value);
  const productUrl = publicFeedUrl(value.canonical_url ?? item.url);
  const imageUrl = publicFeedUrl(value.image_url ?? item.image_url);
  return <fieldset disabled={busy} className={styles.offerEditor}>
    <div className={styles.actions}><strong>{item.title}</strong><CellChip tone={item.eligible && !item.retired_record ? "ok" : "warn"}>{item.retired_record ? "Retiring from search" : item.eligible ? "Ready" : "Needs attention"}</CellChip><code className={styles.itemId}>{item.item_id}</code></div>
    <div className={styles.imageRow}><OfferImage url={imageUrl} title={value.title || item.title} /><div className={styles.imageLinks}>{productUrl ? <a href={productUrl} target="_blank" rel="noopener noreferrer">Open product page</a> : <Sub>A public HTTPS product page is needed.</Sub>}{imageUrl ? <a href={imageUrl} target="_blank" rel="noopener noreferrer">Open image</a> : <Sub>A public HTTPS image is needed.</Sub>}<Sub>Review the image and linked page before approving this offer.</Sub></div></div>
    <label className={styles.check}><input type="checkbox" checked={value.included ?? item.included} onChange={(event) => patch({ included: event.target.checked })} />Include this offer when valid</label>
    <Field label="Product title"><Input aria-label="Product title" value={value.title ?? item.title} maxLength={150} onChange={(event) => patch({ title: event.target.value })} /></Field>
    <Field label="Public description" hint="Use factual, published pricing and substantiated timing claims. Keep MCA funding and refinance distinct."><Textarea aria-label="Public description" value={value.description ?? item.description} maxLength={5000} rows={5} onChange={(event) => patch({ description: event.target.value })} /></Field>
    <div className={styles.fields}>
      <Field label="Canonical product page"><Input aria-label="Canonical product page" type="url" value={value.canonical_url ?? item.url} onChange={(event) => patch({ canonical_url: event.target.value })} /></Field>
      <Field label="Public product image"><Input aria-label="Public product image" type="url" value={value.image_url ?? item.image_url} onChange={(event) => patch({ image_url: event.target.value })} /></Field>
      <Field label="Actual purchase price · USD" hint="Leave blank for quote-only offers pending OpenAI’s instructions."><Input aria-label="Actual purchase price USD" inputMode="decimal" value={value.actual_price ?? ""} onChange={(event) => patch({ actual_price: event.target.value || null })} placeholder="Not loan amount, APR or factor" /></Field>
      <div className={styles.source}><span className="lbl">Published source</span><Sub>{item.kind === "service" ? "Existing Capital OS service" : `Commercial terms version ${item.commercial_terms_version ?? "not published"}`}</Sub><Sub>Availability: {item.availability.replaceAll("_", " ")}</Sub></div>
    </div>
    <div className={styles.checks}>
      <label><input type="checkbox" checked={approved} onChange={(event) => patch({ content_approved: event.target.checked, approved_source_revision: event.target.checked ? item.source_revision : null })} />I reviewed this copy and its current published source.</label>
      <label><input type="checkbox" checked={Boolean(value.pricing_confirmed)} onChange={(event) => patch({ pricing_confirmed: event.target.checked })} />This price is the actual payable purchase price and matches the public offer.</label>
    </div>
    {item.issues.length ? <ul className={styles.issues}>{item.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul> : null}
  </fieldset>;
}

function OfferImage({ url, title }: { url: string | null; title: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  if (!url || failed === url) return <div className={styles.imageEmpty}>{url ? "Image unavailable" : "No preview"}</div>;
  // The operator reviews an external feed asset at its original public URL.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={styles.offerImage} src={url} alt={`Offer image: ${title}`} width={112} height={84} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(url)} />;
}
