// Step 4 — What changes for the dealer, and for you. The dealer paying the
// loan versus the loan built into the policies, side by side, whether it
// holds up, what the sponsor earns, and the proposal the dealer sees.
import { useState } from "react";
import { money, num, pct, signedMoney } from "../format";
import { Step7Shortfall } from "../steps/Step7Shortfall";
import { Step8Projection } from "../steps/Step8Projection";
import { Callout, Disclosure, Field, PBtn, PChip, PPanel, type StepCtx } from "../ui";

const SHORTFALL_KEYS = new Set(["cadence", "cure_days", "corrective", "adj", "adj_value", "exclusions", "exclusion_1", "exclusion_2", "exclusion_3"]);

export function PageChanges({ ctx, onPresentation, busy }: { ctx: StepCtx; onPresentation: () => void; busy: boolean }) {
  const { draft, prov, computed, pkg, mode, focusKey } = ctx;
  const b = computed.buildout;
  const build = b.build !== false;
  const pay = b.debt_service;
  const term = computed.advance.term || 1;
  const on = prov.rows.filter((r) => r.on);
  const funded = prov.repay_m;
  const [showProposal, setShowProposal] = useState(true);
  const shortfallOpen = computed.attention.filter((a) => SHORTFALL_KEYS.has(a.key)).length;

  // Two scenarios on the same numbers: the dealer keeps the whole cushion and
  // pays the loan from operations, or the policies carry it.
  const scenario = (withBuild: boolean) => {
    const carried = withBuild ? Math.min(funded, pay) : 0;
    const ops = Math.max(0, pay - carried);
    // Products cost the dealer, at today's volume, at the price each scenario implies.
    const savM = withBuild ? prov.savings_m : on.reduce((a, r) => a + r.cur_contracts * (r.cur_premium - (r.premium - r.repay)), 0);
    const pos = savM - ops;
    const free = withBuild && funded >= pay - 0.5;
    return {
      key: withBuild ? "with" : "without", withBuild, free, current: withBuild === build,
      title: withBuild ? "Built into the policies" : "Dealer pays the loan",
      sub: withBuild ? "The repayment is a line in each product's fee stack, funded from the cushion." : "The dealer moves to our products and services the loan from operating cash.",
      tag: free ? "Loan is free to the dealer" : withBuild ? `${pct(Math.min(100, pay ? (carried / pay) * 100 : 0), 0)} of the payment carried` : "Full payment from operations",
      tone: (free ? "ok" : withBuild ? "warn" : "mut") as "ok" | "warn" | "mut",
      pos, savM, carried, ops, gross: withBuild ? prov.gross : on.reduce((a, r) => a + r.contracts * (r.premium - r.repay), 0),
    };
  };
  const scenarios = [scenario(false), scenario(true)];
  const meetsMin = funded >= prov.remittance_req - 0.5;
  const checks = [
    build ? { ok: meetsMin, mid: false, label: "Policies remit at least 125% of the payment", detail: `${money(funded)} against ${money(prov.remittance_req)} required` }
      : { ok: false, mid: true, label: "Loan serviced directly by the dealer", detail: `No remittance is built into the products; the dealer pays ${money(pay)} a month from operations` },
    { ok: !on.some((r) => r.stack_known && r.savings < 0), mid: false, label: "Dealer pays no more than today on any product", detail: on.some((r) => r.stack_known && r.savings < 0) ? `${on.filter((r) => r.stack_known && r.savings < 0).map((r) => r.label).join(", ")} above today's price` : "Every product is at or below what the dealer pays now" },
    { ok: Boolean(draft.products.vsc.on), mid: false, label: "Vehicle service contracts are a covered product", detail: draft.products.vsc.on ? "The primary repayment product is committed" : "Unticked — the primary repayment product is missing" },
    { ok: !on.some((r) => r.rate > 85), mid: false, label: "No attachment above 85%", detail: "Underwriting's credibility ceiling" },
  ];
  const proposalRows = on.map((r) => ({
    label: r.label, today: r.cur_premium, prog: r.premium, sav: r.stack_known || r.premium ? r.cur_premium - r.premium : 0, savM: r.cur_contracts * (r.cur_premium - r.premium),
  }));
  const mgmt = prov.mgmt_m;
  const avgMarkup = prov.contracts ? prov.markup_m / prov.contracts : 0;
  // Where the loan goes prints once an amount is entered — a list of labels with no figures says nothing to the dealer.
  const proceeds = (Array.isArray(draft.proceeds) ? draft.proceeds : []).filter((l) => l && String(l.amount ?? "").trim() !== "");
  const requested = Number(draft.requested) || 0;
  const proceedsGap = requested - prov.proceeds_total;

  return (
    <>
      {build && on.length && funded <= 0 ? <Callout tone="bad"><b>Nothing is built into the policies yet.</b> On step 3, use Build it and come back here. Until then the dealer pays the full {money(pay)} from operations.</Callout> : null}
      <div className="pp-cols">
        {scenarios.map((s) => (
          <PPanel key={s.key} title={s.title} sub={s.sub} tone={s.free ? "ok" : undefined} right={<PChip tone={s.tone}>{s.tag}{s.current ? " · selected" : ""}</PChip>} className="pp-scn">
            <div className="pp-bigv" style={{ color: s.pos >= 0 ? "var(--ink)" : "var(--danger)" }}>{signedMoney(s.pos)}<small> a month vs today</small></div>
            <div className="pp-kvlist">
              <div className="pp-kv row"><span className="pp-lbl">Products, vs today</span><span className={`pp-val ${s.savM >= 0 ? "c-ok" : "c-bad"}`}>{signedMoney(s.savM)}</span></div>
              <div className="pp-kv row"><span className="pp-lbl">Loan payment</span><span className="pp-val">{money(pay)}</span></div>
              <div className="pp-kv row"><span className="pp-lbl">Carried by the policies</span><span className="pp-val">{s.carried ? money(s.carried) : "—"}</span></div>
              <div className="pp-kv row"><span className="pp-lbl">Paid from operations</span><span className={`pp-val ${s.ops ? "c-bad" : "c-ok"}`}>{s.ops ? `−${money(s.ops)}` : "$0"}</span></div>
              <div className="pp-kv row"><span className="pp-lbl">Net position, a month</span><span className={`pp-val ${s.pos >= 0 ? "c-ok" : "c-bad"}`}>{signedMoney(s.pos)}</span></div>
              <div className="pp-kv row"><span className="pp-lbl">Over the term</span><span className={`pp-val ${s.pos >= 0 ? "c-ok" : "c-bad"}`}>{signedMoney(s.pos * term)}</span></div>
              <div className="pp-kv row"><span className="pp-lbl">Product gross a month</span><span className="pp-val">{money(s.gross)}</span></div>
            </div>
          </PPanel>
        ))}
      </div>
      <PPanel title="Does it hold up?" sub="What underwriting checks before the agreement goes out. The server's own list on the right is the gate; these are the four that matter most.">
        {checks.map((c) => (
          <div key={c.label} className="pp-chk-row">
            <span className={`ic ${c.mid ? "mid" : c.ok ? "ok" : "no"}`}>{c.mid ? "–" : c.ok ? "✓" : "!"}</span>
            <span><b>{c.label}</b><small>{c.detail}</small></span>
          </div>
        ))}
      </PPanel>
      {mode === "operator" ? (
        <PPanel title="What you earn" sub="Sponsor economics.">
          <div className="pp-grid">
            <div className="pp-kv"><span className="pp-lbl">Markup, across the covered products</span><span className="pp-val">{money(prov.markup_m)} a month</span></div>
            <div className="pp-kv"><span className="pp-lbl">Programme management</span><span className="pp-val">{money(mgmt)} a month</span></div>
            <div className="pp-kv"><span className="pp-lbl">Average markup per contract</span><span className="pp-val">{prov.contracts ? money(avgMarkup) : "—"}</span></div>
            <div className="pp-kv"><span className="pp-lbl">Over the term</span><span className="pp-val">{money((prov.markup_m + mgmt) * term)}</span></div>
          </div>
          <p className="pp-sub" style={{ marginTop: 8 }}>Your markup is set per product in the fee stack on step 3. Lowering it frees cushion for the loan or the dealer.</p>
        </PPanel>
      ) : null}
      <PPanel title="Dealer proposal" sub="What the dealer sees — today, with us, and the difference."
        right={<><PBtn size="sm" onClick={() => setShowProposal((v) => !v)}>{showProposal ? "Hide" : "Show"}</PBtn>{pkg.stage === 1 ? <PBtn size="sm" variant="pri" onClick={onPresentation} busy={busy} disabled={!pkg.capabilities.can_generate}>Generate the PDF</PBtn> : null}</>}>
        <div className="pp-grid" style={{ marginBottom: 12 }}>
          <Field ctx={ctx} k="proceeds" span={3} />
        </div>
        {showProposal ? (
          <div className="pp-doc">
            <div className="pp-eyebrow">Qualified Commercial · Dealer proposal · {pkg.business_name}</div>
            <h3 className="pp-sect" style={{ marginTop: 6 }}>{build ? "Loan built into the products" : "Dealer services the loan directly"}</h3>
            <p className="pp-sub">
              {build
                ? <>Under this programme the dealer&apos;s loan payment of {money(pay)} a month is carried inside the products: {money(Math.min(funded, pay))} of it comes out of the contracts already being sold{Math.max(0, pay - funded) > 0 ? <>, and {money(Math.max(0, pay - funded))} a month is paid from operations.</> : <>, and nothing is paid from operations.</>} On today&apos;s volume the products cost {prov.savings_m >= 0 ? `${money(prov.savings_m)} a month less` : `${money(-prov.savings_m)} a month more`} than today.</>
                : <>Under this programme the dealer services the loan directly at {money(pay)} a month, and on today&apos;s volume the products cost {prov.savings_m >= 0 ? `${money(prov.savings_m)} a month less` : `${money(-prov.savings_m)} a month more`} than today.</>}
              {pkg.stage === 1 ? " The rate, the term and the supporting program are set in the term sheet at closing." : ""}
            </p>
            <table className="pp-tbl">
              <thead><tr><th>Product</th><th className="n">Today</th><th className="n">With us</th><th className="n">Per contract</th><th className="n">A month</th></tr></thead>
              <tbody>{proposalRows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="n">{money(r.today)}</td><td className="n">{money(r.prog)}</td><td className={`n ${r.sav > 0 ? "c-ok" : r.sav < 0 ? "c-bad" : ""}`}>{r.sav > 0 ? `−${money(r.sav)}` : r.sav < 0 ? `+${money(-r.sav)}` : "—"}</td><td className={`n ${r.savM > 0 ? "c-ok" : r.savM < 0 ? "c-bad" : ""}`}>{r.savM > 0 ? `−${money(r.savM)}` : r.savM < 0 ? `+${money(-r.savM)}` : "—"}</td></tr>)}</tbody>
              <tfoot><tr><th>On today&apos;s {num(prov.cur_contracts)} contracts</th><th className="n">{money(prov.cur_gross)}</th><th className="n">{money(prov.cost_same)}</th><th /><th className={`n ${prov.savings_m >= 0 ? "c-ok" : "c-bad"}`}>{prov.savings_m > 0 ? `−${money(prov.savings_m)}` : prov.savings_m < 0 ? `+${money(-prov.savings_m)}` : "—"}</th></tr></tfoot>
            </table>
            {proceeds.length ? (
              <>
                <h4 className="pp-sect" style={{ marginTop: 12 }}>Where the loan goes</h4>
                <table className="pp-tbl">
                  <thead><tr><th>Purpose</th><th className="n">Amount</th><th>Note</th></tr></thead>
                  <tbody>{proceeds.map((l, i) => <tr key={i}><td>{l.label || "—"}</td><td className="n">{money(Number(l.amount) || 0)}</td><td className="muted">{l.note}</td></tr>)}</tbody>
                  <tfoot><tr><th>Total</th><th className="n">{money(prov.proceeds_total)}</th><th className="muted">{requested ? `of a ${money(requested)} request` : ""}{Math.abs(proceedsGap) > 1 ? (proceedsGap > 0 ? ` · ${money(proceedsGap)} of the request unallocated` : ` · ${money(-proceedsGap)} over the request`) : ""}</th></tr></tfoot>
                </table>
              </>
            ) : null}
            <Disclosure title="Repayment and earnout timeline" sub="How repayment, commissions and reserves build over the life of the deal.">
              <Step8Projection ctx={ctx} />
            </Disclosure>
          </div>
        ) : <p className="pp-sub">Hidden. Show it to see the page the dealer receives.</p>}
      </PPanel>
      <Disclosure title="If a month comes in light" sub="Shortfall billing, the cure period, the rate adjustment and the approved exclusions." owns={(k) => SHORTFALL_KEYS.has(k)} focusKey={focusKey} count={shortfallOpen} tone={shortfallOpen ? "bad" : undefined}>
        <Step7Shortfall ctx={ctx} />
      </Disclosure>
    </>
  );
}
