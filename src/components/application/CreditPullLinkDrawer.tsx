"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Sub, cx } from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { FileOwner, OwnerCreditCandidate } from "@/lib/applicationProfile";
import { confidenceTone, scoreWords, shortDate } from "@/lib/creditLinks";

// The desk's hand on credit linking: every completed pull that could be this
// owner's, with the evidence for each, and one button to point the owner at
// it. The backend decides what counts as evidence (services/credit_links.py).

export function CreditPullLinkDrawer({
  profileId,
  owner,
  open,
  onClose,
  onLinked,
}: {
  profileId: string;
  owner: FileOwner | null;
  open: boolean;
  onClose: () => void;
  onLinked: (owner: FileOwner) => Promise<void> | void;
}) {
  const apiCall = useAuthedApi();
  const [error, setError] = useState("");
  const candidates = useQuery({
    queryKey: ["owner-credit-candidates", profileId, owner?.id],
    queryFn: () => apiCall<OwnerCreditCandidate[]>(`/application-profiles/${profileId}/owners/${owner?.id}/credit-candidates`),
    enabled: open && Boolean(owner),
  });
  const link = useMutation({
    mutationFn: ({ pullId, confirm }: { pullId: string; confirm: boolean }) =>
      apiCall<FileOwner>(`/application-profiles/${profileId}/owners/${owner?.id}/credit-link`, {
        method: "POST",
        body: JSON.stringify({ pull_id: pullId, confirm_other_client: confirm }),
      }),
    onSuccess: async (updated) => {
      setError("");
      await onLinked(updated);
      onClose();
    },
    onError: (reason) => setError(reason instanceof Error ? reason.message : "The pull could not be linked."),
  });

  if (!owner) return null;
  const rows = candidates.data ?? [];
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Link a credit pull to ${owner.full_name}`}
      sub="Completed pulls on this client, and any pull under this owner's exact name. Linking counts the pull for the owner's credit step."
      ariaLabel={`Link a credit pull to ${owner.full_name}`}
      width="md"
    >
      <div className="grid g10">
        {candidates.isLoading ? <div className="empty"><span className="spinner solo" />Looking for pulls...</div> : null}
        {candidates.isError ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>The pulls could not be loaded. Close and try again.</Callout> : null}
        {!candidates.isLoading && !candidates.isError && !rows.length ? (
          <div className="hintbox">
            No completed pull carries this owner&apos;s name, and none sits on this client. Send the authorization from the card, or run the pull from the desk, and it will appear here.
          </div>
        ) : null}
        {rows.map((row) => {
          const linkable = !row.linked_to_this_owner;
          const otherClient = !row.evidence.same_client;
          const label = row.linked_to_this_owner ? "Linked" : row.confidence === "exact" ? "Link" : "Link anyway";
          return (
            <article key={row.pull_id} className={cx("credit-candidate", row.linked_to_this_owner && "on")}>
              <div className="grow">
                <div className="row g8">
                  <strong>{[row.first_name, row.last_name].filter(Boolean).join(" ") || "Unnamed applicant"}</strong>
                  <CellChip tone={confidenceTone(row.confidence)}>{row.why}</CellChip>
                  {row.linked_elsewhere ? <CellChip tone="mut">Also linked on another file</CellChip> : null}
                  {row.expired ? <CellChip tone="warn">Expired</CellChip> : null}
                </div>
                <Sub>
                  Pulled {shortDate(row.pulled_at)} · {scoreWords(row.score, row.fico_source)}
                  {row.report_available ? " · report on file" : ""}
                  {row.dob_on_file ? (row.evidence.dob_match === null || row.evidence.dob_match === undefined ? " · date of birth will be copied to the owner" : "") : " · no date of birth on the pull"}
                </Sub>
                {row.attention ? <Sub>{row.attention}</Sub> : null}
              </div>
              <Btn
                variant={row.confidence === "exact" && linkable ? "pri" : undefined}
                disabled={!linkable || link.isPending}
                onClick={() => link.mutate({ pullId: row.pull_id, confirm: otherClient })}
                title={row.linked_to_this_owner ? "This pull already counts for the owner" : otherClient ? "This pull was run for another client; linking confirms it is the same person" : "Point the owner at this pull"}
              >
                <Icon name="link" size={13} />
                {link.isPending && link.variables?.pullId === row.pull_id ? "Linking..." : label}
              </Btn>
            </article>
          );
        })}
        {error ? <Callout tone="bad" icon={<Icon name="alert" size={16} />}>{error}</Callout> : null}
      </div>
    </Drawer>
  );
}
