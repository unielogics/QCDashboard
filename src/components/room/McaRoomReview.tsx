"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Icon } from "@/components/design-system/Icon";
import { apiBase } from "@/lib/api";
import { clientApiErrorDetail } from "@/lib/clientRoomDocuments";
import type { McaRoomReview as Review } from "@/lib/mcaFundingIntake";
import styles from "./McaRoomReview.module.css";

const copy = {
  en: { title: "Your MCA file, with AI guidance", lead: "Upload the three requested items, complete your application, and ask about your documents. Source review and staff verification determine eligibility.", needs: "What your file needs", documents: "Six complete bank statement months, a current debt schedule, and the prior-year business tax return.", pending: "Unknown answers stay pending. Your declarations and uploaded file count do not establish approval.", loading: "Loading your review…", starting: "Starting…", retry: "Retry AI review", run: "Review my documents", running: "Review in progress", summary: "What the review found", conversation: "Your AI conversation", you: "You", ai: "Qualified Commercial AI", ask: "Ask about your MCA application", askSub: "The AI can help you understand what to upload, what it found, and what still needs your attention.", refresh: "Refresh review", message: "Message your AI reviewer", placeholder: "Ask about a document or the next step…", sending: "Sending…", send: "Send", of: "of", files: "files", actions: { upload: "Upload the requested documents", debt_schedule: "Complete the business debt schedule", application: "Complete application details" }, statuses: { not_started: "Ready for your documents", queued: "Review queued", running: "AI is reading your file", completed: "Source review complete", failed: "Review needs retry" }, policies: { pending_review: "Pending source review", needs_information: "More information needed", not_eligible: "This MCA product does not fit the reviewed information", ready_for_staff_review: "Ready for staff review" } },
  es: { title: "Su expediente MCA, con guía de IA", lead: "Cargue los tres documentos solicitados, complete su solicitud y pregunte sobre sus documentos. La revisión documental y la verificación del equipo determinan la elegibilidad.", needs: "Lo que necesita su expediente", documents: "Seis meses completos de estados bancarios, una relación actual de deudas y la declaración del negocio del año anterior.", pending: "Las respuestas desconocidas quedan pendientes. Sus declaraciones y la cantidad de archivos no confirman una aprobación.", loading: "Cargando su revisión…", starting: "Iniciando…", retry: "Reintentar revisión IA", run: "Revisar mis documentos", running: "Revisión en curso", summary: "Resultado de la revisión", conversation: "Su conversación con IA", you: "Usted", ai: "IA de Qualified Commercial", ask: "Pregunte sobre su solicitud MCA", askSub: "La IA puede ayudarle a entender qué cargar, qué encontró y qué necesita su atención.", refresh: "Actualizar revisión", message: "Mensaje a su revisor IA", placeholder: "Pregunte sobre un documento o el siguiente paso…", sending: "Enviando…", send: "Enviar", of: "de", files: "archivos", actions: { upload: "Cargar los documentos solicitados", debt_schedule: "Completar la relación de deudas", application: "Completar datos de la solicitud" }, statuses: { not_started: "Listo para sus documentos", queued: "Revisión en espera", running: "La IA está leyendo su expediente", completed: "Revisión documental completada", failed: "La revisión necesita un reintento" }, policies: { pending_review: "Pendiente de revisión documental", needs_information: "Se necesita más información", not_eligible: "Este producto MCA no corresponde a la información revisada", ready_for_staff_review: "Listo para revisión del equipo" } },
};

export function McaRoomReview({ token, passcode, active, refreshKey, onUpload, onApplication, onDebtSchedule, onPaymentMethods }: {
  token: string; passcode: string; active: boolean; refreshKey: string;
  onUpload: () => void; onApplication: () => void; onDebtSchedule: () => void;
  onPaymentMethods: (enabled: boolean) => void;
}) {
  const [review, setReview] = useState<Review | null>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState("");
  const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  const [evidenceOpen, setEvidenceOpen] = useState(true);
  const reviewStatus = review?.status;
  const inFlight = useRef(false); const generation = useRef(0);
  const messagesEnd = useRef<HTMLDivElement>(null);
  const root = `${apiBase}/api/v1/public/mca/room/${encodeURIComponent(token)}`;
  const call = useCallback(async (action: "review" | "chat" | "run", fields: Record<string, unknown> = {}, signal?: AbortSignal) => {
    const response = await fetch(`${root}/${action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, passcode }), cache: "no-store", signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(clientApiErrorDetail(data, "Your MCA review could not be loaded. Try again.").message);
    if (data?.funding_intent !== "merchant_cash_advance") throw new Error("This review is not available for this file.");
    return data as Review;
  }, [passcode, root]);
  useEffect(() => {
    const compact = window.matchMedia("(max-width: 850px)");
    const adapt = () => setEvidenceOpen(!compact.matches);
    adapt(); compact.addEventListener("change", adapt);
    return () => compact.removeEventListener("change", adapt);
  }, []);
  useEffect(() => { generation.current += 1; setReview(null); setText(""); setError(""); }, [token, passcode]);
  useEffect(() => {
    const controller = new AbortController(); const current = generation.current;
    setLoading(true);
    void call("review", {}, controller.signal).then((data) => { if (!controller.signal.aborted && current === generation.current) { setReview(data); setError(""); } })
      .catch((reason: unknown) => { if (!controller.signal.aborted && current === generation.current) setError(reason instanceof Error ? reason.message : "Your MCA review could not be loaded."); })
      .finally(() => { if (!controller.signal.aborted && current === generation.current) setLoading(false); });
    return () => controller.abort();
  }, [active, call, refreshKey]);
  useEffect(() => { onPaymentMethods(review?.payment_methods_enabled === true); }, [onPaymentMethods, review?.payment_methods_enabled]);
  useEffect(() => {
    if (!active || !["queued", "running"].includes(reviewStatus ?? "")) return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const current = generation.current;
    const poll = async () => {
      try {
        const next = await call("review", {}, controller.signal);
        if (!controller.signal.aborted && current === generation.current) { setReview(next); setError(""); }
      } catch (reason) {
        if (!controller.signal.aborted && current === generation.current) setError(reason instanceof Error ? reason.message : "Review progress could not be refreshed.");
      } finally { if (!controller.signal.aborted && current === generation.current) timer = setTimeout(() => void poll(), 5_000); }
    };
    timer = setTimeout(() => void poll(), 4_000);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [active, call, reviewStatus]);
  useEffect(() => { if (active) messagesEnd.current?.scrollIntoView({ block: "nearest" }); }, [active, review?.messages.length]);
  async function act(action: "chat" | "run") {
    if (inFlight.current || action === "chat" && !text.trim()) return;
    inFlight.current = true; setBusy(action); setError(""); const current = generation.current;
    try {
      const data = await call(action, action === "chat" ? { message: text.trim() } : {});
      if (current === generation.current) { setReview(data); if (action === "chat") setText(""); }
    } catch (reason) { if (current === generation.current) setError(reason instanceof Error ? reason.message : "The request did not complete. Try again."); }
    finally { if (current === generation.current) setBusy(""); inFlight.current = false; }
  }
  const reviewing = Boolean(review && ["queued", "running"].includes(review.status));
  const c = copy[review?.preferred_language === "es" ? "es" : "en"];
  const progress = review?.progress.percent == null ? undefined : Math.max(0, Math.min(100, review.progress.percent));
  return <section className="application-room-section" aria-label="MCA AI review">
    <div className="application-room-section-head"><div><span className="application-room-eyebrow">Main Street / MCA</span><h2>{c.title}</h2><p>{c.lead}</p></div><span className="application-room-count">1.22–1.38× factor</span></div>
    <div className={styles.layout}>
      <aside className={styles.evidence}>
        <details open={evidenceOpen} onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}><summary className={styles.evidenceToggle}>{c.needs}<span>3</span></summary><div>
        <h3>{c.needs}</h3><p>{c.documents}</p>
        {review?.requirements.map((requirement) => <div className={styles.requirement} key={requirement.key}><b>{requirement.label}</b><span>{requirement.required > 0 ? `${requirement.received} ${c.of} ${requirement.required} ${requirement.unit}` : requirement.status.replaceAll("_", " ")}</span><small>{requirement.status.replaceAll("_", " ")}</small></div>)}
        <div className={styles.actions}>{review?.actions.map((action) => <button className="application-room-secondary" key={action.kind} onClick={action.kind === "upload" ? onUpload : action.kind === "application" ? onApplication : onDebtSchedule}><Icon name={action.kind === "upload" ? "upload" : "edit"} size={14} />{c.actions[action.kind]}</button>)}</div>
        <div className={styles.policy}><b>{review ? c.policies[review.policy_status] : c.policies.pending_review}</b><p>{c.pending}</p></div>
        </div></details>
      </aside>
      <div className={styles.review}>
        <div className={styles.progress} aria-live="polite"><div><b>{review ? c.statuses[review.status] : c.loading}</b>{review ? <span>{review.progress.label}{review.progress.files_total > 0 ? ` · ${review.progress.files_done} ${c.of} ${review.progress.files_total} ${c.files}` : ""}</span> : null}</div><button className="application-room-secondary" disabled={Boolean(busy) || loading || reviewing || !review} onClick={() => void act("run")}><Icon name="spark" size={14} />{busy === "run" ? c.starting : reviewing ? c.running : review?.status === "failed" ? c.retry : c.run}</button>{reviewing ? <progress max={100} value={progress} aria-label="AI document review progress" /> : null}</div>
        {review?.summary && typeof review.summary === "string" ? <div className={styles.summary}><h3>{c.summary}</h3><p>{review.summary}</p></div> : null}
        <div className={styles.conversation} role="log" aria-label={c.conversation} aria-live="polite">{review?.messages.length ? review.messages.map((message) => { const staff = message.sender_kind === "operator"; const borrower = message.role === "user" && !staff; return <article key={message.id} className={borrower ? styles.user : styles.assistant}><b>{staff ? message.author_name || "Qualified Commercial team" : borrower ? c.you : c.ai}</b><p>{message.content}</p></article>; }) : <div className={styles.empty}><Icon name="chat" size={24} /><h3>{c.ask}</h3><p>{c.askSub}</p></div>}<div ref={messagesEnd} /></div>
        {error ? <div className="application-room-alert bad" role="alert">{error}<button className={styles.retry} onClick={() => { setLoading(true); void call("review").then((data) => { setReview(data); setError(""); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Try again.")).finally(() => setLoading(false)); }} disabled={Boolean(busy) || loading}>{c.refresh}</button></div> : null}
        <form className={styles.composer} onSubmit={(event: FormEvent) => { event.preventDefault(); void act("chat"); }}><label><span>{c.message}</span><textarea value={text} onChange={(event) => setText(event.target.value)} rows={2} maxLength={4000} placeholder={c.placeholder} disabled={Boolean(busy) || loading || !review} /></label><button className="application-room-primary" type="submit" disabled={Boolean(busy) || loading || !text.trim() || !review}>{busy === "chat" ? c.sending : c.send}</button></form>
      </div>
    </div>
  </section>;
}
