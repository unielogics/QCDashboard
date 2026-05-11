import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isAuthPage = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

// Public pages — no Clerk auth required. The legal documents must be
// reachable without an account (App Store / Play Store reviewers + signup
// consent links both need anonymous access).
const isPublicPage = createRouteMatcher([
  "/terms(.*)",
  "/privacy(.*)",
  // Token-resolved HUD share — title / escrow / insurance contacts open
  // these without an account. The backend validates the token; we just
  // need to not bounce them off the edge.
  "/hud/share(.*)",
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
  "/settings(.*)",
]);

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

export default clerkMiddleware(async (auth, req) => {
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
  }
});

export const config = {
  matcher: [
    // Skip static files + Next internals + favicon
    "/((?!_next|favicon.ico|icon.svg|.*\\..*).*)",
    // Always run on API routes
    "/(api|trpc)(.*)",
  ],
};
