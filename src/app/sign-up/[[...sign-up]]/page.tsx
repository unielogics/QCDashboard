"use client";

import { SignUp, useAuth } from "@clerk/nextjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AuthMarketingShell } from "@/components/auth/AuthMarketingShell";
import { CLERK_DARK_APPEARANCE } from "@/components/auth/clerkAppearance";
import { COMPANY_NAME, PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";

// localStorage key used to bridge "user accepted at signup time" → the
// post-signup auto-record effect (in app/providers.tsx via
// useRecordPendingConsent).
const PENDING_CONSENT_KEY = "qc.pendingLegalConsent";

export default function SignUpPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  // When the user checks the box, capture acceptance to localStorage
  // with a UTC timestamp + the document versions. The post-signup hook
  // reads this and POSTs to /api/v1/legal/accept once auth completes.
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
    return <div className="qc-marketing" style={{ minHeight: "100vh" }} aria-hidden="true" />;
  }

  return (
    <AuthMarketingShell>
      {/* Consent gate — must be checked before the Clerk form renders.
          Hidden rather than disabled so the user can't bypass via
          devtools (Clerk handles its own submit). */}
      <div
        style={{
          width: "100%",
          padding: 18,
          borderRadius: 12,
          background: "rgba(8, 14, 33, 0.85)",
          border: `1px solid ${accepted ? "#34D399" : "rgba(255,255,255,0.10)"}`,
          backdropFilter: "blur(12px)",
          boxShadow: "0 24px 60px rgba(0, 0, 0, 0.55)",
          marginBottom: 16,
          transition: "border-color 120ms",
        }}
      >
        <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAccept(e.target.checked)}
            aria-required
            style={{
              marginTop: 2,
              accentColor: "#D4AF37",
              width: 18,
              height: 18,
              cursor: "pointer",
            }}
          />
          <span style={{ fontSize: 13, color: "#E2E8F0", lineHeight: 1.55 }}>
            I agree to {COMPANY_NAME}&apos;s{" "}
            <Link
              href="/terms"
              target="_blank"
              style={{ color: "#E9D58A", fontWeight: 700, textDecoration: "underline" }}
            >
              Terms &amp; Conditions
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              style={{ color: "#E9D58A", fontWeight: 700, textDecoration: "underline" }}
            >
              Privacy Policy
            </Link>
            , and consent under the TCPA to receive email and SMS communications about my loan
            file (reply STOP to opt out at any time).
          </span>
        </label>
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: accepted ? "#34D399" : "#94A3B8",
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {accepted
            ? "✓ Consent recorded — you can create your account below."
            : "Check the box to enable account creation."}
        </div>
      </div>

      {accepted ? (
        <SignUp appearance={CLERK_DARK_APPEARANCE} routing="path" path="/sign-up" />
      ) : (
        <div
          style={{
            width: "100%",
            padding: 32,
            borderRadius: 12,
            background: "rgba(255, 255, 255, 0.03)",
            border: "1px dashed rgba(255, 255, 255, 0.12)",
            color: "#94A3B8",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          The account creation form will appear once you accept the Terms &amp; Privacy above.
        </div>
      )}
    </AuthMarketingShell>
  );
}
