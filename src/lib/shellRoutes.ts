// Which routes render WITHOUT the app chrome.
//
// Extracted from AppShell so it can be read and tested on its own. Getting this
// list wrong is expensive in a specific way: adding a prefix by accident strips
// the nav from a real console route, and omitting one wraps a public page —
// a client document room, a signature portal — in a sidebar for an account the
// visitor does not have.
//
// The list is prefix-matched and order-independent.

/**
 * Public and auth surfaces. Each entry is here for a reason:
 *   - sign-in / sign-up: no session yet
 *   - terms / privacy: signup consent links point at them, and app store
 *     review requires public legal URLs
 *   - book: public scheduling
 *   - programs: public dealer programs
 *   - dealer-ai-underwriter / funding-review / mca-refinance-intake: the three
 *     public intake apps
 *   - buckets/request, buckets/share, buckets/public-share: token-authorised
 *     client and vendor document rooms
 *   - agreement: direct-path access to the signature portal (the real
 *     agreement.* host is handled by the flag, since a host rewrite leaves
 *     pathname reporting the original path)
 *   - hud/share: token-resolved shares opened by title, escrow and insurance
 *     contacts who have no account
 *   - plaid/oauth: the Plaid OAuth return for the client room. A borrower
 *     coming back from their bank has no session; bouncing them to sign-in
 *     loses the connection after they have already authenticated.
 */
export const BARE_ROUTE_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/terms",
  "/privacy",
  "/book",
  "/programs",
  "/dealer-ai-underwriter",
  "/funding-review",
  "/mca-refinance-intake",
  "/buckets/request",
  "/forms",
  "/buckets/share",
  "/buckets/public-share",
  "/agreement",
  "/hud/share",
  "/plaid/oauth",
  "/application-verification",
  // The dev-only design-system gallery renders its own <main className="content">
  // so it can be shot without the sidebar in frame.
  "/ds-gallery",
] as const;

export function isBareRoute(
  pathname: string | null | undefined,
  opts: { isAgreementPortal?: boolean } = {},
): boolean {
  // The agreement.* host is rewritten server-side, so pathname still reports
  // the ORIGINAL request path ("/", "/referral-protection") and can never be
  // matched by prefix. The flag is the only signal.
  if (opts.isAgreementPortal) return true;
  if (!pathname) return false;
  return BARE_ROUTE_PREFIXES.some((p) => pathname.startsWith(p));
}
