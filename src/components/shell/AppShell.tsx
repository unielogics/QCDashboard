"use client";

import { useEffect, type ReactNode } from "react";
import MfaBanner from "@/components/MfaBanner";
import { usePathname, useRouter } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { MobileBottomNav } from "./MobileBottomNav";
import TopBar from "./TopBar";
import AIRail from "./AIRail";
import GlobalSearch from "./GlobalSearch";
import { useUI, readPersistedSidebar, readPersistedTheme } from "@/store/ui";
import { isBareRoute as computeBareRoute } from "@/lib/shellRoutes";
import { useCurrentUser, useContractStatus } from "@/hooks/useApi";
import { useRecordPendingConsent } from "@/hooks/useRecordPendingConsent";
import { SIGN_IN_URL } from "@/lib/appUrl";
import { _setActiveProfileFromUser } from "@/store/role";
import { isPrimaryShortcut } from "@/lib/platformShortcuts";
import { Role, ContractType } from "@/lib/enums.generated";
import { PlatformAccessGate } from "@/components/broker/PlatformAccessGate";
import { useConsoleAuth } from "@/lib/consoleAuth";

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
  const pathname = usePathname();
  const isBareRoute = computeBareRoute(pathname, { isAgreementPortal });

  // Public token/session routes must not initialize authenticated console
  // queries or global keyboard handlers. Apart from avoiding needless 401s,
  // this isolates legal signing from failures in operator-shell behavior.
  if (isBareRoute) {
    return <div className="bareshell">{children}</div>;
  }

  return <AuthenticatedAppShell pathname={pathname ?? ""}>{children}</AuthenticatedAppShell>;
}

function AuthenticatedAppShell({ children, pathname }: { children: ReactNode; pathname: string }) {
  const router = useRouter();
  const aiOpen = useUI((s) => s.aiOpen);
  const setAiOpen = useUI((s) => s.setAiOpen);
  const sidebarCollapsed = useUI((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUI((s) => s.setSidebarCollapsed);
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  const setSearchOpen = useUI((s) => s.setSearchOpen);
  const { isLoaded: authLoaded, isSignedIn } = useConsoleAuth();

  // Rehydrate the user's persisted sidebar choice once, post-mount. Doing
  // this in an effect (rather than at store init) keeps the first client
  // render identical to the server render, avoiding hydration mismatch
  // (React #418/#425) when localStorage says "expanded".
  useEffect(() => {
    const persisted = readPersistedSidebar();
    if (window.matchMedia("(max-width: 760px)").matches) {
      useUI.setState({ sidebarCollapsed: true });
    } else {
      setSidebarCollapsed(persisted);
    }
    setTheme(readPersistedTheme());
  }, [setSidebarCollapsed, setTheme]);
  const { data: user, isLoading: userLoading, isError: userError } = useCurrentUser();
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

  // A session that still owes a required task — setting up two-step
  // verification, for instance — reports isSignedIn === false, because
  // @clerk/backend treats a `pending` session as signed out by default. Clerk
  // renders those tasks under the sign-in route, so bouncing there is correct.
  // /account is excluded because it is where someone lands to satisfy the
  // task, and sending them back to sign-in from it would be a loop.
  const isAccountRoute = pathname.startsWith("/account");

  useEffect(() => {
    if (!isAccountRoute && authLoaded && isSignedIn === false) {
      window.location.assign(SIGN_IN_URL);
    }
  }, [authLoaded, isAccountRoute, isSignedIn]);

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
    user?.role === Role.DEALER_PARTNER && !isDealerPartnerConfinedRoute;
  useEffect(() => {
    if (isDealerPartnerOutOfBounds) {
      router.replace("/broker/ai-underwriter-leads");
    }
  }, [isDealerPartnerOutOfBounds, router]);

  if (!authLoaded || isSignedIn === false) {
    return <div className="bareshell" />;
  }

  // Do not render role-specific chrome until /auth/me has resolved. The
  // least-privileged fallback is correct for legacy hooks, but showing the
  // client sidebar here makes a real super-admin look scoped while the account
  // lookup is still pending or failed.
  if (userLoading || !user) {
    return (
      <div className="bareshell">
        {userError ? (
          <div style={{ maxWidth: 520, margin: "18vh auto", padding: 24, textAlign: "center" }}>
            <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Account access could not be loaded</h1>
            <p style={{ color: "var(--muted)", margin: 0 }}>
              Sign in again so the console can verify your role before opening any file data.
            </p>
          </div>
        ) : null}
      </div>
    );
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
    return <div className="bareshell" />;
  }

  return (
    // `.app` ships `min-height: 100vh`; the console pins it to exactly the
    // viewport instead so <main> below can be the only scroller. That
    // correction lives in app-extras.css, not here.
    <div className={sidebarCollapsed ? "app app--collapsed" : "app"} data-dark={theme === "dark" ? "1" : undefined}>
      <Sidebar />
      {/* min-height:0 + minWidth:0 are REQUIRED on the flex column so the
          inner <main> can actually shrink and scroll instead of pushing the
          page taller than the viewport. Without min-height:0 the column
          grows to fit children's content and the whole document scrolls. */}
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <TopBar />
        {/* The rail is a flex SIBLING of the scroll area, not a grid column.
            As a column it animated grid-template-columns and reflowed the page
            underneath every time Elara opened. */}
        <div style={{ display: "flex", minWidth: 0, minHeight: 0, flex: 1 }}>
          <main
            className="content content--wide"
            style={{ flex: 1, minWidth: 0, overflowY: "auto", overflowX: "hidden" }}
          >
          {/* Above the page, not inside it: the prompt has to be visible
              wherever you land, not only on one screen you might not open. */}
            <MfaBanner />
            {children}
          </main>
          <AIRail />
        </div>
      </div>
      <MobileBottomNav />
      <GlobalSearch />
    </div>
  );
}
