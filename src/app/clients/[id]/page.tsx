"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useClient, useCreditSummary, useCurrentCredit, useDocumentsForClient, useLoans, useParsedReport, useUpdateClient } from "@/hooks/useApi";
import { CreditSummaryCard } from "@/components/CreditSummaryCard";
import { CreditReportDetail } from "@/components/CreditReportDetail";
import { useActiveProfile } from "@/store/role";
import { QC_FMT } from "@/components/design-system/tokens";
import { parseIntStrict } from "@/lib/formCoerce";
import type { Client, Document, Loan } from "@/lib/types";

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
  const updateClient = useUpdateClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Client>>({});
  const [error, setError] = useState<string | null>(null);

  const canEdit = profile.role !== "client";

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
  const subjectLoanIds = new Set(clientLoans.filter((l) => l.stage !== "funded").map((l) => l.id));
  const reoLoanIds = new Set(clientLoans.filter((l) => l.stage === "funded").map((l) => l.id));
  const loanById = Object.fromEntries(clientLoans.map((l) => [l.id, l] as const));
  const visible = docs.filter((d) =>
    (tab === "subject" ? subjectLoanIds : reoLoanIds).has(d.loan_id),
  );
  const subjectCount = docs.filter((d) => subjectLoanIds.has(d.loan_id)).length;
  const reoCount = docs.filter((d) => reoLoanIds.has(d.loan_id)).length;

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
