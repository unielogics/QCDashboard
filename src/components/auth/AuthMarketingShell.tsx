"use client";

// AuthMarketingShell — wraps the Clerk SignIn / SignUp widget in the
// same brand chrome the marketing site uses at qualifiedcommercial.com:
//
//   - Top rate ticker (decorative, mirrors marketing-site copy)
//   - Fixed dark-navy nav with logo + brand text + "Back to site" link
//   - Hero grid background centered on the content
//   - Slim footer with the CTA + legal disclaimer
//
// The Clerk widget itself is themed via its `appearance` prop on the
// individual page so SignIn / SignUp can each pass it. This component
// just renders the chrome and the children slot.

import { ReactNode } from "react";

const TICKER_ROWS = [
  { label: "10Y Treasury", value: "4.45%", delta: { dir: "down", value: "0.04" } },
  { label: "SOFR",         value: "3.65%", delta: { dir: "up",   value: "0.02" } },
  { label: "Prime",        value: "6.75%" },
  { label: "Multifamily Appetite", value: "HIGH" },
  { label: "Industrial Appetite",  value: "VERY HIGH" },
  { label: "Bridge Spreads",       value: "Tightening" },
  { label: "DSCR Capital",         value: "Active" },
];

export function AuthMarketingShell({ children }: { children: ReactNode }) {
  return (
    <div className="qc-marketing" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <TickerBar />
      <TopNav />

      {/* Hero — sign-in widget sits centered here */}
      <div
        className="qc-hero-grid-bg"
        style={{
          flex: 1,
          paddingTop: 140,
          paddingBottom: 80,
          paddingLeft: 20,
          paddingRight: 20,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
        }}
      >
        <div style={{ position: "relative", zIndex: 2, maxWidth: 480, width: "100%" }}>
          <header style={{ textAlign: "center", marginBottom: 32 }}>
            <h1
              style={{
                fontSize: "clamp(28px, 4vw, 40px)",
                fontWeight: 800,
                letterSpacing: "-0.03em",
                color: "#F8FAFC",
                margin: 0,
                lineHeight: 1.1,
              }}
            >
              Welcome back
            </h1>
            <p
              style={{
                marginTop: 10,
                color: "#94A3B8",
                fontSize: 15,
                lineHeight: 1.55,
              }}
            >
              Sign in to access your capital intelligence — borrowing power, deal
              status, and lender routing for every active file.
            </p>
          </header>
          {children}
        </div>
      </div>

      <Footer />
    </div>
  );
}


function TickerBar() {
  // Duplicate the rows so the marquee scroll loops seamlessly.
  const rows = [...TICKER_ROWS, ...TICKER_ROWS];
  return (
    <div className="qc-ticker-bar" role="presentation" aria-hidden="true">
      <div className="qc-ticker-track">
        {rows.map((r, i) => (
          <span key={i}>
            <b>{r.label}</b>
            <span>{r.value}</span>
            {r.delta ? (
              <em className={r.delta.dir === "up" ? "up" : "down"}>
                {r.delta.dir === "up" ? "▲" : "▼"} {r.delta.value}
              </em>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}


function TopNav() {
  return (
    <nav className="qc-nav">
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          padding: "18px 22px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <a
          href="https://qualifiedcommercial.com"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 11,
            fontWeight: 800,
            letterSpacing: "-0.03em",
            fontSize: 18,
            color: "#F8FAFC",
          }}
        >
          <LogoBadge />
          <span>Qualified Commercial</span>
        </a>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <a
            href="https://qualifiedcommercial.com"
            style={{
              color: "#CBD5E1",
              fontSize: 13,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
            className="hover:text-white"
          >
            ← Back to site
          </a>
          <a href="https://qualifiedcommercial.com/#engine" className="qc-btn-primary">
            Calculate My Rate
          </a>
        </div>
      </div>
    </nav>
  );
}


function LogoBadge() {
  return (
    <span
      style={{
        width: 34,
        height: 34,
        borderRadius: 11,
        background:
          "linear-gradient(135deg, rgba(33,211,199,0.18) 0%, rgba(33,211,199,0.05) 100%)",
        border: "1px solid rgba(33,211,199,0.35)",
        boxShadow: "0 0 35px rgba(33, 211, 199, 0.25)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#21D3C7",
        fontWeight: 900,
        fontSize: 16,
      }}
    >
      QC
    </span>
  );
}


function Footer() {
  return (
    <footer className="qc-footer-bg" style={{ padding: "32px 22px 48px" }}>
      <div
        style={{
          maxWidth: 1280,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, fontWeight: 800, color: "#F8FAFC" }}>
          <LogoBadge />
          <span>Qualified Commercial</span>
        </div>
        <p style={{ fontSize: 13, color: "#94A3B8", lineHeight: 1.65, maxWidth: 720, margin: 0 }}>
          © 2026 Qualified Commercial LLC. All rights reserved. Qualified Commercial LLC is a
          commercial real estate technology platform. All rates displayed are estimates based on
          live API data and do not constitute a binding commitment to lend. Final terms are
          subject to formal underwriting, lender approval, documentation, market conditions, and
          program availability.
        </p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
          <span style={chipStyle}>Soft-pull estimates</span>
          <span style={chipStyle}>Encrypted document vault</span>
          <span style={chipStyle}>Institutional capital routing</span>
        </div>
      </div>
    </footer>
  );
}

const chipStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid rgba(255, 255, 255, 0.10)",
  background: "rgba(255, 255, 255, 0.035)",
  color: "#94A3B8",
  fontSize: 12,
  whiteSpace: "nowrap",
};
