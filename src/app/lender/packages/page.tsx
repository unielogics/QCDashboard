"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useCurrentUser, useLenderPortalPackages } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

export default function LenderPackagesPage() {
  const { t } = useTheme();
  const router = useRouter();
  const { data: me, isLoading: meLoading } = useCurrentUser();
  const packages = useLenderPortalPackages();

  useEffect(() => {
    if (!meLoading && me && me.role !== Role.LENDER) router.replace("/");
  }, [me, meLoading, router]);

  if (meLoading) {
    return <Card pad={18}><span style={{ color: t.ink3, fontSize: 13 }}>Loading...</span></Card>;
  }
  if (me && me.role !== Role.LENDER) return null;

  const rows = packages.data ?? [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 850, letterSpacing: 1.6, textTransform: "uppercase", color: t.petrol }}>
          Lender portal
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 850, margin: "6px 0 0", color: t.ink }}>
          Packages
        </h1>
      </div>

      <Card pad={0}>
        <div style={{ padding: "13px 16px", borderBottom: `1px solid ${t.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <SectionLabel>Available packages</SectionLabel>
          {packages.isLoading ? <Pill bg={t.chip} color={t.ink3}>Loading</Pill> : <Pill bg={t.brandSoft} color={t.brand}>{rows.length}</Pill>}
        </div>
        {packages.isError ? (
          <div style={{ padding: 16, fontSize: 13, color: t.danger }}>
            {packages.error instanceof Error ? packages.error.message : "Could not load packages."}
          </div>
        ) : rows.length === 0 && !packages.isLoading ? (
          <div style={{ padding: 16, fontSize: 13, color: t.ink3 }}>
            No packages are assigned to this lender account.
          </div>
        ) : (
          <div>
            {rows.map((pkg) => (
              <Link
                key={pkg.id}
                href={`/lender/packages/${pkg.id}`}
                style={{
                  textDecoration: "none",
                  color: "inherit",
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1fr) auto auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "13px 16px",
                  borderTop: `1px solid ${t.line}`,
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 13.5, fontWeight: 850, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {pkg.deal_id} - {pkg.address}
                  </span>
                  <span style={{ display: "block", fontSize: 11.5, color: t.ink3, marginTop: 3 }}>
                    Expires {fmtDate(pkg.expires_at)}
                  </span>
                </span>
                <PortalStatus t={t} status={pkg.recipient_status} />
                <Icon name="chevR" size={15} color={t.ink3} />
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function PortalStatus({ t, status }: { t: ReturnType<typeof useTheme>["t"]; status: string }) {
  if (status === "terms_submitted") return <Pill bg={t.profitBg} color={t.profit}>terms submitted</Pill>;
  if (status === "expired" || status === "revoked" || status === "no_quote") return <Pill bg={t.dangerBg} color={t.danger}>{status.replace("_", " ")}</Pill>;
  return <Pill bg={t.brandSoft} color={t.brand}>{status}</Pill>;
}

function fmtDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
