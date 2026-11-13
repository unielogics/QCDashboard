"use client";

import { chosenRoomPinProblem } from "@/lib/roomPin";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { QCMark } from "@/components/QCMark";
import { apiBase } from "@/lib/api";
import { validPhone } from "@/lib/formCoerce";
import { clientApiErrorDetail } from "@/lib/clientRoomDocuments";
import { emitPublicIntakeConversion } from "@/lib/publicIntakeConversion";
import { emptyMcaIntakeAnswers, mcaDeclarationDoesNotFit, mcaIntakeRequest, mcaPriorTaxYear, MCA_ROOM_STORAGE_KEY, safeMcaRoomUrl, type McaIntakeAnswers, type McaIntakeLocale } from "@/lib/mcaFundingIntake";
import { BusinessProfileFields } from "@/components/intake/BusinessProfileFields";
import { OnboardingConsent, NO_SMS_CHOICES, smsChoicesBody } from "@/components/intake/OnboardingConsent";
import { emptyBusinessProfile, newBusinessProfileBody, newBusinessProfileProblem } from "@/lib/businessProfile";
import styles from "./page.module.css";

const ranges = ["under_25k", "25k_50k", "50k_100k", "100k_250k", "250k_plus"];
const rangeLabels = ["Under $25,000", "$25,000–$50,000", "$50,000–$100,000", "$100,000–$250,000", "$250,000+"];
const copy = {
  en: {
    title: "Your MCA review starts here", lead: "Open your secure file, upload what you have, and let AI read the documents with you. Your review stays in one room you can return to.",
    documents: ["Last 6 complete months of business bank statements", "Current business debt schedule", "Prior calendar-year business tax return"],
    eligibility: "Before you start", eligibilitySub: "The product allows up to two existing MCAs before this advance, no modified active MCA, and nonnegative reported ordinary business tax income before addbacks. Unknown answers stay pending document review.",
    count: "How many active MCAs does the business have now?", modified: "Has any active MCA been modified?", taxes: "Reported ordinary business income on the prior-year business return", unknown: "Not sure — review my documents", choose: "Choose an answer", none: "None", no: "No", yes: "Yes", nonnegative: "Zero or positive", negative: "Negative", next: "Continue", back: "Back", notFit: "These answers do not fit this MCA product. Contact your advisor to review other Main Street funding options. You can correct an answer if needed.",
    details: "Open your secure file", name: "Your full name", business: "Legal business name", email: "Email", phone: "Mobile number", amount: "Requested amount", revenue: "Average monthly revenue", years: "Time in business", times: ["Under 6 months", "6–12 months", "1–2 years", "2+ years"], unsure: "Not sure", pin: "Choose a 6-digit room PIN", confirmPin: "Confirm room PIN", pinHelp: "Keep your PIN separately from your room link. You will enter it to open your file; it is never included in the link.",
    consent: "I authorize Qualified Commercial to create a secure MCA funding review file and review the documents I provide. My answers are accurate to the best of my knowledge; unknown answers require document review. I authorize contact by phone or email about this review. This is not approval or authorization for a credit pull. I agree to the", terms: "Terms", privacy: "Privacy Policy", and: "and", open: "Open my MCA review", opening: "Opening your file…", invalid: "Complete the required answers and enter a valid mobile number.", invalidPin: "Choose six digits and make sure both PIN entries match.", error: "Your file could not be opened. Your answers remain here so you can retry.",
    resume: "Continue an existing file", resumeLead: "Open your saved secure room link and enter its PIN. Your application, documents, and AI conversation stay together.", saved: "Continue my saved MCA file", link: "Your secure room link", openLink: "Open secure room", badLink: "Use the Qualified Commercial secure room link provided for your file.", emailLink: "Email my resume link", sending: "Requesting link…", resumeNotice: "If an MCA file exists for that email, a resume link will be sent to its saved email address. The PIN is not included.", start: "Start a new MCA file", safe: "Preliminary review · No approval or credit pull to start", pricing: "1.22–1.38× factor", year: "Business tax year", review: "The AI reads the source documents. Staff verifies the figures before eligibility is confirmed.",
  },
  es: {
    title: "Su revisión de MCA empieza aquí", lead: "Abra su expediente seguro, cargue sus documentos y revíselos con la IA. Todo permanece en una sala a la que puede regresar.",
    documents: ["Últimos 6 meses completos de estados bancarios del negocio", "Relación actual de deudas del negocio", "Declaración de impuestos del negocio del año calendario anterior"],
    eligibility: "Antes de empezar", eligibilitySub: "El producto permite hasta dos MCA vigentes antes de este adelanto, ningún MCA vigente modificado e ingresos ordinarios reportados no negativos antes de ajustes. Las respuestas desconocidas quedan pendientes de revisión.",
    count: "¿Cuántos MCA vigentes tiene el negocio?", modified: "¿Se ha modificado algún MCA vigente?", taxes: "Ingresos ordinarios reportados en la declaración del año anterior", unknown: "No lo sé — revisar mis documentos", choose: "Seleccione una respuesta", none: "Ninguno", no: "No", yes: "Sí", nonnegative: "Cero o positivo", negative: "Negativo", next: "Continuar", back: "Atrás", notFit: "Estas respuestas no cumplen con este producto MCA. Contacte a su asesor para revisar otras opciones Main Street. Puede corregir una respuesta si es necesario.",
    details: "Abra su expediente seguro", name: "Su nombre completo", business: "Nombre legal del negocio", email: "Correo electrónico", phone: "Número móvil", amount: "Monto solicitado", revenue: "Ingresos mensuales promedio", years: "Tiempo en el negocio", times: ["Menos de 6 meses", "6–12 meses", "1–2 años", "2+ años"], unsure: "No lo sé", pin: "Elija un PIN de 6 dígitos", confirmPin: "Confirme el PIN", pinHelp: "Guarde el PIN por separado del enlace. Lo necesitará para abrir su expediente; nunca se incluye en el enlace.",
    consent: "Autorizo a Qualified Commercial a crear un expediente seguro para revisar mi solicitud de MCA y los documentos que proporcione. Mis respuestas son correctas según mi conocimiento; las respuestas desconocidas requieren revisión documental. Autorizo contacto por teléfono o correo sobre esta revisión. Esto no es una aprobación ni una autorización para consultar mi crédito. Acepto los", terms: "Términos", privacy: "Aviso de privacidad", and: "y el", open: "Abrir mi revisión MCA", opening: "Abriendo su expediente…", invalid: "Complete las respuestas requeridas e ingrese un número móvil válido.", invalidPin: "Elija seis dígitos y confirme el mismo PIN.", error: "No se pudo abrir su expediente. Sus respuestas permanecen aquí para reintentar.",
    resume: "Continuar un expediente existente", resumeLead: "Abra el enlace guardado e ingrese su PIN. Su solicitud, documentos y conversación con IA permanecen juntos.", saved: "Continuar mi expediente MCA", link: "Enlace de su sala segura", openLink: "Abrir sala segura", badLink: "Use el enlace de la sala segura de Qualified Commercial para su expediente.", emailLink: "Enviarme mi enlace por correo", sending: "Solicitando enlace…", resumeNotice: "Si existe un expediente MCA para ese correo, se enviará un enlace a su dirección guardada. El PIN no se incluye.", start: "Iniciar un nuevo expediente MCA", safe: "Revisión preliminar · Sin aprobación ni consulta de crédito al empezar", pricing: "Factor de 1.22–1.38×", year: "Año fiscal del negocio", review: "La IA lee los documentos originales. El equipo verifica las cifras antes de confirmar la elegibilidad.",
  },
};

export default function McaFundingIntakePage() {
  const [locale, setLocale] = useState<McaIntakeLocale>("en");
  const [answers, setAnswers] = useState<McaIntakeAnswers>(emptyMcaIntakeAnswers);
  const [step, setStep] = useState(1);
  const [resume, setResume] = useState(false);
  const [savedRoom, setSavedRoom] = useState("");
  const [roomLink, setRoomLink] = useState("");
  const [resumeEmail, setResumeEmail] = useState(""); const [notice, setNotice] = useState("");
  const [pin, setPin] = useState(""); const [confirmPin, setConfirmPin] = useState("");
  const [profile, setProfile] = useState(emptyBusinessProfile);
  const [sms, setSms] = useState(NO_SMS_CHOICES);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const attempt = useRef(""); const submitting = useRef(false); const startTracked = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setLocale(params.get("locale") === "es" ? "es" : "en"); setResume(params.get("resume") === "1");
    try { setSavedRoom(safeMcaRoomUrl(window.sessionStorage.getItem(MCA_ROOM_STORAGE_KEY), window.location.origin) || ""); } catch { /* Session storage is optional. */ }
  }, []);
  const c = copy[locale];
  const change = (key: keyof McaIntakeAnswers, value: string) => { setAnswers((current) => ({ ...current, [key]: value, ...(key === "active_mca_count" ? { has_modified_mca: value === "0" ? "no" : current.active_mca_count === "0" ? "" : current.has_modified_mca } : {}) })); setError(""); };
  const goToRoom = (value: unknown) => {
    const safe = safeMcaRoomUrl(value, window.location.origin);
    if (!safe) { setError(c.badLink); return; }
    try { window.sessionStorage.setItem(MCA_ROOM_STORAGE_KEY, safe); } catch { /* The copied link remains usable. */ }
    window.location.assign(safe);
  };
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (mcaDeclarationDoesNotFit(answers)) { setError(c.notFit); return; }
    if (step === 1) { setStep(2); return; }
    if (submitting.current) return;
    if (!Object.values(answers).every((value) => value.trim()) || !validPhone(answers.phone) || !consent || !sms.email || !sms.transactional || !profile.employee_count || newBusinessProfileProblem(profile, locale)) { setError(c.invalid); return; }
    const pinProblem = chosenRoomPinProblem(pin, confirmPin, locale);
    if (pinProblem) { setError(pinProblem); return; }
    submitting.current = true; setBusy(true);
    try {
      attempt.current ||= crypto.randomUUID();
      const body = mcaIntakeRequest(answers, pin, locale, attempt.current, window.location.search);
      const response = await fetch(`${apiBase}/api/v1/public/mca/intake/start`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({...body, ...newBusinessProfileBody(profile), ...smsChoicesBody(sms)}) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(clientApiErrorDetail(data, c.error).message);
      if (safeMcaRoomUrl(data?.room_url, window.location.origin) && !startTracked.current) {
        startTracked.current = true;
        emitPublicIntakeConversion("qc_application_start", body.attribution, locale);
      }
      goToRoom(data?.room_url);
    } catch (reason) { setError(reason instanceof Error ? reason.message : c.error); }
    finally { submitting.current = false; setBusy(false); }
  }
  async function emailResume(event: FormEvent) {
    event.preventDefault(); if (submitting.current) return;
    setError(""); setNotice(""); submitting.current = true; setBusy(true);
    try {
      const response = await fetch(`${apiBase}/api/v1/public/mca/intake/resume`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: resumeEmail.trim() }) });
      if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), c.error).message);
      setNotice(c.resumeNotice);
    } catch (reason) { setError(reason instanceof Error ? reason.message : c.error); }
    finally { submitting.current = false; setBusy(false); }
  }
  function select(key: keyof McaIntakeAnswers, label: string, options: Array<[string, string]>) {
    return <label className={styles.field}><span>{label}</span><select value={answers[key]} onChange={(event) => change(key, event.target.value)} required disabled={busy}><option value="">{c.choose}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>;
  }
  return <main className={styles.page}>
    <header className={styles.header}><a href="https://qualifiedcommercial.com"><QCMark size={32} /><b>Qualified Commercial</b></a><select aria-label="Language / Idioma" value={locale} onChange={(event) => setLocale(event.target.value as McaIntakeLocale)}><option value="en">English</option><option value="es">Español</option></select></header>
    <div className={styles.workspace}><aside className={styles.intro}><span className={styles.eyebrow}>Main Street / MCA</span><h1>{c.title}</h1><p>{c.lead}</p><span className={styles.factor}>{c.pricing}</span><ol>{c.documents.map((item) => <li key={item}>{item}</li>)}</ol><p className={styles.note}>{c.review}</p><small>{c.safe}</small></aside>
      <section className={styles.card}>
        {resume ? <><h2>{c.resume}</h2><p>{c.resumeLead}</p>{savedRoom ? <button className={styles.primary} onClick={() => goToRoom(savedRoom)}>{c.saved}</button> : null}<form onSubmit={(event) => { event.preventDefault(); setError(""); goToRoom(roomLink); }}><label className={styles.field}><span>{c.link}</span><input type="url" required value={roomLink} onChange={(event) => setRoomLink(event.target.value)} autoComplete="off" /></label><button className={styles.primary} type="submit">{c.openLink}</button></form><hr className={styles.separator} /><form onSubmit={(event) => void emailResume(event)}><label className={styles.field}><span>{c.email}</span><input type="email" required value={resumeEmail} onChange={(event) => setResumeEmail(event.target.value)} disabled={busy} autoComplete="off" /></label><button className={styles.secondary} type="submit" disabled={busy}>{busy ? c.sending : c.emailLink}</button></form>{notice ? <p className={styles.notice} role="status">{notice}</p> : null}<button className={styles.link} onClick={() => { setResume(false); setError(""); setNotice(""); }}>{c.start}</button></> : <form onSubmit={(event) => void submit(event)}>
          <div className={styles.steps} aria-label={locale === "es" ? "Progreso de solicitud" : "Application progress"}><b>{step} / 2</b><span>{step === 1 ? c.eligibility : c.details}</span></div><h2>{step === 1 ? c.eligibility : c.details}</h2>
          {step === 1 ? <><p>{c.eligibilitySub}</p>{select("active_mca_count", c.count, [["0", c.none], ["1", "1"], ["2", "2"], ["3_plus", "3+"], ["unknown", c.unknown]])}{answers.active_mca_count !== "0" ? select("has_modified_mca", c.modified, [["no", c.no], ["yes", c.yes], ["unknown", c.unknown]]) : null}{select("last_year_tax_earnings", `${c.taxes} (${mcaPriorTaxYear()})`, [["nonnegative", c.nonnegative], ["negative", c.negative], ["unknown", c.unknown]])}</> : <>
            <div className={styles.grid}>{([["full_name", c.name, "text"], ["business_name", c.business, "text"], ["email", c.email, "email"], ["phone", c.phone, "tel"]] as const).map(([key, label, type]) => <label key={key} className={styles.field}><span>{label}</span><input type={type} value={answers[key]} onChange={(event) => change(key, event.target.value)} required disabled={busy} maxLength={key === "email" ? 320 : key === "phone" ? 32 : 180} autoComplete="off" /></label>)}</div>
            {select("requested_amount", c.amount, [...ranges.map((value, index): [string, string] => [value, rangeLabels[index]]), ["not_sure", c.unsure]])}{select("monthly_revenue", c.revenue, [...ranges.map((value, index): [string, string] => [value, rangeLabels[index]]), ["unknown", c.unsure]])}{select("time_in_business", c.years, [...["under_6_months", "6_12_months", "1_2_years", "2_plus_years"].map((value, index): [string, string] => [value, c.times[index]]), ["unknown", c.unsure]])}
            <div className={styles.grid}><label className={styles.field}><span>{c.pin}</span><input type="password" inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="new-password" required disabled={busy} /></label><label className={styles.field}><span>{c.confirmPin}</span><input type="password" inputMode="numeric" maxLength={6} value={confirmPin} onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 6))} autoComplete="new-password" required disabled={busy} /></label></div><p className={styles.note}>{c.pinHelp}</p>
            <BusinessProfileFields value={profile} language={locale} onChange={patch => setProfile(current => ({...current, ...patch}))} />
            <OnboardingConsent language={locale} legalAccepted={consent} onLegalChange={setConsent} legalLabel={<> {c.consent} <a href="/terms" target="_blank" rel="noreferrer">{c.terms}</a> {c.and} <a href="/privacy" target="_blank" rel="noreferrer">{c.privacy}</a>. </>} sms={sms} onSmsChange={setSms} />
          </>}
          {error ? <div className={styles.error} role="alert">{error}</div> : null}<div className={styles.actions}>{step === 2 ? <button type="button" className={styles.secondary} onClick={() => { setStep(1); setError(""); }} disabled={busy}>{c.back}</button> : null}<button className={styles.primary} type="submit" disabled={busy}>{busy ? c.opening : step === 1 ? c.next : c.open}</button></div><button className={styles.link} type="button" onClick={() => { setResume(true); setError(""); }} disabled={busy}>{c.resume}</button>
        </form>}{resume && error ? <div className={styles.error} role="alert">{error}</div> : null}
      </section>
    </div>
  </main>;
}
