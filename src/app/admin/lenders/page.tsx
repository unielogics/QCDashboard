"use client";

// Super-admin only — firm-wide lender roster.
//
// Search bar + sortable table; row click opens LenderEditModal in
// edit mode; "+ New lender" opens it in create mode. Lenders are
// soft-deleted (is_active=false) by default; the table shows a
// dimmed row + "Inactive" pill when that flag is off so admins can
// reactivate without re-creating.

import { useMemo, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
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
  const { t } = useTheme();
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
      <div style={{ padding: 24 }}>
        <Card pad={20}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            The Lenders roster is super-admin only.
          </div>
        </Card>
      </div>
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

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
            Super admin
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>
            Lenders
          </h1>
          <div style={{ fontSize: 12, color: t.ink3, marginTop: 4, lineHeight: 1.5, maxWidth: 720 }}>
            Roster of lending counter-parties. Adding products here is what makes a lender appear in
            each loan&apos;s Connect-Lender dropdown — and connecting one is what activates the
            redaction + outbound-email machinery.
          </div>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "10px 16px",
            borderRadius: 10,
            background: t.petrol,
            color: "#fff",
            fontSize: 13,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <Icon name="plus" size={12} stroke={3} /> New lender
        </button>
      </div>

      {/* Connect-Lender health probe — answers 'what is blocking it?' */}
      <ConnectLenderHealthCard />

      {/* Search */}
      <Card pad={12}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, contact, domain, product…"
          style={{
            width: "100%",
            padding: "10px 12px",
            background: t.surface2,
            border: `1px solid ${t.line}`,
            borderRadius: 10,
            color: t.ink,
            fontSize: 13,
            fontFamily: "inherit",
            outline: "none",
          }}
        />
      </Card>

      {/* Table */}
      <Card pad={0}>
        {isLoading ? (
          <div style={{ padding: 18, fontSize: 12.5, color: t.ink3 }}>Loading…</div>
        ) : visible.length === 0 ? (
          <div style={{ padding: 18, fontSize: 12.5, color: t.ink3 }}>
            {search ? "No lenders match your search." : "No lenders yet — click ‘New lender’ to add one."}
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ background: t.surface2 }}>
                <Th t={t} active={sortKey === "name"} dir={sortDir} onClick={() => toggleSort("name")}>Name</Th>
                <Th t={t} active={sortKey === "contact"} dir={sortDir} onClick={() => toggleSort("contact")}>Contact</Th>
                <Th t={t} active={sortKey === "products"} dir={sortDir} onClick={() => toggleSort("products")}>Products</Th>
                <Th t={t} active={sortKey === "active"} dir={sortDir} onClick={() => toggleSort("active")}>Status</Th>
                <th style={{ padding: "10px 14px" }}></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((l) => (
                <tr
                  key={l.id}
                  onClick={() => setEditing(l)}
                  style={{
                    cursor: "pointer",
                    borderTop: `1px solid ${t.line}`,
                    opacity: l.is_active ? 1 : 0.65,
                  }}
                >
                  <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                    <div style={{ fontWeight: 700, color: t.ink }}>{l.name}</div>
                    {l.email_domain ? (
                      <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{l.email_domain}</div>
                    ) : null}
                  </td>
                  <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                    {l.contact_name || l.contact_email || l.submission_email ? (
                      <>
                        <div style={{ color: t.ink }}>{l.contact_name || "—"}</div>
                        <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                          {l.contact_email || l.submission_email || ""}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: t.ink4, fontStyle: "italic" }}>none</span>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                    {l.products && l.products.length > 0 ? (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {l.products.map((p) => (
                          <Pill key={p} bg={t.surface2} color={t.ink2}>
                            {PRODUCT_LABEL.get(p) ?? p}
                          </Pill>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: t.danger, fontSize: 11.5 }}>
                        no products — won&apos;t appear in dropdowns
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "12px 14px", verticalAlign: "top" }}>
                    {l.is_active ? (
                      <Pill bg={t.profitBg} color={t.profit}>Active</Pill>
                    ) : (
                      <Pill bg={t.surface2} color={t.ink3}>Inactive</Pill>
                    )}
                  </td>
                  <td
                    style={{
                      padding: "12px 14px",
                      verticalAlign: "top",
                      textAlign: "right",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDrilldown(l);
                      }}
                      style={{
                        all: "unset",
                        cursor: "pointer",
                        padding: "6px 10px",
                        borderRadius: 8,
                        border: `1px solid ${t.line}`,
                        background: t.surface,
                        fontSize: 11.5,
                        fontWeight: 700,
                        color: t.brand,
                      }}
                    >
                      View loans →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

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

interface ThProps {
  t: ReturnType<typeof useTheme>["t"];
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  children: React.ReactNode;
}

function Th({ t, active, dir, onClick, children }: ThProps) {
  return (
    <th
      onClick={onClick}
      style={{
        textAlign: "left",
        padding: "10px 14px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        color: active ? t.brand : t.ink3,
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {children}
      {active ? <span style={{ marginLeft: 4 }}>{dir === "asc" ? "▲" : "▼"}</span> : null}
    </th>
  );
}
