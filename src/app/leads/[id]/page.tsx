"use client";

// Lead detail — single-Lead workspace with status, contact, source, notes,
// and a placeholder for the Next Best Actions block (P1 engine). Includes
// a placeholder "Invite Borrower" CTA that will open InviteBorrowerPanel
// once that component lands (next todo).

import { useParams } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useLead } from "@/hooks/useApi";
import { InviteBorrowerPanel } from "@/components/InviteBorrowerPanel";

export default function LeadDetailPage() {
  const { t } = useTheme();
  const params = useParams<{ id: string }>();
  const leadId = params?.id;
  const { data: lead, isLoading, isError } = useLead(leadId);
  const [inviteOpen, setInviteOpen] = useState(false);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href="/leads" style={{ color: t.petrol, textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="arrowL" size={13} /> Back to Leads
      </Link>

      {isLoading && (
        <Card><div style={{ color: t.ink3 }}>Loading…</div></Card>
      )}

      {isError && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 13 }}>
            <Icon name="alert" size={14} />
            The Lead detail endpoint isn&apos;t live yet.
          </div>
        </Card>
      )}

      {lead && (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
                {lead.name}
              </h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <Pill bg={t.petrolSoft} color={t.petrol}>{lead.status}</Pill>
                <Pill bg={t.chip} color={t.ink2}>source · {lead.source.replace(/_/g, " ")}</Pill>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {lead.client_id ? (
                <Link href={`/clients/${lead.client_id}`} style={{ ...qcBtn(t), textDecoration: "none" }}>
                  Open Borrower →
                </Link>
              ) : (
                <button onClick={() => setInviteOpen(true)} style={qcBtnPrimary(t)}>
                  <Icon name="send" size={13} /> Invite Borrower
                </button>
              )}
            </div>
          </div>

          <SectionLabel>Contact</SectionLabel>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
              <Field t={t} label="Email" value={lead.email} />
              <Field t={t} label="Phone" value={lead.phone} />
              <Field t={t} label="Created" value={new Date(lead.created_at).toLocaleDateString()} />
            </div>
          </Card>

          {lead.notes && (
            <>
              <SectionLabel>Notes</SectionLabel>
              <Card>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: t.ink, whiteSpace: "pre-wrap" }}>
                  {lead.notes}
                </div>
              </Card>
            </>
          )}

          <SectionLabel>Next Best Actions</SectionLabel>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 13 }}>
              <Icon name="spark" size={14} />
              The Next Best Action engine ships in P1. It will surface contextual tasks
              here (call, doc request, intake nudge) based on engagement signals and
              extracted facts from this Lead&apos;s shared Deal Intelligence record.
            </div>
          </Card>

          <InviteBorrowerPanel
            open={inviteOpen}
            onClose={() => setInviteOpen(false)}
            lead={lead}
          />
        </>
      )}
    </div>
  );
}

function Field({ t, label, value }: { t: ReturnType<typeof useTheme>["t"]; label: string; value: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, color: t.ink }}>
        {value || <span style={{ color: t.ink3 }}>—</span>}
      </div>
    </div>
  );
}
