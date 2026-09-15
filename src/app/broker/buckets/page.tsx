"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Callout, CellChip, Input, PageHeader, Panel } from "@/components/ds";
import { useAuthedFetch } from "@/hooks/useAuthedFetch";
import { useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

type DealerRoom = {
  id: string;
  bucket_id: string;
  bucket_name: string;
  full_name: string;
  business_name?: string | null;
  file_count: number;
  missing_required_count: number;
  updated_at: string;
};

type DealerRoomPage = { items: DealerRoom[]; total: number };

export default function DealerPartnerBucketsPage() {
  const call = useAuthedFetch();
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const [rooms, setRooms] = useState<DealerRoom[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (userLoading || user?.role !== Role.DEALER_PARTNER) return;
    let cancelled = false;
    setLoading(true);
    call<DealerRoomPage>("/broker/ai-underwriter-leads?limit=100&offset=0")
      .then((response) => { if (!cancelled) setRooms(response.items); })
      .catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Document rooms are unavailable."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [call, user?.role, userLoading]);

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return rooms;
    return rooms.filter((room) => [room.bucket_name, room.business_name, room.full_name]
      .some((value) => String(value || "").toLocaleLowerCase().includes(needle)));
  }, [query, rooms]);

  if (!userLoading && user?.role !== Role.DEALER_PARTNER) {
    return <Callout tone="bad">This workspace is available only to Auto Dealer Agent accounts.</Callout>;
  }

  return <div className="grid">
    <PageHeader
      eyebrow="Dealer AI Intake"
      title="Document rooms"
      lede="Only the auto-industry leads assigned to your account"
      actions={<Link className="btn pri" href="/broker/ai-underwriter-leads">Open AI intake</Link>}
    />
    <Panel title="Your dealer files" sub={`${visible.length} of ${rooms.length} rooms`}>
      <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search dealership, client, or room…" aria-label="Search document rooms" />
      {error ? <Callout tone="bad">{error}</Callout> : null}
      {loading ? <div className="sub mt">Loading document rooms…</div> : null}
      {!loading && !visible.length ? <div className="empty mt">No matching dealer document rooms.</div> : null}
      <div className="grid g8 mt">
        {visible.map((room) => <article key={room.id} className="pick">
          <div className="grow">
            <strong>{room.business_name || room.bucket_name || room.full_name}</strong>
            <div className="sub">{room.full_name} · Updated {new Date(room.updated_at).toLocaleDateString()}</div>
            <div className="row mt">
              <CellChip tone="mut">{room.file_count} file{room.file_count === 1 ? "" : "s"}</CellChip>
              <CellChip tone={room.missing_required_count ? "warn" : "ok"}>{room.missing_required_count ? `${room.missing_required_count} missing` : "Complete"}</CellChip>
            </div>
          </div>
          <Link className="btn" href={`/broker/ai-underwriter-leads?lead=${room.id}`}>Open room</Link>
        </article>)}
      </div>
    </Panel>
  </div>;
}
