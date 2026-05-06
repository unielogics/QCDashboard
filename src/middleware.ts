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
]);

export default clerkMiddleware(async (auth, req) => {
  const { userId, redirectToSignIn } = await auth();

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
});

export const config = {
  matcher: [
    // Skip static files + Next internals + favicon
    "/((?!_next|favicon.ico|icon.svg|.*\\..*).*)",
    // Always run on API routes
    "/(api|trpc)(.*)",
  ],
};
