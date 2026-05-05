import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;

  // Use an explicit redirect rather than auth.protect()'s handshake rewrite —
  // the rewrite (`/clerk_<timestamp>`) requires Clerk's edge runtime to
  // intercept it, which Amplify SSR doesn't do; you get a 404 on protected
  // routes for unauthenticated requests. This 302s straight to /sign-in.
  const { userId, redirectToSignIn } = await auth();
  if (!userId) {
    return redirectToSignIn({ returnBackUrl: req.url });
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
