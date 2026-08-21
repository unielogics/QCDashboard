"use client";

// Lender portal — package list.
//
// Styling only: migrated off the inline token objects onto the plain-CSS
// design system in globals.css. Behaviour is unchanged — same LENDER role
// gate, same GET /lender/packages query, same loading / error / empty states.
//
// The rows stay real `<Link>` anchors rather than becoming `.tbl` rows: a
// whole-row anchor is what makes a package middle-clickable, focusable from
// the keyboard and openable in a new tab, and a `<tr onClick>` has none of
// that. The row grid ("name … status chevron") is `.filerow`, which is the
// dense-row shape this design system already carries.

import Link from "next/link";
import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Card, CellChip, PageHeader, Panel, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useLenderPortalPackages } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

export default function LenderPackagesPage() {
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const packages = useLenderPortalPackages();

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.LENDER) router.replace("/");
  }, [me, meLoading, router]);

  if (meLoading) {
    return (
      <Card>
        <span className="sub">Loading...</span>
      </Card>
    );
  }
  if (me && me.role !== Role.LENDER) return null;

  const rows = packages.data ?? [];

  return (
    <div className="grid">
      <PageHeader title="Packages" lede="Lender portal" />

      <Panel
        title="Available packages"
        actions={
          packages.isLoading ? (
            <CellChip tone="mut">Loading</CellChip>
          ) : (
            <CellChip tone="acc">{rows.length}</CellChip>
          )
        }
      >
        {packages.isError ? (
          <StatusLine tone="bad">
            {packages.error instanceof Error ? packages.error.message : "Could not load packages."}
          </StatusLine>
        ) : rows.length === 0 && !packages.isLoading ? (
          <div className="sub">No packages are assigned to this lender account.</div>
        ) : (
          <div>
            {rows.map((pkg) => (
              <Link
                key={pkg.id}
                href={`/lender/packages/${pkg.id}`}
                className="filerow"
                // `.filerow` owns the row geometry; these two undo the global
                // anchor colour and underline, which no class does.
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontWeight: 650,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {pkg.deal_id} - {pkg.address}
                  </span>
                  <span className="sub" style={{ display: "block", marginTop: 2 }}>
                    Expires {fmtDate(pkg.expires_at)}
                  </span>
                </span>
                <PortalStatus status={pkg.recipient_status} />
                <Icon name="chevR" size={15} />
              </Link>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

function PortalStatus({ status }: { status: string }) {
  if (status === "terms_submitted") return <CellChip tone="ok">terms submitted</CellChip>;
  if (status === "expired" || status === "revoked" || status === "no_quote")
    return <CellChip tone="bad">{status.replace("_", " ")}</CellChip>;
  return <CellChip tone="acc">{status}</CellChip>;
}

/**
 * Tinted status block. `.c-bad` owns the tint and the text colour; the inline
 * values are box geometry only — the tone classes in the stylesheet are
 * pill-shaped (`.cellchip`, nowrap) and a server error message is a sentence,
 * not a chip.
 */
function StatusLine({ tone, children }: { tone: ChipTone; children: ReactNode }) {
  return (
    <div
      className={`c-${tone}`}
      style={{ borderRadius: 10, padding: "9px 12px", fontSize: 12.5, fontWeight: 650, lineHeight: 1.45 }}
      role={tone === "bad" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
