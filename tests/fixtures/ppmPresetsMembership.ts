import type { MarketplaceMembershipPolicy } from "../../src/lib/marketplaceMembership";
import type { MarketplacePpm, PpmLegalField, PpmVersion } from "../../src/lib/marketplacePpm";
import { ppmVersion as baseVersion, ppmState as baseState } from "./marketplacePpm";

// Audited local contract snapshot: platform wording and fictional fixture data.
const seedPolicy: MarketplaceMembershipPolicy = {
  "policy_version": "marketplace-membership-v1",
  "label": "Current marketplace membership policy",
  "summary": "Marketplace access requires staff-approved membership and completion of any recorded relationship waiting period.",
  "requirements": [
    {
      "key": "membership",
      "label": "Capital Partners membership",
      "detail": "Investors need staff-approved Capital Partners membership."
    },
    {
      "key": "waiting_period",
      "label": "Recorded relationship waiting period",
      "detail": "Any recorded relationship waiting period must be complete. The current default is 17 calendar days; a member's approved period may differ."
    },
    {
      "key": "acknowledgements",
      "label": "Subscription acknowledgements",
      "detail": "Investors acknowledge the PPM and provide their accredited-investor self-confirmation when requesting a subscription."
    },
    {
      "key": "offering_review",
      "label": "Offering-specific checks",
      "detail": "Each request is subject to offering-specific review, a current PPM, stated minimums and available capital. Final documents, signing, funding and issuer acceptance remain required."
    },
    {
      "key": "preview",
      "label": "Operator preview",
      "detail": "Authorized operators can preview offerings; subscriptions are made by members."
    }
  ],
  "waiting_period_days": 17,
  "limitations": [
    "Investor eligibility and subscription acceptance are confirmed for each offering."
  ],
  "approved_status": "approved",
  "waiting_end_must_have_passed_if_set": true,
  "requires_accreditation_acknowledgement": true,
  "requires_ppm_acknowledgement": true,
  "independent_accreditation_verification": false,
  "operator_subscriptions_allowed": false
};
const seedFields: PpmLegalField[] = [
  {
    "key": "issuer_legal_name",
    "label": "Issuer legal name",
    "required": true,
    "options": [
      {
        "key": "issuer_settings",
        "label": "Qualified Commercial LLC",
        "text": "Qualified Commercial LLC",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "issuer_settings",
    "default_value": "Qualified Commercial LLC",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "offering_structure",
    "label": "Offering and investor interest structure",
    "required": true,
    "options": [
      {
        "key": "platform_loan_participation",
        "label": "Loan participation — draft",
        "text": "The platform records a funded investor allocation as a loan participation. The final subscription, participation, note and security documents establish the investor's legal rights and payment terms.",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "platform_loan_participation",
    "default_value": "The platform records a funded investor allocation as a loan participation. The final subscription, participation, note and security documents establish the investor's legal rights and payment terms.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "offering_exemption",
    "label": "Offering exemption and restrictions",
    "required": true,
    "options": [
      {
        "key": "intended_506b_review",
        "label": "Intended Rule 506(b) — confirm before approval",
        "text": "Draft intended offering basis: Rule 506(b) private offering, subject to staff or counsel confirmation. No general solicitation is contemplated. The final offering terms, investor requirements and applicable limits must be confirmed before acceptance.",
        "unresolved": false
      },
      {
        "key": "not_confirmed",
        "label": "To be confirmed",
        "text": "Offering exemption and restrictions remain to be confirmed before approval.",
        "unresolved": true
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "intended_506b_review",
    "default_value": "Draft intended offering basis: Rule 506(b) private offering, subject to staff or counsel confirmation. No general solicitation is contemplated. The final offering terms, investor requirements and applicable limits must be confirmed before acceptance.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "jurisdiction",
    "label": "Governing law and offering jurisdictions",
    "required": true,
    "options": [
      {
        "key": "to_be_confirmed",
        "label": "To be confirmed",
        "text": "Governing law and offering jurisdictions remain to be confirmed before approval.",
        "unresolved": true
      },
      {
        "key": "us_state_AL",
        "label": "Alabama",
        "text": "Intended governing law: Alabama, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_AK",
        "label": "Alaska",
        "text": "Intended governing law: Alaska, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_AZ",
        "label": "Arizona",
        "text": "Intended governing law: Arizona, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_AR",
        "label": "Arkansas",
        "text": "Intended governing law: Arkansas, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_CA",
        "label": "California",
        "text": "Intended governing law: California, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_CO",
        "label": "Colorado",
        "text": "Intended governing law: Colorado, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_CT",
        "label": "Connecticut",
        "text": "Intended governing law: Connecticut, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_DE",
        "label": "Delaware",
        "text": "Intended governing law: Delaware, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_DC",
        "label": "District of Columbia",
        "text": "Intended governing law: District of Columbia, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_FL",
        "label": "Florida",
        "text": "Intended governing law: Florida, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_GA",
        "label": "Georgia",
        "text": "Intended governing law: Georgia, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_HI",
        "label": "Hawaii",
        "text": "Intended governing law: Hawaii, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_ID",
        "label": "Idaho",
        "text": "Intended governing law: Idaho, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_IL",
        "label": "Illinois",
        "text": "Intended governing law: Illinois, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_IN",
        "label": "Indiana",
        "text": "Intended governing law: Indiana, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_IA",
        "label": "Iowa",
        "text": "Intended governing law: Iowa, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_KS",
        "label": "Kansas",
        "text": "Intended governing law: Kansas, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_KY",
        "label": "Kentucky",
        "text": "Intended governing law: Kentucky, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_LA",
        "label": "Louisiana",
        "text": "Intended governing law: Louisiana, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_ME",
        "label": "Maine",
        "text": "Intended governing law: Maine, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MD",
        "label": "Maryland",
        "text": "Intended governing law: Maryland, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MA",
        "label": "Massachusetts",
        "text": "Intended governing law: Massachusetts, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MI",
        "label": "Michigan",
        "text": "Intended governing law: Michigan, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MN",
        "label": "Minnesota",
        "text": "Intended governing law: Minnesota, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MS",
        "label": "Mississippi",
        "text": "Intended governing law: Mississippi, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MO",
        "label": "Missouri",
        "text": "Intended governing law: Missouri, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_MT",
        "label": "Montana",
        "text": "Intended governing law: Montana, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NE",
        "label": "Nebraska",
        "text": "Intended governing law: Nebraska, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NV",
        "label": "Nevada",
        "text": "Intended governing law: Nevada, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NH",
        "label": "New Hampshire",
        "text": "Intended governing law: New Hampshire, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NJ",
        "label": "New Jersey",
        "text": "Intended governing law: New Jersey, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NM",
        "label": "New Mexico",
        "text": "Intended governing law: New Mexico, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NY",
        "label": "New York",
        "text": "Intended governing law: New York, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_NC",
        "label": "North Carolina",
        "text": "Intended governing law: North Carolina, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_ND",
        "label": "North Dakota",
        "text": "Intended governing law: North Dakota, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_OH",
        "label": "Ohio",
        "text": "Intended governing law: Ohio, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_OK",
        "label": "Oklahoma",
        "text": "Intended governing law: Oklahoma, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_OR",
        "label": "Oregon",
        "text": "Intended governing law: Oregon, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_PA",
        "label": "Pennsylvania",
        "text": "Intended governing law: Pennsylvania, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_RI",
        "label": "Rhode Island",
        "text": "Intended governing law: Rhode Island, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_SC",
        "label": "South Carolina",
        "text": "Intended governing law: South Carolina, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_SD",
        "label": "South Dakota",
        "text": "Intended governing law: South Dakota, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_TN",
        "label": "Tennessee",
        "text": "Intended governing law: Tennessee, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_TX",
        "label": "Texas",
        "text": "Intended governing law: Texas, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_UT",
        "label": "Utah",
        "text": "Intended governing law: Utah, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_VT",
        "label": "Vermont",
        "text": "Intended governing law: Vermont, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_VA",
        "label": "Virginia",
        "text": "Intended governing law: Virginia, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_WA",
        "label": "Washington",
        "text": "Intended governing law: Washington, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_WV",
        "label": "West Virginia",
        "text": "Intended governing law: West Virginia, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_WI",
        "label": "Wisconsin",
        "text": "Intended governing law: Wisconsin, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "us_state_WY",
        "label": "Wyoming",
        "text": "Intended governing law: Wyoming, subject to confirmation in the definitive offering documents. Offering jurisdictions and applicable filing requirements require separate review.",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "to_be_confirmed",
    "default_value": "Governing law and offering jurisdictions remain to be confirmed before approval.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "investor_eligibility",
    "label": "Investor eligibility requirements",
    "required": true,
    "options": [
      {
        "key": "marketplace_membership_policy",
        "label": "Current marketplace member requirements",
        "text": "Investors need staff-approved Capital Partners membership. Any recorded relationship waiting period must be complete. The current default is 17 calendar days; a member's approved period may differ. Investors acknowledge the PPM and provide their accredited-investor self-confirmation when requesting a subscription. Each request is subject to offering-specific review, a current PPM, stated minimums and available capital. Final documents, signing, funding and issuer acceptance remain required. Authorized operators can preview offerings; subscriptions are made by members. Investor eligibility and subscription acceptance are confirmed for each offering.",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "marketplace_membership_policy",
    "default_value": "Investors need staff-approved Capital Partners membership. Any recorded relationship waiting period must be complete. The current default is 17 calendar days; a member's approved period may differ. Investors acknowledge the PPM and provide their accredited-investor self-confirmation when requesting a subscription. Each request is subject to offering-specific review, a current PPM, stated minimums and available capital. Final documents, signing, funding and issuer acceptance remain required. Authorized operators can preview offerings; subscriptions are made by members. Investor eligibility and subscription acceptance are confirmed for each offering.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "subscription_process",
    "label": "Subscription, acceptance and funding process",
    "required": true,
    "options": [
      {
        "key": "marketplace_allocation_workflow",
        "label": "Marketplace subscription process",
        "text": "A cleared member may request an allocation subject to the stated minimum and available capital. The investor acknowledges the PPM and provides accredited-investor self-confirmation. The desk then processes subscription documents and records signing and funding. A request alone does not guarantee acceptance or funding.",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "marketplace_allocation_workflow",
    "default_value": "A cleared member may request an allocation subject to the stated minimum and available capital. The investor acknowledges the PPM and provides accredited-investor self-confirmation. The desk then processes subscription documents and records signing and funding. A request alone does not guarantee acceptance or funding.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "transfer_restrictions",
    "label": "Transfer and liquidity restrictions",
    "required": true,
    "options": [
      {
        "key": "issuer_consent_workflow",
        "label": "Issuer-consent transfer process",
        "text": "The platform supports requests to transfer a participation. Completion requires recorded issuer consent and settlement. The definitive offering documents govern transfer rights and restrictions; no liquid secondary market is assured.",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "issuer_consent_workflow",
    "default_value": "The platform supports requests to transfer a participation. Completion requires recorded issuer consent and settlement. The definitive offering documents govern transfer rights and restrictions; no liquid secondary market is assured.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "conflicts_of_interest",
    "label": "Conflicts of interest and compensation disclosures",
    "required": true,
    "options": [
      {
        "key": "recorded_fees_and_conflicts",
        "label": "Recorded fees and conflicts disclosure",
        "text": "Company, manager or servicer compensation may create conflicts of interest. The fee disclosure identifies currently recorded charges, payers and applicability. Any additional affiliation, referral or compensation arrangement must be disclosed and reviewed before approval.",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "recorded_fees_and_conflicts",
    "default_value": "Company, manager or servicer compensation may create conflicts of interest. The fee disclosure identifies currently recorded charges, payers and applicability. Any additional affiliation, referral or compensation arrangement must be disclosed and reviewed before approval.",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  },
  {
    "key": "offering_currency",
    "label": "Offering currency",
    "required": false,
    "options": [
      {
        "key": "saved_financing_currency",
        "label": "USD — saved financing",
        "text": "USD",
        "unresolved": false
      },
      {
        "key": "custom",
        "label": "Custom wording",
        "text": "",
        "unresolved": false
      }
    ],
    "default_preset": "saved_financing_currency",
    "default_value": "USD",
    "help": "Draft wording for staff review. Custom wording is preserved when saved facts change.",
    "read_only": false
  }
];

export function membershipPolicy(days = 17): MarketplaceMembershipPolicy {
  const value = structuredClone(seedPolicy); value.waiting_period_days = days;
  value.requirements = value.requirements.map(row => ({ ...row, detail: row.detail.replace("17 calendar days", `${days} calendar days`) }));
  return value;
}
export function presetFields(days = 17, currency = "USD"): PpmLegalField[] {
  return structuredClone(seedFields).map(field => ({ ...field,
    default_value: field.key === "offering_currency" ? currency : field.default_value?.replace("17 calendar days", `${days} calendar days`),
    options: field.options?.map(option => ({ ...option,
      text: option.key === "saved_financing_currency" ? currency : option.text.replace("17 calendar days", `${days} calendar days`),
      label: option.key === "saved_financing_currency" ? `Saved financing currency (${currency})` : option.label,
    })),
  }));
}
export function presetVersion(number: number, fingerprint: string, legal?: Record<string, string>, selected?: Record<string, string>, days = 17, currency = "USD"): PpmVersion {
  const fields = presetFields(days, currency);
  const values = legal ?? Object.fromEntries(fields.map(field => [field.key, field.default_value ?? ""]));
  const presets = selected ?? Object.fromEntries(fields.map(field => [field.key, field.default_preset ?? "custom"]));
  return { ...baseVersion(number, fingerprint, values), legal_presets: { ...presets },
    document: { ...baseVersion(number, fingerprint, values).document, sections: [
      ...baseVersion(number, fingerprint, values).document.sections,
      { key: "marketplace_policy", title: "Current platform membership requirements", paragraphs: [membershipPolicy(days).summary, ...membershipPolicy(days).requirements.map(row => row.detail)], facts: [] },
    ] },
  };
}
export function presetState(current: PpmVersion | null = null, history: PpmVersion[] = [], days = 17, currency = "USD"): MarketplacePpm {
  const fields = presetFields(days, currency), state = baseState(current, history);
  return { ...state, membership_policy: membershipPolicy(days), legal_fields: fields,
    legal_defaults: Object.fromEntries(fields.map(field => [field.key, field.default_value ?? ""])),
    legal_default_presets: Object.fromEntries(fields.map(field => [field.key, field.default_preset ?? "custom"])),
    missing: fields.filter(field => field.required && (!current?.legal_inputs[field.key]?.trim() || field.options?.find(option => option.key === current?.legal_presets?.[field.key])?.unresolved)).map(field => ({ key: field.key, label: field.label, section: "legal" as const, required: true })),
  };
}
export const syntheticMember = { id: "92000000-0000-0000-0000-000000000002", name: "Example waiting investor", display_name: "Example waiting investor", email: "waiting-investor@example.test", status: "under_review", investing_as: "individual", state_of_residence: "NJ", relationship_established_at: null, waiting_period_ends_at: null, approved_at: null, subscriptions_count: 0, participations_count: 0 };
