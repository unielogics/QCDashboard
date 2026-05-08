"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Icon } from "@/components/design-system/Icon";
import { Pill } from "@/components/design-system/primitives";
import { useUI } from "@/store/ui";
import { useGlobalSearch } from "@/hooks/useApi";

export default function GlobalSearch() {
  const { t } = useTheme();
  const open = useUI((s) => s.searchOpen);
  const setOpen = useUI((s) => s.setSearchOpen);
  const router = useRouter();
  const [q, setQ] = useState("");
  const { data: groups } = useGlobalSearch(q);

  useEffect(() => { if (!open) setQ(""); }, [open]);

  if (!open) return null;

  return (
    <div onClick={() => setOpen(false)} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 100,
      display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "10vh",
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: 720, maxHeight: "70vh", background: t.surface, border: `1px solid ${t.line}`, borderRadius: 14,
        boxShadow: t.shadowLg, display: "flex", flexDirection: "column", overflow: "hidden",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderBottom: `1px solid ${t.line}` }}>
          <Icon name="search" size={16} style={{ color: t.ink3 }} />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search loans, borrowers, documents, messages…"
            style={{ flex: 1, fontSize: 15, color: t.ink, background: "transparent", border: "none", outline: "none" }}
          />
          <button onClick={() => setOpen(false)} style={{ color: t.ink3 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {q.trim().length < 2 && (
            <div style={{ padding: "32px 24px", color: t.ink3, fontSize: 13, textAlign: "center" }}>
              <Icon name="search" size={28} style={{ color: t.ink4, marginBottom: 8 }} />
              <div style={{ fontWeight: 600, color: t.ink2 }}>
                Type at least 2 characters to search.
              </div>
              <div style={{ fontSize: 12, color: t.ink3, marginTop: 4 }}>
                Results group by client across loans, documents, messages, events, and AI tasks.
              </div>
            </div>
          )}
          {groups?.length === 0 && q.trim().length >= 2 && (
            <div style={{ padding: 24, color: t.ink3, fontSize: 13, textAlign: "center" }}>
              No matches for &ldquo;{q}&rdquo;.
            </div>
          )}
          {groups?.map((g) => (
            <div key={g.client_id} style={{ padding: "12px 8px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", color: t.ink3, marginBottom: 6 }}>
                {g.client_name}
              </div>
              {g.items.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setOpen(false);
                    if (item.kind === "loan") router.push(`/loans/${item.id}`);
                    else if (item.kind === "client") router.push(`/clients/${item.id}`);
                    else if (item.kind === "doc" && item.loan_id) router.push(`/loans/${item.loan_id}`);
                    else if (item.kind === "message") router.push("/messages");
                    else if (item.kind === "event") router.push("/calendar");
                    else if (item.kind === "aiTask") router.push("/ai-inbox");
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 12px", textAlign: "left", borderRadius: 8,
                    border: "none", background: "transparent", cursor: "pointer",
                  }}
                >
                  <Pill>{item.kind}</Pill>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{item.title}</div>
                    {item.subtitle && <div style={{ fontSize: 12, color: t.ink3 }}>{item.subtitle}</div>}
                  </div>
                  <Icon name="chevR" size={13} style={{ color: t.ink4 }} />
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* Footer keyboard hints */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            padding: "10px 16px",
            borderTop: `1px solid ${t.line}`,
            background: t.surface2,
            fontSize: 11,
            color: t.ink3,
          }}
        >
          <KbdHint t={t} keys={["↑", "↓"]} label="Navigate" />
          <KbdHint t={t} keys={["↵"]} label="Open" />
          <KbdHint t={t} keys={["Esc"]} label="Close" />
          <span style={{ marginLeft: "auto", fontStyle: "italic" }}>
            Searches loans, clients, documents, messages, events, AI tasks
          </span>
        </div>
      </div>
    </div>
  );
}

function KbdHint({ t, keys, label }: { t: ReturnType<typeof useTheme>["t"]; keys: string[]; label: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "inline-flex", gap: 3 }}>
        {keys.map((k) => (
          <kbd
            key={k}
            style={{
              padding: "1px 6px",
              borderRadius: 4,
              border: `1px solid ${t.line}`,
              background: t.surface,
              fontSize: 10,
              fontWeight: 700,
              color: t.ink2,
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
            }}
          >
            {k}
          </kbd>
        ))}
      </span>
      {label}
    </span>
  );
}
