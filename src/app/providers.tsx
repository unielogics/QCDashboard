"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/design-system/ThemeProvider";
import { ConfirmationProvider } from "@/components/design-system/ConfirmationProvider";
import { AIReviewProvider } from "@/components/admin/AIReviewProvider";

export default function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  return (
    <QueryClientProvider client={qc}>
      <ThemeProvider>
        <ConfirmationProvider>
          <AIReviewProvider>{children}</AIReviewProvider>
        </ConfirmationProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
