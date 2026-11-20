"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/businessProfile";
import { onboardingCopy } from "@/lib/onboardingCopy";

export type SmsChoices = { email: boolean; emailMarketing: boolean; transactional: boolean; marketing: boolean };
export const NO_SMS_CHOICES: SmsChoices = { email: false, emailMarketing: false, transactional: false, marketing: false };

export type SmsDisclosure = {
  version: string;
  brand: string;
  transactional: string;
  marketing: string;
  legal: string;
  terms_url: string;
  privacy_url: string;
  support_email: string;
};

let disclosureRequest: Promise<SmsDisclosure> | null = null;

/** One request per page load, shared by every form that asks. */
export function loadSmsDisclosure(): Promise<SmsDisclosure> {
  if (!disclosureRequest) {
    disclosureRequest = api<SmsDisclosure>("/public/sms-disclosure").catch((error) => {
      disclosureRequest = null;
      throw error;
    });
  }
  return disclosureRequest;
}

export function smsChoicesBody(choices: SmsChoices) {
  return {
    application_email_consent: choices.email,
    email_marketing_consent: choices.emailMarketing,
    sms_transactional_consent: choices.transactional,
    sms_marketing_consent: choices.marketing,
  };
}

export function useSmsDisclosure(): SmsDisclosure | null {
  const [disclosure, setDisclosure] = useState<SmsDisclosure | null>(null);
  useEffect(() => {
    let live = true;
    loadSmsDisclosure().then((value) => { if (live) setDisclosure(value); }).catch(() => undefined);
    return () => { live = false; };
  }, []);
  return disclosure;
}

export function OnboardingConsent({
  language = "en",
  legalAccepted,
  onLegalChange,
  legalLabel,
  sms,
  onSmsChange,
  className,
  style,
}: {
  language?: Lang;
  legalAccepted: boolean;
  onLegalChange: (accepted: boolean) => void;
  /** The page's own "I agree to the Terms and the Privacy Policy" sentence, with its links. */
  legalLabel: ReactNode;
  sms: SmsChoices;
  onSmsChange: (next: SmsChoices) => void;
  className?: string;
  /** The page's text colour: the boxes draw their borders from it, so they sit
   *  on whichever palette the page uses. */
  style?: CSSProperties;
}) {
  const copy = onboardingCopy(language);
  const disclosure = useSmsDisclosure();
  return (
    <fieldset className={["onb-consent", className].filter(Boolean).join(" ")} style={style}>
      <label className="onb-consent-row">
        <input type="checkbox" checked={legalAccepted} onChange={(event) => onLegalChange(event.target.checked)} />
        <span>
          <b>{copy.consentLegalTitle}<em>{copy.consentRequired}</em></b>
          <small>{legalLabel}</small>
        </span>
      </label>
      <label className="onb-consent-row"><input type="checkbox" required checked={sms.email} onChange={e => onSmsChange({...sms, email: e.target.checked})} /><span>{language === "es" ? "Acepto recibir correos electrónicos de Qualified Commercial sobre mi solicitud." : "I agree to receive emails from Qualified Commercial about my application."}</span></label>
      <label className="onb-consent-row">
        <input type="checkbox" checked={sms.emailMarketing} onChange={(event) => onSmsChange({ ...sms, emailMarketing: event.target.checked })} />
        <span>
          <b>{language === "es" ? "Consejos y novedades por correo electrónico" : "Email me financing tips and lending updates"}<em>{copy.consentOptional}</em></b>
          <small>{language === "es" ? "Quiero recibir estos correos de Qualified Commercial. Puedo cancelar mi suscripción en cualquier momento." : "I want Qualified Commercial to send me these emails. I can unsubscribe at any time."}</small>
        </span>
      </label>
      {disclosure ? (
        <>
          <label className="onb-consent-row">
            <input type="checkbox" required checked={sms.transactional} onChange={(event) => onSmsChange({ ...sms, transactional: event.target.checked })} />
            <span>
              <b>{copy.consentAppTitle}<em>{copy.consentRequired}</em></b>
              <small>{disclosure.transactional}</small>
            </span>
          </label>
          <label className="onb-consent-row">
            <input type="checkbox" checked={sms.marketing} onChange={(event) => onSmsChange({ ...sms, marketing: event.target.checked })} />
            <span>
              <b>{copy.consentMarketingTitle}<em>{copy.consentOptional}</em></b>
              <small>{disclosure.marketing}</small>
            </span>
          </label>
          {copy.consentEnglishNote ? <p className="onb-consent-note">{copy.consentEnglishNote}</p> : null}
        </>
      ) : <p role="status">{language === "es" ? "Recargue la página si no aparece el consentimiento por SMS." : "Reload the page if the text message consent does not appear."}</p>}
    </fieldset>
  );
}
