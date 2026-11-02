"use client";

// Marketplace > Transfers: the secondary-market consent queue.
//
//   GET  /capital/admin/transfers[?status_filter=]
//   POST /capital/admin/transfers/{id}/consent | decline | complete
//
// A member lists a participation; another member requests it; nothing moves
// until the desk consents and, after settlement between the parties, marks
// it complete. Completing moves the principal: the buyer gets a funded
// participation and the seller's outstanding shrinks or closes.

import { useMemo, useState } from "react";
import { Btn, Card, Empty, Loading, PageHeader, Panel, Seg, StatusLine, Table, Td, Tr } from "@/components/ds";
import { useConfirmAction } from "@/components/design-system/ConfirmationProvider";
import { useCpTransferDecision, useCpTransfers, type CpTransfer, type CpTransferStatus } from "@/hooks/useCapitalPartners";
import { Status, SuperAdminOnly, TRANSFER_TONE, VERTICAL_LABEL, errorMessage, label, money, pct, when } from "@/components/marketplace/shared";

type Filter = CpTransferStatus | "all" | "action";

export default function TransfersPage() {
  return (
    <SuperAdminOnly>
      <Transfers />
    </SuperAdminOnly>
  );
}

function Transfers() {
  const [filter, setFilter] = useState<Filter>("action");
  const { data: rows = [], isLoading } = useCpTransfers();
  const decide = useCpTransferDecision();
  const confirm = useConfirmAction();
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const visible = useMemo(() => filter === "all" ? rows : filter === "action" ? rows.filter((r) => r.status === "pending_consent" || r.status === "approved") : rows.filter((r) => r.status === filter), [rows, filter]);
  const counts = useMemo(() => rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.status]: (acc[r.status] ?? 0) + 1 }), { all: rows.length, action: rows.filter((r) => r.status === "pending_consent" || r.status === "approved").length }), [rows]);

  const act = async (t: CpTransfer, decision: "consent" | "decline" | "complete") => {
    setMsg(null);
    const titles = { consent: `Consent to transfer ${t.ref}?`, decline: `Decline transfer ${t.ref}?`, complete: `Complete transfer ${t.ref}?` };
    const bodies = {
      consent: `${t.seller_name ?? "The seller"} transfers ${money(t.principal_amount)} of principal in ${t.listing_ref} to ${t.buyer_name ?? "the buyer"} at ${pct(t.ask_pct)} of par. Consent confirms the buyer is an approved accredited member and the transfer meets the offering documents' restrictions. Settlement happens between the parties.`,
      decline: "The listing returns nothing to anyone; the seller keeps the participation.",
      complete: `Moves ${money(t.principal_amount)} of principal to ${t.buyer_name ?? "the buyer"} now. Do this after the parties have settled.`,
    };
    const ok = await confirm({ title: titles[decision], body: bodies[decision], confirmLabel: label(decision), tone: decision === "decline" ? "danger" : "default" });
    if (!ok) return;
    const notes = window.prompt("Note for the record (optional):", "") ?? null;
    try {
      await decide.mutateAsync({ id: t.id, decision, notes: notes || null });
      setMsg({ tone: "ok", text: `${t.ref}: ${decision === "consent" ? "consented" : decision === "decline" ? "declined" : "completed"}.` });
    } catch (e) {
      setMsg({ tone: "bad", text: errorMessage(e) });
    }
  };

  return (
    <div className="grid">
      <PageHeader
        title="Secondary transfers"
        lede="Participations are restricted securities. A transfer completes only after your consent, confirmation that the buyer is an approved accredited member, and compliance with the transfer restrictions in the offering documents. Sellers set asking prices; the desk recommends none."
        actions={<Seg as="filter" ariaLabel="Transfer status" value={filter} onChange={setFilter} options={(["action", "listed", "pending_consent", "approved", "completed", "declined", "withdrawn", "all"] as Filter[]).map((s) => ({ value: s, label: (<>{s === "action" ? "Needs action" : label(s)} <span className="num">{counts[s] ?? 0}</span></>) }))} />}
      />
      {msg ? <StatusLine tone={msg.tone}>{msg.text}</StatusLine> : null}
      {isLoading ? <Card><Loading>Loading transfers…</Loading></Card> : visible.length === 0 ? <Empty title="No transfers in this status">Members list participations from the portal's Secondary tab.</Empty> : (
        <Panel noPad>
          <Table caption="Transfers" cols={[{ label: "Ref" }, { label: "Listing" }, { label: "Seller" }, { label: "Buyer" }, { label: "Principal", align: "r" }, { label: "Ask", align: "r" }, { label: "Implied yield", align: "r" }, { label: "Status" }, { label: "Requested" }, { label: "" }]}>
            {visible.map((t) => (
              <Tr key={t.id}>
                <Td className="num">{t.ref}</Td>
                <Td><div className="grid g4"><span>{t.listing_name}</span><span className="sub num">{t.listing_ref} · {VERTICAL_LABEL[t.vertical]} · {pct(t.note_rate_pct)} · {t.remaining_term_months != null ? `${t.remaining_term_months} mo left` : ""}</span></div></Td>
                <Td>{t.seller_name ?? "—"}</Td>
                <Td>{t.buyer_name ?? "—"}</Td>
                <Td className="num" align="r">{money(t.principal_amount)}</Td>
                <Td className="num" align="r">{pct(t.ask_pct)}</Td>
                <Td className="num" align="r">{pct(t.implied_yield_pct)}</Td>
                <Td><Status value={t.status} tones={TRANSFER_TONE} /></Td>
                <Td className="num">{when(t.requested_at)}</Td>
                <Td>
                  <div className="row">
                    {t.status === "pending_consent" ? <Btn size="sm" variant="pri" disabled={decide.isPending} onClick={() => void act(t, "consent")}>Consent</Btn> : null}
                    {t.status === "approved" ? <Btn size="sm" variant="pri" disabled={decide.isPending} onClick={() => void act(t, "complete")}>Complete</Btn> : null}
                    {t.status === "pending_consent" || t.status === "approved" || t.status === "listed" ? <Btn size="sm" className="danger" disabled={decide.isPending} onClick={() => void act(t, "decline")}>Decline</Btn> : null}
                  </div>
                </Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
