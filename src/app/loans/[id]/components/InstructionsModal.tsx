"use client";

// InstructionsModal — wraps InstructionStrip in a modal. Replaces the
// in-line "Instructions" tab in the old DealWorkspaceTab layout. The
// header AI Secretary action button toggles it open.

import { useEffect } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { InstructionStrip } from "./InstructionStrip";
import type { LoanInstruction } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  loanId: string;
  instructions: LoanInstruction[];
  canEdit: boolean;
}

export function InstructionsModal({ open, onClose, loanId, instructions, canEdit }: Props) {
  const { t } = useTheme();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.32)",
        zIndex: 70,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "86vh",
          background: t.surface,
          borderRadius: 14,
          border: `1px solid ${t.line}`,
          boxShadow: "0 24px 48px rgba(0,0,0,0.22)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "14px 18px",
          borderBottom: `1px solid ${t.line}`,
        }}>
          <Icon name="sliders" size={14} />
          <span style={{ fontSize: 14, fontWeight: 900, color: t.ink }}>
            File instructions
          </span>
          <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700 }}>
            Standing rules the AI honors on this loan
          </span>
          <div style={{ flex: 1 }} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close instructions"
            style={{
              all: "unset", cursor: "pointer",
              padding: 6, borderRadius: 6,
              color: t.ink3, fontSize: 18, fontWeight: 900, lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ padding: 16, overflow: "auto", flex: 1, minHeight: 0 }}>
          <InstructionStrip
            loanId={loanId}
            instructions={instructions}
            canEdit={canEdit}
          />
        </div>
      </div>
    </div>
  );
}
