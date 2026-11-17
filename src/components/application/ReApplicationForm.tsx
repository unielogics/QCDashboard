"use client";

// The real-estate loan application, filled from what the file already knows.
// It opens on what is still needed; answers onboarding captured sit folded in
// "Already on your application" (editable), values the AI suggested ask for a
// "Looks right", and a review shows everything before the client submits,
// because they certify all of it. Used on the client's link page and in the
// desk's drawer (audience "desk" adds the dropped-value warnings).

import { useMemo, useState } from "react";
import {
  applicableFields,
  displayValue,
  getAt,
  inputValue,
  isBlank,
  parseInput,
  type ApplicationView,
  type FieldRef,
  type FieldSpec,
} from "@/lib/reApplication";

type Props = {
  view: ApplicationView;
  body: Record<string, unknown>;
  problems: Record<string, string>;
  busy: boolean;
  audience: "client" | "desk";
  onValue: (path: string, value: unknown) => void;
  onConfirm: (path: string) => void;
  onCoborrower: (on: boolean) => void;
};

function roleHeading(ref: FieldRef): string {
  return ref.role === "coborrower" ? "Co-borrower" : ref.role === "borrower" ? "Borrower" : ref.section.label;
}

function groupBySection(refs: FieldRef[]): { key: string; label: string; refs: FieldRef[] }[] {
  const groups: { key: string; label: string; refs: FieldRef[] }[] = [];
  for (const ref of refs) {
    const key = ref.role ? `${ref.section.key}.${ref.role}` : ref.section.key;
    const label = ref.role ? roleHeading(ref) : ref.section.label;
    let group = groups.find((item) => item.key === key);
    if (!group) {
      group = { key, label, refs: [] };
      groups.push(group);
    }
    group.refs.push(ref);
  }
  return groups;
}

function FieldInput({ spec, path, value, problem, disabled, onValue }: { spec: FieldSpec; path: string; value: unknown; problem?: string; disabled: boolean; onValue: (path: string, value: unknown) => void }) {
  const id = `ra-${path.replace(/\./g, "-")}`;
  const label = <label htmlFor={id}>{spec.label}{spec.required ? <em className="fp-req" aria-hidden="true">*</em> : null}</label>;
  let control;
  if (spec.type === "select") {
    control = (
      <select id={id} value={isBlank(value) ? "" : String(value)} disabled={disabled} onChange={(event) => onValue(path, event.target.value || null)}>
        <option value="">Choose…</option>
        {spec.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    );
  } else if (spec.type === "multiselect") {
    const chosen = Array.isArray(value) ? (value as string[]) : [];
    control = (
      <div role="group" aria-labelledby={id} className="ra-checks">
        {spec.options?.map((option) => (
          <label key={option.value} className="ra-check">
            <input type="checkbox" disabled={disabled} checked={chosen.includes(option.value)} onChange={(event) => onValue(path, event.target.checked ? [...chosen, option.value] : chosen.filter((item) => item !== option.value))} />
            {option.label}
          </label>
        ))}
      </div>
    );
  } else if (spec.type === "yesno") {
    control = (
      <div role="radiogroup" aria-labelledby={id} className="ra-yesno">
        {[["Yes", true], ["No", false]].map(([text, flag]) => (
          <label key={String(text)} className="ra-check">
            <input type="radio" name={id} disabled={disabled} checked={value === flag} onChange={() => onValue(path, flag)} />
            {String(text)}
          </label>
        ))}
      </div>
    );
  } else if (spec.type === "textarea") {
    control = <textarea key={`${path}:${String(value ?? "")}`} id={id} rows={3} disabled={disabled} defaultValue={inputValue(spec, value)} onBlur={(event) => onValue(path, parseInput(spec, event.target.value))} />;
  } else {
    const numeric = ["money", "integer", "year", "percent", "score", "zip", "ssn_last4"].includes(spec.type);
    control = (
      <input
        key={`${path}:${String(value ?? "")}`}
        id={id}
        type={spec.type === "date" ? "date" : spec.type === "email" ? "email" : spec.type === "phone" ? "tel" : "text"}
        inputMode={numeric ? "decimal" : undefined}
        maxLength={spec.type === "ssn_last4" ? 4 : spec.type === "state" ? 2 : undefined}
        autoComplete={spec.sensitive ? "off" : undefined}
        disabled={disabled}
        defaultValue={inputValue(spec, value)}
        placeholder={spec.type === "money" ? "0" : spec.type === "state" ? "NC" : spec.type === "ssn_last4" ? "1234" : undefined}
        onBlur={(event) => onValue(path, parseInput(spec, event.target.value))}
      />
    );
  }
  return (
    <div className={problem ? "fp-field is-invalid" : "fp-field"}>
      {spec.type === "multiselect" || spec.type === "yesno" ? <span id={id} className="ra-label">{spec.label}{spec.required ? <em className="fp-req" aria-hidden="true">*</em> : null}</span> : label}
      {control}
      {spec.help ? <span className="fp-hint">{spec.help}</span> : null}
      {problem ? <span className="fp-field-problem" role="alert">{problem}</span> : null}
    </div>
  );
}

export function ReApplicationForm({ view, body, problems, busy, audience, onValue, onConfirm, onCoborrower }: Props) {
  const fields = useMemo(() => applicableFields(view.schema, body), [view.schema, body]);
  // A field shown as a gap in this sitting stays where it is while it is
  // typed into, instead of jumping into "Already on your application".
  const [sticky, setSticky] = useState<Set<string>>(() => new Set([...view.completion.missing, ...view.please_check]));
  const needed = useMemo(() => {
    const missing = new Set([...view.completion.missing, ...view.please_check, ...sticky]);
    return fields.filter((ref) => missing.has(ref.path) || (ref.spec.required && isBlank(getAt(body, ref.path))));
  }, [fields, view.completion.missing, view.please_check, sticky, body]);
  const neededPaths = new Set(needed.map((ref) => ref.path));
  const answered = fields.filter((ref) => !neededPaths.has(ref.path) && !isBlank(getAt(body, ref.path)));
  const optional = fields.filter((ref) => !neededPaths.has(ref.path) && isBlank(getAt(body, ref.path)) && !ref.spec.required);
  const reopen = (path: string) => setSticky((current) => new Set([...current, path]));
  const disabled = busy;

  return (
    <div className="fp-stack ra-form">
      <div className="fp-card ra-progress">
        <div className="ra-progress-row">
          <strong>{view.completion.filled} of {view.completion.total} answered</strong>
          <span className="fp-hint">{needed.length ? `${needed.length} still needed` : "Everything required is answered"}</span>
        </div>
        <div className="ra-bar" aria-hidden="true"><span style={{ width: `${view.completion.total ? Math.round((view.completion.filled / view.completion.total) * 100) : 100}%` }} /></div>
        <p className="fp-legend">Most of this came from your application. Answer what is left, check what we filled in for you, then review and submit.</p>
      </div>

      {audience === "desk" && view.warnings?.length ? (
        <div className="fp-card ra-warnings" role="note">
          <strong>Values on the file that were left blank</strong>
          <ul>{view.warnings.map((warning) => <li key={`${warning.path}:${warning.message}`}>{warning.message}</li>)}</ul>
        </div>
      ) : null}

      {groupBySection(needed).map((group) => (
        <section key={group.key} className="fp-card ra-section" aria-label={`${group.label}: still needed`}>
          <h2 className="ra-section-title">{group.label}</h2>
          <div className="fp-grid">
            {group.refs.map((ref) => {
              const check = view.please_check.includes(ref.path);
              const source = view.provenance[ref.path];
              return (
                <div key={ref.path} className={check ? "ra-check-field" : undefined}>
                  <FieldInput spec={ref.spec} path={ref.path} value={getAt(body, ref.path)} problem={problems[ref.path]} disabled={disabled} onValue={(path, value) => { reopen(path); onValue(path, value); }} />
                  {check ? (
                    <div className="ra-check-row">
                      <span className="ra-chip ra-chip-check">Please check · {source?.source}</span>
                      <button type="button" className="fp-link-btn" disabled={disabled} onClick={() => onConfirm(ref.path)}>Looks right</button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <div className="fp-card ra-coborrower">
        <label className="ra-check">
          <input type="checkbox" disabled={disabled} checked={Boolean(body.has_coborrower)} onChange={(event) => onCoborrower(event.target.checked)} />
          Someone else is borrowing with me (a co-borrower signs too)
        </label>
      </div>

      {answered.length ? (
        <details className="fp-card ra-answered">
          <summary>Already on your application ({answered.length})</summary>
          {groupBySection(answered).map((group) => (
            <div key={group.key} className="ra-answered-group">
              <h3>{group.label}</h3>
              <dl>
                {group.refs.map((ref) => (
                  <div key={ref.path} className="ra-answered-row">
                    <dt>{ref.spec.label}</dt>
                    <dd>
                      <span>{displayValue(ref.spec, getAt(body, ref.path))}</span>
                      {view.provenance[ref.path] ? <span className="ra-chip">{view.provenance[ref.path].source}</span> : null}
                      <button type="button" className="fp-link-btn" disabled={disabled} onClick={() => reopen(ref.path)}>Change</button>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
        </details>
      ) : null}

      {optional.length ? (
        <details className="fp-card ra-optional">
          <summary>More details you can add (optional, {optional.length})</summary>
          {groupBySection(optional).map((group) => (
            <div key={group.key} className="ra-answered-group">
              <h3>{group.label}</h3>
              <div className="fp-grid">
                {group.refs.map((ref) => <FieldInput key={ref.path} spec={ref.spec} path={ref.path} value={getAt(body, ref.path)} problem={problems[ref.path]} disabled={disabled} onValue={onValue} />)}
              </div>
            </div>
          ))}
        </details>
      ) : null}
    </div>
  );
}

/** The whole application, read-only, before submitting. */
export function ReApplicationReview({ view, body, onEdit }: { view: ApplicationView; body: Record<string, unknown>; onEdit: () => void }) {
  const fields = applicableFields(view.schema, body);
  return (
    <div className="fp-stack ra-form">
      <div className="fp-card">
        <p className="fp-intro">This is your whole application as it will be signed. Check every answer; you certify all of it.</p>
        <button type="button" className="fp-link-btn" onClick={onEdit}>Go back and change an answer</button>
      </div>
      {groupBySection(fields).map((group) => (
        <section key={group.key} className="fp-card ra-section">
          <h2 className="ra-section-title">{group.label}</h2>
          <dl className="ra-review">
            {group.refs.map((ref) => (
              <div key={ref.path} className="ra-answered-row">
                <dt>{ref.spec.label}</dt>
                <dd>{isBlank(getAt(body, ref.path)) ? <span className="fp-hint">Not provided</span> : displayValue(ref.spec, getAt(body, ref.path))}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
