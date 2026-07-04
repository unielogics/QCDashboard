"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { useTheme } from "@/components/design-system/ThemeProvider";
import { Card, SectionLabel } from "@/components/design-system/primitives";
import { qcBtn, qcBtnPrimary } from "@/components/design-system/buttons";
import {
  useCompletePaymentAuthorization,
  useCreateSetupIntent,
  useCurrentUser,
  usePaymentAuthorizationStatus,
  useStartPaymentAuthorization,
} from "@/hooks/useApi";
import type { BillingAddress, PaymentAuthorizationStartResponse } from "@/lib/types";

const EMPTY_BILLING: BillingAddress = {
  name: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "US",
};

export function PaymentAuthorizationPanel() {
  const { t } = useTheme();
  const status = usePaymentAuthorizationStatus();
  const publishableKey = status.data?.stripe_publishable_key;
  const stripePromise = useMemo<Promise<Stripe | null> | null>(
    () => (publishableKey ? loadStripe(publishableKey) : null),
    [publishableKey],
  );

  if (!publishableKey || !stripePromise) {
    return (
      <Card pad={20}>
        <SectionLabel>Payment authorization required</SectionLabel>
        <p style={{ color: t.ink2, fontSize: 13, lineHeight: 1.6, margin: 0 }}>
          Stripe is not configured yet. Contact Qualified Commercial before running credit.
        </p>
      </Card>
    );
  }

  return (
    <Elements stripe={stripePromise}>
      <PaymentAuthorizationInner />
    </Elements>
  );
}

function PaymentAuthorizationInner() {
  const { t, isDark } = useTheme();
  const { data: user } = useCurrentUser();
  const status = usePaymentAuthorizationStatus();
  const start = useStartPaymentAuthorization();
  const setup = useCreateSetupIntent();
  const complete = useCompletePaymentAuthorization();
  const stripe = useStripe();
  const elements = useElements();
  const [started, setStarted] = useState<PaymentAuthorizationStartResponse | null>(null);
  const [billing, setBilling] = useState<BillingAddress>(EMPTY_BILLING);
  const [typedName, setTypedName] = useState("");
  const [esignConsent, setEsignConsent] = useState(false);
  const [paymentConsent, setPaymentConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    setBilling((prev) => ({
      ...prev,
      name: prev.name || user?.name || "",
      email: prev.email || user?.email || "",
    }));
    if (!typedName && user?.name) setTypedName(user.name);
  }, [typedName, user?.email, user?.name]);

  const begin = async () => {
    setError(null);
    try {
      setStarted(await start.mutateAsync());
    } catch (err) {
      setError(readErrorMessage(err));
    }
  };

  const submit = async () => {
    setError(null);
    const active = started ?? (await start.mutateAsync());
    if (!started) setStarted(active);
    const card = elements?.getElement(CardElement);
    if (!stripe || !card) {
      setError("Stripe is still loading. Try again.");
      return;
    }
    if (!typedName.trim() || !esignConsent || !paymentConsent || !hasSignature(canvasRef.current)) {
      setError("Complete the consents, legal name, and signature.");
      return;
    }
    if (!billing.name || !billing.line1 || !billing.city || !billing.state || !billing.postal_code) {
      setError("Complete the billing address.");
      return;
    }
    try {
      const setupIntent = await setup.mutateAsync({ authorization_id: active.authorization.id, billing });
      const result = await stripe.confirmCardSetup(setupIntent.client_secret, {
        payment_method: {
          card,
          billing_details: {
            name: billing.name,
            email: billing.email || undefined,
            phone: billing.phone || undefined,
            address: {
              line1: billing.line1,
              line2: billing.line2 || undefined,
              city: billing.city,
              state: billing.state,
              postal_code: billing.postal_code,
              country: billing.country || "US",
            },
          },
        },
      });
      if (result.error) {
        setError(result.error.message || "Stripe card setup failed.");
        return;
      }
      await complete.mutateAsync({
        authorization_id: active.authorization.id,
        setup_intent_id: setupIntent.setup_intent_id,
        typed_name: typedName,
        esign_consent: esignConsent,
        payment_terms_consent: paymentConsent,
        signature_data_url: canvasRef.current?.toDataURL("image/png") || "",
        billing,
        device_metadata: { platform: "web", flow: "desktop_credit_gate" },
      });
      await status.refetch();
    } catch (err) {
      setError(readErrorMessage(err));
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <Card pad={20}>
        <SectionLabel>Payment authorization required</SectionLabel>
        <p style={{ color: t.ink2, fontSize: 13, lineHeight: 1.6, marginTop: 0 }}>
          Credit pulls and credit-derived terms unlock after you sign the payment authorization and securely save a card through Stripe. The app remains available for non-credit workflows.
        </p>
        {!started ? (
          <button onClick={begin} style={qcBtnPrimary(t)} disabled={start.isPending}>
            Begin authorization
          </button>
        ) : (
          <p style={{ color: t.ink3, fontSize: 12, lineHeight: 1.55, margin: 0, maxHeight: 120, overflow: "auto" }}>
            {started.document.text}
          </p>
        )}
      </Card>

      {started ? (
        <>
          <Card pad={20}>
            <SectionLabel>Consent</SectionLabel>
            <CheckRow label="I consent to electronic records and signatures under E-SIGN/UETA." checked={esignConsent} onClick={() => setEsignConsent((v) => !v)} />
            <CheckRow label="I authorize QC - Qualified Commercial LLC to keep this payment method on file for approved funding-file expenses." checked={paymentConsent} onClick={() => setPaymentConsent((v) => !v)} />
          </Card>

          <Card pad={20}>
            <SectionLabel>Signer</SectionLabel>
            <Field label="Legal name" value={typedName} onChange={setTypedName} />
            <div style={{ marginTop: 10, fontSize: 11, color: t.ink3, fontWeight: 700 }}>Draw signature</div>
            <canvas
              ref={canvasRef}
              width={560}
              height={150}
              onPointerDown={(e) => startDraw(e, canvasRef.current, drawing)}
              onPointerMove={(e) => moveDraw(e, canvasRef.current, drawing)}
              onPointerUp={() => { drawing.current = false; }}
              onPointerLeave={() => { drawing.current = false; }}
              style={{ width: "100%", height: 150, borderRadius: 12, border: `1px solid ${t.line}`, background: isDark ? "#080A10" : "#F8FAFC", touchAction: "none" }}
            />
            <button onClick={() => clearCanvas(canvasRef.current)} style={{ ...qcBtn(t), marginTop: 10 }}>Clear signature</button>
          </Card>

          <Card pad={20}>
            <SectionLabel>Billing address</SectionLabel>
            <Field label="Billing name" value={billing.name} onChange={(v) => setBilling((p) => ({ ...p, name: v }))} />
            <Field label="Email" value={billing.email || ""} onChange={(v) => setBilling((p) => ({ ...p, email: v }))} />
            <Field label="Address" value={billing.line1} onChange={(v) => setBilling((p) => ({ ...p, line1: v }))} />
            <Field label="Unit optional" value={billing.line2 || ""} onChange={(v) => setBilling((p) => ({ ...p, line2: v }))} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10 }}>
              <Field label="City" value={billing.city} onChange={(v) => setBilling((p) => ({ ...p, city: v }))} />
              <Field label="State" value={billing.state} onChange={(v) => setBilling((p) => ({ ...p, state: v.toUpperCase().slice(0, 2) }))} />
            </div>
            <Field label="ZIP" value={billing.postal_code} onChange={(v) => setBilling((p) => ({ ...p, postal_code: v }))} />
          </Card>

          <Card pad={20}>
            <SectionLabel>Secure card</SectionLabel>
            <p style={{ color: t.ink3, fontSize: 12.5, lineHeight: 1.5, marginTop: 0 }}>
              Card details are collected by Stripe. Qualified Commercial stores only the Stripe token and card metadata.
            </p>
            <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface2 }}>
              <CardElement options={{ style: { base: { color: t.ink, fontSize: "15px", "::placeholder": { color: t.ink3 } } } }} />
            </div>
          </Card>

          {error ? <div style={{ color: t.danger, fontSize: 13, fontWeight: 700 }}>{error}</div> : null}
          <button onClick={submit} style={qcBtnPrimary(t)} disabled={setup.isPending || complete.isPending || start.isPending}>
            Complete authorization
          </button>
        </>
      ) : null}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useTheme();
  return (
    <label style={{ display: "block", marginTop: 10 }}>
      <div style={{ fontSize: 11, color: t.ink3, fontWeight: 800, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5 }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", borderRadius: 10, border: `1px solid ${t.line}`, background: t.surface2, color: t.ink, padding: "11px 12px", fontSize: 14 }} />
    </label>
  );
}

function CheckRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  const { t } = useTheme();
  return (
    <button type="button" onClick={onClick} style={{ all: "unset", cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 0" }}>
      <span style={{ width: 20, height: 20, borderRadius: 6, border: `1px solid ${checked ? t.petrol : t.lineStrong}`, background: checked ? t.petrol : "transparent", color: checked ? "#07110F" : "transparent", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 900 }}>✓</span>
      <span style={{ color: t.ink2, fontSize: 13, lineHeight: 1.45 }}>{label}</span>
    </button>
  );
}

function startDraw(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement | null, drawing: React.MutableRefObject<boolean>) {
  if (!canvas) return;
  drawing.current = true;
  const ctx = canvas.getContext("2d");
  const pos = canvasPoint(event, canvas);
  if (!ctx || !pos) return;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#111827";
  ctx.beginPath();
  ctx.moveTo(pos.x, pos.y);
}

function moveDraw(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement | null, drawing: React.MutableRefObject<boolean>) {
  if (!drawing.current || !canvas) return;
  const ctx = canvas.getContext("2d");
  const pos = canvasPoint(event, canvas);
  if (!ctx || !pos) return;
  ctx.lineTo(pos.x, pos.y);
  ctx.stroke();
}

function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) {
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

function readErrorMessage(err: unknown): string {
  const body = (err as { body?: unknown })?.body;
  if (body && typeof body === "object" && "detail" in body) {
    const detail = (body as { detail?: unknown }).detail;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object" && "message" in detail) {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  return err instanceof Error ? err.message : "Authorization failed. Please retry.";
}
