"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditReportDetail } from "@/components/CreditReportDetail";
import { Drawer } from "@/components/ds/Drawer";
import { Btn, Callout, Sub } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { FileOwner } from "@/lib/applicationProfile";
import type { ParsedReport } from "@/lib/types";
import { ownerCreditWords } from "@/lib/creditLinks";

type ReportResponse = { owner: FileOwner; report: ParsedReport | null };

export function OwnerCreditReportDrawer({ profileId, owner, onClose, onImported }: {
  profileId: string; owner: FileOwner | null; onClose: () => void; onImported: () => Promise<void>;
}) {
  const api = useAuthedApi();
  const queryClient = useQueryClient();
  const path = `/application-profiles/${profileId}/owners/${owner?.id}/credit-report`;
  const key = ["owner-credit-report", profileId, owner?.id];
  const report = useQuery({
    queryKey: key,
    queryFn: () => api<ReportResponse>(path),
    enabled: Boolean(owner?.credit_pull_id),
    refetchInterval: (query) => query.state.data?.owner.credit_report_import_status === "pending" ? 15000 : false,
  });
  const importReport = useMutation({
    mutationFn: () => api<ReportResponse>(`${path}/import`, { method: "POST" }),
    onSuccess: async (result) => {
      queryClient.setQueryData(key, result);
      await onImported();
      await queryClient.invalidateQueries({ queryKey: ["owner-credit-candidates", profileId] });
    },
  });
  const shown = report.data?.owner ?? owner;
  return <Drawer open={Boolean(owner)} onClose={onClose} title={`${owner?.full_name ?? "Owner"} · Credit report`} width="lg"
    sub={shown ? ownerCreditWords(shown) : undefined}
    headerActions={<Btn disabled={importReport.isPending} onClick={() => importReport.mutate()}><Icon name="refresh" size={14} />{importReport.isPending ? "Importing..." : "Import existing report"}</Btn>}>
    <div className="grid g12">
      <Sub>Imports the already-created report. Does not request a new credit check or change the original pull date.</Sub>
      {report.isError || importReport.isError ? <Callout tone="warn">{(importReport.error ?? report.error) instanceof Error ? (importReport.error ?? report.error)?.message : "The report could not be loaded."}</Callout> : null}
      {!report.isLoading && !report.isError && !report.data?.report ? <Callout tone="warn">The report is linked, but its contents have not been imported. Import the existing report to bring the score and report details into this file.</Callout> : null}
      {report.isLoading || report.data?.report ? <CreditReportDetail report={report.data?.report ?? undefined} loading={report.isLoading} /> : null}
    </div>
  </Drawer>;
}
