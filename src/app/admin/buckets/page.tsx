"use client";

import { useSearchParams } from "next/navigation";
import BucketWorkspace from "@/components/buckets/BucketWorkspace";

export default function BucketsAdminPage() {
  const searchParams = useSearchParams();
  return <BucketWorkspace initialBucketId={searchParams.get("bucket")} />;
}
