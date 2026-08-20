"use client";

// Tells an operator when their account has no second factor.
//
// Clerk requires two-step verification at sign-in, but "required" only bites at
// the moment someone signs in. Anyone already holding a session keeps working
// with a single factor until it next expires, and nothing in the product says
// so. This is the thing that says so.
//
// Reads Clerk directly rather than our own settings row, because Clerk owns the
// second factor. The settings page used to assert MFA state from our database
// and was wrong about it; this does not repeat that.

import Link from "next/link";
import { useUser } from "@clerk/nextjs";
import { useTheme } from "@/components/design-system/ThemeProvider";

export default function MfaBanner() {
  const { t } = useTheme();
  const { isLoaded, user } = useUser();

  // Never render on an unresolved session. Flashing "you are not protected" at
  // someone who is protected teaches them to ignore the banner.
  if (!isLoaded || !user) return null;

  // A passkey satisfies the second factor on this Clerk instance
  // (passkey_settings.satisfies_second_factor), so someone who has one is done.
  if (user.twoFactorEnabled || (user.passkeys?.length ?? 0) > 0) return null;

  return (
    <div
      style={{
        border: `1px solid ${t.line}`,
        borderLeft: `3px solid ${t.warn}`,
        background: t.warnBg,
        borderRadius: 10,
        padding: "12px 14px",
        marginBottom: 18,
      }}
    >
      <div style={{ fontWeight: 650, color: t.ink, fontSize: 14 }}>
        Two-step verification is not set up on this account.
      </div>
      <div style={{ fontSize: 13, color: t.ink3, marginTop: 3, lineHeight: 1.55 }}>
        It takes about a minute with an authenticator app, and it is required for
        everyone with access to client files.{" "}
        <Link href="/account/security" style={{ color: t.brand, fontWeight: 600 }}>
          Set it up now
        </Link>
        .
      </div>
    </div>
  );
}
