// Your account, including two-step verification.
//
// Clerk's profile was previously only reachable as a modal via
// clerk.openUserProfile(), which opens at the profile root and gives the
// Security tab no address of its own. Mounting it on a path means
// /account/security can be linked from a banner, sent to someone who needs to
// enrol, and screenshotted as evidence that the control exists.

import { UserProfile } from "@clerk/nextjs";

export default function AccountPage() {
  return (
    <div style={{ padding: "24px 0", display: "grid", placeItems: "start center" }}>
      <UserProfile routing="path" path="/account" />
    </div>
  );
}
