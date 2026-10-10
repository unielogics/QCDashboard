"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, Field, Input, PageHeader, Panel, StatusLine } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import type { User } from "@/lib/types";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import {
  clearPendingCapitalReadinessHandoff,
  pendingCapitalReadinessIdempotencyKey,
  readPendingCapitalReadinessHandoff,
  type CapitalReadinessDiagnosticHandoff,
  type CapitalReadinessIntakePrefill,
} from "@/lib/capitalReadinessHandoff";
import type { ApplicationCapitalReadinessSnapshot } from "@/lib/capitalReadiness";

type ClaimResponse = {
  intake_id: string;
  profile_id: string;
  created: boolean;
  communication_locale: "en" | "es";
  readiness: ApplicationCapitalReadinessSnapshot;
};

export function CapitalReadinessClaimGate({ user }: { user: User }) {
  const api = useAuthedApi();
  const router = useRouter();
  const [pending, setPending] = useState<CapitalReadinessIntakePrefill | null>(null);
  const [checked, setChecked] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [consented, setConsented] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    const stored = readPendingCapitalReadinessHandoff();
    setPending(stored?.answers.businessType === "main_street" ? stored : null);
    setChecked(true);
  }, []);

  if (!checked || !pending) return null;
  const es = pending.locale === "es";
  const normalizedPhone = normalizePhone(phone);
  const canSubmit = businessName.trim().length > 1 && normalizedPhone !== null && consented && !busy;

  async function claim() {
    if (!pending || !canSubmit) return;
    const idempotencyKey = pendingCapitalReadinessIdempotencyKey();
    if (!idempotencyKey) {
      setError(es ? "Este navegador no permite guardar el identificador seguro de la solicitud." : "This browser could not retain the secure request identifier.");
      return;
    }
    const { verification_status: _verificationStatus, ...diagnostic } = pending;
    setBusy(true);
    setError(null);
    setConflict(false);
    try {
      const result = await api<ClaimResponse>("/buckets/client/intakes/capital-readiness/claim", {
        method: "POST",
        body: JSON.stringify({
          idempotency_key: idempotencyKey,
          capital_readiness_diagnostic: diagnostic satisfies CapitalReadinessDiagnosticHandoff,
          business_name: businessName.trim(),
          phone: normalizedPhone,
          full_name: user.name?.trim() || undefined,
          terms_accepted: true,
          privacy_accepted: true,
          terms_version: TERMS_VERSION,
          privacy_version: PRIVACY_VERSION,
        }),
      });
      clearPendingCapitalReadinessHandoff();
      router.replace(`/client/dealer-intakes?intake=${encodeURIComponent(result.intake_id)}`);
    } catch (reason) {
      if (reason instanceof ApiError && reason.status === 409) {
        setConflict(true);
        setError(es ? "Ya existe una solicitud activa de Main Street. No reemplazamos ese expediente." : "An active Main Street application already exists. We did not replace that file.");
      } else {
        setError(reason instanceof Error ? reason.message : es ? "No se pudo abrir la solicitud." : "The application could not be opened.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bareshell capital-readiness-claim-gate">
      <div className="grid" style={{ width: "min(680px, 100%)" }}>
        <div>
          <span className="eyebrow">{es ? "Preparación de capital" : "Capital Readiness"}</span>
          <PageHeader
            title={es ? "Abra su solicitud de Main Street" : "Open your Main Street application"}
            lede={es ? "Conserve su diagnóstico como información autodeclarada y continúe en un expediente seguro." : "Carry your diagnostic forward as self-reported information and continue in a secure application file."}
          />
        </div>
        <Panel>
          <div className="grid g10">
            <StatusLine tone="warn">
              {es ? "El resultado del navegador no es una aprobación. QC volverá a calcular la preparación con evidencia verificada y revisión humana." : "The browser result is not an approval. QC will recalculate readiness from verified evidence and human review."}
            </StatusLine>
            <Field label={es ? "Nombre legal del negocio" : "Legal business name"} req>
              <Input value={businessName} autoComplete="organization" autoFocus onChange={(event) => setBusinessName(event.target.value)} />
            </Field>
            <Field label={es ? "Teléfono de contacto" : "Contact phone"} hint={es ? "QC puede usar este número para comunicarse sobre este expediente." : "QC may use this number to contact you about this file."} req>
              <Input value={phone} type="tel" inputMode="tel" autoComplete="tel" onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <label className="capital-readiness-claim-consent">
              <input type="checkbox" checked={consented} onChange={(event) => setConsented(event.target.checked)} />
              <span>
                {es ? "Autorizo a QualifiedCommercial a crear un expediente seguro con mis respuestas autodeclaradas y a contactarme sobre esta solicitud. Acepto los " : "I authorize QualifiedCommercial to create a secure file from my self-reported answers and contact me about this application. I accept the "}
                <Link href="/terms" target="_blank">{es ? "Términos" : "Terms"}</Link>
                {es ? " y la " : " and "}
                <Link href="/privacy" target="_blank">{es ? "Política de Privacidad" : "Privacy Policy"}</Link>.
              </span>
            </label>
            {error ? <StatusLine tone="bad">{error}</StatusLine> : null}
            <div className="row end" style={{ gap: 8 }}>
              {conflict ? <Btn onClick={() => { setPending(null); router.replace("/client/dealer-intakes"); }}>{es ? "Abrir solicitud existente" : "Open existing application"}</Btn> : null}
              <Btn variant="pri" onClick={() => void claim()} disabled={!canSubmit}>{busy ? (es ? "Abriendo…" : "Opening…") : (es ? "Abrir solicitud segura" : "Open secure application")}</Btn>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 11 && digits.length <= 15) return `+${digits}`;
  return null;
}
