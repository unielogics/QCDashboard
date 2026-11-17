import type { Metadata } from "next";
import type { ReactNode } from "react";

// A dealer arriving from a link must not read "Operator Console" in the tab:
// that is the console's title, inherited from the root layout. The equipment
// route re-exports this page and has a layout and a title of its own.
export const metadata: Metadata = {
  title: "Dealer funding review | Qualified Commercial",
  description: "Open and continue a secure Qualified Commercial dealer funding review.",
};

export default function DealerAIUnderwriterLayout({ children }: { children: ReactNode }) {
  return children;
}
