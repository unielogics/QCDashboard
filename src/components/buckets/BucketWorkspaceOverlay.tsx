"use client";

import { Component, lazy, Suspense, type ReactNode } from "react";
import { Callout } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";

const BucketWorkspace = lazy(() => import("@/components/buckets/BucketWorkspace"));

class BucketLoadBoundary extends Component<{ onClose: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <Drawer open fullscreen title="Bucket unavailable" onClose={this.props.onClose}>
      <Callout tone="bad">The bucket workspace could not open. Your intake and unsaved work are still here. Close this panel to continue.</Callout>
    </Drawer> : this.props.children;
  }
}

/** Open the existing bucket workspace without replacing its originating file. */
export function BucketWorkspaceOverlay({ bucketId, onClose }: { bucketId: string | null; onClose: () => void }) {
  if (!bucketId) return null;
  return <BucketLoadBoundary key={bucketId} onClose={onClose}>
    <Suspense fallback={<Drawer open fullscreen title="Opening bucket" onClose={onClose}><span role="status">Loading this file’s bucket…</span></Drawer>}>
      <BucketWorkspace embeddedBucketId={bucketId} onClose={onClose} />
    </Suspense>
  </BucketLoadBoundary>;
}
