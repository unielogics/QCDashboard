import type { Metadata } from "next";
import type { ReactNode } from "react";
import localFont from "next/font/local";

// The borrower-facing MCA refinance room wears the marketing site's type: Inter
// Tight for headings over Inter for text. The console does not load either face
// (its tokens name them and fall back to the system UI font), so this route
// brings its own rather than changing what every console page renders in.
//
// Self-hosted, not next/font/google, for the reason QCWeb's layout records: a
// build-time fetch from fonts.gstatic.com has failed an Amplify build before and
// left a site on a stale deploy for days. These are the same two latin variable
// files QCWeb ships.
const inter = localFont({
  src: "./fonts/inter-variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter",
});
const interTight = localFont({
  src: "./fonts/inter-tight-variable.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-inter-tight",
});

// A borrower arriving from a marketing page must not read "Operator Console" in
// the tab; that is the console's title, inherited from the root layout.
export const metadata: Metadata = {
  title: "MCA refinance | Qualified Commercial",
  description: "Refinance your merchant cash advances with Qualified Commercial. Share your statements, sign the credit authorization and book a call.",
};

export default function McaRefinanceIntakeLayout({ children }: { children: ReactNode }) {
  return <div className={`${inter.variable} ${interTight.variable}`}>{children}</div>;
}
