"use client";

// Marketplace > Listings: every loan participation the desk has cut, by status.
//
//   GET /capital/admin/listings[?status_filter=]
//
// "New listing" goes to the source picker (/admin/marketplace/new), which
// prefills a draft from a funded file. A draft becomes visible to members
// only after Publish on the editor, and never before the member's own gate.

import { useMemo, useState } from "react";
import Link from "next/link";
import { BtnLink, Card, CellChip, Empty, Loading, PageHeader, Panel, Seg, Table, Td, Tr } from "@/components/ds";
import { useCpListings, type CpListingStatus } from "@/hooks/useCapitalPartners";
import { LISTING_TONE, SuperAdminOnly, VERTICAL_LABEL, day, money, pct } from "@/components/marketplace/shared";
import { MarketplaceOfferLink } from "@/components/marketplace/MarketplaceOfferLink";

type FilterId = CpListingStatus | "all" | "live";
const FILTERS: { id: FilterId; label: string }[] = [
  { id: "live", label: "Live" },
  { id: "draft", label: "Draft" },
  { id: "open", label: "Open" },
  { id: "closing", label: "Closing" },
  { id: "fully_subscribed", label: "Fully subscribed" },
  { id: "funded", label: "Funded" },
  { id: "repaid", label: "Repaid" },
  { id: "workout", label: "Workout" },
  { id: "withdrawn", label: "Withdrawn" },
  { id: "all", label: "All" },
];
const LIVE: CpListingStatus[] = ["open", "closing", "fully_subscribed"];

export default function MarketplaceListingsPage() {
  return (
    <SuperAdminOnly>
      <Listings />
    </SuperAdminOnly>
  );
}

function Listings() {
  const [filter, setFilter] = useState<FilterId>("live");
  const { data: rows = [], isLoading } = useCpListings();
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: rows.length, live: 0 };
    for (const r of rows) {
      c[r.status] = (c[r.status] ?? 0) + 1;
      if (LIVE.includes(r.status)) c.live += 1;
    }
    return c;
  }, [rows]);
  const visible = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "live") return rows.filter((r) => LIVE.includes(r.status));
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  return (
    <div className="grid">
      <PageHeader
        title="Marketplace listings"
        lede="Loan participations offered to capital partners under Rule 506(b). Nothing here is visible to a member until it is published, and never before that member clears the accreditation review and waiting period."
        actions={
          <div className="row">
            <Seg as="filter" ariaLabel="Filter by status" value={filter} onChange={setFilter} options={FILTERS.map((f) => ({ value: f.id, label: (<>{f.label} <span className="num">{counts[f.id] ?? 0}</span></>) }))} />
            <BtnLink href="/admin/marketplace/new" variant="pri">New listing</BtnLink>
          </div>
        }
      />
      {isLoading ? (
        <Card><Loading>Loading listings…</Loading></Card>
      ) : visible.length === 0 ? (
        <Empty title="No listings in this status">Publish a funded file from a loan page, or start from New listing.</Empty>
      ) : (
        <Panel noPad>
          <Table caption="Listings" cols={[{ label: "Ref" }, { label: "Listing" }, { label: "Program" }, { label: "Rate", align: "r" }, { label: "Term", align: "r" }, { label: "Offered", align: "r" }, { label: "Committed" }, { label: "Status" }, { label: "First sale" }, { label: "Published" }]}>
            {visible.map((r) => (
              <Tr key={r.id}>
                <Td className="num"><Link href={`/admin/marketplace/${r.id}`} className="linky">{r.ref}</Link></Td>
                <Td>
                  <div className="grid g4">
                    <Link href={`/admin/marketplace/${r.id}`} className="linky">{r.name}</Link>
                    <span className="sub">{VERTICAL_LABEL[r.vertical] ?? r.vertical}{r.place ? ` · ${r.place}` : ""}{r.collateral_type ? ` · ${r.collateral_type}` : ""}</span>
                    <MarketplaceOfferLink listing={r} compact showStatus={false} />
                  </div>
                </Td>
                <Td>{r.program_label}</Td>
                <Td className="num" align="r">{pct(r.note_rate_pct)}</Td>
                <Td className="num" align="r">{r.term_months ? `${r.term_months} mo` : "—"}</Td>
                <Td className="num" align="r">{money(r.offered_amount, true)}</Td>
                <Td>
                  <div className="grid g4" style={{ minWidth: 140 }}>
                    <span className="num sub">{money(r.committed_amount, true)} of {money(r.offered_amount, true)} · {r.pct_committed}%</span>
                    <span style={{ height: 5, borderRadius: 999, background: "var(--sunken, #eef1f5)", overflow: "hidden", display: "block" }}>
                      <span style={{ display: "block", height: "100%", width: `${r.pct_committed}%`, background: "var(--accent, #1b4b9e)" }} />
                    </span>
                  </div>
                </Td>
                <Td><CellChip tone={LISTING_TONE[r.status]}>{r.status.replace(/_/g, " ")}</CellChip></Td>
                <Td className="num">{day(r.funded_at ?? null) === "—" && r.status === "draft" ? "—" : day((r as unknown as { first_sale_at?: string | null }).first_sale_at ?? null)}</Td>
                <Td className="num">{day(r.published_at)}</Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}
    </div>
  );
}
