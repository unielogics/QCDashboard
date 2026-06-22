"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";

type FileRow = { id: string; file_name: string; content_type: string; created_at: string; preview_url?: string | null; download_url?: string | null };
type Note = { id: string; author_name: string; content: string; created_at: string };
type Access = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  share: { recipient_name: string; can_download: boolean; can_add_notes: boolean };
  files: FileRow[];
  notes: Note[];
};

export default function BucketSharePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [passcode, setPasscode] = useState("");
  const [access, setAccess] = useState<Access | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("");

  async function openRoom() {
    setStatus("Checking access...");
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    if (!res.ok) {
      setStatus("Invalid or inactive share link.");
      return;
    }
    setAccess(await res.json());
    setStatus("");
  }

  async function addNote() {
    if (!note.trim()) return;
    const res = await fetch(`${apiBase}/api/v1/buckets/share/${token}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode, content: note }),
    });
    if (!res.ok) {
      setStatus("Could not add note.");
      return;
    }
    setNote("");
    await openRoom();
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#17202a", padding: 24 }}>
      <section style={{ maxWidth: 880, margin: "0 auto", background: "#fff", border: "1px solid #dfe4ea", borderRadius: 10, padding: 22 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Qualified Commercial Secure File Room</h1>
        {!access ? (
          <div style={{ display: "grid", gap: 10, marginTop: 18, maxWidth: 360 }}>
            <input style={field} placeholder="Enter passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <button style={button} onClick={openRoom}>Open file room</button>
          </div>
        ) : (
          <>
            <p style={{ color: "#64748b" }}>Bucket: {access.bucket.name} · Access granted to {access.share.recipient_name}</p>
            <div style={{ display: "grid", gap: 10 }}>
              {access.files.length === 0 ? <p>No files have been shared yet.</p> : access.files.map((f) => (
                <div key={f.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{f.file_name}</div>
                    <div style={{ color: "#64748b", fontSize: 12 }}>Uploaded {new Date(f.created_at).toLocaleDateString()}</div>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {f.preview_url ? <a style={linkButton} href={f.preview_url} target="_blank">Preview</a> : null}
                    {f.download_url ? <a style={linkButton} href={f.download_url} target="_blank">Download</a> : <span style={{ color: "#64748b", fontSize: 13 }}>Download disabled</span>}
                  </div>
                </div>
              ))}
            </div>
            <h2 style={{ fontSize: 16, marginTop: 22 }}>Shared Notes</h2>
            {access.share.can_add_notes ? (
              <div style={{ display: "flex", gap: 8 }}>
                <input style={{ ...field, flex: 1 }} placeholder="Add a note" value={note} onChange={(e) => setNote(e.target.value)} />
                <button style={button} onClick={addNote}>Add</button>
              </div>
            ) : null}
            <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
              {access.notes.map((n) => <div key={n.id} style={{ borderTop: "1px solid #e2e8f0", paddingTop: 8 }}><strong>{n.author_name}</strong>: {n.content}</div>)}
            </div>
          </>
        )}
        {status ? <p style={{ color: "#b45309", fontWeight: 700 }}>{status}</p> : null}
      </section>
    </main>
  );
}

const field = { height: 42, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 12px", font: "inherit", background: "#fff" };
const button = { height: 42, border: "none", borderRadius: 8, padding: "0 14px", font: "inherit", fontWeight: 800, background: "#111827", color: "#fff", cursor: "pointer" };
const linkButton = { ...button, display: "inline-flex", alignItems: "center", textDecoration: "none", height: 34 };
