"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthedApi } from "@/hooks/useApi";
import { Btn, IconBtn } from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { canCorrectFundingRequest, fundingRequestApi } from "@/lib/fundingRequest";
import { FundingRequestEditor } from "./FundingRequestEditor";

const money = (value: number | string | null) => value == null ? "Not entered" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(Number(value));

export function FundingRequestControl({ profileId, role, fallbackAmount, onSaved }: {
  profileId: string | null;
  role: string | null | undefined;
  fallbackAmount: number | null | undefined;
  onSaved: () => Promise<unknown> | void;
}) {
  const call = useAuthedApi();
  const queryClient = useQueryClient();
  const service = useMemo(() => fundingRequestApi(call, profileId ?? ""), [call, profileId]);
  const query = useQuery({ queryKey: ["funding-request", profileId], queryFn: service.load, enabled: Boolean(profileId) });
  const [open, setOpen] = useState(false);
  const request = query.data;
  return <div>
    <div className="kv"><span className="sub">Current request</span><div className="row" style={{ gap: 6 }}><b>{money(request ? request.requested_amount : fallbackAmount ?? null)}</b>{canCorrectFundingRequest(role, request ?? null) ? <IconBtn aria-label="Edit requested amount and use of funds" title="Edit requested amount and use of funds" onClick={() => setOpen(true)}><Icon name="pencil" size={14} /></IconBtn> : null}</div></div>
    {request?.payoff_only_alternative ? <p className="sub">Payoff-only alternative recorded</p> : null}
    {query.isError ? <div className="sub">Current request details could not be loaded. <Btn size="sm" onClick={() => void query.refetch()}>Retry request details</Btn></div> : null}
    {request ? <FundingRequestEditor open={open} role={role} request={request} loadRequest={service.load} saveRequest={service.save} onClose={() => setOpen(false)} onSaved={async (next) => {
      queryClient.setQueryData(["funding-request", profileId], next);
      await queryClient.invalidateQueries({ predicate: (entry) => entry.queryKey[0] !== "funding-request" && (entry.queryKey.includes(profileId) || ["operator-files", "lead-funnel", "ai-underwriter-leads", "loans", "loan", "my-files"].includes(String(entry.queryKey[0]))) });
      await onSaved();
    }} /> : null}
  </div>;
}
