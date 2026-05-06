// Single source of truth for the Terms of Service + Privacy Policy text.
// When the documents are revised:
//   1. Update TERMS_VERSION / PRIVACY_VERSION to the new effective date.
//   2. Update the body copy below.
//   3. Existing user acceptances stay attached to the version they accepted —
//      the AppShell will re-prompt them (future work) when version > their
//      latest accepted row from /legal/acceptance.

export const TERMS_VERSION = "2026-05-05";
export const PRIVACY_VERSION = "2026-05-05";

// Short legal entity name surfaced in UI strings (consent checkbox label, etc.)
export const COMPANY_NAME = "Qualified Commercial LLC";

// Documents are stored as section arrays so the UI can render them with
// consistent typography and so future updates don't require re-templating.
export interface LegalSection {
  heading?: string;
  paragraphs: string[];
}

export interface LegalDocument {
  title: string;
  effectiveDate: string;
  preamble?: string;
  sections: LegalSection[];
}

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy",
  effectiveDate: "May 5, 2026",
  preamble:
    'Company: Qualified Commercial LLC ("Qualified Commercial", "we", "us", or "our")',
  sections: [
    {
      heading: "1. Introduction",
      paragraphs: [
        "Qualified Commercial LLC operates a commercial real estate lending platform, including our website, mobile applications (iOS and Android), and related services. We are committed to protecting your personal and financial information. We do not sell your personal data, nor do we share your sensitive credit information with unauthorized third parties.",
      ],
    },
    {
      heading: "2. Information We Collect",
      paragraphs: [
        "To process commercial loans and provide our services, we collect:",
        "Personal Identifiable Information (PII): Name, email address, phone number, and physical address.",
        "Financial Information: Credit profiles (e.g., FICO scores), tax returns, bank statements, Schedule of Real Estate Owned (SREO), and property data.",
        "Communication Data: Emails, SMS, and WhatsApp messages routed through our platform's proxy systems.",
        "Device & App Data: For mobile app users, we may collect device IDs, biometric login status (e.g., FaceID/TouchID processed locally on your device), and usage diagnostics.",
      ],
    },
    {
      heading: "3. How We Use Your Information",
      paragraphs: [
        "We use your data strictly to facilitate commercial real estate transactions:",
        "To match you with appropriate lending products and underwrite loan files.",
        "To generate automated, real-time rate estimates using third-party indices.",
        "To communicate securely with underwriters on your behalf using our proprietary routing system, protecting your direct contact information from widespread distribution.",
      ],
    },
    {
      heading: "4. Artificial Intelligence (AI) Processing",
      paragraphs: [
        "We utilize advanced Large Language Models (LLMs) to securely read, summarize, and organize emails and documents within your loan file.",
        "Data Privacy: Your data is processed securely via enterprise APIs. Your personal and financial data is never used to train public AI models.",
        "Human Oversight: Our AI assists our brokers. All critical financial data, loan packaging, and final submissions are reviewed by a human professional at Qualified Commercial LLC.",
      ],
    },
    {
      heading: "5. SMS, WhatsApp, and Email Communications",
      paragraphs: [
        "By providing your phone number and email, you consent to receive transactional and informational communications regarding your loan file via SMS, WhatsApp, and email (facilitated by providers like Twilio and Google Workspace).",
        'Opt-Out: You may opt-out of SMS/WhatsApp messages at any time by replying "STOP".',
        "No Marketing Sales: Your phone number and consent will never be shared with or sold to third parties for their own marketing purposes.",
      ],
    },
    {
      heading: "6. Data Sharing and Disclosure",
      paragraphs: [
        "We only share your information with:",
        "Selected Lenders: Only the specific underwriting partners required to fund your requested loan.",
        "Service Providers: Secure infrastructure partners (AWS, Clerk, Twilio) who are bound by strict confidentiality agreements.",
        "Legal Requirements: If required by law, subpoena, or regulatory audit.",
      ],
    },
    {
      heading: "7. Data Security, Encryption, and Third-Party Breaches",
      paragraphs: [
        "We implement institutional-grade security measures. Your documents and sensitive data are encrypted at rest (using AES-256) and in transit (via TLS 1.3) within our secure cloud infrastructure.",
        "Third-Party Infrastructure Hacks: While we utilize industry-leading service providers (e.g., Amazon Web Services), Qualified Commercial LLC cannot guarantee the absolute security of environments beyond our direct control. In the event that a third-party service provider experiences a data breach that compromises your information, we limit our direct financial liability. However, we commit to promptly notifying all affected users, initiating immediate remedial actions, and working continuously with the compromised provider to secure your data in accordance with applicable state and federal data breach notification laws.",
      ],
    },
    {
      heading: "8. Financial Regulatory Compliance (GLBA & FCRA)",
      paragraphs: [
        "Gramm-Leach-Bliley Act (GLBA): We maintain physical, electronic, and procedural safeguards that comply with federal regulations to guard your non-public personal information (NPI).",
        "Fair Credit Reporting Act (FCRA): Qualified Commercial LLC is a technology platform and brokerage, not a Consumer Reporting Agency. Credit estimates or scenarios run by our AI tools do not constitute official credit decisions. Final credit underwriting is performed exclusively by our third-party lending partners.",
      ],
    },
    {
      heading: "9. App Store & Account Deletion Rights",
      paragraphs: [
        "In compliance with Apple App Store and Google Play Store guidelines, you have the right to request the deletion of your account and associated data. You can trigger an account deletion request directly within the mobile app settings or by emailing support@qualifiedcommercial.com. (Note: Certain financial records must be retained for legal compliance even after account deletion).",
      ],
    },
  ],
};

export const TERMS_AND_CONDITIONS: LegalDocument = {
  title: "Terms and Conditions",
  effectiveDate: "May 5, 2026",
  sections: [
    {
      heading: "1. Acceptance of Terms",
      paragraphs: [
        "By accessing the Qualified Commercial LLC website or mobile applications, you agree to be bound by these Terms and Conditions. If you do not agree, do not use our services.",
      ],
    },
    {
      heading: "2. Nature of the Platform",
      paragraphs: [
        "Qualified Commercial LLC acts as a commercial loan brokerage and technology platform. We are not a direct lender.",
        "Estimated Rates: Interest rates, terms, and indices displayed on our dashboard are estimates. They do not constitute a binding loan commitment or a lock agreement.",
        "Accuracy of Information: You agree to provide accurate, current, and complete financial and personal information. Providing false or fraudulent documents is grounds for immediate account termination.",
      ],
    },
    {
      heading: '3. Use of Artificial Intelligence ("The Associate")',
      paragraphs: [
        "Qualified Commercial utilizes AI software to assist in loan processing, document summarization, and communication drafting.",
        "No AI Liability: While we strive for perfection, AI may occasionally generate inaccurate summaries or estimates. Qualified Commercial LLC assumes no liability for financial losses resulting from AI-generated text.",
        "Human-in-the-Loop: All automated calculations and final loan submissions are subject to human review by our licensed personnel before execution.",
      ],
    },
    {
      heading: "4. TCPA & Communications Consent",
      paragraphs: [
        'By registering an account, you provide express written consent under the Telephone Consumer Protection Act (TCPA) to receive communications from Qualified Commercial LLC, including automated emails, SMS messages, and WhatsApp notifications related to your loan status. Standard message and data rates may apply. You may revoke SMS consent by replying "STOP".',
      ],
    },
    {
      heading: "5. Third-Party Data, API Disclaimers, and Service Outages",
      paragraphs: [
        "Our platform utilizes third-party application programming interfaces (APIs), including the Federal Reserve Economic Data (FRED) API, Twilio, and Google Workspace.",
        'Data Accuracy: We provide this data on an "AS IS" and "AS AVAILABLE" basis. We do not warrant the real-time accuracy of third-party indices.',
        "Service Downtime: If a core infrastructure provider experiences an outage that temporarily disables our platform's functionality or communication routing, Qualified Commercial LLC will actively work to remedy the situation and restore service. However, we shall not be held liable for any delayed closings, lost deals, or financial opportunities resulting from third-party server downtimes or API failures.",
      ],
    },
    {
      heading: "6. Intellectual Property",
      paragraphs: [
        "All code, algorithms, UI/UX designs, and proprietary AI workflows are the exclusive property of Qualified Commercial LLC. You may not copy, reverse-engineer, or attempt to extract the source code or AI system prompts from our mobile apps or web platform.",
      ],
    },
    {
      heading: "7. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by law, Qualified Commercial LLC and its officers, directors, and employees shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the platform, the failure of a lender to fund a loan, or data breaches occurring at third-party infrastructure providers beyond our direct control.",
      ],
    },
    {
      heading: "8. Mandatory Arbitration and Class Action Waiver",
      paragraphs: [
        "Any dispute, claim, or controversy arising out of or relating to these Terms or the breach thereof shall be settled by binding arbitration administered by the American Arbitration Association (AAA) in the State of New Jersey. You and Qualified Commercial LLC agree that any dispute resolution proceedings will be conducted only on an individual basis and NOT in a class, consolidated, or representative action. By using this platform, you waive your right to a jury trial.",
      ],
    },
    {
      heading: "9. App Store and Google Play Store Disclaimers",
      paragraphs: [
        "If you download our mobile application from the Apple App Store or Google Play Store, you acknowledge that these Terms are concluded solely between you and Qualified Commercial LLC, and not with Apple Inc. or Google LLC. Qualified Commercial LLC is solely responsible for the App and its content. Apple and Google have no obligation whatsoever to furnish any maintenance or support services with respect to the App.",
      ],
    },
    {
      heading: "10. Governing Law",
      paragraphs: [
        "These Terms shall be governed by and construed in accordance with the laws of the State of New Jersey, without regard to its conflict of law principles.",
      ],
    },
    {
      heading: "11. Contact Information",
      paragraphs: [
        "For any questions regarding these Terms or our Privacy Policy, please contact:",
        "Email: support@qualifiedcommercial.com",
        "Entity: Qualified Commercial LLC (New Jersey)",
      ],
    },
  ],
};
