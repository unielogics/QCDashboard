import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Business Funding Application | Qualified Commercial",
  description: "Start or resume a secure business financing application with AI document guidance.",
  robots: { index: false, follow: false },
};

export default function BusinessFundingIntakeLayout({ children }: { children: ReactNode }) { return children; }
