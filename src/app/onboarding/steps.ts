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

export const ROLES = [
  { key: "developer", label: "Developer", blurb: "Projects, units, leads and payments" },
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
  type?: "text" | "email" | "tel" | "select" | "check";
  opts?: string[];
  text?: string;
  required?: boolean;
}

export interface Step {
  t: string;
  d: string;
  f: Field[];
}

/** Asked of everyone, because the profile and the approval queue both need it. */
const IDENTITY_STEP: Step = {
  t: "About you",
  d: "The person PALTAS will be dealing with",
  f: [
    { k: "name", l: "Full name", ph: "e.g. Amina Otieno", required: true },
    { k: "phone", l: "Phone", ph: "+254 7•• ••• •••", type: "tel", required: true },
    { k: "country", l: "Country", ph: "KE", required: true },
  ],
};

const CONSENT = (text: string): Field => ({ k: "consent", l: "", type: "check", text, required: true });

export const ONBOARDING: Record<RoleKey, Step[]> = {
  developer: [
    IDENTITY_STEP,
    {
      t: "Your development company",
      d: "Tell us about your business",
      f: [
        { k: "company", l: "Company / developer name", ph: "e.g. Golden Park Developments", required: true },
        { k: "reg", l: "Company registration no.", ph: "Registration / incorporation number", required: true },
        { k: "operatingCountry", l: "Country of operation", ph: "e.g. Kenya" },
        { k: "projects", l: "Active projects", type: "select", opts: ["1–2", "3–5", "6–10", "10+"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to list projects and receive payments",
      f: [
        { k: "idtype", l: "ID document type", type: "select", opts: ["National ID", "Passport", "Director ID"] },
        { k: "idnum", l: "Document number", ph: "Document number", required: true },
        { k: "kra", l: "Tax / VAT number", ph: "For payout compliance" },
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
        { k: "units", l: "Number of units / properties", type: "select", opts: ["1", "2–5", "6–15", "16–50", "50+"] },
        { k: "location", l: "Main location", ph: "e.g. Nairobi, Kenya", required: true },
        { k: "type", l: "Property type", type: "select", opts: ["Apartments", "Houses", "Commercial", "Mixed"] },
        { k: "payout", l: "Rent payout method", type: "select", opts: ["M-Pesa", "Bank transfer", "PALTAS Wallet"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to collect rent securely",
      f: [
        { k: "idtype", l: "ID document type", type: "select", opts: ["National ID", "Passport"] },
        { k: "idnum", l: "Document number", ph: "Document number", required: true },
        { k: "ownership", l: "Proof of ownership", type: "select", opts: ["Title deed", "Lease agreement", "Management contract"] },
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
        { k: "license", l: "Agent licence / reg. no.", ph: "Licence number", required: true },
        { k: "area", l: "Areas you cover", ph: "e.g. Nairobi, Mombasa" },
        { k: "listings", l: "Active listings", type: "select", opts: ["1–5", "6–20", "21–50", "50+"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to list and host viewings",
      f: [
        { k: "idtype", l: "ID document type", type: "select", opts: ["National ID", "Passport"] },
        { k: "idnum", l: "Document number", ph: "Document number", required: true },
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
        { k: "company", l: "Hotel name", ph: "e.g. Oceanview Suites", required: true },
        { k: "reg", l: "Business registration no.", ph: "Registration number" },
        { k: "location", l: "Location", ph: "e.g. Diani, Kenya", required: true },
        { k: "rooms", l: "Room types", type: "select", opts: ["1–5", "6–20", "21–50", "50+"] },
      ],
    },
    {
      t: "Verification",
      d: "Required to take bookings and receive payouts",
      f: [
        { k: "idtype", l: "ID document type", type: "select", opts: ["National ID", "Passport", "Director ID"] },
        { k: "idnum", l: "Document number", ph: "Document number", required: true },
        { k: "kra", l: "Tax / VAT number", ph: "For payout compliance" },
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
        { k: "propertyType", l: "Property type", type: "select", opts: ["Apartment", "House", "Land", "Commercial"] },
        { k: "location", l: "Where is your property?", ph: "e.g. Kilimani, Nairobi", required: true },
        { k: "price", l: "Asking price", ph: "e.g. 12,500,000 KES" },
        { k: "ownership", l: "Proof of ownership", type: "select", opts: ["Title deed", "Sale agreement", "Allotment letter"] },
      ],
    },
    {
      t: "Verification",
      d: "Required before a listing goes live",
      f: [
        { k: "idtype", l: "ID document type", type: "select", opts: ["National ID", "Passport"] },
        { k: "idnum", l: "Document number", ph: "Document number", required: true },
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
        { k: "location", l: "Property and unit", ph: "e.g. Kilimani Heights, Unit 4B", required: true },
        { k: "moveIn", l: "Move-in date", ph: "e.g. March 2026" },
        { k: "landlord", l: "Landlord or agent", ph: "Who you pay rent to" },
      ],
    },
    {
      t: "Confirm",
      d: "No documents are required to live somewhere",
      f: [CONSENT("I confirm the details above are accurate.")],
    },
  ],
};

/** Which documents the approval queue will insist on, per role. */
export function requiredDocuments(role: RoleKey): ("IDENTITY" | "OWNERSHIP")[] {
  if (role === "resident") return [];
  return role === "landlord" ? ["IDENTITY", "OWNERSHIP"] : ["IDENTITY"];
}
