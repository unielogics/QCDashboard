"use client";

// Expanded rate detail — 30-day chart + estimated-rate breakdown +
// (super-admin only) inline editor for the lender spread on this series.
//
// Opens when the user clicks any card in the dashboard "Today's market rates"
// widget. The 7-day sparkline lives on the card itself; coming here gives
// you the wider window the user spec calls out.

import { useEffect, useState } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, Pill, SectionLabel, Sparkline } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import { useCurrentUser, useFredSeriesDetail, useUpsertLenderSpread } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";

interface Props {
  seriesId: string | null;
  productLabel: string | null;
  onClose: () => void;
}

export function RateDetailModal({ seriesId, productLabel, onClose }: Props) {
  const { t } = useTheme();
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

  useEffect(() => {
    if (!seriesId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seriesId, onClose]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${seriesId} detail`}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(6, 7, 11, 0.55)",
        backdropFilter: "blur(2px)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 720,
          maxHeight: "92vh",
          overflowY: "auto",
          background: t.surface,
          borderRadius: 16,
          boxShadow: t.shadowLg,
          border: `1px solid ${t.line}`,
        }}
      >
        <div
          style={{
            padding: "16px 20px",
            borderBottom: `1px solid ${t.line}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.6,
                textTransform: "uppercase",
                color: t.petrol,
              }}
            >
              {productLabel ?? seriesId}
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.ink, marginTop: 2 }}>
              {detail?.label ?? seriesId}
            </div>
            {detail?.description && (
              <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>{detail.description}</div>
            )}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              all: "unset",
              cursor: "pointer",
              width: 30,
              height: 30,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              color: t.ink2,
            }}
          >
            <Icon name="x" size={15} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 18 }}>
          {isLoading && !detail && (
            <div style={{ fontSize: 13, color: t.ink3 }}>Loading 30-day series…</div>
          )}

          {detail && (
            <>
              {/* Estimated rate breakdown */}
              <Card pad={16}>
                <SectionLabel>Estimated interest rate</SectionLabel>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 24px 1fr 24px 1fr",
                    gap: 12,
                    alignItems: "center",
                  }}
                >
                  <Breakdown
                    t={t}
                    label="Index (FRED)"
                    value={detail.current_value != null ? `${detail.current_value.toFixed(3)}%` : "—"}
                    sub={detail.current_date ? `as of ${new Date(detail.current_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : undefined}
                  />
                  <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, color: t.ink3 }}>+</div>
                  <Breakdown
                    t={t}
                    label="Lender spread"
                    value={`${(detail.spread_bps / 100).toFixed(2)}%`}
                    sub={`${detail.spread_bps} bps`}
                  />
                  <div style={{ textAlign: "center", fontSize: 18, fontWeight: 700, color: t.ink3 }}>=</div>
                  <Breakdown
                    t={t}
                    label="Estimated rate"
                    value={detail.estimated_rate != null ? `${detail.estimated_rate.toFixed(3)}%` : "—"}
                    sub="customer-facing"
                    accent={t.petrol}
                  />
                </div>
              </Card>

              {/* 30-day chart */}
              <Card pad={16}>
                <SectionLabel
                  action={
                    <span style={{ fontSize: 11, color: t.ink3, fontWeight: 700, letterSpacing: 1.2, textTransform: "uppercase" }}>
                      30-day
                    </span>
                  }
                >
                  History
                </SectionLabel>
                {sparkValues.length >= 2 ? (
                  <Sparkline data={sparkValues} color={t.spark} width={680} height={140} fill />
                ) : (
                  <div style={{ fontSize: 12, color: t.ink3, padding: 24, textAlign: "center" }}>
                    Not enough history yet. The first FRED refresh populates ~30 days of data.
                  </div>
                )}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 11,
                    color: t.ink3,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  <span>
                    {detail.history_30d[0]?.date
                      ? new Date(detail.history_30d[0].date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                  <span>
                    {detail.history_30d.at(-1)?.date
                      ? new Date(detail.history_30d.at(-1)!.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                      : "—"}
                  </span>
                </div>
              </Card>

              {/* Spread editor (super-admin only) */}
              {isSuperAdmin && (
                <Card pad={16}>
                  <SectionLabel
                    action={
                      !editing && (
                        <button
                          onClick={() => setEditing(true)}
                          style={{
                            ...qcBtn(t),
                            padding: "5px 10px",
                            fontSize: 11.5,
                          }}
                        >
                          <Icon name="pencil" size={12} /> Edit spread
                        </button>
                      )
                    }
                  >
                    Lender spread
                  </SectionLabel>

                  {editing ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <Label t={t}>Spread (basis points)</Label>
                        <input
                          type="number"
                          value={draftBps}
                          onChange={(e) => setDraftBps(Number(e.target.value) || 0)}
                          min={-1000}
                          max={2000}
                          step={5}
                          style={inputStyle(t)}
                        />
                        <div style={{ fontSize: 11, color: t.ink3, marginTop: 4 }}>
                          {(draftBps / 100).toFixed(2)}% added to index
                        </div>
                      </div>
                      <div>
                        <Label t={t}>Notes (audit trail)</Label>
                        <textarea
                          value={draftNotes}
                          onChange={(e) => setDraftNotes(e.target.value)}
                          rows={2}
                          placeholder="e.g. Q2 repricing — tightened spread on bridge"
                          style={{ ...inputStyle(t), resize: "vertical" }}
                        />
                      </div>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        <button
                          onClick={() => {
                            setEditing(false);
                            setDraftBps(detail.spread_bps);
                            setDraftNotes("");
                          }}
                          style={qcBtn(t)}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={submitSpread}
                          disabled={upsertSpread.isPending || draftBps === detail.spread_bps && !draftNotes.trim()}
                          style={qcBtnPrimary(t)}
                        >
                          <Icon name="check" size={13} />
                          {upsertSpread.isPending ? "Saving…" : "Save spread"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 12.5, color: t.ink2, lineHeight: 1.6 }}>
                      Current spread: <strong style={{ color: t.ink }}>{detail.spread_bps} bps</strong>{" "}
                      ({(detail.spread_bps / 100).toFixed(2)}%). Updates create a new audit-trail row;
                      the most-recent row is the active spread.
                    </div>
                  )}
                </Card>
              )}

              {/* Delta vs previous business day */}
              {detail.delta_bps != null && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <Pill
                    bg={detail.delta_bps < 0 ? t.profitBg : detail.delta_bps > 0 ? t.dangerBg : t.chip}
                    color={detail.delta_bps < 0 ? t.profit : detail.delta_bps > 0 ? t.danger : t.ink2}
                  >
                    {detail.delta_bps > 0 ? "+" : ""}
                    {detail.delta_bps} bps vs prior
                  </Pill>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Breakdown({
  t,
  label,
  value,
  sub,
  accent,
}: {
  t: ReturnType<typeof useTheme>["t"];
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          color: t.ink3,
          letterSpacing: 1.0,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: accent ?? t.ink,
          marginTop: 4,
          fontFeatureSettings: '"tnum"',
          letterSpacing: -0.4,
        }}
      >
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Label({ t, children }: { t: ReturnType<typeof useTheme>["t"]; children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: t.ink3,
        letterSpacing: 1.0,
        textTransform: "uppercase",
        marginBottom: 6,
      }}
    >
      {children}
    </div>
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
    fontFeatureSettings: '"tnum"',
  };
}
