"use client";

import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { useUI } from "@/store/ui";
import { useAITasks } from "@/hooks/useApi";

export default function AIRail() {
  const { t } = useTheme();
  const open = useUI((s) => s.aiOpen);
  const setOpen = useUI((s) => s.setAiOpen);
  const { data: tasks } = useAITasks();

  if (!open) return <div />;

  return (
    <aside style={{
      borderLeft: `1px solid ${t.line}`,
      background: t.surface,
      display: "flex", flexDirection: "column", overflow: "hidden",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${t.line}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: t.petrolSoft, display: "inline-flex", alignItems: "center", justifyContent: "center", color: t.petrol }}>
            <Icon name="sparkles" size={14} />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 800, color: t.ink }}>QC Co-pilot</div>
            <div style={{ fontSize: 10.5, color: t.ink3, fontWeight: 700 }}>
              ● ONLINE · {tasks?.length ?? 0} QUEUED
            </div>
          </div>
        </div>
        <button onClick={() => setOpen(false)} style={{ color: t.ink3 }}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ background: t.surface2, padding: 14, borderRadius: 12, border: `1px solid ${t.line}` }}>
          <div style={{ fontSize: 13, color: t.ink2 }}>
            I&rsquo;m watching your pipeline. {tasks?.length ?? 0} action{(tasks?.length ?? 0) === 1 ? " is" : "s are"} queued. Want me to take any?
          </div>
        </div>

        {tasks?.slice(0, 3).map((task) => (
          <div key={task.id} style={{ background: t.surface2, padding: 12, borderRadius: 12, border: `1px solid ${t.line}` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: t.ink3, textTransform: "uppercase", letterSpacing: 1 }}>{task.source}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: t.ink, marginTop: 4 }}>{task.title}</div>
            <div style={{ fontSize: 12, color: t.ink2, marginTop: 4 }}>{task.summary}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: 12, borderTop: `1px solid ${t.line}`, display: "flex", gap: 8 }}>
        <input placeholder="Ask co-pilot…" style={{
          flex: 1, padding: "10px 12px", borderRadius: 10,
          background: t.surface2, border: `1px solid ${t.line}`, color: t.ink, fontSize: 13,
        }} />
        <button style={{ width: 40, height: 40, borderRadius: 10, background: t.petrol, color: "#fff" }}>
          <Icon name="bolt" size={14} />
        </button>
      </div>
    </aside>
  );
}
