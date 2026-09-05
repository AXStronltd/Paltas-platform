/**
 * What each role is asked, and in what order.
 *
 * Lifted from the original PALTAS design (the ONBOARD block in the prototype),
 * so the questions here are the ones the product was designed around rather
 * than a smaller set invented to fit one screen. Developer, landlord and agent
 * are the prototype's own wording; hotel, seller and resident follow the same
 * shape for the three roles the platform added afterwards.
 *
 * This is a description, not a form. The page renders it and the server decides
 * what it will accept — a field appearing here grants nothing.
 */

import { COUNTRY_CURRENCY } from "@/lib/i18n/countries";

/**
 * ISO codes rather than a curated list, because the platform is global and a
 * "supported countries" dropdown is the thing that makes it not be. Labels are
 * rendered from `Intl.DisplayNames` in the reader's own language, so nothing
 * here needs translating.
 */
export const COUNTRY_CODES = Object.keys(COUNTRY_CURRENCY).sort();
export const CURRENCY_CODES = Array.from(new Set(Object.values(COUNTRY_CURRENCY))).sort();

export const ROLES = [
  // Label only. The key stays "developer": it is what every existing account
  // carries, what ROLE_FOR grants from and what ROLE_DASHBOARDS routes on, so
  // renaming it would be a data migration for a change of wording. The portal,
  // its unit-stock and buyer screens, and every permission are untouched.
  { key: "developer", label: "ob.role.developer", blurb: "ob.role.developerBlurb" },
  { key: "landlord", label: "Landlord", blurb: "Your units, tenants and rent" },
  { key: "agent", label: "Agent", blurb: "Listings and leads pipeline" },
  { key: "hotel", label: "Hotel", blurb: "Rooms, rates and availability" },
  { key: "seller", label: "Seller", blurb: "Sell a property you own" },
  { key: "resident", label: "Tenant / Resident", blurb: "Your home, rent and requests" },
] as const;

export type RoleKey = (typeof ROLES)[number]["key"];

export interface Field {
  k: string;
  l: string;
  ph?: string;
  type?: "text" | "email" | "tel" | "select" | "check" | "textarea" | "url" | "number" | "checks" | "toggle" | "country" | "countries" | "timezone";
  opts?: string[];
  text?: string;
  required?: boolean;
  /** Inline help under the field. The spec calls this microcopy. */
  hint?: string;
  /** Per-option explanation, rendered beside a `checks` group. */
  optHints?: Record<string, string>;
  /** Starting value where the spec gives one — toggles and preference selects. */
  def?: string;
  /** `number` only. */
  min?: number;
}

export interface Step {
  t: string;
  d: string;
  f: Field[];
  /**
   * Steps the spec marks skippable. The form offers a skip link and asks
   * nothing of the fields on the way past; Settings picks them up later.
   */
  skippable?: boolean;
  /** The skip link's wording, which the spec writes per step. */
  skipLabel?: string;
  /** Shown under the heading, above the fields. */
  note?: string;
}

/** Asked of everyone, because the profile and the approval queue both need it. */
const IDENTITY_STEP: Step = {
  t: "About you",
  d: "The person PALTAS will be dealing with",
  f: [
    { k: "name", l: "ob.f.fullName", ph: "e.g. Amina Otieno", required: true },
    { k: "phone", l: "ob.f.phone", ph: "+254 7•• ••• •••", type: "tel", required: true },
    { k: "country", l: "ob.f.country", ph: "KE", required: true },
  ],
};

const CONSENT = (text: string): Field => ({ k: "consent", l: "", type: "check", text, required: true });

/* ------------------------------------------------------------------ *
 * Business onboarding
 *
 * The second half of the form, from the "Onboarding — new account setup"
 * specification. It asks for the legal entity, how the portal will be used,
 * one real property, and alert preferences.
 *
 * Four of the specification's six steps are here. Step 1 (account) is already
 * built: email, password and the terms checkbox are the sign-up form, and the
 * identity step above collects the rest. Step 5 (invite your team) is not, and
 * cannot be — it needs a users table and an email sender that do not exist on
 * this side of the platform yet.
 *
 * Asked only of the roles that are businesses. A seller listing the house they
 * live in has no registered address or financial year end, and a resident has
 * neither; both would be filling in a company form to rent or sell one
 * property. Their flows are unchanged.
 *
 * "Don't ask twice" is enforced by construction rather than by care: each role
 * declares the keys its own step already collects, and those fields are
 * dropped from the business steps instead of being asked a second time under a
 * different heading.
 * ------------------------------------------------------------------ */

/** Businesses. Seller and resident are individuals and keep the short flow. */
const BUSINESS_ROLES: RoleKey[] = ["developer", "landlord", "agent", "hotel"];

const ENTITY_TYPES = ["Limited company", "Partnership", "Sole proprietor", "Trust", "Fund", "Other"];
const PORTFOLIO_SIZES = ["1–10 units", "11–50", "51–200", "201–1,000", "1,000+"];
const MANAGES = ["Residential lettings", "Sales", "Short-let / stays", "Commercial", "Development projects", "Facilities only"];
const REFERRAL = ["Referral", "Search", "Social", "Event", "Partner", "Other"];
const PROPERTY_KINDS = ["Residential", "Mixed use", "Commercial", "Short-let", "Land"];
const DATE_FORMATS = ["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const COMPANY_STEP: Step = {
  t: "Your company",
  d: "The legal entity that owns or manages the portfolio",
  note: "This becomes the first entity in your group structure, so it is worth getting right here.",
  f: [
    { k: "company", l: "ob.f.companyName", ph: "e.g. Golden Park Developments", required: true },
    { k: "trading", l: "ob.f.tradingName", ph: "If you trade under something else" },
    { k: "regCountry", l: "ob.f.countryOfRegistration", type: "country", required: true,
      hint: "Sets your default currency, date format and compliance calendar. You can operate in other countries too." },
    { k: "reg", l: "ob.f.companyRegNumber", ph: "Formats differ by country",
      hint: "Optional now. Needed before you can issue owner statements or investor reports." },
    { k: "tax", l: "ob.f.taxVatNumber", ph: "Free text" },
    { k: "entityType", l: "ob.f.entityType", type: "select", opts: ENTITY_TYPES, required: true },
    { k: "address", l: "ob.f.registeredAddress", type: "textarea", ph: "Street, city, postcode", required: true },
    { k: "website", l: "ob.f.companyWebsite", type: "url", ph: "https://" },
  ],
};

const USAGE_STEP: Step = {
  t: "How you'll use the portal",
  d: "So your dashboard isn't identical to everybody else's",
  f: [
    { k: "manages", l: "ob.f.whatDoYouManage", type: "checks", opts: MANAGES, required: true,
      hint: "We'll switch on the matching sections. Nothing is locked — you can turn the rest on any time." },
    { k: "portfolio", l: "ob.f.portfolioSize", type: "select", opts: PORTFOLIO_SIZES, required: true },
    { k: "operatingCountries", l: "ob.f.countriesOperated", type: "countries", required: true },
    { k: "currency", l: "ob.f.baseCurrency", type: "select", opts: CURRENCY_CODES, required: true,
      hint: "Everything rolls up to this. Individual properties can be held in their own currency." },
    { k: "heardVia", l: "ob.f.howHeard", type: "select", opts: REFERRAL },
  ],
};

const PROPERTY_STEP: Step = {
  t: "Add your first property",
  d: "One property is enough for occupancy, valuation and the portfolio map to show something real",
  skippable: true,
  skipLabel: "I'll add properties later",
  note: "Add one property now and your dashboard has real numbers from the first screen. You can bulk-import the rest from a spreadsheet afterwards.",
  f: [
    { k: "propName", l: "ob.f.propertyName", ph: "e.g. Kilimani Heights", required: true },
    { k: "propLocation", l: "ob.f.location", ph: "City or district", required: true },
    { k: "propCountry", l: "ob.f.country", type: "country", required: true },
    { k: "propKind", l: "ob.f.propertyType", type: "select", opts: PROPERTY_KINDS, required: true },
    { k: "propUnits", l: "ob.f.numberOfUnits", type: "number", min: 0, ph: "0" },
    { k: "propValue", l: "ob.f.currentValuation", type: "number", min: 0, ph: "In your base currency" },
  ],
};

const PREFERENCES_STEP: Step = {
  t: "Alerts and preferences",
  d: "The defaults are sensible, so this screen is genuinely optional",
  skippable: true,
  skipLabel: "Use the defaults",
  f: [
    { k: "timezone", l: "ob.f.timezone", type: "timezone" },
    { k: "dateFormat", l: "ob.f.dateFormat", type: "select", opts: DATE_FORMATS },
    { k: "fyEnd", l: "ob.f.financialYearEnd", type: "select", opts: MONTHS, def: "December" },
    { k: "alertCritical", l: "ob.f.criticalAlerts", type: "toggle", def: "on", hint: "Compliance breaches, blocked payments, safety incidents" },
    { k: "alertWarning", l: "ob.f.warnings", type: "toggle", def: "on", hint: "Expiries, budget thresholds, SLA risk, arrears" },
    { k: "alertInfo", l: "ob.f.informational", type: "toggle", def: "", hint: "Payments, bookings, signatures, task completions" },
    { k: "digestDaily", l: "ob.f.dailyDigest", type: "toggle", def: "on" },
    { k: "digestWeekly", l: "ob.f.weeklySummary", type: "toggle", def: "on" },
    { k: "quietHours", l: "ob.f.quietHours", type: "toggle", def: "on", hint: "Only critical alerts break through" },
  ],
};

/**
 * What each role's own step already collects, so the business steps can stop
 * asking for it. The role's wording wins where the two overlap: a hotel's step
 * says "Hotel name", which is a better prompt than "Company name" for someone
 * who runs one.
 */
const ALREADY_ASKED: Partial<Record<RoleKey, string[]>> = {
  developer: ["company", "reg"],
  hotel: ["company", "reg"],
  agent: ["trading"],
  landlord: ["portfolio"],
};

const withoutKeys = (step: Step, drop: string[]): Step =>
  drop.length === 0 ? step : { ...step, f: step.f.filter((field) => !drop.includes(field.k)) };

/** The business half of the form, tailored to one role. */
function businessSteps(role: RoleKey): Step[] {
  if (!BUSINESS_ROLES.includes(role)) return [];
  const drop = ALREADY_ASKED[role] ?? [];
  return [COMPANY_STEP, USAGE_STEP, PROPERTY_STEP, PREFERENCES_STEP].map((step) => withoutKeys(step, drop));
}

/** Keys the business steps own, so the server knows what it is allowed to store. */
export const BUSINESS_KEYS: string[] = Array.from(
  new Set([COMPANY_STEP, USAGE_STEP, PROPERTY_STEP, PREFERENCES_STEP].flatMap((s) => s.f.map((f) => f.k))),
);

/** The keys that describe the first property, which is stored, not created. */
export const PROPERTY_KEYS = PROPERTY_STEP.f.map((f) => f.k);

const ROLE_STEPS: Record<RoleKey, Step[]> = {
  developer: [
    IDENTITY_STEP,
    {
      t: "Your development company",
      d: "Tell us about your business",
      f: [
        { k: "company", l: "ob.f.companyDeveloper", ph: "e.g. Golden Park Developments", required: true },
        { k: "reg", l: "ob.f.companyRegNo", ph: "Registration / incorporation number", required: true },
        { k: "operatingCountry", l: "ob.f.countryOfOperation", ph: "e.g. Kenya" },
        { k: "projects", l: "ob.f.activeProjects", type: "select", opts: ["1–2", "3–5", "6–10", "10+"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to list projects and receive payments",
      f: [
        { k: "idtype", l: "ob.f.idDocumentType", type: "select", opts: ["National ID", "Passport", "Director ID"] },
        { k: "idnum", l: "ob.f.documentNumber", ph: "Document number", required: true },
        { k: "kra", l: "ob.f.taxVatNumber", ph: "For payout compliance" },
        CONSENT("I confirm the above is accurate and agree to PALTAS verification checks."),
      ],
    },
  ],
  landlord: [
    IDENTITY_STEP,
    {
      t: "Your properties",
      d: "Tell us what you manage",
      f: [
        { k: "units", l: "ob.f.numberOfUnitsProperties", type: "select", opts: ["1", "2–5", "6–15", "16–50", "50+"] },
        { k: "location", l: "ob.f.mainLocation", ph: "e.g. Nairobi, Kenya", required: true },
        { k: "type", l: "ob.f.propertyType", type: "select", opts: ["Apartments", "Houses", "Commercial", "Mixed"] },
        { k: "payout", l: "ob.f.rentPayoutMethod", type: "select", opts: ["M-Pesa", "Bank transfer", "PALTAS Wallet"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to collect rent securely",
      f: [
        { k: "idtype", l: "ob.f.idDocumentType", type: "select", opts: ["National ID", "Passport"] },
        { k: "idnum", l: "ob.f.documentNumber", ph: "Document number", required: true },
        { k: "ownership", l: "ob.f.proofOfOwnership", type: "select", opts: ["Title deed", "Lease agreement", "Management contract"] },
        CONSENT("I confirm I am authorised to manage these properties."),
      ],
    },
  ],
  agent: [
    IDENTITY_STEP,
    {
      t: "Your agency",
      d: "Tell us about your work",
      f: [
        { k: "agency", l: 'Agency name (or "Independent")', ph: "e.g. Prime Realty", required: true },
        { k: "license", l: "ob.f.agentLicence", ph: "Licence number", required: true },
        { k: "area", l: "ob.f.areasCovered", ph: "e.g. Nairobi, Mombasa" },
        { k: "listings", l: "ob.f.activeListings", type: "select", opts: ["1–5", "6–20", "21–50", "50+"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to list and host viewings",
      f: [
        { k: "idtype", l: "ob.f.idDocumentType", type: "select", opts: ["National ID", "Passport"] },
        { k: "idnum", l: "ob.f.documentNumber", ph: "Document number", required: true },
        CONSENT("I confirm my licence details are valid and accurate."),
      ],
    },
  ],
  hotel: [
    IDENTITY_STEP,
    {
      t: "Your property",
      d: "Tell us about the hotel you run",
      f: [
        { k: "company", l: "ob.f.hotelName", ph: "e.g. Oceanview Suites", required: true },
        { k: "reg", l: "ob.f.businessRegNo", ph: "Registration number" },
        { k: "location", l: "ob.f.location", ph: "e.g. Diani, Kenya", required: true },
        { k: "rooms", l: "ob.f.roomTypes", type: "select", opts: ["1–5", "6–20", "21–50", "50+"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to take bookings and receive payouts",
      f: [
        { k: "idtype", l: "ob.f.idDocumentType", type: "select", opts: ["National ID", "Passport", "Director ID"] },
        { k: "idnum", l: "ob.f.documentNumber", ph: "Document number", required: true },
        { k: "kra", l: "ob.f.taxVatNumber", ph: "For payout compliance" },
        CONSENT("I confirm the above is accurate and agree to PALTAS verification checks."),
      ],
    },
  ],
  seller: [
    IDENTITY_STEP,
    {
      t: "What you are selling",
      d: "Tell buyers about your property",
      f: [
        { k: "propertyType", l: "ob.f.propertyType", type: "select", opts: ["Apartment", "House", "Land", "Commercial"] },
        { k: "location", l: "ob.f.whereIsProperty", ph: "e.g. Kilimani, Nairobi", required: true },
        { k: "price", l: "ob.f.askingPrice", ph: "e.g. 12,500,000 KES" },
        { k: "ownership", l: "ob.f.proofOfOwnership", type: "select", opts: ["Title deed", "Sale agreement", "Allotment letter"] },
      ],
    },
    {
      t: "Verification",
      d: "Required before a listing goes live",
      f: [
        { k: "idtype", l: "ob.f.idDocumentType", type: "select", opts: ["National ID", "Passport"] },
        { k: "idnum", l: "ob.f.documentNumber", ph: "Document number", required: true },
        CONSENT("I confirm I am the owner, or authorised to sell this property."),
      ],
    },
  ],
  resident: [
    IDENTITY_STEP,
    {
      t: "Your home",
      d: "Where you live, so we can connect you to it",
      f: [
        { k: "location", l: "ob.f.propertyAndUnit", ph: "e.g. Kilimani Heights, Unit 4B", required: true },
        { k: "moveIn", l: "ob.f.moveInDate", ph: "e.g. March 2026" },
        { k: "landlord", l: "ob.f.landlordOrAgent", ph: "Who you pay rent to" },
      ],
    },
    {
      t: "Confirm",
      d: "No documents are required to live somewhere",
      f: [CONSENT("I confirm the details above are accurate.")],
    },
  ],
};

/**
 * The whole form, per role: identity, the role's own questions, the business
 * half where it applies, and verification.
 *
 * Verification stays last. It ends in the attestation the approver relies on
 * and the document uploads, and neither should be followed by questions about
 * date formats — a person who has just signed a declaration is finished.
 */
export const ONBOARDING: Record<RoleKey, Step[]> = Object.fromEntries(
  (Object.keys(ROLE_STEPS) as RoleKey[]).map((role) => {
    const own = ROLE_STEPS[role];
    const verification = own[own.length - 1];
    return [role, [...own.slice(0, -1), ...businessSteps(role), verification]];
  }),
) as Record<RoleKey, Step[]>;

/** Which documents the approval queue will insist on, per role. */
export function requiredDocuments(role: RoleKey): ("IDENTITY" | "OWNERSHIP")[] {
  if (role === "resident") return [];
  return role === "landlord" ? ["IDENTITY", "OWNERSHIP"] : ["IDENTITY"];
}
