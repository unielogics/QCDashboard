// Step 5 — Agreement and signatures. Parties, the thresholds the agreement
// enforces, a preview of what prints, and both signature stages. The long
// tail — identity, ownership, the funding facility, Schedules 2–4 — lives
// behind disclosures that stay mounted and open when the focus lands inside.
import type { PackageClient } from "../client";
import { Step1Parties } from "../steps/Step1Parties";
import { Step6Thresholds } from "../steps/Step6Thresholds";
import { Step9Preview } from "../steps/Step9Preview";
import { Step10Send } from "../steps/Step10Send";
import { StepDisclosures } from "../steps/StepDisclosures";
import { StepFunding } from "../steps/StepFunding";
import { Disclosure, type StepCtx } from "../ui";
import type { ProductionPackage, SponsorOption } from "../types";

const FUNDING = (k: string) => ["funding_party", "funding_party_name", "funding_date", "funded_amount", "commencement", "activation_date", "maturity", "funding_docs_executed_date", "controlled_account", "ach_account", "use_of_funds", "program_support", "program_support_other", "fp_joinder", "dealer_notice_email"].includes(k);
const DISCLOSURES = (k: string) => k.startsWith("rm_comp") || k.startsWith("comp_") || k.startsWith("program_economics") || k.startsWith("financing_cost") || k.startsWith("conflict_") || k === "sba_status" || k.startsWith("protected_") || k.startsWith("existing_");
const THRESHOLDS = (k: string) => k.startsWith("thresholds.") || k === "audit_discrepancy_threshold" || k === "review_threshold";

export function PageAgreement({ ctx, client, sponsors, onPackage, onPresentation }: {
  ctx: StepCtx; client: PackageClient; sponsors: SponsorOption[]; onPackage: (p: ProductionPackage, keepDraft?: boolean) => void; onPresentation: () => void;
}) {
  const { pkg, computed, focusKey } = ctx;
  const two = pkg.stage === 2;
  const count = (owns: (k: string) => boolean) => computed.attention.filter((a) => owns(a.key)).length;
  const thr = count(THRESHOLDS);
  const fund = count(FUNDING);
  const disc = count(DISCLOSURES);
  const blanks = computed.preview[two ? "two" : "one"].filter((r) => r.blank).length;
  return (
    <>
      <Step1Parties ctx={ctx} sponsors={sponsors} client={client} onPackage={(next) => onPackage(next, true)} />
      <Disclosure title="Operative thresholds" sub="Set from the agreement's own guideline — an 85% monthly floor, 90% over a rolling three months, remittance of at least 125% of the payment. Adjust only if underwriting agrees." owns={THRESHOLDS} focusKey={focusKey} count={thr} tone={thr ? "bad" : undefined}>
        <Step6Thresholds ctx={ctx} />
      </Disclosure>
      {two ? (
        <>
          <Disclosure title="Funding facility — Schedule 1" sub="The facility as funded: party, amounts, dates, accounts and use of funds, from the term sheet." owns={FUNDING} focusKey={focusKey} count={fund} tone={fund ? "bad" : undefined}>
            <StepFunding ctx={ctx} />
          </Disclosure>
          <Disclosure title="Compensation and relationships — Schedules 2–4" sub="The relationship manager's compensation category, every disclosed fee, and the protected and preexisting funding relationships." owns={DISCLOSURES} focusKey={focusKey} count={disc} tone={disc ? "bad" : undefined}>
            <StepDisclosures ctx={ctx} />
          </Disclosure>
        </>
      ) : null}
      <Disclosure title="Contract preview" sub={blanks ? `${blanks} field${blanks === 1 ? "" : "s"} print blank on this stage.` : "Every field on this stage carries a value."} owns={(k) => k === "preview"} focusKey={focusKey} count={blanks} tone={blanks ? "bad" : undefined}>
        <Step9Preview ctx={ctx} client={client} />
      </Disclosure>
      <div id="pp-field-send">
        <Step10Send ctx={ctx} client={client} onPackage={(next) => onPackage(next)} onPresentation={onPresentation} />
      </div>
    </>
  );
}
