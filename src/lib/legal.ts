// Single source of truth for the in-app legal documents (Terms +
// Privacy + Funding/AI/Communications/Platform Disclosure).
//
// When the documents are revised:
//   1. Bump TERMS_VERSION / PRIVACY_VERSION / DISCLOSURE_VERSION to the
//      new effective date.
//   2. Replace the body copy below.
//   3. Update the sibling QCWeb file `src/lib/legal-content.ts` in
//      lockstep — the marketing site duplicates this prose by design.
//   4. Existing user acceptances stay attached to the version they
//      accepted — the AppShell will re-prompt them (future work) when
//      version > their latest accepted row from /legal/acceptance.
//
// v1.0 (Effective 2026-05-19) is the first deploy of the finalized
// post-counsel prose. Approved by Jonathan Franco, Executive Partner.

export const TERMS_VERSION = "2026-05-19";
export const PRIVACY_VERSION = "2026-05-19";
export const DISCLOSURE_VERSION = "2026-05-19";

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

// ---------------------------------------------------------------------------
// Privacy Policy and Financial Privacy Notice — v1.0 (Effective 2026-05-19)
// ---------------------------------------------------------------------------

export const PRIVACY_POLICY: LegalDocument = {
  title: "Privacy Policy and Financial Privacy Notice",
  effectiveDate: "May 19, 2026",
  preamble:
    'Qualified Commercial LLC ("Qualified Commercial", "we", "us", or "our") — a New Jersey limited liability company. Mailing address: 14 53rd St #408N, Brooklyn, NY 11232. Contact: support@qualifiedcommercial.com. Version 1.0, approved by Jonathan Franco, Executive Partner.',
  sections: [
    {
      heading: "Plain-English Summary",
      paragraphs: [
        "Qualified Commercial LLC does not sell lead information or borrower information. We use information to operate the platform, communicate about accounts and funding files, conduct internal file review, prepare lender packages, support AI-assisted workflows, and submit validated packages to selected lending companies or authorized service providers. Certain advertising and analytics tools may be considered targeted advertising or sharing under some privacy laws; opt-out options are described below.",
      ],
    },
    {
      heading: "1. Scope",
      paragraphs: [
        "This Privacy Policy and Financial Privacy Notice explains how Qualified Commercial LLC collects, uses, protects, retains, and discloses information through the QualifiedCommercial website, web portal, mobile applications, messaging tools, e-signature flows, AI-assisted funding tools, agent/realtor workflows, and related services. It applies to borrowers, business owners, guarantors, real estate professionals, brokers, agents, internal users, and other users of the platform.",
        "This policy is intended to cover personal information, financial information, nonpublic personal information, documents uploaded to a funding file, communications, consent records, device data, and related operational records. It should be read together with the Terms and Conditions, Funding/AI/Communications Disclosure, and Signature Authorization Packet.",
      ],
    },
    {
      heading: "2. Information We Collect",
      paragraphs: [
        "Account information, including name, business name, email address, phone number, role, login information, contact preferences, and account status.",
        "Funding file information, including property address, loan purpose, requested amount, estimated values, bank statements, entity documents, tax documents, financial documents, credit-related information, identity information, real estate documents, and other information supplied by a user, agent, realtor, broker, or authorized representative.",
        "Credit authorization and underwriting information, including consent records, credit pull authorization status, internal file review results, AI-generated observations, underwriting notes, lender package status, and lender responses.",
        "Payment and credit card authorization information, including authorized amount, payment purpose, card brand, last four digits, expiration month/year, payment token or processor reference, billing information, and authorization/audit records. We do not intentionally store CVV/CVC codes and should not store full raw card numbers in the QualifiedCommercial database.",
        "Communications information, including emails, SMS/text messages, mobile push notifications, in-app messages, chat transcripts, call notes, support tickets, delivery statuses, opt-in and opt-out records, and campaign/notification logs.",
        "Device and usage information, including IP address, browser, operating system, mobile device type, app version, time zone, pages/screens viewed, session data, clicks, consent events, and system logs.",
        "Advertising and analytics information, including cookie identifiers, pixel events, ad interactions, source/medium/campaign data, retargeting audiences, conversion events, and aggregated analytics from tools such as Meta/Facebook, Google Ads, and similar platforms.",
        "Real estate professional lead/client information uploaded by a realtor, broker, or agent, including lead/contact details, client notes, task status, file stage, communications, and delegated AI pipeline instructions.",
        "E-signature records, including document version, signer identity, signature method, checkbox confirmations, IP address, device data, timestamp, audit trail, final PDF, certificate of completion, and document hash or integrity record.",
      ],
    },
    {
      heading: "3. How We Use Information",
      paragraphs: [
        "To create, maintain, and secure user accounts and funding files.",
        "To verify identity, authority, consent, and eligibility to use the platform.",
        "To conduct internal file review, AI-assisted analysis, document validation, scenario review, and preliminary funding assessment.",
        "To prepare, organize, and submit validated lender packages to selected third-party lending companies, funding partners, processors, underwriters, and service providers for real underwriting and funding review.",
        "To obtain, document, and retain authorizations for credit card payments, hard credit pulls, file sharing, electronic signatures, electronic records, SMS/email/push communications, and related account notices.",
        "To communicate by email, SMS/text message, phone, push notification, in-app message, and other channels about accounts, pending files, document requests, signatures, funding updates, platform activity, and service announcements.",
        "To support realtor, broker, and agent workflows, including AI pipeline delegation, task tracking, client engagement, and file preparation.",
        "To provide customer support, troubleshooting, security monitoring, fraud prevention, compliance review, and audit records.",
        "To improve the platform, train internal workflows, measure performance, analyze conversion activity, debug errors, and develop new features.",
        "To run advertising, retargeting, measurement, attribution, and audience management through tools such as Meta/Facebook and Google Ads, subject to opt-out rights and applicable law.",
        "To comply with law, enforce agreements, respond to lawful requests, protect rights, investigate misuse, and defend claims.",
      ],
    },
    {
      heading: "4. AI Underwriting and Automated Assistance",
      paragraphs: [
        "QualifiedCommercial uses AI-assisted tools to review files, identify missing information, produce observations, support underwriting preparation, help agents manage pipelines, and generate internal or borrower-facing communications. AI output may be incomplete, inaccurate, delayed, inconsistent, or based on limited information. AI output is not a final loan approval, final underwriting decision, legal advice, tax advice, appraisal, valuation, commitment to lend, or servicing instruction.",
        "Final lending decisions, loan terms, approvals, denials, credit conditions, rate locks, document conditions, and post-closing servicing are controlled by the applicable lender, funding company, servicer, or other third party. Qualified Commercial LLC does not represent that every projection, scenario, internal term, prequalification, or AI-generated recommendation will close as projected.",
      ],
    },
    {
      heading: "5. How We Share Information",
      paragraphs: [
        "We do not sell borrower, lead, or realtor-uploaded client information for money. We do not use realtor-uploaded leads to independently solicit or compete for that client outside the relationship and file purpose provided to us by the realtor, broker, or agent, except where the client independently contacts us, law requires action, or the realtor/client relationship has been separately authorized.",
        "We may disclose information as follows:",
        "To selected lending companies, funding partners, processors, underwriters, credit/reporting vendors, and service providers when a funding package is validated, authorized, or ready for underwriting review.",
        "To service providers that help operate the platform, including cloud hosting, AWS infrastructure, Twilio messaging, email delivery, payment processing, analytics, identity verification, document generation, e-signature, customer support, and security vendors.",
        "To Meta/Facebook, Google Ads, and similar advertising/analytics platforms for retargeting, conversion tracking, analytics, and campaign measurement. These activities may be considered targeted advertising or sharing under some privacy laws even though we do not sell information for money.",
        "To realtors, brokers, agents, or authorized representatives associated with a client file, when needed to manage the file, complete tasks, communicate with the client, or process a funding request.",
        "To comply with law, legal process, regulatory inquiry, lender or investor review, fraud/security investigation, dispute resolution, or rights enforcement.",
        "In connection with a merger, financing, reorganization, sale, assignment, or transfer of business assets, subject to reasonable confidentiality and legal requirements.",
      ],
    },
    {
      heading: "6. Financial Privacy Notice",
      paragraphs: [
        "Because the platform supports commercial and real estate financing workflows, we treat financial and nonpublic personal information with heightened care.",
        "Everyday business purposes (operating accounts, processing funding files, preparing lender packages, responding to authorized requests, maintaining records): Yes, we share. You cannot limit this sharing where it is needed to provide the service, complete the funding workflow, comply with law, or protect the platform.",
        "With selected lenders, funding partners, credit/reporting vendors, processors, underwriters, and service providers for underwriting and funding review: Yes, when authorized or needed for a file. You may stop using the service or withdraw consent before submission when possible, but withdrawal may prevent funding review.",
        "For our own marketing, retargeting, conversion measurement, and platform improvement: Yes, limited to permitted uses. You may opt out of marketing emails, SMS marketing, push notifications, cookies, and targeted advertising as described below.",
        "With nonaffiliated companies for their independent marketing unrelated to your funding request: No.",
        "Realtor-uploaded leads or client contacts sold to unrelated third parties: No — we do not sell those leads or contacts.",
      ],
    },
    {
      heading: "7. Communications, SMS, Email, and Push Notifications",
      paragraphs: [
        "When a user signs up, creates an account, provides a phone number, initiates a funding file, is invited by an authorized realtor/broker/agent, or otherwise uses the platform, the user agrees to receive account-related and funding-file-related communications by email, SMS/text message, phone, mobile push notification, and in-app message. These may include login/security messages, document requests, signature requests, file status updates, lender package updates, missing information alerts, AI workflow messages, and service notices.",
        "Text messages may be sent using Twilio or another messaging provider. Message frequency varies. Message and data rates may apply. A user can opt out of nonessential SMS by replying STOP where supported, and can request help by replying HELP where supported. Opting out may limit our ability to provide time-sensitive account, funding, or document communications. Separate consent may be requested for marketing/promotional text messages where required.",
        "Users may unsubscribe from marketing emails using the unsubscribe link or by contacting us. Transactional and account-related emails may continue as necessary. Mobile push notifications may be controlled through device or app settings.",
      ],
    },
    {
      heading: "8. Cookies, Pixels, Retargeting, and Advertising",
      paragraphs: [
        "We may use cookies, pixels, SDKs, tags, and similar technologies from Meta/Facebook, Google Ads, analytics providers, and other partners to measure traffic, understand use of the platform, improve campaigns, attribute conversions, and show retargeting ads. Retargeting ads may appear in a user's social media feed, search results, display placements, or other digital channels after interacting with QualifiedCommercial.",
        "These technologies may process device identifiers, IP address, browser information, event data, pages/screens visited, and campaign identifiers. We do not use these tools to sell lead information or realtor-uploaded client lists. Users can control cookies through browser settings, device settings, platform opt-outs, ad preference tools, or by contacting us at the email listed in this policy.",
      ],
    },
    {
      heading: "9. Security and Encryption",
      paragraphs: [
        "We use administrative, technical, and physical safeguards designed to protect information, including encryption in transit and at rest where appropriate, access controls, role-based permissions, authentication controls, logging, monitoring, backups, and vendor review. No system can be guaranteed completely secure. Users are responsible for protecting their login credentials, devices, email accounts, and phone numbers.",
        "We may use AWS and other infrastructure providers. The platform may experience downtime, latency, interrupted access, data delays, message delays, or degraded performance due to AWS outages, third-party vendor issues, maintenance, cybersecurity events, internet outages, mobile carrier issues, or other conditions beyond our control.",
      ],
    },
    {
      heading: "10. Sensitive Data and Data Minimization",
      paragraphs: [
        "We seek to minimize sensitive information where possible. However, funding files, credit authorizations, bank statements, tax records, identity documents, entity documents, property documents, and other uploaded records may contain sensitive information needed to evaluate, prepare, or submit a funding package. We use encryption and access controls for such records and limit access to authorized personnel, representatives, service providers, and selected lending parties who need the information for the funding workflow.",
        "Payment card data should be handled through tokenized or hosted payment providers when possible. We do not intentionally store CVV/CVC codes after authorization and should not store full raw card numbers in platform databases or signed PDFs.",
      ],
    },
    {
      heading: "11. Data Retention",
      paragraphs: [
        "We retain information for as long as reasonably necessary to operate the platform, maintain account and funding records, comply with legal and regulatory obligations, support lender or investor review, document authorizations, resolve disputes, enforce agreements, prevent fraud, and maintain audit trails. Retention periods may vary by record type, lender requirement, law, and business need.",
      ],
    },
    {
      heading: "12. User Choices and Rights",
      paragraphs: [
        "Access or correction requests may be sent to support@qualifiedcommercial.com.",
        "Users may request deletion of certain account information, subject to legal, security, transactional, funding, audit, lender, regulatory, and record-retention requirements.",
        "Users may opt out of marketing emails through unsubscribe links where provided.",
        "Users may opt out of nonessential SMS messages by replying STOP where supported.",
        "Users may control mobile push notifications through device or app settings.",
        "Users may manage cookies and retargeting through browser/device settings and ad platform preference tools.",
        "Withdrawal of consent may prevent us from continuing a funding file, communicating about documents, submitting a package to lenders, or providing certain platform features.",
      ],
    },
    {
      heading: "13. Children",
      paragraphs: [
        "The platform is intended for business, real estate, funding, and professional use by adults. It is not directed to children under 13, and we do not knowingly collect personal information from children under 13.",
      ],
    },
    {
      heading: "14. Changes to This Policy",
      paragraphs: [
        "We may update this policy from time to time. The version and effective date above identify the current policy. Continued use of the platform after an update means the user accepts the updated policy, except where additional notice or consent is required by law.",
      ],
    },
    {
      heading: "15. Contact",
      paragraphs: [
        "Questions, requests, opt-out instructions, or privacy concerns may be sent to Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, email: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Terms and Conditions — v1.0 (Effective 2026-05-19)
// ---------------------------------------------------------------------------

export const TERMS_AND_CONDITIONS: LegalDocument = {
  title: "Terms and Conditions",
  effectiveDate: "May 19, 2026",
  preamble:
    "Qualified Commercial LLC — formed in New Jersey. Mailing address: 14 53rd St #408N, Brooklyn, NY 11232. Contact: support@qualifiedcommercial.com. Version 1.0, approved by Jonathan Franco, Executive Partner. These Terms contain limitations of liability, user responsibility requirements, electronic communication consent, AI limitations, payment authorization terms, service availability limits, arbitration, and class action waiver provisions. Please read them carefully before using the platform.",
  sections: [
    {
      heading: "1. Acceptance of Terms",
      paragraphs: [
        "These Terms and Conditions are a binding agreement between the user and Qualified Commercial LLC. By creating an account, accessing the platform, using the mobile application, inviting a client, uploading a document, delegating tasks to AI, signing electronically, authorizing communications, submitting a funding file, or otherwise using QualifiedCommercial, the user agrees to these Terms.",
        "If a user acts on behalf of a company, borrower, client, guarantor, realtor, broker, agent, or other organization, the user represents that they have authority to bind that person or organization and to provide information, consents, documents, and instructions through the platform.",
      ],
    },
    {
      heading: "2. Description of Services",
      paragraphs: [
        "QualifiedCommercial provides a technology platform for commercial and real estate funding workflows. The platform may include client intake, document collection, AI-assisted file review, internal file audit, task management, realtor/broker/agent pipeline tools, mobile notifications, e-signature workflows, payment authorization workflows, communication tools, lender package preparation, and submission of validated packages to selected third-party lending companies or funding partners.",
        "Unless a separate written agreement states otherwise, Qualified Commercial LLC is not the lender, loan servicer, credit bureau, consumer reporting agency, appraiser, title company, settlement agent, insurance provider, tax advisor, attorney, CPA, or post-closing loan servicing customer support provider.",
      ],
    },
    {
      heading: "3. Eligibility and Account Responsibility",
      paragraphs: [
        "Users must provide accurate, current, and complete information.",
        "Users must maintain the confidentiality of login credentials, devices, email accounts, and phone numbers used for verification.",
        "Users must promptly update account information and funding file information if it changes.",
        "Users may not impersonate another person, upload unauthorized information, misuse the platform, interfere with security, or attempt to access files without permission.",
        "Users are responsible for activity under their accounts, including activity by employees, assistants, team members, contractors, or authorized representatives.",
      ],
    },
    {
      heading: "4. Funding Files, Lender Packages, and No Guarantee of Approval",
      paragraphs: [
        "Funding projections, estimated loan terms, AI-generated observations, internal underwriting scenarios, payment estimates, rate assumptions, leverage estimates, HUD estimates, DSCR/LTV/LTC calculations, and similar outputs are preliminary and informational. They are not final approvals, commitments to lend, rate locks, binding term sheets, appraisals, valuations, legal opinions, tax advice, or guarantees of closing.",
        "Final approval, pricing, conditions, credit decisions, documentation requirements, valuation treatment, rate locks, exceptions, funding, and servicing are controlled by the applicable lender, lending company, funding partner, servicer, investor, or third-party provider. Loan projections and internal terms may not close as projected due to market changes, credit changes, collateral issues, rate changes, lender overlays, property conditions, third-party delays, document delays, borrower delays, human delays to lock rates, or other factors.",
      ],
    },
    {
      heading: "5. AI Assistance and User Supervision",
      paragraphs: [
        "QualifiedCommercial may use AI-assisted systems to analyze information, identify missing documents, help prepare packages, draft communications, support underwriting review, summarize files, manage workflow, and assist realtors/brokers/agents. AI can make mistakes. AI may produce incomplete, inaccurate, outdated, inconsistent, or inappropriate results. Users must review AI output before relying on it, sending it, submitting it, or using it in a funding file.",
        "AI does not replace human review, lender underwriting, legal review, tax review, professional judgment, or user responsibility. Users remain responsible for verifying information, supervising delegated tasks, correcting errors, confirming consents, and determining whether a file is ready for lender submission.",
      ],
    },
    {
      heading: "6. Realtor, Broker, Agent, and Professional User Obligations",
      paragraphs: [
        "Realtors, brokers, agents, and other professional users are responsible for maintaining their client relationships, securing authority to upload client information, obtaining required consents, supervising the AI pipeline, reviewing delegated tasks, verifying communications, and ensuring that their use of the platform complies with real estate, lending, advertising, privacy, professional, and consumer protection obligations that apply to them.",
        "QualifiedCommercial will not sell realtor-uploaded leads or client contacts, and will not attempt to make business with those clients outside the relationship provided by the realtor, broker, or agent, except where the client independently contacts QualifiedCommercial, a separate authorization is provided, the relationship is no longer applicable, or law requires action. QualifiedCommercial may communicate with such clients as needed to operate the platform, complete tasks delegated by the professional user, obtain documents/signatures, process funding files, and submit authorized lender packages.",
      ],
    },
    {
      heading: "7. Communications Consent",
      paragraphs: [
        "By signing up, providing contact information, initiating or participating in a funding file, accepting an invitation, or using the platform, users consent to receive account-related and funding-file-related communications from QualifiedCommercial and its service providers by email, SMS/text message, phone, mobile push notification, in-app message, and similar channels. Communications may include document requests, missing information reminders, e-signature requests, file updates, AI workflow messages, account alerts, security messages, lender package notices, and service notices.",
        "SMS/text messages may be sent through Twilio or similar providers. Message frequency varies. Message and data rates may apply. Users may reply STOP to opt out where supported and HELP for help where supported. Opting out may affect the ability to receive time-sensitive file updates. Marketing/promotional messages may require separate consent where required by law.",
      ],
    },
    {
      heading: "8. Electronic Records and E-Signatures",
      paragraphs: [
        "Users consent to conduct transactions electronically, receive electronic records, sign documents electronically, and receive copies through the platform or email. Electronic signatures, checkbox acknowledgments, typed names, drawn signatures, click-to-sign actions, OTP confirmations, and similar actions may be treated as signatures, consents, authorizations, and records.",
        "The platform may capture signer name, email, phone, user ID, IP address, device/browser, timestamp, consent language, document version, signature method, audit trail, and final document hash. Users may request paper copies or withdraw electronic consent by contacting QualifiedCommercial, but withdrawal may delay or prevent continued platform use, signature completion, credit authorization, payment authorization, or lender package submission.",
      ],
    },
    {
      heading: "9. Credit Pulls, File Review, and Lender Sharing",
      paragraphs: [
        "Internal file review may include reviewing information supplied by the user, realtor, broker, agent, borrower, guarantor, or authorized representative. Internal file review is not necessarily a hard credit inquiry. A hard credit pull requires a separate authorization. When a user authorizes a hard credit pull, the user authorizes QualifiedCommercial, its credit/reporting provider, and selected lending parties to obtain consumer reports, credit reports, and related credit information for funding review, underwriting, processing, placement, servicing, or related permissible purposes. A hard credit inquiry may appear on a credit report and may affect a credit score.",
        "When a funding file is validated and ready for real underwriting, QualifiedCommercial may submit the lending package, documents, and related information to selected third-party lenders, lending companies, funding partners, processors, underwriters, credit/reporting vendors, and service providers as authorized or necessary for the funding workflow.",
      ],
    },
    {
      heading: "10. Payment and Credit Card Authorization",
      paragraphs: [
        "If a user provides payment information or signs a credit card authorization, the user authorizes QualifiedCommercial or its payment processor to charge the authorized payment method for the amounts, purposes, timing, and terms disclosed in the applicable authorization or platform screen. Payment card data should be processed using tokenized or hosted payment methods where possible. QualifiedCommercial does not intentionally store CVV/CVC codes and should not store full raw card numbers in platform databases or signed PDFs.",
        "Users are responsible for ensuring that payment information is accurate and that they are authorized to use the payment method. Fees, refunds, reversals, chargebacks, and cancellations are governed by the applicable payment authorization, platform terms, and any separate written agreement.",
      ],
    },
    {
      heading: "11. Privacy, Data Protection, and Advertising",
      paragraphs: [
        "Use of the platform is subject to the Privacy Policy and Financial Privacy Notice. QualifiedCommercial does not sell borrower information or realtor-uploaded lead information for money. QualifiedCommercial may use service providers such as AWS, Twilio, email providers, payment processors, e-signature/document tools, Meta/Facebook, Google Ads, analytics providers, and similar vendors to operate, secure, communicate, advertise, retarget, measure, and improve the platform.",
        "Retargeting ads may appear in a user's social media feed, search results, display placements, or other digital channels. Some privacy laws may treat certain retargeting or analytics activities as sharing or targeted advertising even when no information is sold for money. Users can review opt-out choices in the Privacy Policy.",
      ],
    },
    {
      heading: "12. Service Availability and Third-Party Systems",
      paragraphs: [
        "The platform may rely on AWS, internet service providers, mobile carriers, SMS providers, email providers, payment processors, app stores, AI providers, credit/reporting providers, lenders, and other third parties. QualifiedCommercial does not guarantee uninterrupted, error-free, secure, or real-time availability. The platform may experience downtime, delays, outages, message failures, data sync issues, degraded performance, or loss of access due to maintenance, vendor outage, AWS outage, cyber event, carrier issue, internet failure, software defect, or circumstances beyond QualifiedCommercial's control.",
      ],
    },
    {
      heading: "13. Prohibited Uses",
      paragraphs: [
        "Submitting false, misleading, unauthorized, incomplete, or fraudulent information.",
        "Uploading client, borrower, guarantor, or lead information without proper authority or consent.",
        "Using the platform to make unlawful credit, lending, housing, advertising, or discriminatory decisions.",
        "Bypassing security, scraping data, reverse engineering, disrupting operations, or attempting unauthorized access.",
        "Using AI output without appropriate human review where the result affects a client, borrower, funding file, lender package, payment, or legal/compliance obligation.",
        "Sending spam, unlawful texts, unlawful calls, deceptive communications, or messages without required consent.",
      ],
    },
    {
      heading: "14. Intellectual Property",
      paragraphs: [
        "QualifiedCommercial, its software, workflow design, AI pipeline features, templates, interfaces, text, graphics, branding, logos, and platform materials are owned by Qualified Commercial LLC or its licensors. Users receive a limited, revocable, nonexclusive, nontransferable right to use the platform for authorized purposes only.",
      ],
    },
    {
      heading: "15. Disclaimers",
      paragraphs: [
        'The platform is provided on an "as is" and "as available" basis. To the maximum extent permitted by law, QualifiedCommercial disclaims warranties of merchantability, fitness for a particular purpose, title, non-infringement, uninterrupted access, error-free operation, accuracy of AI output, funding approval, rate availability, lender acceptance, closing, profitability, valuation accuracy, or post-closing servicing support.',
      ],
    },
    {
      heading: "16. Limitation of Liability",
      paragraphs: [
        "To the maximum extent permitted by law, QualifiedCommercial will not be liable for indirect, incidental, special, consequential, exemplary, punitive, lost profit, lost revenue, lost opportunity, loss of goodwill, data loss, business interruption, financing denial, loan delay, rate change, servicing issue, third-party lender decision, AI error, messaging delay, or outage damages. QualifiedCommercial's total liability for any claim will not exceed the amount paid by the user to QualifiedCommercial for the service giving rise to the claim during the three months before the event, or one hundred dollars if no amount was paid, unless a different limit is required by law.",
      ],
    },
    {
      heading: "17. Indemnification",
      paragraphs: [
        "Users agree to defend, indemnify, and hold harmless QualifiedCommercial, its owners, officers, employees, contractors, service providers, and affiliates from claims, losses, liabilities, damages, costs, and expenses arising from user content, unauthorized uploads, inaccurate information, misuse of the platform, violation of these Terms, violation of law, client disputes, consent failures, professional obligations, payment disputes, or reliance on AI output without proper review.",
      ],
    },
    {
      heading: "18. Governing Law, Arbitration, and Class Action Waiver",
      paragraphs: [
        "These Terms are governed by the laws of New Jersey, without regard to conflict-of-law rules. Before filing a claim, the parties agree to attempt informal resolution by written notice sent to support@qualifiedcommercial.com or the mailing address listed above.",
        "Except for small claims, intellectual property, injunctive relief, or claims that cannot legally be arbitrated, disputes will be resolved by binding individual arbitration administered by the American Arbitration Association or a comparable arbitration provider selected by QualifiedCommercial if AAA is unavailable. Arbitration will occur on an individual basis only. Class actions, class arbitrations, representative actions, private attorney general actions, and jury trials are waived to the maximum extent permitted by law.",
      ],
    },
    {
      heading: "19. Termination",
      paragraphs: [
        "QualifiedCommercial may suspend or terminate access, remove content, disable features, or refuse service if a user violates these Terms, creates risk, fails to pay authorized fees, misuses communications, uploads unauthorized information, threatens platform integrity, or if continued service is not commercially, legally, or operationally appropriate. Termination does not eliminate payment obligations, record retention, audit rights, disclaimers, limitations, arbitration provisions, indemnity, or obligations that by nature should survive.",
      ],
    },
    {
      heading: "20. Contact",
      paragraphs: [
        "Questions about these Terms may be sent to Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, email: support@qualifiedcommercial.com.",
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Funding, AI, Communications, and Platform Disclosure — v1.0 (2026-05-19)
// ---------------------------------------------------------------------------

export const FUNDING_AI_DISCLOSURE: LegalDocument = {
  title: "Funding, AI, Communications, and Platform Disclosure",
  effectiveDate: "May 19, 2026",
  preamble:
    "Qualified Commercial LLC — formed in New Jersey. Mailing address: 14 53rd St #408N, Brooklyn, NY 11232. Contact: support@qualifiedcommercial.com. Version 1.0, approved by Jonathan Franco, Executive Partner. This disclosure explains important limitations and consents related to funding projections, AI underwriting support, internal file audits, lender package submission, communications, e-signatures, payment authorization, advertising, data security, downtime, and post-closing servicing.",
  sections: [
    {
      heading: "1. QualifiedCommercial Is a Technology and Funding Workflow Platform",
      paragraphs: [
        "QualifiedCommercial helps users collect information, organize documents, prepare funding files, obtain authorizations, manage communications, and submit validated packages to selected third-party lending companies or funding partners. Unless a separate written agreement says otherwise, Qualified Commercial LLC does not itself provide the final loan, service the loan after closing, guarantee approval, guarantee closing, guarantee rate locks, or act as post-closing customer support for the lender or servicer.",
      ],
    },
    {
      heading: "2. AI Underwriter and AI Pipeline Disclosure",
      paragraphs: [
        "QualifiedCommercial uses AI-assisted underwriting and workflow tools. The AI may review uploaded documents, identify missing items, summarize files, generate internal observations, estimate scenarios, assist with communications, and help realtors/brokers/agents manage delegated pipeline tasks. AI can make mistakes. AI may produce inaccurate, incomplete, delayed, inconsistent, outdated, or unsupported results.",
        "AI-generated outputs are not final underwriting decisions, final lender decisions, legal advice, tax advice, appraisals, valuations, credit approvals, commitments to lend, rate locks, or guarantees. Human users, professional users, and lenders must review and validate information before using it for real underwriting, communications, payment authorization, signature requests, lender submission, or business decisions.",
      ],
    },
    {
      heading: "3. Internal File Audit and Hard Credit Pull Distinction",
      paragraphs: [
        "QualifiedCommercial may conduct an internal file audit using information supplied by the user, realtor, broker, agent, borrower, guarantor, or authorized representative. This internal audit may evaluate document completeness, funding fit, property information, financial information, user-supplied credit-related information, and potential lender-package readiness. An internal audit alone does not necessarily create a hard credit inquiry.",
        "A hard credit pull requires a separate authorization. If a user authorizes a hard pull, the user authorizes QualifiedCommercial, its credit/reporting provider, selected lending partners, funding partners, processors, underwriters, and related service providers to obtain consumer reports, credit reports, and related credit information for a permissible funding, underwriting, processing, placement, servicing, or related purpose. A hard credit inquiry may appear on the user's credit report and may affect the user's credit score.",
      ],
    },
    {
      heading: "4. Lender Package Submission and Third-Party Underwriting",
      paragraphs: [
        "When a file is validated and ready for real underwriting, QualifiedCommercial may push or transmit the lending package, documents, data, and related information to selected third-party lending companies, funding partners, processors, underwriters, credit/reporting vendors, and service providers. No unrelated party receives the information for independent marketing or lead sale purposes. Information is shared for the funding workflow, underwriting, processing, servicing, compliance, security, or legally required purposes described in the Privacy Policy.",
        "The lending company, funding partner, investor, underwriter, or servicer may impose additional requirements, request additional documents, adjust terms, decline the file, modify conditions, or make final decisions independently. QualifiedCommercial does not control every lender requirement or post-submission result.",
      ],
    },
    {
      heading: "5. Loan Projections, Terms, and Market Risk",
      paragraphs: [
        "Not all loan projections, scenarios, estimated HUDs, payment amounts, internal underwriting terms, AI findings, prequalification indicators, or expected lender terms close as projected. Results may change because of market changes, rate changes, lender overlays, credit information, property valuation, appraisal results, title issues, insurance issues, borrower delay, document delay, human delay to lock rates, third-party processing time, lender conditions, servicing requirements, or other factors.",
        "Users should not rely on preliminary projections as a guarantee of profitability, affordability, approval, rate, funding amount, closing date, or final lender acceptance.",
      ],
    },
    {
      heading: "6. Realtor, Broker, and Agent Responsibility",
      paragraphs: [
        "Realtors, brokers, agents, and professional users are responsible for supervising the AI pipeline, reviewing delegated tasks, maintaining proper authority from their clients, obtaining client consents, verifying documents, checking communications before sending, and ensuring that their use of QualifiedCommercial complies with professional, advertising, real estate, lending, privacy, and consumer protection obligations.",
        "QualifiedCommercial will not sell realtor-uploaded leads or client contacts and will not attempt to make business with those clients outside the relationship provided by the realtor, broker, or agent, except where the client independently contacts QualifiedCommercial, a separate authorization is provided, the relationship is no longer applicable, or law requires action. QualifiedCommercial may communicate with those clients as needed to complete authorized file tasks, signatures, document requests, AI workflow messages, and lender package processing.",
      ],
    },
    {
      heading: "7. Communications Consent",
      paragraphs: [
        "By signing up, creating an account, accepting an invitation, providing a phone number, starting a file, participating in a file, or using the platform, the user consents to receive account-related and funding-file-related emails, SMS/text messages, phone calls, mobile push notifications, in-app messages, and similar communications from QualifiedCommercial and its service providers.",
        "Messages may relate to account access, identity verification, file updates, document requests, signature requests, missing items, payment authorization, AI workflow tasks, lender package status, reminders, security, service announcements, and support. SMS/text messages may be sent through Twilio or another provider. Message frequency varies. Message and data rates may apply. Reply STOP to opt out where supported and HELP for help where supported. Opting out may prevent timely file processing or reduce platform functionality.",
      ],
    },
    {
      heading: "8. Mobile Application and Push Notifications",
      paragraphs: [
        "The mobile application may send push notifications about account activity, file updates, AI tasks, missing documents, signature requests, lender submission status, security alerts, and service notices. Push notifications can be managed through device or app settings. Disabling push notifications may affect the user's ability to receive timely updates.",
      ],
    },
    {
      heading: "9. E-Signatures and Electronic Records",
      paragraphs: [
        "QualifiedCommercial may present authorizations, disclosures, consents, payment forms, credit pull authorizations, lender package authorizations, and other records electronically. By signing electronically or clicking to accept, the user agrees that electronic signatures, checkboxes, typed names, drawn signatures, click-to-sign actions, OTP confirmations, and similar actions may be legally binding and may be used to document consent.",
        "The platform may capture signer identity, email, phone, IP address, device/browser, timestamp, document version, consent text, audit trail, and final PDF or certificate. Users can request a paper copy or withdraw electronic consent by contacting QualifiedCommercial, but withdrawal may delay or prevent the completion of the file.",
      ],
    },
    {
      heading: "10. Payment and Credit Card Authorization",
      paragraphs: [
        "If a user authorizes a credit card or payment method, the user authorizes the charge or payment according to the amount, purpose, timing, and terms shown in the authorization screen or signed authorization. QualifiedCommercial should use tokenized or hosted payment processing where possible. QualifiedCommercial does not intentionally store CVV/CVC codes and should not store full raw card numbers in its database or signed PDFs. Payment records may show card brand, last four digits, expiration month/year, token/reference ID, authorized amount, purpose, timestamp, and audit record.",
      ],
    },
    {
      heading: "11. Privacy, Advertising, and Retargeting",
      paragraphs: [
        "QualifiedCommercial does not sell borrower information, realtor-uploaded leads, or client contact information for money. QualifiedCommercial may use Meta/Facebook, Google Ads, cookies, pixels, SDKs, and similar tools for analytics, retargeting, conversion measurement, and advertising. Retargeting ads may appear in the user's feed or other digital placements. Some laws may classify certain retargeting or analytics activity as targeted advertising or sharing, even when information is not sold for money. Users can review choices in the Privacy Policy.",
      ],
    },
    {
      heading: "12. Security, Encryption, and Downtime",
      paragraphs: [
        "QualifiedCommercial uses encryption and security controls designed to protect data. However, no system is perfectly secure. The platform may be unavailable, delayed, degraded, or interrupted due to AWS outages, third-party vendor outages, mobile carrier issues, internet failures, maintenance, security events, software defects, or other causes. QualifiedCommercial is not responsible for lender decisions, post-closing servicing support, or third-party outages outside its control.",
      ],
    },
    {
      heading: "13. No Post-Loan Servicing Support",
      paragraphs: [
        "After a loan closes or is transferred to a lending company, servicer, funding partner, or third party, post-closing servicing, payment processing, escrow questions, payoff statements, servicing disputes, modification requests, and lender customer support are handled by the lender, servicer, or applicable third party. QualifiedCommercial does not represent that it is the lender's customer support or servicing department unless a separate written servicing agreement expressly says so.",
      ],
    },
    {
      heading: "14. Contact",
      paragraphs: [
        "Questions about this disclosure may be sent to Qualified Commercial LLC, 14 53rd St #408N, Brooklyn, NY 11232, email: support@qualifiedcommercial.com.",
      ],
    },
  ],
};
