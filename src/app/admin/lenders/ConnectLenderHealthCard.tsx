"use client";

// Super-admin diagnostic for the Connect-Lender feature chain.
//
// Kept compact so the lender roster stays the primary surface. The
// full probe details are still available behind the Details toggle.
//
// Styling migrated off the inline token objects onto the plain-CSS design
// system (globals.css + app-extras.css) via the wrappers in @/components/ds.
// The probe, its states and the toggle are unchanged; only the surface moved:
//   Card + hand-rolled toggle row → `.disc` / `.disc-h` / `.disc-b`, the named
//                                   collapsed-summary row. The summary line is
//                                   now a real button, so the whole strip is
//                                   focusable and Enter-activatable rather than
//                                   only the small Details control.
//   local InlineStat helper       → Chip (`.chip` + `.lbl` + `.num`)
//   status Pill                   → CellChip tone, and each expanded check row
//                                   carries its own tone on the SURFACE so a
//                                   failing check is findable without reading
//                                   every row.

import { useMemo, useState } from "react";
import { Callout, CellChip, Chip, Sub, cx, type ChipTone } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useConnectLenderHealth } from "@/hooks/useApi";
import type { HealthStatus } from "@/lib/types";

/** Probe status → the chip vocabulary. Was a palette lookup off the theme. */
function statusMeta(status: HealthStatus): { tone: ChipTone; label: string } {
  switch (status) {
    case "ok":
      return { tone: "ok", label: "OK" };
    case "warn":
      return { tone: "warn", label: "WARN" };
    case "fail":
      return { tone: "bad", label: "FAIL" };
  }
}

export function ConnectLenderHealthCard() {
  const { data, isLoading, isError, error } = useConnectLenderHealth();
  const [expanded, setExpanded] = useState(false);

  const attentionCheck = useMemo(() => {
    if (!data) return null;
    return data.checks.find((c) => c.status === "fail") ?? data.checks.find((c) => c.status === "warn") ?? null;
  }, [data]);

  const overall = data ? statusMeta(data.overall) : null;

  return (
    <div className={cx("disc", expanded && "on")}>
      <button
        type="button"
        className="disc-h"
        aria-expanded={expanded}
        // Nothing to open until the probe lands. `.disc-h:disabled` drops the
        // pointer cursor so the row stops promising a click that does nothing.
        disabled={!data}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="row">
          <Icon name="shieldChk" size={14} stroke={2.5} />
          <span className="lbl">Connect Lender — health</span>

          {isLoading ? (
            <Sub>Running checks...</Sub>
          ) : isError ? (
            <span className="statusline c-bad">
              Probe failed: {(error as Error)?.message ?? "Unknown error"}. The
              /admin/connect-lender/health endpoint may not be deployed yet.
            </span>
          ) : data ? (
            <>
              {overall ? <CellChip tone={overall.tone}>{overall.label}</CellChip> : null}
              <InlineStat label="Active lenders" value={data.active_lender_count} />
              <InlineStat label="Connectable" value={data.eligible_loan_count} />
              <InlineStat label="Connected" value={data.connected_loan_count} />
              {attentionCheck ? (
                <CellChip tone={statusMeta(attentionCheck.status).tone} className="trunc">
                  <Icon name="alert" size={12} />
                  {attentionCheck.name}
                </CellChip>
              ) : null}
            </>
          ) : null}
        </span>

        {data ? (
          <span className="row">
            <Sub>{expanded ? "Hide" : "Details"}</Sub>
            <Icon name={expanded ? "chevU" : "chevD"} size={11} />
          </span>
        ) : null}
      </button>

      {expanded && data ? (
        <div className="disc-b grid cols-auto">
          {data.checks.map((c) => {
            const sc = statusMeta(c.status);
            return (
              // The tone rides on the row itself: a band of check rows is
              // scanned, and a chip inside each one means reading all of them
              // to find the one that is failing. `.callout` is also
              // top-aligned, which `.itemrow` is not — the detail line wraps.
              <Callout key={c.name} tone={sc.tone} icon={<CellChip tone={sc.tone}>{sc.label}</CellChip>}>
                <b>{c.name}</b>
                <div className="sub">{c.detail}</div>
              </Callout>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function InlineStat({ label, value }: { label: string; value: number }) {
  return (
    <Chip>
      <span className="lbl">{label}</span>
      <b className="num">{value}</b>
    </Chip>
  );
}
