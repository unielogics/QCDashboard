"use client";

// Super-admin only — firm-wide lender roster.
//
// Search bar + sortable table; row click opens LenderEditModal in
// edit mode; "+ New lender" opens it in create mode. Lenders are
// soft-deleted (is_active=false) by default; the table shows a
// dimmed row + "Inactive" pill when that flag is off so admins can
// reactivate without re-creating.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// The roster query, the sort comparator, the search predicate and every modal
// hand-off are unchanged; only the surface vocabulary moved:
//   hand-rolled <table>       → Table / Tr / Td (`.tbl`), inside a Panel
//   sortable <th onClick>     → a real <button class="gridhd-c"> in the column
//                               label, so the sort is reachable from the
//                               keyboard (the old <th onClick> was not)
//   row <tr onClick>          → kept, PLUS a Linky on the lender name so the
//                               "open this lender" action is keyboard-reachable
//   dimmed inactive row       → `.tbl tr.done`, which already owns that opacity
//   Pill                      → CellChip tone

import { useMemo, useState } from "react";
import {
  Btn,
  CellChip,
  Input,
  Linky,
  PageHeader,
  Panel,
  Row,
  Sub,
  Table,
  Td,
  Tr,
  cx,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useActiveProfile } from "@/store/role";
import { Role, LoanTypeOptions } from "@/lib/enums.generated";
import { useLenders } from "@/hooks/useApi";
import { LenderEditModal } from "@/components/LenderEditModal";
import type { Lender } from "@/lib/types";
import { ConnectLenderHealthCard } from "./ConnectLenderHealthCard";
import { LenderLoansDrawer } from "./LenderLoansDrawer";

const PRODUCT_LABEL = new Map<string, string>(
  LoanTypeOptions.map((o) => [o.value, o.label]),
);

type SortKey = "name" | "products" | "contact" | "active";

export default function LendersAdminPage() {
  const profile = useActiveProfile();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [editing, setEditing] = useState<Lender | null>(null);
  const [creating, setCreating] = useState(false);
  const [drilldown, setDrilldown] = useState<Lender | null>(null);

  const { data: lenders = [], isLoading } = useLenders();

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = q
      ? lenders.filter((l) => {
          const hay = [
            l.name,
            l.contact_name,
            l.contact_email,
            l.submission_email,
            l.email_domain,
            ...(l.products || []),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : [...lenders];

    rows = rows.sort((a, b) => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sortKey) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "products":
          av = (a.products || []).length;
          bv = (b.products || []).length;
          break;
        case "contact":
          av = (a.contact_name || a.submission_email || "").toLowerCase();
          bv = (b.contact_name || b.submission_email || "").toLowerCase();
          break;
        case "active":
          av = a.is_active ? 1 : 0;
          bv = b.is_active ? 1 : 0;
          break;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return rows;
  }, [lenders, search, sortKey, sortDir]);

  if (profile.role !== Role.SUPER_ADMIN) {
    return (
      <Panel title="Super-admin only">
        <Sub>The Lenders roster is super-admin only.</Sub>
      </Panel>
    );
  }

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("asc");
    }
  };

  const th = (label: string, key: SortKey) => (
    <button
      type="button"
      className={cx("gridhd-c", sortKey === key && "on")}
      onClick={() => toggleSort(key)}
      aria-label={`Sort by ${label}`}
    >
      {label}
      {sortKey === key ? (
        <span className="sortarr" aria-hidden="true">{sortDir === "asc" ? "▲" : "▼"}</span>
      ) : null}
    </button>
  );

  return (
    <div className="grid">
      {/* The "Super admin" eyebrow the inline version carried above the title.
          PageHeader has no eyebrow slot, so it keeps its own line. */}
      <div><CellChip tone="pet" className="caps">Super admin</CellChip></div>
      <PageHeader
        title="Lenders"
        lede="Roster of lending counter-parties. Adding products here is what makes a lender appear in each loan's Connect-Lender dropdown — and connecting one is what activates the redaction + outbound-email machinery."
        actions={
          <Btn variant="pri" onClick={() => setCreating(true)}>
            <Icon name="plus" size={12} stroke={3} /> New lender
          </Btn>
        }
      />

      {/* Connect-Lender health probe — answers 'what is blocking it?' */}
      <ConnectLenderHealthCard />

      {/* Search */}
      <Row>
        <Input
          grow
          aria-label="Search lenders"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, contact, domain, product…"
        />
      </Row>

      {/* Table */}
      {isLoading ? (
        <Panel><Sub>Loading…</Sub></Panel>
      ) : visible.length === 0 ? (
        <Panel>
          <Sub>
            {search ? "No lenders match your search." : "No lenders yet — click ‘New lender’ to add one."}
          </Sub>
        </Panel>
      ) : (
        <Panel noPad>
          <Table
            caption="Lender roster"
            cols={[
              { label: th("Name", "name") },
              { label: th("Contact", "contact") },
              { label: th("Products", "products") },
              { label: th("Status", "active") },
              { label: "" },
            ]}
          >
            {visible.map((l) => (
              <Tr key={l.id} onClick={() => setEditing(l)} className={cx(!l.is_active && "done")}>
                <Td>
                  {/* The whole row is clickable with a mouse; this button is
                      what makes the same action reachable from the keyboard,
                      which a <tr onClick> never was. */}
                  <Linky
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditing(l);
                    }}
                  >
                    {l.name}
                  </Linky>
                  {l.email_domain ? <div className="sub">{l.email_domain}</div> : null}
                </Td>
                <Td>
                  {l.contact_name || l.contact_email || l.submission_email ? (
                    <>
                      <div>{l.contact_name || "—"}</div>
                      <div className="sub">{l.contact_email || l.submission_email || ""}</div>
                    </>
                  ) : (
                    <Sub>none</Sub>
                  )}
                </Td>
                <Td>
                  {l.products && l.products.length > 0 ? (
                    <Row>
                      {l.products.map((p) => (
                        <CellChip key={p}>{PRODUCT_LABEL.get(p) ?? p}</CellChip>
                      ))}
                    </Row>
                  ) : (
                    // A sentence, not a word — a `.cellchip` here is nowrap
                    // inside an overflow:hidden panel and would be clipped.
                    <div className="statusline c-bad">
                      no products — won&apos;t appear in dropdowns
                    </div>
                  )}
                </Td>
                <Td>
                  {l.is_active ? (
                    <CellChip tone="ok">Active</CellChip>
                  ) : (
                    <CellChip>Inactive</CellChip>
                  )}
                </Td>
                <Td align="r">
                  <Btn
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDrilldown(l);
                    }}
                  >
                    View loans →
                  </Btn>
                </Td>
              </Tr>
            ))}
          </Table>
        </Panel>
      )}

      <LenderEditModal
        open={creating || editing != null}
        lender={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <LenderLoansDrawer lender={drilldown} onClose={() => setDrilldown(null)} />
    </div>
  );
}
