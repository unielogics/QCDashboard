"use client";

// Profile — borrower-style identity page on desktop. Mirrors mobile
// qcmobile/app/(tabs)/profile.tsx. Operators see the same shell minus the
// credit card (operators don't have personal soft pulls).

import { useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Avatar, Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCurrentUser, useMyCredit } from "@/hooks/useApi";
import { CreditPullModal } from "@/components/CreditPullModal";
import { Role } from "@/lib/enums.generated";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  broker: "Account Exec",
  loan_exec: "Underwriter",
  client: "Borrower",
};

export default function ProfilePage() {
  const { t, isDark, toggle } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: credit } = useMyCredit();
  const [pullOpen, setPullOpen] = useState(false);
  const [pullMode, setPullMode] = useState<"first" | "rerun">("first");

  if (!user) {
    return (
      <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading profile…</div>
    );
  }

  const initials = user.name
    ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const isClient = user.role === Role.CLIENT;
  const verified = !!credit?.fico;

  return (
    <div style={{ padding: 24, maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Avatar label={initials} color={t.petrol} size={56} />
        <div>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: t.ink, letterSpacing: -0.4 }}>{user.name}</h1>
          <div style={{ fontSize: 12.5, color: t.ink3, marginTop: 4 }}>
            {ROLE_LABEL[user.role] ?? user.role} · {user.email}
          </div>
        </div>
      </div>

      {isClient && (
        <Card pad={20}>
          <SectionLabel>Credit</SectionLabel>
          {verified ? (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 40, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                  {credit.fico}
                </div>
                <Pill bg={t.profitBg} color={t.profit}>
                  <Icon name="check" size={11} stroke={3} /> Verified
                </Pill>
              </div>
              <div style={{ fontSize: 12.5, color: t.ink3, marginTop: 6 }}>
                Soft pull on file · valid through{" "}
                {credit.expires_at ? new Date(credit.expires_at).toLocaleDateString() : "—"}
              </div>
              <div
                style={{
                  marginTop: 14,
                  padding: 12,
                  borderRadius: 9,
                  background: t.warnBg,
                  color: t.warn,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Re-running replaces the existing pull and resets the 90-day window.
              </div>
              <div style={{ marginTop: 14 }}>
                <button
                  style={qcBtn(t)}
                  onClick={() => {
                    setPullMode("rerun");
                    setPullOpen(true);
                  }}
                >
                  <Icon name="refresh" size={13} /> Re-Run Soft Pull
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink, marginBottom: 4 }}>
                Credit Not Yet Verified
              </div>
              <div style={{ fontSize: 12.5, color: t.ink2, marginBottom: 14 }}>
                Complete a soft pull to unlock real rates and the application flow.
              </div>
              <button
                style={{ ...qcBtnPrimary(t), background: t.danger }}
                onClick={() => {
                  setPullMode("first");
                  setPullOpen(true);
                }}
              >
                <Icon name="lock" size={13} /> Start Soft Pull
              </button>
            </div>
          )}
        </Card>
      )}

      <Card pad={20}>
        <SectionLabel>Appearance</SectionLabel>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={() => isDark && toggle()}
            style={{
              ...qcBtn(t),
              background: !isDark ? t.ink : t.surface,
              color: !isDark ? t.inverse : t.ink2,
              border: !isDark ? "none" : `1px solid ${t.lineStrong}`,
              padding: "12px 16px",
              justifyContent: "center",
            }}
          >
            <Icon name="sun" size={14} /> {!isDark ? "Light Mode" : "Switch to Light"}
          </button>
          <button
            onClick={() => !isDark && toggle()}
            style={{
              ...qcBtn(t),
              background: isDark ? t.ink : t.surface,
              color: isDark ? t.inverse : t.ink2,
              border: isDark ? "none" : `1px solid ${t.lineStrong}`,
              padding: "12px 16px",
              justifyContent: "center",
            }}
          >
            <Icon name="moon" size={14} /> {isDark ? "Dark Mode" : "Switch to Dark"}
          </button>
        </div>
      </Card>

      <Card pad={20}>
        <SectionLabel>Account</SectionLabel>
        <div style={{ fontSize: 12.5, color: t.ink3, lineHeight: 1.6 }}>
          Sign-out and account management live in the avatar menu in the sidebar (bottom-left).
          Manage your password, MFA, and connected devices from there.
        </div>
      </Card>

      <CreditPullModal
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        initialName={user.name}
        initialEmail={user.email}
        mode={pullMode}
      />
    </div>
  );
}
