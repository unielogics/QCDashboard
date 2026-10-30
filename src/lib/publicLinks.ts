/**
 * One secure link for a client, whatever it opens.
 *
 * The API resolves a token to the screen it belongs to — a room, a share, a
 * form, a packet, a package, a lender submission — so a client can be sent
 * `/link/{token}` and land in the right place. Existing kind-specific links
 * keep working; this is the address that does not require knowing the kind.
 */

export type PublicLinkKind =
  | "room"
  | "share"
  | "public_share"
  | "hud_share"
  | "intake"
  | "form"
  | "production_package"
  | "lender_submission"
  | "bank_verification";

export type PublicLinkResolution = {
  kind: PublicLinkKind;
  /** Path on this site to open, including any query the screen expects. */
  path: string;
};

export function publicLinkHref(token: string): string {
  return `/link/${encodeURIComponent(token)}`;
}

export async function resolvePublicLink(apiBase: string, token: string): Promise<PublicLinkResolution> {
  const res = await fetch(`${apiBase}/api/v1/public/links/${encodeURIComponent(token)}`, { cache: "no-store" });
  if (res.status === 404) throw new Error("This link is not recognised. It may have expired or been revoked.");
  if (!res.ok) throw new Error("This link could not be opened right now. Please try again in a moment.");
  return (await res.json()) as PublicLinkResolution;
}
