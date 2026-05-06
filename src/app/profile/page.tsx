"use client";

// Profile / Account screen — port of the mobile design at
// qualified-commercial/project/screens/profile.jsx (handoff bundle).
// Sections: Header (avatar+tier), Credit, Appearance, Account list.
// Account list rows are stubs for now where backend doesn't expose the
// data yet (Plaid, Notifications, MFA, Tax) — they navigate to coming-soon
// destinations or no-op with a toast. Sign Out is the live row at the
// bottom and goes through Clerk.

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useClerk } from "@clerk/nextjs";
import { useTheme, type ThemePreference } from "@/components/design-system/ThemeProvider";
import { Avatar, Card, Pill, SectionLabel } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useMyCredit } from "@/hooks/useApi";
import { CreditPullModal } from "@/components/CreditPullModal";
import { Role } from "@/lib/enums.generated";
import { InvestorProfileDialog } from "./components/InvestorProfileDialog";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  broker: "Account Exec",
  loan_exec: "Underwriter",
  client: "Borrower",
};

// Tier label per role — the design's "Tier II Borrower" pill belongs to
// the borrower mobile audience; operator roles get a parallel chip that
// reads naturally on the same surface.
const ROLE_TIER: Record<string, string> = {
  super_admin: "Operator · Super Admin",
  broker: "Operator · Account Exec",
  loan_exec: "Operator · Underwriter",
  client: "Tier II Borrower",
};

const THEME_OPTIONS: { id: ThemePreference; label: string; icon: string }[] = [
  { id: "light", label: "Light", icon: "sun" },
  { id: "system", label: "Auto", icon: "device" },
  { id: "dark", label: "Dark", icon: "moon" },
];

export default function ProfilePage() {
  const { t, preference, setPreference, isDark } = useTheme();
  const router = useRouter();
  const clerk = useClerk();
  const { data: user } = useCurrentUser();
  const { data: credit } = useMyCredit();
  const [pullOpen, setPullOpen] = useState(false);
  const [pullMode, setPullMode] = useState<"first" | "rerun">("first");
  const [signingOut, setSigningOut] = useState(false);
  const [investorOpen, setInvestorOpen] = useState(false);

  if (!user) {
    return <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>Loading profile…</div>;
  }

  const initials = user.name
    ? user.name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";
  const isClient = user.role === Role.CLIENT;
  const tierLabel = ROLE_TIER[user.role] ?? ROLE_LABEL[user.role] ?? user.role;
  const memberSince = "2025"; // backend doesn't yet return user.created_at — placeholder

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await clerk.signOut({ redirectUrl: "/sign-in" });
    } catch {
      router.push("/sign-in");
    }
  };

  // Account rows. Personal Info (avatar, name, phone, address) is delegated
  // to Clerk's hosted user profile — they handle avatar uploads, validation,
  // and the messy bits we don't want to reinvent. Investor Profile is the
  // QC-specific borrower data (properties owned + experience) edited in
  // our own InvestorProfileDialog.
  const accountRows: Array<{
    label: string;
    sub: string;
    icon: string;
    onClick: () => void;
    danger?: boolean;
    hidden?: boolean;
  }> = [
    {
      label: "Personal Info",
      sub: "Avatar, name, phone, address — managed in Clerk",
      icon: "user",
      onClick: () => clerk.openUserProfile(),
    },
    {
      label: "Investor Profile",
      sub: isClient ? `${tierLabel} · properties + experience` : "Borrower-only — N/A for operator accounts",
      icon: "shield",
      onClick: () => setInvestorOpen(true),
      hidden: !isClient,
    },
    {
      label: "Notifications",
      sub: "Push + Email",
      icon: "bell",
      onClick: () => router.push("/settings"),
    },
    {
      label: "Two-Factor Auth",
      sub: "Managed in Clerk",
      icon: "key",
      onClick: () => clerk.openUserProfile(),
    },
    {
      label: signingOut ? "Signing out…" : "Sign Out",
      sub: "Ends this session and returns to sign-in",
      icon: "arrowR",
      onClick: handleSignOut,
      danger: true,
    },
  ];
  const visibleRows = accountRows.filter((r) => !r.hidden);

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Header */}
      <Card pad={18}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Avatar label={initials} color={t.petrol} size={56} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, letterSpacing: -0.3 }}>{user.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <Pill bg={t.petrolSoft} color={t.petrol}>{tierLabel}</Pill>
              <span style={{ fontSize: 11.5, color: t.ink3 }}>· Member since {memberSince}</span>
            </div>
            <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 4 }}>{user.email}</div>
          </div>
        </div>
      </Card>

      {/* Credit — clients only */}
      {isClient && (
        <>
          <SectionLabel>Credit</SectionLabel>
          {credit?.fico ? (
            <CreditVerifiedCard
              t={t}
              isDark={isDark}
              fico={credit.fico}
              expiresAt={credit.expires_at ?? null}
              onRerun={() => { setPullMode("rerun"); setPullOpen(true); }}
            />
          ) : (
            <CreditNotVerifiedCard
              t={t}
              onStart={() => { setPullMode("first"); setPullOpen(true); }}
            />
          )}
        </>
      )}

      {/* Appearance — 3-way Light / Auto / Dark */}
      <SectionLabel>Appearance</SectionLabel>
      <Card pad={14}>
        <div style={{ fontSize: 12.5, fontWeight: 600, color: t.ink2, marginBottom: 10 }}>Theme</div>
        <div
          style={{
            display: "flex",
            gap: 6,
            background: t.chip,
            borderRadius: 11,
            padding: 3,
          }}
        >
          {THEME_OPTIONS.map((opt) => {
            const active = preference === opt.id;
            return (
              <button
                key={opt.id}
                onClick={() => setPreference(opt.id)}
                style={{
                  flex: 1,
                  padding: "9px",
                  borderRadius: 8,
                  border: "none",
                  background: active ? t.surface : "transparent",
                  boxShadow: active && !isDark ? "0 1px 2px rgba(11,22,41,0.08)" : "none",
                  color: active ? t.ink : t.ink3,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                  fontFamily: "inherit",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Icon name={opt.icon} size={14} /> {opt.label}
              </button>
            );
          })}
        </div>
        {preference === "system" && (
          <div style={{ marginTop: 8, fontSize: 11, color: t.ink3 }}>
            Following your system preference — currently <strong style={{ color: t.ink2 }}>{isDark ? "dark" : "light"}</strong>.
          </div>
        )}
      </Card>

      {/* Account */}
      <SectionLabel>Account</SectionLabel>
      <Card pad={0}>
        {visibleRows.map((row, i) => (
          <button
            key={row.label}
            onClick={row.onClick}
            disabled={signingOut && row.danger}
            style={{
              all: "unset",
              cursor: signingOut && row.danger ? "wait" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "13px 14px",
              borderBottom: i < visibleRows.length - 1 ? `1px solid ${t.line}` : "none",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: row.danger ? t.dangerBg : t.surface2,
                color: row.danger ? t.danger : t.ink2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={row.icon} size={15} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: row.danger ? t.danger : t.ink }}>
                {row.label}
              </div>
              <div style={{ fontSize: 11, color: t.ink3, marginTop: 1 }}>{row.sub}</div>
            </div>
            <Icon name="chevR" size={14} style={{ color: t.ink4 }} />
          </button>
        ))}
      </Card>

      <CreditPullModal
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        initialName={user.name}
        initialEmail={user.email}
        mode={pullMode}
      />
      <InvestorProfileDialog open={investorOpen} onClose={() => setInvestorOpen(false)} />
    </div>
  );
}

function CreditVerifiedCard({
  t,
  isDark,
  fico,
  expiresAt,
  onRerun,
}: {
  t: ReturnType<typeof useTheme>["t"];
  isDark: boolean;
  fico: number;
  expiresAt: string | null;
  onRerun: () => void;
}) {
  return (
    <Card pad={14}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: t.profitBg,
            color: t.profit,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="shieldChk" size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: t.ink, fontFeatureSettings: '"tnum"', letterSpacing: -0.3 }}>
              {fico}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: t.profit, letterSpacing: 0.4, textTransform: "uppercase" }}>
              Verified
            </span>
          </div>
          <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
            Soft pull on file{expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString()}` : ""}
          </div>
        </div>
      </div>
      <div
        style={{
          marginTop: 12,
          padding: 10,
          borderRadius: 10,
          background: isDark ? "rgba(245,158,11,0.10)" : "#FFF7E6",
          border: `1px solid ${t.warn}40`,
          fontSize: 11.5,
          color: t.ink2,
          lineHeight: 1.5,
          display: "flex",
          gap: 8,
        }}
      >
        <Icon name="bell" size={14} style={{ color: t.warn, marginTop: 1, flexShrink: 0 }} />
        <span>
          Re-running will replace your existing pull and reset the 90-day window. Use only if your file
          has materially changed.
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          onClick={onRerun}
          style={{
            flex: 1,
            padding: 10,
            borderRadius: 10,
            background: t.surface,
            color: t.ink,
            border: `1px solid ${t.lineStrong}`,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Re-Run Soft Pull
        </button>
      </div>
    </Card>
  );
}

function CreditNotVerifiedCard({
  t,
  onStart,
}: {
  t: ReturnType<typeof useTheme>["t"];
  onStart: () => void;
}) {
  return (
    <Card pad={14} style={{ position: "relative", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(135deg, ${t.petrolSoft}, transparent 70%)`,
        }}
      />
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 12,
            background: t.petrolSoft,
            color: t.petrol,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="lock" size={22} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>Credit Not Yet Verified</div>
          <div style={{ fontSize: 11.5, color: t.ink3, marginTop: 2, lineHeight: 1.4 }}>
            One soft pull unlocks all applications for 3 months · no score impact.
          </div>
        </div>
      </div>
      <button
        onClick={onStart}
        style={{
          position: "relative",
          marginTop: 12,
          width: "100%",
          padding: 11,
          borderRadius: 11,
          background: t.petrol,
          color: "#fff",
          border: "none",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
        }}
      >
        <Icon name="unlock" size={14} /> Start Soft Pull
      </button>
    </Card>
  );
}
