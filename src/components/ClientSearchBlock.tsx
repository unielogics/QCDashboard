"use client";

// Shared "search an existing client by name or email" picker. Lifted
// from inline copies in AgentLeadModal and SmartIntakeModal which were
// near-duplicates differing only in label text and helper-line copy
// (parameterized as props here so each call site keeps its exact UX).

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { Field } from "@/components/ds";
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
  onPick: (c: ClientPickResult) => void;
  label?: string;
  helperText?: ReactNode;
  scope?: ListScope;
}

export function ClientSearchBlock({
  onPick,
  label = "Find an existing client",
  helperText,
  scope,
}: Props) {
  const { data: clients = [] } = useClients(scope);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  // Empty query → show the agent's whole book (capped) so clicking the
  // field is enough to surface clients without typing. Once the user
  // starts typing we filter by name OR email substring (case-insensitive).
  // Cap at 8 visible — list scrolls inside the dropdown beyond that.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients.slice(0, 8);
    return clients
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [clients, query]);

  const showEmptyBook = open && matches.length === 0 && clients.length === 0;
  const showNoMatch = open && matches.length === 0 && clients.length > 0 && !!query.trim();

  return (
    <Field label={label} hint={helperText}>
      {/* The dropdown is positioned against this, not against the Field, so
          the helper line underneath does not push it down. */}
      <div className="csearch">
        <div className="csearch-in">
          <Icon name="search" size={14} />
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="Search by name or email…"
            role="combobox"
            aria-expanded={open && matches.length > 0}
            aria-autocomplete="list"
          />
        </div>

        {showEmptyBook ? (
          <div className="popmenu csearch-pop">
            <p className="sub csearch-note">
              You don&apos;t have any clients yet — fill out the form below to add your first one.
            </p>
          </div>
        ) : null}

        {showNoMatch ? (
          <div className="popmenu csearch-pop">
            <p className="sub csearch-note">
              No clients match &ldquo;{query.trim()}&rdquo;. You can still create a new one below.
            </p>
          </div>
        ) : null}

        {open && matches.length > 0 ? (
          <div className="popmenu csearch-pop scroll" role="listbox">
            {!query.trim() ? <div className="lbl mhd">Your clients</div> : null}
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={false}
                className="mi csearch-hit"
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
              >
                <span className="grow">
                  {/* Was `width: calc(100% - 24px)` on an `all: unset` button —
                      which also unsets box-sizing, so every row rendered 24px
                      narrower than the menu it sat in. */}
                  <b className="trunc">{c.name}</b>
                  <span className="sub trunc">{c.email ?? "—"}</span>
                </span>
                <Icon name="arrowR" size={11} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </Field>
  );
}
