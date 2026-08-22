"use client";

// Borrower-facing soft-pull flow. Mirrors qcmobile/app/credit-pull.tsx —
// 4-stage state machine (form → consent → pulling → done) shown as a modal
// instead of a screen. Triggered from <ProTermsCard> on the dashboard and
// from /profile.
//
// ── Design-system migration note ──────────────────────────────────────
// Restyled onto globals.css/app-extras.css classes. The hand-rolled right-edge
// panel became ds/Drawer — the one dialog shape — matching the move already
// made by PreQualRequestModal, the other long borrower-facing form.
//
// `closeOnBackdrop={false}` is deliberate and carries the old behaviour
// forward: the previous scrim had NO onClick, because losing seven fields of
// half-typed PII to a stray click is a far worse outcome than having to hit
// Cancel or Escape. Escape still closes (Drawer owns it now), and body-scroll
// lock, focus-into-dialog and focus-restore-on-close are gained.
//
// The stage-dependent action rows moved from inside the card to the drawer
// footer — same buttons, same handlers, same disabled predicates, one place.
// Every hook, every error code branch, the formValid gate, the four stages and
// both done-stage outcomes are the ones that were here before. Public props
// (`open`, `onClose`, `initialEmail`, `initialName`, `mode`) are untouched.

import { useEffect, useState, type ReactNode } from "react";
import { Icon } from "@/components/design-system/Icon";
import {
  Btn,
  Card,
  CellChip,
  Field as DsField,
  Input,
  Note,
  Select,
  StatusLine,
  cx,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { PaymentAuthorizationPanel } from "@/components/PaymentAuthorizationPanel";
import { useCreditSummary, usePaymentAuthorizationStatus, useStartMyCreditPull } from "@/hooks/useApi";
import { ApiError } from "@/lib/api";
import { US_STATES } from "@/lib/usStates";

type Stage = "form" | "consent" | "pulling" | "done";

interface Props {
  open: boolean;
  onClose: () => void;
  // Optional: prefill from /auth/me so the borrower doesn't retype their name/email.
  initialEmail?: string;
  initialName?: string;
  // "rerun" tweaks copy slightly to acknowledge there's already a pull on file.
  // "expired" is for the 90-day re-verification flow — emphasizes that the
  // calculator is locked until the pull refreshes.
  mode?: "first" | "rerun" | "expired";
}

export function CreditPullModal({ open, onClose, initialEmail, initialName, mode = "first" }: Props) {
  const start = useStartMyCreditPull();
  const paymentAuthorization = usePaymentAuthorizationStatus();
  const [stage, setStage] = useState<Stage>("form");
  // Form fields = exactly what iSoftPull's API requires (per their docs).
  // No phone/email — those live on the user/client record. SSN starts
  // hidden and is only required if the bureau can't match on
  // name+address+DOB alone (most consumers can be matched without it).
  const [first, last] = (initialName ?? "").split(" ", 2);
  const [form, setForm] = useState({
    legal_first_name: first ?? "",
    legal_last_name: last ?? "",
    dob: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    ssn: "",
  });
  // Becomes true after the first attempt comes back with
  // code="no_hit_provide_ssn". Reveals the SSN field; subsequent
  // submits include it.
  const [ssnRequired, setSsnRequired] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset to form whenever the modal reopens — avoids the modal flashing the
  // previous "done" state when the user re-runs the pull.
  useEffect(() => {
    if (open) {
      setStage("form");
      setSsnRequired(false);
      setSubmitError(null);
      setForm((prev) => ({
        ...prev,
        legal_first_name: prev.legal_first_name || (initialName?.split(" ")[0] ?? ""),
        legal_last_name: prev.legal_last_name || (initialName?.split(" ").slice(1).join(" ") ?? ""),
        ssn: "", // never carry SSN across reopens
      }));
    }
  }, [open, initialName, initialEmail]);

  // Esc closes — now owned by Drawer, which also locks body scroll and returns
  // focus to whatever opened the dialog.

  if (!open) return null;
  const needsPaymentAuthorization = Boolean(
    paymentAuthorization.data?.requires_authorization && !paymentAuthorization.data.authorized,
  );

  const submit = async () => {
    setStage("pulling");
    setSubmitError(null);
    try {
      // Send SSN only when the user typed one (or backend told us it's
      // needed). Empty string would fail Pydantic's "exactly 9 digits"
      // validator, so coerce to undefined when blank.
      const payload: {
        legal_first_name: string; legal_last_name: string; dob: string;
        street: string; city: string; state: string; zip: string;
        ssn?: string; fcra_consent: boolean;
      } = {
        legal_first_name: form.legal_first_name,
        legal_last_name: form.legal_last_name,
        dob: form.dob, street: form.street, city: form.city,
        state: form.state, zip: form.zip, fcra_consent: true,
      };
      if (form.ssn.length === 9) payload.ssn = form.ssn;

      await start.mutateAsync(payload);
      setStage("done");
    } catch (err: unknown) {
      // Backend signals structured deny outcomes via 422 + detail.code:
      //   no_hit_provide_ssn  → reveal SSN field, return to form, retry
      //   bureau_freeze       → user must lift their freeze with the bureau
      // Other failures fall through to a generic message.
      const code = readErrorCode(err);
      const detailMsg = readErrorMessage(err);
      if (code === "no_hit_provide_ssn") {
        setSsnRequired(true);
        setSubmitError(
          detailMsg ||
            "We couldn't find your file with name + address + DOB alone. Add your SSN below and try again.",
        );
        setStage("form");
        return;
      }
      if (code === "bureau_freeze") {
        setSubmitError(
          detailMsg ||
            "Your credit file is frozen at the bureau. Please lift the freeze with Experian, Equifax, or TransUnion and try again.",
        );
        setStage("form");
        return;
      }
      if (code === "payment_authorization_required") {
        setSubmitError(
          detailMsg ||
            "Finish the payment pre-authorization step first, then we can run the soft pull.",
        );
        return;
      }
      setSubmitError(detailMsg || "Pull failed — please retry.");
      setStage("consent");
    }
  };

  const formValid = Boolean(
    form.legal_first_name.trim() &&
    form.legal_last_name.trim() &&
    isValidDob(form.dob) &&
    form.street.trim() &&
    form.city.trim() &&
    form.state.length === 2 &&
    /^\d{5}(-\d{4})?$/.test(form.zip.trim()) &&
    // SSN only required after the bureau told us it couldn't match.
    (!ssnRequired || form.ssn.length === 9)
  );

  const eyebrow =
    mode === "expired"
      ? "Refresh credit · 90-day expiry"
      : mode === "rerun"
        ? "Re-run soft pull"
        : "Unlock pro terms";

  // The stage's actions. `.drawer-f` is a left-aligned flex row, so `.sp`
  // (flex: 1) pushes the pair to the right edge — the same arrangement the old
  // in-card footer produced. Null while pulling (there was nothing to press
  // then either) and null on the payment-authorization branch, where the panel
  // owns its own controls.
  const footer = needsPaymentAuthorization ? null : stage === "form" ? (
    <>
      <span className="sp" />
      <Btn onClick={onClose}>Cancel</Btn>
      <Btn variant="pri" onClick={() => setStage("consent")} disabled={!formValid}>
        Continue to Consent <Icon name="arrowR" size={13} />
      </Btn>
    </>
  ) : stage === "consent" ? (
    <>
      <span className="sp" />
      <Btn onClick={() => setStage("form")}>Back</Btn>
      {/* `.btn.pri-bad`: solid danger, not the danger TINT. This is the one
          control the whole dialog exists to reach, and it was solid-filled
          before the migration — a tinted secondary demotes the most
          consequential button on the screen to the weight of a Delete sitting
          in a row of other actions. A single two-class selector, so
          `background` still has exactly one owner. */}
      <Btn className="pri-bad" onClick={submit}>
        <Icon name="shield" size={14} /> I Authorize · Run Soft Pull
      </Btn>
    </>
  ) : stage === "done" ? (
    <>
      <span className="sp" />
      <Btn variant="pri" onClick={onClose}>
        Done
      </Btn>
    </>
  ) : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Soft Credit Pull"
      width="md"
      closeOnBackdrop={false}
      footer={footer}
    >
      <div className="grid">
        <div>
          <CellChip tone={mode === "expired" ? "bad" : "pet"}>{eyebrow}</CellChip>
        </div>

        {needsPaymentAuthorization ? (
          <>
            <p className="sub">
              Unlock Pro Terms in one flow: first sign the payment pre-authorization and save a card securely through Stripe, then confirm FCRA consent and run the soft pull.
            </p>
            {submitError ? <StatusLine tone="bad">{submitError}</StatusLine> : null}
            <PaymentAuthorizationPanel />
          </>
        ) : (
          <>
            <p className="sub">
              We capture only what the bureaus require. No score impact. Valid for 90 days.
            </p>

            {stage === "form" && (
              <Card>
                {/* Surfaced for every code path that lands back on the form,
                    not just the SSN one. bureau_freeze set this message and
                    then had nowhere to render it. */}
                {submitError ? (
                  <StatusLine tone="warn" className="mb">
                    {submitError}
                  </StatusLine>
                ) : null}

                <div className="fldsec">
                  <div className="lbl">Legal name</div>
                  <div className="fldgrid two">
                    <Field label="First name" value={form.legal_first_name} onChange={(v) => setForm({ ...form, legal_first_name: v })} />
                    <Field label="Last name" value={form.legal_last_name} onChange={(v) => setForm({ ...form, legal_last_name: v })} />
                  </div>
                  <div className="mt">
                    <DobField
                      valueIso={form.dob}
                      onChangeIso={(iso) => setForm({ ...form, dob: iso })}
                    />
                  </div>
                </div>

                <div className="fldsec">
                  <div className="lbl">Address used for credit</div>
                  <div className="fldgrid">
                    <Field label="Street" value={form.street} onChange={(v) => setForm({ ...form, street: v })} />
                    <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
                    {/* Bespoke 1.4fr/1fr track: a state name is long and a ZIP
                        is five characters. `.fldgrid.two` would give them equal
                        columns and leave the ZIP field mostly empty. */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 11 }}>
                      <StateSelect value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
                      <Field label="ZIP" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
                    </div>
                  </div>
                </div>

                {ssnRequired ? (
                  <div className="fldsec">
                    <div className="lbl">Identity verification</div>
                    {/* `req` is the requirement-engine flag, not a validation
                        error: the bureau came back and asked for this one. It
                        rails the label and adds a REQUIRED tag so the signal
                        is not colour alone. */}
                    <Field
                      label="Social Security Number"
                      placeholder="9 digits, no dashes"
                      type="password"
                      req
                      bad={form.ssn.length !== 9}
                      hint="Sent to the bureau over TLS. Only the last 4 digits are stored on file."
                      value={form.ssn}
                      onChange={(v) => setForm({ ...form, ssn: v.replace(/\D/g, "").slice(0, 9) })}
                    />
                  </div>
                ) : (
                  <Note>
                    We try to match your credit file using name, address, and date of birth — most consumers can be matched on those alone. We only ask for your SSN if the bureau can&apos;t find your file without it.
                  </Note>
                )}
              </Card>
            )}

            {stage === "consent" && (
              <Card>
                {/* `.consent` runs at body size rather than the caption size
                    the rest of the fine print uses — shrinking a disclosure to
                    fit is the thing a compliance review flags. */}
                <div className="consent">
                  <div className="ctext">
                    <span className="ctitle">FCRA consent</span>
                    I, <strong>{form.legal_first_name} {form.legal_last_name}</strong>, authorize Qualified Commercial to obtain my consumer credit report from Experian, TransUnion, and Equifax for the purpose of evaluating loan products. I understand this is a soft pull and will not affect my credit score.
                  </div>
                </div>
                {start.error && (
                  <StatusLine tone="bad" className="mt">
                    {start.error instanceof Error ? start.error.message : "Pull failed — please retry."}
                  </StatusLine>
                )}
              </Card>
            )}

            {stage === "pulling" && (
              <Card>
                {/* No class owns text-align: center; these three blocks are the
                    only centred surfaces in the flow. */}
                <div style={{ textAlign: "center" }}>
                  {/* Animation and its colour: nothing in the sheet owns
                      either, and the spin is the point of the state. */}
                  <div style={{ display: "inline-block", animation: "spin 1.2s linear infinite", color: "var(--petrol)" }}>
                    <Icon name="refresh" size={28} stroke={2.4} />
                  </div>
                  <h3 className="mt">Pulling… Experian → TransUnion → Equifax</h3>
                  <p className="sub">This usually takes 5–10 seconds.</p>
                </div>
                <style jsx>{`
                  @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                `}</style>
              </Card>
            )}

            {stage === "done" && (
              <Card>
                {start.data?.fico == null ? (
                  // Bureau matched but didn't return a usable score (thin file,
                  // no recent activity). Re-running won't help — show that
                  // explicitly so the operator doesn't burn another pull.
                  <div style={{ textAlign: "center" }}>
                    <CellChip tone="warn">
                      <Icon name="info" size={11} stroke={3} /> No score available
                    </CellChip>
                    <h3 className="mt">The bureau didn&apos;t return a usable score</h3>
                    <p className="sub">
                      This usually means a thin or stale credit file. Re-running a soft pull
                      on the same identity won&apos;t change the result — please contact support
                      if you believe this is an error.
                    </p>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <CellChip tone="ok">
                      <Icon name="check" size={11} stroke={3} /> Verified
                    </CellChip>
                    {/* Hero figure — the payoff of the whole flow. `.knum` is
                        26px and scoped to `.kpi`, `.big` is 29px; neither is
                        this, so the size is the one property set by hand. */}
                    <div className="num" style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, marginTop: 12 }}>
                      {start.data.fico}
                    </div>
                    <p className="sub">
                      Valid through {start.data?.expires_at ? new Date(start.data.expires_at).toLocaleDateString() : "—"}
                    </p>
                    <CreditBriefing pullId={start.data.id} />
                  </div>
                )}
              </Card>
            )}
          </>
        )}
      </div>
    </Drawer>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  hint,
  req,
  bad,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: "text" | "password";
  hint?: ReactNode;
  /** The requirement engine is waiting on this one — rails the label. */
  req?: boolean;
  /** Pairs with `req` so the signal is not colour alone. */
  bad?: boolean;
}) {
  return (
    <DsField label={label} hint={hint} req={req}>
      <Input
        className={cx(bad && "bad")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={type}
        autoComplete={type === "password" ? "off" : undefined}
        inputMode={type === "password" ? "numeric" : undefined}
      />
    </DsField>

  );
}

// US-format DOB input: shows MM / DD / YYYY with auto-slashes; stores
// the canonical ISO YYYY-MM-DD upstream so the bureau payload doesn't
// change. Mirrors qcmobile's DobField — typing 8/15/1980 just works.
function DobField({
  valueIso,
  onChangeIso,
}: {
  valueIso: string;
  onChangeIso: (iso: string) => void;
}) {
  const [display, setDisplay] = useState(() => isoToMmDdYyyy(valueIso));

  // Keep display in sync if parent pushes a new ISO (account pre-fill).
  useEffect(() => {
    const formatted = isoToMmDdYyyy(valueIso);
    if (formatted !== display) setDisplay(formatted);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueIso]);

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    let formatted = digits;
    if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length > 2) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    setDisplay(formatted);
    if (digits.length === 8) {
      const mm = digits.slice(0, 2);
      const dd = digits.slice(2, 4);
      const yyyy = digits.slice(4);
      onChangeIso(`${yyyy}-${mm}-${dd}`);
    } else {
      onChangeIso("");
    }
  };

  return (
    <DsField label="Date of birth" hint="US format · MM / DD / YYYY">
      <Input
        className="num"
        value={display}
        onChange={(e) => onChange(e.target.value)}
        placeholder="MM / DD / YYYY"
        inputMode="numeric"
        maxLength={10}
      />
    </DsField>
  );
}

// US_STATES moved to @/lib/usStates so other forms (SmartIntakeModal,
// etc.) reuse the same authoritative list.

function StateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <DsField label="State">
      {/* The hand-drawn caret (an inline background-image SVG) is gone with
          appearance:none — `.field` keeps the native select control, which is
          the same affordance without the data URI. */}
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="" disabled>Select a state…</option>
        {US_STATES.map((s) => (
          <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
        ))}
      </Select>
    </DsField>
  );
}

// Brief "what's good vs what's a concern" summary for the done stage.
// Pulls the structured summary (already computed by the backend's
// credit_summary service) and shows up to 3 positives + 3 warns.
// Intentionally label-only — operators looking for detail click into
// the full credit summary card on the dashboard.
function CreditBriefing({ pullId }: { pullId: string }) {
  const { data: summary, isLoading } = useCreditSummary(pullId);

  if (isLoading) {
    return <p className="sub mt">Loading briefing…</p>;
  }
  if (!summary) return null;

  const positives = summary.bullets.filter((b) => b.kind === "positive").slice(0, 3);
  const warns = summary.bullets.filter((b) => b.kind === "warn").slice(0, 3);
  if (positives.length === 0 && warns.length === 0) return null;

  return (
    // The briefing reads left-aligned inside the centred done card.
    <div className="grid g10 mt" style={{ textAlign: "left" }}>
      {positives.length > 0 && (
        <div>
          <CellChip tone="ok">What&apos;s good</CellChip>
          <ul className="grid g4 mt">
            {positives.map((b, i) => (
              <li key={i} className="row">
                {/* Marker colour is the section's tone — chosen per list, so
                    it stays inline. `.repdot` owns the shape. */}
                <span className="repdot" style={{ background: "var(--ok)" }} />
                <span className="sub grow">{b.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {warns.length > 0 && (
        <div>
          <CellChip tone="warn">Things to watch</CellChip>
          <ul className="grid g4 mt">
            {warns.map((b, i) => (
              <li key={i} className="row">
                <span className="repdot" style={{ background: "var(--warn)" }} />
                <span className="sub grow">{b.label}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function isoToMmDdYyyy(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return "";
  return `${m[2]}/${m[3]}/${m[1]}`;
}

function isValidDob(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  // Round-trip catches Feb 30, etc.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return false;
  }
  // Reasonable bounds: must be at least 18 years old, not before 1900.
  const today = new Date();
  const eighteenYearsAgo = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate());
  if (d > eighteenYearsAgo) return false;
  if (year < 1900) return false;
  return true;
}

// FastAPI returns 422s like:
//   { detail: { code: "no_hit_provide_ssn", message: "..." } }
// or for plain HTTPException(status, "msg") it returns:
//   { detail: "msg" }
// readErrorCode / readErrorMessage handle both shapes.
function readErrorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (detail && typeof detail === "object" && "code" in detail) {
    const code = (detail as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}

function readErrorMessage(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const body = err.body as { detail?: unknown } | undefined;
  const detail = body?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const msg = (detail as { message?: unknown }).message;
    return typeof msg === "string" ? msg : null;
  }
  return null;
}
