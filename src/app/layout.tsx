import type { Metadata } from "next";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/shell/AppShell";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/appUrl";
import { isAgreementPortalHost } from "@/lib/agreementPortal";

export const metadata: Metadata = {
  title: "Qualified Commercial — Operator Console",
  description: "AI-driven brokerage underwriting platform for commercial real estate.",
};

// Every screen uses Clerk auth + react-query — no static prerender.
// This forces SSR for every route, which is what we want behind Clerk middleware.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // After middleware's host-based rewrite, the browser's URL (and therefore
  // usePathname() in client components like AppShell) still shows the
  // original request path on agreement.qualifiedcommercial.com -- never
  // "/agreement". Detecting the host here, server-side, and passing it down
  // as an explicit prop is the only reliable way for AppShell to know it's
  // rendering the public agreement portal rather than the operator console.
  const isAgreementPortal = isAgreementPortalHost(headers().get("host") || "");

  return (
    <ClerkProvider
      signInUrl={SIGN_IN_URL}
      signUpUrl={SIGN_UP_URL}
      signInFallbackRedirectUrl="/"
      signUpFallbackRedirectUrl="/"
    >
      <html lang="en">
        <body>
          <Providers>
            <AppShell isAgreementPortal={isAgreementPortal}>{children}</AppShell>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
