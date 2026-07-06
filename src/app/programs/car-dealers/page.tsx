"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { QCMark } from "@/components/QCMark";

type CalcTab = "qc" | "mca" | "floorplan";
type Frequency = "daily" | "weekly";

type CalculatorState = {
  amount: string;
  rate: string;
  term: string;
  origination: string;
  closing: string;
  mcaAmount: string;
  factor: string;
  mcaMonths: string;
  floorplanBalance: string;
  floorplanRate: string;
  floorplanDays: string;
  floorplanMonthlyFee: string;
  floorplanOtherFees: string;
  monthlyCashFlow: string;
};

const initialCalc: CalculatorState = {
  amount: "250000",
  rate: "12",
  term: "12",
  origination: "0",
  closing: "0",
  mcaAmount: "250000",
  factor: "1.35",
  mcaMonths: "12",
  floorplanBalance: "250000",
  floorplanRate: "12",
  floorplanDays: "365",
  floorplanMonthlyFee: "250",
  floorplanOtherFees: "2000",
  monthlyCashFlow: "40000",
};

const pains = [
  "Daily or weekly payments eating into operating cash",
  "Stacked advances making payoff harder",
  "Floorplan balances tied directly to inventory",
  "Curtailments and fees increasing carrying pressure",
  "No clear view of true principal, interest, and cost of capital",
  "Limited flexibility when sales slow down",
];

const reviews = [
  "Business bank statements",
  "Dealer financial statements",
  "Inventory and floorplan exposure",
  "F&I, warranty, and product production",
  "Sales history and gross profit trends",
  "Real estate collateral, when available",
  "Existing MCA, advance, and lender obligations",
  "Dealer risk, liquidity, and repayment capacity",
];

const programs = [
  {
    tag: "Collateral-backed",
    title: "Real estate backed dealer capital",
    copy:
      "For dealers or principals with commercial or investment real estate. May support larger approvals, cleaner pricing, and longer terms depending on appraisal, lien position, cash flow, and underwriting.",
  },
  {
    tag: "Operating liquidity",
    title: "Dealer working capital facility",
    copy:
      "For qualified dealers seeking capital for growth, payoff, inventory expansion, vendor obligations, tax cleanup, or operational liquidity.",
  },
  {
    tag: "Pressure relief",
    title: "High-cost debt refinance review",
    copy:
      "For dealers carrying MCA balances or expensive short-term obligations. We review whether pressure-heavy capital can be consolidated or replaced with a cleaner structure.",
  },
  {
    tag: "Inventory analysis",
    title: "Floorplan support analysis",
    copy:
      "For dealers with floorplan exposure. We review inventory movement, balances, payoff behavior, aging units, and collateral controls before recommending added capital.",
  },
];

const requiredDocs = [
  "Business bank statements for the last 3 months",
  "Dealer financial statements and current year P&L",
  "Last 2 years of tax returns, if available",
  "Dealer license and ownership information",
  "Inventory report and floorplan statements",
  "Existing debt, MCA, and advance statements",
  "F&I, warranty, and product production reports",
  "Real estate documents if collateral is offered",
];

const process = [
  ["Submit file", "Contact details and uploads land in an encrypted file room."],
  ["AI screen", "The underwriter reviews files and asks only essential follow-up questions."],
  ["Package gaps", "Missing documents, discrepancies, and lender questions are clearly listed."],
  ["Term direction", "Likely funding path is identified before the file reaches capital partners."],
];

const faqs = [
  [
    "Is this a merchant cash advance?",
    "No. This is a full-doc funding review. The goal is to evaluate whether the dealership can support structured capital instead of pressure-heavy short-term money.",
  ],
  [
    "Do I need to know which loan product I want?",
    "No. Upload what you have and answer the essential questions. The AI underwriter infers whether the file looks like real-estate-backed, full-doc, DSCR/collateral, cash-out, refinance, or another path.",
  ],
  [
    "Can you review files with existing MCAs or floorplan debt?",
    "Yes. We need payoff details, payment schedules, bank statements, inventory, and cash-flow evidence so the system can evaluate repayment pressure.",
  ],
  [
    "What if my file is incomplete?",
    "The screen can still run. It will classify the answer as incomplete or conditional and tell you what must be uploaded next.",
  ],
];

export default function CarDealerProgramsPage() {
  const [calcTab, setCalcTab] = useState<CalcTab>("qc");
  const [frequency, setFrequency] = useState<Frequency>("daily");
  const [calc, setCalc] = useState<CalculatorState>(initialCalc);
  const [openFaq, setOpenFaq] = useState(0);

  const values = useMemo(() => calculateDealerCapital(calc), [calc]);

  function updateCalc(key: keyof CalculatorState, value: string) {
    setCalc((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="dealer-page">
      <style>{styles}</style>
      <RateTicker />
      <nav className="dealer-nav">
        <Link href="/" className="dealer-brand">
          <QCMark size={38} />
          <span>Qualified Commercial</span>
        </Link>
        <div className="dealer-nav-actions">
          <Link href="/dealer-ai-underwriter" className="nav-pill">
            AI Underwriter
          </Link>
          <Link href="/sign-in" className="gold-button compact">
            Login
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="kicker">Built for operators, not cash-advance cycles</p>
          <h1>Dealer funding with real underwriting behind it.</h1>
          <p className="lead">
            Access structured capital for used-car dealerships through a full-doc review of your real business:
            revenue, inventory, floorplan exposure, F&I production, bank activity, real estate collateral, and
            repayment capacity.
          </p>
          <div className="actions">
            <Link href="/dealer-ai-underwriter" className="gold-button">
              Request a Dealer Funding Review
            </Link>
            <a href="#calculator" className="outline-button">
              Compare your cost of capital
            </a>
          </div>
          <p className="fine-print">
            Preliminary review only. Final terms are subject to underwriting, collateral review, lender approval,
            documentation, market conditions, and due diligence.
          </p>
        </div>
        <aside className="hero-card">
          <p className="kicker gold">Example cost on $250K of dealer capital</p>
          <p className="subtle">Illustrative only: 12% amortized term funding vs. 12% floorplan carry + fees vs. a 1.35x MCA factor rate.</p>
          <CostBar label="Qualified funding" value={values.allInCost} color="#21d3c7" pct={values.qcBarPct} />
          <CostBar label="Floorplan carry" value={values.floorplanCost} color="#D4AF37" pct={values.floorplanBarPct} />
          <CostBar label="MCA advance" value={values.mcaCost} color="#F87171" pct={values.mcaBarPct} />
          <a href="#calculator" className="outline-button full">
            Run your own numbers
          </a>
        </aside>
      </section>

      <section className="split-section">
        <div>
          <p className="kicker gold">The problem</p>
          <h2>Fast money can become expensive money.</h2>
          <p>
            Many dealers use MCAs, short-term advances, or aggressive floorplan structures because they need capital
            quickly. The problem is not always access. It is repayment pressure: daily withdrawals, stacked advances,
            curtailments, audit fees, high factor rates, and short payback windows.
          </p>
        </div>
        <div className="mini-grid">
          {pains.map((pain) => (
            <div className="risk-card" key={pain}>
              <span className="red-dot" />
              {pain}
            </div>
          ))}
        </div>
      </section>

      <section className="solution-panel">
        <div>
          <p className="kicker">The solution</p>
          <h2>A smarter dealer capital structure.</h2>
          <p>
            The review is built around the actual dealership file. The AI underwriter does not ask the client to pick a
            product first. It collects evidence, screens the documents, and identifies the likely path.
          </p>
          <blockquote>The goal is not just to fund the dealer. The goal is to structure capital the dealer can actually live with.</blockquote>
        </div>
        <div className="review-grid">
          {reviews.map((item) => (
            <div className="check-row" key={item}>
              <span>✓</span>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section id="programs" className="content-section">
        <p className="kicker">Program types</p>
        <h2>Funding options for established dealers.</h2>
        <div className="program-grid">
          {programs.map((program) => (
            <article className="program-card" key={program.title}>
              <div className="tag">{program.tag}</div>
              <h3>{program.title}</h3>
              <p>{program.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="calculator" className="content-section calculator-section">
        <p className="kicker gold">Cost comparison</p>
        <h2>Compare the real cost of dealer capital.</h2>
        <p className="section-lead">
          A term loan, an MCA, and a floorplan facility can all give a dealer access to money. The repayment pressure
          and total cost can be completely different.
        </p>

        <div className="calculator-grid">
          <div className="calc-inputs">
            <div className="tabs">
              {(["qc", "mca", "floorplan"] as CalcTab[]).map((tab) => (
                <button key={tab} className={calcTab === tab ? "active" : ""} onClick={() => setCalcTab(tab)}>
                  {tab === "qc" ? "Our funding" : tab === "mca" ? "MCA" : "Floorplan"}
                </button>
              ))}
            </div>

            {calcTab === "qc" ? (
              <div className="field-stack">
                <CalcField label="Funding amount ($)" value={calc.amount} onChange={(value) => updateCalc("amount", value)} />
                <div className="two-col">
                  <CalcField label="Rate (%)" value={calc.rate} onChange={(value) => updateCalc("rate", value)} />
                  <CalcField label="Term (months)" value={calc.term} onChange={(value) => updateCalc("term", value)} />
                </div>
                <div className="two-col">
                  <CalcField label="Origination (%)" value={calc.origination} onChange={(value) => updateCalc("origination", value)} />
                  <CalcField label="Closing costs ($)" value={calc.closing} onChange={(value) => updateCalc("closing", value)} />
                </div>
              </div>
            ) : null}

            {calcTab === "mca" ? (
              <div className="field-stack">
                <CalcField label="Advance amount ($)" value={calc.mcaAmount} onChange={(value) => updateCalc("mcaAmount", value)} />
                <div className="two-col">
                  <CalcField label="Factor rate" value={calc.factor} onChange={(value) => updateCalc("factor", value)} />
                  <CalcField label="Payback (months)" value={calc.mcaMonths} onChange={(value) => updateCalc("mcaMonths", value)} />
                </div>
                <div>
                  <div className="field-label">Payment frequency</div>
                  <div className="segmented">
                    <button className={frequency === "daily" ? "active" : ""} onClick={() => setFrequency("daily")}>Daily</button>
                    <button className={frequency === "weekly" ? "active" : ""} onClick={() => setFrequency("weekly")}>Weekly</button>
                  </div>
                </div>
              </div>
            ) : null}

            {calcTab === "floorplan" ? (
              <div className="field-stack">
                <CalcField label="Average outstanding balance ($)" value={calc.floorplanBalance} onChange={(value) => updateCalc("floorplanBalance", value)} />
                <div className="two-col">
                  <CalcField label="Rate (%)" value={calc.floorplanRate} onChange={(value) => updateCalc("floorplanRate", value)} />
                  <CalcField label="Days outstanding" value={calc.floorplanDays} onChange={(value) => updateCalc("floorplanDays", value)} />
                </div>
                <div className="two-col">
                  <CalcField label="Monthly fees ($)" value={calc.floorplanMonthlyFee} onChange={(value) => updateCalc("floorplanMonthlyFee", value)} />
                  <CalcField label="Audit / curtailment / doc ($)" value={calc.floorplanOtherFees} onChange={(value) => updateCalc("floorplanOtherFees", value)} />
                </div>
              </div>
            ) : null}

            <div className="cashflow-box">
              <CalcField label="Dealer monthly net cash flow ($)" value={calc.monthlyCashFlow} onChange={(value) => updateCalc("monthlyCashFlow", value)} />
              <p>Used only for the cash-flow pressure score.</p>
            </div>
          </div>

          <div className="calc-results">
            <div className="metric-grid">
              <Metric label="Monthly payment" value={money(values.qcPayment)} />
              <Metric label="Total repayment" value={money(values.qcTotalRepayment)} />
              <Metric label="Savings vs MCA" value={money(Math.max(0, values.mcaCost - values.allInCost))} accent />
              <Metric label="Savings vs floorplan" value={money(Math.max(0, values.floorplanCost - values.allInCost))} accent />
            </div>
            <div className="comparison-card">
              <CostBar label="Qualified funding all-in cost" value={values.allInCost} color="#21d3c7" pct={values.qcBarPct} />
              <CostBar label="Floorplan carry cost" value={values.floorplanCost} color="#D4AF37" pct={values.floorplanBarPct} />
              <CostBar
                label={`MCA advance - ${frequency === "daily" ? "daily" : "weekly"} payment ${money(frequency === "daily" ? values.mcaDailyPayment : values.mcaWeeklyPayment)}`}
                value={values.mcaCost}
                color="#F87171"
                pct={values.mcaBarPct}
              />
              <p className="subtle">MCA rough annualized cost: {Math.round(values.mcaAnnualizedCost)}%</p>
            </div>
            <div className="pressure-card">
              <div className="field-label">Cash-flow pressure - monthly obligation vs. net cash flow</div>
              {values.pressureRows.map((row) => (
                <div className="pressure-row" key={row.label}>
                  <div>
                    <strong>{row.label}</strong>
                    <span>{row.verdict}</span>
                  </div>
                  <b className={row.level}>{Math.round(row.pct)}%</b>
                </div>
              ))}
            </div>
            <p className="fine-print">
              For illustration only. Floorplan estimate reflects carrying cost, not a full inventory payoff schedule.
              MCA annualized cost is an estimate and may differ from legal APR calculations.
            </p>
          </div>
        </div>
      </section>

      <section className="split-section">
        <div className="doc-card">
          <p className="kicker">Required package</p>
          <h2>Upload what you have. The AI will identify the rest.</h2>
          <p>
            The review starts with documents, not product selection. If the package is incomplete, the result explains
            exactly what is missing and why an underwriter would ask for it.
          </p>
        </div>
        <div className="doc-list">
          {requiredDocs.map((doc) => (
            <div className="check-row" key={doc}>
              <span>✓</span>
              {doc}
            </div>
          ))}
        </div>
      </section>

      <section className="content-section">
        <p className="kicker gold">Process</p>
        <h2>Designed to get to an answer quickly.</h2>
        <div className="process-grid">
          {process.map(([title, copy], index) => (
            <div className="process-card" key={title}>
              <span>{index + 1}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="faq-section">
        <p className="kicker">Common questions</p>
        <h2>Dealer capital, without the guessing.</h2>
        {faqs.map(([question, answer], index) => (
          <button className="faq-row" key={question} onClick={() => setOpenFaq(openFaq === index ? -1 : index)}>
            <span>
              <strong>{question}</strong>
              {openFaq === index ? <em>{answer}</em> : null}
            </span>
            <b>{openFaq === index ? "-" : "+"}</b>
          </button>
        ))}
      </section>

      <section className="final-cta">
        <div>
          <p className="kicker gold">Start the screen</p>
          <h2>Let the AI Underwriter collect and review the file.</h2>
          <p>
            The AI intake collects contact info, documents, capital need, real estate schedule, estimated credit score,
            and referral source, then returns a strict preliminary screen.
          </p>
        </div>
        <Link href="/dealer-ai-underwriter" className="gold-button">
          Use our AI Underwriter
        </Link>
      </section>

      <footer className="dealer-footer">
        <div className="dealer-brand small">
          <QCMark size={24} />
          <span>Qualified Commercial</span>
        </div>
        <span>Preliminary screen only. Encrypted uploads. Not a commitment to lend.</span>
      </footer>
    </main>
  );
}

function RateTicker() {
  const items = [
    "SOFR 4.33%",
    "Prime 7.50%",
    "10Y UST 4.21%",
    "MCA factor rates 1.10-1.50x",
    "Deals reviewed $125K-$500K+",
    "Full-doc structured terms",
  ];
  return (
    <div className="ticker" aria-hidden="true">
      <div>
        {[...items, ...items].map((item, index) => (
          <span key={`${item}-${index}`}>{item}</span>
        ))}
      </div>
    </div>
  );
}

function CalcField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="calc-field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} inputMode="decimal" />
    </label>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={accent ? "metric accent" : "metric"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CostBar({ label, value, color, pct }: { label: string; value: number; color: string; pct: number }) {
  return (
    <div className="cost-bar">
      <div>
        <span>{label}</span>
        <strong style={{ color }}>{money(value)}</strong>
      </div>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none">
        <rect x="0" y="0" width="100" height="8" rx="4" fill="rgba(255,255,255,0.08)" />
        <rect x="0" y="0" width={String(Math.max(2, Math.min(100, pct)))} height="8" rx="4" fill={color} />
      </svg>
    </div>
  );
}

function calculateDealerCapital(calc: CalculatorState) {
  const amount = num(calc.amount, 250000);
  const rate = num(calc.rate, 12) / 100;
  const term = num(calc.term, 12);
  const monthlyRate = rate / 12;
  const qcPayment = monthlyRate > 0 ? (amount * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -term)) : amount / term;
  const qcTotalRepayment = qcPayment * term + amount * (num(calc.origination, 0) / 100) + num(calc.closing, 0);
  const allInCost = Math.max(0, qcTotalRepayment - amount);

  const advance = num(calc.mcaAmount, amount);
  const factor = num(calc.factor, 1.35);
  const mcaMonths = num(calc.mcaMonths, 12);
  const mcaTotalPayback = advance * factor;
  const mcaCost = Math.max(0, mcaTotalPayback - advance);
  const mcaMonthlyPayment = mcaTotalPayback / mcaMonths;
  const mcaDailyPayment = mcaTotalPayback / (mcaMonths * 21);
  const mcaWeeklyPayment = mcaTotalPayback / (mcaMonths * 4.33);
  const mcaAnnualizedCost = advance > 0 ? (mcaCost / advance) * (12 / mcaMonths) * 100 : 0;

  const fpBalance = num(calc.floorplanBalance, amount);
  const fpRate = num(calc.floorplanRate, 12) / 100;
  const fpDays = num(calc.floorplanDays, 365);
  const fpMonths = Math.max(fpDays / 30.44, 1);
  const fpInterest = fpBalance * (fpRate / 365) * fpDays;
  const floorplanCost = Math.max(0, fpInterest + num(calc.floorplanMonthlyFee, 250) * fpMonths + num(calc.floorplanOtherFees, 2000));
  const floorplanMonthlyCarry = floorplanCost / fpMonths;

  const maxCost = Math.max(allInCost, mcaCost, floorplanCost, 1);
  const monthlyCashFlow = num(calc.monthlyCashFlow, 40000);
  const pressureRows = [
    pressure("Qualified funding", qcPayment, monthlyCashFlow),
    pressure("Floorplan carry", floorplanMonthlyCarry, monthlyCashFlow),
    pressure("MCA advance", mcaMonthlyPayment, monthlyCashFlow),
  ];

  return {
    qcPayment,
    qcTotalRepayment,
    allInCost,
    mcaCost,
    mcaDailyPayment,
    mcaWeeklyPayment,
    mcaAnnualizedCost,
    floorplanCost,
    pressureRows,
    qcBarPct: Math.round((allInCost / maxCost) * 100),
    mcaBarPct: Math.round((mcaCost / maxCost) * 100),
    floorplanBarPct: Math.round((floorplanCost / maxCost) * 100),
  };
}

function pressure(label: string, monthly: number, cashFlow: number) {
  const pct = cashFlow > 0 ? (monthly / cashFlow) * 100 : 0;
  const level = pct < 25 ? "green" : pct < 50 ? "yellow" : "red";
  const verdict = pct < 25 ? "Manageable" : pct < 50 ? "Needs review" : "High pressure";
  return { label, pct, level, verdict };
}

function num(value: string, fallback: number): number {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function money(value: number): string {
  return `$${Math.round(Number.isFinite(value) ? value : 0).toLocaleString()}`;
}

const styles = `
.dealer-page{min-height:100vh;background:#060B1A;color:#E2E8F0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;overflow-x:hidden}
.dealer-page *{box-sizing:border-box}
.ticker{height:34px;background:#020617;border-bottom:1px solid rgba(212,175,55,.22);overflow:hidden;white-space:nowrap;display:flex;align-items:center}
.ticker div{display:inline-flex;gap:34px;align-items:center;height:100%;padding:0 22px;animation:qcticker 46s linear infinite;font-size:12px;color:#B8C4D6;text-transform:uppercase;font-weight:700}
.ticker span{color:#E9D58A}
@keyframes qcticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.dealer-nav{position:sticky;top:0;z-index:20;backdrop-filter:blur(18px);background:rgba(6,11,26,.86);border-bottom:1px solid rgba(255,255,255,.08);height:66px;width:100%;padding:0 max(20px,calc((100vw - 1180px)/2));display:flex;align-items:center;justify-content:space-between;gap:16px}
.dealer-brand{display:inline-flex;align-items:center;gap:12px;text-decoration:none;color:#F1F5F9;font-weight:900;font-size:16px}
.dealer-brand.small{font-size:13px;color:#B8C4D6}
.dealer-nav-actions,.actions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.nav-pill,.outline-button,.gold-button{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;min-height:48px;padding:0 22px;border-radius:999px;font-weight:900;font-size:14px;cursor:pointer}
.nav-pill,.outline-button{color:#E2E8F0;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.035)}
.gold-button{background:linear-gradient(135deg,#E9D58A,#D4AF37);color:#0B1326;border:0;box-shadow:0 16px 44px rgba(212,175,55,.3)}
.gold-button.compact{min-height:40px;padding:0 18px}
.outline-button.full{width:100%;margin-top:22px}
.hero,.split-section,.solution-panel,.content-section,.final-cta,.faq-section,.dealer-footer{width:min(1180px,calc(100% - 40px));margin:0 auto}
.hero{padding:74px 0 80px;display:grid;grid-template-columns:minmax(0,1.12fr) minmax(340px,.88fr);gap:48px;align-items:center;background:linear-gradient(rgba(255,255,255,.032) 1px,transparent 1px) 0 0/34px 34px,linear-gradient(90deg,rgba(255,255,255,.032) 1px,transparent 1px) 0 0/34px 34px}
.kicker{display:inline-flex;margin:0 0 16px;color:#70ded5;font-size:12px;font-weight:900;letter-spacing:0;text-transform:uppercase;padding:7px 13px;border:1px solid rgba(33,211,199,.28);border-radius:999px;background:rgba(33,211,199,.06)}
.kicker.gold{color:#E9D58A;border-color:rgba(212,175,55,.3);background:rgba(212,175,55,.06)}
h1,h2,h3{letter-spacing:0;color:#F6F8FB}
h1{margin:0 0 22px;font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:clamp(38px,5.2vw,62px);line-height:1.02}
h2{margin:0 0 14px;font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:clamp(28px,3.4vw,40px);line-height:1.08}
h3{margin:0;font-size:20px;line-height:1.2}
.lead,.section-lead,.split-section p,.solution-panel p,.final-cta p{color:#A8B5C7;font-size:16px;line-height:1.62;margin:0}
.lead{font-size:17px;max-width:580px}
.fine-print,.subtle{color:#7E8DA3;font-size:12px;line-height:1.55;margin:16px 0 0}
.hero-card,.program-card,.calc-inputs,.calc-results,.doc-card,.process-card,.faq-row,.solution-panel{background:linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.015));border:1px solid rgba(255,255,255,.09);border-radius:18px}
.hero-card{padding:28px;box-shadow:0 30px 80px rgba(0,0,0,.45)}
.cost-bar{display:grid;gap:7px;margin-top:16px}
.cost-bar div{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.cost-bar span{font-size:14px;color:#E2E8F0;font-weight:800}
.cost-bar strong{font-family:Georgia,"Times New Roman",serif;font-weight:600;font-size:20px}
.cost-bar svg{width:100%;height:10px;display:block}
.split-section{padding:76px 0 8px;display:grid;grid-template-columns:minmax(0,.9fr) minmax(0,1.1fr);gap:44px;align-items:start}
.mini-grid,.review-grid,.doc-list{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.risk-card,.check-row{border:1px solid rgba(255,255,255,.09);background:rgba(255,255,255,.03);border-radius:14px;padding:15px 16px;color:#CBD5E1;font-size:14px;line-height:1.5;display:flex;gap:11px;align-items:flex-start}
.red-dot{width:8px;height:8px;flex-shrink:0;margin-top:6px;border-radius:999px;background:#F87171}
.solution-panel{padding:40px;margin-top:70px;display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
blockquote{margin:20px 0 0;padding:16px 18px;border-left:3px solid #D4AF37;background:rgba(212,175,55,.06);border-radius:0 8px 8px 0;color:#E9D58A;font-size:15px;line-height:1.55;font-weight:700;font-family:Georgia,"Times New Roman",serif}
.check-row span{width:18px;height:18px;flex-shrink:0;border-radius:999px;background:rgba(33,211,199,.14);border:1px solid rgba(33,211,199,.45);color:#70ded5;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:900}
.content-section{padding:76px 0 8px}
.program-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.program-card{padding:24px;min-height:250px;display:flex;flex-direction:column;gap:12px}
.program-card p,.process-card p{margin:0;color:#95A3B6;font-size:14px;line-height:1.6}
.tag,.field-label{font-size:11px;font-weight:900;color:#70ded5;text-transform:uppercase;letter-spacing:0}
.calculator-grid{display:grid;grid-template-columns:minmax(340px,.85fr) minmax(0,1.15fr);gap:16px;align-items:start}
.calc-inputs,.calc-results{padding:22px}
.tabs,.segmented{display:flex;gap:6px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:5px;margin-bottom:18px}
.tabs button,.segmented button{flex:1;min-height:38px;border:0;border-radius:999px;background:transparent;color:#94A3B8;font-weight:800;font-size:13px;cursor:pointer}
.tabs button.active,.segmented button.active{background:linear-gradient(135deg,#E9D58A,#D4AF37);color:#0B1326}
.field-stack{display:grid;gap:13px}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:11px}
.calc-field{display:grid;gap:6px}
.calc-field span{color:#94A3B8;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0}
.calc-field input{width:100%;min-height:46px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:0 13px;color:#F1F5F9;font-size:15px;font-family:inherit;outline:none}
.cashflow-box{margin-top:18px;padding-top:18px;border-top:1px solid rgba(255,255,255,.08)}
.cashflow-box p{margin:10px 0 0;color:#68788F;font-size:12px}
.metric-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:11px}
.metric{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:16px}
.metric span{display:block;color:#7E8DA3;font-size:11px;font-weight:900;text-transform:uppercase}
.metric strong{display:block;margin-top:6px;font-family:Georgia,"Times New Roman",serif;font-size:22px;color:#F1F5F9}
.metric.accent{background:rgba(33,211,199,.08);border-color:rgba(33,211,199,.28)}
.metric.accent strong,.metric.accent span{color:#70ded5}
.comparison-card,.pressure-card{margin-top:14px;padding:18px;border:1px solid rgba(255,255,255,.09);border-radius:12px;background:rgba(255,255,255,.025)}
.pressure-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-top:1px solid rgba(255,255,255,.08);padding:12px 0}
.pressure-row:first-of-type{border-top:0}
.pressure-row strong{display:block;color:#E2E8F0}
.pressure-row span{display:block;color:#7E8DA3;font-size:12px;margin-top:2px}
.pressure-row b.green{color:#70ded5}.pressure-row b.yellow{color:#E9D58A}.pressure-row b.red{color:#F87171}
.doc-card{padding:30px}
.process-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.process-card{padding:22px}
.process-card span{width:34px;height:34px;border-radius:999px;background:rgba(212,175,55,.13);border:1px solid rgba(212,175,55,.3);color:#E9D58A;display:inline-flex;align-items:center;justify-content:center;font-weight:900;margin-bottom:14px}
.faq-section{padding:76px 0 8px;max-width:820px}
.faq-row{width:100%;text-align:left;display:flex;justify-content:space-between;gap:18px;padding:20px;margin-top:12px;color:#E2E8F0;cursor:pointer}
.faq-row strong{display:block;font-size:16px}.faq-row em{display:block;color:#95A3B6;font-style:normal;margin-top:10px;line-height:1.55}
.faq-row b{color:#E9D58A;font-size:22px}
.final-cta{margin-top:70px;margin-bottom:70px;padding:42px;background:linear-gradient(120deg,#0B1D3A,#050E1F);border:1px solid rgba(212,175,55,.28);border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:28px}
.final-cta div{max-width:680px}
.dealer-footer{padding:34px 0;display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;color:#7E8DA3;font-size:13px;border-top:1px solid rgba(212,175,55,.16)}
@media (max-width: 980px){
  .hero,.split-section,.solution-panel,.calculator-grid,.final-cta{grid-template-columns:1fr;display:grid}
  .program-grid,.process-grid{grid-template-columns:repeat(2,1fr)}
  .hero{padding-top:44px}
}
@media (max-width: 640px){
  .dealer-nav{height:auto;padding:14px 20px;align-items:flex-start}
  .dealer-nav-actions{justify-content:flex-start}
  .dealer-brand span{display:none}
  .mini-grid,.review-grid,.doc-list,.metric-grid,.program-grid,.process-grid,.two-col{grid-template-columns:1fr}
  .hero,.split-section,.solution-panel,.content-section,.final-cta,.faq-section,.dealer-footer{width:calc(100% - 28px)}
  .gold-button,.outline-button{width:100%}
}
`;
