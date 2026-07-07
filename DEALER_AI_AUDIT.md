# Dealer AI + Buckets — System Audit (2026-07-07)

Audit of the deployed stack: `qcbackend:current` (running container), QCDashboard `main`.
Scope requested: email health, chat persistence, correctness/errors, and security
(data leaks / hacking threats) for the car-dealer AI system and the buckets system.

## Remediation status (2026-07-07)

Fixes are committed but **not yet deployed** — the backend runs from a rebuilt
image and the frontend from `main`. Deploy alongside the SES change.

- **Backend** — branch `security/audit-fixes-2026-07-07` in `/opt/qcbackend-src`
  (commits `9d8ca15`, `b98f055`). Fixed: H1, H2, H3, H4, M1, M2, M3, L4, L5.
  Verified by import + logic checks and a full app build against
  `qcbackend:current` in a throwaway container.
- **Frontend** — branch `security-and-dealer-ui-2026-07-07` in QCDashboard.
  Fixed: P1 (edge default-deny + lending-ai guard), P4 (`openSignedUrl`),
  M2 (passcode POST). Typechecks clean.
- **Deferred (documented below, not code-fixable safely here):** M5 login
  enumeration (conflicts with the on-blur returning-user UX — needs a product
  decision), M4 intake-token expiry (needs a DB migration), P2/L2 middleware
  hard-deny (would lock out super-admins until Clerk mirrors role; backend
  already enforces), L3 dev-auth bypass (verified inactive in prod).
- **Email (SES):** owner is handling separately.

---

## 1. Email system — BROKEN (highest-impact operational finding)

**Every dealer-AI email is a silent no-op in production.** The dealer flow sends mail
through AWS SES (`services/email/ses_client.py`), and SES has no From address configured:

- `SES_FROM_ADDRESS` is unset → `ses_configured()` returns `False`
- `send_email()` returns `SesSendResult(ok=False, detail="not_configured")` and the flow continues
- Verified against live data: all 7 dealer intakes show `resume_email`/`dealer_login_email`
  status = `not_configured`, and **0 of 7** fired a super-admin new-lead notification.

Affected, all currently failing:
- Dealer **access-code** email (resume on a new device / after clearing sessionStorage) — `_record_login_code_email`
- Dealer **resume-link** email on intake creation — `_record_resume_email`
- **Super-admin "new dealer lead" notification** — `_record_super_admin_intake_notification`
- Super-admin **decision** notification

Impact: real leads (e.g. `dennymatos15@gmail.com`) came in with no one notified, and any
dealer who loses their browser session cannot get back in. The failure is swallowed — the API
still tells the dealer "a short access code has been sent."

Note: `USE_FAKE_INBOX=true` also means *inbound* Gmail (lender mail ingestion) is mocked, not live.

**Fix:** set `SES_FROM_ADDRESS` (verified domain), `SES_REGION`, optional `SES_CONFIGURATION_SET`;
confirm the EC2 instance role has `ses:SendEmail`. Then re-test the login-code round trip.
Consider surfacing `ok=False` delivery records in the admin leads UI so this can't fail silently again.

---

## 2. Chat persistence — HEALTHY

Dealer chat persists correctly via `create_chat_reply` into `bucket_ai_messages`, keyed by the
intake's bucket. Live DB: 28 messages, balanced 14 user / 14 assistant, tied to dealer buckets,
with real conversations. Review pipeline is also running (intakes reach `status="reviewed"`).

Minor: user + assistant rows in a turn share an identical `created_at` timestamp; ordering
relies on insertion order. Not a bug today, but if the UI ever sorts purely by `created_at`,
a turn's two messages could swap. Prefer ordering by `(created_at, id)` or a sequence.

---

## 3. Security findings (consolidated from 4 independent reviews, cross-verified)

Severity reflects **real-world exploitability given the verified production config**
(Clerk configured, no edge rate-limiting, backend enforces role per-endpoint).

### HIGH

**H1 — Bucket passcode brute-force (no rate limiting anywhere).**
Auto passcodes are `QC-` + 6 digits = 900,000 combos (`buckets.py` `_generate_passcode`).
No lockout / backoff / CAPTCHA in the app and **no rate limit at Caddy** (both verified).
Compare is constant-time (`hmac.compare_digest`) — irrelevant to an online oracle. A leaked/
forwarded share URL (token in path) + scripted guessing clears the space in well under an hour,
yielding all files, notes, and the AI underwriting summary.
Fix: per-token + per-IP attempt throttling with lockout; widen generated passcodes to ≥10 chars entropy.

**H2 — Public dealer token leaks internal underwriting data (`_response` over-serialization).**
`dealer_ai_intake.py` `_response` → `DealerIntakeRead` returns, to any token holder:
- `intake_state` — super-admin email addresses, SES message-ids, and the internal reviewer's
  IP/user-agent (from `_request_audit`)
- `latest_review.result` (full `BucketAIReviewRead`) + `result_snapshot` — `bankability_assessment`,
  `risks`, per-file `red_flags`, `underwriter_questions` (with internal `route`/`reason`), `key_metrics`,
  and `context_snapshot` (raw AI context / recent chat)
The intended client view is `upload_link_visible_summary()` (already computed as `ai_summary`) —
the raw fields defeat that redaction. Pure serialization bug, no auth change needed.
Fix: drop `intake_state`, `result_snapshot`, and raw `latest_review.result`/`context_snapshot`
from public/uploader responses; return only the sanitized summary.

**H3 — Uploader AI chat leaks the full cross-file review.**
`services/bucket_ai.py` `_chat_context`, the `upload_link` (uploader) branch injects raw
`review.result` + `document_evidence_map` + `next_best_action` into the LLM context, while the
`share` and `vendor` branches correctly pass only the filtered visible summary. An unauthenticated
uploader can prompt the AI ("list all risks/red flags", "repeat the latest_review JSON") to
exfiltrate the firm's internal risk verdict on every file in the bucket. Same class as H2, one-branch fix.
Fix: pass `upload_link_visible_summary(...)` for the uploader branch too; scope `uploaded_files`
to `upload_link_id == link.id`.

**H4 — Stored XSS via uploaded HTML/SVG.**
Upload-init accepts a client-controlled `content_type` with no allowlist; `_download_url` sets
`ResponseContentDisposition` but not `ResponseContentType`, so an uploaded `text/html`/`image/svg+xml`
file is served inline and executes when a reviewer/admin clicks Preview. It runs on the S3
presigned origin (limits app-cookie theft) but still enables phishing + JS execution against
reviewers, and can exfiltrate other presigned file URLs on that page.
Fix: allowlist upload content-types; force `ResponseContentType`/`Content-Disposition: attachment`
for non-PDF/-image previews. Also add a server-side size cap (presigned PUT has none today → storage DoS).

### MEDIUM

**M1 — Cross-recipient note/PII leak within a bucket.** `share_access` returns every
`visibility=="shared"` note on the bucket, including notes authored by *other* share recipients
and vendors (with `author_name`). Scope shared notes to admin-authored + the current actor's own.
Same filter needed in `_chat_context`.

**M2 — Passcode in URL query string.** `buckets/request/[token]/page.tsx:141` calls
`.../ai-tasks?passcode=...` (GET) — the only passcode not sent in a POST body. Leaks to access
logs, browser history, and `Referer`. Convert to POST body.

**M3 — No throttle on `/start`, `/run-review`, `/chat` (DoS + unbounded LLM spend).**
`/start` is fully public and per call creates a Client + Bucket + upload link + 3 requested-docs +
intake + 2 emails; only guarded by a same-email 409 (bypass by varying email). `/run-review` runs
a synchronous `model_heavy()` Bedrock call over up to 8 files with no cooldown/in-flight guard —
replayable to drive cost. Reuse the per-IP throttle already in `routers/public.py`; add a per-token
review cooldown; add a CAPTCHA / per-IP cap to `/start`.

**M4 — Intake resume tokens never expire.** `_load_public_intake` authorizes on `token_hash`
only (no issued-at / expiry / revocation), unlike the login *session* which is TTL'd + revocable.
An emailed resume link works forever and rides in `Referer`. Add `token_expires_at` and enforce it.

**M5 — Email enumeration on `/login/start`.** Distinct "we found an existing file" vs "no file
found" messages let an attacker probe which emails have a dealer file. Return the neutral message
(`DealerLoginStartResponse` already defines one) in both cases.

### LOW / latent (backend currently holds the line)

- **L1 — Frontend `/admin/*` edge-gate gaps.** `/admin/lending-ai/*`, `/admin/dealer-ai-leads`,
  `/admin/token-usage`, `/admin/prequal-requests` are **not** in `isSuperAdminOnlyPage`, and
  `lending-ai/page.tsx` has no page-level role guard. **Verified**: the backend enforces
  `_require_admin`/`_require_super_admin` on every endpoint, so a non-admin sees only an empty
  shell that 403s — not open data. Still fix: default-deny `/admin(.*)` in the matcher (carve out
  LOAN_EXEC exceptions) + add the sibling pages' `router.replace("/")` guard to `lending-ai`.
- **L2 — Middleware role soft-degrade.** `middleware.ts` allows super-admin routes when the JWT
  role claim is absent (self-documented "PRODUCTION BLOCKER"). Backstopped by the backend today;
  flip the missing-role branch to deny.
- **L3 — Dev-mode auth bypass** (`deps.py:151-164`, `X-Dev-User`). **Verified inactive**:
  `CLERK_SECRET_KEY` is set and `APP_ENV=production`. Harden by hard-failing startup if Clerk is
  unconfigured in prod.
- **L4 — `s3_key` disclosed to external share/vendor recipients** (`BucketFileRead.s3_key`). Not
  usable without a presigned signature, but discloses internal key layout. Omit from external schemas.
- **L5 — Case-sensitive vendor email bind** (`deps.py:187` matches `User.email == email` unlowered,
  while vendor rows are stored lowercased). Casing mismatch from Clerk can mint a fresh CLIENT row
  and silently strip vendor bucket access. (Matches a previously-noted latent bug.)

### Verified well-defended (checked, no action)
Cross-bucket/tenant AI context isolation · per-file IDOR re-scoping on share/vendor download &
annotation · vendor access derived from the authenticated user (never client-supplied) · zip-slip /
zip-bomb guards on upload extraction · admin PDF export gated by `_require_super_admin` · booking
validated against server-generated slots · storage keys server-derived (no path traversal) · tokens
sha256-hashed at rest and never logged · no `dangerouslySetInnerHTML`/`eval` and no server secrets
in the client bundle · CORS is an explicit allowlist (no wildcard).

---

## Priority order to fix
1. **Email (SES)** — operational; leads are being lost right now.
2. **H1 passcode brute-force**, **H2/H3 data leaks**, **H4 upload XSS** — real, no config dependency.
3. **M1–M5**.
4. **L1–L5** hardening.
