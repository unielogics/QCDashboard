"use client";

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Btn, Loading, PageHeader, Panel, StatusLine } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { ApiError } from "@/lib/api";
import Audience, { initialView } from "./Audience";
import Compose from "./Compose";
import Schedule, { displayTime, type Timing } from "./Schedule";
import { ROOT, blank, content, describe, none, recipients, type Campaign, type Directory, type Filters, type Options, type Preview, type Selection } from "./campaign";
import styles from "./page.module.css";

const stages = ["Audience", "Compose & preview", "Schedule"];
type Request = ReturnType<typeof content> & { id: string; name: string; filters: Filters; selection: Selection; scheduled_at: string | null; expected_recipient_count: number; };

function useDebounced(value: string) {
  const [result, setResult] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setResult(value), 300); return () => clearTimeout(timer); }, [value]);
  return result;
}

export default function EmailMarketingPage() {
  const user = useCurrentUser();
  if (!user.authReady || user.isLoading) return <Loading />;
  if (user.isError) return <StatusLine tone="bad">Unable to verify your account. <Btn onClick={() => void user.refetch()}>Retry</Btn></StatusLine>;
  if (user.data?.role !== Role.SUPER_ADMIN) return <StatusLine>Only super admins can manage email marketing.</StatusLine>;
  return <CampaignWorkspace key={user.authScope} scope={user.authScope ?? user.data.id} />;
}

function CampaignWorkspace({ scope }: { scope: string; }) {
  const api = useAuthedApi();
  const [step, setStep] = useState(0);
  const [filters, setFilters] = useState<Filters>({});
  const [selection, setSelection] = useState<Selection>(none);
  const [view, setView] = useState(initialView);
  const [draft, setDraft] = useState(blank);
  const [sample, setSample] = useState("");
  const [timing, setTiming] = useState<Timing>({ now: false, date: "", time: "", zone: Intl.DateTimeFormat().resolvedOptions().timeZone, occurrence: 0 });
  const [review, setReview] = useState<{ request: Request; count: number; } | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const previous = useRef<{ signature: string; id: string; } | null>(null);
  const search = useDebounced(view.search.trim());
  const options = useQuery({
    queryKey: [ROOT, scope, "options"], queryFn: ({ signal }) => api<Options>(ROOT + "/options", { signal }),
  });
  const directory = useQuery({
    queryKey: [ROOT, scope, "directory", filters, selection, search, view.page, view.eligibility],
    enabled: options.isSuccess,
    queryFn: ({ signal }) => api<Directory>(ROOT + "/directory", {
      method: "POST", signal, body: JSON.stringify({
        filters, selection, search, page: view.page, page_size: 25, eligibility: view.eligibility,
      })
    }), placeholderData: keepPreviousData,
  });
  const message = JSON.stringify(content(draft));
  const previewContent = useDebounced(message);
  const previewReady = Boolean(draft.subject.trim() && (draft.format === "text" ? draft.body : draft.body_html).trim());
  const preview = useQuery({
    queryKey: [ROOT, scope, "render", filters, selection, sample, previewContent],
    enabled: step > 0 && previewReady && previewContent === message,
    queryFn: ({ signal }) => api<Preview>(ROOT + "/campaigns/preview", {
      method: "POST", signal, body: JSON.stringify({
        ...JSON.parse(previewContent), filters, selection, ...(sample ? { sample_id: sample } : {}),
      })
    }), retry: false,
  });
  const history = useQuery({
    queryKey: [ROOT, scope, "campaigns"], queryFn: ({ signal }) => api<Campaign[]>(ROOT + "/campaigns", { signal }),
    refetchInterval: q => q.state.data?.some(c => c.queued > 0 || c.sending > 0) ? 30_000 : false,
  });
  const count = directory.data?.selected_count ?? 0;
  const pending = directory.isLoading || directory.isPlaceholderData || search !== view.search.trim();
  const rendered = previewReady && previewContent === message && preview.isSuccess ? preview.data : undefined;

  function select(next: Selection) {
    setSelection(next);
    setSample("");
    setNotice("");
  }
  function changeFilters(next: Filters) {
    setFilters(next);
    setView({ ...view, page: 1 });
    select(none);
  }
  function openReview(scheduled_at: string | null) {
    if (!rendered || count < 1) return;
    const payload = { name: draft.name.trim(), ...content(draft), filters, selection, scheduled_at, expected_recipient_count: count };
    const signature = JSON.stringify(payload);
    if (previous.current?.signature !== signature) previous.current = { signature, id: crypto.randomUUID() };
    setReview({ request: { ...payload, id: previous.current.id }, count });
    setError("");
  }
  async function submit() {
    if (!review || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Campaign>(ROOT + "/campaigns", { method: "POST", body: JSON.stringify(review.request) });
      const when = saved.scheduled_at ? " for " + displayTime(new Date(saved.scheduled_at), timing.zone) : "";
      setNotice(saved.recipient_count ? `${saved.scheduled_at ? "Scheduled" : "Queued"} “${saved.name}”${when} · ${recipients(saved.recipient_count)}.` : "No eligible recipients remained. No emails were queued.");
      setReview(null);
      setDraft(blank);
      setStep(0);
      setSelection(none);
      setSample("");
      previous.current = null;
      void history.refetch();
      void directory.refetch();
    } catch (e) {
      if (e instanceof ApiError && e.status === 409 && /audience|recipient count/i.test(e.message)) {
        setReview(null);
        setStep(0);
        setNotice("Your audience changed. Review the updated selection before scheduling this campaign.");
        void directory.refetch();
        void preview.refetch();
      } else {
        setError(e instanceof Error ? e.message : "The delivery request could not be confirmed. Retry this request to check its status.");
      }
      void history.refetch();
    } finally { sending.current = false; setBusy(false); }
  }
  function closeReview() { if (!sending.current) setReview(null); }
  return <div className={styles.workspace}>
    <PageHeader title="Email marketing" />
    {options.data && !options.data.delivery_enabled && <StatusLine tone="warn">{options.data.delivery_status}</StatusLine>}
    {options.isError && <StatusLine tone="bad">Audience filters are unavailable. <Btn onClick={() => void options.refetch()}>Retry</Btn></StatusLine>}
    {notice && <div role="status"><StatusLine tone="ok">{notice}</StatusLine></div>}
    <nav aria-label="Campaign steps"><ol className={styles.steps}>{stages.map((name, i) => <li key={name}>
      <button type="button" aria-current={step === i ? "step" : undefined} disabled={i > step} onClick={() => setStep(i)}><span>{i + 1}</span>{name}</button>
    </li>)}</ol></nav>
    {step === 0 && <Audience options={options.data} filters={filters} selectFilters={changeFilters}
      view={view} setView={setView} data={directory.data} loading={pending || !options.isSuccess} error={directory.isError}
      refresh={() => { void directory.refetch(); }} selection={selection} select={select} next={() => setStep(1)} />}
    {step === 1 && <Compose scope={scope} draft={draft} update={setDraft} filters={filters} selection={selection} sample={sample} setSample={setSample}
      preview={rendered} loading={previewReady && (previewContent !== message || preview.isFetching)}
      error={previewReady && previewContent === message && preview.isError ? preview.error.message : ""} refresh={() => void preview.refetch()} back={() => setStep(0)} next={() => setStep(2)} />}
    {step === 2 && <Schedule timing={timing} setTiming={setTiming} draft={draft} count={directory.isError || pending ? 0 : count} audience={describe(filters, options.data)} preview={rendered}
      back={() => setStep(1)} review={openReview} />}
    {options.data?.sequence?.length ? <details className={styles.disclosure}><summary>Automatic enrollment follow-up</summary>
      <ol className={styles.sequence}>{options.data.sequence.map(s => <li key={s.day}><b>{s.day ? "Day " + s.day : "At enrollment"}</b>{s.subject}</li>)}</ol></details> : null}
    <Panel title="Campaign history" actions={<Btn size="sm" disabled={history.isFetching} onClick={() => void history.refetch()}>Refresh</Btn>}>
      {history.isLoading ? <Loading /> : history.isError ? <StatusLine tone="bad">Campaign history is unavailable. Use Refresh to try again.</StatusLine>
        : !history.data?.length ? <span className="sub">Scheduled and sent campaigns will appear here.</span>
          : <div className={styles.history}>{history.data.map(c => <details key={c.id}><summary><b>{c.name}</b><span>{recipients(c.recipient_count)}</span>
            <span>{c.scheduled_at && Date.parse(c.scheduled_at) > Date.now() ? "Scheduled · " + displayTime(new Date(c.scheduled_at), timing.zone) : c.sent + " sent · " + (c.queued + c.sending) + " pending"}</span></summary>
            <div className={styles.detail}><small>{describe(c.filters, options.data)} · Created {new Date(c.created_at).toLocaleString()}</small>
              <strong>{c.subject}</strong>{c.body && <p className={styles.message}>{c.body}</p>}
              <span>{c.queued} queued · {c.sending} sending · {c.sent} sent · {c.failed} failed · {c.blocked} blocked · {c.uncertain} unconfirmed</span>
              <div><Btn size="sm" onClick={() => { setFilters(c.filters); select(none); setView(initialView); setStep(0); }}>Use these filters</Btn></div>
            </div></details>)}</div>}
    </Panel>
    <Drawer width="md" title="Review campaign" sub={review?.request.name} open={Boolean(review)} onClose={closeReview} closeOnBackdrop={!busy}
      footer={<><Btn disabled={busy} onClick={closeReview}>Back to schedule</Btn><span className="sp" /><Btn variant="pri" disabled={busy} onClick={() => void submit()}>
        {busy ? "Submitting…" : review?.request.scheduled_at ? "Confirm schedule" : "Confirm and queue"}</Btn></>}>
      {review && <div className={styles.detail}><strong>{recipients(review.count)} selected</strong><span>{describe(filters, options.data)}</span>
        <strong>{draft.subject}</strong><span>{review.request.scheduled_at ? displayTime(new Date(review.request.scheduled_at), timing.zone) + " · " + timing.zone : "Delivery starts after confirmation."}</span>
        <small>Delivery eligibility is checked again before each email is sent.</small>
        {error && <div role="alert"><StatusLine tone="bad">{error}</StatusLine></div>}</div>}
    </Drawer>
  </div>;
}
