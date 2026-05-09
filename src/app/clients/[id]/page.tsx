"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useClient, useCreditSummary, useCurrentCredit, useCurrentUser, useDocumentsForClient, useEngagement, useLoans, useParsedReport, useRequestPrequalification, useStartFunding, useUpdateClient, useUpdateClientStage } from "@/hooks/useApi";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { RealtorReadinessCard } from "@/components/RealtorReadinessCard";
import { CreditReportDetail } from "@/components/CreditReportDetail";
import { useActiveProfile } from "@/store/role";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseIntStrict } from "@/lib/formCoerce";
import { deriveExperienceMode } from "@/lib/experienceMode";
import { canEditExperienceMode } from "@/lib/experienceModePermissions";
import { DocUploadButton } from "@/app/documents/components/DocUploadButton";
import { SmartIntakeModal } from "@/app/pipeline/components/SmartIntakeModal";
import type { Client, ClientExperienceMode, ClientExperienceModeLockedBy, ClientExperienceModeReason, ClientStage, Document, Loan } from "@/lib/types";

export default function ClientDetailPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
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
  const updateClient = useUpdateClient();
  const requestPrequal = useRequestPrequalification();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [error, setError] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [prequalErr, setPrequalErr] = useState<string | null>(null);
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
  // CLIENT-role users can't kick off deals from inside their own page;
  // every other role gets the "+ New deal" affordance.
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
      });
    }
  }, [client?.id]);

  if (!client) return <div style={{ color: t.ink3 }}>Loading…</div>;

  const clientLoans = loans.filter((l) => l.client_id === client.id);
  const exposure = clientLoans.reduce((s, l) => s + Number(l.amount), 0);

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
      });
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save.");
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card pad={20}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 56, height: 56, borderRadius: 28, background: client.avatar_color ?? t.petrol, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, flexShrink: 0 }}>
            {client.name.split(" ").map(n => n[0]).slice(0, 2).join("")}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: t.ink, margin: 0 }}>{client.name}</h1>
            <div style={{ fontSize: 13, color: t.ink3 }}>{client.email ?? "—"} · {client.phone ?? "—"} · {client.city ?? "—"}</div>
          </div>
          <Pill>{client.tier}</Pill>
          {canStartDeal && (
            <button
              onClick={() => setIntakeOpen(true)}
              style={{
                padding: "8px 12px", borderRadius: 9,
                background: t.ink, color: t.inverse, border: "none",
                fontSize: 12, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              }}
            >
              <Icon name="plus" size={12} /> New deal
            </button>
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
            <button
              onClick={() => setHandoffOpen(true)}
              disabled={requestPrequal.isPending}
              style={{
                padding: "8px 12px", borderRadius: 9,
                background: t.brand, color: t.inverse, border: "none",
                fontSize: 12, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 5,
                cursor: requestPrequal.isPending ? "wait" : "pointer",
                opacity: requestPrequal.isPending ? 0.7 : 1,
              }}
            >
              <Icon name="bolt" size={12} />
              {requestPrequal.isPending ? "Handing off…" : "Ready for Lending"}
            </button>
          )}
          {canRequestPrequal && client.lead_promotion_status === "agent_requested_review" && (
            <span
              style={{
                padding: "6px 10px", borderRadius: 999,
                background: t.brandSoft, color: t.brand,
                fontSize: 11, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 5,
              }}
            >
              <Icon name="check" size={11} /> Funding review requested
            </span>
          )}
          {prequalErr && (
            <span style={{ fontSize: 11, color: t.danger, fontWeight: 700 }}>{prequalErr}</span>
          )}
          {canEdit && !editing && (
            <button
              onClick={() => setEditing(true)}
              style={{
                padding: "8px 12px", borderRadius: 9, background: t.surface2, color: t.ink,
                border: `1px solid ${t.line}`, fontSize: 12, fontWeight: 700,
                display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer",
              }}
            >
              <Icon name="gear" size={12} /> Edit
            </button>
          )}
        </div>
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
      <LendingHandoffModal
        t={t}
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

      <ClientStageCard t={t} client={client} canEdit={canEdit} clientLoans={clientLoans} />

      {/* Realtor Client Intelligence Profile (alembic 0030). The
          Realtor AI writes this every conversational turn; the card
          surfaces what's known, what's missing, and the AI's next
          best action. Only renders when the AI has populated something. */}
      {client.realtor_profile && client.realtor_profile.client_type !== "unknown" && (
        <RealtorReadinessCard profile={client.realtor_profile} />
      )}

      <ExperienceModeCard t={t} client={client} />

      {editing && canEdit && (
        <Card pad={20}>
          <SectionLabel>Edit profile</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field t={t} label="Name">
              <Input t={t} value={(draft.name ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} />
            </Field>
            <Field t={t} label="Email">
              <Input t={t} value={(draft.email ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, email: v }))} />
            </Field>
            <Field t={t} label="Phone">
              <Input t={t} value={(draft.phone ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, phone: v }))} />
            </Field>
            <Field t={t} label="City">
              <Input t={t} value={(draft.city ?? "") as string} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
            </Field>
            <Field t={t} label="Tier">
              <select
                value={(draft.tier ?? "standard") as string}
                onChange={(e) => setDraft((d) => ({ ...d, tier: e.target.value }))}
                style={{
                  width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
                  border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit",
                }}
              >
                <option value="standard">Standard</option>
                <option value="Tier I">Tier I</option>
                <option value="Tier II">Tier II</option>
                <option value="Tier III">Tier III</option>
              </select>
            </Field>
            <Field t={t} label="FICO (300–850)">
              <Input
                t={t}
                value={draft.fico != null ? String(draft.fico) : ""}
                onChange={(v) => setDraft((d) => ({ ...d, fico: (parseIntStrict(v) || null) as Client["fico"] }))}
                placeholder="720"
              />
            </Field>
          </div>
          {error && <div style={{ color: t.danger, fontSize: 12, fontWeight: 700, marginTop: 10 }}>{error}</div>}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 18 }}>
            <button onClick={() => setEditing(false)} style={qcBtn(t)}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={updateClient.isPending}
              style={{ ...qcBtnPrimary(t), opacity: updateClient.isPending ? 0.6 : 1, cursor: updateClient.isPending ? "wait" : "pointer" }}
            >
              <Icon name="check" size={13} />
              {updateClient.isPending ? "Saving…" : "Save"}
            </button>
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI label="Exposure" value={QC_FMT.short(exposure)} />
        <KPI label="Active loans" value={clientLoans.length} />
        <KPI label="FICO" value={client.fico ?? "—"} />
        <KPI label="Funded" value={QC_FMT.short(Number(client.funded_total))} />
      </div>

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
            <Card pad={14}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <SectionLabel>Credit notes (iSoftpull)</SectionLabel>
                {credit.pulled_at && (
                  <span style={{ fontSize: 10.5, color: t.ink3, fontWeight: 600, letterSpacing: 0.6 }}>
                    PULLED {new Date(credit.pulled_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              <div style={{
                fontSize: 12.5,
                color: t.ink2,
                lineHeight: 1.55,
                whiteSpace: "pre-wrap",
                fontFamily: "inherit",
              }}>
                {credit.notes}
              </div>
            </Card>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setShowFullReport((v) => !v)}
              style={{ ...qcBtn(t), display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              <Icon name={showFullReport ? "arrowR" : "arrowR"} size={11} />
              {showFullReport ? "Hide full credit report" : "View full credit report"}
            </button>
            <div style={{ fontSize: 11, color: t.ink3 }}>
              {credit.pulled_at ? `Pulled ${new Date(credit.pulled_at).toLocaleDateString()}` : ""}
              {credit.expires_at ? ` · expires ${new Date(credit.expires_at).toLocaleDateString()}` : ""}
            </div>
          </div>
          {showFullReport ? (
            <CreditReportDetail report={parsedReport} loading={parsedLoading} />
          ) : null}
        </>
      )}

      <Card pad={16}>
        <SectionLabel>Loans</SectionLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {clientLoans.length === 0 && <div style={{ fontSize: 13, color: t.ink3 }}>No loans for this client yet.</div>}
          {clientLoans.map((l) => (
            <Link key={l.id} href={`/loans/${l.id}`} style={{ display: "flex", gap: 10, padding: "10px 12px", borderRadius: 10, border: `1px solid ${t.line}`, textDecoration: "none", alignItems: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: t.ink3, width: 80 }}>{l.deal_id}</div>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: t.ink }}>{l.address}</div>
              <Pill>{l.type.replace("_", " ")}</Pill>
              <div style={{ fontWeight: 700, fontFeatureSettings: '"tnum"', color: t.ink }}>{QC_FMT.short(Number(l.amount))}</div>
            </Link>
          ))}
        </div>
      </Card>

      {/* Engagement timeline — buyer-intent + funnel signals captured per
          Architecture Rule #9. Empty until the backend GET
          /clients/{id}/engagement endpoint ships. */}
      <Card pad={16}>
        <SectionLabel>Engagement</SectionLabel>
        {engagement.length === 0 ? (
          <div style={{ fontSize: 13, color: t.ink3, lineHeight: 1.55 }}>
            No engagement signals yet. As the client interacts (opens invites,
            starts/abandons intake, uploads docs, views messages, runs the simulator,
            updates their profile, pulls credit), each event lands here so the AI can
            reason about timing and intent.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {engagement.slice(0, 12).map((s) => (
              <div
                key={s.id}
                style={{
                  display: "flex",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 9,
                  border: `1px solid ${t.line}`,
                  alignItems: "center",
                  fontSize: 12,
                }}
              >
                <Icon name="bolt" size={12} style={{ color: t.petrol }} />
                <div style={{ flex: 1, color: t.ink }}>{s.signal_type.replace(/_/g, " ")}</div>
                <div style={{ color: t.ink3 }}>
                  {new Date(s.occurred_at).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Next Best Actions stub — populated by the shared Deal Intelligence
          Core in P0B. Today renders a placeholder so the surface is visible. */}
      <Card pad={16}>
        <SectionLabel>Next Best Actions</SectionLabel>
        <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 13 }}>
          <Icon name="spark" size={14} />
          The Next Best Action engine ships in P0B (deterministic rules) and
          P1 (LLM-driven). Tasks generated for this Borrower will route to the
          Agent Inbox (relationship work) and the Funding AI Inbox (lender
          packaging, doc validation, escalations) per the shared Deal
          Intelligence Core routing rules.
        </div>
      </Card>

      {/* Vault — operator-side view of the same documents the client sees in
          their own /vault. Subject Property = docs tied to in-flight loans;
          REO Schedule = docs tied to funded loans. Backed by the new
          GET /documents?client_id={id} server-side join. */}
      <ClientVaultCard t={t} clientLoans={clientLoans} docs={clientDocs} />
    </div>
  );
}

function ClientVaultCard({
  t,
  clientLoans,
  docs,
}: {
  t: ReturnType<typeof useTheme>["t"];
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
    <Card pad={0}>
      <div
        style={{
          padding: "12px 16px",
          borderBottom: `1px solid ${t.line}`,
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <SectionLabel>Vault</SectionLabel>
        <Pill>{docs.length} total</Pill>
        <div style={{ flex: 1 }} />
        <div style={{ display: "inline-flex", gap: 4 }}>
          <button
            onClick={() => setTab("subject")}
            style={{
              ...vaultTabStyle(t, tab === "subject"),
            }}
          >
            Subject Property <Pill>{subjectCount}</Pill>
          </button>
          <button
            onClick={() => setTab("reo")}
            style={{
              ...vaultTabStyle(t, tab === "reo"),
            }}
          >
            REO Schedule <Pill>{reoCount}</Pill>
          </button>
        </div>
      </div>

      {/* Agent-side upload strip: pick the target deal + drop a file.
          Replaces the now-hidden /vault entry by letting agents upload
          experience verification, supplemental docs, etc. directly
          from inside the client. */}
      {subjectLoans.length > 0 && (
        <div style={{
          padding: "10px 16px",
          borderBottom: `1px solid ${t.line}`,
          background: t.surface2,
          display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
            Upload to deal
          </span>
          {subjectLoans.length > 1 ? (
            <select
              value={uploadLoanId || subjectLoans[0].id}
              onChange={(e) => setUploadLoanId(e.target.value)}
              style={{
                padding: "6px 10px", borderRadius: 7,
                border: `1px solid ${t.line}`, background: t.surface,
                color: t.ink, fontSize: 12.5, outline: "none",
              }}
            >
              {subjectLoans.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.deal_id} — {l.address}
                </option>
              ))}
            </select>
          ) : (
            <span style={{ fontSize: 12, color: t.ink2 }}>
              {subjectLoans[0].deal_id} &middot; {subjectLoans[0].address}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <DocUploadButton
            loanId={uploadLoanId || subjectLoans[0].id}
            label="Upload"
            compact
          />
        </div>
      )}

      {visible.length === 0 ? (
        <div style={{ padding: 24, fontSize: 13, color: t.ink3, textAlign: "center" }}>
          {tab === "subject"
            ? "No documents on in-flight loans yet. Documents requested from the client will land here."
            : "No documents on closed loans yet."}
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 2fr) 130px 110px 120px 110px",
              padding: "10px 16px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: t.ink3,
              borderBottom: `1px solid ${t.line}`,
              background: t.surface2,
            }}
          >
            <div>Document</div>
            <div>Category</div>
            <div>Loan</div>
            <div>Received</div>
            <div>Status</div>
          </div>
          {visible.map((d) => {
            const loan = loanById[d.loan_id];
            const kind: "verified" | "pending" | "flagged" =
              d.status === "verified" ? "verified" : d.status === "flagged" ? "flagged" : "pending";
            return (
              <div
                key={d.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 2fr) 130px 110px 120px 110px",
                  padding: "12px 16px",
                  borderBottom: `1px solid ${t.line}`,
                  alignItems: "center",
                  fontSize: 13,
                  color: t.ink,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <div
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      background: t.brandSoft,
                      color: t.brand,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon name="doc" size={14} />
                  </div>
                  <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 700 }}>
                    {d.name}
                  </div>
                </div>
                <div>
                  <Pill>{d.category ?? "—"}</Pill>
                </div>
                <div>
                  {loan ? (
                    <Link
                      href={`/loans/${loan.id}`}
                      style={{
                        color: t.petrol,
                        textDecoration: "none",
                        fontFamily: "ui-monospace, SF Mono, monospace",
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {loan.deal_id}
                    </Link>
                  ) : (
                    <span style={{ color: t.ink3 }}>—</span>
                  )}
                </div>
                <div style={{ color: t.ink3, fontSize: 12 }}>
                  {d.received_on
                    ? new Date(d.received_on).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "—"}
                </div>
                <div>
                  <VerifiedBadge kind={kind} />
                </div>
              </div>
            );
          })}
        </>
      )}
    </Card>
  );
}

function vaultTabStyle(
  t: ReturnType<typeof useTheme>["t"],
  active: boolean,
): React.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 12px",
    borderRadius: 8,
    background: active ? t.ink : t.surface2,
    color: active ? t.inverse : t.ink2,
    fontSize: 12,
    fontWeight: 700,
  };
}

function Field({ t, label, children }: { t: ReturnType<typeof useTheme>["t"]; label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Input({ t, value, onChange, placeholder }: { t: ReturnType<typeof useTheme>["t"]; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", padding: "10px 12px", borderRadius: 9, background: t.surface2,
        border: `1px solid ${t.line}`, color: t.ink, fontSize: 13, fontFamily: "inherit", outline: "none",
      }}
    />
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

function inferStage(c: Client, activeLoans: number): ClientStage {
  if (c.stage) return c.stage;
  if (c.funded_count > 0) return "funded";
  if (activeLoans > 0) return "processing";
  return "lead";
}

function ClientStageCard({
  t,
  client,
  canEdit,
  clientLoans,
}: {
  t: ReturnType<typeof useTheme>["t"];
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

  const palette: Record<ClientStage, { bg: string; fg: string }> = {
    lead:               { bg: t.chip,        fg: t.ink2 },
    contacted:          { bg: t.warnBg,      fg: t.warn },
    verified:           { bg: t.petrolSoft,  fg: t.petrol },
    ready_for_lending:  { bg: t.brandSoft,   fg: t.brand },
    processing:         { bg: t.brandSoft,   fg: t.brand },
    funded:             { bg: t.profitBg,    fg: t.profit },
    lost:               { bg: t.surface2,    fg: t.ink3 },
  };
  const { bg, fg } = palette[stage];
  const inFunding = stage === "ready_for_lending" || stage === "processing" || stage === "funded";
  const busy = updateStage.isPending || startFunding.isPending;

  return (
    <Card pad={18}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
            Pipeline stage
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 999,
                background: bg,
                color: fg,
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: fg }} />
              {STAGE_LABEL[stage]}
            </span>
            {client.client_type && (
              <Pill bg={client.client_type === "buyer" ? t.brandSoft : t.warnBg} color={client.client_type === "buyer" ? t.brand : t.warn}>
                {client.client_type === "buyer" ? "Buyer" : "Seller"}
              </Pill>
            )}
          </div>
        </div>

        {canEdit && !inFunding && stage !== "lost" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {stage === "lead" && (
              <button onClick={() => advance("contacted")} disabled={busy} style={qcBtn(t)}>
                Mark contacted →
              </button>
            )}
            {stage === "contacted" && (
              <button onClick={() => advance("verified")} disabled={busy} style={qcBtn(t)}>
                Mark verified →
              </button>
            )}
            {stage === "verified" && (
              <button
                onClick={handleStartFunding}
                disabled={busy}
                style={{
                  ...qcBtnPrimary(t),
                  opacity: busy ? 0.6 : 1,
                  cursor: busy ? "wait" : "pointer",
                }}
              >
                <Icon name="bolt" size={13} />
                {startFunding.isPending ? "Starting…" : "Start Funding"}
              </button>
            )}
            <button
              onClick={() => advance("lost")}
              disabled={busy}
              style={{ ...qcBtn(t), color: t.danger, borderColor: `${t.danger}40` }}
            >
              Mark lost
            </button>
          </div>
        )}

        {inFunding && (
          <div style={{ fontSize: 12, color: t.ink3, maxWidth: 280, textAlign: "right" }}>
            File is with the Funding Team. You retain read-only visibility on
            funding-doc collection and lender milestones.
          </div>
        )}
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: t.danger, fontWeight: 700 }}>{error}</div>
      )}

      <div style={{ marginTop: 12, fontSize: 11, color: t.ink3, lineHeight: 1.55 }}>
        Use the <strong>Documents</strong> section below to upload on the client&apos;s
        behalf when needed — funding docs verify only by the Funding Team, but
        you can always add transaction-side docs (purchase agreement, inspection,
        etc.) to keep the file moving.
      </div>
    </Card>
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

function ExperienceModeCard({ t, client }: { t: ReturnType<typeof useTheme>["t"]; client: Client }) {
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

  return (
    <Card pad={18}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase" }}>
            Mobile experience mode
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            <span
              style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "5px 12px", borderRadius: 999,
                background: effective === "guided" ? t.brandSoft : t.petrolSoft,
                color: effective === "guided" ? t.brand : t.petrol,
                fontSize: 13, fontWeight: 700,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: 999, background: effective === "guided" ? t.brand : t.petrol }} />
              {MODE_LABEL[effective]}
            </span>
            {!isExplicit && (
              <span style={{ fontSize: 11, color: t.ink3 }}>
                (default — derived from {client.broker_id ? "Agent referral" : "self sign-up"})
              </span>
            )}
          </div>
          {(reason || lockedBy) && (
            <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>
              {reason ? REASON_LABEL[reason] : ""}
              {reason && lockedBy ? " · " : ""}
              {lockedBy ? `Locked by ${LOCKED_BY_LABEL[lockedBy]}` : ""}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ display: "inline-flex", border: `1px solid ${t.line}`, borderRadius: 9, overflow: "hidden" }}>
            {(["guided", "self_directed"] as const).map((m) => {
              const active = effective === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  disabled={!canEdit || busy}
                  title={!canEdit ? "You cannot change this client's experience mode." : undefined}
                  style={{
                    padding: "8px 14px",
                    background: active ? t.brand : t.surface2,
                    color: active ? "#fff" : t.ink,
                    border: "none",
                    fontSize: 12, fontWeight: 700,
                    cursor: !canEdit || busy ? "not-allowed" : "pointer",
                    opacity: !canEdit ? 0.55 : 1,
                  }}
                >
                  {MODE_LABEL[m]}
                </button>
              );
            })}
          </div>

          {canOverrideLock && lockTarget && (
            lockedBy === lockTarget || lockedBy === "super_admin" ? (
              <button
                onClick={() => setLock(null)}
                disabled={busy || (lockedBy === "super_admin" && user?.role !== "super_admin")}
                style={qcBtn(t)}
              >
                Unlock
              </button>
            ) : (
              <button onClick={() => setLock(lockTarget)} disabled={busy} style={qcBtn(t)}>
                Lock to {LOCKED_BY_LABEL[lockTarget]}
              </button>
            )
          )}
        </div>
      </div>

      {error && (
        <div style={{ marginTop: 10, fontSize: 12, color: t.danger, fontWeight: 700 }}>{error}</div>
      )}
    </Card>
  );
}

// Confirmation modal — shows the Lending Handoff Packet preview
// before firing, then the success state with what the Lending AI
// inherited + the first message it sent. Mirrors the spec's
// "Send to Lending / Review Summary First" flow.
function LendingHandoffModal({
  t,
  open,
  client,
  result,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  t: ReturnType<typeof useTheme>["t"];
  open: boolean;
  client: Client;
  result: { summary: string | null; firstQuestion: string | null; missingItems: string[]; lendingThreadId: string | null } | null;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  if (!open) return null;
  const succeeded = result !== null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Ready for Lending"
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 520, width: "100%",
          background: t.surface, borderRadius: 14, border: `1px solid ${t.line}`,
          padding: 24, display: "flex", flexDirection: "column", gap: 14,
        }}
      >
        {!succeeded ? (
          <>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginBottom: 6 }}>
                Ready to send {client.name} to lending?
              </div>
              <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.55 }}>
                The AI will:
              </div>
            </div>
            <ul style={{
              margin: 0, paddingLeft: 18, fontSize: 12.5, color: t.ink2,
              lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 3,
            }}>
              <li>Summarize the realtor conversation into a structured handoff</li>
              <li>Carry over relevant facts and uploaded files</li>
              <li>Identify missing lending items the Lending AI needs to collect</li>
              <li>Create a prequal quote in the funding queue</li>
              <li>Spawn a lending-side AI thread that already knows everything</li>
              <li>Notify the funding team via the AI Inbox</li>
            </ul>
            {error && (
              <div style={{
                padding: "8px 12px", borderRadius: 8,
                background: t.dangerBg, color: t.danger,
                fontSize: 12, fontWeight: 600,
              }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 4 }}>
              <button
                onClick={onClose}
                disabled={pending}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  background: t.surface2, color: t.ink, border: `1px solid ${t.line}`,
                  fontSize: 13, fontWeight: 700, cursor: pending ? "wait" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => onConfirm()}
                disabled={pending}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  background: t.brand, color: t.inverse, border: "none",
                  fontSize: 13, fontWeight: 700,
                  cursor: pending ? "wait" : "pointer",
                  opacity: pending ? 0.7 : 1,
                  display: "inline-flex", alignItems: "center", gap: 6,
                }}
              >
                <Icon name="bolt" size={12} />
                {pending ? "Handing off…" : "Send to Lending"}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginBottom: 4 }}>
                {client.name} moved to Lending Intake
              </div>
              <div style={{ fontSize: 13, color: t.ink3 }}>
                Funding team has been notified. The Lending AI started a fresh thread and already knows the context.
              </div>
            </div>
            {result?.summary && (
              <div style={{
                padding: "10px 12px", borderRadius: 9,
                background: t.brandSoft, color: t.ink2,
                fontSize: 12.5, lineHeight: 1.55, whiteSpace: "pre-wrap",
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  textTransform: "uppercase", color: t.brand, marginBottom: 4,
                }}>
                  Known from realtor side
                </div>
                {result.summary}
              </div>
            )}
            {result && result.missingItems.length > 0 && (
              <div>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  textTransform: "uppercase", color: t.ink3, marginBottom: 4,
                }}>
                  Lending AI will collect
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: t.ink2, lineHeight: 1.5 }}>
                  {result.missingItems.map((m) => (
                    <li key={m}>{m.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              </div>
            )}
            {result?.firstQuestion && (
              <div style={{
                padding: "10px 12px", borderRadius: 9,
                border: `1px dashed ${t.line}`, background: t.surface2,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1,
                  textTransform: "uppercase", color: t.ink3, marginBottom: 4,
                }}>
                  Lending AI's first question
                </div>
                <div style={{ fontSize: 12.5, color: t.ink, lineHeight: 1.5 }}>
                  {result.firstQuestion}
                </div>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button
                onClick={onClose}
                style={{
                  padding: "9px 14px", borderRadius: 9,
                  background: t.brand, color: t.inverse, border: "none",
                  fontSize: 13, fontWeight: 700, cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
