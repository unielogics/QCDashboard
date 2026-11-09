import { notFound } from "next/navigation";
import LoanPaymentsFixture from "./LoanPaymentsFixture";

/** Explicit local-only visual harness. It is unavailable in ordinary builds. */
export default function LoanPaymentsQaPage() {
  if (process.env.NEXT_PUBLIC_QC_VISUAL_QA !== "1") notFound();
  return <LoanPaymentsFixture />;
}
