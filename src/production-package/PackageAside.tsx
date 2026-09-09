// The right rail: what needs attention, where the arrangement stands, what
// the sponsor earns, and the state of both agreements.
import { AttentionList } from "./AttentionList";
import { dateLabel, money, pct, whenLabel } from "./format";
import { IconCheck } from "./icons";
import { PChip } from "./ui";
import type { Provisional } from "./compute";
import type { AttentionItem, ProductionPackage } from "./types";

function Row({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" | "warn" }) {
  return <div className="pp-kv row"><span className="pp-lbl">{label}</span><span className={`pp-val${tone ? ` c-${tone}` : ""}`}>{value}</span></div>;
}

export function PackageAside({ pkg, prov, attention, onJump, term }: {
  pkg: ProductionPackage; prov: Provisional; attention: AttentionItem[]; onJump: (item: AttentionItem) => void; term: number;
}) {
  const b = pkg.computed.buildout;
  const build = b.build !== false;
  const carried = build ? Math.min(prov.repay_m, b.debt_service || Infinity) : 0;
  const two = pkg.stage === 2;
  const dealerSig = pkg.active_revision?.signatures.find((s) => s.party === "dealer" && s.status !== "voided");
  const ts = pkg.term_sheet;
  const stageOne = two ? "Executed" : pkg.status === "draft" ? "Not sent" : pkg.status === "out_for_signature" ? (pkg.execution_pending ? "Signed · bundle pending" : "Out for signature") : pkg.status === "executed" ? "Executed" : "Voided";
  const stageTwo = two
    ? (pkg.status === "draft" ? "Draft" : pkg.status === "out_for_signature" ? "Out for signature" : pkg.status === "executed" ? "Executed" : "Voided")
    : pkg.final_package_id ? (pkg.final_status === "out_for_signature" ? "Out for signature" : pkg.final_status === "executed" ? "Executed" : "Drafted")
    : pkg.status === "executed" ? (ts ? "Ready to draft" : "Needs the term sheet") : "Blocked";
  return (
    <aside className="pp-rail-r">
      {pkg.status === "draft" && attention.length ? (
        <AttentionList items={attention} onJump={onJump} stage={pkg.stage} mode={pkg.mode} />
      ) : pkg.status === "draft" ? (
        <section className="pp-att clear" aria-label="All clear"><header className="pp-att-h"><IconCheck /><b>All clear</b><span className="pp-sub">Every field carries a value. This is what the parties will sign.</span></header></section>
      ) : null}
      <section className="pp-aside-sect" aria-label="Where this stands">
        <div className="pp-eyebrow">Where this stands</div>
        <Row label="Dealer pays today" value={money(prov.cur_gross)} />
        <Row label="With us, same volume" value={money(prov.cost_same)} />
        <Row label="Cushion after your markup" value={money(prov.room_m)} />
        <Row label="Loan payment" value={money(b.debt_service)} />
        <Row label="Carried by the policies" value={money(carried)} tone={carried > 0 ? "ok" : "bad"} />
        <Row label="Agreement minimum" value={money(prov.remittance_req)} />
      </section>
      <section className="pp-aside-sect" aria-label="You earn">
        <div className="pp-eyebrow">You earn</div>
        <Row label="Markup a month" value={money(prov.markup_m)} />
        <Row label="Management a month" value={`${money(prov.mgmt_m)} a month`} />
        <Row label="Over the term" value={money((prov.markup_m + prov.mgmt_m) * term)} />
      </section>
      <section className="pp-aside-sect" aria-label="Agreement">
        <div className="pp-eyebrow">Agreement</div>
        <Row label="Stage one" value={stageOne} />
        <Row label="Stage two" value={stageTwo} />
        <div className="pp-sumstate">
          {pkg.sent_at ? <span className="pp-sub">Sent {whenLabel(pkg.sent_at)}{pkg.sent_by_name ? ` by ${pkg.sent_by_name}` : ""}</span> : null}
          {dealerSig?.signed_at ? <span className="pp-sub">Dealer signed {whenLabel(dealerSig.signed_at)}</span> : null}
          {pkg.executed_at ? <span className="pp-sub">Executed {whenLabel(pkg.executed_at)}</span> : null}
          {two && pkg.original ? <span className="pp-sub">Drafted from the executed commitment (R{pkg.original.revision_no}, {dateLabel(pkg.original.executed_at)}){pkg.comparison ? ` · ${pkg.comparison.changed_count} change${pkg.comparison.changed_count === 1 ? "" : "s"}` : ""}</span> : null}
          {!two && ts ? <><PChip tone="gold">Term sheet v{ts.version}</PChip><span className="pp-sub">{money(ts.approved_amount)} at {pct(ts.rate_pct, 2)} for {ts.term_months} mo</span></> : null}
        </div>
      </section>
    </aside>
  );
}
