import type { Metadata } from "next";
import type { ReactNode } from "react";

// A client arriving from a link must not read "Operator Console" in the tab:
// that is the console's title, inherited from the root layout.
export const metadata: Metadata = {
  title: "Funding review | Qualified Commercial",
  description: "Open and continue a secure Qualified Commercial real estate funding review.",
};

export default function FundingReviewLayout({ children }: { children: ReactNode }) {
  return children;
}
