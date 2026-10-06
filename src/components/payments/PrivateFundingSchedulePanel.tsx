"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Btn, Callout, CellChip, Empty, Field, Input, Loading, Panel, Select, Textarea } from "@/components/ds";
import { ConfirmDialog } from "@/components/design-system/ConfirmDialog";
import { useAuthedApi } from "@/hooks/useApi";
import { paymentMoney, type PaymentSummary } from "@/lib/payments";

type PreviewInstallment = { sequence?: number; due_date: string; amount_cents: number };
type PrivateSchedulePreview = {
  eligible: boolean;
  blockers: string[];
  production_term_sheet_id: string | null;
  production_term_sheet_version: number | null;
  funder_type: string | null;
  funding_party_name: string | null;
  creditor_name: string | null;
  cadence: string | null;
  total_amount_cents: number | null;
  installment_amount_cents: number | null;
  installment_count: number | null;
  first_due_date: string | null;
  installments: PreviewInstallment[];
};

type Authority = {
  id: string;
  status: string;
  creditor_name: string;
  payee_name: string;
  settlement_destination_ref: string;
  agreement_reference: string;
  effective_from: string;
  effective_to: string | null;
};

type PlanInstallment = { id?: string; sequence: number; due_date: string; amount_cents: number; status: string };
type RichPlan = NonNullable<PaymentSummary["private_plan"]> & {
  record_version?: number;
  production_term_sheet_id?: string | null;
  production_term_sheet_version?: number | null;
  schedule_sha256?: string | null;
  agreement_reference?: string | null;
  payee_name?: string | null;
  settlement_destination_ref?: string | null;
  funding_source_status?: string | null;
  servicing_authority_id?: string | null;
  servicing_authority_status?: string | null;
  activation_blockers?: string[];
  installments?: PlanInstallment[];
};

type RichPermissions = PaymentSummary["permissions"] & {
  can_manage_servicing_authority?: boolean;
  can_request_review?: boolean;
};

type RichSummary = PaymentSummary & { servicing_authorities?: Authority[]; permissions: RichPermissions };

type Command = (
  path: string,
  action: string,
  entityId: string,
  body?: Record<string, unknown>,
  success?: string,
) => Promise<boolean>;

export function PrivateFundingSchedulePanel({
  profileId,
  summary,
  busy,
  onCommand,
}: {
  profileId: string;
  summary: PaymentSummary;
  busy: boolean;
  onCommand: Command;
}) {
  const call = useAuthedApi();
  const rich = summary as RichSummary;
  const plan = summary.private_plan as RichPlan | null;
  const authorities = rich.servicing_authorities ?? [];
  const [agreementReference, setAgreementReference] = useState("");
  const [authorityId, setAuthorityId] = useState("");
  const [reason, setReason] = useState("");
  const [showAuthority, setShowAuthority] = useState(false);
  const [authority, setAuthority] = useState({
    agreement_reference: "",
    agreement_sha256: "",
    creditor_name: "",
    payee_name: "",
    settlement_destination_ref: "",
    effective_from: "",
    effective_to: "",
  });
  const [confirmAction, setConfirmAction] = useState<"activate" | "pause" | "cancel" | null>(null);

  const preview = useQuery({
    queryKey: ["payments", "private-plan-preview", profileId],
    queryFn: () => call<PrivateSchedulePreview>(`/application-profiles/${profileId}/payments/private-plan-preview`),
    enabled: Boolean(summary.private_funding_eligible || plan),
    staleTime: 30_000,
  });
  const selectedAuthority = authorities.find((item) => item.id === authorityId) ?? null;
  const replacementNeeded = Boolean(
    plan &&
      preview.data?.production_term_sheet_version &&
      plan.production_term_sheet_version !== preview.data.production_term_sheet_version,
  );
  const installments = useMemo(
    () => (plan?.installments?.length ? plan.installments : preview.data?.installments ?? []),
    [plan?.installments, preview.data?.installments],
  );

  if (!summary.private_funding_eligible && !plan) {
    return summary.private_funding_reason ? (
      <Callout tone="mut"><b>Private schedule unavailable.</b> {summary.private_funding_reason}</Callout>
    ) : null;
  }

  const canManage = summary.permissions.can_manage_private_schedule;
  const previewReady = Boolean(preview.data?.eligible && preview.data.production_term_sheet_id);
  const canCreate = canManage && previewReady && agreementReference.trim().length > 0;
  const blockers = plan?.activation_blockers ?? [];
  const expectedVersion = plan?.record_version ?? 1;

  async function createFromTerms() {
    const ok = await onCommand(
      `/application-profiles/${profileId}/payments/private-plans/from-term-sheet`,
      plan ? "replace-private-plan" : "create-private-plan",
      profileId,
      {
        production_term_sheet_id: preview.data?.production_term_sheet_id,
        servicing_authority_id: authorityId || null,
        agreement_reference: agreementReference.trim(),
        reason: reason.trim() || (plan ? "Replaced from the exact current Production Term Sheet" : null),
      },
      plan ? "Replacement schedule created from the current Production Term Sheet. Client authorization is required again." : "Draft schedule created from the exact current Production Term Sheet.",
    );
    if (ok) {
      setAgreementReference("");
      setReason("");
    }
  }

  async function runLifecycle(action: "activate" | "pause" | "cancel") {
    if (!plan) return;
    const ok = await onCommand(
      `/private-payment-plans/${plan.id}/${action}`,
      `${action}-private-plan`,
      plan.id,
      { expected_record_version: expectedVersion, reason: reason.trim() || null },
      action === "activate" ? "Private schedule activated." : action === "pause" ? "Future unclaimed installments paused." : "Future unclaimed installments permanently cancelled.",
    );
    if (ok) setConfirmAction(null);
  }

  async function createAuthority() {
    const ok = await onCommand(
      `/application-profiles/${profileId}/payments/servicing-authorities`,
      "create-servicing-authority",
      profileId,
      { ...authority, effective_to: authority.effective_to || null },
      "Servicing authority recorded and available for schedule preparation.",
    );
    if (ok) setShowAuthority(false);
  }

  return (
    <Panel title="Private funding schedule" sub="Secondary fixed-payment workflow">
      <Callout tone="acc"><b>Term-sheet controlled.</b> Amounts, cadence, payment count, and dates come from the exact current Production Term Sheet. They cannot be retyped here.</Callout>

      {preview.isLoading ? <Loading>Reading the current Production Term Sheet…</Loading> : null}
      {preview.isError ? <Callout tone="bad">The exact schedule could not be derived. No draft was created. Refresh after the Production Term Sheet is saved.</Callout> : null}
      {preview.data && !preview.data.eligible ? <Callout tone="warn"><b>Schedule is not ready.</b> {preview.data.blockers.join(" · ") || "The current funding source is not an eligible private funder."}</Callout> : null}

      {preview.data?.eligible ? (
        <div className="payment-term-preview">
          <div><span>Funding party</span><strong>{preview.data.funding_party_name || preview.data.creditor_name || "—"}</strong><small>{humanize(preview.data.funder_type || "private funding")}</small></div>
          <div><span>Fixed schedule total</span><strong>{paymentMoney((preview.data.total_amount_cents ?? 0) / 100)}</strong><small>From Production Term Sheet v{preview.data.production_term_sheet_version}</small></div>
          <div><span>Installments</span><strong>{preview.data.installment_count ?? 0}</strong><small>{humanize(preview.data.cadence || "fixed")}</small></div>
          <div><span>First payment</span><strong>{dateLabel(preview.data.first_due_date)}</strong><small>America/New_York banking dates</small></div>
        </div>
      ) : null}

      {plan ? (
        <section className="payment-private-current">
          <div className="payment-private-plan-header">
            <div><span className="lbl">Current schedule</span><h4>{plan.creditor_name}</h4><p>{paymentMoney(plan.total_amount)} · {plan.installment_count} fixed payments · Term Sheet v{plan.production_term_sheet_version ?? "—"}</p></div>
            <CellChip tone={statusTone(plan.status)}>{humanize(plan.status)}</CellChip>
          </div>
          <div className="payment-private-plan">
            <div><span>Payee</span><strong>{plan.payee_name || "Not recorded"}</strong></div>
            <div><span>Settlement destination</span><strong>{plan.settlement_destination_ref || "Not recorded"}</strong></div>
            <div><span>Agreement</span><strong>{plan.agreement_reference || "Not recorded"}</strong></div>
            <div><span>Client mandate</span><strong>{humanize(plan.mandate_status || "not signed")}</strong></div>
            <div><span>Payment account</span><strong>{humanize(plan.funding_source_status || "not connected")}</strong></div>
            <div><span>Servicing authority</span><strong>{humanize(plan.servicing_authority_status || (plan.servicing_authority_ready ? "ready" : "not required or missing"))}</strong></div>
          </div>
          {replacementNeeded ? <Callout tone="warn"><b>The Production Term Sheet changed.</b> This schedule cannot continue. Create a replacement and obtain a fresh client authorization.</Callout> : null}
          {blockers.length ? <Callout tone="warn"><b>Activation checklist:</b> {blockers.join(" · ")}</Callout> : <Callout tone="ok">The server reports every activation prerequisite is satisfied.</Callout>}
          {canManage ? <div className="payment-private-actions">
            {!["active", "cancelled", "completed", "superseded"].includes(plan.status) ? <Btn variant="pri" disabled={busy || blockers.length > 0 || replacementNeeded} onClick={() => setConfirmAction("activate")}>Review activation</Btn> : null}
            {plan.status === "active" ? <Btn disabled={busy} onClick={() => setConfirmAction("pause")}>Pause future installments</Btn> : null}
            {!["cancelled", "completed", "superseded"].includes(plan.status) ? <Btn className="danger" disabled={busy} onClick={() => setConfirmAction("cancel")}>Cancel future installments</Btn> : null}
            {["draft", "paused"].includes(plan.status) ? <Btn disabled={busy} onClick={() => onCommand(`/private-payment-plans/${plan.id}/send-authorization`, "send-private-authorization", plan.id, undefined, "Secure schedule authorization request sent to the client.")}>Send authorization request</Btn> : null}
          </div> : null}
        </section>
      ) : <Empty title="No private schedule prepared">Review the derived term-sheet schedule below, identify the executed agreement, and create the draft. Nothing is debited by preparing it.</Empty>}

      {installments.length ? <InstallmentTable rows={installments} /> : null}

      {canManage && preview.data?.eligible ? (
        <section className="payment-schedule-builder">
          <div className="payment-private-plan-header"><div><span className="lbl">{plan ? "Replacement version" : "Prepare schedule"}</span><h4>{plan ? "Create from current terms" : "Confirm the immutable sources"}</h4></div></div>
          <div className="payment-funding-form">
            <Field label="Executed private-funding agreement reference"><Input value={agreementReference} onChange={(event) => setAgreementReference(event.target.value)} placeholder="Signed agreement or document ID" /></Field>
            <Field label="Servicing authority" hint="Required when QC collects for an external funder."><Select value={authorityId} onChange={(event) => setAuthorityId(event.target.value)}><option value="">None / QC is creditor</option>{authorities.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.creditor_name} → {item.payee_name}</option>)}</Select></Field>
            <Field className="wide" label="Internal reason / note"><Textarea rows={2} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={plan ? "Why is this schedule being replaced?" : "Optional internal context"} /></Field>
          </div>
          {selectedAuthority ? <Callout tone="mut">Settlement destination: <b>{selectedAuthority.settlement_destination_ref}</b> · authority agreement {selectedAuthority.agreement_reference}</Callout> : null}
          <div className="payment-private-actions"><Btn variant="pri" disabled={busy || !canCreate} onClick={() => void createFromTerms()}>{plan ? "Create replacement schedule" : "Create draft schedule"}</Btn>{rich.permissions.can_manage_servicing_authority ? <Btn onClick={() => setShowAuthority((value) => !value)}>{showAuthority ? "Hide authority setup" : "Add servicing authority"}</Btn> : null}</div>
        </section>
      ) : null}

      {showAuthority && rich.permissions.can_manage_servicing_authority ? (
        <section className="payment-authority-form">
          <h4>External-funder servicing authority</h4>
          <p>This record proves QC is authorized to collect and identifies exactly where funds settle.</p>
          <div className="payment-funding-form">
            <Field label="Creditor"><Input value={authority.creditor_name} onChange={(event) => setAuthority({ ...authority, creditor_name: event.target.value })} /></Field>
            <Field label="Payee"><Input value={authority.payee_name} onChange={(event) => setAuthority({ ...authority, payee_name: event.target.value })} /></Field>
            <Field label="Settlement destination reference"><Input value={authority.settlement_destination_ref} onChange={(event) => setAuthority({ ...authority, settlement_destination_ref: event.target.value })} /></Field>
            <Field label="Executed authority agreement"><Input value={authority.agreement_reference} onChange={(event) => setAuthority({ ...authority, agreement_reference: event.target.value })} /></Field>
            <Field label="Agreement SHA-256"><Input value={authority.agreement_sha256} onChange={(event) => setAuthority({ ...authority, agreement_sha256: event.target.value.trim() })} spellCheck={false} /></Field>
            <Field label="Effective from"><Input type="date" value={authority.effective_from} onChange={(event) => setAuthority({ ...authority, effective_from: event.target.value })} /></Field>
            <Field label="Effective through"><Input type="date" value={authority.effective_to} onChange={(event) => setAuthority({ ...authority, effective_to: event.target.value })} /></Field>
          </div>
          <Btn variant="pri" disabled={busy || !authority.creditor_name.trim() || !authority.payee_name.trim() || !authority.settlement_destination_ref.trim() || !authority.agreement_reference.trim() || !/^[0-9a-fA-F]{64}$/.test(authority.agreement_sha256) || !authority.effective_from} onClick={() => void createAuthority()}>Save servicing authority</Btn>
        </section>
      ) : null}

      <ConfirmDialog
        open={confirmAction === "activate"}
        onClose={() => setConfirmAction(null)}
        title={`Activate ${paymentMoney(plan?.total_amount ?? 0)} fixed payment schedule`}
        body={<><b>This enables future installment collection.</b> Every installment is revalidated against the current term sheet, funding confirmation, CCD mandate, payment account, and servicing authority before submission. Failed payments are never retried automatically.</>}
        confirmLabel="Activate fixed schedule"
        busy={busy}
        onConfirm={() => void runLifecycle("activate")}
      />
      <ConfirmDialog
        open={confirmAction === "pause"}
        onClose={() => setConfirmAction(null)}
        title="Pause future installments"
        body={<>Future unclaimed installments will stop. Any transfer already submitted to Plaid cannot be recalled by pausing.</>}
        confirmLabel="Pause schedule"
        busy={busy}
        onConfirm={() => void runLifecycle("pause")}
      />
      <ConfirmDialog
        open={confirmAction === "cancel"}
        onClose={() => setConfirmAction(null)}
        title="Permanently cancel future installments"
        body={<><b>This cannot resume the same schedule.</b> Future unclaimed installments and the standing mandate are cancelled. A later change requires a replacement version and fresh client authorization.</>}
        confirmLabel="Cancel future installments"
        busy={busy}
        onConfirm={() => void runLifecycle("cancel")}
      />
    </Panel>
  );
}

function InstallmentTable({ rows }: { rows: Array<PreviewInstallment | PlanInstallment> }) {
  return <div className="payment-installment-wrap"><div className="payment-installment-heading"><b>Exact fixed schedule</b><small>{rows.length} payment{rows.length === 1 ? "" : "s"}; final payment absorbs cent rounding</small></div><div className="payment-installment-scroll"><table><thead><tr><th>#</th><th>Banking date</th><th>Amount</th><th>Status</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.due_date}-${index}`}><td>{row.sequence ?? index + 1}</td><td>{dateLabel(row.due_date)}</td><td>{paymentMoney(row.amount_cents / 100)}</td><td>{"status" in row ? humanize(row.status) : "Preview"}</td></tr>)}</tbody></table></div></div>;
}

function dateLabel(value: string | null | undefined): string {
  return value ? new Date(`${value}T12:00:00`).toLocaleDateString() : "—";
}

function humanize(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status: string): "ok" | "bad" | "warn" | "acc" | "mut" {
  if (["active", "completed", "authorized"].includes(status)) return "ok";
  if (["cancelled", "failed", "returned", "action_required"].includes(status)) return "bad";
  if (["draft", "paused", "awaiting_authorization"].includes(status)) return "warn";
  return "mut";
}
