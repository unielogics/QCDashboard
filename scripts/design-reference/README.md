# Design reference: File page and Earnings Plan

The two Claude Design pages the Financials tab and the Operating Expenses and
Earnings Plan are built to, exported 2026-11-13.

| File | What it is |
|---|---|
| `file.design.html`, `file.logic.js` | The file page: Financials and Underwriting tabs |
| `earnings-plan-v2.design.html`, `earnings-plan-v2.logic.js` | The four-step earnings plan and its arithmetic |
| `design-system.css` | The tokens and component classes both pages use |
| `generate.mjs` | Runs the plan's arithmetic and writes the reference numbers |

The logic files are the exported scripts, unedited. `generate.mjs` evaluates
the earnings plan logic and writes
`src/lib/__tests__/fixtures/earningsPlanReference.json`. The backend keeps a
copy at `app/tests/fixtures/earnings_plan_reference.json`. Both the Python and
the TypeScript plan engines must reproduce those numbers.

```bash
node scripts/design-reference/generate.mjs
```

## Where each design is built

| Design | Code | Checks |
|---|---|---|
| File page, Financials tab | `src/components/file/financials/` (cards), `src/lib/financialsOverview.ts` (every figure) | `src/lib/__tests__/financialsOverview.test.ts`, `tests/financials-overview.spec.ts` |
| File page, Underwriting tab | `src/components/file/UnderwritingFlow.tsx` (the four steps; the coverage sentence comes from the Financials tab) | |

The tests use the fictional file the design draws
(`src/lib/__tests__/fixtures/financialsOverviewFixture.ts`), so a figure that
drifts from the design fails a test.

Two readings worth knowing before changing the engines:

- The EBITDA bridge is cumulative in a fixed order (pricing, revenue drivers,
  growth, cost of goods sold, operating expenses, new activities) and adds up
  exactly to the plan figure.
- A section's own total is what the plan loses without that section. Changes
  interact, so section totals do not add up to the bridge.
