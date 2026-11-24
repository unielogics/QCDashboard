"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Input, Select, Textarea, StatusLine } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { ROOT, type Directory, type Draft, type Filters, type Selection, type Preview } from "./campaign";
import styles from "./page.module.css";

const tags = ["first_name", "last_name", "full_name", "email", "business_name", "program"];
export function PreviewFrame({ preview }: { preview: Preview; }) {
  const [showImages, setShowImages] = useState(false);
  const externalImages = /<img\b[^>]+\bsrc\s*=\s*["']https:\/\//i.test(preview.body_html);
  // Preview the same mail markup returned by the API while keeping outside resources and navigation isolated.
  const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data: ${showImages ? "https:" : ""}; form-action 'none'; base-uri 'none'">`;
  return <div className={styles.previewFrame}><div className={styles.envelope}><span>To</span><b>{preview.sample_email}</b><span>Subject</span><b>{preview.subject}</b></div>
    {externalImages && <Btn size="sm" onClick={() => setShowImages(!showImages)}>{showImages ? "Hide external images" : "Load external images"}</Btn>}
    <iframe title="Email preview" sandbox="" referrerPolicy="no-referrer" srcDoc={policy + preview.body_html} /></div>;
}
type Props = {
  scope: string; draft: Draft; update: (draft: Draft) => void; filters: Filters; selection: Selection; sample: string; setSample: (id: string) => void;
  preview?: Preview; loading: boolean; error: string; refresh: () => void; back: () => void; next: () => void;
};
export default function Compose({ scope, draft, update, filters, selection, sample, setSample, preview, loading, error, refresh, back, next }: Props) {
  const api = useAuthedApi();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [activeField, setActiveField] = useState<"subject" | "body">("body");
  const inputRef = useRef<HTMLFormElement>(null);
  const sampleQuery = useQuery({
    queryKey: [ROOT, scope, "preview-contacts", filters, selection, search, page],
    queryFn: ({ signal }) => api<Directory>(ROOT + "/directory", {
      method: "POST", signal, body: JSON.stringify({
        filters, selection, eligibility: "eligible", selected_only: true, search, page, page_size: 25,
      })
    }),
  });
  const bodyKey = draft.format === "html" ? "body_html" : "body";
  function insertTag(tag: string) {
    const key = activeField === "subject" ? "subject" : bodyKey;
    const field = inputRef.current?.elements.namedItem(key) as HTMLInputElement | HTMLTextAreaElement | null;
    if (!field) return;
    const start = field.selectionStart ?? draft[key].length, end = field.selectionEnd ?? start;
    const token = "{{" + tag + "}}";
    update({ ...draft, [key]: draft[key].slice(0, start) + token + draft[key].slice(end) });
    requestAnimationFrame(() => { field.focus(); field.setSelectionRange(start + token.length, start + token.length); });
  }
  const valid = Boolean(draft.name.trim() && draft.subject.trim() && draft[bodyKey].trim() && preview?.eligible_count && !loading && !error);
  return <section className={styles.panel} aria-labelledby="compose-heading">
    <div className={styles.sectionHead}><h2 id="compose-heading">Compose &amp; preview</h2></div>
    <div className={styles.composer}>
      <form ref={inputRef} className={styles.editor} onSubmit={e => e.preventDefault()}>
        <label><span>Campaign name</span><Input required maxLength={120} value={draft.name} onChange={e => update({ ...draft, name: e.target.value })} /></label>
        <label><span>Subject line</span><Input required name="subject" maxLength={200} value={draft.subject} onFocus={() => setActiveField("subject")} onChange={e => update({ ...draft, subject: e.target.value })} /></label>
        <div role="group" aria-label="Message format" className={styles.modes}>
          <Btn aria-pressed={draft.format === "text"} onClick={() => update({ ...draft, format: "text" })}>Plain text</Btn>
          <Btn aria-pressed={draft.format === "html"} onClick={() => update({ ...draft, format: "html" })}>HTML</Btn>
        </div>
        <label><span>{draft.format === "html" ? "Email HTML" : "Message"}</span>
          <Textarea name={bodyKey} value={draft[bodyKey]} rows={9} maxLength={draft.format === "html" ? 100000 : 10000}
            placeholder={draft.format === "html" ? "Paste your email HTML" : "Write your email"} onFocus={() => setActiveField("body")} onChange={e => update({ ...draft, [bodyKey]: e.target.value })} /></label>
        {draft.format === "html" && <small>The preview shows the email-safe version. Unsupported styles are removed.</small>}
        <div className={styles.tagList}><span>Insert merge tag</span>{tags.map(tag => <Btn size="sm" key={tag} onClick={() => insertTag(tag)}>{"{{" + tag + "}}"}</Btn>)}</div>
      </form>
      <div className={styles.sample}>
        <div className={styles.sampleControls}>
          <label><span>Find a preview recipient</span><Input type="search" placeholder="Search selected recipients" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
          <label><span>Preview recipient</span><Select value={sample} onChange={e => setSample(e.target.value)}>
            <option value="">First selected recipient</option>
            {sample && !sampleQuery.data?.rows.some(r => r.id === sample) && <option value={sample}>{preview?.sample_email ?? "Selected recipient"}</option>}
            {sampleQuery.data?.rows.filter(r => r.id).map(r => <option key={r.id!} value={r.id!}>{r.name ? r.name + " · " : ""}{r.email}</option>)}
          </Select></label>
        </div>
        {sampleQuery.isError && <StatusLine tone="bad">Preview contacts could not be loaded. <Btn onClick={() => void sampleQuery.refetch()}>Retry</Btn></StatusLine>}
        {sampleQuery.data && (page > 1 || sampleQuery.data.total_count > 25) && <div className={styles.toolbar}><Btn size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous contacts</Btn><Btn size="sm" disabled={page * 25 >= sampleQuery.data.total_count} onClick={() => setPage(page + 1)}>More contacts</Btn></div>}
        {error ? <StatusLine tone="bad">{error} <Btn onClick={refresh}>Retry preview</Btn></StatusLine>
          : loading ? <p role="status" className={styles.empty}>Updating preview…</p>
            : preview ? <PreviewFrame preview={preview} /> : <p className={styles.empty}>Enter a subject and message to preview this email for a selected recipient.</p>}
      </div>
    </div>
    <div className={styles.actions}><Btn onClick={back}>Back to audience</Btn><Btn variant="pri" disabled={!valid} onClick={next}>Next: Schedule</Btn></div>
  </section>;
}
