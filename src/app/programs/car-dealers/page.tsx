import { permanentRedirect } from "next/navigation";

/**
 * Retired. This was a 644-line dealer marketing page living on the app
 * subdomain, and it was the last surface still rendering the previous design
 * language — inline dark-navy styles, Georgia headings, gold accents — long
 * after the marketing site moved to the light institutional system.
 *
 * Marketing content belongs on the marketing site, and the converted equivalent
 * is qualifiedcommercial.com/industries/auto. That page carries the same four
 * dealer programs, the required-document list, the speed comparison, and — as
 * of the port that preceded this deletion — the MCA-versus-floorplan cost
 * calculator, which was the one feature that only existed here.
 *
 * Permanent rather than temporary so the link equity transfers: this URL was
 * published in the footer, in the auth shell, and externally.
 */

const MARKETING_ORIGIN =
  process.env.NEXT_PUBLIC_MARKETING_URL ?? "https://qualifiedcommercial.com";

export default function CarDealerProgramsPage(): never {
  permanentRedirect(`${MARKETING_ORIGIN}/industries/auto`);
}
