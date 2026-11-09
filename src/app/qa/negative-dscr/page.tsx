import { notFound } from "next/navigation";
import NegativeDscrFixture from "./NegativeDscrFixture";

/** Local-only regression harness; ordinary builds do not expose this route. */
export default function NegativeDscrQaPage() {
  if (process.env.NEXT_PUBLIC_QC_VISUAL_QA !== "1") notFound();
  return <NegativeDscrFixture />;
}
