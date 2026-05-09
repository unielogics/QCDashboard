"use client";

import Link from "next/link";
import { Card, Pill, SectionLabel, StageBadge, VerifiedBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { QC_FMT } from "@/components/design-system/tokens";
import type { Activity, Document, Loan } from "@/lib/types";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"];

export function AgentLoanMirror({
  loan,
  docs,
  activity,
}: {
  loan: Loan;
  docs: Document[];
  activity: Activity[];
}) {
  const { t } = useTheme();
  const stageIndex = STAGE_KEYS.indexOf(loan.stage);
  const receivedDocs = docs.filter((doc) => doc.status === "received" || doc.status === "verified").length;
  const openDocs = docs.filter((doc) => doc.status !== "verified");
  const recent = activity.slice(0, 5);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={18}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 260 }}>
            <SectionLabel>Agent Funding Mirror</SectionLabel>
            <h2 style={{ margin: 0, color: t.ink, fontSize: 22, fontWeight: 850, letterSpacing: -0.4 }}>
              Funding status for your client.
            </h2>
            <div style={{ marginTop: 6, color: t.ink2, fontSize: 13, lineHeight: 1.55, maxWidth: 720 }}>
              This view keeps client and transaction coordination visible to the agent while underwriting,
              lender packaging, and internal calculations stay with the Funding Team.
            </div>
          </div>
          <Link
            href={`/clients/${loan.client_id}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              padding: "9px 12px",
              borderRadius: 10,
              background: t.surface2,
              color: t.ink,
              border: `1px solid ${t.line}`,
              textDecoration: "none",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            <Icon name="clients" size={14} />
            Client file
          </Link>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
        <Card pad={18}>
          <SectionLabel>Status</SectionLabel>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <StageBadge stage={stageIndex} />
            <Pill>{loan.type.replace(/_/g, " ")}</Pill>
          </div>
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <Mini t={t} label="Loan amount" value={QC_FMT.short(Number(loan.amount))} />
            <Mini t={t} label="Close" value={loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "Unset"} />
          </div>
        </Card>

        <Card pad={18}>
          <SectionLabel>Client Conditions</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <Mini t={t} label="Docs ready" value={`${receivedDocs}/${docs.length || 0}`} />
            <Mini t={t} label="Open items" value={openDocs.length} accent={openDocs.length ? t.warn : t.profit} />
          </div>
          <div style={{ marginTop: 12, fontSize: 12.5, color: t.ink3, lineHeight: 1.45 }}>
            Use this to keep your buyer or seller updated. The Funding Team owns review and approval.
          </div>
        </Card>

        <Card pad={18}>
          <SectionLabel>Agent Next Move</SectionLabel>
          <div style={{ display: "flex", gap: 9, color: t.ink2, fontSize: 13, lineHeight: 1.45 }}>
            <Icon name={openDocs.length ? "doc" : "check"} size={15} style={{ color: openDocs.length ? t.warn : t.profit, marginTop: 1 }} />
            <span>
              {openDocs.length
                ? "Help the client gather open documents and keep transaction parties aligned."
                : "Keep the client informed while funding moves the file through lender milestones."}
            </span>
          </div>
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: 14 }}>
        <Card pad={18}>
          <SectionLabel>Visible Document Items</SectionLabel>
          {openDocs.length === 0 ? (
            <div style={{ color: t.profit, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 800 }}>
              <Icon name="check" size={15} />
              No open client-facing document items.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {openDocs.slice(0, 8).map((doc) => (
                <div key={doc.id} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 96px", gap: 10, alignItems: "center", padding: "9px 11px", border: `1px solid ${t.line}`, borderRadius: 10 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 800, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                    <div style={{ marginTop: 2, fontSize: 11.5, color: t.ink3 }}>{doc.category ?? "Document"}</div>
                  </div>
                  <VerifiedBadge kind={doc.status === "flagged" ? "flagged" : "pending"} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card pad={18}>
          <SectionLabel>Recent Updates</SectionLabel>
          {recent.length === 0 ? (
            <div style={{ fontSize: 13, color: t.ink3 }}>No recent updates yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {recent.map((item) => (
                <div key={item.id} style={{ display: "flex", gap: 9, fontSize: 12.5, color: t.ink2, lineHeight: 1.4 }}>
                  <Icon name="audit" size={13} style={{ color: t.ink3, marginTop: 1 }} />
                  <div>
                    <div style={{ color: t.ink, fontWeight: 750 }}>{item.summary}</div>
                    <div style={{ marginTop: 2, color: t.ink3, fontSize: 11.5 }}>
                      {new Date(item.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Mini({
  t,
  label,
  value,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string | number;
  accent?: string;
}) {
  return (
    <div style={{ border: `1px solid ${t.line}`, borderRadius: 12, padding: "10px 12px", background: t.surface2 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: t.ink3, letterSpacing: 1.1, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: 5, fontSize: 18, fontWeight: 850, color: accent ?? t.ink, fontFeatureSettings: '"tnum"' }}>
        {value}
      </div>
    </div>
  );
}
