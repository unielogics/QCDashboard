"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiBase } from "@/lib/api";

type RequestedDoc = { id: string; name: string; category?: string | null; required: boolean; status: string };
type RequestInfo = {
  bucket: { name: string; client_name?: string | null; purpose?: string | null };
  recipient_name: string;
  allow_notes: boolean;
  requires_passcode: boolean;
  requested_documents: RequestedDoc[];
};

export default function BucketRequestPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [info, setInfo] = useState<RequestInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [docId, setDocId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [passcode, setPasscode] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    fetch(`${apiBase}/api/v1/buckets/request/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Link unavailable")))
      .then((data) => { setInfo(data); setName(data.recipient_name || ""); setStatus(""); })
      .catch((e) => setStatus(e.message));
  }, [token]);

  async function upload() {
    if (!file || !info || !name.trim()) return;
    setStatus("Preparing upload...");
    const init = await fetch(`${apiBase}/api/v1/buckets/request/${token}/upload-init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requested_document_id: docId || null,
        file_name: file.name,
        content_type: file.type || "application/octet-stream",
        size_bytes: file.size,
        uploader_name: name,
        uploader_email: email || null,
        passcode: passcode || null,
      }),
    });
    if (!init.ok) throw new Error("Upload could not start");
    const payload = await init.json();
    setStatus("Uploading file...");
    const put = await fetch(payload.upload_url, { method: "PUT", body: file, headers: payload.required_headers });
    if (!put.ok) throw new Error(`S3 upload failed (${put.status})`);
    setStatus("Completing...");
    const done = await fetch(`${apiBase}/api/v1/buckets/request/${token}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: payload.file_id, note }),
    });
    if (!done.ok) throw new Error("Upload completed but could not be confirmed");
    setFile(null);
    setNote("");
    setStatus("Upload complete. Your documents have been securely submitted.");
  }

  return (
    <main style={{ minHeight: "100vh", background: "#f6f7f9", color: "#17202a", padding: 24 }}>
      <section style={{ maxWidth: 760, margin: "0 auto", background: "#fff", border: "1px solid #dfe4ea", borderRadius: 10, padding: 22 }}>
        <h1 style={{ margin: 0, fontSize: 24 }}>Secure Document Upload</h1>
        {info ? (
          <>
            <p style={{ color: "#64748b" }}>{info.bucket.name}{info.bucket.purpose ? ` · ${info.bucket.purpose}` : ""}</p>
            <div style={{ display: "grid", gap: 10 }}>
              <input style={field} placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
              <input style={field} placeholder="Email optional" value={email} onChange={(e) => setEmail(e.target.value)} />
              {info.requires_passcode ? <input style={field} placeholder="Passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} /> : null}
              <select style={field} value={docId} onChange={(e) => setDocId(e.target.value)}>
                <option value="">General upload</option>
                {info.requested_documents.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <input style={field} type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {info.allow_notes ? <textarea style={{ ...field, height: 90, paddingTop: 10 }} placeholder="Notes optional" value={note} onChange={(e) => setNote(e.target.value)} /> : null}
              <button style={button} onClick={() => upload().catch((e) => setStatus(e.message))} disabled={!file || !name.trim()}>Complete Upload</button>
            </div>
            <h2 style={{ fontSize: 15, marginTop: 22 }}>Requested Documents</h2>
            <ul style={{ paddingLeft: 20, color: "#475569" }}>
              {info.requested_documents.map((d) => <li key={d.id}>{d.name}{d.required ? " (required)" : ""}</li>)}
            </ul>
          </>
        ) : null}
        {status ? <p style={{ color: "#0f766e", fontWeight: 700 }}>{status}</p> : null}
      </section>
    </main>
  );
}

const field = { height: 42, border: "1px solid #cbd5e1", borderRadius: 8, padding: "0 12px", font: "inherit", background: "#fff" };
const button = { height: 44, border: "none", borderRadius: 8, padding: "0 14px", font: "inherit", fontWeight: 800, background: "#111827", color: "#fff", cursor: "pointer" };
