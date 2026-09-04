"use client";

// Dealer-partner ("broker") portal: start dealer AI-intake applications on
// behalf of your own clients, chat/upload/run-review on them, and leave
// internal notes with the underwriting team. Curated subset of the admin
// "AI Underwriter Leads" cockpit — no credit-pull, program-fit, vendor-email,
// exports, or client-thread reply here; those stay admin-only. Every fetch in
// this file targets /broker/ai-underwriter-leads* only, by construction.
//
// Styling only: migrated off the inline `t.*` token objects onto the plain-CSS
// design system. The outcome board is `.kcol` / `.kcard` — the kanban column
// and tile the sheet already carries for /pipeline — so a dealer partner's
// board and an operator's board are visibly the same object. Behaviour,
// endpoints, the DEALER_PARTNER gate and both deep links are unchanged.

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Btn,
  Callout,
  Card,
  CellChip,
  Field,
  Input,
  PageHeader,
  Select,
  StatusLine,
  type ChipTone,
} from "@/components/ds";
import { Modal } from "@/components/design-system/Modal";
import { Tabs, type TabOption } from "@/components/design-system/Tabs";
import { IconButton } from "@/components/design-system/IconButton";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { useUI } from "@/store/ui";
import { ApiError } from "@/lib/api";
import { Role } from "@/lib/enums.generated";
import { useCurrentUser } from "@/hooks/useApi";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { LeadCockpit, type LeadCockpitAdapter } from "@/components/admin/LeadCockpit";
import { RunReviewDialog, type ReviewProgress } from "@/components/admin/RunReviewDialog";
import { LeadNotesPanel, type LeadNote } from "@/components/broker/LeadNotesPanel";
import { PartnerProductionPackageTab } from "@/components/broker/PartnerProductionPackageTab";
import type { IntakeResponse } from "@/lib/intake";
import { validPhone } from "@/lib/formCoerce";

type LeadRow = {
  id: string;
  // Partner leads are dealer-variant by construction.
  variant?: string;
  bucket_id: string;
  bucket_name: string;
  full_name: string;
  email: string;
  phone?: string | null;
  business_name?: string | null;
  status: string;
  outcome_status: string;
  probability_status?: string | null;
  one_next_step?: string | null;
  file_count: number;
  missing_required_count: number;
  updated_at: string;
  channel_unread_count?: number;
};

type LeadPage = { items: LeadRow[]; total: number; limit: number; offset: number };

// Files & Review | Messages | Production package (dealer-variant leads only).
type DetailTab = "files" | "messages" | "production";

function isDealerVariant(variant?: string | null): boolean {
  // Partner-created leads carry no other variant; a missing value is treated as dealer.
  return !variant || variant === "dealer_gatekeeper_v1";
}

type RequestedDoc = { id: string; name: string; description?: string | null; required: boolean; status: string };
type UploadedFile = {
  id: string;
  requested_document_id?: string | null;
  parent_zip_file_id?: string | null;
  zip_entry_path?: string | null;
  file_name: string;
  content_type: string;
  size_bytes: number;
  status: string;
  created_at: string;
};

type LeadDetail = {
  intake: LeadRow & {
    loan_purpose?: string | null;
    result_snapshot?: Record<string, unknown> | null;
  };
  requested_documents: RequestedDoc[];
  files: UploadedFile[];
  latest_review?: { status: string; result?: Record<string, unknown> | null; error?: string | null } | null;
  messages?: Array<{ id: string; role: string; content: string; created_at: string }>;
  notes?: LeadNote[];
};

type CreateLeadPayload = {
  full_name: string;
  email: string;
  phone: string;
  business_name?: string;
  notify_client: boolean;
  preferred_language: "en" | "es";
};

const OUTCOME_COLUMNS: Array<{ key: "submitted" | "closed" | "denied"; label: string }> = [
  { key: "submitted", label: "Submitted" },
  { key: "closed", label: "Closed" },
  { key: "denied", label: "Denied" },
];

// Mirrors the program titles on /broker/programs -- keyed by the same slug
// passed via ?program=. Purely a display label for the create-lead modal's
// contextual note; BrokerLeadCreate has no program field to actually
// persist this against yet (see broker/programs/page.tsx's header comment).
const PROGRAM_TITLES: Record<string, string> = {
  sba: "SBA 7(a) / 504 / Express",
  "working-capital": "Dealer Working Capital Facility",
  floorplan: "Dealer Floorplan / Dealer LOC",
  "real-estate-backed": "Real Estate Backed Dealer Capital",
  "reinsurance-backed": "Reinsurance-Backed Financing",
  "bridge-private-credit": "Bridge / Private Credit Refinance",
};

// Relative "time ago" for lead cards — banking dashboards always show recency.
function timeAgo(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

// Outcome accent: a lifecycle state maps to one chip tone, and the column's
// stripe reads the matching CSS variable. One mapping, two consumers — the
// stripe and the pill can no longer disagree about what "denied" looks like.
function outcomeTone(key: string): ChipTone {
  if (key === "closed" || key === "funded") return "ok";
  if (key === "denied") return "bad";
  return "mut";
}
const TONE_VAR: Record<ChipTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  bad: "var(--danger)",
  mut: "var(--muted)",
  acc: "var(--accent)",
  gold: "var(--gold)",
  pet: "var(--petrol)",
};

export default function BrokerAIUnderwriterLeadsPage() {
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const sidebarWidth = sidebarCollapsed ? 68 : 232;

  const authedFetch = useAuthedFetch();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const searchParams = useSearchParams();

  const [rows, setRows] = useState<LeadRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [rerunOpen, setRerunOpen] = useState(false);
  const [notesPosting, setNotesPosting] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("files");
  const [programLabel, setProgramLabel] = useState<string | null>(null);
  const [deletionBusy, setDeletionBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  // Coming from a "Start" button on /broker/programs -- auto-open the
  // create-lead modal with a contextual note naming the program. No
  // fabricated backend field: this is display-only, not persisted.
  useEffect(() => {
    const slug = searchParams.get("program");
    if (slug && PROGRAM_TITLES[slug]) {
      setProgramLabel(PROGRAM_TITLES[slug]);
      setCreateOpen(true);
    }
  }, [searchParams]);

  // Deep link from the global Messages inbox: ?lead=<id>&tab=messages opens
  // that lead straight on its Messages tab (files one click away).
  useEffect(() => {
    const leadId = searchParams.get("lead");
    if (!leadId) return;
    const tab = searchParams.get("tab") === "messages" ? "messages" : "files";
    void openLead(leadId, tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
    return authedFetch<T>(path, init);
  }

  async function loadLeads() {
    setLoading(true);
    setNotice("");
    try {
      const data = await call<LeadPage>("/broker/ai-underwriter-leads?limit=100&offset=0");
      setRows(data.items);
      setTotal(data.total);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Leads are unavailable.");
    } finally {
      setLoading(false);
      setLoaded(true);
    }
  }

  async function openLead(id: string, initialTab: DetailTab = "files") {
    setSelectedId(id);
    setDetailTab(initialTab);
    setDetailLoading(true);
    setNotice("");
    if (initialTab === "messages") void markMessagesSeen(id);
    try {
      const data = await call<LeadDetail>(`/broker/ai-underwriter-leads/${id}`);
      setDetail(data);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Lead detail is unavailable.");
    } finally {
      setDetailLoading(false);
    }
  }

  // Opening the Messages tab clears this lead's unread badge (server + local).
  async function markMessagesSeen(id: string) {
    try {
      await call(`/broker/ai-underwriter-leads/${id}/messages/seen`, { method: "POST" });
      setRows((current) => current.map((r) => (r.id === id ? { ...r, channel_unread_count: 0 } : r)));
    } catch {
      // Non-fatal — the badge just stays until the next load.
    }
  }

  function openDetailTab(tab: DetailTab) {
    setDetailTab(tab);
    if (tab === "messages" && selectedId) void markMessagesSeen(selectedId);
  }

  function closeLead() {
    setSelectedId(null);
    setDetail(null);
    setDetailTab("files");
    loadLeads().catch(() => undefined);
  }

  async function refreshSelectedLead() {
    if (selectedId) await openLead(selectedId);
  }

  async function createLead(payload: CreateLeadPayload) {
    setCreating(true);
    setNotice("");
    try {
      const res = await call<LeadDetail>("/broker/ai-underwriter-leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setCreateOpen(false);
      setProgramLabel(null);
      await loadLeads();
      await openLead(res.intake.id);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const body = (error.body as { detail?: { intake_id?: string; message?: string } } | undefined)?.detail;
        if (body?.intake_id) {
          setCreateOpen(false);
          setNotice(body.message || "An active lead already exists for this email — opening it.");
          await openLead(body.intake_id);
          return;
        }
      }
      setNotice(error instanceof Error ? error.message : "Could not create the lead.");
    } finally {
      setCreating(false);
    }
  }

  async function postNote(content: string, imageIds: string[] = []) {
    if (!selectedId) return;
    setNotesPosting(true);
    setNotesError(null);
    try {
      await call(`/broker/ai-underwriter-leads/${selectedId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, image_ids: imageIds }),
      });
      await refreshSelectedLead();
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Could not post the note.");
    } finally {
      setNotesPosting(false);
    }
  }

  function openRerun() {
    if (selectedId) setRerunOpen(true);
  }

  async function requestDeletion() {
    if (!selectedId) return;
    setConfirmDeleteOpen(true);
  }

  async function performDeletion() {
    if (!selectedId) return;
    setDeletionBusy(true);
    try {
      await call(`/broker/ai-underwriter-leads/${selectedId}/request-deletion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: null }),
      });
      // The lead vanishes from this board once flagged — close and reload.
      closeLead();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not flag this lead for deletion.");
    } finally {
      setDeletionBusy(false);
      setConfirmDeleteOpen(false);
    }
  }

  async function startRerun(): Promise<{ review_id: string }> {
    if (!selectedId) throw new Error("No lead selected.");
    return call<{ review_id: string }>(`/broker/ai-underwriter-leads/${selectedId}/run-review`, { method: "POST" });
  }

  async function pollRerun(reviewId: string) {
    if (!selectedId) throw new Error("No lead selected.");
    return call<ReviewProgress>(`/broker/ai-underwriter-leads/${selectedId}/review-progress?review_id=${reviewId}`);
  }

  async function onRerunDone(completed: boolean) {
    if (completed) {
      await refreshSelectedLead();
      await loadLeads();
      setNotice("AI review re-run complete.");
    }
  }

  const cockpitResponse = useMemo<IntakeResponse | null>(() => {
    if (!detail) return null;
    return {
      token: null,
      session_token: null,
      intake: {
        id: detail.intake.id,
        bucket_id: detail.intake.bucket_id,
        full_name: detail.intake.full_name,
        email: detail.intake.email,
        phone: detail.intake.phone ?? null,
        business_name: detail.intake.business_name ?? null,
        loan_purpose: detail.intake.loan_purpose ?? null,
        status: detail.intake.status,
        result_snapshot: detail.intake.result_snapshot ?? null,
      },
      requested_documents: detail.requested_documents,
      files: detail.files,
      latest_review: detail.latest_review ?? null,
      messages: detail.messages,
      assistant_message: "",
      widget: null,
    } as unknown as IntakeResponse;
  }, [detail]);

  const cockpitAdapter = useMemo<LeadCockpitAdapter | null>(() => {
    if (!selectedId) return null;
    const base = `/broker/ai-underwriter-leads/${selectedId}`;
    const post = <T,>(path: string, body?: unknown) =>
      call<T>(`${base}${path}`, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
    return {
      sendChat: (message: string) => post<IntakeResponse>("/chat", { message }),
      uploadInit: (payload) => post("/files/upload-init", payload),
      uploadComplete: async (fileId: string) => {
        await post("/files/complete", { file_id: fileId });
      },
      runReview: () => post<IntakeResponse>("/run-review"),
      reload: () => call<IntakeResponse>(base),
      // Not offered to dealer partners — the broker page never renders a UI
      // element that would call these, so throwing is safe (never invoked).
      loadClientThread: () => {
        throw new Error("Client thread is not available in the broker portal.");
      },
      replyClientThread: () => {
        throw new Error("Client thread is not available in the broker portal.");
      },
      // Broker leads are always dealer-variant (create_broker_ai_lead never
      // offers a real-estate path), so these are unconditional here.
      requestPfs: async (ownerName?: string) => { await post("/request-pfs", { owner_name: ownerName || null }); },
      requestDebtSchedule: async () => { await post("/request-debt-schedule"); },
      submitPfs: async (payload) => { await post("/requested-documents/pfs", payload); },
      submitDebtSchedule: async (payload) => { await post("/requested-documents/debt-schedule", payload); },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (meLoading) {
    return (
      <Card>
        <span className="sub">Loading…</span>
      </Card>
    );
  }
  if (me && me.role !== Role.DEALER_PARTNER) {
    return <Card>This page is only available to dealer partner accounts.</Card>;
  }
  if (!loaded && !loading) {
    loadLeads().catch(() => undefined);
  }

  const columns = OUTCOME_COLUMNS.map((col) => ({
    ...col,
    rows: rows.filter((r) => r.outcome_status === col.key),
  }));

  const selectedUnread = rows.find((r) => r.id === selectedId)?.channel_unread_count ?? 0;

  // Files & Review | Messages | Production package. The third tab is the
  // stage-one Production Package on the partner's own lead: the partner fills
  // and sends it, the desk picks the sponsor. Dealer-variant leads only.
  const detailTabOptions: TabOption<DetailTab>[] = [
    { id: "files", label: "Files & Review" },
    {
      id: "messages",
      label: "Messages",
      badge: selectedUnread > 0 ? <span className="cnt sm">{selectedUnread}</span> : undefined,
    },
    ...(isDealerVariant(detail?.intake.variant) ? [{ id: "production" as const, label: "Production package" }] : []),
  ];

  return (
    <div className="grid">
      <PageHeader
        title="My Leads"
        lede={`${total} leads on file`}
        actions={
          <Btn variant="pri" onClick={() => setCreateOpen(true)}>
            New lead
          </Btn>
        }
      />

      {notice ? <Callout tone="acc">{notice}</Callout> : null}

      {/* Bespoke track: exactly three lifecycle columns, never a reflowing
          auto-fit. `.grid` owns display + gap; the template is the one thing
          it cannot own. Not `.kanban` — that column set is six wide. */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {columns.map((col) => {
          const tone = outcomeTone(col.key);
          return (
            <div key={col.key} className="kcol">
              <div className="lbl">
                {/* `.kcol > .lbl` is a space-between flex row, so the dot and
                    the label have to travel together as one child. */}
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  {/* Data-derived: the dot takes the colour of this column's
                      lifecycle tone, so it cannot be a fixed class. */}
                  <span className="repdot" style={{ background: TONE_VAR[tone] }} />
                  {col.label}
                </span>
                <CellChip tone={tone}>{col.rows.length}</CellChip>
              </div>
              {/* Plain block, not `.grid`: `.kcard + .kcard` carries the
                  stacking gap and a grid container would double it. */}
              <div>
                {col.rows.length === 0 ? (
                  <span className="sub">No leads here yet.</span>
                ) : (
                  col.rows.map((row) => {
                    const missing = row.missing_required_count > 0;
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => openLead(row.id)}
                        className="kcard btnreset"
                        // `.kcard` owns surface, border, radius, padding,
                        // shadow and cursor; `.btnreset` owns the box and type
                        // a <button> would otherwise impose. What is left is
                        // this tile's own stack and the stripe's positioning
                        // context.
                        style={{ position: "relative", display: "grid", gap: 6 }}
                      >
                        {/* Left status stripe. Data-derived colour; it overlays
                            `.kcard`'s own left padding so no padding is
                            declared twice. */}
                        <span
                          style={{
                            position: "absolute",
                            left: 0,
                            top: 8,
                            bottom: 8,
                            width: 3,
                            borderRadius: 999,
                            background: TONE_VAR[tone],
                          }}
                        />
                        {/* Bespoke: name and recency share a baseline and must
                            never wrap onto two lines — `.row` wraps and
                            centres, which is the wrong shape here. */}
                        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                          <b className="trunc">{row.business_name || row.full_name}</b>
                          <span className="sub" style={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                            {timeAgo(row.updated_at)}
                          </span>
                        </div>
                        <span className="sub trunc">
                          {row.full_name} · {row.email}
                        </span>
                        <div className="row">
                          <CellChip tone="mut">
                            <span className="num">{row.file_count}</span>&nbsp;files
                          </CellChip>
                          {missing ? (
                            <CellChip tone="warn">
                              <span className="num">{row.missing_required_count}</span>&nbsp;missing
                            </CellChip>
                          ) : (
                            <CellChip tone="ok">Complete</CellChip>
                          )}
                        </div>
                        {/* A sentence, not a chip: `.cellchip` is nowrap inside
                            an overflow-hidden tile and would clip this. */}
                        <span className="sub" style={{ lineHeight: 1.4 }}>
                          {row.probability_status || row.one_next_step || "Awaiting AI screen"}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        open={!!selectedId}
        onClose={closeLead}
        size="stage"
        insetLeft={sidebarWidth}
        icon="layers"
        title={detail?.intake.business_name || detail?.intake.full_name || "Lead"}
        headerAccessory={
          detail ? (
            <div className="row">
              <CellChip tone={outcomeTone(detail.intake.outcome_status)}>
                {detail.intake.outcome_status}
              </CellChip>
              <IconButton
                name="trash"
                label="Request deletion"
                tone="danger"
                disabled={deletionBusy}
                onClick={requestDeletion}
              />
            </div>
          ) : null
        }
        bodyStyle={{ display: "flex", flexDirection: "column" }}
      >
        {selectedId ? (
          detailLoading || !cockpitResponse || !cockpitAdapter ? (
            <div className="sub" style={{ padding: 24 }}>Loading lead…</div>
          ) : (
            // Bespoke: a tab strip over a single flexible pane, filling the
            // stage modal. Nothing in the twelve-column vocabulary describes
            // "auto 1fr, full height, allowed to shrink".
            <div style={{ display: "grid", gridTemplateRows: "auto 1fr", gap: 12, height: "100%", padding: 16, minHeight: 0 }}>
              <Tabs<DetailTab>
                variant="underline"
                value={detailTab}
                onChange={openDetailTab}
                options={detailTabOptions}
              />
              {/* Both panels stay mounted (toggled via display) so the cockpit's
                  in-progress chat/uploads survive switching to Messages. */}
              <div style={{ minHeight: 0 }}>
                <div style={{ height: "100%", minHeight: 0, overflow: "hidden", display: detailTab === "files" ? "block" : "none" }}>
                  <LeadCockpit
                    response={cockpitResponse}
                    adapter={cockpitAdapter}
                    initialMessages={detail?.messages}
                    onResponse={(r) => {
                      // Keep detail in sync with live cockpit turns so any
                      // remount (reopen) seeds the full thread.
                      setDetail((current) =>
                        current
                          ? {
                              ...current,
                              messages: r.messages ?? current.messages,
                              files: r.files ?? current.files,
                              requested_documents: r.requested_documents ?? current.requested_documents,
                              latest_review: r.latest_review ?? current.latest_review,
                              intake: { ...current.intake, result_snapshot: r.intake?.result_snapshot ?? current.intake.result_snapshot },
                            }
                          : current,
                      );
                    }}
                    onRequestRerun={openRerun}
                  />
                </div>
                <div style={{ height: "100%", minHeight: 0, overflow: "hidden", display: detailTab === "messages" ? "block" : "none" }}>
                  <LeadNotesPanel notes={detail?.notes ?? []} onPost={postNote} posting={notesPosting} error={notesError} />
                </div>
                {detailTab === "production" && detail ? (
                  <div style={{ height: "100%", minHeight: 0, overflow: "auto" }}>
                    <PartnerProductionPackageTab intakeId={detail.intake.id} />
                  </div>
                ) : null}
              </div>
            </div>
          )
        ) : null}
      </Modal>

      <RunReviewDialog open={rerunOpen} onClose={() => setRerunOpen(false)} onStart={startRerun} poll={pollRerun} onDone={onRerunDone} />

      <ConfirmDialog
        open={confirmDeleteOpen}
        tone="danger"
        busy={deletionBusy}
        title="Flag this lead for deletion?"
        body="This does not delete anything yet — a super admin must confirm before it's removed from the board."
        confirmLabel="Flag for deletion"
        cancelLabel="Keep lead"
        onConfirm={performDeletion}
        onClose={() => setConfirmDeleteOpen(false)}
      />

      {createOpen ? (
        <CreateBrokerLeadModal
          onClose={() => { setCreateOpen(false); setProgramLabel(null); }}
          onCreate={createLead}
          creating={creating}
          programLabel={programLabel}
        />
      ) : null}
    </div>
  );
}

function CreateBrokerLeadModal({
  onClose,
  onCreate,
  creating,
  programLabel,
}: {
  onClose: () => void;
  onCreate: (payload: CreateLeadPayload) => void | Promise<void>;
  creating: boolean;
  programLabel?: string | null;
}) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [notifyClient, setNotifyClient] = useState(false);
  const [preferredLanguage, setPreferredLanguage] = useState<"en" | "es">("en");
  const [error, setError] = useState("");

  function submit() {
    if (!fullName.trim()) { setError("Client name is required."); return; }
    if (!email.trim() || !email.includes("@")) { setError("A valid client email is required."); return; }
    if (!phone.trim()) { setError("A client mobile number is required."); return; }
    if (!validPhone(phone)) { setError("That number does not look complete. Enter a 10-digit US mobile, or include the country code for an international number."); return; }
    setError("");
    onCreate({
      full_name: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      business_name: businessName.trim() || undefined,
      notify_client: notifyClient,
      preferred_language: preferredLanguage,
    });
  }

  return (
    <Modal open onClose={onClose} title="Create a new lead" size="md">
      <div className="grid g10">
        <p className="sub" style={{ margin: 0, lineHeight: 1.45 }}>
          Create a lead on behalf of your client and start underwriting now. Your client can log in later with this
          email — they receive a secure code by email.
        </p>

        {programLabel ? (
          <Callout tone="acc">
            Starting a lead for: <b>{programLabel}</b>
          </Callout>
        ) : null}

        <div className="fldgrid two">
          <Field label="Client full name *">
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Jane Doe" />
          </Field>
          <Field label="Client email *">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@example.com" />
          </Field>
          <Field label="Client mobile *">
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(973) 555-0148" />
          </Field>
          <Field label="Business name">
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Dealership / business" />
          </Field>
          <Field label="Preferred language (client)">
            <Select value={preferredLanguage} onChange={(e) => setPreferredLanguage(e.target.value as "en" | "es")}>
              <option value="en">English</option>
              <option value="es">Español (Spanish)</option>
            </Select>
          </Field>
        </div>

        {/* `.row` owns the flex geometry; cursor is the one thing it does not. */}
        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={notifyClient} onChange={(e) => setNotifyClient(e.target.checked)} />
          Email the client a secure login/resume link now
        </label>

        {error ? <StatusLine tone="bad">{error}</StatusLine> : null}

        <div className="row end">
          <Btn onClick={onClose} disabled={creating}>Cancel</Btn>
          <Btn variant="pri" onClick={submit} disabled={creating}>
            {creating ? "Creating…" : "Create lead"}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}
