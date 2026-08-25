"use client";

// Investor profile editor — dialog opened from /profile → "Investor Profile"
// row. Borrower-only (CLIENT role); other roles see a hint that the dialog
// doesn't apply to operator accounts.
//
// Edits land on /clients/me (PATCH) which only accepts the safe-to-self-edit
// fields — tier/FICO/funded totals stay broker/super-admin only.
//
// Restyled onto the shared `Drawer` (Phase 3). Drawer carries the behaviour
// the hand-rolled overlay had — Escape closes, backdrop click closes, the
// dialog is role="dialog" aria-modal — and adds body-scroll lock and focus
// return, so the local keydown listener is gone rather than duplicated.

import { useEffect, useState } from "react";
import {
  Btn,
  CG,
  CellChip,
  Field,
  Input,
  Kpi,
  KpiRow,
  Lbl,
  Note,
  Panel,
  Textarea,
} from "@/components/ds";
import { Drawer } from "@/components/ds/Drawer";
import { Icon } from "@/components/design-system/Icon";
import { useMyClient, useUpdateMyClient } from "@/hooks/useApi";
import { QC_FMT } from "@/lib/fmt";
import { AddressInput, formatAddressParts } from "@/components/property/GoogleAddressInput";

interface Props {
  open: boolean;
  onClose: () => void;
}

// `.field` owns the input box (border, radius, padding, colour). It owns
// neither of these, and a <textarea> needs both: without width it sizes to
// its `cols` default, and without an explicit resize it can be dragged wider
// than the dialog.
const TEXTAREA: React.CSSProperties = { width: "100%", resize: "vertical" };

export function InvestorProfileDialog({ open, onClose }: Props) {
  const { data: client, isLoading, error } = useMyClient(open);
  const update = useUpdateMyClient();

  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [properties, setProperties] = useState("");
  const [experience, setExperience] = useState("");
  const [flash, setFlash] = useState<string | null>(null);

  // Hydrate the form whenever the modal opens (so a save → close → reopen
  // shows the freshly-saved values).
  useEffect(() => {
    if (open && client) {
      setPhone(client.phone ?? "");
      setAddress(client.address ?? "");
      setCity(client.city ?? "");
      setProperties(client.properties ?? "");
      setExperience(client.experience ?? "");
      setFlash(null);
    }
  }, [open, client]);

  const submit = async () => {
    setFlash(null);
    try {
      await update.mutateAsync({
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        properties: properties.trim() || undefined,
        experience: experience.trim() || undefined,
      });
      setFlash("Saved.");
      setTimeout(() => setFlash(null), 1800);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Save failed");
    }
  };

  // 404 from /clients/me means the signed-in user doesn't have a Client
  // record (operator account). Show a short explainer rather than the form.
  const isMissingClient = !!error && /404/.test(String((error as Error).message));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="md"
      title="Investor Profile"
      sub="Properties owned and investing experience — read by your underwriter and by Elara when scoring deals."
      bodyClass="grid"
      footer={
        <>
          <span className="sp" />
          <Btn onClick={onClose} disabled={update.isPending}>
            {client ? "Cancel" : "Close"}
          </Btn>
          {client && (
            <Btn variant="pri" onClick={submit} disabled={update.isPending}>
              <Icon name="check" size={13} />
              {update.isPending ? "Saving…" : "Save profile"}
            </Btn>
          )}
        </>
      }
    >
      {isLoading && <div className="sub">Loading…</div>}

      {isMissingClient && (
        <Note>
          Your account isn&apos;t linked to a borrower profile. The Investor Profile
          applies to borrower accounts — operator accounts manage names, phones,
          and addresses through <strong>Personal Info</strong> instead.
        </Note>
      )}

      {client && (
        <>
          {/* Stats panel — read-only, set by underwriting */}
          <div>
            <Lbl>Underwriting status</Lbl>
            <KpiRow className="mt">
              <Kpi label="Tier" value={<CellChip tone="pet">{client.tier}</CellChip>} />
              <Kpi label="Funded loans" value={client.funded_count} />
              <Kpi label="Funded total" value={QC_FMT.short(client.funded_total)} />
            </KpiRow>
            <div className="sub mt">
              Tier and funded totals are set by your loan officer — contact your
              account exec to update.
            </div>
          </div>

          {/* Contact info — borrower self-edit */}
          <Panel title="Contact">
            <CG>
              <Field label="Phone" className="s6">
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 555-1234"
                />
              </Field>
              <Field label="City" className="s6">
                <Input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Charlotte, NC"
                />
              </Field>
              <div className="s12">
                <AddressInput
                  label="Mailing address"
                  value={address ? { full: address, city } : null}
                  onChange={(next) => {
                    setAddress(formatAddressParts(next));
                    if (next.city) setCity(next.city);
                  }}
                />
              </div>
            </CG>
          </Panel>

          {/* Properties owned */}
          <Panel title="Properties owned">
            <div className="sub">
              Free-form — list addresses, types, current values, monthly rent. Your
              underwriter and the &quot;Elara&quot; both read this when scoring deals.
            </div>
            <Textarea
              className="mt"
              value={properties}
              onChange={(e) => setProperties(e.target.value)}
              rows={6}
              placeholder={"e.g.\n418 Sycamore St, Charlotte NC — SFR rental — purchased 2022 for $312k, currently $2,400/mo rent\nLot 47 Riverbend, Austin TX — vacant land — purchased 2024 for $185k"}
              style={TEXTAREA}
            />
          </Panel>

          {/* Experience */}
          <Panel title="Experience">
            <div className="sub">
              Years investing, completed flips, ground-up projects, current
              rehab work in flight. Helps the underwriter waive experience-tier
              thresholds when relevant.
            </div>
            <Textarea
              className="mt"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
              rows={6}
              placeholder={"e.g.\n5 years investing, 3 flips completed in last 24 months (avg gross profit $58k)\n1 ground-up SFR currently under construction in Charlotte\nManaged GC for all rehabs personally"}
              style={TEXTAREA}
            />
          </Panel>

          {flash && (
            <div>
              <CellChip tone={flash === "Saved." ? "ok" : "bad"}>{flash}</CellChip>
            </div>
          )}
        </>
      )}
    </Drawer>
  );
}
