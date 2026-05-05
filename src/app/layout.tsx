import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Providers from "./providers";
import AppShell from "@/components/shell/AppShell";

export const metadata: Metadata = {
  title: "Qualified Commercial — Operator Console",
  description: "AI-driven brokerage underwriting platform for commercial real estate.",
};

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
