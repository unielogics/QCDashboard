"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/design-system/Icon";
import { Btn, Callout, CellChip, Row } from "@/components/ds";
import { useAuthedApi } from "@/hooks/useApi";
import type {
  ApplicationDraftAnalysisStatus,
  ApplicationProfile,
  ApplicationSourceKind,
  ExtractedFact,
} from "@/lib/applicationProfile";

function factLabel(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ExtractedFactsReview({ sourceKind, sourceId }: { sourceKind: ApplicationSourceKind; sourceId: string }) {
  const apiCall = useAuthedApi();
  const qc = useQueryClient();
  const profileKey = ["application-profile", sourceKind, sourceId] as const;
  const profile = useQuery({ queryKey: profileKey, queryFn: () => apiCall<ApplicationProfile>("/application-profiles/resolve", { method: "POST", body: JSON.stringify({ source_kind: sourceKind, source_id: sourceId }) }) });
  const profileId = profile.data?.id;
  const facts = useQuery({ queryKey: ["application-extracted-facts", profileId], enabled: Boolean(profileId), queryFn: () => apiCall<ExtractedFact[]>(`/application-profiles/${profileId}/extracted-facts`) });
  const draftStatus = useQuery({ queryKey: ["application-draft-status", profileId], enabled: Boolean(profileId && profile.data?.is_draft), refetchInterval: (query) => query.state.data?.processing_file_count ? 2500 : false, queryFn: () => apiCall<ApplicationDraftAnalysisStatus>(`/application-profiles/${profileId}/draft-status`) });
  const review = useMutation({ mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" }) => apiCall<ExtractedFact>(`/application-profiles/${profileId}/extracted-facts/${id}/review`, { method: "POST", body: JSON.stringify({ action }) }), onSuccess: async () => { await qc.invalidateQueries({ queryKey: ["application-extracted-facts", profileId] }); await qc.invalidateQueries({ queryKey: ["application-draft-status", profileId] }); await qc.invalidateQueries({ queryKey: profileKey }); } });
  const finalize = useMutation({ mutationFn: () => apiCall<ApplicationProfile>(`/application-profiles/${profileId}/finalize`, { method: "POST" }), onSuccess: async (updated) => { qc.setQueryData(profileKey, updated); await qc.invalidateQueries({ queryKey: ["application-draft-status", updated.id] }); } });
  const suggestions = (facts.data ?? []).filter((fact) => fact.status === "suggested");
  if (facts.isLoading || !profile.data) return null;

  return <section className="extracted-facts-review">
    <header><div><span className="lbl">Extracted data review</span><h3>{suggestions.length ? `${suggestions.length} suggested field${suggestions.length === 1 ? "" : "s"}` : "Evidence extraction reviewed"}</h3></div>{suggestions.length ? <CellChip tone="warn">Review required</CellChip> : profile.data.is_draft ? <CellChip tone={draftStatus.data?.can_finalize ? "ok" : "warn"}>Draft</CellChip> : <CellChip tone="ok">Finalized</CellChip>}</header>
    {draftStatus.data?.processing_file_count ? <Callout tone="warn">Analyzing {draftStatus.data.processing_file_count} file{draftStatus.data.processing_file_count === 1 ? "" : "s"} in the background. This screen updates automatically.</Callout> : null}
    {draftStatus.data?.failed_file_count ? <Callout tone="bad">{draftStatus.data.failed_file_count} file analysis job{draftStatus.data.failed_file_count === 1 ? "" : "s"} failed. The original file remains available for manual review.</Callout> : null}
    {suggestions.length ? <div>{suggestions.map((fact) => <article key={fact.id}><div><b>{factLabel(fact.field_key)}</b><strong>{String(fact.value?.value ?? "-")}</strong><small>{fact.confidence != null ? `${Math.round(fact.confidence * 100)}% confidence` : "Confidence not reported"} | {fact.extraction_method.replaceAll("_", " ")}</small></div><Row><Btn size="sm" onClick={() => review.mutate({ id: fact.id, action: "reject" })} disabled={review.isPending}>Reject</Btn><Btn size="sm" variant="pri" onClick={() => review.mutate({ id: fact.id, action: "accept" })} disabled={review.isPending}><Icon name="check" size={12} />Accept</Btn></Row></article>)}</div> : <Callout tone="acc" icon={<Icon name="check" size={15} />}>{facts.data?.length ? "All extracted profile facts have been reviewed." : "No profile facts were extracted from the current evidence."}</Callout>}
    {profile.data.is_draft ? <footer><span className="sub">Finalizing confirms that extraction is complete and every suggestion has been reviewed.</span><Btn variant="pri" disabled={!draftStatus.data?.can_finalize || finalize.isPending} onClick={() => finalize.mutate()}>{finalize.isPending ? "Finalizing..." : "Finalize extracted data"}</Btn></footer> : null}
  </section>;
}
