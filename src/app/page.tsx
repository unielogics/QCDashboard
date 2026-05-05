"use client";

import Link from "next/link";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, KPI, Pill, SectionLabel, StageBadge } from "@/components/design-system/primitives";
import { Icon } from "@/components/design-system/Icon";
import { useAITasks, useCalendar, useLoans } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { QC_FMT } from "@/components/design-system/tokens";

const STAGE_KEYS = ["prequalified", "collecting_docs", "lender_connected", "processing", "closing", "funded"] as const;
const STAGE_LABELS = ["Prequalified", "Collecting Docs", "Lender Connected", "Processing", "Closing", "Funded"];

export default function DashboardPage() {
  const { t } = useTheme();
  const profile = useActiveProfile();
  const { data: loans = [] } = useLoans();
  const { data: tasks = [] } = useAITasks();
  const { data: events = [] } = useCalendar();

  const fundedYTD = loans.filter((l) => l.stage === "funded").reduce((s, l) => s + Number(l.amount), 0);
  const pipelineValue = loans.filter((l) => l.stage !== "funded").reduce((s, l) => s + Number(l.amount), 0);
  const stageCounts = STAGE_KEYS.map((k) => loans.filter((l) => l.stage === k));

  const today = new Date();
  const greeting =
    today.getHours() < 12 ? "Good morning" : today.getHours() < 18 ? "Good afternoon" : "Good evening";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.6, color: t.ink3, textTransform: "uppercase" }}>
          {today.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })} · 9:41 ET
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 800, color: t.ink, letterSpacing: -1.2, margin: "6px 0 4px" }}>
          {greeting}, {profile.name.split(" ")[0]}.
        </h1>
        <div style={{ fontSize: 13, color: t.ink2 }}>
          {tasks.filter((t) => t.priority === "high").length} high-priority items, {events.length} events today, {loans.length} loans in flight.
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <KPI label="Funded YTD" value={QC_FMT.short(fundedYTD)} delta={22.4} sub="vs 2025" accent={t.profit} />
        <KPI label="Pipeline" value={QC_FMT.short(pipelineValue)} sub={`${loans.length - stageCounts[5].length} loans`} />
        <KPI label="Avg Close" value="23d" delta={-3} deltaSuffix="d" sub="from app to wire" />
        <KPI label="Pull-Through" value="78%" delta={4} sub="last 90d" />
      </div>

      {/* Pipeline at a glance + Today */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 14 }}>
        <Card pad={16}>
          <SectionLabel action={<Link href="/pipeline" style={{ color: t.brand }}>View all →</Link>}>Pipeline at a glance</SectionLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 8 }}>
            {STAGE_KEYS.map((k, i) => (
              <div key={k} style={{ background: t.surface2, borderRadius: 10, padding: 12, border: `1px solid ${t.line}` }}>
                <div style={{ fontSize: 9.5, fontWeight: 700, color: t.ink3, letterSpacing: 1.2, textTransform: "uppercase" }}>
                  {STAGE_LABELS[i]}
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: t.ink, marginTop: 4 }}>{stageCounts[i].length}</div>
                <div style={{ fontSize: 11, color: t.ink3 }}>
                  {QC_FMT.short(stageCounts[i].reduce((s, l) => s + Number(l.amount), 0))}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <SectionLabel>Closing in next 14 days</SectionLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {loans.filter((l) => l.stage === "closing" || l.stage === "processing").slice(0, 5).map((loan) => (
                <Link key={loan.id} href={`/loans/${loan.id}`} style={{
                  display: "grid",
                  gridTemplateColumns: "70px minmax(0,1fr) 100px 130px 80px",
                  alignItems: "center", gap: 12, padding: "10px 12px",
                  borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3 }}>{loan.deal_id}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {loan.address}
                    </div>
                    <div style={{ fontSize: 11.5, color: t.ink3 }}>{loan.type.replace("_", " ")}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, fontFeatureSettings: '"tnum"' }}>{QC_FMT.short(Number(loan.amount))}</div>
                  <div><StageBadge stage={STAGE_KEYS.indexOf(loan.stage)} /></div>
                  <div style={{ fontSize: 11.5, color: t.ink3, whiteSpace: "nowrap" }}>
                    {loan.close_date ? new Date(loan.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </div>
                </Link>
              ))}
              {loans.length === 0 && (
                <div style={{ padding: 16, color: t.ink3, fontSize: 13 }}>
                  No loans yet. Start the backend (`docker compose up`, `alembic upgrade head`, `python -m app.seed`).
                </div>
              )}
            </div>
          </div>
        </Card>

        <Card pad={16}>
          <SectionLabel action={<Link href="/calendar" style={{ color: t.brand }}>Calendar →</Link>}>Today</SectionLabel>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.slice(0, 5).map((ev) => (
              <div key={ev.id} style={{ display: "flex", gap: 12, padding: 10, borderRadius: 10, border: `1px solid ${t.line}` }}>
                <div style={{ width: 56, fontSize: 12, fontWeight: 700, color: t.ink2 }}>
                  {new Date(ev.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: false })}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{ev.title}</div>
                  <div style={{ fontSize: 11.5, color: t.ink3 }}>
                    {ev.who} {ev.duration_min ? `· ${ev.duration_min}m` : ""}
                  </div>
                </div>
                {ev.priority === "high" && <Pill bg={t.dangerBg} color={t.danger}>High</Pill>}
              </div>
            ))}
            {events.length === 0 && <div style={{ padding: 8, color: t.ink3, fontSize: 13 }}>No events.</div>}
          </div>

          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            <SectionLabel>AI tasks</SectionLabel>
            {tasks.slice(0, 4).map((task) => (
              <Link key={task.id} href="/ai-inbox" style={{ display: "flex", gap: 8, padding: 10, borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface2 }}>
                <Icon name="sparkles" size={14} style={{ color: t.petrol }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: t.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {task.title}
                  </div>
                  <div style={{ fontSize: 11, color: t.ink3 }}>{task.source}</div>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
