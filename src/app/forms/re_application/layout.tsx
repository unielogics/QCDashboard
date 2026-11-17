import type { Metadata } from "next";
import type { ReactNode } from "react";

// The client's own page: the tab names the application, not the operator console.
export const metadata: Metadata = { title: "Real estate loan application | Qualified Commercial" };

export default function ReApplicationLayout({ children }: { children: ReactNode }) {
  return children;
}
