"use client";

// Shared hand-drawn signature canvas. Extracted from PaymentAuthorizationPanel
// so any e-sign flow (payment authorization, credit-authorization forms, or
// any future "have the client sign X" need) uses the same widget instead of
// duplicating the pointer-event drawing logic.
//
// Exposes an imperative handle (getDataUrl / clear / hasSignature) via ref so
// the parent form controls when to read/clear the signature, same as the
// original inline canvasRef usage.

import { forwardRef, useImperativeHandle, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useTheme } from "@/components/design-system/ThemeProvider";

export type SignaturePadHandle = {
  getDataUrl: () => string;
  clear: () => void;
  hasSignature: () => boolean;
};

export const SignaturePad = forwardRef<SignaturePadHandle, { width?: number; height?: number }>(
  function SignaturePad({ width = 560, height = 150 }, ref) {
    const { t, isDark } = useTheme();
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => canvasRef.current?.toDataURL("image/png") || "",
      clear: () => clearCanvas(canvasRef.current),
      hasSignature: () => hasSignature(canvasRef.current),
    }));

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        onPointerDown={(e) => startDraw(e, canvasRef.current, drawing, isDark)}
        onPointerMove={(e) => moveDraw(e, canvasRef.current, drawing)}
        onPointerUp={() => { drawing.current = false; }}
        onPointerLeave={() => { drawing.current = false; }}
        style={{
          width: "100%",
          height,
          borderRadius: 12,
          border: `1px solid ${t.line}`,
          background: isDark ? "#080A10" : "#F8FAFC",
          touchAction: "none",
        }}
      />
    );
  },
);

function startDraw(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement | null, drawing: { current: boolean }, isDark: boolean) {
  if (!canvas) return;
  drawing.current = true;
  const ctx = canvas.getContext("2d");
  const pos = canvasPoint(event, canvas);
  if (!ctx || !pos) return;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Must contrast against the canvas background above (#080A10 dark / #F8FAFC
  // light) -- a fixed dark stroke was nearly invisible on the dark canvas.
  ctx.strokeStyle = isDark ? "#F8FAFC" : "#111827";
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function moveDraw(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement | null, drawing: { current: boolean }) {
  if (!drawing.current || !canvas) return;
  const ctx = canvas.getContext("2d");
  const pos = canvasPoint(event, canvas);
  if (!ctx || !pos) return;
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function canvasPoint(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
}

function hasSignature(canvas: HTMLCanvasElement | null): boolean {
  if (!canvas) return false;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 0) return true;
  }
  return false;
}

function clearCanvas(canvas: HTMLCanvasElement | null) {
  const ctx = canvas?.getContext("2d");
  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
