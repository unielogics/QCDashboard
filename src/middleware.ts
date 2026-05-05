import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip static files + Next internals
    "/((?!_next|favicon.ico|.*\\..*).*)",
    // Always run on API routes
    "/(api|trpc)(.*)",
  ],
};
