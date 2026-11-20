"use client";

import { FormEvent, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Input, Loading, PageHeader, Panel, Select, StatusLine, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import styles from "./page.module.css";

const ROOT = "/admin/email-marketing";
const fields = [
  { key: "program", options: "programs", label: "Lending program", all: "All programs" },
  { key: "outcome", options: "outcomes", label: "Outcome", all: "All outcomes" },
  { key: "source", options: "sources", label: "Enrollment form", all: "All forms" },
  { key: "locale", options: "locales", label: "Language", all: "All languages" },
] as const;

type Filters = Partial<Record<(typeof fields)[number]["key"], string>>;
type Option = { value: string; label: string };
type Options = Record<(typeof fields)[number]["options"], Option[]> & {
  delivery_enabled: boolean;
  delivery_status: string;
  sequence?: { day: number; subject: string }[];
};
type Draft = { name: string; subject: string; body: string };
type Campaign = Draft & {
  id: string; filters: Filters; created_at: string; recipient_count: number;
  queued: number; sent: number; failed: number; blocked: number; uncertain: number; sending: number;
};
type Review = Draft & { filters: Filters; id: string; count: number };

const blank: Draft = { name: "", subject: "", body: "" };

function describe(filters: Filters, options?: Options) {
  return fields.flatMap(field => {
    const value = filters[field.key];
    if (!value) return [];
    return [options?.[field.options].find(option => option.value === value)?.label ?? value];
  }).join(" · ") || "All eligible subscribers";
}

function recipients(count: number) {
  return count.toLocaleString() + (count === 1 ? " recipient" : " recipients");
}

export default function EmailMarketingPage() {
  const user = useCurrentUser();
  if (!user.authReady || user.isLoading) return <Loading />;
  if (user.isError) return <StatusLine tone="bad">Unable to verify your account. <Btn onClick={() => void user.refetch()}>Retry</Btn></StatusLine>;
  if (user.data?.role !== Role.SUPER_ADMIN) return <StatusLine>Only super admins can manage email marketing.</StatusLine>;
  return <CampaignWorkspace key={user.authScope} operatorId={user.authScope ?? user.data.id} />;
}

function CampaignWorkspace({ operatorId }: { operatorId: string }) {
  const api = useAuthedApi();
  const [filters, setFilters] = useState<Filters>({});
  const [draft, setDraft] = useState<Draft>(blank);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const previous = useRef<{ signature: string; id: string } | null>(null);
  const options = useQuery({
    queryKey: [ROOT, operatorId, "options"],
    queryFn: ({ signal }) => api<Options>(ROOT + "/options", { signal }),
  });
  const preview = useQuery({
    queryKey: [ROOT, operatorId, "preview", filters],
    enabled: options.isSuccess,
    queryFn: ({ signal }) => api<{ eligible_count: number }>(ROOT + "/preview", {
      method: "POST", body: JSON.stringify(filters), signal,
    }),
  });
  const history = useQuery({
    queryKey: [ROOT, operatorId, "campaigns"],
    queryFn: ({ signal }) => api<Campaign[]>(ROOT + "/campaigns", { signal }),
    refetchInterval: query => query.state.data?.some(c => c.queued > 0 || c.sending > 0) ? 15_000 : false,
  });
  const count = preview.data?.eligible_count ?? 0;
  const ready = options.isSuccess && preview.isSuccess && !preview.isFetching && count > 0;

  function changeFilter(key: keyof Filters, value: string) {
    setFilters(current => {
      const next = { ...current };
      if (value) next[key] = value;
      else delete next[key];
      return next;
    });
    setNotice("");
  }

  function openReview(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    const content = { name: draft.name.trim(), subject: draft.subject.trim(), body: draft.body.trim(), filters };
    const signature = JSON.stringify(content);
    if (previous.current?.signature !== signature) previous.current = { signature, id: crypto.randomUUID() };
    setReview({ ...content, id: previous.current.id, count });
    setError("");
    setNotice("");
  }

  async function queue() {
    if (!review || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const { id, name, subject, body, filters: audience } = review;
      const saved = await api<Campaign>(ROOT + "/campaigns", {
        method: "POST", body: JSON.stringify({ id, name, subject, body, filters: audience }),
      });
      setNotice(saved.recipient_count ? `Queued “${saved.name}” for ${recipients(saved.recipient_count)}.` : "The audience is now empty. No email was queued.");
      setReview(null);
      setDraft(blank);
      previous.current = null;
      void history.refetch();
      void preview.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Campaign status is unavailable. Retry to check this request.");
      void history.refetch();
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function closeReview() {
    if (!inFlight.current) setReview(null);
  }

  return <div className="grid">
    <PageHeader title="Email marketing" lede="Reach subscribers by lending program, form and outcome." />
    {options.data && !options.data.delivery_enabled && <StatusLine tone="warn">{options.data.delivery_status}</StatusLine>}
    <div className={styles.workspace}>
      <Panel title="Audience">
        <div className={styles.stack}>
          {options.isError ? <StatusLine tone="bad">Could not load audience filters. <Btn onClick={() => void options.refetch()}>Retry</Btn></StatusLine> : null}
          <div className={styles.filters}>
            {fields.map(field => <label key={field.key}>
              <span className="lbl">{field.label}</span>
              <Select value={filters[field.key] ?? ""} disabled={!options.isSuccess}
                onChange={event => changeFilter(field.key, event.target.value)}>
                <option value="">{field.all}</option>
                {(options.data?.[field.options] ?? []).map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
            </label>)}
          </div>
          <div className={styles.count} aria-live="polite">
            {preview.isError ? <StatusLine tone="bad">Could not count recipients. <Btn onClick={() => void preview.refetch()}>Retry</Btn></StatusLine>
              : <><strong>{options.isError ? "Unavailable" : preview.isFetching || !preview.data ? "Counting…" : recipients(count)}</strong>
                <span className="sub">{preview.data && !preview.isFetching && count === 0 ? "No eligible subscribers match these filters." : "Includes eligible subscribers who opted in to marketing emails."}</span></>}
          </div>
        </div>
      </Panel>
      <Panel title="Compose campaign">
        <form onSubmit={openReview} className={styles.stack}>
          <label><span className="lbl">Campaign name</span>
            <Input required maxLength={120} value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label>
          <label><span className="lbl">Subject line</span>
            <Input required maxLength={200} value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} /></label>
          <label><span className="lbl">Message</span>
            <Textarea required maxLength={10000} rows={6} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })} /></label>
          <span className="sub">Your email footer includes Instagram, Facebook, the mailing address and an unsubscribe link.</span>
          <div><Btn type="submit" variant="pri" disabled={!ready || !draft.name.trim() || !draft.subject.trim() || !draft.body.trim()}>Review campaign</Btn></div>
        </form>
      </Panel>
    </div>
    {notice && <div role="status"><StatusLine tone="ok">{notice}</StatusLine></div>}
    {options.data?.sequence?.length ? <Panel title="Automatic follow-up" sub="After form enrollment">
      <ol className={styles.sequence}>{options.data.sequence.map(step => <li key={step.day}><strong>{step.day ? `Day ${step.day}` : "At enrollment"}</strong> {step.subject}</li>)}</ol>
    </Panel> : null}
    <Panel title="Campaign history" actions={<Btn size="sm" disabled={history.isFetching} onClick={() => void history.refetch()}>Refresh</Btn>}>
      {history.isLoading ? <Loading /> : history.isError ? <StatusLine tone="bad">Campaign history is unavailable. Use Refresh to try again.</StatusLine>
        : !history.data?.length ? <span className="sub">Queued campaigns will appear here.</span>
        : <div className={styles.history}>{history.data.map(c => <details key={c.id}>
          <summary><strong>{c.name}</strong><span>{recipients(c.recipient_count)}</span><span>{c.sent} sent · {c.queued + c.sending} pending</span></summary>
          <div className={styles.detail}>
            <span className="sub">{new Date(c.created_at).toLocaleString()} · {describe(c.filters, options.data)}</span>
            <strong>{c.subject}</strong><p className={styles.message}>{c.body}</p>
            <span>{c.queued} queued · {c.sending} sending · {c.sent} sent · {c.failed} failed · {c.blocked} blocked · {c.uncertain} unconfirmed</span>
            <div><Btn size="sm" onClick={() => { setFilters(c.filters); setNotice("Audience filters applied."); }}>Use this audience</Btn></div>
          </div>
        </details>)}</div>}
    </Panel>
    <Drawer width="md" open={Boolean(review)} onClose={closeReview} closeOnBackdrop={!busy}
      title="Review campaign" sub={review?.name} footer={<>
        <Btn disabled={busy} onClick={closeReview}>Back to editor</Btn><span className="sp" />
        <Btn variant="pri" disabled={busy} onClick={() => void queue()}>{busy ? "Queuing…" : "Confirm and queue"}</Btn>
      </>}>
      {review && <div className={styles.stack}>
        <strong>{recipients(review.count)} currently match</strong><span>{describe(review.filters, options.data)}</span>
        <span className="sub">Confirming queues this email for eligible subscribers matching these filters at that moment.</span>
        <strong>{review.subject}</strong><p className={styles.message}>{review.body}</p>
        <span className="sub">The standard marketing footer will follow your message.</span>
        {error && <div role="alert"><StatusLine tone="bad">{error}</StatusLine></div>}
      </div>}
    </Drawer>
  </div>;
}
