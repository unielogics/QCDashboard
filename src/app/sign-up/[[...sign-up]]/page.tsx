"use client";

import { SignUp, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { COMPANY_NAME, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

// localStorage key used to bridge "user accepted at signup time" → the
// post-signup auto-record effect (in app/providers.tsx via useRecordPendingConsent).
const PENDING_CONSENT_KEY = "qc.pendingLegalConsent";

export default function SignUpPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const { t } = useTheme();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  // When the user checks the box, capture the acceptance to localStorage with
  // a UTC timestamp + the document versions they saw. The post-signup hook
  // reads this and POSTs it to /api/v1/legal/accept once auth completes,
  // creating the audit record server-side.
  const onAccept = (checked: boolean) => {
    setAccepted(checked);
    if (checked) {
      localStorage.setItem(
        PENDING_CONSENT_KEY,
        JSON.stringify({
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
          accepted_at: new Date().toISOString(),
        }),
      );
    } else {
      localStorage.removeItem(PENDING_CONSENT_KEY);
    }
  };

  if (!isLoaded || isSignedIn) {
    return <div style={{ minHeight: "100vh", background: t.bg }} />;
  }

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 16,
        padding: "32px 16px",
        background: t.bg,
      }}
    >
      {/* Consent gate — must be checked before the Clerk form is rendered.
          We hide rather than disable the form so the user can't bypass via
          devtools (Clerk handles its own submit; we don't get a useful
          beforeSubmit hook). */}
      <div
        style={{
          maxWidth: 460,
          width: "100%",
          padding: 16,
          borderRadius: 12,
          background: t.surface,
          border: `1px solid ${accepted ? t.profit : t.line}`,
          boxShadow: t.shadow,
          transition: "border-color 120ms",
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAccept(e.target.checked)}
            aria-required
            style={{ marginTop: 2, accentColor: t.petrol, width: 18, height: 18, cursor: "pointer" }}
          />
          <span style={{ fontSize: 13, color: t.ink, lineHeight: 1.55 }}>
            I agree to {COMPANY_NAME}&apos;s{" "}
            <Link href="/terms" target="_blank" style={{ color: t.petrol, fontWeight: 700 }}>
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link href="/privacy" target="_blank" style={{ color: t.petrol, fontWeight: 700 }}>
              Privacy Policy
            </Link>
            , and consent under the TCPA to receive email and SMS communications about my loan
            file (you can reply STOP to opt out at any time).
          </span>
        </label>
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: accepted ? t.profit : t.ink3,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {accepted ? "✓ Consent recorded — you can create your account below." : "Check the box to enable account creation."}
        </div>
      </div>

      {/* Sign-up form: hidden until consent is given. We render a placeholder
          card with the same dimensions to avoid layout jump. */}
      {accepted ? (
        <SignUp />
      ) : (
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            padding: 32,
            borderRadius: 12,
            background: t.surface2,
            border: `1px dashed ${t.line}`,
            color: t.ink3,
            fontSize: 13,
            textAlign: "center",
          }}
        >
          The account creation form will appear once you accept the Terms &amp; Privacy above.
        </div>
      )}
    </div>
  );
}
