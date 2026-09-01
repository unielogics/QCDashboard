import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";
import { isAgreementPortalHost } from "@/lib/agreementPortal";

const isAuthPage = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/forgot-password(.*)",
]);

// Public pages — no Clerk auth required. The legal documents must be
// reachable without an account (App Store / Play Store reviewers + signup
// consent links both need anonymous access).
const isPublicPage = createRouteMatcher([
  "/terms(.*)",
  "/privacy(.*)",
  "/disclosures(.*)",
  "/book(.*)",
  "/programs(.*)",
  "/dealer-ai-underwriter(.*)",
  "/funding-review(.*)",
  "/mca-refinance-intake(.*)",
  // Token-resolved HUD share — title / escrow / insurance contacts open
  // these without an account. The backend validates the token; we just
  // need to not bounce them off the edge.
  "/hud/share(.*)",
  "/buckets/request(.*)",
  // Plaid OAuth return for the client room. The room user has no account —
  // bouncing them to sign-in the moment they come back from their bank loses
  // the connection. Must match DEALER_OS_PLAID_ROOM_REDIRECT_URI and the
  // Plaid Dashboard's Allowed redirect URIs exactly.
  "/plaid/oauth(.*)",
  "/application-verification(.*)",
  "/buckets/share(.*)",
  "/buckets/public-share(.*)",
  // agreement.qualifiedcommercial.com portal -- public, unauthenticated,
  // token-free fill-and-sign contract portal (see the host rewrite below).
  "/agreement(.*)",
  // The design-system gallery. Static markup with no data behind it, and the
  // page itself calls notFound() unless NODE_ENV is development — so this
  // matcher can only ever match a 404 in production. It is here so the
  // screenshot harness can reach the shared vocabulary without a session.
  "/ds-gallery(.*)",
]);

// Super-admin-only routes. Edge-level hard-deny so a non-super-admin who
// guesses a URL is bounced before the page renders, not just hidden in nav.
//
// Explicit allowlist (NOT catch-all on /admin/*) because some admin routes
// must stay accessible to other operator roles per Architecture Rule #5
// "preserve existing operator workflows":
//   - `/admin/prequal-requests` — LOAN_EXEC keeps current access
//   - future `/admin/funding-inbox` — Funding Team (super-admin in P0,
//     opens to processor / loan_officer / funding_coordinator later)
const isSuperAdminOnlyPage = createRouteMatcher([
  "/admin/lenders(.*)",
  "/admin/borrowers(.*)",
  "/admin/capital-partner-applications(.*)",
  "/admin/buckets(.*)",
  "/settings(.*)",
]);

// Default-deny for the whole /admin surface: every admin page is operator-only
// (super_admin OR loan_exec), so clients / brokers are bounced at the edge even
// for routes not individually enumerated above. This closes the gap where a new
// or unlisted /admin/* page (e.g. /admin/lending-ai) was reachable by any
// signed-in user. Backend routers enforce the same roles; this is the edge tier.
const isOperatorOnlyPage = createRouteMatcher(["/admin(.*)"]);
const OPERATOR_ROLES = new Set(["super_admin", "loan_exec"]);

// Role lives in the backend `User` row (see /auth/me). For edge enforcement
// the role must also be mirrored into Clerk publicMetadata so it shows up in
// `sessionClaims`. Until that backend mirroring lands, this check degrades to
// "let through" — page-level guards (Sidebar nav + per-page role checks) keep
// the UI hidden in the meantime.
//
// 🚧 PRODUCTION BLOCKER 🚧
// This soft-degrade behavior is acceptable ONLY for P0A demo. Before any
// production cutover, ONE of the following MUST be true:
//   (a) qcbackend mirrors User.role → Clerk publicMetadata.role on every
//       role change so the JWT carries it (preferred), OR
//   (b) the `if (!role)` branch below is changed to deny missing-role access
//       outright (return redirect/403) instead of falling through.
// Either way, a non-super-admin who guesses /admin/lenders or /settings must
// be bounced at the edge, not relying on UI-only hiding.
//
// TODO(production blocker): pick (a) or (b) and remove this caveat block.
function getRoleFromClaims(
  sessionClaims: Record<string, unknown> | null | undefined,
): string | null {
  if (!sessionClaims) return null;
  const meta =
    (sessionClaims.publicMetadata as Record<string, unknown> | undefined) ??
    (sessionClaims.metadata as Record<string, unknown> | undefined);
  const role = meta?.role;
  return typeof role === "string" ? role : null;
}

const protectedMiddleware = clerkMiddleware(async (auth, req) => {
  // agreement.qualifiedcommercial.com serves the /agreement route tree at
  // its own root — a visitor there requesting "/" should see the
  // /agreement page, "/referral-protection" should see
  // /agreement/referral-protection, etc. This is the same qcdesktop
  // app/branch as app.qualifiedcommercial.com; only the served path
  // differs, via rewrite (not a second deployed app). layout.tsx does its
  // own host check (see lib/agreementPortal.ts) to tell AppShell to render
  // bare, since usePathname() never reflects this rewrite client-side.
  if (isAgreementPortalHost(req.headers.get("host") || "")) {
    if (!req.nextUrl.pathname.startsWith("/agreement")) {
      const rewritten = req.nextUrl.clone();
      rewritten.pathname = `/agreement${req.nextUrl.pathname === "/" ? "" : req.nextUrl.pathname}`;
      return NextResponse.rewrite(rewritten);
    }
  }

  const { userId, sessionClaims, redirectToSignIn } = await auth();

  // Already signed in? Don't show them the sign-in / sign-up pages — bounce
  // to the dashboard. Clerk's <SignIn> component renders nothing for signed-in
  // users and expects auto-redirect, which doesn't always fire on Amplify SSR;
  // do it server-side here so it always works.
  if (isAuthPage(req)) {
    if (userId) {
      // Use req.nextUrl.origin (public host) — req.url leaks Lambda's
      // localhost:3000.
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
    return; // unauthenticated visitors — let them through to /sign-in
  }

  // Public legal pages — let everyone through unconditionally.
  if (isPublicPage(req)) {
    return;
  }

  // Protected route: send unauthenticated users to /sign-in (no returnBackUrl
  // because req.url is the internal Lambda URL, which Clerk would reject).
  if (!userId) {
    return redirectToSignIn();
  }

  // Super-admin-only edge gate. If we know the role from the JWT and it isn't
  // super_admin, bounce to the dashboard. If we don't know the role yet (no
  // metadata wired), fall through and let the page's own role check handle it.
  if (isSuperAdminOnlyPage(req)) {
    const role = getRoleFromClaims(sessionClaims as Record<string, unknown>);
    if (role && role !== "super_admin") {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  } else if (isOperatorOnlyPage(req)) {
    // Any other /admin/* page: operators only. (Same soft-degrade as above —
    // when the role claim isn't in the JWT yet, fall through to the backend +
    // per-page guard. See the PRODUCTION BLOCKER note above.)
    const role = getRoleFromClaims(sessionClaims as Record<string, unknown>);
    if (role && !OPERATOR_ROLES.has(role)) {
      return NextResponse.redirect(new URL("/", req.nextUrl.origin));
    }
  }
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  // Clerk's development-browser handshake runs before its callback. The QA
  // bypass therefore has to wrap clerkMiddleware itself. It is limited to a
  // loopback host plus an explicit QA flag or seeded-user cookie. Production
  // domains can never enter this branch, including when a cookie is copied.
  const isLoopback = req.nextUrl.hostname === "localhost" || req.nextUrl.hostname === "127.0.0.1";
  if (
    isLoopback &&
    (process.env.NEXT_PUBLIC_QC_VISUAL_QA === "1" || req.cookies.has("qc_visual_qa_user"))
  ) {
    return NextResponse.next();
  }
  return protectedMiddleware(req, event);
}

export const config = {
  matcher: [
    // Skip static files + Next internals + favicon
    "/((?!_next|favicon.ico|icon.svg|.*\\..*).*)",
    // Always run on API routes
    "/(api|trpc)(.*)",
  ],
};
