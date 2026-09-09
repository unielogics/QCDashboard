import { useState } from "react";
import type { PackageClient, SponsorCompanyFields } from "../client";
import { dateLabel, errorDetail, errorMessage, openSignedUrl, toNumber } from "../format";
import { IconLink } from "../icons";
import { FIELD_BY_KEY, isBlank } from "../schema";
import { Callout, Field, PBtn, PChip, PPanel, ProvChip, SigOnFileChip, type StepCtx } from "../ui";
import type { OwnerRow, ProductionPackage, SponsorOption } from "../types";

export function Step1Parties({ ctx, sponsors, client, onPackage }: { ctx: StepCtx; sponsors: SponsorOption[]; client?: PackageClient; onPackage?: (p: ProductionPackage) => void }) {
  const { pkg, draft, readOnly, mode } = ctx;
  const two = pkg.stage === 2;
  const operator = mode === "operator";
  const [editSponsor, setEditSponsor] = useState(false);
  const canPick = pkg.capabilities.can_pick_sponsor && !readOnly;
  const sponsor = pkg.sponsor;
  const agreement = sponsor?.agreement ?? null;
  const [query, setQuery] = useState("");
  const filtered = sponsors.filter((s) => !query.trim() || s.name.toLowerCase().includes(query.trim().toLowerCase()));
  const sponsorDefault = pkg.sponsor_default ?? null;
  const copySigningLink = () => { navigator.clipboard?.writeText(pkg.sponsor_signing_url); ctx.notify("Signing link copied — the package can be sent once the sponsor has signed.", "ok"); };
  // The company's platform was never backfilled for companies that signed
  // before it existed, so a pick can land with a blank required field. Ask
  // once, save it on the company, and every package that names it carries it.
  const [platformDraft, setPlatformDraft] = useState("");
  const [platformBusy, setPlatformBusy] = useState(false);
  const platformMissing = Boolean(operator && sponsor && !two && !readOnly && !sponsor.platform_name && isBlank(FIELD_BY_KEY.sponsor_platform, draft.sponsor_platform) && client?.updateSponsor && ctx.pickSponsor);
  const savePlatform = async () => {
    if (!client?.updateSponsor || !sponsor || !ctx.pickSponsor || platformDraft.trim().length < 2) return;
    setPlatformBusy(true);
    try {
      await client.updateSponsor(sponsor.company_id, { platform_name: platformDraft.trim() });
      await ctx.pickSponsor(sponsor.company_id);
      setPlatformDraft("");
      ctx.notify(`${sponsor.name}'s platform is saved on the company.`, "ok");
    } catch (err) {
      ctx.notify(errorMessage(err, "The platform could not be saved."), "bad");
    } finally { setPlatformBusy(false); }
  };
  const sof = pkg.signatures_on_file ?? {};
  const [authAsk, setAuthAsk] = useState(false);
  const [authNote, setAuthNote] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const canAuthorize = pkg.capabilities.can_adopt_sponsor_signature && Boolean(sponsor && agreement) && sof.sponsor !== undefined && !sof.sponsor.present && Boolean(client?.adoptSponsorSignature);
  const authorize = async () => {
    if (!client?.adoptSponsorSignature) return;
    setAuthBusy(true);
    try {
      await client.adoptSponsorSignature(authNote.trim());
      if (onPackage) onPackage(await client.load());
      ctx.notify(`${sponsor?.name ?? "Sponsor"}'s signature on file is authorized for production agreements.`, "ok");
      setAuthAsk(false);
      setAuthNote("");
    } catch (err) {
      const detail = errorDetail(err);
      ctx.notify(typeof detail?.message === "string" ? detail.message : errorMessage(err, "The signature could not be authorized."), "bad");
    } finally { setAuthBusy(false); }
  };
  const owners = Array.isArray(draft.owners) ? (draft.owners as OwnerRow[]) : [];
  const ownerPct = owners.reduce((acc, o) => acc + toNumber(o.pct), 0);

  // The sponsor company itself, not this package's copy of it. There was no
  // write path for one of these rows anywhere in the product, so a company that
  // arrived from the invite flow without an entity type stayed blank on every
  // package forever.
  const [company, setCompany] = useState<Partial<SponsorCompanyFields> | null>(null);
  const [companyBusy, setCompanyBusy] = useState(false);
  const canEditCompany = Boolean(sponsor?.editable && client?.updateSponsor) && !readOnly && !two;
  const openCompany = () => setCompany({
    entity_type: sponsor?.entity_type ?? "", state_of_formation: sponsor?.state_of_formation ?? "",
    principal_address: sponsor?.principal_address ?? "", notice_email: sponsor?.notice_email ?? "",
    notice_attention: sponsor?.notice_attention ?? "", notice_address: sponsor?.notice_address ?? "",
    platform_name: sponsor?.platform_name ?? "", signatory_name: sponsor?.signatory_name ?? "",
    signatory_title: sponsor?.signatory_title ?? "", phone: sponsor?.phone ?? "",
  });
  const saveCompany = async () => {
    if (!client?.updateSponsor || !sponsor || !company) return;
    setCompanyBusy(true);
    try {
      await client.updateSponsor(sponsor.company_id, company);
      // Re-choosing the same sponsor is what copies the corrected values onto
      // this package; the company is the record, the package holds a copy.
      if (ctx.pickSponsor) await ctx.pickSponsor(sponsor.company_id);
      else if (onPackage) onPackage(await client.load());
      setCompany(null);
      ctx.notify(`${sponsor.name} updated. Every new package will use these details.`, "ok");
    } catch (err) {
      ctx.notify(errorMessage(err, "The sponsor could not be updated."), "bad");
    } finally { setCompanyBusy(false); }
  };
  const companyField = (k: keyof SponsorCompanyFields, label: string, placeholder?: string) => (
    <div className="pp-field">
      <label className="pp-lbl" htmlFor={`pp-sponsor-${k}`}>{label}</label>
      <input id={`pp-sponsor-${k}`} className="pp-input" placeholder={placeholder}
        value={company?.[k] ?? ""} onChange={(e) => setCompany((c) => ({ ...c, [k]: e.target.value }))} />
    </div>
  );

  // Prefill runs once, when the package is created. Anything the file learns
  // afterwards — an entity type read off a later upload, an amount the dealer
  // restated to the AI — never arrived. This asks again, and only fills blanks.
  const [refill, setRefill] = useState<string[] | null>(null);
  const [refilling, setRefilling] = useState(false);
  const canRefill = Boolean(client?.prefill) && operator && !readOnly;
  const lookAtTheFile = async () => {
    if (!client?.prefill) return;
    setRefilling(true);
    try {
      const dry = await client.prefill({ apply: false });
      const fillable = dry.skipped.filter((k) => FIELD_BY_KEY[k]);
      if (!fillable.length) ctx.notify("Every field the file can answer is already filled.", "mut");
      else setRefill(fillable);
    } catch (err) {
      ctx.notify(errorMessage(err, "The file could not be read."), "bad");
    } finally { setRefilling(false); }
  };
  const applyRefill = async () => {
    if (!client?.prefill) return;
    setRefilling(true);
    try {
      const out = await client.prefill({ apply: true });
      if (onPackage) onPackage(await client.load());
      setRefill(null);
      ctx.notify(`Filled ${out.applied.length} field${out.applied.length === 1 ? "" : "s"} from the file.`, "ok");
    } catch (err) {
      ctx.notify(errorMessage(err, "The fields could not be filled."), "bad");
    } finally { setRefilling(false); }
  };

  return (
    <>
      <PPanel
        title="Dealer" sub="The business receiving the advance, exactly as it should print on both agreements."
        right={canRefill ? <PBtn size="sm" onClick={lookAtTheFile} busy={refilling}>Refill from the file</PBtn> : null}>
        {refill ? (
          <Callout tone="mut">
            The file can answer {refill.length} blank field{refill.length === 1 ? "" : "s"}: {refill.map((k) => FIELD_BY_KEY[k]?.label ?? k).join(", ")}. Nothing already filled is touched.
            <div className="pp-row" style={{ marginTop: 8 }}>
              <PBtn variant="pri" size="sm" onClick={applyRefill} busy={refilling}>Fill {refill.length}</PBtn>
              <PBtn size="sm" onClick={() => setRefill(null)}>Leave them</PBtn>
            </div>
          </Callout>
        ) : null}
        <div className="pp-grid">
          <Field ctx={ctx} k="dealer_name" span={2} />
          <Field ctx={ctx} k="dealer_dba" />
          <Field ctx={ctx} k="dealer_entity" />
          <Field ctx={ctx} k="dealer_state" />
          <Field ctx={ctx} k="dealer_address" span={2} placeholder="Street, city, state ZIP" />
          <Field ctx={ctx} k="dealer_signer_name" placeholder="Full legal name" />
          <Field ctx={ctx} k="dealer_signer_title" placeholder="Managing member, President…" />
          {two ? <Field ctx={ctx} k="dealer_notice_email" /> : null}
        </div>
      </PPanel>

      {two ? (
        <>
          <PPanel title="Business identity (§9.1)" sub="The dealer's formation particulars as they print on the Activation agreement. Prefilled from the dealer file where it has them.">
            <div className="pp-grid">
              <Field ctx={ctx} k="identity_formation_date" />
              <Field ctx={ctx} k="identity_ein" placeholder="12-3456789" />
              <Field ctx={ctx} k="identity_naics" placeholder="441110" />
              <Field ctx={ctx} k="identity_license" />
              <Field ctx={ctx} k="identity_website" span={2} placeholder="https://" />
            </div>
          </PPanel>
          <PPanel title="Ownership schedule (§9.2)" sub="Every owner, totalling exactly 100.00%. At most five rows print."
            right={owners.length ? <PChip tone={Math.abs(ownerPct - 100) <= 0.01 ? "ok" : "bad"}>{ownerPct.toLocaleString("en-US", { maximumFractionDigits: 2 })}% of 100%</PChip> : null}>
            <div className="pp-grid"><Field ctx={ctx} k="owners" span={3} /></div>
          </PPanel>
        </>
      ) : null}

      <PPanel
        title="Sponsor" sub={two ? "Carried from the executed commitment. The sponsor is not changed on the final." : "Warranty provider, administrator, or sales organization — must hold a signed Strategic Referral, Capital Advisory and Business Relationship Protection Agreement."}
        right={agreement ? (
          <span className="pp-agree">
            <PChip tone="ok">Agreement on file · {agreement.contract_number} · signed {dateLabel(agreement.signed_at)}</PChip>
            {operator ? <SigOnFileChip sof={sof.sponsor} /> : null}
            {agreement.certificate_url ? <PBtn size="sm" onClick={() => openSignedUrl(agreement.certificate_url)}>Certificate</PBtn> : null}
            {agreement.admin_url ? <a className="pp-btn v-link s-sm" href={agreement.admin_url} target="_blank" rel="noreferrer"><IconLink />Agreement record</a> : null}
          </span>
        ) : sponsor && operator ? <PChip tone="bad">No signed agreement</PChip>
          : sponsor && sponsor.has_agreement ? <PChip tone="ok">Agreement on file</PChip> : null}
      >
        {!operator ? (
          // A rep reads the sponsor; the blank-sponsor row sits under "Waiting on the desk" in the attention list.
          <div className="pp-kv"><span className="pp-lbl">Sponsor</span><span className="pp-val">{sponsor ? sponsor.name : <span className="pp-sub">— chosen by the desk</span>}</span></div>
        ) : (
          <div className="pp-field" id="pp-field-sponsor_name">
            <label className="pp-lbl" htmlFor="pp-in-sponsor_name">Sponsor company<span className="pp-req">*</span></label>
            {canPick && ctx.sponsorsError ? (
              <Callout tone="bad">The list of signed companies could not be loaded. <PBtn size="sm" onClick={ctx.reloadSponsors}>Try again</PBtn></Callout>
            ) : canPick && !sponsors.length && !sponsor ? (
              <Callout tone="mut">No company has signed the Strategic Referral agreement yet. <button type="button" className="pp-btn v-link s-sm" onClick={copySigningLink}>Copy signing link</button></Callout>
            ) : canPick ? (
              <div className="pp-sponsor-pick">
                <input id="pp-in-sponsor_name" className="pp-input" placeholder="Search signed companies…" value={query} onChange={(e) => setQuery(e.target.value)} autoComplete="off" />
                <select className="pp-input" value={sponsor?.company_id ?? ""} onChange={(e) => { void ctx.pickSponsor?.(e.target.value || null); }}>
                  <option value="">Choose a sponsor…</option>
                  {filtered.map((s) => <option key={s.company_id} value={s.company_id}>{s.name}{s.agreement ? ` · ${s.agreement.contract_number}` : ""}</option>)}
                </select>
              </div>
            ) : (
              <div className="pp-static">{sponsor?.name || String(draft.sponsor_name || "") || "—"}</div>
            )}
            {sponsor ? <div className="pp-row" style={{ marginTop: 4 }}><ProvChip provenance={pkg.prefill_provenance.sponsor_name} onConfirm={() => ctx.confirm("sponsor_name")} readOnly={!canPick} /></div> : null}
            {sponsorDefault && !sponsorDefault.applied && sponsorDefault.signed && sponsor ? (
              <div className="pp-hint">{sponsorDefault.person_name} is linked to {sponsorDefault.name}.</div>
            ) : null}
            {!sponsor && !readOnly && !two ? (
              <div className="pp-hint">
                {sponsorDefault && !sponsorDefault.signed
                  ? <>{sponsorDefault.person_name} is linked to <b>{sponsorDefault.name}</b>, which has not signed the agreement yet. Send it to them:&nbsp;</>
                  : <>Not on the list? Send the sponsor the agreement:&nbsp;</>}
                <button type="button" className="pp-btn v-link s-sm" onClick={copySigningLink}>Copy signing link</button>
              </div>
            ) : null}
          </div>
        )}
        {platformMissing && sponsor ? (
          <div className="pp-inline">
            <b>{sponsor.name} has no administration platform recorded.</b>
            <p className="pp-sub">Enter it once — it is saved on the company, and every package that names {sponsor.name} carries it. For this package only, use &ldquo;Edit this package&apos;s copy&rdquo; below.</p>
            <input className="pp-input" placeholder="The administration platform on Schedule A" value={platformDraft} onChange={(e) => setPlatformDraft(e.target.value)} />
            <div className="pp-row"><PBtn variant="pri" size="sm" onClick={savePlatform} busy={platformBusy} disabled={platformDraft.trim().length < 2}>Save to the company</PBtn></div>
          </div>
        ) : null}
        {operator && sponsor && sof.sponsor && !sof.sponsor.present ? (
          <div className="pp-inline">
            <b>No sponsor signature on file.</b>
            <p className="pp-sub">{sof.sponsor.how_to_fix ?? "Authorize the sponsor's agreement signature for use on production agreements."} Every counterparty signature is placed from file when the package is sent.</p>
            {canAuthorize && !authAsk ? <div className="pp-row"><PBtn variant="pri" size="sm" onClick={() => setAuthAsk(true)}>Authorize signature on file</PBtn></div> : null}
            {authAsk ? (
              <>
                <p className="pp-sub">The officer signature captured on {agreement?.contract_number ?? "the Referral Protection Agreement"} ({agreement?.signer_name ?? "signer"}{agreement?.signer_title ? `, ${agreement.signer_title}` : ""}) will be placed on every production agreement this sponsor is party to. Note the authorization — it is kept in the audit trail.</p>
                <input className="pp-input" placeholder="Authorization note (e.g. confirmed with the sponsor's officer on the phone)" value={authNote} onChange={(e) => setAuthNote(e.target.value)} />
                <div className="pp-row"><PBtn variant="pri" size="sm" onClick={authorize} busy={authBusy} disabled={authNote.trim().length < 3}>Authorize</PBtn><PBtn size="sm" onClick={() => setAuthAsk(false)}>Cancel</PBtn></div>
              </>
            ) : null}
          </div>
        ) : null}
        <div className="pp-grid" style={{ marginTop: 10 }}>
          {sponsor && (!editSponsor || two) && operator ? (
            <>
              <div className="pp-kv"><span className="pp-lbl">Legal name</span><span className="pp-val">{String(draft.sponsor_name || sponsor.name)}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Entity / state</span><span className="pp-val">{[draft.sponsor_entity, draft.sponsor_state].filter(Boolean).join(" / ") || "—"}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Principal address</span><span className="pp-val">{String(draft.sponsor_address || "—")}</span></div>
              <div className="pp-kv"><span className="pp-lbl">Notice email</span><span className="pp-val">{String(draft.sponsor_email || "—")}</span></div>
              {!readOnly && !two ? (
                <div className="pp-row">
                  <PBtn size="sm" onClick={() => setEditSponsor(true)}>Edit this package&apos;s copy</PBtn>
                  {canEditCompany ? <PBtn size="sm" onClick={openCompany}>Correct the sponsor company</PBtn> : null}
                </div>
              ) : null}
            </>
          ) : operator && !two ? (
            <>
              <Field ctx={ctx} k="sponsor_entity" />
              <Field ctx={ctx} k="sponsor_state" />
              <Field ctx={ctx} k="sponsor_address" span={2} />
              <Field ctx={ctx} k="sponsor_email" />
            </>
          ) : null}
          <Field ctx={ctx} k="sponsor_platform" placeholder="The administration platform on Schedule A" />
        </div>
        {company ? (
          <div className="pp-note" style={{ marginTop: 12 }}>
            <p className="pp-sub">
              These are the sponsor company&apos;s own details, shared by every package that names it — not just this one.
              Blanks were filled from the signed Strategic Referral agreement where it recorded them.
              Saving copies them onto this package too.
            </p>
            <div className="pp-grid">
              {companyField("entity_type", "Entity type", "Limited liability company")}
              {companyField("state_of_formation", "State of formation", "NJ")}
              {companyField("principal_address", "Principal address", "Street, city, state ZIP")}
              {companyField("platform_name", "Administration platform", "Named on Schedule A")}
              {companyField("notice_email", "Notice email", "Notice is served here")}
              {companyField("notice_attention", "Notice attention", "Who it is marked for")}
              {companyField("notice_address", "Notice address", "If different from the principal address")}
              {companyField("phone", "Phone", "(973) 555-0148")}
              {companyField("signatory_name", "Signatory", "Who signs for the sponsor")}
              {companyField("signatory_title", "Signatory title", "CEO, COO…")}
            </div>
            <div className="pp-row" style={{ marginTop: 10 }}>
              <PBtn variant="pri" size="sm" onClick={saveCompany} busy={companyBusy}>Save the sponsor</PBtn>
              <PBtn size="sm" onClick={() => setCompany(null)}>Cancel</PBtn>
            </div>
          </div>
        ) : null}
      </PPanel>

      <PPanel title="Relationship manager" sub="Schedule 2 names the manager and their compensation category. Their acknowledgment is placed from the signature on file when the package is sent."
        right={operator ? <SigOnFileChip sof={sof.rm} /> : null}>
        <div className="pp-grid">
          <Field ctx={ctx} k="rm_name" teamPicker={operator} kind={operator ? "select" : "text"} />
          <Field ctx={ctx} k="rm_employer" />
          <Field ctx={ctx} k="rm_email" />
          <Field ctx={ctx} k="rm_phone" placeholder="(973) 555-0148" />
        </div>
        {operator && sof.rm && !sof.rm.present ? <Callout tone="warn">{sof.rm.how_to_fix}</Callout> : null}
        {operator && sof.rm && sof.rm.phone_present === false && sof.rm.phone_how_to_fix && draft.rm_user_id ? <Callout tone="warn">{sof.rm.phone_how_to_fix}</Callout> : null}
      </PPanel>
    </>
  );
}
