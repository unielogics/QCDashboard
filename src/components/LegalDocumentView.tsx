"use client";

// Shared renderer for /terms and /privacy. Plain readable typography,
// theme-aware, with a "back to app" link in the header for users who
// hit the page from the in-app footer.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import type { LegalDocument } from "@/lib/legal";
import { COMPANY_NAME } from "@/lib/legal";

interface Props {
  doc: LegalDocument;
  // The peer document — link to it in the footer so users can jump between
  // Terms ↔ Privacy without going back to the dashboard.
  peerHref: string;
  peerLabel: string;
}

export function LegalDocumentView({ doc, peerHref, peerLabel }: Props) {
  const { t } = useTheme();
  return (
    <div
      style={{
        background: t.bg,
        minHeight: "100vh",
        color: t.ink,
        padding: "32px 24px 80px",
      }}
    >
      <div style={{ maxWidth: 760, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: t.petrol,
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            <Icon name="arrowL" size={12} /> Back to app
          </Link>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.6,
              textTransform: "uppercase",
              color: t.petrol,
            }}
          >
            {COMPANY_NAME}
          </div>
        </div>

        {/* Title */}
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, color: t.ink, margin: 0, letterSpacing: -0.6 }}>
            {doc.title}
          </h1>
          <div style={{ fontSize: 12.5, color: t.ink3, marginTop: 6 }}>
            Effective Date: {doc.effectiveDate}
          </div>
        </div>

        {doc.preamble && (
          <Card pad={16}>
            <div style={{ fontSize: 13, color: t.ink2, lineHeight: 1.6 }}>{doc.preamble}</div>
          </Card>
        )}

        {/* Sections */}
        <Card pad={28}>
          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            {doc.sections.map((s, i) => (
              <section key={i}>
                {s.heading && (
                  <h2
                    style={{
                      fontSize: 16,
                      fontWeight: 800,
                      color: t.ink,
                      margin: "0 0 8px",
                      letterSpacing: -0.2,
                    }}
                  >
                    {s.heading}
                  </h2>
                )}
                {s.paragraphs.map((p, j) => (
                  <p
                    key={j}
                    style={{
                      fontSize: 13.5,
                      color: t.ink2,
                      lineHeight: 1.7,
                      margin: "0 0 8px",
                    }}
                  >
                    {p}
                  </p>
                ))}
              </section>
            ))}
          </div>
        </Card>

        {/* Footer */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 12,
            color: t.ink3,
            paddingTop: 8,
          }}
        >
          <span>
            {COMPANY_NAME} · {doc.title} · {doc.effectiveDate}
          </span>
          <Link
            href={peerHref}
            style={{ color: t.petrol, fontWeight: 700, textDecoration: "none" }}
          >
            {peerLabel} →
          </Link>
        </div>
      </div>
    </div>
  );
}
