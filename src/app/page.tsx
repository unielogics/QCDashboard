"use client";

// Dashboard — operator overview. Layout matches design/screens/dashboard.jsx:
// max-width 1400px centered, greeting + header action buttons, 4-column KPI
// row, two-column body (Pipeline at a glance + Today), AI tasks + Top
// exposures row. All KPIs sourced from /reports/dashboard so nothing is
// hardcoded.

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useAITasks,
  useCalendar,
  useClients,
  useCurrentUser,
  useDashboardReport,
  useLoans,
} from "@/hooks/useApi";
import { QC_FMT } from "@/components/design-system/tokens";
import type { AITask, CalendarEvent, Loan } from "@/lib/types";
import { Role } from "@/lib/enums.generated";

const STAGE_KEYS = [
  "prequalified",
  "collecting_docs",
  "lender_connected",
  "processing",
  "closing",
  "funded",
] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

export default function DashboardPage() {
  const { t } = useTheme();
  const { data: user } = useCurrentUser();
  const { data: loans = [] } = useLoans();
  const { data: tasks = [] } = useAITasks();
  const { data: events = [] } = useCalendar();
  const { data: clients = [] } = useClients();
  const { data: report } = useDashboardReport();

  // Greeting personalization: prefer the real user's first name, fall back to
  // the Clerk-known email-prefix once /auth/me resolves, then to a soft default
  // while the request is in flight (avoids a jarring "Hi there." flash).
  const firstName = (() => {
    if (!user) return null; // hide the greeting entirely while loading
    const n = (user.name ?? "").trim();
    if (n && n !== user.email) return n.split(" ")[0];
    if (user.email) return user.email.split("@")[0].split(".")[0];
    return null;
  })();
  const today = new Date();
  const greeting =
    today.getHours() < 12 ? "Good morning" : today.getHours() < 18 ? "Good afternoon" : "Good evening";

  const highPriority = tasks.filter((task) => task.priority === "high" && task.status === "pending");
  const inFlight = loans.filter((l) => l.stage !== "funded");
  const todayEvents = events.filter((e) => isSameDay(new Date(e.starts_at), today));

  const stageCounts =
    report?.by_stage ??
    STAGE_KEYS.map((k) => ({
      stage: k,
      count: loans.filter((l) => l.stage === k).length,
      value: loans.filter((l) => l.stage === k).reduce((s, l) => s + Number(l.amount), 0),
    }));

  const isClient = user?.role === Role.CLIENT;

  const datelineDate = today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const datelineTime = today.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  return (
    <div
      style={{
        padding: 24,
        display: "flex",
        flexDirection: "column",
        gap: 20,
        maxWidth: 1400,
        margin: "0 auto",
      }}
    >
      {/* Greeting + header action buttons */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16 }}>
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.petrol,
              letterSpacing: 1.6,
              textTransform: "uppercase",
            }}
          >
            {datelineDate} · {datelineTime} ET
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 30, fontWeight: 700, letterSpacing: -0.8, color: t.ink }}>
            {firstName ? `${greeting}, ${firstName}.` : greeting + "."}
          </h1>
          <div style={{ fontSize: 14, color: t.ink2, marginTop: 4 }}>
            {highPriority.length} high-priority items, {todayEvents.length} events today, {inFlight.length} loans in flight.
          </div>
        </div>
        {!isClient && (
          <div style={{ display: "flex", gap: 8 }}>
            <Link href="/pipeline" style={{ ...qcBtn(t), textDecoration: "none" }}>
              <Icon name="layers" size={14} /> Open Pipeline
            </Link>
            <Link href="/ai-inbox" style={{ ...qcBtnPrimary(t), textDecoration: "none" }}>
              <Icon name="bolt" size={14} /> Review AI Tasks
            </Link>
          </div>
        )}
      </div>

      {/* KPI row — 4 tiles, all sourced from /reports/dashboard */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI
          label="Funded YTD"
          value={report ? QC_FMT.short(report.funded_ytd) : "—"}
          delta={report?.funded_ytd_delta ?? undefined}
          sub="vs. prior year"
          icon="dollar"
          accent={t.profit}
        />
        <KPI
          label="Pipeline"
          value={report ? QC_FMT.short(report.pipeline_value) : "—"}
          sub={report ? `${report.pipeline_count} loans` : undefined}
          icon="layers"
        />
        <KPI
          label="Avg close"
          value={report?.avg_close_days ? `${report.avg_close_days}d` : "—"}
          delta={report?.avg_close_delta ?? undefined}
          deltaSuffix="d"
          sub="from app to wire"
          icon="audit"
        />
        <KPI
          label="Pull-through"
          value={report?.pull_through != null ? `${(report.pull_through * 100).toFixed(0)}%` : "—"}
          delta={
            report?.pull_through_delta != null
              ? Math.round(report.pull_through_delta * 100)
              : undefined
          }
          sub="last 90d"
          icon="trend"
        />
      </div>

      <TodaysOverduePanel tasks={tasks} events={events} loans={loans} />

      {/* Pipeline at a glance + Today */}
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/pipeline" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                View all <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            Pipeline at a glance
          </SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
            {stageCounts.slice(0, 5).map((s, i) => (
              <Link
                key={s.stage}
                href="/pipeline"
                style={{
                  background: t.surface2,
                  border: `1px solid ${t.line}`,
                  borderRadius: 10,
                  padding: 12,
                  textDecoration: "none",
                }}
              >
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: t.ink3,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {STAGE_LABELS[i]}
                </div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: t.ink,
                    marginTop: 4,
                    fontFeatureSettings: '"tnum"',
                  }}
                >
                  {s.count}
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2, fontFeatureSettings: '"tnum"' }}>
                  {QC_FMT.short(Number(s.value))}
                </div>
              </Link>
            ))}
          </div>

          <div style={{ height: 16 }} />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: t.ink3,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 10,
            }}
          >
            Closing in next 14 days
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {loans
              .filter((l) => l.stage === "closing" || l.stage === "processing")
              .slice(0, 5)
              .map((loan) => (
                <Link
                  key={loan.id}
                  href={`/loans/${loan.id}`}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "70px minmax(0, 1fr) 90px 130px 90px 24px",
                    gap: 12,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: `1px solid ${t.line}`,
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "ui-monospace, SF Mono, monospace",
                      fontSize: 11,
                      color: t.ink3,
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {loan.deal_id}
                  </span>
                  <div style={{ minWidth: 0, overflow: "hidden" }}>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: t.ink,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {loan.address}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: t.ink3,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {loan.type.replace("_", " ")}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      color: t.ink,
                      fontWeight: 700,
                      fontFeatureSettings: '"tnum"',
                      whiteSpace: "nowrap",
                      textAlign: "right",
                    }}
                  >
                    {QC_FMT.short(Number(loan.amount))}
                  </div>
                  <StageBadge stage={STAGE_KEYS.indexOf(loan.stage)} />
                  <div style={{ fontSize: 11.5, color: t.ink2, fontWeight: 600, whiteSpace: "nowrap" }}>
                    {loan.close_date
                      ? `Close ${new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                      : "—"}
                  </div>
                  <Icon name="chevR" size={14} style={{ color: t.ink4 }} />
                </Link>
              ))}
            {inFlight.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
                No loans in flight yet. Create one from the Pipeline page.
              </div>
            )}
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/calendar" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Calendar <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            Today
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayEvents.length === 0 && (
              <div style={{ fontSize: 12.5, color: t.ink3 }}>No events scheduled for today.</div>
            )}
            {todayEvents.slice(0, 6).map((ev) => {
              const k = ev.kind;
              const color = k === "closing" ? t.profit : k === "doc" ? t.warn : k === "ai" ? t.petrol : t.brand;
              const bg = k === "closing" ? t.profitBg : k === "doc" ? t.warnBg : k === "ai" ? t.petrolSoft : t.brandSoft;
              return (
                <div
                  key={ev.id}
                  style={{
                    display: "flex",
                    gap: 10,
                    alignItems: "flex-start",
                    padding: 10,
                    borderRadius: 9,
                    border: `1px solid ${t.line}`,
                    background: ev.priority === "high" ? bg : "transparent",
                  }}
                >
                  <div
                    style={{
                      minWidth: 56,
                      fontFamily: "ui-monospace, SF Mono, monospace",
                      fontSize: 12,
                      fontWeight: 700,
                      color,
                      fontFeatureSettings: '"tnum"',
                    }}
                  >
                    {new Date(ev.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, lineHeight: 1.4 }}>{ev.title}</div>
                    <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>
                      {ev.who ?? "—"}
                      {ev.duration_min ? ` · ${ev.duration_min}m` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* AI tasks + Top exposures */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/ai-inbox" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Queue <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            AI co-pilot · pending approval
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.filter((task) => task.status === "pending").slice(0, 3).map((task) => (
              <Link
                key={task.id}
                href="/ai-inbox"
                style={{
                  display: "flex",
                  gap: 10,
                  padding: 10,
                  borderRadius: 10,
                  border: `1px solid ${t.line}`,
                  background: t.surface2,
                  textDecoration: "none",
                }}
              >
                <Icon name="bolt" size={14} style={{ color: t.petrol, marginTop: 2 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                    <Pill bg={task.priority === "high" ? t.dangerBg : t.chip} color={task.priority === "high" ? t.danger : t.ink2}>
                      {task.priority}
                    </Pill>
                    <Pill>{task.source}</Pill>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{task.title}</div>
                  <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{task.summary}</div>
                </div>
              </Link>
            ))}
            {tasks.filter((task) => task.status === "pending").length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
                Nothing pending — the co-pilot is caught up.
              </div>
            )}
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel
            action={
              <Link href="/clients" style={{ color: t.petrol, fontWeight: 700, fontSize: 12, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 4 }}>
                Clients <Icon name="arrowR" size={12} />
              </Link>
            }
          >
            Top exposures
          </SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {[...clients]
              .sort((a, b) => Number(b.funded_total) - Number(a.funded_total))
              .slice(0, 5)
              .map((c) => (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 6px",
                    borderBottom: `1px solid ${t.line}`,
                    textDecoration: "none",
                  }}
                >
                  <div
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 999,
                      background: c.avatar_color ?? t.petrol,
                      color: "#fff",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}
                  >
                    {c.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: t.ink3 }}>
                      {c.tier} · {c.funded_count} loans{c.fico ? ` · FICO ${c.fico}` : ""}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>
                      {QC_FMT.short(Number(c.funded_total))}
                    </div>
                    <div style={{ fontSize: 10.5, color: t.ink3 }}>funded</div>
                  </div>
                </Link>
              ))}
            {clients.length === 0 && (
              <div style={{ padding: 16, fontSize: 13, color: t.ink3, textAlign: "center" }}>
                No clients yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

// ── Today's Overdue panel ────────────────────────────────────────────────
function TodaysOverduePanel({ tasks, events, loans }: { tasks: AITask[]; events: CalendarEvent[]; loans: Loan[] }) {
  const { t } = useTheme();
  const now = Date.now();
  const todayEnd = (() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  })();
  const loansByLoanId = Object.fromEntries(loans.map((l) => [l.id, l]));

  const items: Array<{
    key: string;
    kind: "task" | "event";
    urgency: "overdue" | "today" | "soon";
    label: string;
    sub: string;
    href: string;
  }> = [];

  for (const ev of events) {
    const ts = new Date(ev.starts_at).getTime();
    let urgency: "overdue" | "today" | "soon" | null = null;
    if (ts < now) urgency = "overdue";
    else if (ts <= todayEnd) urgency = "today";
    else if (ts <= now + 24 * 60 * 60 * 1000 * 3) urgency = "soon";
    if (!urgency) continue;
    items.push({
      key: `ev-${ev.id}`,
      kind: "event",
      urgency,
      label: ev.title,
      sub: `${new Date(ev.starts_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}${ev.who ? ` · ${ev.who}` : ""}`,
      href: ev.loan_id ? `/loans/${ev.loan_id}` : "/calendar",
    });
  }

  for (const task of tasks) {
    if (task.priority !== "high" || task.status !== "pending") continue;
    const ageH = (now - new Date(task.created_at).getTime()) / (1000 * 60 * 60);
    let urgency: "overdue" | "today" | "soon" = "soon";
    if (ageH > 8) urgency = "overdue";
    else if (ageH > 2) urgency = "today";
    items.push({
      key: `task-${task.id}`,
      kind: "task",
      urgency,
      label: task.title,
      sub: `${task.source} · conf ${(task.confidence * 100).toFixed(0)}%${task.loan_id && loansByLoanId[task.loan_id] ? ` · ${loansByLoanId[task.loan_id].deal_id}` : ""}`,
      href: "/ai-inbox",
    });
  }

  const order = { overdue: 0, today: 1, soon: 2 } as const;
  const ranked = items.sort((a, b) => order[a.urgency] - order[b.urgency]).slice(0, 6);
  if (ranked.length === 0) return null;

  const overdueCount = items.filter((i) => i.urgency === "overdue").length;
  const todayCount = items.filter((i) => i.urgency === "today").length;

  const urgencyStyle = (u: "overdue" | "today" | "soon") => ({
    color: u === "overdue" ? t.danger : u === "today" ? t.warn : t.ink2,
    bg: u === "overdue" ? t.dangerBg : u === "today" ? t.warnBg : t.chip,
  });

  return (
    <Card pad={16} style={{ background: overdueCount > 0 ? t.dangerBg : t.warnBg, borderColor: overdueCount > 0 ? `${t.danger}40` : `${t.warn}40` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: overdueCount > 0 ? t.danger : t.warn,
            color: "#fff",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="bell" size={16} stroke={2.4} />
        </div>
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 13,
              fontWeight: 800,
              color: overdueCount > 0 ? t.danger : t.warn,
              letterSpacing: 0.4,
              textTransform: "uppercase",
            }}
          >
            Needs attention
          </div>
          <div style={{ fontSize: 12, color: t.ink2, marginTop: 1 }}>
            {overdueCount > 0 && (
              <span>
                <strong style={{ color: t.danger }}>{overdueCount} overdue</strong> ·{" "}
              </span>
            )}
            {todayCount > 0 && (
              <span>
                <strong>{todayCount} due today</strong> ·{" "}
              </span>
            )}
            {ranked.length} actionable item{ranked.length > 1 ? "s" : ""} surfaced.
          </div>
        </div>
        <Link
          href="/ai-inbox"
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            background: t.surface,
            color: t.ink2,
            border: `1px solid ${t.line}`,
            fontSize: 12,
            fontWeight: 700,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
          }}
        >
          AI Inbox <Icon name="chevR" size={11} />
        </Link>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
        {ranked.map((item) => {
          const us = urgencyStyle(item.urgency);
          return (
            <Link
              key={item.key}
              href={item.href}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 10,
                padding: "10px 12px",
                borderRadius: 10,
                background: t.surface,
                border: `1px solid ${t.line}`,
                textDecoration: "none",
              }}
            >
              <span
                style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  fontSize: 9.5,
                  fontWeight: 800,
                  background: us.bg,
                  color: us.color,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  whiteSpace: "nowrap",
                  marginTop: 2,
                }}
              >
                {item.urgency}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 700,
                    color: t.ink,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {item.label}
                </div>
                <div style={{ fontSize: 11, color: t.ink3, marginTop: 2 }}>{item.sub}</div>
              </div>
              <Icon name="chevR" size={13} style={{ color: t.ink4, marginTop: 4, flexShrink: 0 }} />
            </Link>
          );
        })}
      </div>
    </Card>
  );
}
