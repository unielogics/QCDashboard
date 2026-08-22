"use client";

// Public, unauthenticated portal shell at agreement.qualifiedcommercial.com
// (rewritten here from that hostname by middleware.ts). Lists the contract
// types available to fill and sign on this portal. v1 has one entry
// (Referral Protection) -- built as a list rather than a single hardcoded
// page so more contract types can be added here later without a redesign.

import Link from "next/link";
import { V, type CssVars } from "@/components/design-system/cssVars";
import type { CSSProperties } from "react";
import { QCMark } from "@/components/QCMark";

// Was the theme object handed down by useTheme(). The palette is now a
// module constant of CSS variables, so this alias points at that.
type Theme = CssVars;

const AGREEMENTS: Array<{ slug: string; title: string; description: string }> = [
  {
    slug: "referral-protection",
    title: "Strategic Referral, Capital Advisory and Business Relationship Protection Agreement",
    description: "For referral partner companies establishing or renewing a formal referral relationship with Qualified Commercial.",
  },
];

export default function AgreementPortalPage() {
  return (
    <main style={page()}>
      <div style={shell}>
        <div style={brandHeader}>
          <QCMark size={34} />
          <div>
            <div style={brand()}>Qualified Commercial</div>
            <div style={brandName()}>Agreement Portal</div>
          </div>
        </div>
        <h1 style={title()}>Fill and sign an agreement</h1>
        <p style={copy()}>Select an agreement below to fill in the required fields and sign electronically.</p>
        <div style={list}>
          {AGREEMENTS.map((agreement) => (
            <Link key={agreement.slug} href={`/agreement/${agreement.slug}`} style={card()}>
              <div style={cardTitle()}>{agreement.title}</div>
              <div style={cardDescription()}>{agreement.description}</div>
              <div style={cardCta()}>Fill and sign →</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

const page = (): CSSProperties => ({ minHeight: "100vh", background: V.bg, color: V.ink, padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" });
const shell: CSSProperties = { maxWidth: 680, margin: "10vh auto 0" };
const brandHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 };
const brand = (): CSSProperties => ({ color: V.brand, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" });
const brandName = (): CSSProperties => ({ color: V.ink, fontSize: 15, fontWeight: 900, lineHeight: 1.2 });
const title = (): CSSProperties => ({ margin: "0 0 8px", fontSize: 30, lineHeight: 1.15, color: V.ink });
const copy = (): CSSProperties => ({ margin: "0 0 28px", color: V.ink3, fontSize: 15, lineHeight: 1.5 });
const list: CSSProperties = { display: "grid", gap: 14 };
const card = (): CSSProperties => ({ display: "block", textDecoration: "none", border: `1px solid ${V.line}`, borderRadius: 16, background: V.surface, padding: 20, color: V.ink, boxShadow: V.shadow, transition: "border-color .15s ease, background .15s ease" });
const cardTitle = (): CSSProperties => ({ fontSize: 16, fontWeight: 800, marginBottom: 6, color: V.ink });
const cardDescription = (): CSSProperties => ({ fontSize: 13.5, lineHeight: 1.5, color: V.ink3, marginBottom: 12 });
const cardCta = (): CSSProperties => ({ fontSize: 13, fontWeight: 800, color: V.brand });
