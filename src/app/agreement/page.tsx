"use client";

// Public, unauthenticated portal shell at agreement.qualifiedcommercial.com
// (rewritten here from that hostname by middleware.ts). Lists the contract
// types available to fill and sign on this portal. v1 has one entry
// (Referral Protection) -- built as a list rather than a single hardcoded
// page so more contract types can be added here later without a redesign.

import Link from "next/link";
import type { CSSProperties } from "react";
import { QCMark } from "@/components/QCMark";
import { useTheme } from "@/components/design-system/ThemeProvider";

type Theme = ReturnType<typeof useTheme>["t"];

const AGREEMENTS: Array<{ slug: string; title: string; description: string }> = [
  {
    slug: "referral-protection",
    title: "Strategic Referral, Capital Advisory and Business Relationship Protection Agreement",
    description: "For referral partner companies establishing or renewing a formal referral relationship with Qualified Commercial.",
  },
];

export default function AgreementPortalPage() {
  const { t } = useTheme();
  return (
    <main style={page(t)}>
      <div style={shell}>
        <div style={brandHeader}>
          <QCMark size={34} />
          <div>
            <div style={brand(t)}>Qualified Commercial</div>
            <div style={brandName(t)}>Agreement Portal</div>
          </div>
        </div>
        <h1 style={title(t)}>Fill and sign an agreement</h1>
        <p style={copy(t)}>Select an agreement below to fill in the required fields and sign electronically.</p>
        <div style={list}>
          {AGREEMENTS.map((agreement) => (
            <Link key={agreement.slug} href={`/agreement/${agreement.slug}`} style={card(t)}>
              <div style={cardTitle(t)}>{agreement.title}</div>
              <div style={cardDescription(t)}>{agreement.description}</div>
              <div style={cardCta(t)}>Fill and sign →</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

const page = (t: Theme): CSSProperties => ({ minHeight: "100vh", background: t.bg, color: t.ink, padding: 24, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" });
const shell: CSSProperties = { maxWidth: 680, margin: "10vh auto 0" };
const brandHeader: CSSProperties = { display: "flex", alignItems: "center", gap: 10, marginBottom: 24 };
const brand = (t: Theme): CSSProperties => ({ color: t.brand, fontSize: 12, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase" });
const brandName = (t: Theme): CSSProperties => ({ color: t.ink, fontSize: 15, fontWeight: 900, lineHeight: 1.2 });
const title = (t: Theme): CSSProperties => ({ margin: "0 0 8px", fontSize: 30, lineHeight: 1.15, color: t.ink });
const copy = (t: Theme): CSSProperties => ({ margin: "0 0 28px", color: t.ink3, fontSize: 15, lineHeight: 1.5 });
const list: CSSProperties = { display: "grid", gap: 14 };
const card = (t: Theme): CSSProperties => ({ display: "block", textDecoration: "none", border: `1px solid ${t.line}`, borderRadius: 16, background: t.surface, padding: 20, color: t.ink, boxShadow: t.shadow, transition: "border-color .15s ease, background .15s ease" });
const cardTitle = (t: Theme): CSSProperties => ({ fontSize: 16, fontWeight: 800, marginBottom: 6, color: t.ink });
const cardDescription = (t: Theme): CSSProperties => ({ fontSize: 13.5, lineHeight: 1.5, color: t.ink3, marginBottom: 12 });
const cardCta = (t: Theme): CSSProperties => ({ fontSize: 13, fontWeight: 800, color: t.brand });
