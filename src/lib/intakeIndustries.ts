// Main Street taxonomy — the industries and intents an operating business is
// classified by.
//
// CROSS-REPO CONTRACT. These slugs must stay identical to
// `MAIN_STREET_INDUSTRIES` / `MAIN_STREET_INTENTS` in
// qcbackend app/services/main_street_programs.py, and to
// `VERTICALS[].industries[].slug` in QCWeb/src/lib/programs.ts. Nothing enforces
// the match at build time — an unrecognized slug normalizes server-side to
// `other` / `not_sure` rather than being rejected, so drift here degrades
// silently into mis-screened files rather than into an error anyone would see.
//
// This file is named by the contract comment in main_street_programs.py, which
// pointed at a path that had never been created. QCWeb and QCRep both carried
// their own copies of the list; QCDashboard did not, which is a large part of
// why the admin lead form could not create an operating-business lead at all.

export const MAIN_STREET_INDUSTRIES = [
  { slug: "restaurant_food_service", label: "Restaurants and food service" },
  { slug: "auto_service", label: "Mechanic and auto service shops" },
  { slug: "grocery_commodities", label: "Grocery, produce and commodities" },
  { slug: "trucking_logistics", label: "Trucking, freight and logistics" },
  { slug: "manufacturing", label: "Manufacturing and fabrication" },
  { slug: "retail_ecommerce", label: "Retail and e-commerce" },
  { slug: "construction_trades", label: "Construction and trades" },
  { slug: "professional_practice", label: "Professional and medical practices" },
  { slug: "other", label: "Other operating business" },
] as const;

export type MainStreetIndustry = (typeof MAIN_STREET_INDUSTRIES)[number]["slug"];

/**
 * What brought the business here.
 *
 * Intent is not a nice-to-have on this form: it decides which documents get
 * seeded on the file. `business_systems` deliberately seeds none — someone
 * asking about point-of-sale software is having a qualification conversation,
 * and opening it by demanding two years of tax returns is both wrong and a good
 * way to lose them.
 *
 * The two `route_out` intents are omitted here on purpose. A property or
 * dealership enquiry belongs in the real-estate or dealer funnel, and this form
 * can already create those leads directly.
 */
export const MAIN_STREET_INTENTS = [
  { slug: "working_capital", label: "Working capital or a business loan" },
  { slug: "equipment", label: "Financing equipment or a vehicle" },
  { slug: "refinance_debt", label: "Refinancing existing debt or advances" },
  { slug: "merchant_services", label: "Lower card processing rates" },
  { slug: "business_systems", label: "Point-of-sale or business systems" },
  { slug: "not_sure", label: "Not sure yet — help them figure it out" },
] as const;

export type MainStreetIntent = (typeof MAIN_STREET_INTENTS)[number]["slug"];

/** Intents that open a lending file. The rest are qualification conversations. */
export const LENDING_INTENTS: ReadonlySet<string> = new Set([
  "working_capital",
  "equipment",
  "refinance_debt",
  "not_sure",
]);
