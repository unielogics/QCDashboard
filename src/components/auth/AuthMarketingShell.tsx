"use client";

// AuthMarketingShell — wraps the Clerk SignIn / SignUp widget in the same
// brand chrome the marketing site uses at qualifiedcommercial.com:
//
//   - Sticky light masthead with the mark, brand text and a "Back to site" link
//   - Paper ground behind the auth card
//   - Slim footer with the legal disclaimer
//   - Rate strip pinned to the BOTTOM (it used to sit at the top, where it
//     covered the nav and intercepted clicks on the links beneath it)
//
// The marketing site moved from dark navy + gold to a light institutional
// system; these surfaces follow it. All the colour lives in the .qc-*
// classes in globals.css, scoped to .qc-marketing.
//
// The layout classes below are `.qc-authshell …` in app-extras.css and are
// scoped to this subtree on purpose: this page runs on the MARKETING palette
// (--ms-*), so the console's .row / .grid / .card vocabulary — which reads the
// console palette — must not appear anywhere inside it.
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
    <div className="qc-marketing qc-authshell">
      <TopNav />

      {/* Hero — sign-in widget sits centered here */}
      <div className="qc-hero-grid-bg qc-hero">
        <div className="qc-authslot">{children}</div>
      </div>

      <Footer />
      <TickerBar />
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
      <div className="qc-band">
        <a href="https://qualifiedcommercial.com" className="qc-brandlink">
          <LogoBadge />
          <span>Qualified Commercial</span>
        </a>
        <div className="qc-navacts">
          <a href="https://qualifiedcommercial.com" className="qc-navlink">
            ← Back to site
          </a>
          <a href="https://qualifiedcommercial.com/start" className="qc-btn-primary">
            Check your rate
          </a>
        </div>
      </div>
    </nav>
  );
}


// The exact marketing-site mark (QCWeb /public/qc-icon.svg), inlined so
// it renders identically here without depending on a static asset dir.
function LogoBadge() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 512 512"
      width={34}
      height={34}
      aria-hidden="true"
      className="qc-mark"
    >
      <defs>
        <linearGradient id="qcLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0B1D3A" />
          <stop offset="100%" stopColor="#050E1F" />
        </linearGradient>
        <linearGradient id="qcLogoTeal" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#21d3c7" />
          <stop offset="100%" stopColor="#18A89F" />
        </linearGradient>
      </defs>
      <rect width="512" height="512" rx="115" fill="url(#qcLogoBg)" />
      <circle
        cx="200"
        cy="240"
        r="120"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="52"
      />
      <line
        x1="280"
        y1="320"
        x2="350"
        y2="400"
        stroke="#FFFFFF"
        strokeWidth="52"
        strokeLinecap="square"
      />
      <path
        d="M 460 140 A 130 130 0 1 0 460 370"
        fill="none"
        stroke="url(#qcLogoTeal)"
        strokeWidth="52"
        strokeLinecap="square"
      />
    </svg>
  );
}


function Footer() {
  return (
    <footer className="qc-footer-bg qc-foot">
      <div className="qc-footcol">
        <div className="qc-footbrand">
          <LogoBadge />
          <span>Qualified Commercial</span>
        </div>
        <p className="qc-fineprint qc-legal">
          © 2026 Qualified Commercial LLC. All rights reserved. Qualified Commercial LLC is a
          commercial real estate technology platform. All rates displayed are estimates based on
          live API data and do not constitute a binding commitment to lend. Final terms are
          subject to formal underwriting, lender approval, documentation, market conditions, and
          program availability.
        </p>
        <div className="qc-chiprow">
          <span className="qc-fchip">Soft-pull estimates</span>
          <span className="qc-fchip">Encrypted document vault</span>
          <span className="qc-fchip">Institutional capital routing</span>
        </div>
        <div className="qc-linkrow">
          <a href="https://qualifiedcommercial.com/industries/auto">
            Auto &amp; dealer capital
          </a>
          <a href="/dealer-ai-underwriter">
            Use our AI Underwriter
          </a>
        </div>
      </div>
    </footer>
  );
}
