import { notFound } from "next/navigation";
import PayoffReplayFixture from "./PayoffReplayFixture";

export default function PayoffReplayQaPage() {
  if (process.env.NEXT_PUBLIC_QC_VISUAL_QA !== "1") notFound();
  return <PayoffReplayFixture />;
}
