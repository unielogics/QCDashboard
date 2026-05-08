"use client";

// Funding Packages — one-click Lender Submission Package generator. Ships in
// P1; P0A is a placeholder so the sidebar entry resolves.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";

export default function FundingPackagesPage() {
  const { t } = useTheme();
  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <SectionLabel>Funding Packages</SectionLabel>
      <Card>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 16, fontWeight: 700, color: t.ink }}>
            <Icon name="docCheck" size={18} />
            Lender Submission Package generator — coming in P1
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.6, color: t.ink2 }}>
            One click compiles the borrower profile, property info, loan request, use of
            funds, credit snapshot, liquidity summary, documents received, missing items,
            both readiness scores, your notes, an AI summary, and a recommended lender
            match into a single PDF/page ready for the Funding Team.
          </div>
          <div style={{ fontSize: 13, color: t.ink3 }}>
            Track deal progress in your{" "}
            <Link href="/pipeline" style={{ color: t.petrol, textDecoration: "none", fontWeight: 600 }}>
              Pipeline →
            </Link>
          </div>
        </div>
      </Card>
    </div>
  );
}
