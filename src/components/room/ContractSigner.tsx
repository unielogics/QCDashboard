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
//
// Styling: this is a BARE route — no app shell, no sidebar, a client who has
// no account. globals.css + app-extras.css are loaded from the root layout,
// so the panel/button/consent vocabulary is available here and the screen
// reads as the same product as the console. What stays inline is the pen
// itself: the rotated pad, the signature well and its state tints, and the
// agreement's document scroller.

import { useCallback, useEffect, useRef, useState } from "react";
import { apiBase } from "@/lib/api";
import { Btn, Field, IconBtn, Input, Panel, Seg, StatusLine, cx } from "@/components/ds";

export type RoomContract = {
  id: string;
  key: string;
  title: string;
  status: string;
  agreement_text: string;
  commission_note: string | null;
};

type ContractSignResult = {
  message: string;
  execution_status: "executed" | "delivery_warning";
  pdf_sha256: string | null;
  download_url: string | null;
};

// The pen's ink. Deliberately a literal and not a token: the drawn stroke is
// rasterised into the PNG that becomes evidence, and the typed "/s/" rendering
// has to look like the same pen as the drawn one.
const INK = "#14265c";

export function LandscapePad({
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
    ctx.strokeStyle = INK;
  }, []);

  return (
    // Bespoke geometry throughout: a viewport-filling overlay whose contents
    // are rotated 90° so the phone's long axis becomes the signature's width.
    // Nothing in the sheet describes a rotated surface.
    <div
      // `color` is here for the same reason `.panel` carries one: the pad is a
      // white surface on a route whose page sets a near-white ink for its dark
      // ground, and the instruction above the canvas inherits it.
      style={{
        position: "fixed", inset: 0, background: "var(--surface)",
        color: "var(--ink)", zIndex: 80,
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
        <div className="row">
          {/* Sized up from the 14px body: this is the only instruction on a
              screen that is otherwise all pen. */}
          <b style={{ fontSize: 16 }}>Draw your signature</b>
          <span className="sub">hold your phone as it is and draw sideways</span>
        </div>
        <canvas
          ref={canvasRef}
          width={1400}
          height={480}
          // The drawing surface itself: it has to grow into whatever the
          // rotated box leaves, and touchAction:none is what stops the browser
          // scrolling the page instead of inking.
          style={{
            flex: 1, marginTop: 10, width: "100%",
            border: "1.5px dashed var(--line2)", borderRadius: 14,
            background: "var(--sunken2)", touchAction: "none",
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
        <div className="row mt">
          <Btn
            onClick={() => {
              const c = canvasRef.current!;
              c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
              setHasInk(false);
            }}
          >
            Clear
          </Btn>
          <span className="grow" />
          <Btn onClick={onCancel}>Cancel</Btn>
          {/* `.btn:disabled` carries the dimmed, not-yet-available state the
              old inline opacity did. */}
          <Btn variant="pri" disabled={!hasInk} onClick={() => onUse(canvasRef.current!.toDataURL("image/png"))}>
            Use this signature
          </Btn>
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
  const [signedResult, setSignedResult] = useState<ContractSignResult | null>(null);

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
      const out = (await res.json()) as ContractSignResult;
      setSignedResult(out);
      setSignedMsg(out.message);
      if (out.download_url) {
        const anchor = document.createElement("a");
        anchor.href = out.download_url;
        anchor.download = `${contract.key}-executed.pdf`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The signature could not be recorded.");
    } finally {
      setBusy(false);
    }
  }

  if (signedMsg) {
    return (
      <Panel className="mb">
        {/* Bespoke: the one celebratory mark in the product. A round success
            badge at this size exists nowhere else in the sheet. */}
        <div style={{ textAlign: "center", padding: "26px 8px" }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: "50%", background: "var(--ok-tint)",
              color: "var(--ok)", display: "grid", placeItems: "center",
              fontSize: 25, margin: "0 auto 10px", fontWeight: 800,
            }}
          >
            ✓
          </div>
          <b style={{ fontSize: 16 }}>Signed</b>
          <p className="sub mt">{signedMsg}</p>
          {signedResult?.execution_status === "delivery_warning" ? (
            <StatusLine tone="warn" className="mt">
              Email delivery needs attention. Your signed PDF remains available below.
            </StatusLine>
          ) : null}
          {signedResult?.download_url ? (
            <a
              className="btn pri mt"
              href={signedResult.download_url}
              download={`${contract.key}-executed.pdf`}
            >
              Download signed PDF
            </a>
          ) : null}
          {signedResult?.pdf_sha256 ? (
            <p className="sub mt" style={{ overflowWrap: "anywhere" }}>
              PDF SHA-256: {signedResult.pdf_sha256}
            </p>
          ) : null}
        </div>
      </Panel>
    );
  }

  return (
    <Panel
      className="mb"
      title={contract.title}
      actions={
        <>
          <Seg
            as="tabs"
            ariaLabel="Signing view"
            value={mode}
            onChange={setMode}
            options={[
              { value: "sign", label: "Sign" },
              { value: "agreement", label: "Agreement" },
            ]}
          />
          <IconBtn onClick={onClose} aria-label="Close">
            ✕
          </IconBtn>
        </>
      }
    >
      {mode === "agreement" ? (
        <>
          {/* Bespoke: the agreement is the legal artifact, not a message and not
              a card. A fixed-height well with its own smaller type so a long
              document reads as a document and scrolls inside the panel. */}
          <div
            style={{
              maxHeight: "52vh", overflowY: "auto", fontSize: 12,
              lineHeight: 1.65, color: "var(--ink2)", whiteSpace: "pre-wrap",
              border: "1px solid var(--line)", borderRadius: 10, padding: 12,
              background: "var(--sunken2)",
            }}
          >
            {contract.agreement_text || "The agreement could not be loaded. Ask your representative to resend it."}
          </div>
          <Btn variant="pri" className="ctrl-block mt" onClick={() => setMode("sign")}>
            Ready — go to signing
          </Btn>
        </>
      ) : (
        <>
          {contract.commission_note && (
            <p className="sub mb">
              Key term: commission of {contract.commission_note}. Read the full agreement any
              time with the toggle above — what you sign is the entire document.
            </p>
          )}

          <Field label="Sign as">
            <Input
              placeholder="Type your full legal name"
              autoComplete="name"
              value={typedName}
              onChange={(e) => {
                setTypedName(e.target.value);
                setDrawn(null);
              }}
            />
          </Field>

          {/* Bespoke, and data-derived: the signature well is empty (dashed,
              waiting) or filled (solid, accent-tinted) depending on what the
              signer has actually produced. */}
          <div
            className="mt"
            style={{
              minHeight: 70, borderRadius: 11, padding: 8,
              display: "grid", placeItems: "center", position: "relative",
              border: drawn || typedName.trim() ? "1.5px solid var(--accent-200)" : "1.5px dashed var(--line2)",
              background: drawn || typedName.trim() ? "var(--accent-100)" : "var(--sunken2)",
            }}
          >
            {drawn ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drawn} alt="Your signature" style={{ maxHeight: 60, maxWidth: "100%" }} />
            ) : typedName.trim() ? (
              // The typed signature has to look like ink, not like a form field.
              <span style={{ fontSize: 20, fontWeight: 650, color: INK, fontStyle: "italic" }}>
                /s/ {typedName.trim()}
              </span>
            ) : (
              <span className="sub">Your signature appears here</span>
            )}
            {adopt && (drawn || typedName.trim()) && (
              <span
                // Adopted: a green tick pinned into the corner of the well.
                style={{
                  position: "absolute", right: 8, bottom: 8, width: 20, height: 20,
                  borderRadius: "50%", background: "var(--ok)", color: "#fff",
                  display: "grid", placeItems: "center", fontSize: 12, fontWeight: 800,
                }}
              >
                ✓
              </span>
            )}
          </div>

          {/* `.consent` is the sheet's consent-capture surface: body-size text
              (never shrunk to fit), a 20px checkbox, and `.on` when accepted. */}
          <div className={cx("consent", "mt", adopt && "on")}>
            <label>
              <input
                type="checkbox"
                checked={adopt}
                onChange={(e) => setAdopt(e.target.checked)}
              />
              <span className="ctext">
                I adopt this as my legal signature, and I agree it is the equivalent of my
                handwritten signature on this agreement.
              </span>
            </label>
          </div>
          <div className={cx("consent", esign && "on")}>
            <label>
              <input
                type="checkbox"
                checked={esign}
                onChange={(e) => setEsign(e.target.checked)}
              />
              <span className="ctext">
                I consent to signing electronically and receiving records electronically
                (E-SIGN / UETA). I can request a paper copy at any time.
              </span>
            </label>
          </div>

          <Btn
            variant="pri"
            className="ctrl-block mt"
            disabled={!armed}
            onClick={sign}
          >
            {busy ? "Signing…" : "Sign the agreement"}
          </Btn>
          {/* A text action, full width, with a finger-sized target under the
              primary button. `.linky` owns everything but the padding. */}
          <button
            type="button"
            className="linky ctrl-block"
            style={{ padding: 8 }}
            onClick={() => setPadOpen(true)}
          >
            Draw my signature instead
          </button>
          <p className="sub" style={{ textAlign: "center" }}>
            Signed on your own device, never on your representative&rsquo;s. A copy is emailed
            to you the moment it executes.
          </p>

          {error && <StatusLine tone="bad" className="mt">{error}</StatusLine>}
        </>
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
    </Panel>
  );
}
