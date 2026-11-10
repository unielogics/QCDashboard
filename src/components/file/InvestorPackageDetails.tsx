"use client";

import { useCallback, useState } from "react";
import { Btn } from "@/components/ds";

import { Icon } from "@/components/design-system/Icon";

import { useAuthedApi } from "@/hooks/useApi";
import { type InvestorReferenceManifest } from "@/lib/investorCollateral";
import type { Artifact } from "./leadFile";
import { FileCollateralSection } from "./FileCollateralSection";
import { InvestorSourceReferences } from "./InvestorSourceReferences";

export function InvestorReportReferenceButton({ intakeId, artifact, onOpenEvidence, compact = false }: { intakeId: string; artifact: Artifact; onOpenEvidence?: () => void; compact?: boolean }) {
  const api = useAuthedApi();
  const [selection, setSelection] = useState<Artifact | null>(null);
  const selected = selection ?? artifact;
  const load = useCallback(() => api<InvestorReferenceManifest>(`/admin/ai-underwriter-leads/${intakeId}/package-readiness/references?artifact_id=${encodeURIComponent(selected.id)}`), [api, intakeId, selected.id]);
  return <><Btn size="sm" aria-label={compact ? `Source references for investor report version ${artifact.version ?? "saved"}` : "Source references"} onClick={() => setSelection(artifact)}><Icon name="file" size={14} />{compact ? "Sources" : "Source references"}</Btn><InvestorSourceReferences open={selection != null} artifact={selected} load={load} onClose={() => setSelection(null)} onOpenEvidence={onOpenEvidence} /></>;
}

/** Collateral is a saved file proposal; the source register is a saved report snapshot. */
export function InvestorPackageDetails({ profileId, intakeId, report, disabled, onSaved, onOpenEvidence }: {
  profileId: string; intakeId: string; report: Artifact | null; disabled?: boolean; onSaved?: () => Promise<unknown> | void; onOpenEvidence?: () => void;
}) {
  return <FileCollateralSection profileId={profileId} disabled={disabled} onSaved={onSaved} compact actions={report ? <InvestorReportReferenceButton intakeId={intakeId} artifact={report} onOpenEvidence={onOpenEvidence} /> : <Btn size="sm" disabled><Icon name="file" size={14} />Source references</Btn>} />;
}
