"use client";

// The client's signing screen — the interface the desk approved from the
// preview, now real.
//
// Signature box by default: the client the rep just walked through the
// agreement starts at the pen, not in a wall of text. The full agreement is
// one toggle away, top right, showing the text extracted from the exact PDF
// that gets signed. "Draw instead" opens a pad rotated 90 degrees so the
// phone's long axis becomes the signature's width — no rotation-lock
// fumbling, the biggest surface the device can give.
//
// Typed or drawn, the evidence is identical. And this screen only exists
// behind the client's own room link: the rep's app has no signing surface,
// so a signature can never be taken on the rep's device.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/lib/api";

export type RoomContract = {
  id: string;
  key: string;
  title: string;
  status: string;
  agreement_text: string;
  commission_note: string | null;
};

const ui = {
  card: {
    border: "1px solid #d8dee9", borderRadius: 14, padding: 16,
    background: "#fff", marginBottom: 12,
  } as React.CSSProperties,
  lbl: {
    fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase",
    color: "#5a6675", fontWeight: 700,
  } as React.CSSProperties,
  sub: { color: "#5a6675", fontSize: 12.5, lineHeight: 1.55 } as React.CSSProperties,
  btn: {
    border: "1px solid #1b4b9e", background: "#1b4b9e", color: "#fff",
    borderRadius: 11, padding: "12px 16px", fontWeight: 680, fontSize: 14,
    cursor: "pointer", width: "100%",
  } as React.CSSProperties,
  ghost: {
    background: "none", border: 0, color: "#1b4b9e", fontWeight: 650,
    fontSize: 13, cursor: "pointer", width: "100%", padding: 8,
    textDecoration: "underline",
  } as React.CSSProperties,
  seg: {
    display: "inline-flex", background: "#eef1f6", borderRadius: 9,
    padding: 2, gap: 2, marginLeft: "auto",
  } as React.CSSProperties,
  segBtn: (on: boolean): React.CSSProperties => ({
    border: 0, background: on ? "#fff" : "transparent",
    color: on ? "#1b4b9e" : "#5a6675", fontWeight: 650, fontSize: 12,
    padding: "6px 12px", borderRadius: 7, cursor: "pointer",
    boxShadow: on ? "0 1px 2px rgba(15,23,32,.08)" : "none",
  }),
  consent: { display: "flex", gap: 9, alignItems: "flex-start", marginTop: 10, cursor: "pointer" } as React.CSSProperties,
};

function LandscapePad({
  onUse,
  onCancel,
}: {
  onUse: (dataUrl: string) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  const toCanvas = useCallback((e: PointerEvent | React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    // The canvas is CSS-rotated 90°: screen-down maps to canvas +x and
    // screen-left to canvas +y.
    return {
      x: ((e.clientY - r.top) * canvas.width) / r.height,
      y: ((r.right - e.clientX) * canvas.height) / r.width,
    };
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#14265c";
  }, []);

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "#fff", zIndex: 80,
      }}
    >
      <div
        style={{
          position: "absolute", top: 0, left: 0,
          width: "100vh", height: "100vw",
          transform: "rotate(90deg) translateY(-100%)",
          transformOrigin: "top left",
          display: "flex", flexDirection: "column", padding: "18px 22px 16px",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
          <b style={{ fontSize: 16 }}>Draw your signature</b>
          <span style={ui.sub}>hold your phone as it is and draw sideways</span>
        </div>
        <canvas
          ref={canvasRef}
          width={1400}
          height={480}
          style={{
            flex: 1, marginTop: 10, width: "100%",
            border: "1.5px dashed #c7ceda", borderRadius: 14,
            background: "#f8fafc", touchAction: "none",
          }}
          onPointerDown={(e) => {
            drawing.current = true;
            last.current = toCanvas(e);
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const ctx = canvasRef.current!.getContext("2d")!;
            const p = toCanvas(e);
            ctx.beginPath();
            ctx.moveTo(last.current.x, last.current.y);
            ctx.lineTo(p.x, p.y);
            ctx.stroke();
            last.current = p;
            setHasInk(true);
          }}
          onPointerUp={() => {
            drawing.current = false;
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            type="button"
            style={{ ...ui.btn, width: "auto", background: "#fff", color: "#353e4a", borderColor: "#c7ceda" }}
            onClick={() => {
              const c = canvasRef.current!;
              c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
              setHasInk(false);
            }}
          >
            Clear
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            style={{ ...ui.btn, width: "auto", background: "#fff", color: "#353e4a", borderColor: "#c7ceda" }}
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!hasInk}
            style={{ ...ui.btn, width: "auto", opacity: hasInk ? 1 : 0.45 }}
            onClick={() => onUse(canvasRef.current!.toDataURL("image/png"))}
          >
            Use this signature
          </button>
        </div>
      </div>
    </div>
  );
}

export function ContractSigner({
  token,
  passcode,
  contract,
  onDone,
  onClose,
}: {
  token: string;
  passcode: string;
  contract: RoomContract;
  onDone: () => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"sign" | "agreement">("sign");
  const [typedName, setTypedName] = useState("");
  const [adopt, setAdopt] = useState(false);
  const [esign, setEsign] = useState(false);
  const [drawn, setDrawn] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedMsg, setSignedMsg] = useState<string | null>(null);

  const armed = typedName.trim().length > 1 && adopt && esign && !busy;

  async function sign() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/dealer-os/public/room/${token}/contracts/${contract.id}/sign`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            passcode,
            typed_name: typedName.trim(),
            esign_consent: true,
            signature_data_url: drawn,
          }),
        },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(body?.detail || "The signature could not be recorded.");
      }
      const out = (await res.json()) as { message: string };
      setSignedMsg(out.message);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The signature could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  if (signedMsg) {
    return (
      <section style={ui.card}>
        <div style={{ textAlign: "center", padding: "26px 8px" }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: "50%", background: "#e6f4ec",
              color: "#0f7b4f", display: "grid", placeItems: "center",
              fontSize: 25, margin: "0 auto 10px", fontWeight: 800,
            }}
          >
            ✓
          </div>
          <b style={{ fontSize: 16 }}>Signed</b>
          <p style={{ ...ui.sub, marginTop: 6 }}>{signedMsg}</p>
        </div>
      </section>
    );
  }

  return (
    <section style={{ ...ui.card, padding: 0, overflow: "hidden" }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", borderBottom: "1px solid #eef1f6",
        }}
      >
        <b style={{ fontSize: 14 }}>{contract.title}</b>
        <div style={ui.seg}>
          <button type="button" style={ui.segBtn(mode === "sign")} onClick={() => setMode("sign")}>
            Sign
          </button>
          <button
            type="button"
            style={ui.segBtn(mode === "agreement")}
            onClick={() => setMode("agreement")}
          >
            Agreement
          </button>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" style={{ ...ui.ghost, width: "auto", padding: "2px 4px", textDecoration: "none", fontSize: 16 }}>
          ✕
        </button>
      </div>

      {mode === "agreement" ? (
        <div style={{ padding: 14 }}>
          <div
            style={{
              maxHeight: "52vh", overflowY: "auto", fontSize: 12,
              lineHeight: 1.65, color: "#353e4a", whiteSpace: "pre-wrap",
              border: "1px solid #eef1f6", borderRadius: 10, padding: 12,
              background: "#f8fafc",
            }}
          >
            {contract.agreement_text || "The agreement could not be loaded. Ask your representative to resend it."}
          </div>
          <button type="button" style={{ ...ui.btn, marginTop: 12 }} onClick={() => setMode("sign")}>
            Ready — go to signing
          </button>
        </div>
      ) : (
        <div style={{ padding: 14 }}>
          {contract.commission_note && (
            <p style={{ ...ui.sub, margin: "0 0 10px" }}>
              Key term: commission of {contract.commission_note}. Read the full agreement any
              time with the toggle above — what you sign is the entire document.
            </p>
          )}

          <span style={ui.lbl}>Sign as</span>
          <input
            style={{
              width: "100%", border: "1px solid #c7ceda", borderRadius: 9,
              padding: "11px 12px", fontSize: 15, marginTop: 6, fontFamily: "inherit",
            }}
            placeholder="Type your full legal name"
            autoComplete="name"
            value={typedName}
            onChange={(e) => {
              setTypedName(e.target.value);
              setDrawn(null);
            }}
          />

          <div
            style={{
              marginTop: 10, minHeight: 70, borderRadius: 11, padding: 8,
              display: "grid", placeItems: "center", position: "relative",
              border: drawn || typedName.trim() ? "1.5px solid #d6e3f6" : "1.5px dashed #c7ceda",
              background: drawn || typedName.trim() ? "#eef3fb" : "#f8fafc",
            }}
          >
            {drawn ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drawn} alt="Your signature" style={{ maxHeight: 60, maxWidth: "100%" }} />
            ) : typedName.trim() ? (
              <span style={{ fontSize: 20, fontWeight: 650, color: "#14265c", fontStyle: "italic" }}>
                /s/ {typedName.trim()}
              </span>
            ) : (
              <span style={ui.sub}>Your signature appears here</span>
            )}
            {adopt && (drawn || typedName.trim()) && (
              <span
                style={{
                  position: "absolute", right: 8, bottom: 8, width: 20, height: 20,
                  borderRadius: "50%", background: "#0f7b4f", color: "#fff",
                  display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800,
                }}
              >
                ✓
              </span>
            )}
          </div>

          <label style={ui.consent}>
            <input
              type="checkbox"
              checked={adopt}
              onChange={(e) => setAdopt(e.target.checked)}
              style={{ width: 17, height: 17, accentColor: "#1b4b9e", marginTop: 1, flexShrink: 0 }}
            />
            <span style={{ fontSize: 12.5, color: "#353e4a", lineHeight: 1.5 }}>
              I adopt this as my legal signature, and I agree it is the equivalent of my
              handwritten signature on this agreement.
            </span>
          </label>
          <label style={ui.consent}>
            <input
              type="checkbox"
              checked={esign}
              onChange={(e) => setEsign(e.target.checked)}
              style={{ width: 17, height: 17, accentColor: "#1b4b9e", marginTop: 1, flexShrink: 0 }}
            />
            <span style={{ fontSize: 12.5, color: "#353e4a", lineHeight: 1.5 }}>
              I consent to signing electronically and receiving records electronically
              (E-SIGN / UETA). I can request a paper copy at any time.
            </span>
          </label>

          <button
            type="button"
            style={{ ...ui.btn, marginTop: 14, opacity: armed ? 1 : 0.45 }}
            disabled={!armed}
            onClick={sign}
          >
            {busy ? "Signing…" : "Sign the agreement"}
          </button>
          <button type="button" style={ui.ghost} onClick={() => setPadOpen(true)}>
            Draw my signature instead
          </button>
          <p style={{ ...ui.sub, textAlign: "center", margin: "2px 0 0", fontSize: 11.5 }}>
            Signed on your own device, never on your representative&rsquo;s. A copy is emailed
            to you the moment it executes.
          </p>

          {error && (
            <p style={{ ...ui.sub, color: "#b42318", marginTop: 10 }}>{error}</p>
          )}
        </div>
      )}

      {padOpen && (
        <LandscapePad
          onCancel={() => setPadOpen(false)}
          onUse={(dataUrl) => {
            setDrawn(dataUrl);
            setPadOpen(false);
          }}
        />
      )}
    </section>
  );
}
