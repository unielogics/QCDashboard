"use client";

import { useState, useMemo } from "react";
import {
  Btn,
  CellChip,
  Input,
  PageHeader,
  Panel,
  Table,
  Td,
  Tr,
  type ChipTone,
  type Col,
} from "@/components/ds";
import { Icon } from "@/components/design-system/Icon";
import { useDocuments, useLoans, useClients } from "@/hooks/useApi";
import { useActiveProfile } from "@/store/role";
import { DocRequestModal } from "./components/DocRequestModal";
import { DocUploadButton } from "./components/DocUploadButton";

// Same four-way split the coloured Pill carried, now as chip tones:
// verified → green, received → accent, flagged → red, everything else
// (requested / pending) → amber.
function statusTone(status: string): ChipTone {
  if (status === "verified") return "ok";
  if (status === "received") return "acc";
  if (status === "flagged") return "bad";
  return "warn";
}

const BASE_COLS: Col[] = [
  { label: "Document" },
  { label: "Source", width: 120 },
  { label: "Status", width: 140 },
];

export default function DocumentsPage() {
  const profile = useActiveProfile();
  const { data: docs = [] } = useDocuments();
  const { data: loans = [] } = useLoans();
  const { data: clients = [] } = useClients();
  const [q, setQ] = useState("");
  const [hideClosed, setHideClosed] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);

  const canRequest = profile.role !== "client";

  const loansById = Object.fromEntries(loans.map((l) => [l.id, l]));
  const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const filtered = useMemo(() => {
    return docs.filter((d) => {
      const loan = loansById[d.loan_id];
      if (!loan) return false;
      if (hideClosed && loan.stage === "funded") return false;
      if (!q) return true;
      return d.name.toLowerCase().includes(q.toLowerCase()) || loan.address.toLowerCase().includes(q.toLowerCase());
    });
  }, [docs, q, hideClosed, loansById]);

  // Group by client
  const byClient: Record<string, typeof filtered> = {};
  for (const d of filtered) {
    const loan = loansById[d.loan_id];
    if (!loan) continue;
    (byClient[loan.client_id] ||= []).push(d);
  }

  // The upload column only exists for roles that may act on a row.
  const cols: Col[] = canRequest
    ? [...BASE_COLS, { label: "Action", align: "r", width: 120 }]
    : BASE_COLS;

  return (
    <div className="grid">
      <PageHeader
        title="Documents"
        lede={
          <>
            <CellChip tone="mut">
              {filtered.length} of {docs.length}
            </CellChip>{" "}
            <CellChip tone="acc">Funding</CellChip>
          </>
        }
        actions={
          canRequest ? (
            <Btn variant="pri" onClick={() => setRequestOpen(true)}>
              <Icon name="plus" size={14} /> Request doc
            </Btn>
          ) : undefined
        }
      />
      <div className="sub">Transaction docs (Agent-requested) join here in P1.</div>

      <div className="pagebar">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search documents…"
          aria-label="Search documents"
          style={{ width: 280 }}
        />
        <label className="row">
          <input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} />
          <span className="sub">Hide funded</span>
        </label>
      </div>

      <DocRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />

      {Object.entries(byClient).map(([clientId, items]) => {
        const client = clientsById[clientId];
        const clientName = client?.name ?? "Unknown client";
        return (
          <Panel key={clientId} title={clientName} noPad>
            <Table cols={cols} caption={`Documents for ${clientName}`}>
              {items.map((d) => {
                const loan = loansById[d.loan_id];
                const showUpload = canRequest && (d.status === "requested" || d.status === "pending" || d.status === "flagged");
                return (
                  <Tr key={d.id}>
                    <Td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                        <span className="sub">
                          <Icon name="doc" size={16} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <b>{d.name}</b>
                          <div className="sub">
                            {loan?.deal_id} — {loan?.address}
                          </div>
                        </div>
                      </div>
                    </Td>
                    {/* Source label per Architecture decision #6. Every row in this
                        Document table is lender/funding-side. Agent-requested
                        transaction docs (Purchase Agreement, Inspection, etc.)
                        live in the future agent_document_request table and will
                        render alongside with a "Transaction" chip — P1. */}
                    <Td>
                      <CellChip tone="acc">Funding</CellChip>
                    </Td>
                    <Td>
                      <CellChip tone={statusTone(d.status)}>{d.status}</CellChip>
                    </Td>
                    {canRequest ? (
                      <Td align="r">
                        {showUpload ? (
                          <DocUploadButton
                            loanId={d.loan_id}
                            category={d.category ?? undefined}
                            compact
                            label="Upload"
                          />
                        ) : null}
                      </Td>
                    ) : null}
                  </Tr>
                );
              })}
            </Table>
          </Panel>
        );
      })}
    </div>
  );
}
