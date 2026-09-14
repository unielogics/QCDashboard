"use client";

import { useMemo, useState } from "react";
import { Btn, Callout, CellChip, Field, Input, Select, Textarea, cx } from "@/components/ds";
import { Drawer, DrawerSteps } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useAuthedApi } from "@/hooks/useApi";
import type { User } from "@/lib/types";

const MAX_LTV = 0.75;

type SubmitterType = "attorney" | "broker" | "owner_direct";
type FormState = {
  submitter_type: SubmitterType;
  contact_name: string;
  firm_name: string;
  contact_phone: string;
  contact_email: string;
  borrower_name: string;
  client_email: string;
  client_phone: string;
  holding_entity: string;
  ownership_structure: string;
  property_addresses: string;
  parcel_building_count: string;
  property_type: string;
  property_type_other: string;
  occupancy_rate_pct: string;
  estimated_market_value: string;
  senior_lender: string;
  payoff_balance: string;
  legal_statuses: string[];
  case_docket_number: string;
  scheduled_sale_date: string;
  has_other_liens_or_back_taxes: boolean;
  other_liens_amount: string;
  requested_loan_amount: string;
  exit_strategy: string;
  selling_broker: string;
  narrative: string;
  owner_contact_consent: boolean;
};

type CreatedRescue = { id: string; status: string; status_label: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const legalOptions = [
  ["notice_of_default", "Notice of default"],
  ["lawsuit_lis_pendens", "Lawsuit / lis pendens"],
  ["chapter_11_subchapter_v", "Chapter 11 / Subchapter V"],
  ["auction_sale_scheduled", "Auction / sale scheduled"],
] as const;

function initialState(user: User, isPartner: boolean): FormState {
  return {
    submitter_type: isPartner ? "attorney" : "attorney",
    contact_name: isPartner ? user.name : "",
    firm_name: "",
    contact_phone: isPartner ? user.phone || "" : "",
    contact_email: isPartner ? user.email : "",
    borrower_name: "",
    client_email: "",
    client_phone: "",
    holding_entity: "",
    ownership_structure: "",
    property_addresses: "",
    parcel_building_count: "1",
    property_type: "multifamily_5_plus",
    property_type_other: "",
    occupancy_rate_pct: "",
    estimated_market_value: "",
    senior_lender: "",
    payoff_balance: "",
    legal_statuses: ["notice_of_default"],
    case_docket_number: "",
    scheduled_sale_date: "",
    has_other_liens_or_back_taxes: false,
    other_liens_amount: "",
    requested_loan_amount: "",
    exit_strategy: "conventional_refinance",
    selling_broker: "",
    narrative: "",
    owner_contact_consent: false,
  };
}

export function ForeclosureRescueCreateDrawer({
  user,
  isPartner,
  onClose,
  onCreated,
}: {
  user: User;
  isPartner: boolean;
  onClose: () => void;
  onCreated: (created: CreatedRescue) => Promise<void> | void;
}) {
  const api = useAuthedApi();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => initialState(user, isPartner));
  const [valueWasCalculated, setValueWasCalculated] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const professional = form.submitter_type !== "owner_direct";
  const saleScheduled = form.legal_statuses.includes("auction_sale_scheduled");

  const sizing = useMemo(() => {
    const payoff = Number(form.payoff_balance);
    const value = Number(form.estimated_market_value);
    const maxAdvance = value > 0 ? Math.floor(value * MAX_LTV) : 0;
    const minimumValue = payoff > 0 ? Math.ceil(payoff / MAX_LTV) : 0;
    const ltv = payoff > 0 && value > 0 ? payoff / value : null;
    return { payoff, value, maxAdvance, minimumValue, ltv, gap: payoff > 0 && value > 0 ? maxAdvance - payoff : null };
  }, [form.estimated_market_value, form.payoff_balance]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updatePayoff(value: string) {
    const payoff = Number(value);
    setForm((current) => ({
      ...current,
      payoff_balance: value,
      requested_loan_amount: value,
      estimated_market_value: payoff > 0 && (!current.estimated_market_value || valueWasCalculated)
        ? String(Math.ceil(payoff / MAX_LTV))
        : current.estimated_market_value,
    }));
    if (payoff > 0 && (!form.estimated_market_value || valueWasCalculated)) setValueWasCalculated(true);
    if (!payoff && valueWasCalculated) {
      setForm((current) => ({ ...current, estimated_market_value: "", requested_loan_amount: "" }));
      setValueWasCalculated(false);
    }
  }

  function toggleLegalStatus(value: string, checked: boolean) {
    set("legal_statuses", checked ? [...form.legal_statuses, value] : form.legal_statuses.filter((item) => item !== value));
  }

  function validate(nextStep: number): boolean {
    if (nextStep === 2) {
      if (!form.contact_name.trim() || !form.contact_email.includes("@") || !form.contact_phone.trim()) {
        setError("Enter the referring contact's name, email, and phone."); return false;
      }
      if (professional && !form.firm_name.trim()) { setError("Enter the referring law firm or brokerage."); return false; }
      if (!form.legal_statuses.length) { setError("Select at least one current legal status."); return false; }
      if (saleScheduled && !form.scheduled_sale_date) { setError("Enter the scheduled auction or sale date."); return false; }
    }
    if (nextStep === 3) {
      if (!form.borrower_name.trim() || !form.holding_entity.trim() || !form.ownership_structure.trim()) { setError("Borrower, holding entity, and ownership structure are required."); return false; }
      if (professional && (!form.client_email.includes("@") || !form.client_phone.trim())) { setError("Client email and phone are required for a referred matter, but remain contact-suppressed."); return false; }
      if (!form.property_addresses.trim()) { setError("Enter at least one property address."); return false; }
      if (!Number(form.occupancy_rate_pct) && form.occupancy_rate_pct !== "0") { setError("Enter the current occupancy rate."); return false; }
      if (form.property_type === "other" && !form.property_type_other.trim()) { setError("Describe the property type."); return false; }
    }
    if (nextStep === 4) {
      if (!form.senior_lender.trim() || sizing.payoff <= 0 || sizing.value <= 0) { setError("Senior lender, payoff, and estimated value are required."); return false; }
      if (form.has_other_liens_or_back_taxes && (!form.other_liens_amount.trim() || Number(form.other_liens_amount) < 0)) { setError("Enter the estimated other liens and back taxes."); return false; }
      if (Number(form.requested_loan_amount) <= 0 || Number(form.requested_loan_amount) > sizing.payoff) { setError("The requested amount must be positive and cannot exceed the payoff."); return false; }
      if (form.exit_strategy === "market_and_sell" && !form.selling_broker.trim()) { setError("Enter the selling broker for a market-sale exit."); return false; }
      if (form.submitter_type === "owner_direct" && !form.owner_contact_consent) { setError("Confirm the owner has authorized contact before creating an owner-direct file."); return false; }
    }
    setError("");
    return true;
  }

  function next() {
    if (!validate(step + 1)) return;
    setStep((current) => Math.min(4, current + 1));
  }

  async function create() {
    if (!validate(4) || creating) return;
    setCreating(true);
    setError("");
    try {
      const path = isPartner ? "/professional/foreclosure-rescues" : "/foreclosure-rescues";
      const created = await api<CreatedRescue>(path, {
        method: "POST",
        body: JSON.stringify({
          ...form,
          firm_name: form.firm_name || null,
          client_email: professional ? form.client_email : null,
          client_phone: professional ? form.client_phone : null,
          property_addresses: form.property_addresses.split("\n").map((value) => value.trim()).filter(Boolean),
          parcel_building_count: Number(form.parcel_building_count),
          occupancy_rate_pct: Number(form.occupancy_rate_pct),
          estimated_market_value: Number(form.estimated_market_value),
          payoff_balance: Number(form.payoff_balance),
          scheduled_sale_date: form.scheduled_sale_date || null,
          other_liens_amount: form.has_other_liens_or_back_taxes ? Number(form.other_liens_amount) : null,
          requested_loan_amount: Number(form.requested_loan_amount),
          property_type_other: form.property_type === "other" ? form.property_type_other : null,
          selling_broker: form.exit_strategy === "market_and_sell" ? form.selling_broker : null,
          narrative: form.narrative || null,
          authority_attested: true,
          owner_contact_consent: form.submitter_type === "owner_direct" ? form.owner_contact_consent : false,
          terms_accepted: true,
          privacy_accepted: true,
        }),
      });
      await onCreated(created);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The rescue file could not be created.");
    } finally {
      setCreating(false);
    }
  }

  const title = ["", "Referral and deadline", "Borrower and property", "Debt and exit", "Review"][step];
  return <Drawer open onClose={onClose} width="lg" ariaLabel="Create foreclosure rescue" title={`Create rescue · ${title}`} sub="Internal deadline-desk intake. No public-site handoff and no automatic client outreach." footer={<><Btn onClick={step === 1 ? onClose : () => { setError(""); setStep((value) => value - 1); }} disabled={creating}>{step === 1 ? "Cancel" : "Back"}</Btn><span className="sp" />{step < 4 ? <Btn variant="pri" onClick={next}>Continue</Btn> : <Btn variant="pri" onClick={() => void create()} disabled={creating}>{creating ? "Creating file…" : "Create rescue file"}</Btn>}</>}>
    <DrawerSteps steps={["Referral", "Property", "Debt & exit", "Review"]} current={step} />
    {step === 1 ? <div className="grid g12"><Callout tone="warn" icon={<Icon name="bolt" size={16} />}>Record the enforceable deadline first. Creating this financing file does not stay a sale or change a court date.</Callout><div className="fldgrid two"><Field label="Submitter type" req><Select value={form.submitter_type} onChange={(event) => set("submitter_type", event.target.value as SubmitterType)}><option value="attorney">Attorney</option><option value="broker">Broker</option>{!isPartner ? <option value="owner_direct">Owner direct</option> : null}</Select></Field><Field label="Preferred firm / brokerage" req={professional}><Input value={form.firm_name} onChange={(event) => set("firm_name", event.target.value)} /></Field><Field label="Referring contact" req><Input value={form.contact_name} onChange={(event) => set("contact_name", event.target.value)} /></Field><Field label="Contact email" req><Input type="email" value={form.contact_email} onChange={(event) => set("contact_email", event.target.value)} /></Field><Field label="Contact phone" req><Input type="tel" value={form.contact_phone} onChange={(event) => set("contact_phone", event.target.value)} /></Field><Field label="Case / docket number"><Input value={form.case_docket_number} onChange={(event) => set("case_docket_number", event.target.value)} /></Field></div><Field label="Current legal status" req><div className="fldgrid two">{legalOptions.map(([value, label]) => <label className={cx("pick", form.legal_statuses.includes(value) && "on")} key={value}><input type="checkbox" checked={form.legal_statuses.includes(value)} onChange={(event) => toggleLegalStatus(value, event.target.checked)} />{label}</label>)}</div></Field>{saleScheduled ? <Field label="Scheduled auction / sale date" req><Input type="date" value={form.scheduled_sale_date} onChange={(event) => set("scheduled_sale_date", event.target.value)} /></Field> : null}</div> : null}

    {step === 2 ? <div className="grid g12"><div className="fldgrid two"><Field label="Primary borrower / guarantor" req><Input value={form.borrower_name} onChange={(event) => set("borrower_name", event.target.value)} /></Field><Field label="Holding entity" req><Input value={form.holding_entity} onChange={(event) => set("holding_entity", event.target.value)} placeholder="Property Owner LLC" /></Field>{professional ? <><Field label="Client email" hint="Stored for file identity; contact remains suppressed." req><Input type="email" value={form.client_email} onChange={(event) => set("client_email", event.target.value)} /></Field><Field label="Client phone" hint="No calls or texts are triggered by creation." req><Input type="tel" value={form.client_phone} onChange={(event) => set("client_phone", event.target.value)} /></Field></> : null}<Field label="Property type" req><Select value={form.property_type} onChange={(event) => set("property_type", event.target.value)}><option value="multifamily_5_plus">Multifamily (5+)</option><option value="mixed_use">Mixed-use</option><option value="retail">Retail</option><option value="industrial">Industrial</option><option value="office">Office</option><option value="other">Other</option></Select></Field>{form.property_type === "other" ? <Field label="Describe property type" req><Input value={form.property_type_other} onChange={(event) => set("property_type_other", event.target.value)} /></Field> : null}<Field label="Parcels / buildings" req><Input type="number" min="1" value={form.parcel_building_count} onChange={(event) => set("parcel_building_count", event.target.value)} /></Field><Field label="Occupancy rate" req><Input type="number" min="0" max="100" step="0.1" value={form.occupancy_rate_pct} onChange={(event) => set("occupancy_rate_pct", event.target.value)} /></Field></div><Field label="Ownership structure" hint="List each member and ownership percentage." req><Textarea rows={2} value={form.ownership_structure} onChange={(event) => set("ownership_structure", event.target.value)} /></Field><Field label="Property address(es)" hint="One address per line for a portfolio." req><Textarea rows={3} value={form.property_addresses} onChange={(event) => set("property_addresses", event.target.value)} /></Field></div> : null}

    {step === 3 ? <div className="grid g12"><div className="fldgrid two"><Field label="Foreclosing senior lender" req><Input value={form.senior_lender} onChange={(event) => set("senior_lender", event.target.value)} /></Field><Field label="Payoff amount to refinance" hint="Calculates the minimum required value and requested amount." req><Input type="number" min="1" value={form.payoff_balance} onChange={(event) => updatePayoff(event.target.value)} /></Field><Field label="Estimated current market value" hint={valueWasCalculated ? "Minimum value calculated at 75% LTV—replace with the actual estimate when known." : "Calculates the maximum preliminary rescue amount."} req><Input type="number" min="1" value={form.estimated_market_value} onChange={(event) => { setValueWasCalculated(false); set("estimated_market_value", event.target.value); }} /></Field><Field label="Bailout amount requested" hint="Cannot exceed the verified payoff." req><Input type="number" min="1" max={sizing.payoff || undefined} value={form.requested_loan_amount} onChange={(event) => set("requested_loan_amount", event.target.value)} /></Field></div><div className="kpis"><div className="kpi"><span className="lbl">Maximum at 75% LTV</span><div className="knum num">{sizing.maxAdvance ? money.format(sizing.maxAdvance) : "—"}</div><div className="sub">preliminary collateral ceiling</div></div><div className="kpi"><span className="lbl">Minimum value for payoff</span><div className="knum num">{sizing.minimumValue ? money.format(sizing.minimumValue) : "—"}</div><div className="sub">at the 75% ceiling</div></div><div className="kpi"><span className="lbl">Entered payoff LTV</span><div className="knum num">{sizing.ltv ? `${(sizing.ltv * 100).toFixed(1)}%` : "—"}</div><div className="sub">payoff ÷ entered value</div></div></div>{sizing.gap != null ? <Callout tone={sizing.gap >= 0 ? "ok" : "bad"}>{sizing.gap >= 0 ? `${money.format(sizing.gap)} of estimated capacity remains.` : `Payoff exceeds the preliminary collateral ceiling by ${money.format(Math.abs(sizing.gap))}.`}</Callout> : null}<label className={cx("pick", form.has_other_liens_or_back_taxes && "on")}><input type="checkbox" checked={form.has_other_liens_or_back_taxes} onChange={(event) => set("has_other_liens_or_back_taxes", event.target.checked)} />Other liens or back taxes exist</label>{form.has_other_liens_or_back_taxes ? <Field label="Estimated other liens / back taxes" req><Input type="number" min="0" value={form.other_liens_amount} onChange={(event) => set("other_liens_amount", event.target.value)} /></Field> : null}<div className="fldgrid two"><Field label="Planned exit" req><Select value={form.exit_strategy} onChange={(event) => set("exit_strategy", event.target.value)}><option value="market_and_sell">Market and sell property</option><option value="conventional_refinance">Conventional refinance after stabilization</option><option value="partner_buyout_cash_infusion">Partner buyout / cash infusion</option></Select></Field>{form.exit_strategy === "market_and_sell" ? <Field label="Selling broker" req><Input value={form.selling_broker} onChange={(event) => set("selling_broker", event.target.value)} /></Field> : null}</div><Field label="Underwriting context" hint="Brief timeline, dispute, workout status, or exit milestones."><Textarea rows={3} value={form.narrative} onChange={(event) => set("narrative", event.target.value)} /></Field>{form.submitter_type === "owner_direct" ? <label className={cx("pick", form.owner_contact_consent && "on")}><input type="checkbox" checked={form.owner_contact_consent} onChange={(event) => set("owner_contact_consent", event.target.checked)} />Owner has authorized Qualified Commercial to contact them about this request</label> : null}</div> : null}

    {step === 4 ? <div className="grid g12"><Callout tone="acc" icon={<Icon name="check" size={16} />}>The file will enter the rescue queue as New Rescue. No email, SMS, public-site redirect, or client invitation is sent.</Callout><div className="create-intake-review"><div><span>File</span><b>{form.holding_entity}</b></div><div><span>Borrower</span><b>{form.borrower_name}</b></div><div><span>Referring contact</span><b>{form.contact_name} · {form.firm_name || "Owner direct"}</b></div><div><span>Deadline</span><b>{form.scheduled_sale_date || "Sale date not provided"}</b></div><div><span>Payoff / value</span><b>{money.format(sizing.payoff)} / {money.format(sizing.value)}</b></div><div><span>Payoff LTV</span><b>{sizing.ltv ? `${(sizing.ltv * 100).toFixed(1)}%` : "—"}</b></div><div><span>Requested amount</span><b>{money.format(Number(form.requested_loan_amount))}</b></div><div><span>Exit</span><b>{form.exit_strategy.replaceAll("_", " ")}</b></div></div><div className="line"><span className="sub">Program</span><strong>12.99% note rate · 24 months · 480-month amortization · payoff only</strong></div><div className="line"><span className="sub">Client communication</span><CellChip tone={professional ? "warn" : "ok"}>{professional ? "Suppressed—work through referring professional" : "Owner contact authorized"}</CellChip></div></div> : null}
    {error ? <Callout tone="bad">{error}</Callout> : null}
  </Drawer>;
}
