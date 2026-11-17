"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Callout, Card, Input, PageHeader } from "@/components/ds";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { canUseReferralIntake } from "@/lib/roleAccess";

type ReferralFile = {
  id: string;
  client_id?: string | null;
  full_name: string;
  business_name?: string | null;
  email: string;
  phone?: string | null;
  requested_program_name?: string | null;
  variant: string;
  archived_at?: string | null;
};

export default function ReferralClientsPage() {
  const api = useAuthedApi();
  const { data: user } = useCurrentUser();
  const [query, setQuery] = useState("");
  const files = useQuery({
    queryKey: ["referral-client-files", user?.id],
    enabled: canUseReferralIntake(user?.role),
    queryFn: async () => {
      const result: ReferralFile[] = [];
      let offset = 0;
      while (true) {
        const page = await api<{ items: ReferralFile[]; total: number }>(`/broker/ai-underwriter-leads?archived_filter=all&limit=100&offset=${offset}`);
        result.push(...page.items);
        offset += page.items.length;
        if (!page.items.length || offset >= page.total) return result;
      }
    },
  });
  const clients = useMemo(() => {
    const grouped = new Map<string, ReferralFile[]>();
    for (const file of files.data || []) {
      // Files without a linked client (including rescue matters) remain
      // separate; a submitter's email can represent several borrowers.
      const key = file.client_id || file.id;
      grouped.set(key, [...(grouped.get(key) || []), file]);
    }
    const needle = query.trim().toLowerCase();
    return [...grouped.entries()].filter(([, rows]) => rows.some((row) =>
      [row.full_name, row.business_name, row.email, row.phone].some((value) => value?.toLowerCase().includes(needle))));
  }, [files.data, query]);

  return <div className="grid">
    <PageHeader title="My clients" lede="Clients and matters from files assigned to your account, across programs." actions={<Link className="btn pri" href="/broker/programs">Start a file</Link>} />
    <Input aria-label="Search my clients" placeholder="Search client, business, email, or phone" value={query} onChange={(event) => setQuery(event.target.value)} />
    {files.isLoading ? <Card>Loading clients…</Card> : null}
    {files.error ? <Callout tone="bad">Clients could not be loaded. <button className="btn" onClick={() => void files.refetch()}>Try again</button></Callout> : null}
    {files.data && !clients.length ? <Card>No matching clients. Start a file to add your first referral.</Card> : null}
    {clients.map(([id, rows]) => <Card key={id}>
      <h2>{rows[0].business_name || rows[0].full_name}</h2>
      <p className="sub">{rows[0].full_name} · {rows[0].email}{rows[0].phone ? ` · ${rows[0].phone}` : ""}</p>
      <div className="grid g8">{rows.map((file) => <div key={file.id} className="row">
        <span className="grow">{file.requested_program_name || "Funding file"}</span>
        {file.archived_at ? <span className="sub">Archived</span> : <Link className="btn" href={`/broker/ai-underwriter-leads?lead=${file.id}`}>Open file</Link>}
      </div>)}</div>
    </Card>)}
  </div>;
}
