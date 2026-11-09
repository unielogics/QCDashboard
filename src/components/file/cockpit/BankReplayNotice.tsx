import { Btn, StatusLine } from "@/components/ds";

export function BankReplayNotice({ reason, onReviewEvidence }: { reason?: string | null; onReviewEvidence?: () => void }) {
  if (!reason) return null;
  return <StatusLine tone="warn"><strong>Bank projection needs review.</strong> {reason}{onReviewEvidence ? <Btn size="sm" onClick={onReviewEvidence}>Review bank evidence</Btn> : null}</StatusLine>;
}
