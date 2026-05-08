"use client";

// Deal detail — single-Deal workspace. Shows status, type, property, linked
// Lead / Borrower, both readiness scores, last movement date, and a
// placeholder action area for AI tasks (P1 engine).

import { useParams } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useDeal, useLead, useClient } from "@/hooks/useApi";
import type { DealStatus } from "@/lib/types";

const STATUS_LABEL: Record<DealStatus, string> = {
  exploring: "Exploring",
  intake: "Intake",
  prequalified: "Prequalified",
  under_contract: "Under Contract",
  submitted: "Submitted",
  in_uw: "In UW",
  clear_to_close: "Clear to Close",
  funded: "Funded",
  lost: "Lost",
};

const TYPE_LABEL: Record<string, string> = {
  purchase: "Purchase",
  refi: "Refinance",
  bridge: "Bridge",
  fix_flip: "Fix & Flip",
  ground_up: "Ground Up",
  dscr_purchase: "DSCR Purchase",
  dscr_refi: "DSCR Refinance",
};

export default function DealDetailPage() {
  const { t } = useTheme();
  const params = useParams<{ id: string }>();
  const dealId = params?.id;
  const { data: deal, isLoading, isError } = useDeal(dealId);
  const { data: lead } = useLead(deal?.lead_id);
  const { data: client } = useClient(deal?.client_id);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>
      <Link href="/deals" style={{ color: t.petrol, textDecoration: "none", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }}>
        <Icon name="arrowL" size={13} /> Back to Deals
      </Link>

      {isLoading && <Card><div style={{ color: t.ink3 }}>Loading…</div></Card>}

      {isError && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 13 }}>
            <Icon name="alert" size={14} />
            The Deal detail endpoint isn&apos;t live yet.
          </div>
        </Card>
      )}

      {deal && (
        <>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
                {TYPE_LABEL[deal.type] ?? deal.type}
              </div>
              <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: "4px 0 0" }}>
                {deal.property_address || <span style={{ color: t.ink3 }}>Property TBD</span>}
              </h1>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                <Pill bg={t.petrolSoft} color={t.petrol}>{STATUS_LABEL[deal.status]}</Pill>
                {deal.last_movement_at && (
                  <Pill bg={t.chip} color={t.ink2}>
                    last update {new Date(deal.last_movement_at).toLocaleDateString()}
                  </Pill>
                )}
              </div>
            </div>
          </div>

          <SectionLabel>Readiness</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
            <ReadinessCard
              t={t}
              label="Deal Readiness"
              hint="Is this a real, active, closeable opportunity?"
              score={deal.deal_readiness_score}
            />
            <ReadinessCard
              t={t}
              label="Funding File Readiness"
              hint="Is the lending package ready for the Funding Team?"
              score={deal.funding_file_readiness_score}
            />
          </div>

          <SectionLabel>Linked Records</SectionLabel>
          <Card>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <LinkField
                t={t}
                label="Lead"
                href={lead ? `/leads/${lead.id}` : null}
                value={lead?.name ?? null}
              />
              <LinkField
                t={t}
                label="Borrower"
                href={client ? `/clients/${client.id}` : null}
                value={client?.name ?? null}
              />
              <Field
                t={t}
                label="Created"
                value={new Date(deal.created_at).toLocaleDateString()}
              />
            </div>
          </Card>

          <SectionLabel>Next Best Actions</SectionLabel>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 10, color: t.ink3, fontSize: 13 }}>
              <Icon name="spark" size={14} />
              The Next Best Action engine ships in P1. Tasks generated here will route
              to the Agent Inbox (relationship work) and the Funding AI Inbox (lender
              packaging, doc validation, escalations) per the shared Deal Intelligence
              Core routing rules.
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function ReadinessCard({
  t,
  label,
  hint,
  score,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  hint: string;
  score: number | null;
}) {
  const pct = score ?? 0;
  const color =
    score == null ? t.ink3 : score >= 80 ? t.profit : score >= 50 ? t.warn : t.danger;
  return (
    <Card>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: t.ink3 }}>
          {label}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <div style={{ fontSize: 32, fontWeight: 700, color, letterSpacing: -0.6 }}>
            {score ?? "—"}
          </div>
          {score != null && <div style={{ fontSize: 13, color: t.ink3 }}>/100</div>}
        </div>
        <div style={{ height: 4, borderRadius: 2, background: t.line, overflow: "hidden" }}>
          <div
            style={{
              width: score == null ? 0 : `${pct}%`,
              height: "100%",
              background: color,
              transition: "width .3s ease",
            }}
          />
        </div>
        <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>{hint}</div>
        {score == null && (
          <div style={{ fontSize: 11, color: t.ink3, fontStyle: "italic" }}>
            Engine ships in P1. Score will compute on every Deal-affecting event.
          </div>
        )}
      </div>
    </Card>
  );
}

function Field({
  t,
  label,
  value,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string | null;
}) {
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

function LinkField({
  t,
  label,
  href,
  value,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  href: string | null;
  value: string | null;
}) {
  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.0, textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {href && value ? (
        <Link href={href} style={{ fontSize: 13, color: t.petrol, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
          {value} <Icon name="arrowR" size={12} />
        </Link>
      ) : (
        <div style={{ fontSize: 13, color: t.ink3 }}>—</div>
      )}
    </div>
  );
}
