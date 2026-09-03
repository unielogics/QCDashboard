"use client";

// Profile / Account screen — port of the mobile design at
// qualified-commercial/project/screens/profile.jsx (handoff bundle).
// Sections: Header (avatar+tier), Credit, Account list.
// Account list rows are stubs for now where backend doesn't expose the
// data yet (Plaid, Notifications, MFA, Tax) — they navigate to coming-soon
// destinations or no-op with a toast. Sign Out is the live row at the
// bottom and goes through Clerk.
//
// Restyled onto globals.css (Phase 3): `.card`/`.panel` surfaces, `.pick`
// rows, `.cellchip` tones. Every row target, endpoint, role gate and state
// below is unchanged from the inline-styled version — this is paint only.

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import { useClerk } from "@clerk/nextjs";
import { Btn, Card, CellChip, Lbl, PageHeader, Panel, WarnLine } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useCurrentUser, useMyCredit } from "@/hooks/useApi";
import { SIGN_IN_URL } from "@/lib/appUrl";
import { CreditPullModal } from "@/components/CreditPullModal";
import { Role } from "@/lib/enums.generated";
import { InvestorProfileDialog } from "./components/InvestorProfileDialog";
import { MySignatureCard } from "@/components/profile/MySignatureCard";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  broker: "Agent",
  loan_exec: "Underwriter",
  dealer_partner: "Dealer Partner",
  client: "Client",
};

// Tier label per role — operator roles get an "Operator · …" chip; the
// end-consumer tier label reflects their borrower-portal identity.
const ROLE_TIER: Record<string, string> = {
  super_admin: "Operator · Super Admin",
  broker: "Operator · Agent",
  loan_exec: "Operator · Underwriter",
  dealer_partner: "Partner · Dealer",
  client: "Tier II Client",
};

// THEME_OPTIONS (Light / Auto / Dark) went with dark mode; the Appearance
// section it fed was already removed and nothing referenced the constant.

// `.pick` is the design system's selectable row and owns the box — border,
// radius, padding, gap, background, hover, cursor. It does NOT own these
// three, which a <button> needs and does not inherit on its own, so they are
// the row's only inline properties rather than a second copy of the class's.
const PICK_BUTTON: CSSProperties = { font: "inherit", textAlign: "left", width: "100%" };

// The account column: a settings list reads as a column, not as a 1800px
// band. `.grid` owns the stacking and the gap; only the measure is inline.
const COLUMN: CSSProperties = { maxWidth: 760 };

export default function ProfilePage() {
  const router = useRouter();
  const clerk = useClerk();
  const { data: user } = useCurrentUser();
  const { data: credit } = useMyCredit();
  const searchParams = useSearchParams();
  const [pullOpen, setPullOpen] = useState(false);
  const [pullMode, setPullMode] = useState<"first" | "rerun" | "expired">("first");

  // Auto-open the credit modal when the user lands here from an expiry
  // banner or with `?credit=open` in the URL. Without this, clicking
  // "Refresh Credit" on the simulator banner dumps the user on /profile
  // and they have to click again to actually run the pull.
  useEffect(() => {
    const requested = searchParams?.get("credit");
    if (!requested) return;
    if (credit?.is_expired) {
      setPullMode("expired");
      setPullOpen(true);
    } else if (credit?.fico != null) {
      setPullMode("rerun");
      setPullOpen(true);
    } else {
      setPullMode("first");
      setPullOpen(true);
    }
  }, [searchParams, credit?.is_expired, credit?.fico]);
  const [signingOut, setSigningOut] = useState(false);
  const [investorOpen, setInvestorOpen] = useState(false);

  if (!user) {
    return <div className="sub">Loading profile…</div>;
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
      await clerk.signOut({ redirectUrl: SIGN_IN_URL });
    } catch {
      window.location.assign(SIGN_IN_URL);
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
      sub: "Avatar, name, phone, address",
      icon: "user",
      onClick: () => router.push("/account"),
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
      // Deep-links to the Security tab rather than opening the profile root.
      // openUserProfile() lands two clicks away from the thing this row is
      // named after, which is how a required control stays unused.
      label: "Two-Factor Auth",
      sub: "Required on every login — set up or review",
      icon: "key",
      onClick: () => router.push("/account/security"),
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
    <div className="grid" style={COLUMN}>
      <PageHeader title="Profile" lede="Identity, credit file and account settings" />

      {/* Header */}
      <Card className="row">
        <div className="avatar">{initials}</div>
        <div className="sp">
          <div className="big">{user.name}</div>
          <div className="row mt">
            <CellChip tone="pet">{tierLabel}</CellChip>
            <span className="sub">Member since {memberSince}</span>
            <span className="sub">{user.email}</span>
          </div>
        </div>
      </Card>

      {/* Credit — clients only */}
      {isClient &&
        (credit?.fico ? (
          <CreditVerifiedCard
            fico={credit.fico}
            expiresAt={credit.expires_at ?? null}
            onRerun={() => {
              setPullMode("rerun");
              setPullOpen(true);
            }}
          />
        ) : (
          <CreditNotVerifiedCard
            onStart={() => {
              setPullMode("first");
              setPullOpen(true);
            }}
          />
        ))}

      {/* Signature on file — every signed-in person (team and dealer partners)
          may adopt one for placement on agreements that name them. Borrower
          accounts sign each document fresh in the room, so the card is not
          offered to clients. */}
      {!isClient ? <MySignatureCard defaultName={user.name} /> : null}

      {/* No Appearance section: this app is light-only, matching Capital OS.
          The 3-way Light / Auto / Dark control was removed with dark mode. */}

      {/* Account */}
      <Panel title="Account">
        {visibleRows.map((row) => {
          const busy = signingOut && !!row.danger;
          return (
            <button
              key={row.label}
              type="button"
              className="pick"
              onClick={row.onClick}
              disabled={busy}
              style={busy ? { ...PICK_BUTTON, opacity: 0.55 } : PICK_BUTTON}
            >
              {/* The chip tint replaces the old square icon tile: `.c-bad`
                  carries the danger ground and the icon inherits its colour,
                  so Sign Out still reads as the destructive row. */}
              <CellChip tone={row.danger ? "bad" : "mut"}>
                <Icon name={row.icon} size={13} />
              </CellChip>
              <div className="sp">
                {row.label}
                <div className="sub">{row.sub}</div>
              </div>
              <Icon name="chevR" size={14} />
            </button>
          );
        })}
      </Panel>

      <CreditPullModal
        open={pullOpen}
        onClose={() => setPullOpen(false)}
        initialName={user.name}
        initialEmail={user.email}
        mode={pullMode}
      />
      {isClient ? (
        <InvestorProfileDialog open={investorOpen} onClose={() => setInvestorOpen(false)} />
      ) : null}
    </div>
  );
}

function CreditVerifiedCard({
  fico,
  expiresAt,
  onRerun,
}: {
  fico: number;
  expiresAt: string | null;
  onRerun: () => void;
}) {
  return (
    <Panel
      title="Credit"
      actions={
        <Btn onClick={onRerun}>
          <Icon name="shieldChk" size={13} />
          Re-Run Soft Pull
        </Btn>
      }
    >
      <div className="row">
        <div>
          <Lbl>FICO</Lbl>
          <div className="big num">{fico}</div>
        </div>
        <CellChip tone="ok">Verified</CellChip>
      </div>
      <div className="sub mt">
        Soft pull on file{expiresAt ? ` · expires ${new Date(expiresAt).toLocaleDateString()}` : ""}
      </div>
      <WarnLine className="mt">
        <Icon name="bell" size={14} /> Re-running will replace your existing pull and reset the 90-day
        window. Use only if your file has materially changed.
      </WarnLine>
    </Panel>
  );
}

function CreditNotVerifiedCard({ onStart }: { onStart: () => void }) {
  return (
    <Panel
      title="Credit"
      actions={
        <Btn variant="pri" onClick={onStart}>
          <Icon name="unlock" size={13} />
          Start Soft Pull
        </Btn>
      }
    >
      <CellChip tone="warn">
        <Icon name="lock" size={12} />
        Credit Not Yet Verified
      </CellChip>
      <div className="sub mt">
        One soft pull unlocks all applications for 3 months · no score impact.
      </div>
    </Panel>
  );
}
