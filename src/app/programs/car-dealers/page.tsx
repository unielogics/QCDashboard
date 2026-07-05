import Link from "next/link";
import type { CSSProperties } from "react";
import { QCMark } from "@/components/QCMark";

const page: CSSProperties = {
  minHeight: "100vh",
  background: "#f4f7fb",
  color: "#07111f",
  fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
};

const shell: CSSProperties = {
  width: "min(1180px, calc(100% - 40px))",
  margin: "0 auto",
};

const nav: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "22px 0",
};

const buttonPrimary: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 46,
  padding: "0 18px",
  borderRadius: 10,
  background: "#07111f",
  color: "#fff",
  fontWeight: 850,
  textDecoration: "none",
  border: "1px solid #07111f",
  boxShadow: "0 18px 36px rgba(7, 17, 31, 0.18)",
};

const buttonSecondary: CSSProperties = {
  ...buttonPrimary,
  background: "#fff",
  color: "#07111f",
  border: "1px solid #d7dee9",
  boxShadow: "none",
};

const section: CSSProperties = {
  background: "#fff",
  border: "1px solid #dbe3ef",
  borderRadius: 18,
  boxShadow: "0 22px 70px rgba(14, 30, 55, 0.08)",
};

const eyebrow: CSSProperties = {
  margin: 0,
  color: "#51617a",
  fontSize: 12,
  fontWeight: 850,
  letterSpacing: 1.4,
  textTransform: "uppercase",
};

const h2: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 30,
  lineHeight: 1.1,
  letterSpacing: -0.6,
};

const body: CSSProperties = {
  margin: 0,
  color: "#526078",
  fontSize: 16,
  lineHeight: 1.65,
};

const programs = [
  {
    title: "Full-doc commercial real estate backed loans",
    term: "10 to 25 year amortization structures",
    copy:
      "For dealer owners with tax returns, P&L, bank statements, property collateral, and a clear use of funds.",
  },
  {
    title: "DSCR and real estate collateral review",
    term: "Income property or mixed collateral support",
    copy:
      "Reviews rental income, real estate schedules, mortgage debt, insurance, taxes, and collateral strength.",
  },
  {
    title: "Cash-out for working capital",
    term: "Real estate equity converted into operating liquidity",
    copy:
      "Designed for inventory, flooring pressure, expansion, payoff strategy, or business stabilization when the file supports it.",
  },
  {
    title: "Portfolio-backed funding",
    term: "Multiple assets reviewed as one credit picture",
    copy:
      "Useful when one property is not enough and underwriting needs the full real estate and business balance sheet.",
  },
];

const requiredDocs = [
  "Last 2 years of business and personal tax returns",
  "Current year P&L and balance sheet",
  "Last 3 months of bank statements",
  "List of all assets and real estate owned",
  "Mortgage notes, payoff statements, insurance, and tax bills for pledged properties",
  "Estimated credit score, validated later during the intro call",
];

export default function CarDealerProgramsPage() {
  return (
    <main style={page}>
      <div style={shell}>
        <header style={nav}>
          <Link href="/" style={{ display: "inline-flex", alignItems: "center", gap: 12, color: "#07111f", textDecoration: "none", fontWeight: 900 }}>
            <QCMark size={40} />
            <span>Qualified Commercial</span>
          </Link>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
            <Link href="/dealer-ai-underwriter" style={buttonSecondary}>
              AI Underwriter
            </Link>
            <Link href="/sign-in" style={buttonPrimary}>
              Login
            </Link>
          </div>
        </header>

        <section
          style={{
            ...section,
            padding: "56px clamp(24px, 5vw, 64px)",
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.15fr) minmax(300px, 0.85fr)",
            gap: 34,
            alignItems: "center",
          }}
        >
          <div>
            <p style={eyebrow}>Car dealer funding programs</p>
            <h1 style={{ margin: "12px 0 18px", fontSize: "clamp(40px, 6vw, 70px)", lineHeight: 0.98, letterSpacing: -2.4 }}>
              Real estate backed capital for car dealers.
            </h1>
            <p style={{ ...body, fontSize: 18, maxWidth: 760 }}>
              Access lower-interest 10 to 25 year loan structures when the real estate, dealer financials, and underwriting
              package support it. Car dealer loans are high risk, so every file needs a tailored underwriting process before
              it should be sent to capital partners.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 28 }}>
              <Link href="/dealer-ai-underwriter" style={buttonPrimary}>
                Use our AI Underwriter
              </Link>
              <a href="#programs" style={buttonSecondary}>
                View program breakdown
              </a>
            </div>
          </div>

          <aside style={{ background: "#07111f", color: "#fff", borderRadius: 16, padding: 24, border: "1px solid rgba(255,255,255,0.12)" }}>
            <p style={{ ...eyebrow, color: "#70ded5" }}>Gatekeeper review</p>
            <h2 style={{ margin: "10px 0 12px", fontSize: 28, lineHeight: 1.12 }}>Know if the file is bankable before wasting time.</h2>
            <p style={{ margin: 0, color: "#c6d1df", lineHeight: 1.65 }}>
              Upload taxes, bank statements, P&L, real estate schedules, and collateral documents. The AI Underwriter screens
              the file for DSCR, full-doc fit, missing items, and questions a real underwriter is likely to ask.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginTop: 20 }}>
              {["DSCR", "Full doc", "Cash-out", "Portfolio"].map((item) => (
                <div key={item} style={{ border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: 12, color: "#e8eef6", fontWeight: 800 }}>
                  {item}
                </div>
              ))}
            </div>
          </aside>
        </section>

        <section id="programs" style={{ padding: "36px 0 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 14 }}>
            {programs.map((program) => (
              <article key={program.title} style={{ ...section, boxShadow: "none", padding: 22 }}>
                <div style={{ fontSize: 12, fontWeight: 850, color: "#138f87", textTransform: "uppercase", letterSpacing: 1 }}>
                  {program.term}
                </div>
                <h3 style={{ margin: "12px 0 10px", fontSize: 20, lineHeight: 1.2 }}>{program.title}</h3>
                <p style={{ ...body, fontSize: 14 }}>{program.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "28px 0 0" }}>
          <div style={{ ...section, padding: 26, boxShadow: "none" }}>
            <p style={eyebrow}>Required underwriting package</p>
            <h2 style={h2}>No flexible shortcut around core documents.</h2>
            <p style={body}>
              Dealer files need enough evidence to prove cash flow, collateral, repayment capacity, and use of funds.
              The AI Underwriter asks for the package first, then flags what is missing or unclear.
            </p>
            <ul style={{ margin: "18px 0 0", padding: 0, listStyle: "none", display: "grid", gap: 10 }}>
              {requiredDocs.map((doc) => (
                <li key={doc} style={{ display: "flex", gap: 10, color: "#1f2d40", lineHeight: 1.45 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 999, background: "#70ded5", marginTop: 7, flexShrink: 0 }} />
                  <span>{doc}</span>
                </li>
              ))}
            </ul>
          </div>

          <div style={{ ...section, padding: 26, boxShadow: "none" }}>
            <p style={eyebrow}>Tailored risk process</p>
            <h2 style={h2}>Car dealer lending is not a commodity file.</h2>
            <p style={body}>
              Inventory swings, floor plan pressure, tax return quality, cash deposits, related real estate, and collateral
              gaps can change the answer fast. The process is strict by design: if the package does not support a bankable
              path, the system should say so before the file reaches a lender.
            </p>
            <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
              {["Discrepancy review", "Missing document detection", "Collateral and equity checks", "Underwriter question list"].map((item) => (
                <div key={item} style={{ border: "1px solid #dbe3ef", background: "#f8fbff", borderRadius: 12, padding: "12px 14px", fontWeight: 800 }}>
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section style={{ padding: "30px 0 54px" }}>
          <div style={{ ...section, padding: 28, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 18, boxShadow: "none" }}>
            <div>
              <p style={eyebrow}>Start the screen</p>
              <h2 style={{ ...h2, marginBottom: 6 }}>Let the AI Underwriter collect and review the file.</h2>
              <p style={body}>Public intake collects the dealer contact, documents, real estate schedule, estimated credit score, and referral source.</p>
            </div>
            <Link href="/dealer-ai-underwriter" style={{ ...buttonPrimary, flexShrink: 0 }}>
              Use our AI Underwriter
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
