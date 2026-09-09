// Step 3 — Build the repayment. Our base cost is lower than what the dealer
// pays today. Decide how the difference is used, product by product.
import { useState } from "react";
import { money, num, pct, signedMoney } from "../format";
import { PRODUCTS } from "../options";
import { IconCheck, IconChevron } from "../icons";
import { Callout, Field, PBtn, PChip, PPanel, Picks, Stepper, type StepCtx } from "../ui";
import type { ProductKey } from "../types";

type Mode = "reverse" | "forward";
const MODES: Array<[Mode, string]> = [["forward", "Dealer pays"], ["reverse", "Build into the policies"]];
const TARGETS: Array<["100" | "125", string]> = [["100", "Cover the payment"], ["125", "Meet the agreement minimum"]];

export function PageBuild({ ctx }: { ctx: StepCtx }) {
  const { draft, prov, computed, readOnly, set, setProduct, notify, mode, focusKey } = ctx;
  const desk = mode === "operator";
  const b = computed.buildout;
  const buildMode: Mode = draft.buildout_mode === "forward" ? "forward" : "reverse";
  const build = buildMode !== "forward";
  const target = Number(draft.fund_target) === 125 ? "125" : "100";
  const pay = b.debt_service;
  const needMonthly = pay * (Number(draft.fund_target) || 100) / 100;
  const rows = prov.rows;
  const on = rows.filter((r) => r.on);
  const known = on.filter((r) => r.stack_known);
  const roomM = known.reduce((a, r) => a + r.room_m, 0);
  const funded = build ? prov.repay_m : 0;
  const short = Math.max(0, needMonthly - roomM);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const attention = computed.attention.filter((a) => a.step === "products" || a.key === "buildout");

  // The band: of what the dealer would pay today for these contracts — the
  // stack, our markup, the loan, and what goes back to the dealer.
  const todayM = on.reduce((a, r) => a + r.contracts * r.cur_premium, 0);
  const stackM = on.reduce((a, r) => a + r.stack_m, 0);
  const markupM = on.reduce((a, r) => a + r.markup_m, 0);
  const loanM = build ? on.reduce((a, r) => a + r.contracts * r.repay, 0) : 0;
  const overM = on.reduce((a, r) => a + r.contracts * Math.max(0, (build ? r.premium : r.premium - r.repay) - r.cur_premium), 0);
  const saveM = Math.max(0, todayM - stackM - markupM - loanM);
  const bandTotal = Math.max(1, stackM + markupM + loanM + saveM + overM);
  const band = [
    ["Base product, admin and other fees", stackM, "var(--faint)"],
    ["Your markup", markupM, "var(--accent)"],
    ["Carries the loan", loanM, "var(--petrol)"],
    ["Dealer saves", saveM, "var(--ok)"],
    ...(overM > 0 ? [["Above today's price", overM, "var(--danger)"] as const] : []),
  ] as const;

  const applySolve = () => {
    b.solve_rows.forEach((r) => { setProduct(r.key, "repay", r.solve_repay); setProduct(r.key, "premium", r.needed); });
    if (buildMode !== "reverse") set("buildout_mode", "reverse");
    notify(`The payment is carried out of the room on every covered product — ${money(needMonthly)} a month.`, "acc");
  };
  const resetBuild = () => {
    on.forEach((r) => { setProduct(r.key, "repay", 0); setProduct(r.key, "premium", r.stack + r.markup); });
    notify("Started over from today: nothing carried to the loan.", "mut");
  };
  const writeStack = (key: ProductKey, field: "base" | "admin" | "other" | "markup" | "repay", value: number | "") => {
    const v = draft.products[key];
    const n = (f: string) => Number(f === field ? value : v[f as keyof typeof v]) || 0;
    setProduct(key, field, value);
    // premium is the field of record; the stack writes it so the two never disagree.
    setProduct(key, "premium", n("base") + n("admin") + n("other") + n("markup") + n("repay"));
  };

  return (
    <>
      <div className="pp-cols three">
        <div className="pp-tile"><b className="pp-tile-k">{money(prov.cur_gross)}</b>is what the dealer pays another provider today, a month, for the products they already sell.</div>
        <div className="pp-tile"><b className="pp-tile-k">{money(known.reduce((a, r) => a + r.cushion_m, 0))}</b>is the cushion: what they pay today less our base cost, admin and other fees, across {known.length} product{known.length === 1 ? "" : "s"} with a base cost entered.</div>
        <div className="pp-tile"><b className="pp-tile-k">{money(pay)}</b>a month is the loan payment. The cushion can carry it, take it as your margin, or go back to the dealer as savings. You decide the split.</div>
      </div>
      <PPanel title="Where the dealer's dollars go" sub="Of what the dealer would pay today for these contracts, at the programme's attachment."
        right={<PChip tone={!build ? "mut" : funded >= prov.remittance_req - 0.5 ? "ok" : funded > 0 ? "warn" : "bad"}>{!build ? `Dealer pays the loan · ${signedMoney(prov.savings_m)} a month on products` : funded >= prov.remittance_req - 0.5 ? "Loan carried, agreement minimum met" : funded >= pay - 0.5 ? `Payment carried · ${money(prov.remittance_req - funded)} short of the minimum` : funded > 0 ? `${money(pay - funded)} a month still out of pocket` : "Nothing built yet"}</PChip>}>
        <div className="pp-band" role="img" aria-label="Where the dealer's dollars go">
          {band.map(([label, value, color]) => value > 0 ? <span key={label} style={{ width: `${(value / bandTotal) * 100}%`, background: color }} title={`${label}: ${money(value)}`} /> : null)}
        </div>
        <div className="pp-legend">{band.map(([label, value, color]) => <span key={label}><i style={{ background: color }} />{label} <b>{money(value)}</b></span>)}</div>
        <p className="pp-sub" style={{ marginTop: 8 }}>
          Of the {money(todayM)} the dealer would pay today for these {num(prov.contracts)} contracts: {money(stackM)} is the base product and fees, {money(markupM)} is your markup, {money(loanM)} carries the loan, {money(saveM)} goes back to the dealer{overM > 0 ? `, and ${money(overM)} is above today's price.` : "."}
        </p>
      </PPanel>
      <PPanel title="The loan payment" sub={build ? "The repayment becomes a line in each product's fee stack, paid from the cushion." : `The dealer keeps the whole cushion as savings, and pays ${money(pay)} a month from operations.`}>
        <div className="pp-cols">
          <div>
            <div className="pp-eyebrow">Who carries the payment?</div>
            <div className="pp-row" style={{ marginTop: 6 }}><Picks options={MODES} value={buildMode} onChange={(k) => set("buildout_mode", k)} disabled={readOnly} /></div>
          </div>
          <div>
            <div className="pp-eyebrow">How much should the policies carry?</div>
            <div className="pp-row" style={{ marginTop: 6 }}><Picks options={TARGETS} value={target} onChange={(k) => set("fund_target", Number(k))} disabled={readOnly || !build} /></div>
            <div className="pp-hint">{target === "125" ? `What the agreement requires when the loan is built in: ${money(prov.remittance_req)} a month.` : `Just the payment, ${money(pay)}. The agreement still requires 125%.`}</div>
          </div>
        </div>
        <div className="pp-row" style={{ marginTop: 12 }}>
          <PBtn variant="pri" onClick={applySolve} disabled={readOnly || !on.length || !pay}>Build it — carry {money(needMonthly)} a month</PBtn>
          <PBtn onClick={resetBuild} disabled={readOnly || !on.length}>Start over from today</PBtn>
        </div>
        {!on.length ? <Callout tone="bad">Tick at least one covered product first.</Callout>
          : !known.length ? <Callout tone="warn">No covered product has a base cost yet. The desk enters our cost in each product's fee stack; until then there is no cushion to carry the loan from.</Callout>
          : short <= 0 ? <Callout tone="ok">The cushion covers it. After your markup there is {money(roomM)} a month of room across the covered products; the loan needs {money(needMonthly)}. Build it and the dealer pays no more than today on any product, and still saves {money(roomM - needMonthly)} a month.</Callout>
          : <Callout tone="bad">The cushion after your markup is {money(roomM)} a month — {money(short)} short of the {money(needMonthly)} the loan needs. Building it in anyway puts the dealer about {money(prov.contracts ? short / prov.contracts : 0)} a contract above today. To close the gap: lower your markup in the fee stacks, lift attachment on products the dealer already sells, or accept the increase and show it plainly in the proposal.</Callout>}
      </PPanel>
      <PPanel title="Product by product" sub="Open a product to see and edit its fee stack.">
        <div className="pp-tblwrap">
          <table className="pp-tbl build">
            <thead><tr><th /><th>Product</th><th className="n">Attaches to</th><th className="n">Dealer pays today</th><th className="n">With us</th><th className="n">Carries to the loan</th></tr></thead>
            <tbody>
              {PRODUCTS.map((p) => {
                const v = draft.products[p.key];
                const r = rows.find((x) => x.key === p.key)!;
                const isOpen = Boolean(open[p.key]) || Boolean(focusKey && focusKey.startsWith(`products.${p.key}.`));
                const over = r.stack_known ? Math.max(0, r.premium - r.cur_premium) : 0;
                const flags = [
                  r.on && r.stack_known && r.cushion < 0 ? `Base stack ${money(r.stack)} is above today's ${money(r.cur_premium)}` : null,
                  r.on && over > 0 ? `Dealer pays ${money(over)} more than today` : null,
                  r.on && r.rate > 85 ? "Above 85% is not credible" : null,
                  r.on && !r.stack_known ? "No base cost yet" : null,
                ].filter(Boolean);
                return (
                  <>
                    <tr key={p.key} className={v.on ? "" : "off"}>
                      <td><button type="button" className={`pp-chk${v.on ? " on" : ""}`} onClick={() => setProduct(p.key as ProductKey, "on", !v.on)} disabled={readOnly} aria-pressed={v.on} aria-label={`${v.on ? "Uncover" : "Cover"} ${p.label}`}>{v.on ? <IconCheck /> : null}</button></td>
                      <td>
                        <button type="button" className={`pp-pname${isOpen ? " open" : ""}`} onClick={() => setOpen((o) => ({ ...o, [p.key]: !isOpen }))} aria-expanded={isOpen}><IconChevron />{p.label}{p.primary ? <PChip tone="gold">Primary</PChip> : null}</button>
                        {flags.length ? <div className="pp-hint bad">{flags.join(" · ")}</div> : null}
                      </td>
                      <td className="n">
                        <Stepper id={`pp-in-products.${p.key}.rate`} value={v.rate} unit="%" max={100} disabled={readOnly || !v.on} onChange={(n) => setProduct(p.key as ProductKey, "rate", n)} />
                        {v.on ? <div className="pp-hint">today {pct(r.cur_rate, 0)} · {num(r.cur_contracts)} contracts</div> : null}
                      </td>
                      <td className="n">{v.on ? money(r.cur_premium) : "—"}</td>
                      <td className="n">
                        {v.on ? <><b>{money(r.premium)}</b>{r.stack_known ? <div className={`pp-hint ${r.savings >= 0 ? "ok" : "bad"}`}>{r.savings >= 0 ? `saves ${money(r.savings)}` : `${money(-r.savings)} more`}</div> : <div className="pp-hint">no base cost</div>}</> : "—"}
                      </td>
                      <td className="n"><Stepper id={`pp-in-products.${p.key}.repay`} value={v.repay} unit="$" step={5} disabled={readOnly || !v.on} onChange={(n) => writeStack(p.key as ProductKey, "repay", n)} /></td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${p.key}-stack`} className="pp-stack-row">
                        <td />
                        <td colSpan={5}>
                          <div className="pp-stack">
                            <div className="pp-eyebrow">Fee stack · per contract</div>
                            <div className="pp-stack-grid">
                              {(["base", "admin", "other", "markup"] as const).map((f) => (
                                <label key={f} className={`pp-field${desk ? "" : " locked"}`} id={`pp-field-products.${p.key}.${f}`}>
                                  <span className="pp-lbl">{f === "base" ? "Base product cost" : f === "admin" ? "Admin fee" : f === "other" ? "Other fees" : "Your markup"}{!desk ? <PChip tone="gold">Set by the desk</PChip> : null}</span>
                                  <Stepper id={`pp-in-products.${p.key}.${f}`} value={v[f]} unit="$" step={f === "markup" ? 10 : 5} disabled={readOnly || !v.on || !desk} onChange={(n) => writeStack(p.key as ProductKey, f, n)} width={84} />
                                </label>
                              ))}
                              <div className="pp-kv"><span className="pp-lbl">Carries to the loan</span><span className="pp-val">{money(r.repay)}</span></div>
                              <div className="pp-kv"><span className="pp-lbl">With us</span><span className="pp-val"><b>{money(r.premium)}</b>{r.stack_known ? <span className={r.savings >= 0 ? "c-ok" : "c-bad"}> · {r.savings >= 0 ? `saves ${money(r.savings)}` : `${money(-r.savings)} more`}</span> : null}</span></div>
                            </div>
                            {r.stack_known ? <div className="pp-hint">Cushion {money(r.cushion)} · room after your markup {money(r.room)} · {num(r.contracts)} contracts a month → {money(r.room_m)} of room a month</div> : <div className="pp-hint">Enter our base cost to see the cushion.</div>}
                            {desk ? (
                              <details className="pp-disc slim"><summary className="pp-disc-h"><span className="pp-disc-t">Schedule B detail</span><span className="pp-sub">Commission, retention and term — printed on the agreement, not part of the dealer's price.</span><span className="pp-disc-x" aria-hidden="true" /></summary>
                                <div className="pp-disc-b"><div className="pp-stack-grid">
                                  <label className="pp-field"><span className="pp-lbl">Commission (%)</span><Stepper value={v.comm} unit="%" max={100} disabled={readOnly} onChange={(n) => setProduct(p.key as ProductKey, "comm", n)} /></label>
                                  <label className="pp-field"><span className="pp-lbl">Retention (%)</span><Stepper value={v.retention} unit="%" max={100} disabled={readOnly} onChange={(n) => setProduct(p.key as ProductKey, "retention", n)} /></label>
                                  <label className="pp-field"><span className="pp-lbl">Term (months)</span><Stepper value={v.term} step={6} max={84} disabled={readOnly} onChange={(n) => setProduct(p.key as ProductKey, "term", n)} /></label>
                                </div></div>
                              </details>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
            <tfoot><tr><th /><th>With the programme</th><th className="n muted">{num(prov.contracts)} contracts a month</th><th className="n">{money(prov.cur_gross)}</th><th className="n">{money(prov.gross)}</th><th className="n">{money(funded)}</th></tr></tfoot>
          </table>
        </div>
        {attention.filter((a) => a.key !== "remittance_coverage").map((a) => <Callout key={a.key} tone={a.owner === "desk" && !desk ? "warn" : "bad"}><b>{a.title}.</b> {a.detail}</Callout>)}
        <div style={{ marginTop: 10 }}><Field ctx={ctx} k="fund_target" /></div>
      </PPanel>
    </>
  );
}
