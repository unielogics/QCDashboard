"use client";

// Dealer-partner ("broker") portal: Programs & Resources. A horizontally-
// scrolling row of equal-sized cards, one per lending program QC places for
// car dealers, each with a summary, required documents, timeline, and a
// Start button. Static content -- no backend endpoint distinguishes
// documents/timelines per program today (only one shared baseline
// checklist exists, see dealer_ai_intake.py's REQUIRED_DOCUMENTS), so this
// mirrors the same authored-copy approach the public dealer marketing page
// uses (now qualifiedcommercial.com/industries/auto; the old
// /programs/car-dealers route here permanently redirects to it).
// "Start" hands off to the My Leads
// page via a ?program= query param rather than inventing a backend field
// that doesn't exist yet (BrokerLeadCreate has no program slot).

import Link from "next/link";
import { Card, CellChip, PageHeader } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
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
  const { data: me, isLoading: meLoading } = useCurrentUser();

  if (meLoading) {
    return (
      <Card>
        <span className="sub">Loading…</span>
      </Card>
    );
  }
  if (me && me.role !== Role.DEALER_PARTNER) {
    return <Card>This page is only available to dealer partner accounts.</Card>;
  }

  return (
    <div className="grid">
      <PageHeader
        title="Programs & Resources"
        lede="The financing programs Qualified Commercial places for car dealers — what each covers, what's required, and how long it takes."
      />

      {/* Bespoke: a snapping horizontal carousel of fixed-width cards. Not a
          grid — the cards must overflow sideways, not reflow. */}
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
    </div>
  );
}

function ProgramCard({ program }: { program: Program }) {
  return (
    <Card
      // `.card` owns surface, border, radius, shadow and padding. These are
      // the carousel geometry it cannot own: a fixed track width, the snap
      // point, and the column that lets Start sit on the bottom edge so
      // every card's action lines up.
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
        <CellChip tone="pet">{program.tag}</CellChip>
        <h3 style={{ marginTop: 10 }}>{program.title}</h3>
        <p className="sub" style={{ margin: "6px 0 0", lineHeight: 1.5 }}>{program.summary}</p>
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 6 }}>Required documents</div>
        {/* `.req` + `.ic.ok` is the sheet's checklist row — the same shape a
            loan file's requirement list uses, so a program's document list
            and a live file's document list read as one object. */}
        {program.requiredDocs.map((doc) => (
          <div key={doc} className="req">
            <span className="ic ok">
              <Icon name="check" size={11} />
            </span>
            <span>{doc}</span>
          </div>
        ))}
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 6 }}>Timeline</div>
        {/* `.prio` is the sheet's numbered "step — what happens" row. */}
        {program.timeline.map((item, i) => (
          <div key={item.step} className="prio">
            <span className="n">{i + 1}</span>
            <span>
              <span className="t">{item.step}</span>
              <span className="d"> — {item.detail}</span>
            </span>
          </div>
        ))}
      </div>

      <Link
        href={`/broker/ai-underwriter-leads?program=${program.slug}`}
        className="btn pri"
        // `.btn` owns everything but these: the auto margin pins the action to
        // the bottom of the card, and `.btn` sets no justify-content, so the
        // label centres in the stretched-to-full-width footer button.
        style={{ marginTop: "auto", justifyContent: "center" }}
      >
        Start
      </Link>
    </Card>
  );
}
