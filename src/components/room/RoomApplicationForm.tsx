"use client";

import { useEffect, useState } from "react";
import { apiBase } from "@/lib/api";
import { clientApiErrorDetail } from "@/lib/clientRoomDocuments";
import { newBusinessProfileProblem, type NewBusinessProfile } from "@/lib/businessProfile";
import { BusinessProfileFields } from "@/components/intake/BusinessProfileFields";
import { LENDING_INTENTS, MAIN_STREET_INTENTS } from "@/lib/intakeIndustries";

type Application = { [K in keyof NewBusinessProfile]: string | null } & {
  vertical: "dealer" | "main_street" | "real_estate" | "mca";
  full_name: string | null; email: string | null; phone: string | null; business_name: string | null;
  loan_purpose: string | null;
  requested_loan_amount: number | null; years_in_business: number | null;
  target_property_address: string | null; transaction_type: string | null;
  estimated_value_or_purchase_price: number | null; monthly_rent: number | null; submitted_at: string | null;
  funding_need: string | null; funding_need_editable?: boolean; requested_amount_editable?: boolean;
};
type FieldKey = Exclude<keyof Application, "vertical" | "submitted_at" | "requested_amount_editable" | "funding_need_editable">;
const NUMBER_FIELDS = new Set<FieldKey>(["requested_loan_amount", "years_in_business", "estimated_value_or_purchase_price", "monthly_rent"]);
const ANSWER_FIELDS: readonly FieldKey[] = ["full_name", "email", "phone", "business_name", "business_street", "business_city", "business_state", "business_zip", "industry", "business_website", "business_description", "loan_purpose", "requested_loan_amount", "years_in_business", "target_property_address", "transaction_type", "estimated_value_or_purchase_price", "monthly_rent", "funding_need"];

export function RoomApplicationForm({ token, passcode, onChanged, onContinue }: { token: string; passcode: string; onChanged: () => Promise<void>; onContinue: () => void }) {
  const [application, setApplication] = useState<Application | null>(null);
  const [answers, setAnswers] = useState<Partial<Record<FieldKey, string>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const endpoint = `${apiBase}/api/v1/application-profiles/public/room/${encodeURIComponent(token)}/application`;
  const businessProfile: NewBusinessProfile = {
    business_street: answers.business_street || "", business_city: answers.business_city || "",
    business_state: answers.business_state || "", business_zip: answers.business_zip || "",
    industry: answers.industry || "", business_website: answers.business_website || "",
    business_description: answers.business_description || "",
  };

  function adopt(data: Application) {
    setApplication(data);
    setAnswers(Object.fromEntries(ANSWER_FIELDS.map((key) => [key, data[key] == null ? "" : String(data[key])])));
  }
  useEffect(() => {
    let current = true;
    setApplication(null); setError("");
    void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ passcode }), cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "Application details could not be loaded.").message);
        return response.json() as Promise<Application>;
      })
      .then((data) => { if (current) adopt(data); })
      .catch((reason: unknown) => { if (current) setError(reason instanceof Error ? reason.message : "Application details could not be loaded."); });
    return () => { current = false; };
  }, [endpoint, passcode]);

  async function save(submit: boolean) {
    if (busy) return;
    setError(""); setNotice("");
    if (submit) {
      const problem = newBusinessProfileProblem(businessProfile);
      if (problem) { setError(problem); return; }
    }
    setBusy(true);
    try {
      const fields = Object.fromEntries(Object.entries(answers).map(([key, value]) => [key, value?.trim() ? NUMBER_FIELDS.has(key as FieldKey) ? Number(value) : value.trim() : null]));
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...fields, passcode, submit }) });
      if (!response.ok) throw new Error(clientApiErrorDetail(await response.json().catch(() => null), "Your application could not be saved.").message);
      adopt(await response.json() as Application);
      setNotice(submit ? "Application details received. Continue with your owners and any requested documents." : "Progress saved. You can return using this same link and PIN.");
      // The saved answers remain successful if an optional room refresh fails.
      await onChanged().catch(() => undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Your application could not be saved."); }
    finally { setBusy(false); }
  }

  function field(key: FieldKey, label: string, options: { type?: string; required?: boolean; placeholder?: string; max?: number; maxLength?: number; readOnly?: boolean } = {}) {
    return <label className="application-room-field" key={key}><span>{label}{options.required ? " *" : ""}</span><input type={options.type || "text"} value={answers[key] || ""} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} required={options.required} placeholder={options.placeholder} min={NUMBER_FIELDS.has(key) ? key === "years_in_business" || key === "monthly_rent" ? 0 : 0.01 : undefined} max={options.max} step={NUMBER_FIELDS.has(key) ? "any" : undefined} maxLength={options.maxLength ?? 255} readOnly={options.readOnly} disabled={busy} /></label>;
  }
  const lending = application?.vertical !== "main_street" || LENDING_INTENTS.has(answers.funding_need || "not_sure");

  return <section className="application-room-section" aria-label="Your application">
    <div className="application-room-section-head"><div><span className="application-room-eyebrow">Your application</span><h2>Complete your application details</h2><p>Confirm what your advisor started, then add the remaining information. Save your progress at any time.</p></div></div>
    {error ? <div className="application-room-alert bad" role="alert">{error}</div> : null}
    {!application ? !error ? <p role="status">Loading your application...</p> : null : <form onSubmit={(event) => { event.preventDefault(); void save(true); }}>
      {application.submitted_at ? <div className="application-room-alert good">Your application details have been submitted. You can make corrections below.</div> : null}
      <div className="application-room-identity">
        {field("full_name", "Full name", { required: true, maxLength: 180 })}
        {field("email", "Email", { required: true, type: "email", maxLength: 320 })}
        {field("phone", "Mobile number", { required: true, type: "tel", placeholder: "Include country code outside the US", maxLength: 32 })}
        {field("business_name", application.vertical === "real_estate" ? "Investor / entity name" : "Legal business name", { required: application.vertical !== "real_estate", maxLength: 180 })}
        {field("years_in_business", "Years in business", { type: "number", max: 150 })}
      </div>
      <BusinessProfileFields value={businessProfile} onChange={(patch) => setAnswers((current) => ({ ...current, ...patch }))} disabled={busy} />
      {application.vertical === "main_street" ? <div className="application-room-identity">
        <label className="application-room-field"><span>Funding need *</span><select value={answers.funding_need || ""} onChange={(event) => setAnswers((current) => ({ ...current, funding_need: event.target.value }))} required disabled={busy || application.funding_need_editable === false}><option value="">Choose what you need</option>{MAIN_STREET_INTENTS.map((option) => <option key={option.slug} value={option.slug}>{option.label}</option>)}</select></label>
        {application.funding_need_editable === false ? <p className="application-room-note">This application is for MCA funding. Contact your advisor if you need a different product.</p> : null}
      </div> : null}
      <div className="application-room-identity" style={{ marginTop: 16 }}>
        {field("loan_purpose", lending ? "Funding purpose" : "What would you like help with?", { required: lending, placeholder: "How will you use the funds?" })}
        {lending ? field("requested_loan_amount", "Requested amount ($)", { type: "number", required: true, readOnly: application.requested_amount_editable === false }) : null}
        {lending && application.requested_amount_editable === false ? <p className="application-room-note">Your advisor has reviewed this amount. Contact your advisor if it needs to change.</p> : null}
        {application.vertical === "real_estate" ? <>
          {field("target_property_address", "Target property address", { required: true, maxLength: 320 })}
          {field("transaction_type", "Transaction type", { required: true, placeholder: "Purchase, refinance, or cash-out", maxLength: 80 })}
          {field("estimated_value_or_purchase_price", "Property value / purchase price ($)", { type: "number", required: true })}
          {field("monthly_rent", "Monthly rent ($)", { type: "number" })}
        </> : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 20 }}>
        <button className="application-room-secondary" type="button" onClick={() => void save(false)} disabled={busy}>{busy ? "Saving..." : "Save progress"}</button>
        <button className="application-room-primary" type="submit" disabled={busy}>{busy ? "Saving..." : "Submit application details"}</button>
        {application.submitted_at ? <button className="application-room-secondary" type="button" onClick={onContinue} disabled={busy}>Continue application</button> : null}
      </div>
      {notice ? <div className="application-room-alert good" role="status">{notice}</div> : null}
    </form>}
  </section>;
}
