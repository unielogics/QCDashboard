# qcdesktop

Operator desktop console for AE / UW / Admin (and a Borrower-view for support).

## Local dev
```bash
pnpm install
cp .env.local.example .env.local         # add Clerk keys when ready
pnpm dev
```
Visit http://localhost:3000

The backend (qcbackend) must be running at `NEXT_PUBLIC_API_URL` (default http://localhost:8000) for data to render. Without Clerk keys, the backend uses dev-mode auth and treats every request as a seeded super_admin.

## Structure
- `src/app/` — Next.js 14 App Router pages
- `src/components/design-system/` — ported from `.design/.../primitives*.jsx`
- `src/components/shell/` — Sidebar, TopBar, AIRail, GlobalSearch
- `src/components/loan/` — Loan Detail tabs
- `src/components/intake/` — SmartIntake modal
- `src/components/deal-control-room/` — 3-column DCR overlay
- `src/lib/` — api.ts, ws.ts, enums.generated.ts (autogen from backend)
- `src/store/` — zustand for theme/density/role/aiOpen
