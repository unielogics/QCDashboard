"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useClientAccessDetail,
  useClientAccessDirectory,
  useInviteClientAccess,
  useResendClientInvite,
  useRevokeClientSessions,
  useUpdateClientAccess,
} from "@/hooks/useApi";
import type {
  AccessMutationResult,
  ClientAccessDirectoryRow,
  ProductAccountType,
} from "@/lib/types";
import { Btn, CellChip, Input, Panel, Select, Table, Td, Tr, cx, type ChipTone } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";

type ReviewAction = "save" | "resend" | "sessions" | null;

const LOGIN_TONE: Record<ClientAccessDirectoryRow["login_state"], ChipTone> = {
  no_login: "mut",
  invited: "warn",
  active: "ok",
  suspended: "bad",
  invite_failed: "bad",
};

const LOGIN_LABEL: Record<ClientAccessDirectoryRow["login_state"], string> = {
  no_login: "No login",
  invited: "Invited",
  active: "Active",
  suspended: "Suspended",
  invite_failed: "Invite failed",
};

export function ClientAccessSection({ initialClientId }: { initialClientId?: string | null }) {
  const [search, setSearch] = useState(initialClientId ?? "");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [loginFilter, setLoginFilter] = useState("all");
  const [productFilter, setProductFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<ClientAccessDirectoryRow | null>(null);
  const directory = useClientAccessDirectory({
    q: search,
    source: sourceFilter,
    login_state: loginFilter,
    account_type: productFilter,
    page,
    page_size: 50,
  });
  const totalPages = Math.max(1, Math.ceil((directory.data?.total ?? 0) / (directory.data?.page_size ?? 50)));

  useEffect(() => {
    if (!initialClientId || selected || !directory.data?.items.length) return;
    const match = directory.data.items.find((row) => row.client_id === initialClientId);
    if (match) setSelected(match);
  }, [directory.data?.items, initialClientId, selected]);

  return (
    <div className="grid">
      <Panel
        title="Client access"
        sub={`${directory.data?.total ?? 0} public clients and intake leads`}
        actions={(
          <div className="row client-access-filters">
            <Input
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search person, business, email, phone, QC or file ID"
              aria-label="Search client access"
            />
            <Select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setPage(1); }} aria-label="Origin">
              <option value="all">All origins</option>
              {(directory.data?.sources ?? []).map((source) => <option value={source} key={source}>{labelize(source)}</option>)}
            </Select>
            <Select value={loginFilter} onChange={(event) => { setLoginFilter(event.target.value); setPage(1); }} aria-label="Login status">
              <option value="all">All login states</option>
              <option value="no_login">No login</option>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="invite_failed">Invite failed</option>
            </Select>
            <Select value={productFilter} onChange={(event) => { setProductFilter(event.target.value); setPage(1); }} aria-label="Account type">
              <option value="all">All account types</option>
              <option value="funding">Funding only</option>
              <option value="audit">Audit only</option>
              <option value="both">Funding + Audit</option>
              <option value="none">No access</option>
            </Select>
          </div>
        )}
        noPad
      >
        <Table
          caption="Client access directory"
          cols={[
            { label: "Client" },
            { label: "Business" },
            { label: "Contact", width: 210 },
            { label: "Origin", width: 130 },
            { label: "Login", width: 110 },
            { label: "Account types", width: 170 },
            { label: "Files", width: 62, align: "r" },
            { label: "Last active", width: 126 },
            { label: "Status", width: 112 },
            { label: "", width: 116 },
          ]}
        >
          {(directory.data?.items ?? []).map((row) => (
            <Tr key={`${row.subject_kind}:${row.subject_id}`} onClick={() => setSelected(row)}>
              <Td>
                <b>{row.client_name}</b>
                <div className="sub">
                  {row.subject_kind === "intake" ? "Public intake" : row.subject_kind === "user" ? "Audit login" : `Client · ${shortId(row.subject_id)}`}
                </div>
              </Td>
              <Td>
                <b>{row.businesses[0] || "—"}</b>
                {row.businesses.length > 1 ? <div className="sub">+{row.businesses.length - 1} more</div> : null}
              </Td>
              <Td>
                <span className="client-access-contact">{row.email || "No email"}</span>
                <span className="sub">{row.phone || "No phone"}</span>
              </Td>
              <Td><span className="sub">{labelize(row.origin)}</span></Td>
              <Td><CellChip tone={LOGIN_TONE[row.login_state]}>{LOGIN_LABEL[row.login_state]}</CellChip></Td>
              <Td><AccountTypeBadges products={row.account_types} /></Td>
              <Td align="r"><span className="num">{row.file_count}</span></Td>
              <Td><span className="sub">{formatDate(row.last_active_at)}</span></Td>
              <Td><CellChip tone={row.account_status === "suspended" ? "bad" : "mut"}>{labelize(row.status)}</CellChip></Td>
              <Td>
                <Btn size="sm" onClick={(event) => { event.stopPropagation(); setSelected(row); }}>
                  Manage access
                </Btn>
              </Td>
            </Tr>
          ))}
          {!directory.isLoading && (directory.data?.items.length ?? 0) === 0 ? (
            <tr><td colSpan={10} className="sub" style={{ textAlign: "center", padding: 28 }}>No client access records match these filters.</td></tr>
          ) : null}
        </Table>
        {directory.isLoading ? <div className="panel-b sub">Loading client access…</div> : null}
        {directory.error ? <div className="panel-b"><CellChip tone="bad">{directory.error.message}</CellChip></div> : null}
        {directory.data && directory.data.total > 0 ? (
          <div className="panel-b row client-access-pagination">
            <span className="sub">
              Page {directory.data.page} of {totalPages} · {directory.data.total} records
            </span>
            <span className="grow" />
            <Btn size="sm" disabled={page <= 1 || directory.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</Btn>
            <Btn size="sm" disabled={page >= totalPages || directory.isFetching} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</Btn>
          </div>
        ) : null}
      </Panel>
      <ClientAccessDrawer row={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function ClientAccessDrawer({ row, onClose }: { row: ClientAccessDirectoryRow | null; onClose: () => void }) {
  const detail = useClientAccessDetail(row?.subject_kind ?? null, row?.subject_id ?? null);
  const invite = useInviteClientAccess();
  const update = useUpdateClientAccess();
  const resend = useResendClientInvite();
  const revokeSessions = useRevokeClientSessions();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [products, setProducts] = useState<ProductAccountType[]>([]);
  const [auditProfiles, setAuditProfiles] = useState<string[]>([]);
  const [suspended, setSuspended] = useState(false);
  const [reason, setReason] = useState("");
  const [reviewAction, setReviewAction] = useState<ReviewAction>(null);
  const [result, setResult] = useState<AccessMutationResult | null>(null);

  useEffect(() => {
    const accessDetail = detail.data;
    const subject = accessDetail?.subject;
    if (!accessDetail || !subject) return;
    setEmail(subject.email ?? "");
    setName(subject.client_name);
    setProducts(subject.account_types);
    setSuspended(subject.login_state === "suspended");
    setAuditProfiles(accessDetail.audit_scopes.filter((scope) => scope.enabled_for_user).map((scope) => scope.profile_id));
    setReason("");
    setReviewAction(null);
    setResult(null);
  }, [detail.data]);

  const hasAudit = products.includes("audit");
  const isNew = !row?.user_id;
  const busy = invite.isPending || update.isPending || resend.isPending || revokeSessions.isPending;
  const mutationError = invite.error ?? update.error ?? resend.error ?? revokeSessions.error;

  const toggleProduct = (product: ProductAccountType) => {
    setProducts((current) => current.includes(product) ? current.filter((item) => item !== product) : [...current, product]);
    if (product === "audit" && hasAudit) setAuditProfiles([]);
  };

  const canReview = reason.trim().length >= 3
    && (suspended || products.length > 0)
    && (!hasAudit || auditProfiles.length > 0)
    && (!isNew || email.includes("@"));

  async function confirm() {
    if (!row || !reviewAction) return;
    let response: AccessMutationResult;
    if (reviewAction === "resend") {
      if (!row.user_id) return;
      response = await resend.mutateAsync({ userId: row.user_id, reason });
    } else if (reviewAction === "sessions") {
      if (!row.user_id) return;
      response = await revokeSessions.mutateAsync({ userId: row.user_id, reason });
    } else if (isNew) {
      if (row.subject_kind === "user") return;
      response = await invite.mutateAsync({
        subject_kind: row.subject_kind,
        subject_id: row.subject_id,
        email,
        name,
        account_types: products,
        audit_profile_ids: auditProfiles,
        reason,
      });
    } else {
      response = await update.mutateAsync({
        userId: row.user_id as string,
        account_types: products,
        account_status: suspended ? "suspended" : "active",
        audit_profile_ids: auditProfiles,
        reason,
      });
    }
    setResult(response);
  }

  const footer = result ? (
    <><span className="sp" /><Btn variant="pri" onClick={onClose}>Done</Btn></>
  ) : reviewAction ? (
    <>
      <Btn onClick={() => setReviewAction(null)} disabled={busy}>Back</Btn>
      <span className="sp" />
      <Btn variant="pri" onClick={confirm} disabled={busy}>{busy ? "Running…" : actionLabel(reviewAction, isNew, suspended)}</Btn>
    </>
  ) : (
    <>
      <Btn onClick={onClose}>Cancel</Btn>
      <span className="sp" />
      <Btn variant="pri" onClick={() => setReviewAction("save")} disabled={!canReview}>Review changes</Btn>
    </>
  );

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={result ? "Access updated" : reviewAction ? "Review before running" : "Manage client access"}
      sub={row ? `${row.client_name} · ${row.email || "No login"}` : undefined}
      width="lg"
      closeOnBackdrop={!busy}
      bodyClass="client-access-drawer"
      footer={footer}
    >
      {detail.isLoading ? <div className="sub">Loading access record…</div> : null}
      {detail.error ? <CellChip tone="bad">{detail.error.message}</CellChip> : null}
      {detail.data && !reviewAction && !result ? (
        <div className="grid">
          <div className="client-access-summary">
            <div><span className="lbl">Login</span><CellChip tone={LOGIN_TONE[detail.data.subject.login_state]}>{LOGIN_LABEL[detail.data.subject.login_state]}</CellChip></div>
            <div><span className="lbl">Last active</span><b>{formatDate(detail.data.subject.last_active_at)}</b></div>
            <div><span className="lbl">Files</span><b className="num">{detail.data.subject.file_count}</b></div>
            <div><span className="lbl">Origin</span><b>{labelize(detail.data.subject.origin)}</b></div>
          </div>

          <Panel title="Login identity">
            <div className="client-access-form-grid">
              <label><span className="lbl">Name</span><Input value={name} onChange={(event) => setName(event.target.value)} disabled={!isNew} /></label>
              <label><span className="lbl">Email</span><Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} disabled={!isNew} /></label>
            </div>
          </Panel>

          <Panel title="Account types" sub="One login can enter either or both products.">
            <div className="client-access-product-grid">
              <ProductToggle
                checked={products.includes("funding")}
                onChange={() => toggleProduct("funding")}
                title="Funding"
                detail="Funding files and client document workflows"
              />
              <ProductToggle
                checked={products.includes("audit")}
                onChange={() => toggleProduct("audit")}
                title="Audit"
                detail="Only the business files selected below"
              />
            </div>
          </Panel>

          {hasAudit ? (
            <Panel title="Audit business access" sub={`${auditProfiles.length} selected`}>
              <div className="client-access-scope-list">
                {detail.data.audit_scopes.map((scope) => (
                  <label key={scope.profile_id} className={cx("itemrow", auditProfiles.includes(scope.profile_id) && "tone-acc")}>
                    <input
                      type="checkbox"
                      checked={auditProfiles.includes(scope.profile_id)}
                      onChange={() => setAuditProfiles((current) => current.includes(scope.profile_id) ? current.filter((id) => id !== scope.profile_id) : [...current, scope.profile_id])}
                    />
                    <span className="grow"><b>{scope.business_name}</b><span className="sub">{labelize(scope.vertical)} · {scope.source_kind} · {shortId(scope.profile_id)}</span></span>
                    {scope.enabled_for_user ? <CellChip tone="ok">Assigned</CellChip> : null}
                  </label>
                ))}
                {detail.data.audit_scopes.length === 0 ? <div className="sub">No application profile is available for Audit access.</div> : null}
              </div>
            </Panel>
          ) : null}

          {!isNew ? (
            <Panel title="Login control">
              <label className="itemrow">
                <input type="checkbox" checked={suspended} onChange={(event) => setSuspended(event.target.checked)} />
                <span className="grow"><b>Suspend login</b><span className="sub">Files and history remain intact; active sessions are revoked.</span></span>
                <CellChip tone={suspended ? "bad" : "ok"}>{suspended ? "Will suspend" : "Active"}</CellChip>
              </label>
            </Panel>
          ) : null}

          <label><span className="lbl">Reason for change</span><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Required for the access audit" /></label>

          {!isNew ? (
            <div className="row">
              {detail.data.subject.login_state === "invited" || detail.data.subject.login_state === "invite_failed" ? (
                <Btn size="sm" onClick={() => setReviewAction("resend")} disabled={reason.trim().length < 3}><Icon name="mail" size={13} /> Resend invite</Btn>
              ) : null}
              <Btn size="sm" onClick={() => setReviewAction("sessions")} disabled={reason.trim().length < 3}><Icon name="shield" size={13} /> Revoke sessions</Btn>
            </div>
          ) : null}

          {detail.data.invitation_error ? <div className="statusline c-bad">{detail.data.invitation_error}</div> : null}
          {mutationError ? <div className="statusline c-bad">{mutationError.message}</div> : null}

          <Panel title="Access history" sub={`${detail.data.access_history.length} events`}>
            <div className="client-access-history">
              {detail.data.access_history.map((event) => (
                <div className="itemrow" key={event.id}>
                  <Icon name="shield" size={13} />
                  <span className="grow"><b>{labelize(event.action)}</b><span className="sub">{event.reason || "No reason recorded"}</span></span>
                  <span className="sub">{formatDate(event.created_at, true)}</span>
                </div>
              ))}
              {detail.data.access_history.length === 0 ? <div className="sub">No access changes recorded.</div> : null}
            </div>
          </Panel>
        </div>
      ) : null}

      {reviewAction && !result ? (
        <div className="grid">
          <div className="statusline c-warn"><b>{reviewTitle(reviewAction, isNew, suspended)}</b></div>
          <Panel title="Effects">
            <div className="grid" style={{ gap: 10 }}>
              <ReviewRow label="Actor" value="Current super-admin" />
              <ReviewRow label="Execution" value="Immediately after confirmation" />
              <ReviewRow label="Account" value={products.length ? products.map(labelize).join(" + ") : "No product access"} />
              {hasAudit ? <ReviewRow label="Audit files" value={`${auditProfiles.length} explicitly selected`} /> : null}
              <ReviewRow label="Login" value={suspended ? "Suspend and revoke sessions" : "Active"} />
              <ReviewRow label="Data" value="Files, evidence, messages, and history are preserved" />
              <ReviewRow label="Reason" value={reason} />
            </div>
          </Panel>
          <div className="sub">Product access can be changed later. Audit business assignments remain explicit and are never inferred from names or email addresses.</div>
          {mutationError ? <div className="statusline c-bad">{mutationError.message}</div> : null}
        </div>
      ) : null}

      {result ? (
        <div className="grid">
          <div className="statusline c-ok"><Icon name="check" size={14} /> Access change completed</div>
          <Panel title="Result">
            <div className="grid" style={{ gap: 10 }}>
              <ReviewRow label="Account types" value={result.account_types.length ? result.account_types.map(labelize).join(" + ") : "None"} />
              <ReviewRow label="Status" value={labelize(result.account_status)} />
              <ReviewRow label="Invitation" value={result.invitation_sent ? "Accepted by provider" : "No new invitation sent"} />
              <ReviewRow label="Sessions" value={result.sessions_revoked ? "Revoked" : "No session change"} />
            </div>
          </Panel>
        </div>
      ) : null}
    </Drawer>
  );
}

function ProductToggle({ checked, onChange, title, detail }: { checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label className={cx("client-access-product", checked && "on")}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="grow"><b>{title}</b><span className="sub">{detail}</span></span>
      <CellChip tone={checked ? "ok" : "mut"}>{checked ? "Enabled" : "Off"}</CellChip>
    </label>
  );
}

function AccountTypeBadges({ products }: { products: ProductAccountType[] }) {
  if (!products.length) return <span className="sub">None</span>;
  return <span className="row" style={{ gap: 5 }}>{products.map((product) => <CellChip key={product} tone={product === "audit" ? "pet" : "acc"}>{labelize(product)}</CellChip>)}</span>;
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return <div className="client-access-review-row"><span className="sub">{label}</span><b>{value}</b></div>;
}

function reviewTitle(action: ReviewAction, isNew: boolean, suspended: boolean) {
  if (action === "resend") return "Resend the client invitation";
  if (action === "sessions") return "Revoke all active sessions";
  if (suspended) return "Suspend this login";
  return isNew ? "Create one client login" : "Apply client access changes";
}

function actionLabel(action: ReviewAction, isNew: boolean, suspended: boolean) {
  if (action === "resend") return "Resend invitation";
  if (action === "sessions") return "Revoke sessions";
  if (suspended) return "Suspend login";
  return isNew ? "Create and invite" : "Apply changes";
}

function shortId(value: string) { return value.slice(0, 8).toUpperCase(); }
function labelize(value: string) { return value.replace(/[._-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function formatDate(value: string | null, includeTime = false) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString(undefined, includeTime
    ? { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" });
}
