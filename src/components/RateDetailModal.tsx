"use client";

// Expanded rate detail — 30-day chart + estimated-rate breakdown +
// (super-admin only) inline editor for the lender spread on this series.
//
// Opens when the user clicks any card in the dashboard "Today's market rates"
// widget. The 7-day sparkline lives on the card itself; coming here gives
// you the wider window the user spec calls out.
//
// ── Design-system migration note ──────────────────────────────────────
// Restyled onto globals.css/app-extras.css classes. The hand-rolled centred
// overlay became ds/Drawer — the one dialog shape — which is a strict superset
// of what was here: Escape-to-close and backdrop-click-to-close both survive
// (`closeOnBackdrop` defaults to true, matching the old scrim's onClick), and
// body-scroll lock, focus-into-dialog and focus-restore-on-close are gained.
//
// `ariaLabel` is passed explicitly because the visible title CHANGES: it reads
// as the raw series id until /fred/series/{id} resolves and then becomes the
// human label. The announced name stays `"<seriesId> detail"` — exactly the
// aria-label the old markup carried — so the dialog does not rename itself
// under a screen-reader user mid-load.
//
// Every hook, the SUPER_ADMIN gate on the spread editor, the loading state,
// the "not enough history" state, the exact Save disabled predicate and the
// three-way delta tone are the ones that were here before. Public props
// (`seriesId`, `productLabel`, `onClose`) are untouched.

import { useEffect, useState } from "react";
import { Sparkline } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { Btn, CellChip, Field, Input, Kpi, Panel, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useCurrentUser, useFredSeriesDetail, useUpsertLenderSpread } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

interface Props {
  seriesId: string | null;
  productLabel: string | null;
  onClose: () => void;
}

export function RateDetailModal({ seriesId, productLabel, onClose }: Props) {
  const { data: user } = useCurrentUser();
  const { data: detail, isLoading } = useFredSeriesDetail(seriesId, 30);
  const upsertSpread = useUpsertLenderSpread();
  const [editing, setEditing] = useState(false);
  const [draftBps, setDraftBps] = useState<number>(0);
  const [draftNotes, setDraftNotes] = useState("");

  useEffect(() => {
    if (!seriesId) {
      setEditing(false);
      setDraftBps(0);
      setDraftNotes("");
    }
  }, [seriesId]);

  useEffect(() => {
    if (detail) setDraftBps(detail.spread_bps);
  }, [detail?.spread_bps]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape-to-close is now owned by Drawer, which also locks body scroll and
  // returns focus to whatever opened the dialog.

  if (!seriesId) return null;

  const isSuperAdmin = user?.role === Role.SUPER_ADMIN;
  const sparkValues = (detail?.history_30d ?? [])
    .map((h) => h.value)
    .filter((v): v is number => v != null);

  const submitSpread = async () => {
    if (!seriesId) return;
    await upsertSpread.mutateAsync({
      series_id: seriesId,
      spread_bps: draftBps,
      notes: draftNotes.trim() || null,
    });
    setEditing(false);
    setDraftNotes("");
  };

  return (
    <Drawer
      open
      onClose={onClose}
      ariaLabel={`${seriesId} detail`}
      title={detail?.label ?? seriesId}
      sub={
        <>
          {productLabel ?? seriesId}
          {detail?.description ? ` · ${detail.description}` : ""}
        </>
      }
      width="lg"
    >
      <div className="grid">
        {isLoading && !detail && <p className="sub">Loading 30-day series…</p>}

        {detail && (
          <>
            {/* Estimated rate breakdown */}
            <Panel title="Estimated interest rate">
              {/* Bespoke five-track row: three figures separated by two
                  glyph-width columns. `.cg` is the twelve-column PAGE grid and
                  is the wrong tool for a `A + B = C` equation. */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 24px 1fr 24px 1fr",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <Kpi
                  label="Index (FRED)"
                  value={detail.current_value != null ? `${detail.current_value.toFixed(3)}%` : "—"}
                  sub={detail.current_date ? `as of ${new Date(detail.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : undefined}
                />
                {/* Operator glyphs: only the centring is inline — no class
                    owns text-align: center, and this is part of the bespoke
                    track above. */}
                <div className="sub" style={{ textAlign: "center" }}>+</div>
                <Kpi
                  label="Lender spread"
                  value={`${(detail.spread_bps / 100).toFixed(2)}%`}
                  sub={`${detail.spread_bps} bps`}
                />
                <div className="sub" style={{ textAlign: "center" }}>=</div>
                <Kpi
                  label="Estimated rate"
                  value={detail.estimated_rate != null ? `${detail.estimated_rate.toFixed(3)}%` : "—"}
                  sub="customer-facing"
                />
              </div>
            </Panel>

            {/* 30-day chart */}
            <Panel title="History" actions={<span className="lbl">30-day</span>}>
              {sparkValues.length >= 2 ? (
                // Fixed chart geometry — a measured drawing, not a layout box.
                <Sparkline data={sparkValues} color="var(--accent)" width={680} height={140} fill />
              ) : (
                <p className="sub">
                  Not enough history yet. The first FRED refresh populates ~30 days of data.
                </p>
              )}
              <div className="row mt">
                <span className="sub num">
                  {detail.history_30d[0]?.date
                    ? new Date(detail.history_30d[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "—"}
                </span>
                <span className="sp" />
                <span className="sub num">
                  {detail.history_30d.at(-1)?.date
                    ? new Date(detail.history_30d.at(-1)!.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    : "—"}
                </span>
              </div>
            </Panel>

            {/* Spread editor (super-admin only) */}
            {isSuperAdmin && (
              <Panel
                title="Lender spread"
                actions={
                  !editing && (
                    <Btn size="sm" onClick={() => setEditing(true)}>
                      <Icon name="pencil" size={12} /> Edit spread
                    </Btn>
                  )
                }
              >
                {editing ? (
                  <div className="grid g10">
                    <Field
                      label="Spread (basis points)"
                      hint={`${(draftBps / 100).toFixed(2)}% added to index`}
                    >
                      <Input
                        type="number"
                        className="num"
                        value={draftBps}
                        onChange={(e) => setDraftBps(Number(e.target.value) || 0)}
                        min={-1000}
                        max={2000}
                        step={5}
                      />
                    </Field>
                    <Field label="Notes (audit trail)">
                      <Textarea
                        value={draftNotes}
                        onChange={(e) => setDraftNotes(e.target.value)}
                        rows={2}
                        placeholder="e.g. Q2 repricing — tightened spread on bridge"
                        // No class owns `resize`; the original pinned it to
                        // vertical so the textarea can't be dragged over the
                        // dialog's own gutter.
                        style={{ resize: "vertical" }}
                      />
                    </Field>
                    <div className="row">
                      <span className="sp" />
                      <Btn
                        onClick={() => {
                          setEditing(false);
                          setDraftBps(detail.spread_bps);
                          setDraftNotes("");
                        }}
                      >
                        Cancel
                      </Btn>
                      <Btn
                        variant="pri"
                        onClick={submitSpread}
                        disabled={upsertSpread.isPending || draftBps === detail.spread_bps && !draftNotes.trim()}
                      >
                        <Icon name="check" size={13} />
                        {upsertSpread.isPending ? "Saving…" : "Save spread"}
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <p className="sub">
                    Current spread: <b>{detail.spread_bps} bps</b>{" "}
                    ({(detail.spread_bps / 100).toFixed(2)}%). Updates create a new audit-trail row;
                    the most-recent row is the active spread.
                  </p>
                )}
              </Panel>
            )}

            {/* Delta vs previous business day — tone is derived from the
                number, so the class is picked at render time. */}
            {detail.delta_bps != null && (
              <div className="row">
                <span className="sp" />
                <CellChip
                  tone={detail.delta_bps < 0 ? "ok" : detail.delta_bps > 0 ? "bad" : "mut"}
                >
                  {detail.delta_bps > 0 ? "+" : ""}
                  {detail.delta_bps} bps vs prior
                </CellChip>
              </div>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}
