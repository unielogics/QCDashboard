"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, IconBtn, Input, Row, Sub, cx } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type {
  ApplicationBankState,
  ApplicationProfile,
  ApplicationSourceKind,
  FileCreditInvite,
  FileOwner,
  FileOwnerRequirementState,
} from "@/lib/applicationProfile";

type OwnerDraft = {
  key: string;
  first_name: string;
  last_name: string;
  ownership_pct: string;
  email: string;
  phone: string;
  state: "unsaved" | "saving" | "invalid";
};

const EMPTY_DRAFT = { first_name: "", last_name: "", ownership_pct: "", email: "", phone: "" };

function maskEmail(value: string | null) {
  if (!value || !value.includes("@")) return "Email missing";
  const [name, domain] = value.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(2, Math.min(6, name.length - 2)))}@${domain}`;
}

function maskPhone(value: string | null) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "Phone missing";
}

function creditStatus(owner: FileOwner): { label: string; tone: "ok" | "acc" | "warn" | "bad" | "mut" } {
  if (owner.credit_complete) return { label: "Completed", tone: "ok" };
  if (owner.invite_opened_at) return { label: "Opened", tone: "acc" };
  if (owner.invite_sent_at) return { label: "Sent", tone: "warn" };
  return { label: "Not sent", tone: "mut" };
}

function when(value: string | null) {
  if (!value) return "Never";
  return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function ApplicationVerificationWorkspace({
  sourceKind,
  sourceId,
  mode = "full",
  onReadyForStep2,
  onStateChange,
}: {
  sourceKind: ApplicationSourceKind;
  sourceId: string;
  mode?: "full" | "owners" | "credit" | "banking" | "verification";
  onReadyForStep2?: () => void;
  onStateChange?: (state: FileOwnerRequirementState) => void;
}) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const initialView = mode === "banking" ? "banking" : mode === "credit" || mode === "verification" ? "credit" : "owners";
  const [view, setView] = useState<"owners" | "credit" | "banking">(initialView);
  const profileQuery = useQuery({
    queryKey: ["application-profile", sourceKind, sourceId],
    queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }),
    }),
    enabled: Boolean(sourceId),
  });
  const profileId = profileQuery.data?.id ?? "";
  const owners = useQuery({
    queryKey: ["application-profile-owners", profileId],
    queryFn: () => apiCall<FileOwner[]>(`/application-profiles/${profileId}/owners`),
    enabled: Boolean(profileId),
  });
  const verification = useQuery({
    queryKey: ["application-profile-verification", profileId],
    queryFn: () => apiCall<FileOwnerRequirementState>(`/application-profiles/${profileId}/verification`),
    enabled: Boolean(profileId),
  });
  const banks = useQuery({
    queryKey: ["application-profile-banks", profileId],
    queryFn: () => apiCall<ApplicationBankState>(`/application-profiles/${profileId}/banks`),
    enabled: Boolean(profileId) && mode !== "owners" && mode !== "credit",
  });
  useEffect(() => {
    if (verification.data) onStateChange?.(verification.data);
  }, [verification.data, onStateChange]);

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["application-profile-owners", profileId] }),
      qc.invalidateQueries({ queryKey: ["application-profile-verification", profileId] }),
      qc.invalidateQueries({ queryKey: ["application-profile-banks", profileId] }),
    ]);
  };

  if (profileQuery.isLoading) return <div className="empty"><span className="spinner solo" />Preparing the application profile...</div>;
  if (profileQuery.isError || !profileQuery.data) {
    return <Callout tone="bad" icon={<Icon name="alert" size={17} />}>{profileQuery.error instanceof Error ? profileQuery.error.message : "The application profile could not be opened."}</Callout>;
  }

  return (
    <div className="application-verification">
      {mode === "full" ? (
        <div className="application-verification-tabs" role="tablist" aria-label="Verification steps">
          <button type="button" className={view === "owners" ? "on" : undefined} onClick={() => setView("owners")}><span>1</span>Ownership</button>
          <button type="button" className={view === "credit" ? "on" : undefined} onClick={() => setView("credit")} disabled={!verification.data?.ready_for_step_2}><span>2</span>Owner credit</button>
          <button type="button" className={view === "banking" ? "on" : undefined} onClick={() => setView("banking")}><span>3</span>Business banking</button>
        </div>
      ) : null}
      {(mode === "owners" || (mode === "full" && view === "owners")) ? (
        <OwnershipTable
          profileId={profileId}
          owners={owners.data ?? []}
          state={verification.data}
          loading={owners.isLoading || verification.isLoading}
          onRefresh={refresh}
          onContinue={() => {
            if (mode === "full") setView("credit");
            onReadyForStep2?.();
          }}
        />
      ) : null}
      {(mode === "credit" || mode === "verification" || (mode === "full" && view === "credit")) ? (
        <CreditPanel
          profileId={profileId}
          owners={owners.data ?? []}
          state={verification.data}
          loading={owners.isLoading || verification.isLoading}
          onRefresh={refresh}
        />
      ) : null}
      {(mode === "banking" || (mode === "full" && view === "banking")) ? <BankingPanel profileId={profileId} sourceKind={sourceKind} sourceId={sourceId} state={verification.data} banks={banks.data} loading={verification.isLoading || banks.isLoading} onRefresh={refresh} /> : null}
    </div>
  );
}

function OwnershipTable({ profileId, owners, state, loading, onRefresh, onContinue }: {
  profileId: string;
  owners: FileOwner[];
  state?: FileOwnerRequirementState;
  loading: boolean;
  onRefresh: () => Promise<void>;
  onContinue: () => void;
}) {
  const apiCall = useAuthedApi();
  const [drafts, setDrafts] = useState<OwnerDraft[]>([]);
  const [saveStates, setSaveStates] = useState<Record<string, "saving" | "saved" | "invalid">>({});
  const [error, setError] = useState("");

  const createOwner = useMutation({
    mutationFn: (draft: OwnerDraft) => apiCall<FileOwner>(`/application-profiles/${profileId}/owners`, {
      method: "POST",
      body: JSON.stringify({
        first_name: draft.first_name.trim(),
        last_name: draft.last_name.trim(),
        ownership_pct: Number(draft.ownership_pct),
        email: draft.email.trim() || null,
        phone: draft.phone.trim() || null,
        is_primary: owners.length === 0,
      }),
    }),
    onSuccess: async (_row, draft) => {
      setDrafts((rows) => rows.filter((row) => row.key !== draft.key));
      setError("");
      await onRefresh();
    },
    onError: (reason, draft) => {
      setDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, state: "invalid" } : row));
      setError(reason instanceof Error ? reason.message : "The owner could not be saved.");
    },
  });
  const patchOwner = useMutation({
    mutationFn: ({ ownerId, body }: { ownerId: string; body: Record<string, unknown> }) => apiCall<FileOwner>(`/application-profiles/${profileId}/owners/${ownerId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
    onMutate: ({ ownerId }) => setSaveStates((current) => ({ ...current, [ownerId]: "saving" })),
    onSuccess: async (_row, input) => {
      setSaveStates((current) => ({ ...current, [input.ownerId]: "saved" }));
      setError("");
      await onRefresh();
    },
    onError: (reason, input) => {
      setSaveStates((current) => ({ ...current, [input.ownerId]: "invalid" }));
      setError(reason instanceof Error ? reason.message : "The owner row could not be saved.");
    },
  });
  const deleteOwner = useMutation({
    mutationFn: (ownerId: string) => apiCall<void>(`/application-profiles/${profileId}/owners/${ownerId}`, { method: "DELETE" }),
    onSuccess: async () => { setError(""); await onRefresh(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The owner could not be removed."),
  });

  const serverTotal = state?.ownership_total ?? owners.reduce((sum, owner) => sum + Number(owner.ownership_pct ?? 0), 0);
  const draftTotal = drafts.reduce((sum, owner) => sum + (Number(owner.ownership_pct) || 0), 0);
  const total = Math.round((serverTotal + draftTotal) * 100) / 100;
  const rowsSettled = drafts.length === 0 && !Object.values(saveStates).includes("saving") && !Object.values(saveStates).includes("invalid");
  const ready = Boolean(state?.ready_for_step_2) && rowsSettled;

  function addOwner() {
    if (owners.length + drafts.length >= 5) return;
    setDrafts((rows) => [...rows, { ...EMPTY_DRAFT, key: crypto.randomUUID(), state: "unsaved" }]);
  }

  function updateDraft(key: string, field: keyof typeof EMPTY_DRAFT, value: string) {
    setDrafts((rows) => rows.map((row) => row.key === key ? { ...row, [field]: value, state: "unsaved" } : row));
  }

  function saveDraft(draft: OwnerDraft) {
    if (draft.state === "saving") return;
    const pct = Number(draft.ownership_pct);
    const valid = Boolean(draft.first_name.trim() && draft.last_name.trim() && draft.ownership_pct.trim() && Number.isFinite(pct) && pct >= 0 && pct <= 100);
    if (!valid) {
      setDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, state: "invalid" } : row));
      return;
    }
    setDrafts((rows) => rows.map((row) => row.key === draft.key ? { ...row, state: "saving" } : row));
    createOwner.mutate({ ...draft, state: "saving" });
  }

  function save(owner: FileOwner, field: string, raw: string) {
    const value = field === "ownership_pct" ? (raw.trim() === "" ? null : Number(raw)) : raw.trim() || null;
    const previous = field === "ownership_pct" ? owner.ownership_pct : owner[field as keyof FileOwner];
    if (value === previous) return;
    patchOwner.mutate({ ownerId: owner.id, body: { [field]: value } });
  }

  return (
    <section className="verification-section">
      <header className="verification-section-head">
        <div><span className="lbl">Step 1</span><h3>Business ownership</h3><Sub>Every owner remains on the file. Owners at 20.00% or more require separate credit authorization.</Sub></div>
        <div className={cx("ownership-meter", total === 100 && "complete", total > 100 && "over")}>
          <strong className="num">{total.toFixed(2)}%</strong>
          <span>{total < 100 ? `${(100 - total).toFixed(2)}% remaining` : total > 100 ? `${(total - 100).toFixed(2)}% over` : "Fully allocated"}</span>
        </div>
        <Btn onClick={addOwner} disabled={owners.length + drafts.length >= 5}><Icon name="plus" size={14} />Add owner</Btn>
      </header>

      {loading ? <div className="empty"><span className="spinner solo" />Loading ownership...</div> : (
        <div className="tblwrap ownership-table-wrap">
          <table className="tbl ownership-table">
            <thead><tr><th>First name</th><th>Last name</th><th>Ownership %</th><th>Personal email</th><th>Personal phone</th><th>Credit requirement</th><th>Save</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {owners.map((owner) => {
                const saveState = saveStates[owner.id] ?? "saved";
                const locked = owner.has_invite || Boolean(owner.credit_pulled_at);
                return (
                  <tr key={owner.id}>
                    <td><Input aria-label={`${owner.full_name} first name`} defaultValue={owner.first_name} onBlur={(event) => save(owner, "first_name", event.target.value)} /></td>
                    <td><Input aria-label={`${owner.full_name} last name`} defaultValue={owner.last_name} onBlur={(event) => save(owner, "last_name", event.target.value)} /></td>
                    <td><Input aria-label={`${owner.full_name} ownership percentage`} className="num owner-percent" inputMode="decimal" defaultValue={owner.ownership_pct ?? ""} onBlur={(event) => save(owner, "ownership_pct", event.target.value)} /></td>
                    <td><Input aria-label={`${owner.full_name} personal email`} type="email" defaultValue={owner.email ?? ""} onBlur={(event) => save(owner, "email", event.target.value)} /></td>
                    <td><Input aria-label={`${owner.full_name} personal phone`} type="tel" defaultValue={owner.phone ?? ""} onBlur={(event) => save(owner, "phone", event.target.value)} /></td>
                    <td><CellChip tone={owner.credit_required ? (owner.credit_contact_complete ? "warn" : "bad") : "mut"}>{owner.credit_required ? "iSoftPull required" : "Not required"}</CellChip>{owner.credit_required && !owner.credit_contact_complete ? <small className="owner-row-warning">Email + phone needed</small> : null}</td>
                    <td><CellChip tone={saveState === "saved" ? "ok" : saveState === "invalid" ? "bad" : "mut"}>{saveState === "saving" ? "Saving..." : saveState === "invalid" ? "Fix row" : "Saved"}</CellChip></td>
                    <td className="r"><IconBtn aria-label={`Remove ${owner.full_name}`} title={locked ? "Credit activity preserves this owner" : "Remove owner"} disabled={locked || deleteOwner.isPending} onClick={() => deleteOwner.mutate(owner.id)}><Icon name="trash" size={14} /></IconBtn></td>
                  </tr>
                );
              })}
              {drafts.map((draft) => {
                const pct = Number(draft.ownership_pct);
                const required = draft.ownership_pct !== "" && Number.isFinite(pct) && pct >= 20;
                return (
                  <tr key={draft.key} className="owner-draft-row">
                    {(["first_name", "last_name", "ownership_pct", "email", "phone"] as const).map((field) => (
                      <td key={field}><Input aria-label={`New owner ${field.replace("_", " ")}`} className={field === "ownership_pct" ? "num owner-percent" : undefined} type={field === "email" ? "email" : field === "phone" ? "tel" : "text"} inputMode={field === "ownership_pct" ? "decimal" : undefined} value={draft[field]} onChange={(event) => updateDraft(draft.key, field, event.target.value)} onBlur={() => saveDraft(draft)} /></td>
                    ))}
                    <td><CellChip tone={required ? "warn" : "mut"}>{required ? "iSoftPull required" : "Not required"}</CellChip></td>
                    <td><CellChip tone={draft.state === "invalid" ? "bad" : "mut"}>{draft.state === "saving" ? "Saving..." : draft.state === "invalid" ? "Complete row" : "Unsaved"}</CellChip></td>
                    <td className="r"><IconBtn aria-label="Remove unsaved owner" title="Remove owner" onClick={() => setDrafts((rows) => rows.filter((row) => row.key !== draft.key))}><Icon name="trash" size={14} /></IconBtn></td>
                  </tr>
                );
              })}
              {!owners.length && !drafts.length ? <tr><td colSpan={8}><div className="empty">Add every business owner to begin the verification schedule.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      )}
      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      <footer className="verification-section-footer">
        <div className="verification-blockers">
          {state?.ownership_blockers.length ? state.ownership_blockers.map((blocker) => <span key={blocker}><Icon name="x" size={12} />{blocker}</span>) : <span className="ready"><Icon name="check" size={12} />Ownership is ready. Evidence can be collected next.</span>}
        </div>
        <Btn variant="pri" disabled={!ready} onClick={onContinue}>Continue to evidence<Icon name="arrowR" size={14} /></Btn>
      </footer>
    </section>
  );
}

function CreditPanel({ profileId, owners, state, loading, onRefresh }: {
  profileId: string;
  owners: FileOwner[];
  state?: FileOwnerRequirementState;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const apiCall = useAuthedApi();
  const requiredOwners = owners.filter((owner) => owner.credit_required);
  const [links, setLinks] = useState<Record<string, string>>({});
  const [alsoText, setAlsoText] = useState(false);
  const [error, setError] = useState("");

  const invite = useMutation({
    mutationFn: ({ ownerId }: { ownerId: string }) => apiCall<FileCreditInvite>(`/application-profiles/${profileId}/owners/${ownerId}/credit-invite`, { method: "POST", body: JSON.stringify({ channel: alsoText ? "sms" : "email" }) }),
    onSuccess: async (result) => {
      if (result.path) setLinks((current) => ({ ...current, [result.owner_id]: `${window.location.origin}${result.path}` }));
      setError(result.delivered ? "" : result.detail);
      await onRefresh();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The authorization could not be sent."),
  });
  const inviteAll = useMutation({
    mutationFn: () => apiCall<{ items: FileCreditInvite[] }>(`/application-profiles/${profileId}/owners/credit-invites`, { method: "POST", body: JSON.stringify({ channel: alsoText ? "sms" : "email" }) }),
    onSuccess: async (result) => {
      const next: Record<string, string> = {};
      result.items.forEach((item) => { if (item.path) next[item.owner_id] = `${window.location.origin}${item.path}`; });
      setLinks((current) => ({ ...current, ...next }));
      setError("");
      await onRefresh();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The authorizations could not be sent."),
  });

  if (loading) return <div className="empty"><span className="spinner solo" />Loading verification...</div>;
  return (
    <div className="verification-stack">
      <section className="verification-section">
        <header className="verification-section-head">
          <div><span className="lbl">Step 3</span><h3>Owner iSoftPull authorizations</h3><Sub>Each 20%+ owner receives a private, one-time link tied only to their identity.</Sub></div>
          <CellChip tone={state?.credit_returned ? "ok" : "warn"}>{state?.completed_credit_owner_count ?? 0} of {state?.required_credit_owner_count ?? 0} completed</CellChip>
          <Btn variant="pri" disabled={!state?.ready_for_step_2 || !state?.pending_credit_owner_ids.length || inviteAll.isPending} onClick={() => inviteAll.mutate()}><Icon name="send" size={14} />Send all pending</Btn>
        </header>
        <div className="credit-owner-grid">
          {requiredOwners.map((owner) => {
            const status = creditStatus(owner);
            const freshLink = links[owner.id];
            return (
              <article key={owner.id} className={cx("credit-owner-box", owner.credit_complete && "complete")}>
                <header><span className="credit-owner-avatar">{owner.first_name.slice(0, 1)}{owner.last_name.slice(0, 1)}</span><div className="grow"><b>{owner.full_name}</b><Sub>{Number(owner.ownership_pct ?? 0).toFixed(2)}% ownership</Sub></div><CellChip tone={status.tone}>{status.label}</CellChip></header>
                <dl><div><dt>Email</dt><dd>{maskEmail(owner.email)}</dd></div><div><dt>Phone</dt><dd>{maskPhone(owner.phone)}</dd></div><div><dt>Last activity</dt><dd>{when(owner.credit_pulled_at || owner.invite_opened_at || owner.invite_sent_at)}</dd></div>{owner.credit_tier ? <div><dt>Result</dt><dd>{owner.credit_tier}</dd></div> : null}</dl>
                <footer><Btn disabled={!owner.credit_contact_complete || owner.credit_complete || invite.isPending} onClick={() => invite.mutate({ ownerId: owner.id })}><Icon name="mail" size={13} />{owner.invite_sent_at ? "Resend" : "Send authorization"}</Btn>{freshLink ? <IconBtn aria-label={`Copy ${owner.full_name} secure link`} title="Copy secure link" onClick={() => void navigator.clipboard.writeText(freshLink)}><Icon name="copy" size={14} /></IconBtn> : null}</footer>
              </article>
            );
          })}
          {!requiredOwners.length ? <div className="empty">No owner currently meets the 20.00% credit threshold.</div> : null}
        </div>
        <label className="verification-sms"><input type="checkbox" checked={alsoText} onChange={(event) => setAlsoText(event.target.checked)} />Also send by SMS when the exact owner has transactional consent</label>
      </section>

      {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
    </div>
  );
}

function BankingPanel({ profileId, sourceKind, sourceId, state, banks, loading, onRefresh }: {
  profileId: string;
  sourceKind: ApplicationSourceKind;
  sourceId: string;
  state?: FileOwnerRequirementState;
  banks?: ApplicationBankState;
  loading: boolean;
  onRefresh: () => Promise<void>;
}) {
  const apiCall = useAuthedApi();
  const picker = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadState, setUploadState] = useState("");
  const [error, setError] = useState("");
  const [secureLink, setSecureLink] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  const invite = useMutation({
    mutationFn: (channel: "email" | "none") => apiCall<{ path: string; token: string | null; delivery_status: string }>(`/application-profiles/${profileId}/bank-invitations`, { method: "POST", body: JSON.stringify({ channel }) }),
    onSuccess: (result) => { setSecureLink(`${window.location.origin}${result.path}`); setError(result.delivery_status === "failed" ? "The secure link was created but delivery failed." : ""); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The bank request could not be sent."),
  });
  const override = useMutation({
    mutationFn: () => apiCall<ApplicationBankState>(`/application-profiles/${profileId}/banks/manual-override`, { method: "POST", body: JSON.stringify({ reason: overrideReason.trim() }) }),
    onSuccess: async () => { setOverrideReason(""); setError(""); await onRefresh(); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Manual statement evidence could not be approved."),
  });

  async function uploadFiles(files: File[]) {
    if (sourceKind !== "intake" || !files.length) return;
    setUploading(true); setError("");
    let uploaded = 0;
    try {
      for (const file of files) {
        setUploadState(`Uploading ${file.name} · ${uploaded + 1} of ${files.length}`);
        const init = await apiCall<{ file_id: string; upload_url: string; required_headers: Record<string, string> }>(`/admin/ai-underwriter-leads/${sourceId}/files/upload-init`, { method: "POST", body: JSON.stringify({ requested_document_id: null, file_name: file.name, content_type: file.type || "application/octet-stream", size_bytes: file.size }) });
        const response = await fetch(init.upload_url, { method: "PUT", body: file, headers: init.required_headers });
        if (!response.ok) throw new Error(`${file.name} could not be uploaded.`);
        await apiCall(`/admin/ai-underwriter-leads/${sourceId}/files/complete`, { method: "POST", body: JSON.stringify({ file_id: init.file_id }) });
        uploaded += 1;
      }
      setUploadState(`${uploaded} statement file${uploaded === 1 ? "" : "s"} uploaded and queued for extraction.`);
      await onRefresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Bank statements could not be uploaded.");
    } finally {
      setUploading(false); setDragging(false);
      if (picker.current) picker.current.value = "";
    }
  }

  if (loading) return <div className="empty"><span className="spinner solo" />Loading business banking...</div>;
  const connected = (banks?.items ?? []).filter((item) => item.status !== "removed");
  const manualMonths = banks?.manual_statement_months ?? [];
  return <section className="verification-section bank-evidence-workspace">
    <header className="verification-section-head">
      <div><span className="lbl">Step 4</span><h3>Business bank evidence</h3><Sub>The client connects LLC accounts from their secure link. Staff may upload supplied statements and approve them as the evidence source.</Sub></div>
      <CellChip tone={state?.business_banking_complete ? "ok" : "warn"}>{state?.business_banking_complete ? "Complete" : "Awaiting applicant"}</CellChip>
    </header>
    <div className="bank-evidence-stats"><div><span>Connected institutions</span><b className="num">{connected.length}</b></div><div><span>Evidence source</span><b>{banks?.manual_override ? "Uploaded statements" : connected.length ? "Plaid" : "-"}</b></div><div><span>Statement coverage</span><b className="num">{state?.bank_statement_months || "-"}</b></div></div>
    <Row><Btn variant="pri" disabled={invite.isPending} onClick={() => invite.mutate("email")}><Icon name="send" size={14} />{secureLink ? "Resend bank request" : "Send bank connection request"}</Btn><Btn disabled={invite.isPending} onClick={() => invite.mutate("none")}><Icon name="link" size={14} />Create secure link</Btn>{secureLink ? <IconBtn aria-label="Copy secure bank link" title="Copy secure bank link" onClick={() => void navigator.clipboard.writeText(secureLink)}><Icon name="copy" size={14} /></IconBtn> : null}</Row>
    <input ref={picker} type="file" hidden multiple accept=".pdf,.csv,.xlsx,.xls,.zip,image/*" onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))} />
    <button type="button" className={cx("bank-statement-dropzone", dragging && "dragging")} disabled={uploading || sourceKind !== "intake"} onClick={() => picker.current?.click()} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); void uploadFiles(Array.from(event.dataTransfer.files)); }}>
      <Icon name="upload" size={22} /><b>{uploading ? uploadState : "Drop bank statements here or click to browse"}</b><span>Files are stored in the primary bucket and sent through the same extraction and statement-coverage pipeline.</span>
    </button>
    {uploadState && !uploading ? <Callout tone="acc">{uploadState}</Callout> : null}
    {manualMonths.length ? <div className="bank-coverage-chips">{manualMonths.map((month) => <CellChip key={month} tone="acc">{month}</CellChip>)}</div> : null}
    {manualMonths.length && !banks?.manual_override ? <div className="manual-bank-override"><Input value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Why uploaded statements are sufficient for this file" /><Btn variant="pri" disabled={overrideReason.trim().length < 8 || override.isPending} onClick={() => override.mutate()}><Icon name="check" size={14} />Approve manual evidence</Btn></div> : null}
    {banks?.manual_override ? <Callout tone="acc" icon={<Icon name="check" size={16} />}>Plaid requirement overridden with reviewed statement evidence. {banks.manual_override_reason}</Callout> : null}
    <div className="bank-connection-list">{connected.map((item) => <div key={item.id} className="bank-connection-row"><span className="bank-connection-icon"><Icon name="building" size={17} /></span><div className="grow trunc"><Row><b className="trunc">{item.institution_name || "Connected institution"}</b>{item.is_primary_operating ? <CellChip tone="acc">Primary operating</CellChip> : null}<CellChip tone={item.status === "active" ? "ok" : item.error ? "bad" : "warn"}>{item.status}</CellChip></Row><Sub>{item.accounts_label || "Accounts connected"} · {item.statement_months.length ? `${item.statement_months.length} months available` : "Statements syncing"} · refreshed {when(item.last_pulled_at)}</Sub></div></div>)}{!connected.length && !manualMonths.length ? <div className="empty">No bank evidence has been received.</div> : null}</div>
    {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
  </section>;
}
