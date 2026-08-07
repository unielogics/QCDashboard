"use client";

import { useEffect, type ReactNode } from "react";
import { useAuth } from "@clerk/nextjs";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "./Sidebar";
import TopBar from "./TopBar";
import AIRail from "./AIRail";
import GlobalSearch from "./GlobalSearch";
import { useUI, readPersistedSidebar } from "@/store/ui";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { useCurrentUser, useContractStatus } from "@/hooks/useApi";
import { useRecordPendingConsent } from "@/hooks/useRecordPendingConsent";
import { SIGN_IN_URL } from "@/lib/appUrl";
import { _setActiveProfileFromUser } from "@/store/role";
import { isPrimaryShortcut } from "@/lib/platformShortcuts";
import { Role, ContractType } from "@/lib/enums.generated";
import { PlatformAccessGate } from "@/components/broker/PlatformAccessGate";

export default function AppShell({
  children,
  isAgreementPortal = false,
}: {
  children: ReactNode;
  // Server-detected: true when this request's Host header is
  // agreement.qualifiedcommercial.com (see layout.tsx + lib/agreementPortal.ts).
  // After middleware's host-based rewrite, usePathname() below still reports
  // the ORIGINAL request path ("/", "/referral-protection"), never
  // "/agreement/...", so pathname alone can't detect the portal on that host.
  isAgreementPortal?: boolean;
}) {
  const { t } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUI((s) => s.setSidebarCollapsed);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const { isLoaded: authLoaded, isSignedIn } = useAuth();

  // Rehydrate the user's persisted sidebar choice once, post-mount. Doing
  // this in an effect (rather than at store init) keeps the first client
  // render identical to the server render, avoiding hydration mismatch
  // (React #418/#425) when localStorage says "collapsed".
  useEffect(() => {
    const persisted = readPersistedSidebar();
    if (persisted) setSidebarCollapsed(true);
  }, [setSidebarCollapsed]);
  const { data: user } = useCurrentUser();
  // Flush any pending sign-up consent (from localStorage) into the
  // /legal/accept audit table once the user resolves.
  useRecordPendingConsent();
  // Hard-gates Role.DEALER_PARTNER access until the Platform Access
  // Agreement is signed. Fetched for every authenticated user (cheap,
  // `required` is false for everyone else) rather than only brokers, so the
  // query is ready the instant a broker's role resolves without a
  // render-order dependency.
  const { data: platformAccessStatus } = useContractStatus(ContractType.PLATFORM_ACCESS);

  // Mirror the real /auth/me user into the legacy useActiveProfile() shim so
  // older call sites keep working while we migrate them off.
  useEffect(() => {
    _setActiveProfileFromUser(user ?? null);
  }, [user]);

  // Auto-close the AI rail on screen change (per chat2.md final state)
  useEffect(() => { setAiOpen(false); }, [pathname, setAiOpen]);

  // Primary shortcut opens GlobalSearch: Ctrl+K on Windows/Linux, ⌘K on macOS.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPrimaryShortcut(e, "k")) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSearchOpen]);

  // Sidebar manages its own collapsed/expanded width internally now.
  // Reference sidebarCollapsed to keep the dependency tracked (drives
  // the sidebar's transition, not the grid).
  void sidebarCollapsed;
  const railW = aiOpen ? 360 : 0;

  // Auth + public-legal pages render bare — no sidebar / topbar / AI rail.
  // /terms and /privacy must be reachable without auth (signup consent links
  // point to them, and Apple/Google review require public legal URLs).
  const isBareRoute =
    pathname.startsWith("/sign-in") ||
    pathname.startsWith("/sign-up") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/book") ||
    pathname.startsWith("/programs") ||
    pathname.startsWith("/dealer-ai-underwriter") ||
    pathname.startsWith("/funding-review") ||
    pathname.startsWith("/buckets/request") ||
    pathname.startsWith("/buckets/share") ||
    pathname.startsWith("/buckets/public-share") ||
    // Direct-path access to /agreement (e.g. app.qualifiedcommercial.com/agreement
    // during local dev/testing) -- separate from the isAgreementPortal host
    // check below, which covers the real agreement.qualifiedcommercial.com
    // subdomain where pathname never actually shows "/agreement".
    pathname.startsWith("/agreement") ||
    // agreement.qualifiedcommercial.com portal (rewritten server-side by
    // middleware.ts's host-based rewrite) -- public, unauthenticated,
    // fill-and-sign contract portal, same bare-shell treatment as the
    // other public intake pages above.
    isAgreementPortal ||
    // Token-resolved HUD shares — opened by title / escrow / insurance
    // contacts without an account, so we render them bare.
    pathname.startsWith("/hud/share");

  useEffect(() => {
    if (!isBareRoute && authLoaded && isSignedIn === false) {
      window.location.assign(SIGN_IN_URL);
    }
  }, [authLoaded, isBareRoute, isSignedIn]);

  // Ongoing confinement, past the one-time Platform Access signature gate
  // below: a signed dealer partner has no book-of-business (see
  // Role.DEALER_PARTNER's docstring in app/enums.py) and must never render
  // the operator dashboard or any other internal route — via bookmark, deep
  // link, or browser back button. This is defense-in-depth alongside the
  // backend scoping fix (scope_loan_query / scope_client_query / calendar /
  // ai-tasks all deny DEALER_PARTNER by default now); the real enforcement
  // is server-side, this just keeps the UI from ever showing the wrong
  // screen while a redirect races the deny. Hook must run unconditionally
  // (before the isBareRoute/auth early returns below) per Rules of Hooks.
  const isDealerPartnerConfinedRoute =
    pathname.startsWith("/broker") || pathname.startsWith("/profile");
  const isDealerPartnerOutOfBounds =
    !isBareRoute && user?.role === Role.DEALER_PARTNER && !isDealerPartnerConfinedRoute;
  useEffect(() => {
    if (isDealerPartnerOutOfBounds) {
      router.replace("/broker/ai-underwriter-leads");
    }
  }, [isDealerPartnerOutOfBounds, router]);

  if (isBareRoute) {
    return <div style={{ background: t.bg, minHeight: "100vh" }}>{children}</div>;
  }

  if (!authLoaded || isSignedIn === false) {
    return <div style={{ background: t.bg, minHeight: "100vh" }} />;
  }

  // Hard block: a dealer partner with no signed Platform Access Agreement
  // sees only the gate, never the sidebar/topbar/routes, until they sign.
  // Enforcement also lives server-side (_require_dealer_partner on every
  // broker endpoint checks both this AND the company's Referral Protection
  // Agreement) — this is the UX half of that guarantee, not the only one.
  if (user?.role === Role.DEALER_PARTNER && platformAccessStatus?.required) {
    return <PlatformAccessGate />;
  }

  if (isDealerPartnerOutOfBounds) {
    return <div style={{ background: t.bg, minHeight: "100vh" }} />;
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `auto 1fr ${railW}px`,
        height: "100vh",
        background: t.bg,
        transition: "grid-template-columns .2s ease",
      }}
    >
      <Sidebar />
      {/* min-height:0 + minWidth:0 are REQUIRED on the flex column so the
          inner <main> can actually shrink and scroll instead of pushing the
          page taller than the viewport. Without min-height:0 the column
          grows to fit children's content and the whole document scrolls. */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <TopBar />
        <main style={{ flex: 1, overflowY: "auto", overflowX: "hidden", padding: 24 }}>{children}</main>
      </div>
      <AIRail />
      <GlobalSearch />
    </div>
  );
}
