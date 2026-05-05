"use client";

import { SignIn, useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function SignInPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  // Belt-and-suspenders alongside middleware: if we land here while already
  // signed in (e.g. user typed /sign-in by hand or hit a stale URL), bounce
  // to the dashboard. Clerk's <SignIn> renders nothing for signed-in users
  // and its built-in auto-redirect doesn't always fire on Amplify SSR.
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace("/");
    }
  }, [isLoaded, isSignedIn, router]);

  // While Clerk is loading or already-signed-in (about to redirect), don't
  // flash the SignIn component.
  if (!isLoaded || isSignedIn) {
    return <div style={{ minHeight: "100vh" }} />;
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center" }}>
      <SignIn />
    </div>
  );
}
