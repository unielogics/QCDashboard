// The package's actions, in one place, rendered by whichever host owns the
// chrome. The desk's page puts them beside the ✕ in its header; the forwarded
// link puts them in its own slim bar. The workspace itself no longer renders
// them — it exposes what they call through a handle instead.
import { IconLink } from "./icons";
import { PBtn } from "./ui";
import type { ProductionPackage } from "./types";

export function sendLabelFor(pkg: ProductionPackage): string {
  if (pkg.status === "draft") return pkg.stage === 2 ? "Send the final" : "Send stage one";
  if (pkg.status === "out_for_signature") return "Signatures";
  return pkg.status === "executed" ? "Executed" : "Voided";
}

export function PackageActions({ pkg, busy, size = "md", onPresentation, onShare, onSend, onClose }: {
  pkg: ProductionPackage;
  /** The proposal is being generated. */
  busy?: boolean;
  size?: "sm" | "md";
  onPresentation: () => void;
  /** Present only where sharing is possible — the signed-in page. A forwarded link never shares onward. */
  onShare?: () => void;
  onSend: () => void;
  /** The forwarded link's "you're done here". The desk's page has its own ✕ and passes nothing. */
  onClose?: () => void;
}) {
  const two = pkg.stage === 2;
  const open = pkg.status === "draft" ? pkg.computed.attention.length : 0;
  return (
    <div className="pp-actions">
      {!two ? (
        <PBtn size={size} onClick={onPresentation} busy={busy} disabled={!pkg.capabilities.can_generate} title={pkg.presentation.stale ? "The last proposal is out of date" : undefined}>
          Dealer proposal{pkg.presentation.stale ? " ·" : ""}
        </PBtn>
      ) : null}
      {onShare && pkg.capabilities.can_share ? <PBtn size={size} onClick={onShare}><IconLink />Share</PBtn> : null}
      <PBtn size={size} variant="pri" onClick={onSend} disabled={pkg.status === "void"} title={open ? `${open} open item${open === 1 ? "" : "s"}` : undefined}>
        {sendLabelFor(pkg)}
      </PBtn>
      {onClose ? <PBtn size={size} onClick={onClose} title="Close">Close</PBtn> : null}
    </div>
  );
}
