// Step 1 — Dealer today. The lot, the monthly sales, and what the dealer pays
// another provider for the products already attaching to them.
import { money, num } from "../format";
import { PRODUCTS } from "../options";
import { IconCheck } from "../icons";
import { Callout, Derived, Disclosure, Field, PChip, PPanel, Stepper, type StepCtx } from "../ui";
import type { ProductKey } from "../types";

const BASELINE_KEYS = new Set(["cancels", "chargebacks", "base_from", "base_through", "evidence", "seasonality"]);

export function PageToday({ ctx }: { ctx: StepCtx }) {
  const { draft, prov, readOnly, saving, setProduct, computed, focusKey } = ctx;
  const rows = prov.rows;
  const covered = rows.filter((r) => r.on);
  const attention = computed.attention.filter((a) => a.step === "products" && a.key !== "products.vsc.on" && !a.key.endsWith(".base") && !a.key.endsWith(".over") && !a.key.endsWith(".cushion") && !a.key.endsWith(".premium") && !a.key.endsWith(".repay") && a.key !== "remittance_coverage");
  const baselineOpen = computed.attention.filter((a) => BASELINE_KEYS.has(a.key)).length;
  return (
    <>
      <PPanel title="The lot" sub="Counted on the onsite review, not self-reported.">
        <div className="pp-grid">
          <Field ctx={ctx} k="lot_units" label="Vehicles in the lot" />
          <Field ctx={ctx} k="avg_cost" label="Average cost of a car in the lot" />
          <Field ctx={ctx} k="monthly_units" label="Vehicles sold a month" />
          <Derived label="Lot value · months of stock" value={`${money(prov.lot_value)} · ${prov.months_of_inventory ? `${prov.months_of_inventory.toFixed(1)} months of stock` : "—"}`} provisional={saving} />
        </div>
      </PPanel>
      <PPanel title="What the dealer buys today" sub="Today another provider supplies these products. For each one: how often it attaches to a sale, and what the dealer pays that provider per contract — the bundled price, whatever it is made of. Untick anything the dealer does not sell and will not start selling."
        right={<PChip tone={draft.products.vsc.on ? "acc" : "bad"}>{num(prov.cur_contracts)} contracts a month · {money(prov.cur_gross)}</PChip>}>
        <div className="pp-tblwrap">
          <table className="pp-tbl today">
            <thead><tr><th>Product</th><th className="n">Attaches to</th><th className="n">Dealer pays today</th><th className="n">Contracts a month</th><th className="n">Cost a month</th></tr></thead>
            <tbody>
              {PRODUCTS.map((p) => {
                const v = draft.products[p.key];
                const r = rows.find((x) => x.key === p.key)!;
                return (
                  <tr key={p.key} className={v.on ? "" : "off"}>
                    <td>
                      <button type="button" className={`pp-chk${v.on ? " on" : ""}`} onClick={() => setProduct(p.key as ProductKey, "on", !v.on)} disabled={readOnly} aria-pressed={v.on} aria-label={`${v.on ? "Uncover" : "Cover"} ${p.label}`}>{v.on ? <IconCheck /> : null}</button>
                      <span className="pp-prod">{p.label}{p.primary ? <PChip tone="gold">Primary</PChip> : null}</span>
                    </td>
                    <td className="n"><Stepper id={`pp-in-products.${p.key}.cur_rate`} value={v.cur_rate} unit="%" max={100} disabled={readOnly || !v.on} onChange={(n) => setProduct(p.key as ProductKey, "cur_rate", n)} /></td>
                    <td className="n"><Stepper id={`pp-in-products.${p.key}.cur_premium`} value={v.cur_premium} unit="$" step={25} disabled={readOnly || !v.on} onChange={(n) => setProduct(p.key as ProductKey, "cur_premium", n)} width={84} /></td>
                    <td className="n">{v.on ? num(r.cur_contracts) : "—"}</td>
                    <td className="n">{v.on ? money(r.cur_gross) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr><th>Today</th><th className="n muted" colSpan={2}>on {num(prov.units)} vehicles sold a month · {prov.units ? (prov.cur_contracts / prov.units).toFixed(2) : "—"}× per vehicle</th><th className="n">{num(prov.cur_contracts)}</th><th className="n">{money(prov.cur_gross)}</th></tr></tfoot>
          </table>
        </div>
        {covered.length ? (
          <Callout tone="ok">
            The dealer spends <b>{money(prov.cur_gross)} a month</b> with another provider on {num(prov.cur_contracts)} contracts across {covered.length} product{covered.length === 1 ? "" : "s"}. That is the money this arrangement is built out of.
          </Callout>
        ) : <Callout tone="bad">Tick at least the products the dealer sells today.</Callout>}
        {attention.map((a) => <Callout key={a.key} tone="bad"><b>{a.title}.</b> {a.detail}</Callout>)}
      </PPanel>
      <Disclosure title="Verified baseline (Addendum A.1)" sub="The trailing production the thresholds are derived from — what it was verified against, and when." owns={(k) => BASELINE_KEYS.has(k)} focusKey={focusKey} count={baselineOpen} tone={baselineOpen ? "bad" : undefined}>
        <div className="pp-grid">
          <Field ctx={ctx} k="base_from" />
          <Field ctx={ctx} k="base_through" />
          <Derived label="Retail units / month" value={num(prov.units)} provisional={saving} />
          <Field ctx={ctx} k="cancels" />
          <Field ctx={ctx} k="chargebacks" />
          <Field ctx={ctx} k="evidence" span={3} />
          <Field ctx={ctx} k="seasonality" span={3} placeholder="December and January run under the twelve-month average…" />
        </div>
      </Disclosure>
    </>
  );
}
