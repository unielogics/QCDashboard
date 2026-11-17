"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QCMark } from "@/components/QCMark";
import { BusinessProfileFields } from "@/components/intake/BusinessProfileFields";
import { NO_SMS_CHOICES, OnboardingConsent, smsChoicesBody } from "@/components/intake/OnboardingConsent";
import { apiBase } from "@/lib/api";
import { emptyBusinessProfile, newBusinessProfileBody, newBusinessProfileProblem } from "@/lib/businessProfile";
import { BUSINESS_ROOM_STORAGE_KEY, businessFundingAttribution, optionalBusinessAmount } from "@/lib/businessFundingIntake";
import { clientApiErrorDetail } from "@/lib/clientRoomDocuments";
import { validPhone } from "@/lib/formCoerce";
import { safeMcaRoomUrl } from "@/lib/mcaFundingIntake";
import { emitPublicIntakeConversion } from "@/lib/publicIntakeConversion";
import { consumeResourceToken, loadResourceHandoff, resourceAnswerNumber, resourceTokenForEmail, type ResourceHandoff } from "@/lib/resourceHandoff";
import { chosenRoomPinProblem } from "@/lib/roomPin";
import styles from "../mca-funding-intake/page.module.css";

export default function BusinessFundingIntakePage() {
  const [locale, setLocale] = useState<"en" | "es">("en");
  const es = locale === "es";
  const [contact, setContact] = useState({ name: "", business_name: "", email: "", phone: "" });
  const [profile, setProfile] = useState(emptyBusinessProfile);
  const [amount, setAmount] = useState(""); const [years, setYears] = useState(""); const [creditBand, setCreditBand] = useState("");
  const [pin, setPin] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [legal, setLegal] = useState(false); const [sms, setSms] = useState(NO_SMS_CHOICES);
  const [resume, setResume] = useState(false); const [savedRoom, setSavedRoom] = useState(""); const [roomLink, setRoomLink] = useState(""); const [resumeEmail, setResumeEmail] = useState("");
  const [notice, setNotice] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false);
  const booted = useRef(false); const submitting = useRef(false); const attempt = useRef(""); const tracked = useRef(false);
  const resourceToken = useRef<string | null>(null); const handoff = useRef<ResourceHandoff | null>(null);
  useEffect(() => {
    if (booted.current) return; booted.current = true;
    const token = consumeResourceToken(window.location, window.history);
    const params = new URLSearchParams(window.location.search);
    setLocale(params.get("locale") === "es" ? "es" : "en"); setResume(params.get("resume") === "1");
    try { setSavedRoom(safeMcaRoomUrl(window.sessionStorage.getItem(BUSINESS_ROOM_STORAGE_KEY), window.location.origin) || ""); } catch { /* Resume links work without storage. */ }
    if (token) {
      setLoading(true);
      void loadResourceHandoff(token, "term_loan").then(data => {
        resourceToken.current = token; handoff.current = data; setLocale(data.locale); setContact(data.contact);
        const requested = resourceAnswerNumber(data.answers, "requested_amount"); const age = resourceAnswerNumber(data.answers, "business_age_years");
        setAmount(requested === null ? "" : String(requested)); setYears(age === null ? "" : String(age));
        setCreditBand(typeof data.answers.credit_band === "string" ? data.answers.credit_band : "");
        setProfile(current => ({ ...current, ...(typeof data.answers.industry === "string" ? { industry: data.answers.industry } : {}), ...(typeof data.answers.state === "string" ? { business_state: data.answers.state } : {}) }));
        setNotice(data.locale === "es" ? "Sus respuestas anteriores están completadas y se pueden corregir. Agregue los datos que faltan para abrir su solicitud." : "Your previous answers are filled in and editable. Add the remaining details to open your application.");
      }).catch(() => setNotice("Your saved resource answers could not be loaded. Complete the application below to continue."))
        .finally(() => setLoading(false));
    }
  }, []);
  function openRoom(value: unknown) {
    const safe = safeMcaRoomUrl(value, window.location.origin);
    if (!safe) { setError(es ? "Use el enlace seguro de Qualified Commercial de su expediente." : "Use the Qualified Commercial secure room link for your file."); return; }
    try { window.sessionStorage.setItem(BUSINESS_ROOM_STORAGE_KEY, safe); } catch { /* Link remains usable. */ }
    window.location.assign(safe);
  }
  async function start(event: FormEvent) {
    event.preventDefault(); if (submitting.current || loading) return; setError("");
    const profileProblem = newBusinessProfileProblem(profile, locale);
    if (!contact.name.trim() || !contact.business_name.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim()) || !validPhone(contact.phone) || !validPhone(profile.business_phone ?? "") || !/^\d+$/.test(profile.employee_count ?? "")) {
      setError(es ? "Complete los datos de contacto, teléfonos y número de empleados." : "Complete your contact details, phone numbers, and employee count."); return;
    }
    if (profileProblem) { setError(profileProblem); return; }
    if (amount.trim() && optionalBusinessAmount(amount) === null || years.trim() && (!Number.isFinite(Number(years)) || Number(years) < 0 || Number(years) > 150)) {
      setError(es ? "Revise el monto y los años del negocio, o déjelos en blanco si no los conoce." : "Check the amount and years in business, or leave them blank if unknown."); return;
    }
    const pinProblem = chosenRoomPinProblem(pin, confirmation, locale); if (pinProblem) { setError(pinProblem); return; }
    if (!legal || !sms.email || !sms.transactional) { setError(es ? "Revise y acepte los términos y comunicaciones de la solicitud." : "Review and accept the application terms and communication choices."); return; }
    submitting.current = true; setBusy(true); attempt.current ||= crypto.randomUUID();
    const attribution = businessFundingAttribution(window.location.search, locale, handoff.current?.attribution);
    try {
      const response = await fetch(`${apiBase}/api/v1/public/business/intake/start`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: contact.name.trim(), business_name: contact.business_name.trim(), email: contact.email.trim(), phone: contact.phone.trim(),
          ...newBusinessProfileBody(profile), ...smsChoicesBody(sms), secure_room_pin: pin, locale, goal: "term_loan",
          requested_amount: optionalBusinessAmount(amount), years_in_business: years.trim() ? Number(years) : null, credit_band: creditBand || null,
          consent: true, terms_accepted: true, privacy_accepted: true,
          idempotency_key: attempt.current, attribution, resource_handoff_token: resourceTokenForEmail(resourceToken.current, handoff.current, contact.email) }), cache: "no-store",
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientApiErrorDetail(data, es ? "No se pudo abrir su expediente. Puede reintentar." : "Your file could not be opened. Your answers remain here to retry.").message);
      const safe = safeMcaRoomUrl(data?.room_url, window.location.origin);
      if (!safe) throw new Error(es ? "El enlace del expediente no está disponible. Intente de nuevo." : "The secure room link is unavailable. Please retry.");
      if (!tracked.current) { tracked.current = true; emitPublicIntakeConversion("qc_application_start", attribution, locale); }
      setPin(""); setConfirmation(""); openRoom(safe);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your application could not be opened."); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function requestResume(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return; submitting.current = true; setBusy(true); setNotice(""); setError("");
    try {
      const response = await fetch(`${apiBase}/api/v1/public/business/intake/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resumeEmail.trim() }), cache: "no-store" });
      if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "The resume link could not be requested. Try again.").message);
      setNotice(es ? "Si existe un expediente para ese correo, enviaremos un enlace a su dirección guardada. El PIN no se incluye." : "If a business funding file exists for that email, a resume link will be sent to its saved address. The PIN is not included.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Try again."); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <main className={styles.page}>
    <header className={styles.header}><a href="https://qualifiedcommercial.com"><QCMark size={32} /><b>Qualified Commercial</b></a><select aria-label="Language / Idioma" value={locale} onChange={event => setLocale(event.target.value as "en" | "es")}><option value="en">English</option><option value="es">Español</option></select></header>
    <div className={styles.workspace}><aside className={styles.intro}><span className={styles.eyebrow}>Main Street / Business funding</span><h1>{es ? "Su solicitud de financiamiento empieza aquí" : "Your business funding review starts here"}</h1><p>{es ? "Abra su expediente seguro, agregue sus documentos y converse con su revisor IA. El equipo verifica las cifras y revisa las opciones que corresponden a su negocio." : "Open your secure file, add your documents, and talk with your AI reviewer. The team verifies the figures and reviews financing options for your business."}</p><ol>{(es ? ["Estados bancarios completos del negocio", "Relación actual de deudas del negocio", "Declaración de impuestos y finanzas del negocio"] : ["Complete business bank statements", "Current business debt schedule", "Business tax return and financial statements"]).map(item => <li key={item}>{item}</li>)}</ol><p className={styles.note}>{es ? "Puede regresar con su enlace y PIN. Empezar no implica aprobación ni autoriza una consulta de crédito." : "Return with your room link and PIN. Starting is not approval or authorization for a credit pull."}</p></aside>
      <section className={styles.card}>
        <h2>{resume ? es ? "Continúe su expediente" : "Continue your file" : es ? "Abra su expediente seguro" : "Open your secure file"}</h2>
        {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
        {loading ? <p role="status">{es ? "Cargando sus respuestas…" : "Loading your previous answers…"}</p> : null}
        {resume ? <>
          {savedRoom ? <button className={styles.primary} onClick={() => openRoom(savedRoom)}>{es ? "Abrir mi expediente guardado" : "Open my saved file"}</button> : null}
          <form onSubmit={event => { event.preventDefault(); openRoom(roomLink); }}><label className={styles.field}><span>{es ? "Enlace de su sala segura" : "Your secure room link"}</span><input type="url" value={roomLink} onChange={event => setRoomLink(event.target.value)} required /><button className={styles.secondary} type="submit">{es ? "Abrir sala" : "Open room"}</button></label></form>
          <hr className={styles.separator} /><form onSubmit={event => void requestResume(event)}><label className={styles.field}><span>Email</span><input type="email" value={resumeEmail} onChange={event => setResumeEmail(event.target.value)} required disabled={busy} /></label><button className={styles.primary} type="submit" disabled={busy}>{busy ? es ? "Solicitando…" : "Requesting…" : es ? "Enviarme mi enlace" : "Email my resume link"}</button></form>
          <button className={styles.link} onClick={() => { setResume(false); setError(""); setNotice(""); }}>{es ? "Iniciar una solicitud" : "Start an application"}</button>
        </> : <form onSubmit={event => void start(event)}><fieldset disabled={busy || loading} style={{ border: 0, margin: 0, padding: 0 }}>
          <div className={styles.grid}>{([["name", es ? "Nombre completo" : "Full name", "text"], ["business_name", es ? "Nombre legal del negocio" : "Legal business name", "text"], ["email", "Email", "email"], ["phone", es ? "Número móvil" : "Mobile number", "tel"]] as const).map(([key, label, type]) => <label className={styles.field} key={key}><span>{label}</span><input type={type} value={contact[key]} onChange={event => setContact(current => ({ ...current, [key]: event.target.value }))} required maxLength={key === "email" ? 320 : key === "phone" ? 32 : 180} /></label>)}</div>
          <label className={styles.field}><span>{es ? "Monto solicitado (si lo conoce)" : "Requested amount (if known)"}</span><input inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label>
          <label className={styles.field}><span>{es ? "Años en el negocio (si los conoce)" : "Years in business (if known)"}</span><input type="number" min={0} max={150} step="any" value={years} onChange={event => setYears(event.target.value)} /></label>
          <label className={styles.field}><span>{es ? "Rango aproximado de crédito del propietario (opcional)" : "Approximate owner credit range (optional)"}</span><input value={creditBand.replaceAll("_", "–")} onChange={event => setCreditBand(event.target.value)} maxLength={40} placeholder={es ? "Por ejemplo, 660–699" : "For example, 660–699"} /></label>
          <BusinessProfileFields value={profile} language={locale} onChange={patch => setProfile(current => ({ ...current, ...patch }))} />
          <div className={styles.grid}><label className={styles.field}><span>{es ? "Elija un PIN de 6 dígitos" : "Choose a 6-digit room PIN"}</span><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={event => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="new-password" required /></label><label className={styles.field}><span>{es ? "Confirme el PIN" : "Confirm room PIN"}</span><input type="password" inputMode="numeric" maxLength={6} value={confirmation} onChange={event => setConfirmation(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="new-password" required /></label></div>
          <p className={styles.note}>{es ? "Guarde el PIN separado del enlace. Nunca se envía dentro del enlace." : "Keep the PIN separately from your room link. It is never included in the link."}</p>
          <OnboardingConsent language={locale} legalAccepted={legal} onLegalChange={setLegal} sms={sms} onSmsChange={setSms} legalLabel={<>{es ? "Autorizo la creación de mi expediente y la revisión de los documentos que proporciono. Acepto los " : "I authorize creation of my review file and review of the documents I provide. I agree to the "}<a href="/terms" target="_blank" rel="noreferrer">{es ? "Términos" : "Terms"}</a>{es ? " y el " : " and "}<a href="/privacy" target="_blank" rel="noreferrer">{es ? "Aviso de privacidad" : "Privacy Policy"}</a>.</>} />
          <div className={styles.actions}><button type="submit" className={styles.primary} disabled={busy || loading}>{busy ? es ? "Abriendo…" : "Opening your file…" : es ? "Iniciar mi solicitud" : "Start my application"}</button></div>
        </fieldset><button type="button" className={styles.link} onClick={() => { setResume(true); setError(""); setNotice(""); }}>{es ? "Continuar un expediente existente" : "Continue an existing file"}</button></form>}
        {error ? <div role="alert" className={styles.error}>{error}</div> : null}
      </section>
    </div>
  </main>;
}
