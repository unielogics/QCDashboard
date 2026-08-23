"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, Field, IconBtn, Input, Panel, Select } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { useAuthedApi } from "@/hooks/useApi";
import type {
  ApplicationProfile,
  ApplicationSourceKind,
  ClassificationPatch,
  ClassificationPreview,
} from "@/lib/applicationProfile";

const VERTICALS: Array<[ApplicationProfile["vertical"], string]> = [
  ["real_estate", "Real estate"],
  ["main_street", "Main Street"],
  ["dealer", "Dealer"],
  ["mca", "MCA"],
];

function editableValues(profile: ApplicationProfile): ClassificationPatch {
  return {
    vertical: profile.vertical,
    funding_category: profile.funding_category,
    entity_type: profile.entity_type,
    industry: profile.industry,
    naics_code: profile.naics_code,
    naics_label: profile.naics_label,
    custom_industry: profile.custom_industry,
  };
}

function valueLabel(value: string | null) {
  return value?.trim() || "Not set";
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return <div className="line"><span className="sub">{label}</span><strong>{value}</strong></div>;
}

export function ApplicationClassificationPanel({ sourceKind, sourceId }: {
  sourceKind: ApplicationSourceKind;
  sourceId: string;
}) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ClassificationPatch | null>(null);
  const [preview, setPreview] = useState<ClassificationPreview | null>(null);
  const [error, setError] = useState("");
  const queryKey = ["application-profile", sourceKind, sourceId] as const;
  const profile = useQuery({
    queryKey,
    queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", {
      method: "POST",
      body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }),
    }),
    enabled: Boolean(sourceId),
  });

  useEffect(() => {
    if (profile.data && !open) setDraft(editableValues(profile.data));
  }, [profile.data, open]);

  const review = useMutation({
    mutationFn: (body: ClassificationPatch) => apiCall<ClassificationPreview>(`/application-profiles/${profile.data?.id}/classification/preview`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    onSuccess: (data) => { setPreview(data); setError(""); },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Classification could not be reviewed."),
  });
  const confirm = useMutation({
    mutationFn: () => apiCall<ApplicationProfile>(`/application-profiles/${profile.data?.id}/classification/confirm`, {
      method: "POST",
      body: JSON.stringify({ ...draft, expected_revision: preview?.current_revision }),
    }),
    onSuccess: async (updated) => {
      qc.setQueryData(queryKey, updated);
      await qc.invalidateQueries({ queryKey: ["application-profile-audit", updated.id] });
      setOpen(false);
      setPreview(null);
      setError("");
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "Classification could not be changed."),
  });

  const current = profile.data;
  const verticalLabel = VERTICALS.find(([value]) => value === current?.vertical)?.[1] ?? "Not set";

  function startEdit() {
    if (!current) return;
    setDraft(editableValues(current));
    setPreview(null);
    setError("");
    setOpen(true);
  }

  function close() {
    if (review.isPending || confirm.isPending) return;
    setOpen(false);
    setPreview(null);
    setError("");
  }

  function update<K extends keyof ClassificationPatch>(key: K, value: ClassificationPatch[K]) {
    setDraft((currentDraft) => currentDraft ? { ...currentDraft, [key]: value } : currentDraft);
    setPreview(null);
  }

  return (
    <>
      <Panel
        title="Classification"
        actions={
          <IconBtn onClick={startEdit} aria-label="Edit file classification" title="Edit file classification" disabled={!current}>
            <Icon name="pencil" size={14} />
          </IconBtn>
        }
      >
        {profile.isLoading ? <div className="sub">Loading classification...</div> : profile.isError ? <Callout tone="bad">Classification is unavailable.</Callout> : (
          <>
            <DetailLine label="Vertical" value={verticalLabel} />
            <DetailLine label="Funding category" value={valueLabel(current?.funding_category ?? null)} />
            <DetailLine label="Entity type" value={valueLabel(current?.entity_type ?? null)} />
            <DetailLine label="Industry" value={valueLabel(current?.industry ?? current?.custom_industry ?? null)} />
            <DetailLine label="NAICS" value={valueLabel(current?.naics_code ? `${current.naics_code}${current.naics_label ? ` · ${current.naics_label}` : ""}` : null)} />
            <DetailLine label="Revision" value={String(current?.classification_revision ?? 1)} />
          </>
        )}
      </Panel>

      <Drawer
        open={open}
        onClose={close}
        title={preview ? "Review classification change" : "Edit file classification"}
        sub={preview ? "Confirm the operational effects before changing the file." : "Update the controlled taxonomy used by requirements, evidence, and underwriting."}
        width="md"
        closeOnBackdrop={!review.isPending && !confirm.isPending}
        footer={preview ? (
          <><Btn onClick={() => setPreview(null)} disabled={confirm.isPending}>Back</Btn><span className="sp" /><Btn onClick={close} disabled={confirm.isPending}>Cancel</Btn><Btn variant="pri" onClick={() => confirm.mutate()} disabled={confirm.isPending}>{confirm.isPending ? "Applying..." : "Confirm and queue review"}</Btn></>
        ) : (
          <><span className="sp" /><Btn onClick={close} disabled={review.isPending}>Cancel</Btn><Btn variant="pri" onClick={() => draft && review.mutate(draft)} disabled={!draft || review.isPending}>{review.isPending ? "Preparing review..." : "Review changes"}</Btn></>
        )}
      >
        {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
        {preview ? (
          <div className="grid">
            <Callout tone="warn" icon={<Icon name="alert" size={16} />}>This action runs immediately as the signed-in operator and is reversible only by creating another classification revision.</Callout>
            <div className="review-effects">
              {preview.effects.map((effect) => <div key={effect} className="review-effect"><Icon name="check" size={15} /><span>{effect}</span></div>)}
            </div>
            <div className="panel compact"><DetailLine label="Vertical" value={VERTICALS.find(([value]) => value === preview.after.vertical)?.[1] ?? preview.after.vertical} /><DetailLine label="Funding category" value={valueLabel(preview.after.funding_category)} /><DetailLine label="Entity type" value={valueLabel(preview.after.entity_type)} /><DetailLine label="Industry" value={valueLabel(preview.after.industry ?? preview.after.custom_industry)} /><DetailLine label="NAICS" value={valueLabel(preview.after.naics_code)} /></div>
          </div>
        ) : draft ? (
          <div className="fldgrid two">
            <Field label="Vertical"><Select value={draft.vertical} onChange={(event) => update("vertical", event.target.value as ClassificationPatch["vertical"])}>{VERTICALS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select></Field>
            <Field label="Funding category"><Input value={draft.funding_category ?? ""} onChange={(event) => update("funding_category", event.target.value || null)} placeholder="e.g. working capital" /></Field>
            <Field label="Entity type"><Input value={draft.entity_type ?? ""} onChange={(event) => update("entity_type", event.target.value || null)} placeholder="LLC, corporation, sole proprietor" /></Field>
            <Field label="Industry"><Input value={draft.industry ?? ""} onChange={(event) => update("industry", event.target.value || null)} placeholder="Controlled industry label" /></Field>
            <Field label="NAICS code"><Input value={draft.naics_code ?? ""} onChange={(event) => update("naics_code", event.target.value || null)} inputMode="numeric" maxLength={8} /></Field>
            <Field label="NAICS label"><Input value={draft.naics_label ?? ""} onChange={(event) => update("naics_label", event.target.value || null)} /></Field>
            <Field label="Custom industry"><Input value={draft.custom_industry ?? ""} onChange={(event) => update("custom_industry", event.target.value || null)} placeholder="Use when no controlled label fits" /></Field>
          </div>
        ) : null}
      </Drawer>
    </>
  );
}
