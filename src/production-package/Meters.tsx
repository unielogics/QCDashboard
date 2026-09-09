// The four meters above every step. They read the client mirror so a
// keystroke moves them before the save lands; the server's computed is what
// the preview, the verdict and the PDF read.
import { money, pct, signedMoney } from "./format";
import type { Provisional } from "./compute";
import type { ProductionPackage } from "./types";

export function Meters({ pkg, prov, term }: { pkg: ProductionPackage; prov: Provisional; term: number }) {
  const b = pkg.computed.buildout;
  const build = b.build !== false;
  const ds = b.debt_service;
  const carried = build ? prov.repay_m : 0;
  const fundedPct = ds > 0 ? (carried / ds) * 100 : 0;
  const minimum = prov.remittance_req;
  const scale = Math.max(minimum, carried, 1);
  const oop = Math.max(0, ds - carried);
  const position = prov.savings_m - oop;
  const margin = prov.markup_m + prov.mgmt_m;
  const meets = carried >= minimum - 0.5;
  return (
    <div className="pp-meters">
      <div className={`pp-meter${!build ? " mut" : meets ? " ok" : fundedPct >= 100 ? " warn" : " bad"}`}>
        <div className="pp-eyebrow">{build ? "Policies carry the loan payment" : "Dealer pays the loan from operations"}</div>
        <div className="pp-meter-v">{build ? pct(Math.min(999, fundedPct), 0) : "—"}</div>
        <div className="pp-tick-bar" aria-hidden="true">
          <span className="pp-tick-fill" style={{ width: `${Math.min(100, (carried / scale) * 100)}%` }} />
          {ds > 0 ? <span className="pp-tick" style={{ left: `${Math.min(100, (ds / scale) * 100)}%` }}><i>payment</i></span> : null}
          {minimum > 0 ? <span className="pp-tick" style={{ left: `${Math.min(100, (minimum / scale) * 100)}%` }}><i>minimum</i></span> : null}
        </div>
      </div>
      <div className={`pp-meter${oop > 0 ? " bad" : " ok"}`}>
        <div className="pp-eyebrow">Dealer pays out of pocket</div>
        <div className="pp-meter-v">{money(oop)}</div>
        <div className="pp-meter-s">a month, of a {money(ds)} payment</div>
      </div>
      <div className={`pp-meter${position >= 0 ? " ok" : " bad"}`}>
        <div className="pp-eyebrow">Dealer&apos;s position vs today</div>
        <div className="pp-meter-v">{signedMoney(position)}</div>
        <div className="pp-meter-s">a month on today&apos;s volume · {signedMoney(position * term)} over the term</div>
      </div>
      <div className="pp-meter">
        <div className="pp-eyebrow">Your margin</div>
        <div className="pp-meter-v">{money(margin)}</div>
        <div className="pp-meter-s">{money(prov.markup_m)} markup + {money(prov.mgmt_m)} management, a month</div>
      </div>
    </div>
  );
}
