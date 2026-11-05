"use client";

// The three checkmarks every AI application opens with: the terms and privacy
// acceptance (required) and the two text-message consents (both optional, both
// unticked). The desk used to record these for the client from a panel under
// its composer; the strongest proof is the person ticking the box themselves,
// at the moment they hand over their number.
//
// The wording of the two text consents is fetched from qcbackend, never typed
// here: what is stored as proof is the server's copy, so what is on screen has
// to be that same string. If it cannot be fetched the two boxes are left out
// and the application still opens, because the texts are optional.

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Lang } from "@/lib/businessProfile";
import { onboardingCopy } from "@/lib/onboardingCopy";

export type SmsChoices = { transactional: boolean; marketing: boolean };
export const NO_SMS_CHOICES: SmsChoices = { transactional: false, marketing: false };

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

/** The two consent fields as the start request carries them. */
export function smsChoicesBody(choices: SmsChoices) {
  return { sms_transactional_consent: choices.transactional, sms_marketing_consent: choices.marketing };
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
      {disclosure ? (
        <>
          <label className="onb-consent-row">
            <input type="checkbox" checked={sms.transactional} onChange={(event) => onSmsChange({ ...sms, transactional: event.target.checked })} />
            <span>
              <b>{copy.consentAppTitle}<em>{copy.consentOptional}</em></b>
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
      ) : null}
    </fieldset>
  );
}
