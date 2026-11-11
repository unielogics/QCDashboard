"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Btn, Select, Textarea } from "@/components/ds";
import { useAuthedApi, useCurrentUser } from "@/hooks/useApi";
import { Role } from "@/lib/enums.generated";
import { useCpMembers } from "@/hooks/useCapitalPartners";

type Grant = { id: string; member_id: string; status: "active" | "revoked"; file_count: number; granted_at: string; reason: string; revocation_reason?: string | null };

export function MarketplaceDocumentGrants({ listingId }: { listingId: string }) {
  const api = useAuthedApi(), client = useQueryClient(), members = useCpMembers({ status: "approved" });
  const staff = useCurrentUser(), staffId = staff.data?.id ?? null;
  const enabled = staff.authReady !== false && staff.data?.role === Role.SUPER_ADMIN && Boolean(staffId);
  const grants = useQuery({ queryKey: ["cp-document-grants", listingId, staff.authScope ?? staffId], queryFn: () => api<Grant[]>(`/capital/admin/listings/${listingId}/document-grants`), enabled, retry: false });
  const [memberId, setMemberId] = useState(""), [reason, setReason] = useState(""), [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const save = async (status: Grant["status"], target = memberId) => {
    if (!enabled || busy || !target || !reason.trim() || status === "active" && !confirmed) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await api<Grant>(`/capital/admin/listings/${listingId}/document-grants/${target}`, { method: "PUT", body: JSON.stringify({ status, reason: reason.trim(), engagement_confirmed: status === "active" && confirmed }) });
      setNotice(status === "active" ? `Access approved for ${result.file_count} current eligible documents. Future uploads need separate approval.` : "Document access revoked.");
      setConfirmed(false);
      try { await Promise.all([client.invalidateQueries({ queryKey: ["cp-document-grants", listingId] }), client.invalidateQueries({ queryKey: ["cp-file-documents", listingId] })]); }
      catch { setError("The access change was saved. Access records could not be refreshed; retry loading them without submitting another approval."); }
    } catch (error) { setError(error instanceof Error ? error.message : "Document access could not be updated. Your reason is retained; retry after review."); }
    finally { setBusy(false); }
  };
  if (!enabled) return null;
  return <section className="grid g10" aria-label="Investor document engagement approval">
    <strong>Release originals after engagement</strong><p className="sub">Approval applies to this investor and this listing’s current eligible business-financial documents. Existing document links expire within 60 seconds; revocation blocks new links immediately.</p>
    {members.isError || grants.isError ? <p role="alert">Investor access records could not be loaded. <Btn size="sm" onClick={() => { void members.refetch(); void grants.refetch(); }}>Retry access records</Btn></p> : null}
    <label className="grid g6">Investor<Select aria-label="Investor for document access" disabled={busy || members.isPending} value={memberId} onChange={event => { setMemberId(event.target.value); setConfirmed(false); setNotice(""); }}><option value="">Choose an approved investor</option>{members.data?.map(member => <option key={member.id} value={member.id}>{member.display_name || member.name || member.email}</option>)}</Select></label>
    <label className="grid g6">Approval / revocation reason<Textarea aria-label="Document engagement reason" rows={2} disabled={busy} value={reason} onChange={event => setReason(event.target.value)} /></label>
    <label className="row"><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Engagement confirmed for this investor and listing</label>
    <div><Btn size="sm" variant="pri" disabled={busy || !confirmed || !memberId || !reason.trim() || members.isPending || grants.isPending || members.isError || grants.isError} onClick={() => void save("active")}>{busy ? "Updating access…" : "Release current eligible documents"}</Btn></div>
    {grants.data?.length ? <ul className="grid g8">{grants.data.map(grant => <li key={grant.id}><div className="row"><span>{members.data?.find(member => member.id === grant.member_id)?.display_name || members.data?.find(member => member.id === grant.member_id)?.name || "Investor access record"} · {grant.status} · {grant.file_count} files</span>{grant.status === "active" ? <Btn size="sm" disabled={busy || !reason.trim()} onClick={() => void save("revoked", grant.member_id)}>Revoke document access</Btn> : null}</div></li>)}</ul> : <span className="sub">No investor-specific document approvals recorded.</span>}
    {error ? <p role="alert">{error}</p> : null}{notice ? <p role="status">{notice}</p> : null}
  </section>;
}
