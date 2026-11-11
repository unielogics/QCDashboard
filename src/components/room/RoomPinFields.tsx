"use client";

import { useId, useState } from "react";
import { normalizeRoomPin } from "@/lib/clientRoomDocuments";
import { chosenRoomPinProblem } from "@/lib/roomPin";
import styles from "./RoomPinFields.module.css";

export type RoomPinFieldsProps = { pin: string; confirmation: string; onPinChange: (value: string) => void; onConfirmationChange: (value: string) => void; disabled?: boolean; locale?: "en" | "es"; currentPin?: string };

export function RoomPinFields({ pin, confirmation, onPinChange, onConfirmationChange, disabled = false, locale = "en", currentPin }: RoomPinFieldsProps) {
  const id = useId();
  const es = locale === "es";
  const problem = (pin.length === 6 || confirmation) ? chosenRoomPinProblem(pin, confirmation, locale, currentPin) : null;
  return <fieldset className={styles.fields} disabled={disabled}>
    <legend>{es ? "Su PIN de acceso a la sala" : "Your room access PIN"}</legend>
    <p id={`${id}-help`}>{es ? "Elija y confirme un PIN de seis dígitos para volver a su expediente y cargar o corregir documentos. Guárdelo por separado del enlace de su sala." : "Choose and confirm six digits to return to your file and upload or correct documents. Keep your PIN separately from your room link."}</p>
    <div className={styles.row}>
      <label htmlFor={`${id}-pin`}>{es ? "Cree un PIN de 6 dígitos" : "Create a 6-digit room PIN"}<input id={`${id}-pin`} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="new-password" required value={pin} onChange={(event) => onPinChange(normalizeRoomPin(event.target.value))} aria-describedby={`${id}-help${problem ? ` ${id}-problem` : ""}`} /></label>
      <label htmlFor={`${id}-confirm`}>{es ? "Confirme el PIN" : "Confirm room PIN"}<input id={`${id}-confirm`} type="password" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="new-password" required value={confirmation} onChange={(event) => onConfirmationChange(normalizeRoomPin(event.target.value))} aria-describedby={`${id}-help${problem ? ` ${id}-problem` : ""}`} /></label>
    </div>
    {problem ? <p id={`${id}-problem`} className={styles.problem} aria-live="polite">{problem}</p> : null}
  </fieldset>;
}

/** A resumed draft must establish return access before files/forms are used. */
export function IntakeRoomPinGate({ onSave, locale = "en" }: { onSave: (pin: string) => Promise<void>; locale?: "en" | "es" }) {
  const [pin, setPin] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const es = locale === "es";
  async function save() {
    const problem = chosenRoomPinProblem(pin, confirmation, locale);
    if (problem || busy) { if (problem) setError(problem); return; }
    setBusy(true); setError("");
    try { await onSave(pin); setPin(""); setConfirmation(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : es ? "No se pudo guardar el PIN. Intente de nuevo." : "The PIN could not be saved. Please try again."); }
    finally { setBusy(false); }
  }
  return <form className={styles.gate} onSubmit={(event) => { event.preventDefault(); void save(); }}>
    <h1>{es ? "Guarde su PIN para continuar" : "Save your room PIN to continue"}</h1>
    <p>{es ? "Su expediente y sus respuestas están guardados. Complete este paso para volver a entrar y continuar con los documentos." : "Your existing file and answers are saved. Complete this step so you can sign back in and continue with your documents."}</p>
    <RoomPinFields pin={pin} confirmation={confirmation} onPinChange={setPin} onConfirmationChange={setConfirmation} disabled={busy} locale={locale} />
    {error ? <p role="alert">{error}</p> : null}
    <button type="submit" disabled={busy || chosenRoomPinProblem(pin, confirmation, locale) !== null}>{busy ? es ? "Guardando…" : "Saving…" : es ? "Guardar PIN y continuar" : "Save PIN and continue"}</button>
  </form>;
}
