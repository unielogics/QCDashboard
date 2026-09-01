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
import { cx } from "@/components/ds";

export type SignaturePadHandle = {
  getDataUrl: () => string;
  clear: () => void;
  hasSignature: () => boolean;
};

export const SignaturePad = forwardRef<
  SignaturePadHandle,
  {
    width?: number;
    height?: number;
    /**
     * Draw in light ink, for a pad sitting on a dark ground.
     *
     * This is the one thing in the app that genuinely cannot be a class: the
     * stroke goes INTO A BITMAP, so its colour has to be a JS value. It used
     * to come from `useTheme().isDark` — which is why this component was the
     * last thing keeping the theme hook alive after dark mode was removed.
     * The public intake rooms are dark-ground and are the reason the branch
     * survives at all; everything in the console leaves it off.
     */
    inkOnDark?: boolean;
    onSignatureChange?: (hasSignature: boolean) => void;
    ariaLabel?: string;
  }
>(
  function SignaturePad({
    width = 560,
    height = 150,
    inkOnDark = false,
    onSignatureChange,
    ariaLabel = "Draw your signature",
  }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawing = useRef(false);

    useImperativeHandle(ref, () => ({
      getDataUrl: () => canvasRef.current?.toDataURL("image/png") || "",
      clear: () => {
        clearCanvas(canvasRef.current);
        onSignatureChange?.(false);
      },
      hasSignature: () => hasSignature(canvasRef.current),
    }), [onSignatureChange]);

    const finishDraw = (event: ReactPointerEvent<HTMLCanvasElement>) => {
      drawing.current = false;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onSignatureChange?.(hasSignature(canvasRef.current));
    };

    return (
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        role="img"
        tabIndex={0}
        aria-label={ariaLabel}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          startDraw(e, canvasRef.current, drawing, inkOnDark);
        }}
        onPointerMove={(e) => moveDraw(e, canvasRef.current, drawing)}
        onPointerUp={finishDraw}
        onPointerCancel={finishDraw}
        className={cx("sigpad", inkOnDark && "dark")}
        // `height` is a prop and drives the CSS box as well as the canvas
        // bitmap, so the two cannot diverge.
        style={{ height, touchAction: "none" }}
      />
    );
  },
);

function startDraw(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement | null, drawing: { current: boolean }, inkOnDark: boolean) {
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
  ctx.strokeStyle = inkOnDark ? "#F8FAFC" : "#111827";
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function moveDraw(event: ReactPointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement | null, drawing: { current: boolean }) {
  if (!drawing.current || !canvas) return;
  event.preventDefault();
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
