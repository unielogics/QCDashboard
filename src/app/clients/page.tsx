"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SortableTableHead, TableRow, useSort } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useClients, useCurrentUser, useLoans } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { QC_FMT } from "@/components/design-system/tokens";

const COLS = [
  { label: "Client",   w: "minmax(0, 2fr)", key: "name" },
  { label: "Tier",     w: "100px",          key: "tier" },
  { label: "FICO",     w: "80px",  align: "right" as const, key: "fico" },
  { label: "Loans",    w: "70px",  align: "right" as const, key: "active_loans" },
  { label: "Exposure", w: "110px", align: "right" as const, key: "exposure" },
  { label: "City",     w: "140px",          key: "city" },
  { label: "Since",    w: "100px",          key: "since" },
];

export default function ClientsPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: clients = [] } = useClients();
  const { data: loans = [] } = useLoans();
  const [search, setSearch] = useState("");

  const canCreate = user?.role !== Role.CLIENT;

  // Compute exposure + active loans per client from the loans list.
  const enriched = useMemo(() => {
    const activeByClient = new Map<string, number>();
    const exposureByClient = new Map<string, number>();
    for (const l of loans) {
      if (l.stage !== "funded") {
        activeByClient.set(l.client_id, (activeByClient.get(l.client_id) ?? 0) + 1);
        exposureByClient.set(
          l.client_id,
          (exposureByClient.get(l.client_id) ?? 0) + Number(l.amount),
        );
      }
    }
    return clients.map((c) => ({
      ...c,
      active_loans: activeByClient.get(c.id) ?? 0,
      exposure: exposureByClient.get(c.id) ?? Number(c.funded_total),
    }));
  }, [clients, loans]);

  const filtered = useMemo(() => {
    if (!search.trim()) return enriched;
    const q = search.trim().toLowerCase();
    return enriched.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.city ?? "").toLowerCase().includes(q),
    );
  }, [enriched, search]);

  const { sort, onSort, compare } = useSort("exposure", "desc");
  const sorted = useMemo(() => [...filtered].sort(compare), [filtered, compare]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: -0.5, color: t.ink, margin: 0 }}>
          Clients
        </h1>
        <span style={{ color: t.ink3, fontSize: 14 }}>· {filtered.length} clients</span>

        <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              background: t.surface,
              border: `1px solid ${t.line}`,
              borderRadius: 10,
              padding: "6px 10px",
              width: 240,
            }}
          >
            <Icon name="search" size={14} style={{ color: t.ink3 }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, city…"
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                background: "transparent",
                fontSize: 12.5,
                color: t.ink,
                fontFamily: "inherit",
              }}
            />
          </div>
          {canCreate && (
            <Link
              href="/clients/new"
              style={{
                padding: "9px 14px",
                borderRadius: 10,
                background: t.ink,
                color: t.inverse,
                fontSize: 13,
                fontWeight: 700,
                textDecoration: "none",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
              }}
            >
              <Icon name="plus" size={14} /> New client
            </Link>
          )}
        </div>
      </div>

      <Card pad={0}>
        <SortableTableHead cols={COLS} sort={sort} onSort={onSort} />
        {sorted.map((c) => (
          <TableRow
            key={c.id}
            cols={COLS}
            onClick={() => (window.location.href = `/clients/${c.id}`)}
            values={[
              <div key="n">
                <div style={{ fontWeight: 700, color: t.ink }}>{c.name}</div>
                <div style={{ fontSize: 11, color: t.ink3 }}>{c.email}</div>
              </div>,
              <Pill key="t">{c.tier}</Pill>,
              <span key="f" style={{ fontFeatureSettings: '"tnum"', color: t.ink2 }}>{c.fico ?? "—"}</span>,
              <span key="l" style={{ fontFeatureSettings: '"tnum"', color: t.ink2 }}>{c.active_loans}</span>,
              <span key="e" style={{ fontWeight: 700, fontFeatureSettings: '"tnum"', color: t.ink }}>{QC_FMT.short(c.exposure)}</span>,
              <span key="c" style={{ color: t.ink3 }}>{c.city ?? "—"}</span>,
              <span key="s" style={{ color: t.ink3 }}>{c.since ? new Date(c.since).getFullYear() : "—"}</span>,
            ]}
          />
        ))}
        {sorted.length === 0 && (
          <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: t.ink3 }}>
            {search ? `No clients match "${search}".` : "No clients yet."}
            {canCreate && !search && (
              <>
                {" "}
                <Link href="/clients/new" style={{ color: t.petrol, fontWeight: 700 }}>
                  Create one →
                </Link>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
