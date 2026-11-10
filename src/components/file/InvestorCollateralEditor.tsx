"use client";

import { useEffect, useRef, useState } from "react";
import { Btn, Callout, Field, Input, Select, Textarea } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { PreparationProgress } from "@/components/design-system/PreparationProgress";
import { ApiError } from "@/lib/api";
import { collateralAssetDraft, collateralAssetPayload, collateralAssetTypes, collateralDraftErrors, collateralPropertyDraft, collateralPropertyPayload, type CollateralAssetDraft, type CollateralPropertyDraft, type InvestorCollateral, type InvestorCollateralSave } from "@/lib/investorCollateral";
import styles from "./InvestorPackageDetails.module.css";

export function InvestorCollateralEditor({ open, initialEnabled, data, load, save, onSaved, onClose }: {
  open: boolean; initialEnabled?: boolean; data: InvestorCollateral;
  load: () => Promise<InvestorCollateral>; save: (input: InvestorCollateralSave) => Promise<InvestorCollateral>;
  onSaved: (next: InvestorCollateral) => Promise<unknown> | void; onClose: () => void;
}) {
  const [base, setBase] = useState(data);
  const [enabled, setEnabled] = useState(data.enabled);
  const [properties, setProperties] = useState(() => data.properties.map(collateralPropertyDraft));
  const [removed, setRemoved] = useState<CollateralPropertyDraft[]>([]);
  const [assets, setAssets] = useState(() => (data.assets ?? []).map(collateralAssetDraft));
  const [removedAssets, setRemovedAssets] = useState<CollateralAssetDraft[]>([]);
  const [dirty, setDirty] = useState(false), [working, setWorking] = useState<"loading" | "saving" | "refreshing" | null>(null), [conflict, setConflict] = useState(false), [closing, setClosing] = useState(false);
  const busy = working !== null;
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const message = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setBase(data); setEnabled(initialEnabled ?? data.enabled); setProperties(data.properties.map(collateralPropertyDraft)); setRemoved([]);
    setAssets((data.assets ?? []).map(collateralAssetDraft)); setRemovedAssets([]);
    setDirty(initialEnabled != null && initialEnabled !== data.enabled); setError(""); setNotice(""); setConflict(false); setClosing(false);
    // A background refresh must not replace entries in an open editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, data.profile_id]);
  useEffect(() => { if (error || notice) message.current?.scrollIntoView({ block: "nearest" }); }, [error, notice]);
  const errors = collateralDraftErrors(enabled, properties, assets);
  const changed = () => { setDirty(true); setNotice(""); setClosing(false); };
  const update = (id: string, patch: Partial<CollateralPropertyDraft>) => { setProperties(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)); changed(); };
  const updateAsset = (id: string, patch: Partial<CollateralAssetDraft>) => { setAssets(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row)); changed(); };
  const close = () => { if (!busy) dirty ? setClosing(true) : onClose(); };
  const restore = (id: string) => { const row = removed.find(item => item.id === id); if (row) setProperties(rows => [...rows, row]); setRemoved(rows => rows.filter(item => item.id !== id)); changed(); };
  async function reload() {
    setWorking("loading"); setError("");
    try { const next = await load(); setBase(next); setEnabled(next.enabled); setProperties(next.properties.map(collateralPropertyDraft)); setRemoved([]); setAssets((next.assets ?? []).map(collateralAssetDraft)); setRemovedAssets([]); setDirty(false); setConflict(false); setClosing(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "The saved collateral could not be loaded."); }
    finally { setWorking(null); }
  }
  async function submit() {
    if (busy || !dirty || conflict || !base.can_edit || errors.length) return;
    setWorking("saving"); setError(""); setNotice("");
    try {
      const next = await save({ expected_revision: base.revision, enabled, properties: properties.map(collateralPropertyPayload), assets: assets.map(collateralAssetPayload) });
      setBase(next); setEnabled(next.enabled); setProperties(next.properties.map(collateralPropertyDraft)); setRemoved([]); setDirty(false);
      setAssets((next.assets ?? []).map(collateralAssetDraft)); setRemovedAssets([]);
      setNotice("Collateral saved across this file. Save updated terms to include this proposal in a new terms version; refresh the investor report afterward.");
      setWorking("refreshing");
      try { await onSaved(next); } catch { setNotice("Collateral saved. Reload the file to refresh its package status."); }
    } catch (reason) {
      const stale = reason instanceof ApiError && reason.status === 409;
      setConflict(stale); setError(stale ? "Collateral changed in another session. Your entries are retained. Reload the saved details before editing again." : reason instanceof Error ? reason.message : "Collateral could not be saved. Your entries are retained; retry Save collateral.");
    } finally { setWorking(null); }
  }
  return <Drawer open={open} onClose={close} title="Loan collateral" sub="One collateral proposal for Coverage plan, Underwriting and the investor package." width="lg" closeOnBackdrop={false} footer={<><Btn onClick={close} disabled={busy}>{dirty ? "Cancel" : "Close"}</Btn><span className="sp" />{base.can_edit ? <Btn variant="pri" disabled={busy || !dirty || conflict || errors.length > 0} onClick={() => void submit()}>{busy ? "Saving…" : "Save collateral"}</Btn> : null}</>}>
    <div className={styles.editor}>
      {closing ? <Callout tone="warn">Discard unsaved collateral changes?<Btn onClick={onClose}>Discard changes and close</Btn><Btn onClick={() => setClosing(false)}>Keep editing</Btn></Callout> : null}
      <div ref={message}>{error ? <Callout tone="bad"><span role="alert">{error}</span>{conflict ? <Btn onClick={() => void reload()} disabled={busy}>Discard edits and reload saved collateral</Btn> : null}</Callout> : null}{notice ? <Callout tone="ok"><span role="status">{notice}</span></Callout> : null}</div>
      {busy ? <PreparationProgress compact title={working === "loading" ? "Opening saved collateral" : working === "refreshing" ? "Collateral saved · refreshing the file" : "Saving collateral details"} description={working === "loading" ? "Loading the current saved property proposal." : working === "refreshing" ? "Refreshing package status to reflect the saved proposal." : "Saving this file’s property proposal and source references."} /> : null}
      {!base.can_edit ? <Callout tone="warn">A Super Admin or Underwriter can edit the proposed collateral.</Callout> : null}
      <fieldset className={styles.fieldset} disabled={busy || !base.can_edit || conflict}>
        <label className={styles.toggle}><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); changed(); }} />Include collateral in the financing proposal</label>
        <p className={styles.hint}>Available lien amounts are declared proposals. Ownership, valuation and lien priority require review. Turning this off retains all saved entries. Saved terms and PDFs keep their recorded snapshot.</p>
        {!enabled ? <Callout tone="acc">These entries are retained in the file and excluded from the current collateral proposal.</Callout> : null}
        <strong>Real estate</strong>
        {base.property_options?.length ? <Field label="Use a property from the real estate schedule"><Select aria-label="Use existing real estate property" value="" onChange={event => {
          const option = base.property_options.find(item => item.id === event.target.value); if (!option) return;
          if (properties.some(item => item.real_estate_property_id === option.id)) { setNotice("That property is already included below."); return; }
          setProperties(rows => [...rows, collateralPropertyDraft({ ...option, currency: option.currency ?? "", id: crypto.randomUUID(), real_estate_property_id: option.id })]); changed();
          if (!option.currency) setNotice("The source schedule did not supply a currency. Enter the property currency before saving this proposal.");
        }} disabled={properties.length >= 100}><option value="">Choose an existing property…</option>{base.property_options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field> : null}
        <div className={styles.properties}>{properties.map((row, index) => <article className={styles.property} key={row.id}>
          <header><strong>Property {index + 1}{row.address.street ? ` · ${row.address.street}` : ""}</strong><Btn size="sm" aria-label={`Remove collateral property ${index + 1}`} onClick={() => { setRemoved(items => [...items, row]); setProperties(items => items.filter(item => item.id !== row.id)); changed(); }}><Icon name="x" size={14} />Remove</Btn></header>
          <div className={styles.grid}>
            <Field label="Street address"><Input aria-label={`Property ${index + 1} street address`} maxLength={250} value={row.address.street} onChange={event => update(row.id, { address: { ...row.address, street: event.target.value } })} /></Field>
            <Field label="City"><Input aria-label={`Property ${index + 1} city`} maxLength={100} value={row.address.city} onChange={event => update(row.id, { address: { ...row.address, city: event.target.value } })} /></Field>
            <Field label="State / province"><Input aria-label={`Property ${index + 1} state`} maxLength={80} value={row.address.state} onChange={event => update(row.id, { address: { ...row.address, state: event.target.value } })} /></Field>
            <Field label="ZIP / postal code"><Input aria-label={`Property ${index + 1} postal code`} maxLength={20} value={row.address.postal_code} onChange={event => update(row.id, { address: { ...row.address, postal_code: event.target.value } })} /></Field>
            <Field label="Owner / legal entity"><Input aria-label={`Property ${index + 1} owner`} maxLength={180} value={row.owner_name ?? ""} onChange={event => update(row.id, { owner_name: event.target.value })} /></Field>
            <Field label="Property type"><Input aria-label={`Property ${index + 1} type`} maxLength={80} placeholder="Commercial, residential, land…" value={row.property_type ?? ""} onChange={event => update(row.id, { property_type: event.target.value })} /></Field>
            {([['estimated_value','Estimated property value'],['existing_liens_total','Existing liens / mortgages'],['available_lien_amount','Available lien amount']] as const).map(([key,label]) => <Field key={key} label={label}><Input aria-label={`Property ${index + 1} ${label.toLowerCase()}`} inputMode="decimal" placeholder="Unknown" value={row[key]} onChange={event => update(row.id, { [key]: event.target.value })} /></Field>)}
            <Field label="Proposed lien position"><Select aria-label={`Property ${index + 1} lien position`} value={row.proposed_lien_position} onChange={event => update(row.id, { proposed_lien_position: event.target.value })}><option value="">Not confirmed</option>{Array.from({ length: 10 }, (_, position) => <option key={position + 1} value={position + 1}>{position + 1}</option>)}</Select></Field>
            <Field label="Valuation date"><Input aria-label={`Property ${index + 1} valuation date`} type="date" value={row.valuation_date ?? ""} onChange={event => update(row.id, { valuation_date: event.target.value })} /></Field>
            <Field label="Currency"><Input aria-label={`Property ${index + 1} currency`} maxLength={3} value={row.currency} onChange={event => update(row.id, { currency: event.target.value.toUpperCase() })} /></Field>
          </div>
          <Field label="Notes / conditions"><Textarea aria-label={`Property ${index + 1} notes`} rows={2} maxLength={2000} value={row.notes ?? ""} onChange={event => update(row.id, { notes: event.target.value })} /></Field>
          {base.source_file_options?.length ? <details className={styles.files}><summary>Supporting files · {row.source_file_ids.length} linked</summary><div>{base.source_file_options.map(file => <label key={file.id}><input type="checkbox" checked={row.source_file_ids.includes(file.id)} onChange={event => update(row.id, { source_file_ids: event.target.checked ? [...row.source_file_ids, file.id] : row.source_file_ids.filter(id => id !== file.id) })} /><span>{file.label}</span></label>)}</div></details> : null}
          {row.real_estate_property_id ? <small className={styles.hint}>Linked to the saved real estate schedule. These proposal edits do not change that schedule.</small> : null}
        </article>)}</div>
        <Btn disabled={properties.length >= 100} onClick={() => { setProperties(rows => [...rows, collateralPropertyDraft()]); changed(); }}><Icon name="plus" size={14} />Add property</Btn>
        {removed.length ? <details className={styles.removed}><summary>Removed in this edit · {removed.length}</summary>{removed.map(row => <div key={row.id}><span>{row.address.street || "Untitled property"}</span><Btn size="sm" disabled={properties.length >= 100} onClick={() => restore(row.id)}>Restore property</Btn></div>)}</details> : null}
        <strong>Other assets</strong>
        <div className={styles.properties}>{assets.map((row, index) => <article className={styles.property} key={row.id}>
          <header><strong>Asset {index + 1}{row.description ? ` · ${row.description}` : ""}</strong><Btn size="sm" aria-label={`Remove collateral asset ${index + 1}`} onClick={() => { setRemovedAssets(items => [...items, row]); setAssets(items => items.filter(item => item.id !== row.id)); changed(); }}><Icon name="x" size={14} />Remove</Btn></header>
          <Field label="Asset description"><Textarea aria-label={`Asset ${index + 1} description`} rows={2} maxLength={300} value={row.description} onChange={event => updateAsset(row.id, { description: event.target.value })} /></Field>
          <div className={styles.grid}>
            <Field label="Asset type"><Select aria-label={`Asset ${index + 1} type`} value={row.asset_type} onChange={event => updateAsset(row.id, { asset_type: event.target.value as CollateralAssetDraft["asset_type"] })}>{Object.entries(collateralAssetTypes).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Owner / legal entity"><Input aria-label={`Asset ${index + 1} owner`} maxLength={180} value={row.owner_name ?? ""} onChange={event => updateAsset(row.id, { owner_name: event.target.value })} /></Field>
            <Field label="Currency"><Input aria-label={`Asset ${index + 1} currency`} maxLength={3} value={row.currency} onChange={event => updateAsset(row.id, { currency: event.target.value.toUpperCase() })} /></Field>
            {([['estimated_value','Estimated asset value'],['existing_liens_total','Existing liens'],['available_lien_amount','Available lien amount']] as const).map(([key,label]) => <Field key={key} label={label}><Input aria-label={`Asset ${index + 1} ${label.toLowerCase()}`} inputMode="decimal" placeholder="Unknown" value={row[key]} onChange={event => updateAsset(row.id, { [key]: event.target.value })} /></Field>)}
            <Field label="Proposed lien position"><Select aria-label={`Asset ${index + 1} lien position`} value={row.proposed_lien_position} onChange={event => updateAsset(row.id, { proposed_lien_position: event.target.value })}><option value="">Not confirmed</option>{Array.from({ length: 10 }, (_, position) => <option key={position + 1} value={position + 1}>{position + 1}</option>)}</Select></Field>
            <Field label="Valuation date"><Input aria-label={`Asset ${index + 1} valuation date`} type="date" value={row.valuation_date ?? ""} onChange={event => updateAsset(row.id, { valuation_date: event.target.value })} /></Field>
          </div>
          <Field label="Notes / conditions"><Textarea aria-label={`Asset ${index + 1} notes`} rows={2} maxLength={2000} value={row.notes ?? ""} onChange={event => updateAsset(row.id, { notes: event.target.value })} /></Field>
          {base.source_file_options?.length ? <details className={styles.files}><summary>Supporting files · {row.source_file_ids.length} linked</summary><div>{base.source_file_options.map(file => <label key={file.id}><input type="checkbox" checked={row.source_file_ids.includes(file.id)} onChange={event => updateAsset(row.id, { source_file_ids: event.target.checked ? [...row.source_file_ids, file.id] : row.source_file_ids.filter(id => id !== file.id) })} /><span>{file.label}</span></label>)}</div></details> : null}
        </article>)}</div>
        <Btn disabled={assets.length >= 100} onClick={() => { setAssets(rows => [...rows, collateralAssetDraft()]); changed(); }}><Icon name="plus" size={14} />Add asset</Btn>
        {removedAssets.length ? <details className={styles.removed}><summary>Assets removed in this edit · {removedAssets.length}</summary>{removedAssets.map(row => <div key={row.id}><span>{row.description || "Untitled asset"}</span><Btn size="sm" disabled={assets.length >= 100} onClick={() => { setAssets(rows => [...rows, row]); setRemovedAssets(rows => rows.filter(item => item.id !== row.id)); changed(); }}>Restore asset</Btn></div>)}</details> : null}
      </fieldset>
      {dirty && errors.length ? <ul className={styles.errors} aria-label="Collateral validation">{errors.map(item => <li key={item}>{item}</li>)}</ul> : null}
      {base.updated_at ? <small className={styles.hint}>Saved revision {base.revision} · {new Date(base.updated_at).toLocaleString()}</small> : null}
    </div>
  </Drawer>;
}
