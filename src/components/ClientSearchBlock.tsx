"use client";

// Shared "search an existing client by name or email" picker. Lifted
// from inline copies in AgentLeadModal and SmartIntakeModal which were
// near-duplicates differing only in label text and helper-line copy
// (parameterized as props here so each call site keeps its exact UX).

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import type { QCTokens } from "@/components/design-system/tokens";
import { useClients } from "@/hooks/useApi";
import type { ListScope } from "@/lib/types";

export interface ClientPickResult {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  client_type?: "buyer" | "seller" | null;
}

interface Props {
  t: QCTokens;
  onPick: (c: ClientPickResult) => void;
  label?: string;
  helperText?: ReactNode;
  scope?: ListScope;
}

export function ClientSearchBlock({
  t,
  onPick,
  label = "Find an existing client",
  helperText,
  scope,
}: Props) {
  const { data: clients = [] } = useClients(scope);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return clients
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [clients, query]);

  return (
    <div>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase", color: t.ink3, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ position: "relative" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "0 12px",
          background: t.surface2,
          border: `1px solid ${t.line}`,
          borderRadius: 9,
        }}>
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search by name or email…"
            style={{
              flex: 1, minWidth: 0,
              padding: "10px 0",
              background: "transparent", border: "none",
              color: t.ink, fontSize: 13, outline: "none",
              fontFamily: "inherit",
            }}
          />
        </div>
        {open && matches.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            marginTop: 4, background: t.surface,
            border: `1px solid ${t.line}`, borderRadius: 9,
            boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
            zIndex: 10, maxHeight: 240, overflow: "auto",
          }}>
            {matches.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onPick({
                    id: c.id,
                    name: c.name,
                    email: c.email ?? null,
                    phone: c.phone ?? null,
                    client_type: c.client_type ?? null,
                  });
                  setQuery("");
                  setOpen(false);
                }}
                style={{
                  all: "unset", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "9px 12px", borderBottom: `1px solid ${t.line}`,
                  width: "calc(100% - 24px)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.name}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {c.email ?? "—"}
                  </div>
                </div>
                <Icon name="arrowR" size={11} />
              </button>
            ))}
          </div>
        )}
      </div>
      {helperText ? (
        <div style={{ fontSize: 11, color: t.ink3, marginTop: 6 }}>{helperText}</div>
      ) : null}
    </div>
  );
}
