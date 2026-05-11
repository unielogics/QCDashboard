// Standalone layout for public HUD-share pages. Bypasses AppShell
// (which assumes a signed-in operator) so unauthenticated invitees
// can open the page without seeing the operator console chrome.

export default function HudShareLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
