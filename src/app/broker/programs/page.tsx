"use client";

// Dealer-partner ("broker") portal: Programs & Resources. A horizontally-
// scrolling row of equal-sized cards, one per lending program QC places for
// car dealers, each with a summary, required documents, timeline, and a
// Start button. Static content -- no backend endpoint distinguishes
// documents/timelines per program today (only one shared baseline
// checklist exists, see dealer_ai_intake.py's REQUIRED_DOCUMENTS), so this
// mirrors the same authored-copy approach as the public
// /programs/car-dealers marketing page. "Start" hands off to the My Leads
// page via a ?program= query param rather than inventing a backend field
// that doesn't exist yet (BrokerLeadCreate has no program slot).

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtnPrimary } from "@/components/design-system/buttons";
import { Role } from "@/lib/enums.generated";
import { useCurrentUser } from "@/hooks/useApi";

type Program = {
  slug: string;
  tag: string;
  title: string;
  summary: string;
  requiredDocs: string[];
  timeline: Array<{ step: string; detail: string }>;
};

// Same base document checklist QC collects for every dealer file
// (dealer_ai_intake.py's REQUIRED_DOCUMENTS), with a couple of
// program-specific additions called out per card where relevant.
const BASE_DOCS = [
  "Last 2 years business tax returns",
  "Current year P&L",
  "Last 6 months bank statements",
  "Debt schedule",
  "Personal financial statement (per owner)",
];

const PROGRAMS: Program[] = [
  {
    slug: "sba",
    tag: "Government-backed",
    title: "SBA 7(a) / 504 / Express",
    summary:
      "The default path for most dealer files. Government-guaranteed structures support larger approvals and longer terms once the full underwriting package is complete.",
    requiredDocs: [...BASE_DOCS, "Dealer license and ownership information", "One ID per declared owner"],
    timeline: [
      { step: "Submit file", detail: "Client details and documents land in an encrypted file room." },
      { step: "AI screen", detail: "Automated underwriting review flags gaps and asks essential follow-ups." },
      { step: "Package", detail: "Missing documents and discrepancies are resolved before submission." },
      { step: "Term direction", detail: "Likely funding path and structure are identified." },
    ],
  },
  {
    slug: "working-capital",
    tag: "Operating liquidity",
    title: "Dealer Working Capital Facility",
    summary:
      "For qualified dealers seeking capital for growth, payoff, inventory expansion, vendor obligations, tax cleanup, or operational liquidity.",
    requiredDocs: [...BASE_DOCS],
    timeline: [
      { step: "Submit file", detail: "Client details and documents land in an encrypted file room." },
      { step: "AI screen", detail: "Automated underwriting review flags gaps and asks essential follow-ups." },
      { step: "Package", detail: "Missing documents and discrepancies are resolved before submission." },
      { step: "Term direction", detail: "Likely funding path and structure are identified." },
    ],
  },
  {
    slug: "floorplan",
    tag: "Inventory analysis",
    title: "Dealer Floorplan / Dealer LOC",
    summary:
      "For dealers with floorplan exposure. Reviews inventory movement, balances, payoff behavior, aging units, and collateral controls before recommending added capital.",
    requiredDocs: [...BASE_DOCS, "Inventory report and floorplan statements"],
    timeline: [
      { step: "Submit file", detail: "Client details and documents land in an encrypted file room." },
      { step: "AI screen", detail: "Automated underwriting review flags gaps and asks essential follow-ups." },
      { step: "Package", detail: "Missing documents and discrepancies are resolved before submission." },
      { step: "Term direction", detail: "Likely funding path and structure are identified." },
    ],
  },
  {
    slug: "real-estate-backed",
    tag: "Collateral-backed",
    title: "Real Estate Backed Dealer Capital",
    summary:
      "For dealers or principals with commercial or investment real estate. May support larger approvals, cleaner pricing, and longer terms depending on appraisal, lien position, and cash flow.",
    requiredDocs: [...BASE_DOCS, "Real estate documents if collateral is offered"],
    timeline: [
      { step: "Submit file", detail: "Client details and documents land in an encrypted file room." },
      { step: "AI screen", detail: "Automated underwriting review flags gaps and asks essential follow-ups." },
      { step: "Package", detail: "Missing documents and discrepancies are resolved before submission." },
      { step: "Term direction", detail: "Likely funding path and structure are identified." },
    ],
  },
  {
    slug: "reinsurance-backed",
    tag: "Warranty / Reinsurance",
    title: "Reinsurance-Backed Financing",
    summary:
      "For dealers with a confirmed reinsurance account. Eligibility and pricing depend on revenue or liquid assets and the size of the request.",
    requiredDocs: [...BASE_DOCS, "Reinsurance account bank statements (last 2 months)", "Reinsurance account administrator statements (last 2 months)"],
    timeline: [
      { step: "Submit file", detail: "Client details and documents land in an encrypted file room." },
      { step: "AI screen", detail: "Automated underwriting review flags gaps and asks essential follow-ups." },
      { step: "Package", detail: "Missing documents and discrepancies are resolved before submission." },
      { step: "Term direction", detail: "Likely funding path and structure are identified." },
    ],
  },
  {
    slug: "bridge-private-credit",
    tag: "Pressure relief",
    title: "Bridge / Private Credit Refinance",
    summary:
      "For dealers carrying MCA balances or expensive short-term obligations. Reviews whether pressure-heavy capital can be consolidated or replaced with a cleaner structure.",
    requiredDocs: [...BASE_DOCS, "Existing debt, MCA, and advance statements"],
    timeline: [
      { step: "Submit file", detail: "Client details and documents land in an encrypted file room." },
      { step: "AI screen", detail: "Automated underwriting review flags gaps and asks essential follow-ups." },
      { step: "Package", detail: "Missing documents and discrepancies are resolved before submission." },
      { step: "Term direction", detail: "Likely funding path and structure are identified." },
    ],
  },
];

export default function BrokerProgramsPage() {
  const { t } = useTheme();
  const { data: me, isLoading: meLoading } = useCurrentUser();

  if (meLoading) {
    return <main style={{ padding: 24 }}>Loading…</main>;
  }
  if (me && me.role !== Role.DEALER_PARTNER) {
    return (
      <main style={{ padding: 24 }}>
        <Card pad={20}>This page is only available to dealer partner accounts.</Card>
      </main>
    );
  }

  return (
    <main style={{ padding: 24, display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22, color: t.ink }}>Programs & Resources</h1>
        <p style={{ margin: "4px 0 0", color: t.ink3, fontSize: 13 }}>
          The financing programs Qualified Commercial places for car dealers — what each covers, what's required, and how long it takes.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          gap: 16,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          paddingBottom: 8,
        }}
      >
        {PROGRAMS.map((program) => (
          <ProgramCard key={program.slug} program={program} />
        ))}
      </div>
    </main>
  );
}

function ProgramCard({ program }: { program: Program }) {
  const { t } = useTheme();
  return (
    <Card
      pad={18}
      style={{
        width: 340,
        flexShrink: 0,
        scrollSnapAlign: "start",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div>
        <Pill bg={t.petrolSoft} color={t.petrol}>{program.tag}</Pill>
        <h2 style={{ margin: "10px 0 0", fontSize: 16, color: t.ink }}>{program.title}</h2>
        <p style={{ margin: "6px 0 0", color: t.ink2, fontSize: 12.5, lineHeight: 1.5 }}>{program.summary}</p>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.ink3, marginBottom: 6 }}>
          Required documents
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          {program.requiredDocs.map((doc) => (
            <div key={doc} style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12, color: t.ink2 }}>
              <Icon name="check" size={12} style={{ color: t.petrol, marginTop: 2, flexShrink: 0 }} />
              <span>{doc}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.5, color: t.ink3, marginBottom: 6 }}>
          Timeline
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          {program.timeline.map((item, i) => (
            <div key={item.step} style={{ display: "flex", gap: 8, fontSize: 12 }}>
              <span style={{ color: t.ink3, fontWeight: 800, minWidth: 14 }}>{i + 1}.</span>
              <span>
                <strong style={{ color: t.ink }}>{item.step}</strong>
                <span style={{ color: t.ink3 }}> — {item.detail}</span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <Link
        href={`/broker/ai-underwriter-leads?program=${program.slug}`}
        style={{ ...qcBtnPrimary(t), textAlign: "center", textDecoration: "none", marginTop: "auto" }}
      >
        Start
      </Link>
    </Card>
  );
}
