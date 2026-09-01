"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Btn,
  Card,
  CellChip,
  Field,
  IconBtn,
  Input,
  Kpi,
  KpiRow,
  Lbl,
  Note,
  Panel,
  Row,
  Seg,
  Select,
  Table,
  Tag,
  Td,
  WarnLine,
  type ChipTone,
  type Col,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useBrokers, useClient, useClientActivity, useClientPaymentAuthorizationStatus, useClientSms, useCreditSummary, useCurrentCredit, useCurrentUser, useDocumentsForClient, useEngagement, useLoans, useParsedReport, useRequestPrequalification, useSendIntakeLink, useStartFunding, useUpdateClient, useUpdateClientStage } from "@/hooks/useApi";
import { EmailsBreadcrumbTab } from "@/components/email/EmailsBreadcrumbTab";
import { SmsThreadTab } from "@/components/sms/SmsThreadTab";
import { MultiLoanReassignModal } from "@/components/MultiLoanReassignModal";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { RealtorReadinessCard } from "@/components/RealtorReadinessCard";
import { ClientAIPlanCard } from "@/components/ClientAIPlanCard";
import { CreditReportDetail } from "@/components/CreditReportDetail";
import { ActiveAgentStrip } from "@/components/ActiveAgentStrip";
import { useActiveProfile } from "@/store/role";
import { QC_FMT } from "@/lib/fmt";
import { parseIntStrict } from "@/lib/formCoerce";
import { deriveExperienceMode } from "@/lib/experienceMode";
import { canEditExperienceMode } from "@/lib/experienceModePermissions";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";
import { SmartIntakeModal } from "@/app/pipeline/components/SmartIntakeModal";
import type { Broker, Client, ClientExperienceMode, ClientExperienceModeLockedBy, ClientExperienceModeReason, ClientStage, Document, Loan } from "@/lib/types";

export default function ClientDetailPage() {
  const profile = useActiveProfile();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { data: client } = useClient(id);
  const { data: loans = [] } = useLoans();
  const { data: credit } = useCurrentCredit(id);
  const { data: creditSummary, isLoading: summaryLoading } = useCreditSummary(credit?.id);
  const { data: parsedReport, isLoading: parsedLoading } = useParsedReport(credit?.id);
  const [showFullReport, setShowFullReport] = useState(false);
  const { data: clientDocs = [] } = useDocumentsForClient(id);
  // Per-Client CRM workspace data: engagement returns [] when backend isn't
  // live (graceful empty). Loans for this client are derived from useLoans
  // already loaded above (clientLoans below).
  const { data: engagement = [] } = useEngagement(id);
  // Tracked-email breadcrumbs (email.tracked) for this client — metadata only.
  const { data: clientActivity = [], isLoading: clientActivityLoading } = useClientActivity(id);
  const { data: smsThread = [], isLoading: smsLoading } = useClientSms(id);
  const updateClient = useUpdateClient();
  const requestPrequal = useRequestPrequalification();
  const sendIntakeLink = useSendIntakeLink();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [error, setError] = useState<string | null>(null);
  const [intakeLinkStatus, setIntakeLinkStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [prequalErr, setPrequalErr] = useState<string | null>(null);
  const [chatPickerOpen, setChatPickerOpen] = useState(false);
  // Confirmation modal — shows the handoff packet summary before
  // firing. After fire, the same modal shows the success state with
  // what the Lending AI inherited + the first message it sent.
  const [handoffOpen, setHandoffOpen] = useState(false);
  const [handoffResult, setHandoffResult] = useState<{
    summary: string | null;
    firstQuestion: string | null;
    missingItems: string[];
    lendingThreadId: string | null;
  } | null>(null);

  const onRequestPrequal = async () => {
    if (!id) return;
    setPrequalErr(null);
    try {
      const result = await requestPrequal.mutateAsync(id);
      setHandoffResult({
        summary: result.handoff_summary ?? null,
        firstQuestion: result.first_lending_question ?? null,
        missingItems: result.missing_lending_items ?? [],
        lendingThreadId: result.lending_thread_id ?? null,
      });
    } catch (e) {
      setPrequalErr(e instanceof Error ? e.message : "Failed to hand off lead");
    }
  };

  const canEdit = profile.role !== "client";
  const isInternal = profile.role === "super_admin" || profile.role === "loan_exec";
  // CLIENT-role users can't add a file from inside their own page;
  // every other operator role gets the "+ New file" affordance.
  // Agents (BROKER) see "Ready for Prequalification" instead — that's
  // their controlled handoff to the funding team. Direct loan creation
  // is super-admin / underwriter territory.
  const isAgent = profile.role === "broker";
  const canStartDeal = canEdit && !isAgent;
  const canRequestPrequal = isAgent && client?.stage === "lead";

  useEffect(() => {
    if (client) {
      setDraft({
        name: client.name,
        email: client.email ?? "",
        phone: client.phone ?? "",
        city: client.city ?? "",
        tier: client.tier,
        fico: client.fico,
        language: client.language ?? "",
      });
    }
  }, [client?.id]);

  if (!client) return <div className="sub">Loading…</div>;

  const clientLoans = loans.filter((l) => l.client_id === client.id);
  const exposure = clientLoans.reduce((s, l) => s + Number(l.amount), 0);

  // Any loan is chat-able — broker may want post-funding follow-up too.
  const chatLoans = clientLoans;
  const openLoanChat = (loanId: string) => {
    router.push(`/loans/${loanId}?tab=loan_chat`);
  };
  const onMessageClient = () => {
    if (chatLoans.length === 0) {
      setPrequalErr("No active loan to chat in. Start a file first.");
      return;
    }
    if (chatLoans.length === 1) {
      openLoanChat(chatLoans[0].id);
      return;
    }
    setChatPickerOpen(true);
  };

  const onSendIntakeLink = async () => {
    if (!client) return;
    setIntakeLinkStatus(null);
    try {
      const res = await sendIntakeLink.mutateAsync({ clientId: client.id });
      setIntakeLinkStatus({
        tone: "ok",
        text: `Intake link queued via ${res.sent_via}.`,
      });
    } catch (e) {
      setIntakeLinkStatus({
        tone: "error",
        text: e instanceof Error ? e.message : "Failed to send intake link.",
      });
    }
  };

  const handleSave = async () => {
    setError(null);
    try {
      await updateClient.mutateAsync({
        clientId: client.id,
        name: (draft.name ?? client.name).toString(),
        email: draft.email ?? null,
        phone: draft.phone ?? null,
        city: draft.city ?? null,
        tier: (draft.tier ?? client.tier).toString(),
        fico: draft.fico == null || draft.fico === ("" as unknown as number) ? null : Number(draft.fico),
        language:
          (draft.language ?? client.language ?? "").toString().trim() || null,
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  return (
    <div className="grid">
      <ActiveAgentStrip clientId={client.id} />
      <Card>
        <Row>
          {/* Identity colour comes from the row, so it stays inline. */}
          <div
            style={{
              width: 56, height: 56, borderRadius: 28,
              background: client.avatar_color ?? "var(--petrol)", color: "#fff",
              display: "grid", placeItems: "center",
              fontSize: 22, fontWeight: 800, flexShrink: 0,
            }}
          >
            {client.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="hd"><h1>{client.name}</h1></div>
            <div className="sub">{client.email ?? "—"} · {client.phone ?? "—"} · {client.city ?? "—"}</div>
          </div>
          <Tag>{client.tier}</Tag>
          {canEdit && (
            <Btn
              onClick={() => void onSendIntakeLink()}
              disabled={sendIntakeLink.isPending || (!client.email && !client.phone)}
              title={!client.email && !client.phone ? "Add an email or phone before sending an intake link." : "Send intake link"}
            >
              <Icon name="send" size={12} />
              {sendIntakeLink.isPending ? "Sending…" : "Send intake link"}
            </Btn>
          )}
          {canEdit && chatLoans.length > 0 && (
            <Btn onClick={onMessageClient}>
              <Icon name="chat" size={12} /> Message client
            </Btn>
          )}
          {canStartDeal && (
            <Btn variant="pri" onClick={() => setIntakeOpen(true)}>
              <Icon name="plus" size={12} /> New file
            </Btn>
          )}
          {/* Agent's controlled handoff to the funding team (alembic 0031).
              Click opens a confirmation modal showing the handoff
              packet summary. Confirm fires the endpoint which
              creates a PrequalRequest, builds the Lending Handoff
              Packet, spawns the lending AI thread with the first
              memory-aware message, and drops an AITask in the
              funding queue. The agent doesn't pick a loan program —
              funding does that on review. */}
          {canRequestPrequal && client.lead_promotion_status !== "agent_requested_review" && (
            <Btn variant="pri" onClick={() => setHandoffOpen(true)} disabled={requestPrequal.isPending}>
              <Icon name="bolt" size={12} />
              {requestPrequal.isPending ? "Handing off…" : "Ready for Lending"}
            </Btn>
          )}
          {canRequestPrequal && client.lead_promotion_status === "agent_requested_review" && (
            <CellChip tone="acc">
              <Icon name="check" size={11} /> Funding review requested
            </CellChip>
          )}
          {canEdit && !editing && (
            <Btn onClick={() => setEditing(true)}>
              <Icon name="gear" size={12} /> Edit
            </Btn>
          )}
          <IconBtn aria-label="Close" title="Close" onClick={() => router.push("/clients")}>
            <Icon name="x" size={16} />
          </IconBtn>
        </Row>
        {/* Action feedback moved under the button row: a full sentence does not
            fit in a chip, and these two can both be long server messages. */}
        {prequalErr && <WarnLine className="mt">{prequalErr}</WarnLine>}
        {intakeLinkStatus && (
          intakeLinkStatus.tone === "ok"
            ? <Note>{intakeLinkStatus.text}</Note>
            : <WarnLine className="mt">{intakeLinkStatus.text}</WarnLine>
        )}
      </Card>
      <SmartIntakeModal
        open={intakeOpen}
        onClose={() => setIntakeOpen(false)}
        prefillClient={{
          id: client.id,
          name: client.name,
          email: client.email ?? null,
          phone: client.phone ?? null,
          client_type: client.client_type ?? null,
        }}
      />
      <LoanChatPicker
        open={chatPickerOpen}
        loans={chatLoans}
        onClose={() => setChatPickerOpen(false)}
        onPick={(loanId) => {
          setChatPickerOpen(false);
          openLoanChat(loanId);
        }}
      />
      <LendingHandoffModal
        open={handoffOpen}
        client={client}
        result={handoffResult}
        pending={requestPrequal.isPending}
        error={prequalErr}
        onConfirm={onRequestPrequal}
        onClose={() => {
          setHandoffOpen(false);
          setHandoffResult(null);
          setPrequalErr(null);
        }}
      />

      <ClientStageCard client={client} canEdit={canEdit} clientLoans={clientLoans} />

      {/* Realtor-phase AI Plan card. The Realtor Elara is for
          nurturing pre-funding leads — once the client has any active
          loan, the funding workspace at /loans/[id] is the canonical
          AI surface and this card just shows stale "0% Ready" noise.
          Hide it when the client has active loans so super-admin /
          underwriter views stay focused on funding state. */}
      {clientLoans.some((l) => l.stage !== "funded") ? null : (
        <ClientAIPlanCard clientId={client.id} loanId={null} />
      )}

      {isAgent && (
        <AgentRelationshipWorkspace
          client={client}
          clientLoans={clientLoans}
          docs={clientDocs}
          creditFico={credit?.fico ?? client.fico}
        />
      )}

      {/* Realtor Client Intelligence Profile (alembic 0030). The
          Realtor AI writes this every conversational turn; the card
          surfaces what's known, what's missing, and the AI's next
          best action. Only renders when the AI has populated something. */}
      {client.realtor_profile && client.realtor_profile.client_type !== "unknown" && (
        <RealtorReadinessCard profile={client.realtor_profile} />
      )}

      <AssignedAgentCard client={client} />
      <ExperienceModeCard client={client} />
      {isInternal ? <PaymentAuthorizationCard clientId={client.id} /> : null}

      {editing && canEdit && (
        <Panel title="Edit profile">
          <div className="cg">
            <Field className="s6" label="Name">
              <Input value={(draft.name ?? "") as string} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
            </Field>
            <Field className="s6" label="Email">
              <Input value={(draft.email ?? "") as string} onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))} />
            </Field>
            <Field className="s6" label="Phone">
              <Input value={(draft.phone ?? "") as string} onChange={(e) => setDraft((d) => ({ ...d, phone: e.target.value }))} />
            </Field>
            <Field className="s6" label="City">
              <Input value={(draft.city ?? "") as string} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
            </Field>
            <Field className="s6" label="Tier">
              <Select
                value={(draft.tier ?? "standard") as string}
                onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value }))}
              >
                <option value="standard">Standard</option>
                <option value="Tier I">Tier I</option>
                <option value="Tier II">Tier II</option>
                <option value="Tier III">Tier III</option>
              </Select>
            </Field>
            <Field className="s6" label="FICO (300–850)">
              <Input
                value={draft.fico != null ? String(draft.fico) : ""}
                onChange={(e) => setDraft((d) => ({ ...d, fico: (parseIntStrict(e.target.value) || null) as Client["fico"] }))}
                placeholder="720"
              />
            </Field>
            <Field className="s6" label="Preferred language">
              <Select
                value={(draft.language ?? "") as string}
                onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
              >
                <option value="">— Not set —</option>
                <option value="English">English</option>
                <option value="Spanish">Spanish</option>
                <option value="Portuguese">Portuguese</option>
                <option value="Mandarin">Mandarin</option>
                <option value="French">French</option>
                <option value="Other">Other</option>
              </Select>
            </Field>
          </div>
          {error && <WarnLine className="mt">{error}</WarnLine>}
          <div className="row mt" style={{ justifyContent: "flex-end" }}>
            <Btn onClick={() => setEditing(false)}>Cancel</Btn>
            <Btn variant="pri" onClick={handleSave} disabled={updateClient.isPending}>
              <Icon name="check" size={13} />
              {updateClient.isPending ? "Saving…" : "Save"}
            </Btn>
          </div>
        </Panel>
      )}

      <KpiRow>
        <Kpi label="Exposure" value={QC_FMT.short(exposure)} />
        <Kpi label="Active loans" value={clientLoans.length} />
        <Kpi label="FICO" value={client.fico ?? "—"} />
        <Kpi label="Funded" value={QC_FMT.short(Number(client.funded_total))} />
      </KpiRow>

      {/* Credit pull widget — summary card + drill-down to the full
          parsed report. Operators see this as the canonical credit view
          for the client; the underlying iSoftPull HTML is reachable via
          the "View raw report" link inside CreditReportDetail. */}
      {credit && (
        <>
          <CreditSummaryCard summary={creditSummary} loading={summaryLoading} />
          {/* Operator-typed credit notes from iSoftpull. Operator-only —
              borrowers viewing their own page never see this. */}
          {canEdit && credit.notes && credit.notes.trim().length > 0 && (
            <Panel
              title="Credit notes (iSoftpull)"
              sub={credit.pulled_at ? `PULLED ${new Date(credit.pulled_at).toLocaleDateString()}` : undefined}
            >
              <div style={{ whiteSpace: "pre-wrap" }}>{credit.notes}</div>
            </Panel>
          )}
          <Row>
            <Btn onClick={() => setShowFullReport((v) => !v)}>
              <Icon name={showFullReport ? "arrowR" : "arrowR"} size={11} />
              {showFullReport ? "Hide full credit report" : "View full credit report"}
            </Btn>
            <span className="sub">
              {credit.pulled_at ? `Pulled ${new Date(credit.pulled_at).toLocaleDateString()}` : ""}
              {credit.expires_at ? ` · expires ${new Date(credit.expires_at).toLocaleDateString()}` : ""}
            </span>
          </Row>
          {showFullReport ? (
            <CreditReportDetail report={parsedReport} loading={parsedLoading} />
          ) : null}
        </>
      )}

      <Panel title="Loans">
        {clientLoans.length === 0 && <div className="sub">No loans for this client yet.</div>}
        {clientLoans.map((l) => (
          <Link key={l.id} href={`/loans/${l.id}`} className="pick">
            <span className="sub" style={{ width: 80 }}>{l.deal_id}</span>
            <b style={{ flex: 1, minWidth: 0 }}>{l.address}</b>
            <Tag>{l.type.replace("_", " ")}</Tag>
            <b className="num">{QC_FMT.short(Number(l.amount))}</b>
          </Link>
        ))}
      </Panel>

      {/* Engagement timeline — buyer-intent + funnel signals captured per
          Architecture Rule #9. Empty until the backend GET
          /clients/{id}/engagement endpoint ships. */}
      <Panel title="Engagement">
        {engagement.length === 0 ? (
          <div className="sub">
            No engagement signals yet. As the client interacts (opens invites,
            starts/abandons intake, uploads docs, views messages, runs the simulator,
            updates their profile, pulls credit), each event lands here so the AI can
            reason about timing and intent.
          </div>
        ) : (
          <>
            {engagement.slice(0, 12).map((s) => {
              // The backend returns Activity rows shaped {id, kind, summary,
              // actor_label, created_at, payload} (see EngagementSignalRead) — not
              // the older signal_type/occurred_at shape. Read defensively so a shape
              // drift can never crash the client page.
              const label = (s.summary || s.kind || s.signal_type || "activity").replace(/_/g, " ");
              const when = s.created_at || s.occurred_at;
              return (
                <div key={s.id} className="filerow">
                  <Icon name="bolt" size={12} style={{ color: "var(--petrol)" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>{label}</div>
                  <span className="sub">{when ? new Date(when).toLocaleDateString() : ""}</span>
                </div>
              );
            })}
          </>
        )}
      </Panel>

      {/* Tracked-email breadcrumbs — metadata only (sender/subject/time). The
          message body lives solely in the mailbox owner's inbox (isolation). */}
      {profile.role !== "client" && (
        <EmailsBreadcrumbTab
          rows={clientActivity.map((a) => ({ id: a.id, kind: a.kind, summary: a.summary, payload: a.payload, occurredAt: a.created_at }))}
          isLoading={clientActivityLoading}
        />
      )}

      {/* SMS thread — the client's text history from the sms_messages ledger:
          both directions, delivery states, refused sends with their reason. */}
      {profile.role !== "client" && (
        <SmsThreadTab rows={smsThread} isLoading={smsLoading} />
      )}

      {/* Next Best Actions stub — populated by the shared Deal Intelligence
          Core in P0B. Today renders a placeholder so the surface is visible. */}
      <Panel title="Next Best Actions">
        <div className="note">
          <Icon name="spark" size={14} />
          <span>
            The Next Best Action engine ships in P0B (deterministic rules) and
            P1 (LLM-driven). Tasks generated for this Borrower will route to the
            Agent Inbox (relationship work) and the Funding Elara Inbox (lender
            packaging, doc validation, escalations) per the shared Deal
            Intelligence Core routing rules.
          </span>
        </div>
      </Panel>

      {/* Vault — operator-side view of the same documents the client sees in
          their own /vault. Subject Property = docs tied to in-flight loans;
          REO Schedule = docs tied to funded loans. Backed by the new
          GET /documents?client_id={id} server-side join. */}
      <ClientVaultCard clientLoans={clientLoans} docs={clientDocs} />
    </div>
  );
}

function LoanChatPicker({
  open,
  loans,
  onClose,
  onPick,
}: {
  open: boolean;
  loans: Loan[];
  onClose: () => void;
  onPick: (loanId: string) => void;
}) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title="Pick a loan to chat in"
      sub="This client has more than one active loan. Choose which thread to open."
    >
      {loans.map((l) => (
        <button key={l.id} type="button" className="pick" onClick={() => onPick(l.id)} style={{ width: "100%" }}>
          <span className="sub" style={{ width: 80 }}>{l.deal_id}</span>
          <b style={{ flex: 1, minWidth: 0, textAlign: "left" }}>{l.address}</b>
          <span className="sub">{l.stage}</span>
        </button>
      ))}
    </Drawer>
  );
}

function PaymentAuthorizationCard({ clientId }: { clientId: string }) {
  const { data, isLoading, error } = useClientPaymentAuthorizationStatus(clientId);
  const auth = data?.latest_authorization ?? null;
  const method = data?.payment_method ?? null;
  const signed = !!auth?.signed_at || auth?.status === "active";
  const cardReady = method?.status === "active" && !!method.last4;
  const ready = !!data?.authorized;
  const statusLabel = ready ? "Authorized + card on file" : signed && !cardReady ? "Signed, card missing" : !signed && cardReady ? "Card on file, signature missing" : "Not completed";
  const statusTone: ChipTone = ready ? "ok" : signed || cardReady ? "warn" : "bad";
  const signedAt = auth?.completed_at || auth?.signed_at || null;
  const cardLabel = method?.last4
    ? `${method.brand ? method.brand.toUpperCase() : "CARD"} •••• ${method.last4}${method.exp_month && method.exp_year ? ` · exp ${String(method.exp_month).padStart(2, "0")}/${String(method.exp_year).slice(-2)}` : ""}`
    : "No active card";
  const billingAddress = method
    ? [
        method.billing_line1,
        method.billing_line2,
        [method.billing_city, method.billing_state, method.billing_postal_code].filter(Boolean).join(", "),
        method.billing_country,
      ].filter(Boolean)
    : [];

  return (
    <Panel
      title="Payment pre-authorization"
      actions={
        <CellChip tone={statusTone}>
          <span className="repdot" style={{ background: "currentColor" }} />
          {isLoading ? "Checking status" : statusLabel}
        </CellChip>
      }
    >
      <div className="sub">
        {ready
          ? "Credit actions are unlocked for this client."
          : "Credit actions stay locked until signature and card setup are both complete."}
      </div>
      {error ? (
        <WarnLine className="mt">Could not load authorization status.</WarnLine>
      ) : null}

      <div className="kpis mt">
        <AuthInfoTile label="Signature" value={signedAt ? `Signed ${new Date(signedAt).toLocaleDateString()}` : "Missing"} tone={signedAt ? "ok" : "bad"} />
        <AuthInfoTile label="Card" value={cardLabel} tone={cardReady ? "ok" : "bad"} />
        <AuthInfoTile label="Document" value={auth?.document_version ?? "Not started"} tone={auth ? "ok" : "muted"} />
      </div>

      <div className="cg mt">
        <div className="card s6">
          <Lbl>Billing details</Lbl>
          {method ? (
            <div>
              <b>{method.billing_name ?? "Name not returned"}</b>
              <div>{method.billing_email ?? "No billing email"}</div>
              {billingAddress.length > 0 ? (
                <div className="mt">{billingAddress.map((line) => <div key={line}>{line}</div>)}</div>
              ) : (
                <div className="sub mt">No billing address on file.</div>
              )}
            </div>
          ) : (
            <div className="sub">No Stripe payment method has been saved for this client.</div>
          )}
        </div>

        <div className="card s6">
          <Lbl>Audit record</Lbl>
          <div>
            <div>Status: <strong>{auth?.status ?? "none"}</strong></div>
            <div>SetupIntent: <strong>{auth?.setup_intent_status ?? "none"}</strong></div>
            <div>Authorization ID: <span className="sub">{auth?.id ?? "not created"}</span></div>
          </div>
          {data?.certificate_url ? (
            <a
              className="btn mt"
              href={data.certificate_url}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="file" size={12} />
              View signed certificate
            </a>
          ) : (
            <div className="sub mt">
              Certificate appears after the client completes e-sign and card setup.
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function AuthInfoTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ok" | "bad" | "muted";
}) {
  const chipTone: ChipTone = tone === "ok" ? "ok" : tone === "bad" ? "bad" : "mut";
  return (
    <div className="kpi">
      <Lbl>{label}</Lbl>
      <div style={{ marginTop: 6 }}>
        <CellChip tone={chipTone}>{value}</CellChip>
      </div>
    </div>
  );
}

function AgentRelationshipWorkspace({
  client,
  clientLoans,
  docs,
  creditFico,
}: {
  client: Client;
  clientLoans: Loan[];
  docs: Document[];
  creditFico: number | null;
}) {
  const side = client.client_type ?? "buyer";
  const isSeller = side === "seller";
  const activeLoans = clientLoans.filter((loan) => loan.stage !== "funded");
  const exposure = activeLoans.reduce((sum, loan) => sum + Number(loan.amount || 0), 0);
  const receivedDocs = docs.filter((doc) => doc.status === "received" || doc.status === "verified").length;
  const verifiedDocs = docs.filter((doc) => doc.status === "verified").length;
  const activeStage = inferStage(client, activeLoans.length);

  const workflow = isSeller
    ? [
        { icon: "bldg", title: "Listing intent", detail: "Price target, payoff, timeline, and motivation should be clear before funding handoff." },
        { icon: "docCheck", title: "Seller package", detail: "Property facts, rent roll when relevant, photos, inspection, and current mortgage context." },
        { icon: "chat", title: "Offer support", detail: "Keep seller communication internal to the agent while funding validates buyer strength." },
      ]
    : [
        { icon: "shieldChk", title: "Buyer readiness", detail: "Credit, entity, liquidity, buy box, and target close date should be complete." },
        { icon: "docCheck", title: "Prequal package", detail: "Upload purchase agreement, entity docs, bank statements, and property facts as they arrive." },
        { icon: "chat", title: "Offer support", detail: "Use status updates to keep the client moving while funding owns loan criteria." },
      ];

  const nextActions = isSeller
    ? [
        activeStage === "lead" ? "Confirm listing timeline and target net." : "Update seller timeline after each funding milestone.",
        receivedDocs === 0 ? "Add property facts, payoff, and seller-side docs." : "Review seller docs for missing transaction context.",
        activeLoans.length === 0 ? "Qualify buyer financing path before funding handoff." : "Track funding conditions tied to the offer.",
      ]
    : [
        creditFico ? "Confirm the client's target purchase and close date." : "Ask client to complete credit readiness.",
        receivedDocs === 0 ? "Collect intake, bank statements, entity docs, and property facts." : "Review received docs before funding handoff.",
        activeLoans.length === 0 ? "Move to Start Funding once verified." : "Coordinate borrower conditions with funding updates.",
      ];

  return (
    <Panel
      title="Agent Relationship Workspace"
      actions={
        <>
          <CellChip tone={isSeller ? "warn" : "acc"}>
            {isSeller ? "Seller workflow" : "Buyer workflow"}
          </CellChip>
          <Tag>{STAGE_LABEL[activeStage]}</Tag>
        </>
      }
    >
      <div style={{ maxWidth: 720 }}>
        This is the agent-owned client file. Relationship notes, buyer or seller readiness,
        transaction context, and client follow-up stay here. Funding criteria and loan calculations
        stay inside the internal funding file after handoff.
      </div>

      <div className="kpis mt">
        <MiniStat label="Active file" value={activeLoans.length ? `${activeLoans.length}` : "None"} />
        <MiniStat label="Exposure" value={exposure ? QC_FMT.short(exposure) : "$0"} />
        <MiniStat label="Docs ready" value={`${verifiedDocs}/${docs.length || 0}`} />
      </div>

      <div className="cg mt">
        {workflow.map((item) => (
          <div key={item.title} className="card s4">
            <Row>
              <Icon name={item.icon} size={15} style={{ color: "var(--petrol)" }} />
              <b>{item.title}</b>
            </Row>
            <div className="sub mt">{item.detail}</div>
          </div>
        ))}

        <div className="card s12">
          <Lbl>Next Agent Actions</Lbl>
          {nextActions.map((action, index) => (
            <div key={action} className="filerow">
              <span className={`cellchip c-${index === 0 ? "pet" : "mut"}`}>{index + 1}</span>
              <span style={{ flex: 1, minWidth: 0 }}>{action}</span>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="kpi">
      <Lbl>{label}</Lbl>
      <div className="knum num">{value}</div>
    </div>
  );
}

const VAULT_COLS: Col[] = [
  { label: "Document" },
  { label: "Category", width: 150 },
  { label: "Loan", width: 130 },
  { label: "Received", width: 120 },
  { label: "Status", width: 120 },
];

function ClientVaultCard({
  clientLoans,
  docs,
}: {
  clientLoans: Loan[];
  docs: Document[];
}) {
  const [tab, setTab] = useState<"subject" | "reo">("subject");
  const subjectLoans = clientLoans.filter((l) => l.stage !== "funded");
  const subjectLoanIds = new Set(subjectLoans.map((l) => l.id));
  const reoLoanIds = new Set(clientLoans.filter((l) => l.stage === "funded").map((l) => l.id));
  const loanById = Object.fromEntries(clientLoans.map((l) => [l.id, l] as const));
  const visible = docs.filter((d) =>
    (tab === "subject" ? subjectLoanIds : reoLoanIds).has(d.loan_id),
  );
  const subjectCount = docs.filter((d) => subjectLoanIds.has(d.loan_id)).length;
  const reoCount = docs.filter((d) => reoLoanIds.has(d.loan_id)).length;
  // Replaces the firm-wide /vault entry for agents — they now upload
  // experience / supplemental docs from inside the client's vault.
  // Default-picks the first active loan when there's exactly one
  // (the common case); otherwise the agent picks from a dropdown.
  const [uploadLoanId, setUploadLoanId] = useState<string>(
    subjectLoans[0]?.id ?? "",
  );

  return (
    <Panel
      noPad
      title="Vault"
      sub={`${docs.length} total`}
      actions={
        <Seg<"subject" | "reo">
          value={tab}
          onChange={setTab}
          ariaLabel="Vault section"
          options={[
            { value: "subject", label: <>Subject Property <span className="tag">{subjectCount}</span></> },
            { value: "reo", label: <>REO Schedule <span className="tag">{reoCount}</span></> },
          ]}
        />
      }
    >
      {/* Agent-side upload strip: pick the target deal + drop a file.
          Replaces the now-hidden /vault entry by letting agents upload
          experience verification, supplemental docs, etc. directly
          from inside the client. */}
      {subjectLoans.length > 0 && (
        <div
          className="row"
          style={{ padding: "10px 16px", borderBottom: "1px solid var(--line)", background: "var(--sunken2)" }}
        >
          <Lbl>Upload to deal</Lbl>
          {subjectLoans.length > 1 ? (
            <Select
              value={uploadLoanId || subjectLoans[0].id}
              onChange={(e) => setUploadLoanId(e.target.value)}
              aria-label="Upload to deal"
            >
              {subjectLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.deal_id} — {l.address}
                </option>
              ))}
            </Select>
          ) : (
            <span>
              {subjectLoans[0].deal_id} &middot; {subjectLoans[0].address}
            </span>
          )}
          <span style={{ flex: 1 }} />
          <DocUploadButton
            loanId={uploadLoanId || subjectLoans[0].id}
            label="Upload"
            compact
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div className="sub" style={{ padding: 24, textAlign: "center" }}>
          {tab === "subject"
            ? "No documents on in-flight loans yet. Documents requested from the client will land here."
            : "No documents on closed loans yet."}
        </div>
      ) : (
        <Table cols={VAULT_COLS} caption="Client documents">
          {visible.map((d) => {
            const loan = loanById[d.loan_id];
            // Same three-way split VerifiedBadge carried; the chip tones hold it now.
            const kind: "verified" | "pending" | "flagged" =
              d.status === "verified" ? "verified" : d.status === "flagged" ? "flagged" : "pending";
            const statusTone: ChipTone = kind === "verified" ? "ok" : kind === "flagged" ? "bad" : "warn";
            const statusLabel = kind === "verified" ? "Verified" : kind === "flagged" ? "Flagged" : "Pending";
            return (
              <tr key={d.id}>
                <Td>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        background: "var(--accent-100)",
                        color: "var(--accent)",
                        display: "inline-grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <Icon name="doc" size={14} />
                    </span>
                    <b>{d.name}</b>
                  </div>
                </Td>
                <Td>
                  <Tag>{d.category ?? "—"}</Tag>
                </Td>
                <Td>
                  {loan ? (
                    <Link href={`/loans/${loan.id}`} className="linky">
                      {loan.deal_id}
                    </Link>
                  ) : (
                    <span className="sub">—</span>
                  )}
                </Td>
                <Td>
                  <span className="sub">
                    {d.received_on
                      ? new Date(d.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </Td>
                <Td>
                  <CellChip tone={statusTone}>{statusLabel}</CellChip>
                </Td>
              </tr>
            );
          })}
        </Table>
      )}
    </Panel>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// ClientStageCard — surfaces the Client's current pipeline stage and exposes
// the stage-transition actions. Lives near the top of the per-Client workspace
// so the Agent can advance the client (lead → contacted → verified → Start
// Funding) without leaving this page. Document upload happens via the Vault
// section below — the same surface lets the Agent upload on the client's
// behalf when needed.
// ────────────────────────────────────────────────────────────────────────────
const STAGE_LABEL: Record<ClientStage, string> = {
  lead: "Lead",
  contacted: "Nurturing",
  verified: "Ready",
  ready_for_lending: "Ready for Lending",
  processing: "Processing",
  funded: "Funded",
  lost: "Lost",
};

// Colour by lifecycle group: leads/early-funnel = neutral; lending stages =
// petrol/brand; funded = profit-green; lost = muted. The palette map this
// replaces expressed the same split in raw tokens.
const STAGE_TONE: Record<ClientStage, ChipTone> = {
  lead: "mut",
  contacted: "warn",
  verified: "pet",
  ready_for_lending: "acc",
  processing: "acc",
  funded: "ok",
  lost: "mut",
};

function inferStage(c: Client, activeLoans: number): ClientStage {
  if (c.stage) return c.stage;
  if (c.funded_count > 0) return "funded";
  if (activeLoans > 0) return "processing";
  return "lead";
}

function ClientStageCard({
  client,
  canEdit,
  clientLoans,
}: {
  client: Client;
  canEdit: boolean;
  clientLoans: Loan[];
}) {
  const updateStage = useUpdateClientStage();
  const startFunding = useStartFunding();
  const [error, setError] = useState<string | null>(null);

  const activeLoans = clientLoans.filter((l) => l.stage !== "funded").length;
  const stage = inferStage(client, activeLoans);

  const advance = async (next: ClientStage) => {
    setError(null);
    try {
      await updateStage.mutateAsync({ clientId: client.id, stage: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update stage");
    }
  };

  const handleStartFunding = async () => {
    setError(null);
    if (!confirm("Start funding for this client? This marks the prequal approved, creates the loan, and hands off to the Funding Team. The client moves to 'Ready for Lending' and you'll keep read-only visibility during processing.")) {
      return;
    }
    try {
      await startFunding.mutateAsync(client.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start funding");
    }
  };

  const inFunding = stage === "ready_for_lending" || stage === "processing" || stage === "funded";
  const busy = updateStage.isPending || startFunding.isPending;

  return (
    <Panel
      title="Pipeline stage"
      actions={
        <>
          <CellChip tone={STAGE_TONE[stage]}>
            <span className="repdot" style={{ background: "currentColor" }} />
            {STAGE_LABEL[stage]}
          </CellChip>
          {client.client_type && (
            <CellChip tone={client.client_type === "buyer" ? "acc" : "warn"}>
              {client.client_type === "buyer" ? "Buyer" : "Seller"}
            </CellChip>
          )}
        </>
      }
    >
      {canEdit && !inFunding && stage !== "lost" && (
        <Row>
          {stage === "lead" && (
            <Btn onClick={() => advance("contacted")} disabled={busy}>
              Mark contacted →
            </Btn>
          )}
          {stage === "contacted" && (
            <Btn onClick={() => advance("verified")} disabled={busy}>
              Mark verified →
            </Btn>
          )}
          {stage === "verified" && (
            <Btn variant="pri" onClick={handleStartFunding} disabled={busy}>
              <Icon name="bolt" size={13} />
              {startFunding.isPending ? "Starting…" : "Start Funding"}
            </Btn>
          )}
          <Btn onClick={() => advance("lost")} disabled={busy} style={{ color: "var(--danger)" }}>
            Mark lost
          </Btn>
        </Row>
      )}

      {inFunding && (
        <div className="sub">
          File is with the Funding Team. You retain read-only visibility on
          funding-doc collection and lender milestones.
        </div>
      )}

      {error && (
        <WarnLine className="mt">{error}</WarnLine>
      )}

      <div className="sub mt">
        Use the <strong>Documents</strong> section below to upload on the client&apos;s
        behalf when needed — funding docs verify only by the Funding Team, but
        you can always add transaction-side docs (purchase agreement, inspection,
        etc.) to keep the file moving.
      </div>
    </Panel>
  );
}

const MODE_LABEL: Record<"guided" | "self_directed", string> = {
  guided: "Guided",
  self_directed: "Self-Directed",
};

const LOCKED_BY_LABEL: Record<ClientExperienceModeLockedBy, string> = {
  system: "system default",
  agent: "Agent",
  funding_team: "Funding Team",
  super_admin: "Super Admin",
};

const REASON_LABEL: Record<ClientExperienceModeReason, string> = {
  agent_referred: "Agent-referred",
  self_signup: "Self sign-up",
  funding_team_required: "Funding Team required",
  underwriting_conditions: "Underwriting conditions",
  user_preference: "Manual selection",
  super_admin_override: "Super Admin override",
};

// AssignedAgentCard — surfaces the broker assignment alongside the
// experience-mode controls. Operator-only (super_admin / loan_exec);
// brokers can already see who owns their own clients implicitly.
// Backend auto-flips client_experience_mode to "guided" on the
// NULL→set transition, so assigning an agent here also unsticks the
// mobile app from self_directed.
function AssignedAgentCard({ client }: { client: Client }) {
  const { data: user } = useCurrentUser();
  const { data: brokers = [], isLoading } = useBrokers();
  const update = useUpdateClient();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // After a successful broker assignment we open the multi-loan
  // sweep modal so the operator can carry the client's open loans
  // onto the same agent's pipeline.
  const [sweepBroker, setSweepBroker] = useState<Broker | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  const canAssign = user?.role === "super_admin" || user?.role === "loan_exec";
  if (!canAssign) return null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!anchorRef.current) return;
      if (!anchorRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return brokers;
    return brokers.filter((b: Broker) => b.display_name.toLowerCase().includes(q));
  }, [brokers, query]);

  const assigned = !!client.broker_id;

  async function pick(broker: Broker | null) {
    setError(null);
    setBusyId(broker?.id ?? "__unassign__");
    try {
      await update.mutateAsync({ clientId: client.id, broker_id: broker?.id ?? null });
      setOpen(false);
      setQuery("");
      // Assignment to a real broker — offer to sweep the client's
      // other open loans onto the same agent. Unassign skips this.
      if (broker) setSweepBroker(broker);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update agent.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Panel
      title="Real estate agent"
      actions={
        <>
          <CellChip tone={assigned ? "acc" : "warn"}>
            <span className="repdot" style={{ background: "currentColor" }} />
            {assigned ? client.broker_name ?? "Assigned" : "Unassigned"}
          </CellChip>
          <div ref={anchorRef} className="popwrap">
            <Btn onClick={() => setOpen((v) => !v)} disabled={busyId !== null}>
              <Icon name="user" size={12} /> {assigned ? "Reassign agent" : "Assign agent"}
            </Btn>
            {open ? (
              <div className="popmenu" onClick={(e) => e.stopPropagation()} style={{ width: 280 }}>
                <div style={{ padding: "4px 6px 8px" }}>
                  <Input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search agents…"
                    aria-label="Search agents"
                    style={{ width: "100%" }}
                  />
                </div>
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {isLoading ? (
                    <div className="sub" style={{ padding: "8px 10px" }}>Loading agents…</div>
                  ) : filtered.length === 0 ? (
                    <div className="sub" style={{ padding: "8px 10px" }}>No matches.</div>
                  ) : (
                    filtered.map((b: Broker) => {
                      const isCurrent = b.id === client.broker_id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          className="mi"
                          onClick={() => pick(b)}
                          disabled={isCurrent || busyId !== null}
                        >
                          <span className="row">
                            <Icon name="user" size={11} />
                            <span style={{ flex: 1 }}>{b.display_name}</span>
                            {isCurrent ? (
                              <span className="cellchip c-acc">Current</span>
                            ) : busyId === b.id ? (
                              <span className="sub">Saving…</span>
                            ) : null}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
                {assigned ? (
                  <button
                    type="button"
                    className="mi"
                    onClick={() => pick(null)}
                    disabled={busyId !== null}
                    style={{ color: "var(--danger)" }}
                  >
                    {busyId === "__unassign__" ? "Unassigning…" : "Unassign agent"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      }
    >
      <div className="sub">
        {assigned
          ? "Owns the relationship + receives all agent-pipeline notifications."
          : "No broker on file — assign an agent so this client appears in their pipeline."}
      </div>
      {error ? (
        <WarnLine className="mt">{error}</WarnLine>
      ) : null}
      {!assigned ? (
        <div className="sub mt">
          Assigning an agent will also default the mobile experience to <strong>Guided</strong> if it&apos;s
          not explicitly set. The agent will see this client in their pipeline immediately.
        </div>
      ) : null}
      {sweepBroker ? (
        <MultiLoanReassignModal
          clientId={client.id}
          newBroker={sweepBroker}
          brokerName={sweepBroker.display_name}
          onClose={() => setSweepBroker(null)}
        />
      ) : null}
    </Panel>
  );
}


function ExperienceModeCard({ client }: { client: Client }) {
  const { data: user } = useCurrentUser();
  const updateClient = useUpdateClient();
  const [error, setError] = useState<string | null>(null);

  const effective = deriveExperienceMode(client);
  const isExplicit = client.client_experience_mode === "guided" || client.client_experience_mode === "self_directed";
  const lockedBy = client.client_experience_mode_locked_by ?? null;
  const reason = client.client_experience_mode_reason ?? null;
  const { canEdit, canOverrideLock } = canEditExperienceMode(user, client);
  const busy = updateClient.isPending;

  const reasonForChange = (target: "guided" | "self_directed"): ClientExperienceModeReason => {
    if (user?.role === "super_admin") return "super_admin_override";
    if (user?.role === "loan_exec" && target === "guided") return "funding_team_required";
    return "user_preference";
  };

  const setMode = async (target: "guided" | "self_directed") => {
    if (target === effective && isExplicit) return;
    setError(null);
    try {
      await updateClient.mutateAsync({
        clientId: client.id,
        client_experience_mode: target,
        client_experience_mode_reason: reasonForChange(target),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update experience mode");
    }
  };

  const setLock = async (next: ClientExperienceModeLockedBy | null) => {
    setError(null);
    try {
      await updateClient.mutateAsync({
        clientId: client.id,
        client_experience_mode_locked_by: next,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update lock");
    }
  };

  const lockTarget: ClientExperienceModeLockedBy | null =
    user?.role === "loan_exec" ? "funding_team" : user?.role === "super_admin" ? "super_admin" : null;

  // Everything here except the derivation note, the lock line and the error
  // lives in the panel header. With none of the three, `.panel-b` would render
  // as an empty padded strip under the hairline.
  const hasBody = !isExplicit || !!reason || !!lockedBy || !!error;

  return (
    <Panel
      noPad={!hasBody}
      title="Mobile experience mode"
      actions={
        <>
          <CellChip tone={effective === "guided" ? "acc" : "pet"}>
            <span className="repdot" style={{ background: "currentColor" }} />
            {MODE_LABEL[effective]}
          </CellChip>
          {/* Hand-rolled `.seg` rather than <Seg>: these two buttons carry a
              permission-disabled state and its explanatory title, which the
              shared control has no slot for. */}
          <div className="seg" role="group" aria-label="Mobile experience mode">
            {(["guided", "self_directed"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={effective === m ? "on" : ""}
                onClick={() => setMode(m)}
                disabled={!canEdit || busy}
                title={!canEdit ? "You cannot change this client's experience mode." : undefined}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          {canOverrideLock && lockTarget && (
            lockedBy === lockTarget || lockedBy === "super_admin" ? (
              <Btn
                onClick={() => setLock(null)}
                disabled={busy || (lockedBy === "super_admin" && user?.role !== "super_admin")}
              >
                Unlock
              </Btn>
            ) : (
              <Btn onClick={() => setLock(lockTarget)} disabled={busy}>
                Lock to {LOCKED_BY_LABEL[lockTarget]}
              </Btn>
            )
          )}
        </>
      }
    >
      {!isExplicit && (
        <div className="sub">
          (default — derived from {client.broker_id ? "Agent referral" : "self sign-up"})
        </div>
      )}
      {(reason || lockedBy) && (
        <div className="sub">
          {reason ? REASON_LABEL[reason] : ""}
          {reason && lockedBy ? " · " : ""}
          {lockedBy ? `Locked by ${LOCKED_BY_LABEL[lockedBy]}` : ""}
        </div>
      )}

      {error && (
        <WarnLine className="mt">{error}</WarnLine>
      )}
    </Panel>
  );
}

// Confirmation modal — shows the Lending Handoff Packet preview
// before firing, then the success state with what the Lending AI
// inherited + the first message it sent. Mirrors the spec's
// "Send to Lending / Review Summary First" flow.
function LendingHandoffModal({
  open,
  client,
  result,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  open: boolean;
  client: Client;
  result: { summary: string | null; firstQuestion: string | null; missingItems: string[]; lendingThreadId: string | null } | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  // Escape, backdrop click and focus restore all live in Drawer now.
  const succeeded = result !== null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title={succeeded ? `${client.name} moved to Lending Intake` : `Ready to send ${client.name} to lending?`}
      ariaLabel="Send to lending"
      sub={
        succeeded
          ? "Funding team has been notified. The Lending AI started a fresh thread and already knows the context."
          : "The AI will:"
      }
      footer={
        succeeded ? (
          <>
            <span style={{ flex: 1 }} />
            <Btn variant="pri" onClick={onClose}>Done</Btn>
          </>
        ) : (
          <>
            <span style={{ flex: 1 }} />
            <Btn onClick={onClose} disabled={pending}>Cancel</Btn>
            <Btn variant="pri" onClick={() => onConfirm()} disabled={pending}>
              <Icon name="bolt" size={12} />
              {pending ? "Handing off…" : "Send to Lending"}
            </Btn>
          </>
        )
      }
    >
      {!succeeded ? (
        <>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.6 }}>
            <li>Summarize the realtor conversation into a structured handoff</li>
            <li>Carry over relevant facts and uploaded files</li>
            <li>Identify missing lending items the Lending AI needs to collect</li>
            <li>Create a prequal quote in the funding queue</li>
            <li>Spawn a lending-side AI thread that already knows everything</li>
            <li>Notify the funding team via Elara Inbox</li>
          </ul>
          {error && <div className="warnline mt">{error}</div>}
        </>
      ) : (
        <>
          {result?.summary && (
            <div className="card">
              <Lbl>Known from realtor side</Lbl>
              <div style={{ whiteSpace: "pre-wrap" }}>{result.summary}</div>
            </div>
          )}
          {result && result.missingItems.length > 0 && (
            <div className="mt">
              <Lbl>Lending AI will collect</Lbl>
              <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.5 }}>
                {result.missingItems.map((m) => (
                  <li key={m}>{m.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}
          {result?.firstQuestion && (
            <div className="card mt">
              <Lbl>Lending AI&apos;s first question</Lbl>
              <div>{result.firstQuestion}</div>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
