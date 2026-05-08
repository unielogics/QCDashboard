"use client";

// InviteBorrowerPanel — confirms the Lead's contact + sends the Clerk
// invitation that lands them in Smart Intake. On Smart Intake completion the
// backend creates a Borrower row with `client.lead_id` set, and the Lead
// transitions from "contacted" → "converted".
//
// P0A uses the mock layer (mockInviteLead) which just bumps Lead status to
// "contacted" — the actual Clerk invite + Smart Intake conversion is a
// backend integration that lights up when NEXT_PUBLIC_BACKEND_HAS_LEADS=true.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Pill } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { RightPanel } from "@/components/design-system/RightPanel";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useInviteLead } from "@/hooks/useApi";
import type { Lead } from "@/lib/types";

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead | null | undefined;
  onInvited?: () => void;
}

export function InviteBorrowerPanel({ open, onClose, lead, onInvited }: Props) {
  const { t } = useTheme();
  const invite = useInviteLead();
  const [emailOverride, setEmailOverride] = useState("");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmailOverride(lead?.email ?? "");
      setErr(null);
    }
  }, [open, lead]);

  const valid = !!lead && /\S+@\S+\.\S+/.test(emailOverride);

  const submit = async () => {
    if (!lead) return;
    setErr(null);
    try {
      await invite.mutateAsync(lead.id);
      onInvited?.();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not send invite");
    }
  };

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      eyebrow="Invite Borrower"
      title={lead?.name ?? "Invite Borrower"}
      ariaLabel="Invite the Lead as a Borrower"
      footer={
        <>
          <button onClick={onClose} style={qcBtn(t)} disabled={invite.isPending}>Cancel</button>
          <button
            onClick={submit}
            disabled={!valid || invite.isPending}
            style={{
              ...qcBtnPrimary(t),
              opacity: valid && !invite.isPending ? 1 : 0.5,
              cursor: valid && !invite.isPending ? "pointer" : "not-allowed",
            }}
          >
            <Icon name="send" size={13} /> {invite.isPending ? "Sending…" : "Send invite"}
          </button>
        </>
      }
    >
      {!lead ? (
        <div style={{ color: t.ink3, fontSize: 13 }}>Lead not loaded.</div>
      ) : (
        <>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: t.ink3,
                letterSpacing: 1.0,
                textTransform: "uppercase",
              }}
            >
              Email
            </div>
            <input
              value={emailOverride}
              onChange={(e) => setEmailOverride(e.target.value)}
              placeholder="avery@example.com"
              type="email"
              style={inputStyle(t)}
              autoFocus
            />
            <div style={{ fontSize: 11, color: t.ink3 }}>
              The Clerk invitation will be sent to this address. Edit if the Lead gave you
              a different one for paperwork.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Pill bg={t.chip} color={t.ink2}>Lead status: {lead.status}</Pill>
            <Pill bg={t.chip} color={t.ink2}>Source: {lead.source.replace(/_/g, " ")}</Pill>
          </div>

          <div
            style={{
              padding: 14,
              borderRadius: 10,
              background: t.surface2,
              border: `1px solid ${t.line}`,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: t.ink, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="spark" size={13} />
              What happens next
            </div>
            <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: 1.6, color: t.ink2 }}>
              <li>The Lead receives a Clerk invitation email at the address above.</li>
              <li>On signup they land in <strong>Smart Intake</strong> — borrower info, asset, numbers, AI rules.</li>
              <li>
                On intake completion, the backend creates a Borrower with{" "}
                <code style={{ background: t.chip, padding: "1px 4px", borderRadius: 4 }}>client.lead_id</code>{" "}
                set to this Lead. The Lead status moves to <strong>converted</strong>.
              </li>
              <li>
                You&apos;ll see the Borrower in your Borrowers list and can spin up a Deal
                under them.
              </li>
            </ol>
          </div>

          <div style={{ fontSize: 11, color: t.ink3, lineHeight: 1.5 }}>
            All AI drafts and outbound nudges to this borrower will respect the firm&apos;s
            compliance policy — no &quot;you are approved&quot; or &quot;guaranteed rate&quot; language.
            You approve every send.
          </div>

          {err && <Pill bg={t.dangerBg} color={t.danger}>{err}</Pill>}
        </>
      )}
    </RightPanel>
  );
}

function inputStyle(t: ReturnType<typeof useTheme>["t"]): React.CSSProperties {
  return {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 9,
    background: t.surface2,
    border: `1px solid ${t.line}`,
    color: t.ink,
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
  };
}
