"use client";

import { SignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthMarketingShell } from "@/components/auth/AuthMarketingShell";
import { CLERK_DARK_APPEARANCE } from "@/components/auth/clerkAppearance";

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  // Belt-and-suspenders alongside middleware: if we land here while
  // already signed in (user typed /sign-in or hit a stale URL),
  // bounce to the dashboard. Clerk's <SignIn> renders nothing for
  // signed-in users; its built-in auto-redirect doesn't always fire
  // on Amplify SSR.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  if (!isLoaded || isSignedIn) {
    return <div className="qc-marketing" style={{ minHeight: "100vh" }} aria-hidden="true" />;
  }

  return (
    <AuthMarketingShell>
      <SignIn appearance={CLERK_DARK_APPEARANCE} routing="path" path="/sign-in" />
    </AuthMarketingShell>
  );
}
