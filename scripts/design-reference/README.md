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
| Earnings Plan, the four steps | `src/components/earnings-plan/` (screens), `src/lib/earningsPlan/` (`math` the engine, `edit` every change to the plan, `view` every figure printed, `session` autosave and the revision check, `api` the staff and client-link routes) | `src/lib/__tests__/earningsPlan*.test.ts`, `src/components/earnings-plan/__tests__/`, `tests/earnings-plan.spec.ts` |

The plan screens compute in the browser. `src/lib/earningsPlan/math.ts` is the
TypeScript twin of the backend's `app/services/earnings_plan_math.py`; both are
held to `earningsPlanReference.json`, so the figure on the screen and the figure
the API saves are the same arithmetic. The API is asked to load the plan, keep
the draft, save a version and record a review, never to compute.

The browser specs (`tests/*.spec.ts`) build their own page from the real
components and are run on a developer machine, not in CI: CI runs the unit
tests, the type check, the lint list and the production build.
`tests/earnings-plan.spec.ts` opens the staff workspace on a stand-in API that
lives in the page, and the client link page (`ClientEarningsPlan` with its own
transport) with the API's replies supplied at the network. The link page's API
address there is a name that resolves nowhere, so no running API is called.

The tests use the fictional file the design draws
(`src/lib/__tests__/fixtures/financialsOverviewFixture.ts`), so a figure that
drifts from the design fails a test.

Two readings worth knowing before changing the engines:

- The EBITDA bridge is cumulative in a fixed order (pricing, revenue drivers,
  growth, cost of goods sold, operating expenses, new activities) and adds up
  exactly to the plan figure.
- A section's own total is what the plan loses without that section. Changes
  interact, so section totals do not add up to the bridge.
