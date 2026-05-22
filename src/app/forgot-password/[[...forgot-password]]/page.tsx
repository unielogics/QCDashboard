"use client";

// Branded password-reset route. A dedicated, two-step flow built on
// Clerk's reset_password_email_code strategy (useSignIn) — rather than
// the small "Forgot password?" link buried inside the <SignIn> widget.
//
//   Step 1 — enter the account email; Clerk emails a 6-digit code.
//   Step 2 — enter the code + a new password; on success Clerk opens
//            the session and we land the user on the dashboard.
//
// This is the single auth surface: the marketing site links here, the
// app's sign-in page links here. Catch-all segment so Clerk's path
// routing has room if it ever needs sub-steps.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth, useSignIn } from "@clerk/nextjs";
import { AuthMarketingShell } from "@/components/auth/AuthMarketingShell";

type Step = "email" | "code";
type Status = "idle" | "sending" | "error" | "needs_2fa";

function clerkError(err: unknown): string {
  // Clerk throws { errors: [{ longMessage, message }] }.
  const e = err as { errors?: Array<{ longMessage?: string; message?: string }> };
  const first = e?.errors?.[0];
  return (
    first?.longMessage ||
    first?.message ||
    "Something went wrong. Please try again."
  );
}

const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 420,
  margin: "0 auto",
  padding: 26,
  borderRadius: 14,
  background: "rgba(8, 14, 33, 0.85)",
  border: "1px solid rgba(255,255,255,0.10)",
  backdropFilter: "blur(12px)",
  boxShadow: "0 24px 60px rgba(0, 0, 0, 0.55)",
  display: "flex",
  flexDirection: "column",
  gap: 14,
};
const labelStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 0.4,
  color: "#94A3B8",
  textTransform: "uppercase",
  marginBottom: 6,
  display: "block",
};
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  borderRadius: 10,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#E2E8F0",
  fontSize: 15,
  outline: "none",
  fontFamily: "inherit",
};
const btnStyle = (enabled: boolean): React.CSSProperties => ({
  width: "100%",
  padding: "12px 18px",
  borderRadius: 999,
  border: "none",
  background: "linear-gradient(135deg, #E9D58A, #D4AF37)",
  color: "#0A1020",
  fontSize: 14,
  fontWeight: 800,
  cursor: enabled ? "pointer" : "not-allowed",
  opacity: enabled ? 1 : 0.5,
  fontFamily: "inherit",
});

export default function ForgotPasswordPage() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth();
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [err, setErr] = useState<string | null>(null);

  // Already signed in → nothing to reset; go home.
  useEffect(() => {
    if (authLoaded && isSignedIn) router.replace("/");
  }, [authLoaded, isSignedIn, router]);

  if (!authLoaded || isSignedIn || !isLoaded) {
    return <div className="qc-marketing" style={{ minHeight: "100vh" }} aria-hidden="true" />;
  }

  const sendCode = async () => {
    if (!email.trim() || status === "sending" || !signIn) return;
    setStatus("sending");
    setErr(null);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setStep("code");
      setStatus("idle");
    } catch (e) {
      setErr(clerkError(e));
      setStatus("error");
    }
  };

  const resetPassword = async () => {
    if (status === "sending" || !signIn || !setActive) return;
    if (password.length < 8) {
      setErr("Use at least 8 characters for your new password.");
      setStatus("error");
      return;
    }
    if (password !== confirm) {
      setErr("The two passwords don't match.");
      setStatus("error");
      return;
    }
    setStatus("sending");
    setErr(null);
    try {
      const res = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code: code.trim(),
        password,
      });
      if (res.status === "complete") {
        await setActive({ session: res.createdSessionId });
        router.replace("/");
        return;
      }
      if (res.status === "needs_second_factor") {
        // Account has 2FA — the reset is set, but the session needs a
        // second factor. Send them to sign-in to finish with the new
        // password (cleaner than re-implementing 2FA here).
        setStatus("needs_2fa");
        return;
      }
      setErr("Couldn't finish the reset. Please request a new code.");
      setStatus("error");
    } catch (e) {
      setErr(clerkError(e));
      setStatus("error");
    }
  };

  return (
    <AuthMarketingShell>
      <div style={cardStyle}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#F8FAFC", letterSpacing: -0.3 }}>
            Reset your password
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: "#94A3B8", lineHeight: 1.55 }}>
            {step === "email"
              ? "Enter your account email and we'll send you a 6-digit code."
              : "Enter the code we emailed you, then choose a new password."}
          </p>
        </div>

        {status === "needs_2fa" ? (
          <div style={{ fontSize: 13.5, color: "#E2E8F0", lineHeight: 1.6 }}>
            Your password has been reset. Your account has two-factor
            authentication enabled — please{" "}
            <Link href="/sign-in" style={{ color: "#E9D58A", fontWeight: 700 }}>
              sign in
            </Link>{" "}
            with your new password to finish.
          </div>
        ) : step === "email" ? (
          <>
            <div>
              <label style={labelStyle}>Account email</label>
              <input
                style={inputStyle}
                type="email"
                value={email}
                autoFocus
                placeholder="you@example.com"
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendCode()}
              />
            </div>
            <button
              style={btnStyle(!!email.trim() && status !== "sending")}
              disabled={!email.trim() || status === "sending"}
              onClick={sendCode}
            >
              {status === "sending" ? "Sending…" : "Send reset code"}
            </button>
          </>
        ) : (
          <>
            <div>
              <label style={labelStyle}>Reset code</label>
              <input
                style={inputStyle}
                inputMode="numeric"
                value={code}
                autoFocus
                placeholder="6-digit code"
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>New password</label>
              <input
                style={inputStyle}
                type="password"
                value={password}
                placeholder="At least 8 characters"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label style={labelStyle}>Confirm new password</label>
              <input
                style={inputStyle}
                type="password"
                value={confirm}
                placeholder="Re-enter the new password"
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && resetPassword()}
              />
            </div>
            <button
              style={btnStyle(
                !!code.trim() && !!password && !!confirm && status !== "sending",
              )}
              disabled={!code.trim() || !password || !confirm || status === "sending"}
              onClick={resetPassword}
            >
              {status === "sending" ? "Resetting…" : "Set new password"}
            </button>
            <button
              onClick={sendCode}
              style={{
                background: "none",
                border: "none",
                color: "#94A3B8",
                fontSize: 12.5,
                cursor: "pointer",
                fontFamily: "inherit",
                textDecoration: "underline",
              }}
            >
              Resend code
            </button>
          </>
        )}

        {err ? (
          <div style={{ fontSize: 13, color: "#FCA5A5", fontWeight: 600, lineHeight: 1.5 }}>
            {err}
          </div>
        ) : null}

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
          <Link href="/sign-in" style={{ color: "#94A3B8", fontSize: 13, textDecoration: "none" }}>
            ← Back to sign in
          </Link>
        </div>
      </div>
    </AuthMarketingShell>
  );
}
