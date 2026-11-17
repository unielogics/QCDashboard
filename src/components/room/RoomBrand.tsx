// The brand block a client-facing room opens with: the mark, the firm's name
// and its line of business. The secure application room draws the same block
// (src/app/buckets/request/[token]/page.tsx); pages the room hands the client
// to use this one, so the client never feels they left Qualified Commercial.

import { QCMark } from "@/components/QCMark";

export function RoomBrand() {
  return (
    <div className="application-room-brand">
      <QCMark size={36} />
      <div>
        <b>QUALIFIED COMMERCIAL</b>
        <span>Financing &amp; Capital Advisory</span>
      </div>
    </div>
  );
}
