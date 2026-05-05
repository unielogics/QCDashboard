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
            placeholder="Search loans, clients, documents, messages…"
            style={{ flex: 1, fontSize: 15, color: t.ink, background: "transparent", border: "none", outline: "none" }}
          />
          <button onClick={() => setOpen(false)} style={{ color: t.ink3 }}>
            <Icon name="x" size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 8 }}>
          {q.trim().length < 2 && (
            <div style={{ padding: 24, color: t.ink3, fontSize: 13 }}>
              Type at least 2 characters to search. Results group by client.
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
                  }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", padding: "10px 12px", textAlign: "left", borderRadius: 8,
                  }}
                >
                  <Pill>{item.kind}</Pill>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: t.ink }}>{item.title}</div>
                    {item.subtitle && <div style={{ fontSize: 12, color: t.ink3 }}>{item.subtitle}</div>}
                  </div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
