import type { Metadata } from "next";
import { headers } from "next/headers";
import { Inter, Inter_Tight } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/shell/AppShell";
import { SIGN_IN_URL, SIGN_UP_URL } from "@/lib/appUrl";
import { isAgreementPortalHost } from "@/lib/agreementPortal";

// Inter was never actually loaded here — the stack in ThemeProvider asked for
// it but nothing shipped it, so the console has been rendering in SF Pro on
// macOS and Segoe UI elsewhere, and so have the auth pages. Loading it matches
// the marketing site (QCWeb/src/app/layout.tsx) and changes the texture of
// every authenticated screen for twelve lines.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

// Headings only. Tighter and more display-like than Inter without leaving the
// family — applied to the four heading-shaped primitives, not chased app-wide.
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  display: "swap",
  variable: "--font-inter-tight",
});

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
      <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
        <body>
          <Providers>
            <AppShell isAgreementPortal={isAgreementPortal}>{children}</AppShell>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
