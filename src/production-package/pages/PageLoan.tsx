// Step 2 — The loan. What the dealer will owe, and the cushion the agreement
// puts on top of it when the loan is carried by the policies. Stage one is
// indicative: the desk keeps a working rate and term so the spread can be
// tested, and the dealer's paper says the terms are set at closing.
import { errorMessage, money, num, pct } from "../format";
import { SIZING_MODES } from "../options";
import { useState } from "react";
import type { PackageClient } from "../client";
import type { ProductionPackage } from "../types";
import { Callout, Derived, Disclosure, Field, KV, LockedChip, PBtn, PChip, PPanel, Picks, type StepCtx } from "../ui";

// The desk's financial plan on the file, as the cockpit computed it:
// original, modification, impact. Prefilled, never typed; the button re-reads it.
const PLAN_KEYS = [
  "plan_dscr_before", "plan_dscr_after", "plan_dscr_basis", "plan_income_before", "plan_income_after", "plan_debt_service_before",
  "plan_debt_service_after", "plan_net_cash_before", "plan_net_cash_after", "plan_ending_before", "plan_ending_after", "plan_loan",
  "plan_modifications", "plan_note", "plan_as_of",
];
const present = (v: unknown) => v !== "" && v != null && !(typeof v === "number" && Number.isNaN(v));
const asX = (v: unknown) => (present(v) ? `${Number(v).toFixed(2)}x` : "—");
const asMoney = (v: unknown) => (present(v) ? money(Number(v)) : "—");
const delta = (before: unknown, after: unknown, render: (n: number) => string) => {
  if (!present(before) || !present(after)) return "";
  const change = Math.round((Number(after) - Number(before)) * 100) / 100;
  return ` (${change > 0 ? "+" : change < 0 ? "−" : ""}${render(Math.abs(change))})`;
};

function PlanPanel({ ctx, client, onPackage }: { ctx: StepCtx; client?: PackageClient; onPackage?: (p: ProductionPackage) => void }) {
  const { draft, mode, readOnly } = ctx;
  const uw = mode === "operator";
  const [busy, setBusy] = useState(false);
  const lines = String(draft.plan_modifications ?? "").split("\n").map((s) => s.trim()).filter(Boolean);
  const has = lines.length > 0 || present(draft.plan_dscr_after);
  const refresh = async () => {
    if (!client?.prefill) return;
    setBusy(true);
    try {
      const out = await client.prefill({ fields: PLAN_KEYS, force: true, apply: true });
      if (onPackage) onPackage(await client.load());
      ctx.notify(out.applied.length ? "The plan's figures were re-read from the file." : "The file carries no plan right now; nothing to bring over.", out.applied.length ? "ok" : "mut");
    } catch (err) {
      ctx.notify(errorMessage(err, "The plan could not be re-read from the file."), "bad");
    } finally { setBusy(false); }
  };
  const rows: Array<[string, unknown, unknown, (n: number) => string, (v: unknown) => string]> = [
    [`Debt service coverage${present(draft.plan_dscr_basis) ? ` · ${String(draft.plan_dscr_basis)}` : ""}`, draft.plan_dscr_before, draft.plan_dscr_after, (n) => `${n.toFixed(2)}x`, asX],
    ["Income available for debt service, a year", draft.plan_income_before, draft.plan_income_after, money, asMoney],
    ["Debt service, a month", draft.plan_debt_service_before, draft.plan_debt_service_after, money, asMoney],
    ["Net cash flow, a month", draft.plan_net_cash_before, draft.plan_net_cash_after, money, asMoney],
    ["Ending balance, last month", draft.plan_ending_before, draft.plan_ending_after, money, asMoney],
  ];
  return (
    <PPanel
      title="The business after the plan"
      sub={has ? "Underwriting's plan on the file: what changes at funding and what it does to the figures. Original is the file as read; the plan is an assumption until funding, and it prints on the presentation as such." : "No plan on the file yet. The desk builds it on the file's Financials tab (payoffs, add-backs, overrides, the new loan); once saved there it prints here and on the presentation."}
      right={uw && client?.prefill && !readOnly ? <PBtn size="sm" onClick={() => void refresh()} busy={busy} disabled={busy}>Refresh from the file</PBtn> : <PChip tone="mut">Set by underwriting</PChip>}
    >
      {has ? (
        <>
          <div className="pp-grid">
            {rows.filter(([, before, after]) => present(before) || present(after)).map(([label, before, after, render, show]) => (
              <KV key={label} label={label} value={<>{show(before)} → <b>{show(after)}</b><span className="pp-sub">{delta(before, after, render)}</span></>} />
            ))}
          </div>
          {lines.length ? (
            <div className="pp-field" style={{ marginTop: 10 }}>
              <span className="pp-lbl">What changes</span>
              <ul className="pp-sub" style={{ margin: "4px 0 0", paddingLeft: 18 }}>{lines.map((line, i) => <li key={i}>{line}</li>)}</ul>
            </div>
          ) : null}
          {present(draft.plan_loan) ? <p className="pp-sub" style={{ marginTop: 8 }}><b>New loan in the plan.</b> {String(draft.plan_loan)}.</p> : null}
          {present(draft.plan_note) ? <p className="pp-sub">{String(draft.plan_note)}</p> : null}
          {present(draft.plan_as_of) ? <p className="pp-sub">Figures as read from the file on {String(draft.plan_as_of)}.</p> : null}
        </>
      ) : null}
    </PPanel>
  );
}

const LOAN_KEYS = ["requested", "term", "dealer_cof", "exclusivity", "min_activation"] as const;
const COST_KEYS = new Set(["bank_cof", "orig_cost", "prof_fees", "mgmt_fee", "loss_prov", "debt_service", "sizing", "facility_type", "written_approval_date", "outside_funding_date"]);

export function PageLoan({ ctx, client, onPackage }: { ctx: StepCtx; client?: PackageClient; onPackage?: (p: ProductionPackage) => void }) {
  const { draft, prov, computed, saving, readOnly, set, pkg, mode, focusKey } = ctx;
  const uw = mode === "operator";
  const two = pkg.stage === 2;
  const adv = computed.advance;
  const term = Number(draft.term) || 0;
  const pay = computed.buildout.debt_service;
  const minimum = prov.remittance_req;
  const clears = prov.clears;
  const sizing = draft.sizing === "fixed" ? "fixed" : "backsolve";
  const costOpen = computed.attention.filter((a) => COST_KEYS.has(a.key)).length;
  // The window follows the size of the request; the desk may shorten it, never lengthen it.
  const tier = adv.exclusivity_tier ?? (Number(draft.requested) > 350_000 ? 60 : 30);
  const governs = adv.exclusivity_days ?? tier;
  const [adjustWindow, setAdjustWindow] = useState(Boolean(draft.exclusivity) && Number(draft.exclusivity) !== tier);
  return (
    <>
      <PPanel title="The loan" sub={two ? "The approved amount, rate and term from the term sheet." : "What the dealer is asking for. The rate, the term and the supporting program are underwriting's working assumptions until the term sheet — the commitment prints the requested amount, to be determined at closing."}
        right={<PChip tone={uw ? "acc" : "mut"}>{uw ? "Editable — underwriting view" : "Set by Qualified Commercial underwriting"}</PChip>}>
        {uw ? (
          <div className="pp-grid">
            <Field ctx={ctx} k="requested" label={two ? "Approved amount" : "Amount"} />
            <Field ctx={ctx} k="term" label="Term (months)" />
            <Field ctx={ctx} k="dealer_cof" label={two ? "Rate" : "Dealer rate (%)"} />
            <div className="pp-field" id="pp-field-exclusivity">
              <span className="pp-lbl">Exclusivity window (days){Number(draft.exclusivity) > tier ? <PChip tone="bad">above the tier</PChip> : null}</span>
              {adjustWindow ? (
                <Field ctx={ctx} k="exclusivity" label="" />
              ) : (
                <div className="pp-static">{governs} days<span className="pp-sub"> · {tier === 60 ? "over $350,000: sixty days" : "at or under $350,000: thirty days"}</span></div>
              )}
              <div className="pp-row"><PBtn size="sm" variant="link" onClick={() => { if (adjustWindow) set("exclusivity", ""); setAdjustWindow((v) => !v); }} disabled={readOnly}>{adjustWindow ? "Use the tier" : "Shorten it"}</PBtn><span className="pp-hint">Never longer than the tier for the request; the agreement prints {governs}.</span></div>
            </div>
            <Field ctx={ctx} k="min_activation" label="Minimum activation amount" />
            <Field ctx={ctx} k="debt_service" label="Monthly payment" />
          </div>
        ) : (
          <div className="pp-grid">
            <KV label="Amount" value={money(Number(draft.requested) || 0)} />
            <KV label="Term" value={term ? `${num(term)} months` : "To be determined"} />
            <KV label="Dealer rate" value={draft.dealer_cof ? pct(Number(draft.dealer_cof)) : "To be determined"} />
            <KV label="Exclusivity window" value={`${num(governs)} days`} />
            <KV label="Minimum activation amount" value={money(Number(draft.min_activation) || 0)} />
            <KV label="Monthly payment" value={money(pay)} />
          </div>
        )}
        {!uw ? <p className="pp-sub" style={{ marginTop: 10 }}>Set by Qualified Commercial underwriting. If the dealer needs different terms, ask underwriting — everything below updates on its own.</p> : null}
        {!LOAN_KEYS.every((k) => draft[k] !== "" && draft[k] !== undefined) && uw ? <Callout tone="warn">The loan is not sized yet. Nothing can be built until it is.</Callout> : null}
      </PPanel>
      <PlanPanel ctx={ctx} client={client} onPackage={onPackage} />
      <div className="pp-cols three">
        <div className="pp-tile"><b className="pp-tile-k">{money(pay)}</b>the dealer owes every month for {num(term)} months{two ? "" : " at underwriting's working rate and term — the terms are set in the term sheet at closing"}.</div>
        <div className="pp-tile"><b className="pp-tile-k">{money(minimum)}</b>is what the agreement requires the policies to remit when the loan is built in — the payment plus a 25% cushion.</div>
        <div className="pp-tile"><b className="pp-tile-k">{money(pay * term)}</b>over the life of the loan, if the dealer paid it from operations.</div>
      </div>
      {uw ? (
        <PPanel title="What the programme costs to run" sub="Underwriting only. We lend against a bank line, so the capital is close to free; the cost of this programme is the consulting, underwriting and professional work behind it."
          right={<PChip tone={clears ? "ok" : "bad"}>{clears ? "Clears underwriting" : "Does not clear"}</PChip>} tone={clears ? undefined : "bad"}>
          <div className="pp-grid">
            <Field ctx={ctx} k="bank_cof" label="Bank cost of funds (%)" />
            <Field ctx={ctx} k="orig_cost" label="Origination and underwriting" />
            <Field ctx={ctx} k="prof_fees" label="Consulting and professional fees" />
            <Field ctx={ctx} k="mgmt_fee" label="Programme management (monthly)" />
            <Field ctx={ctx} k="loss_prov" label="Loss provision (% of advance)" />
            <Field ctx={ctx} k="facility_type" />
          </div>
          <div className="pp-row" style={{ marginTop: 12 }}>
            <Picks options={SIZING_MODES} value={sizing} onChange={(k) => set("sizing", k)} disabled={readOnly || two} />
            {two ? <LockedChip>Fixed to the funded amount by the term sheet</LockedChip> : null}
            <Derived label={sizing === "backsolve" ? "Advance the repayment supports" : "Advance"} value={money(prov.advance)} provisional={saving} />
          </div>
          <div className="pp-kvlist" style={{ marginTop: 12 }}>
            <div className="pp-kv row"><span className="pp-lbl">All-in programme cost</span><span className="pp-val">{money(prov.total_cost)} · {pct(prov.cost_rate)} a year</span></div>
            <div className="pp-kv row"><span className="pp-lbl">Return at the dealer rate</span><span className="pp-val">{pct(prov.implied_rate)}</span></div>
            <div className="pp-kv row"><span className="pp-lbl"><b>Spread over programme cost</b></span><span className={`pp-val ${clears ? "c-ok" : "c-bad"}`}>{prov.spread >= 0 ? "+" : ""}{pct(prov.spread)}</span></div>
          </div>
          <table className="pp-tbl" style={{ marginTop: 10 }}>
            <thead><tr><th>Cost line</th><th className="n">Amount</th><th>When</th><th className="n">Share</th></tr></thead>
            <tbody>{adv.cost_lines.map((l) => <tr key={l.key}><td>{l.label}</td><td className="n">{money(l.amount)}</td><td className="muted">{l.when}</td><td className="n">{l.share_pct === null ? "—" : pct(l.share_pct)}</td></tr>)}</tbody>
          </table>
          {!clears ? <Callout tone="bad">Return of {pct(prov.implied_rate)} against an all-in programme cost of {pct(prov.cost_rate)}. Underwriting will not clear it: raise the repayment carried per contract, lift attachment, lengthen the term, or take cost out of the build.</Callout> : null}
        </PPanel>
      ) : null}
      {uw && !two ? (
        <Disclosure title="Commitment header dates" sub="Optional. Both print in the header of the commitment; the agreement expires if unfunded by the outside funding date." owns={(k) => k === "written_approval_date" || k === "outside_funding_date"} focusKey={focusKey} count={costOpen && 0}>
          <div className="pp-grid">
            <Field ctx={ctx} k="written_approval_date" />
            <Field ctx={ctx} k="outside_funding_date" />
          </div>
        </Disclosure>
      ) : null}
    </>
  );
}
