"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/design-system/ThemeProvider";
import { ConfirmationProvider } from "@/components/design-system/ConfirmationProvider";
import { AIReviewProvider } from "@/components/admin/AIReviewProvider";
import StaleBuildReload from "@/components/shell/StaleBuildReload";
import { isVisualQa, useConsoleAuth, visualQaUser } from "@/lib/consoleAuth";
import { fileAuthScope } from "@/lib/fileOpening";

export default function Providers({ children }: { children: ReactNode }) {
  const auth = useConsoleAuth();
  const scope = fileAuthScope(auth, isVisualQa ? visualQaUser("admin@qc.dev") : null);
  return <SessionProviders key={scope}>{children}</SessionProviders>;
}

function SessionProviders({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  const mounted = useRef(false);
  // No file, financial or conversation cache survives a sign-out, principal,
  // session or organisation switch. Remount observers onto the new client.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      // Strict Mode replays effects without replacing this session. A real
      // session boundary stays unmounted and releases its private cache.
      queueMicrotask(() => { if (!mounted.current) qc.clear(); });
    };
  }, [qc]);
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ConfirmationProvider>
          <AIReviewProvider>
            <StaleBuildReload />
            {children}
          </AIReviewProvider>
        </ConfirmationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
