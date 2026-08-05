// Shared between middleware.ts (host-based rewrite) and layout.tsx (server-side
// host detection passed down to AppShell). After a middleware rewrite, the
// browser's address bar -- and therefore usePathname() in a client component --
// never changes: a visitor at agreement.qualifiedcommercial.com/ always sees
// pathname "/", never "/agreement", even though the server is rendering
// src/app/agreement/page.tsx underneath. So AppShell can't rely on pathname
// to detect "this is the agreement portal" -- it needs the host check done
// server-side (layout.tsx has access to request headers) and passed down
// explicitly.
export const AGREEMENT_PORTAL_HOST = "agreement.qualifiedcommercial.com";

export function isAgreementPortalHost(host: string): boolean {
  return host === AGREEMENT_PORTAL_HOST || host.startsWith(`${AGREEMENT_PORTAL_HOST}:`);
}
