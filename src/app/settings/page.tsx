"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";

export default function SettingsPage() {
  const { t } = useTheme();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: t.ink, margin: 0 }}>Settings</h1>
      <Card pad={20}>
        <div style={{ color: t.ink3, fontSize: 13 }}>
          Loan-type doc checklists, AI cadence, and referral approval workflow are wired in the backend.
          Settings UI polish queued for the next pass.
        </div>
      </Card>
    </div>
  );
}
