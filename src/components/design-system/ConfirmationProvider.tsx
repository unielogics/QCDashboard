"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

export type ConfirmationRequest = {
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "danger";
  reversible?: boolean;
};

type PendingConfirmation = ConfirmationRequest & {
  resolve: (confirmed: boolean) => void;
};

const ConfirmationContext = createContext<((request: ConfirmationRequest) => Promise<boolean>) | null>(null);

export function ConfirmationProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const pendingRef = useRef<PendingConfirmation | null>(null);

  const requestConfirmation = useCallback((request: ConfirmationRequest) => {
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const next = { ...request, resolve };
      pendingRef.current = next;
      setPending(next);
    });
  }, []);

  const finish = useCallback((confirmed: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(confirmed);
  }, []);

  return (
    <ConfirmationContext.Provider value={requestConfirmation}>
      {children}
      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.title ?? "Confirm action"}
        body={pending?.body}
        confirmLabel={pending?.confirmLabel}
        cancelLabel={pending?.cancelLabel}
        tone={pending?.tone}
        reversible={pending?.reversible}
        onClose={() => finish(false)}
        onConfirm={() => finish(true)}
      />
    </ConfirmationContext.Provider>
  );
}

export function useConfirmAction() {
  const context = useContext(ConfirmationContext);
  if (!context) throw new Error("useConfirmAction must be used within ConfirmationProvider.");
  return context;
}
