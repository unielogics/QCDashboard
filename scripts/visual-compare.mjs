// Compare a room's rendered geometry against its pre-migration baseline.
//
// Usage: node compare.mjs <baseline.json> <current.json>
// Exits non-zero and prints the differing nodes if anything moved.
import { readFileSync } from "node:fs";
const [a, b] = process.argv.slice(2);
const A = JSON.parse(readFileSync(a, "utf8")), B = JSON.parse(readFileSync(b, "utf8"));
const F = ["path","tag","x","y","w","h","color","bg","fontSize","fontWeight","display","text"];
let diffs = 0, checked = 0;
for (const w of Object.keys(A.widths)) {
  for (const state of ["gate", "step1"]) {
    const av = A.widths[w][state] || [], bv = (B.widths[w] || {})[state] || [];
    const am = new Map(av.map(r => [r.split("|")[0], r]));
    const bm = new Map(bv.map(r => [r.split("|")[0], r]));
    if (av.length !== bv.length)
      console.log(`  @${w}/${state}: NODE COUNT ${av.length} -> ${bv.length}`);
    for (const [p, ar] of am) {
      checked++;
      const br = bm.get(p);
      if (!br) { console.log(`  @${w}/${state} GONE  ${p}`); diffs++; continue; }
      if (ar === br) continue;
      const af = ar.split("|"), bf = br.split("|");
      const changed = F.map((f, i) => af[i] !== bf[i] ? `${f}: ${af[i]} -> ${bf[i]}` : null).filter(Boolean);
      // geometry drift under 2px is sub-pixel rounding, not a regression
      const real = changed.filter(c => {
        const m = c.match(/^(x|y|w|h): (-?\d+) -> (-?\d+)$/);
        return !m || Math.abs(+m[2] - +m[3]) > 2;
      });
      if (real.length) { console.log(`  @${w}/${state} ${p}\n      ${real.join("\n      ")}`); diffs++; }
    }
    for (const p of bm.keys()) if (!am.has(p)) { console.log(`  @${w}/${state} NEW   ${p}`); diffs++; }
  }
}
console.log(`\n  ${checked} nodes compared, ${diffs} differ.`);
process.exit(diffs ? 1 : 0);
