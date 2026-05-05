import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Qualified Commercial — Operator Console",
  description: "AI-driven brokerage underwriting platform for commercial real estate.",
};

// Every screen uses Clerk auth + react-query — no static prerender.
// This forces SSR for every route, which is what we want behind Clerk middleware.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>
          <Providers>
            <AppShell>{children}</AppShell>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
