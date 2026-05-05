"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";

export default function RatesPage() {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Rate Sheet</h1>
      <Card pad={20}>
        <div style={{ color: t.ink3, fontSize: 13 }}>
          The full SKU table (8 lender SKUs from data-desk.js) is wired in the backend. Hooking it to a sortable editable table here is queued for the next pass — see plan.
        </div>
      </Card>
    </div>
  );
}
