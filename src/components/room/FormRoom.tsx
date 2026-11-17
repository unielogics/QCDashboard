// The shell every page we send a client wears: the secure application room's
// own look, so a form opened from a link reads as part of Qualified
// Commercial and of the room the client already knows. The brand block with
// the mark, the room's header, tokens, buttons and footer come from the
// room's styles (app-extras.css, ".application-room"); ".fp-room" re-tokens
// the form pieces (.fp-*) from them.
//
// Used by the single form, the four-forms package, the shared worksheet, the
// earnings plan and the real estate loan application.

import type { ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import { RoomBrand } from "@/components/room/RoomBrand";

export function FormRoomFooter() {
  return (
    <footer className="application-room-footer">
      <span><Icon name="lock" size={14} />Encrypted in transit and at rest</span>
      <span>Qualified Commercial</span>
    </footer>
  );
}

/** The page: the room's ground and topline, a column for the content, and the room's footer. `wide` is for a sheet or a workspace. */
export function FormRoomShell({ theme = "light", wide = false, children }: { theme?: "light" | "obsidian"; wide?: boolean; children: ReactNode }) {
  return (
    <div className={`application-room ${theme === "obsidian" ? "is-obsidian" : "is-light"} fp-room`}>
      <div className="application-room-topline" />
      <div className={wide ? "application-room-shell" : "application-room-shell fp-room-shell"}>
        {children}
        <FormRoomFooter />
      </div>
    </div>
  );
}

/** The room's header: the brand, then what this page is (its children: a heading and a line under it). */
export function FormRoomHeader({ eyebrow = "Secure form", actions, children }: { eyebrow?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <header className="application-room-header">
      <div className="application-room-header-main">
        <RoomBrand />
        {children ? <div><span className="application-room-eyebrow">{eyebrow}</span>{children}</div> : null}
      </div>
      {actions ? <div className="application-room-header-actions">{actions}</div> : null}
    </header>
  );
}
