import { api } from "./managementApi";
import type {
  AuditEntry, EffectivePermission, OwnerDashboard, PropertyRow,
  ResidentRow, RoleDefinition, ScopeTypeValue, StaffRow, UnitRow,
} from "@/lib/models/security";

/**
 * Portfolio, staff and audit — the management half of the portal.
 *
 * Note what several of these return alongside the data: `rentVisible`,
 * `contactVisible`, `sections`. The API tells the client which fields it chose
 * to withhold, so the UI can say "you don't have access to rent" instead of
 * quietly rendering a dash that reads as "no rent set".
 */

const qs = (params: Record<string, string | number | boolean | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
};

/* ------------------------------- Portfolio ------------------------------ */

export const getProperties = () => api.get<{ properties: PropertyRow[] }>("/properties");

export const getProperty = (id: string) =>
  api.get<{
    property: {
      id: string; name: string; address: string | null; city: string | null;
      country: string; kind: string;
      totals: { units: number; residents: number; gates: number; guards: number };
      buildings: { id: string; name: string; floors: number; units: number }[];
    };
  }>(`/properties/${id}`);

export const createProperty = (input: { name: string; address?: string; city?: string; country?: string; kind?: string }) =>
  api.post<{ property: PropertyRow }>("/properties", input);

export const deleteProperty = (id: string) => api.del<{ deleted: boolean }>(`/properties/${id}`);

export const getBuildings = (propertyId?: string | null) =>
  api.get<{ buildings: { id: string; propertyId: string; propertyName: string; name: string; floors: number; units: number }[] }>(
    `/buildings${qs({ propertyId })}`,
  );

export const getUnits = (params: { propertyId?: string | null; buildingId?: string; status?: string; q?: string } = {}) =>
  api.get<{ units: UnitRow[]; rentVisible: boolean }>(`/units${qs(params)}`);

/** The bottom of the drill-down, with each block present only if permitted. */
export const getUnitDetail = (id: string) =>
  api.get<{
    unit: UnitRow & { building: { id: string; name: string }; property: { id: string; name: string; city: string | null } };
    residents?: ResidentRow[];
    invitations?: { id: string; visitorName: string; visitorType: string; validFrom: string; validTo: string; status: string; passCode: string }[];
    visits?: { id: string; visitorName: string; visitorType: string; checkInAt: string; checkOutAt: string | null; status: string }[];
    cards?: { id: string; cardNumber: string; holderName: string; type: string; status: string }[];
    vehicles?: { id: string; plate: string; make: string | null; model: string | null; type: string }[];
    maintenance?: { id: string; title: string; priority: string; status: string; createdAt: string }[];
    payments?: { id: string; kind: string; amount: number; currency: string; dueDate: string; status: string }[];
    sections: Record<string, boolean>;
  }>(`/units/${id}`);

export const getResidents = (params: { unitId?: string; propertyId?: string | null; q?: string } = {}) =>
  api.get<{ residents: ResidentRow[]; contactVisible: boolean }>(`/residents${qs(params)}`);

export const addResident = (input: {
  unitId: string; fullName: string; email?: string; phone?: string;
  type?: string; isPrimary?: boolean; moveInAt?: string; leaseEnd?: string;
}) => api.post<{ resident: ResidentRow }>("/residents", input);

/* --------------------------------- Staff -------------------------------- */

export const getStaff = () => api.get<{ staff: StaffRow[] }>("/staff");

export const getRoles = () => api.get<{ roles: RoleDefinition[] }>("/roles");

export const createStaff = (input: {
  name: string; email: string; phone?: string; title?: string; temporaryPassword: string;
  roles?: { key: string; scopeType: ScopeTypeValue; scopeId: string }[];
  permissions?: { permission: string; effect?: "ALLOW" | "DENY"; scopeType: ScopeTypeValue; scopeId: string }[];
}) => api.post<{ staff: { id: string; name: string; email: string; status: string } }>("/staff", input);

export const updateStaff = (id: string, input: { name?: string; phone?: string; title?: string; status?: "ACTIVE" | "SUSPENDED" }) =>
  api.patch<{ staff: { id: string; name: string; status: string } }>(`/staff/${id}`, input);

export const deleteStaff = (id: string) => api.del<{ deleted: boolean }>(`/staff/${id}`);

/** What this person can actually do at this property, and why. */
export const getStaffPermissions = (id: string, propertyId?: string | null) =>
  api.get<{
    staffId: string; name: string; isOwner: boolean; propertyId: string | null;
    permissions: EffectivePermission[];
  }>(`/staff/${id}/permissions${qs({ propertyId })}`);

export const setStaffPermissions = (id: string, input: {
  roles?: { key: string; scopeType: ScopeTypeValue; scopeId: string }[];
  permissions?: { permission: string; effect?: "ALLOW" | "DENY"; scopeType: ScopeTypeValue; scopeId: string; note?: string }[];
}) => api.put<{ updated: boolean; roles: string[]; permissions: string[] }>(`/staff/${id}/permissions`, input);

/* --------------------------------- Owner -------------------------------- */

export const getOwnerDashboard = () => api.get<OwnerDashboard>("/owner/dashboard");

/* --------------------------------- Audit -------------------------------- */

export const getAuditTrail = (params: {
  propertyId?: string | null; actorId?: string; action?: string;
  entityType?: string; q?: string; from?: string; to?: string;
  limit?: number; cursor?: string;
} = {}) => api.get<{ entries: AuditEntry[]; nextCursor: string | null }>(`/audit${qs(params)}`);

/* ------------------------------- Auth ----------------------------------- */

export const signIn = (email: string, password: string) =>
  api.post<{ user: { id: string; name: string; email: string; isOwner: boolean }; roles: unknown[]; permissions: string[] }>(
    "/auth/login",
    { email, password },
  );

/* ------------------------ Maintenance & finance ------------------------- */

export const getMaintenance = (params: { status?: string; propertyId?: string | null; assignedToMe?: boolean } = {}) =>
  api.get<{
    requests: {
      id: string; propertyId: string; propertyName: string; unitName: string | null;
      title: string; description: string; priority: string; status: string;
      raisedByName: string | null; createdAt: string; resolvedAt: string | null;
    }[];
  }>(`/maintenance${qs(params)}`);

export const getPayments = (params: { status?: string; propertyId?: string | null } = {}) =>
  api.get<{
    payments: {
      id: string; propertyId: string; unitName: string | null; residentName: string | null;
      kind: string; amount: number; currency: string; dueDate: string;
      paidAt: string | null; status: string; reference: string | null;
    }[];
    totals: { paid: number; outstanding: number };
  }>(`/finance/payments${qs(params)}`);

export const getExpenses = (params: { propertyId?: string | null; from?: string } = {}) =>
  api.get<{
    expenses: { id: string; propertyId: string; propertyName: string; category: string; description: string | null; amount: number; currency: string; incurredAt: string }[];
    total: number;
  }>(`/finance/expenses${qs(params)}`);

/* --------------------------- Pricing & campaigns ------------------------ */

export interface DiscountRow {
  id: string;
  propertyId: string | null;
  propertyName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  campaignStatus: string | null;
  name: string;
  description: string | null;
  kind: string;
  valueType: string;
  value: number;
  currency: string;
  /** "12% off" / "KES 15,000 off" — formatted once, on the server. */
  label: string;
  code: string | null;
  minNights: number | null;
  minGuests: number | null;
  minUnits: number | null;
  minLeadDays: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: string;
  endsAt: string;
  active: boolean;
  /** Whether it would apply right now, not merely whether it exists. */
  live: boolean;
}

export interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  bannerText: string | null;
  status: "DRAFT" | "SCHEDULED" | "LIVE" | "PAUSED" | "ENDED";
  propertyId: string | null;
  propertyName: string | null;
  startsAt: string;
  endsAt: string;
  publishedAt: string | null;
  discounts: { id: string; name: string; kind: string; valueType: string; value: number; currency: string }[];
}

export const getDiscounts = (params: { propertyId?: string | null; kind?: string } = {}) =>
  api.get<{ discounts: DiscountRow[] }>(`/discounts${qs(params)}`);

export const createDiscount = (input: {
  propertyId?: string; campaignId?: string; name: string; description?: string;
  kind?: string; valueType?: string; value: number; code?: string;
  minNights?: number; minGuests?: number; minUnits?: number; minLeadDays?: number;
  maxRedemptions?: number; startsAt?: string; endsAt?: string;
}) => api.post<{ discount: DiscountRow }>("/discounts", input);

export const updateDiscount = (id: string, input: Partial<{ name: string; value: number; active: boolean; minGuests: number; minUnits: number; startsAt: string; endsAt: string }>) =>
  api.patch<{ discount: DiscountRow }>(`/discounts/${id}`, input);

export const deleteDiscount = (id: string) => api.del<{ deleted: boolean }>(`/discounts/${id}`);

export const getCampaigns = (status?: string) =>
  api.get<{ campaigns: CampaignRow[] }>(`/campaigns${qs({ status })}`);

export const createCampaign = (input: { propertyId?: string; name: string; description?: string; bannerText?: string; startsAt?: string; endsAt?: string }) =>
  api.post<{ campaign: CampaignRow }>("/campaigns", input);

export const updateCampaign = (id: string, input: Partial<{ name: string; description: string; bannerText: string; status: string; startsAt: string; endsAt: string }>) =>
  api.patch<{ campaign: CampaignRow }>(`/campaigns/${id}`, input);

/* --------------------------- Group bookings ----------------------------- */

export interface GroupMemberRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  shareAmount: number;
  shareStatus: "PENDING" | "PAID" | "REFUNDED";
  paidAt: string | null;
  isOrganiser: boolean;
}

export interface GroupRow {
  id: string;
  reference: string;
  name: string;
  purpose: "HAJJ" | "UMRAH" | "FAMILY" | "CORPORATE" | "LEISURE" | "OTHER";
  destination: string;
  organiserName: string;
  organiserEmail: string | null;
  organiserPhone: string | null;
  propertyId: string | null;
  propertyName: string | null;
  checkIn: string;
  checkOut: string;
  guests: number;
  unitsRequested: number;
  currency: string;
  totalAmount: number;
  discountName: string | null;
  discountAmount: number;
  payable: number;
  collected: number;
  outstanding: number;
  percentCollected: number;
  status: "DRAFT" | "COLLECTING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";
  confirmedAt: string | null;
  createdAt: string;
  members: GroupMemberRow[];
}

export const getGroups = (params: { status?: string; purpose?: string } = {}) =>
  api.get<{ groups: GroupRow[] }>(`/groups${qs(params)}`);

export const getGroup = (id: string) => api.get<{ group: GroupRow }>(`/groups/${id}`);

export const createGroup = (input: {
  propertyId?: string; name: string; purpose?: string; destination: string;
  organiserName: string; organiserEmail?: string; organiserPhone?: string;
  checkIn?: string; checkOut?: string; unitsRequested?: number; guests?: number;
  totalAmount: number; currency?: string;
  members?: { name: string; email?: string; phone?: string; shareAmount?: number }[];
}) => api.post<{ group: GroupRow }>("/groups", input);

export const addGroupMember = (id: string, input: { name: string; email?: string; phone?: string; shareAmount?: number }) =>
  api.post<{ group: GroupRow }>(`/groups/${id}/members`, input);

/** Record (or reverse) one traveller's share — the split-payment action. */
export const recordShare = (id: string, memberId: string, reference?: string, unpay = false) =>
  api.patch<{ group: GroupRow }>(`/groups/${id}/members`, { memberId, reference, unpay });

export const confirmGroup = (id: string) => api.post<{ group: GroupRow }>(`/groups/${id}/confirm`);

/* ------------------------- Financial management ------------------------- */

export interface FeeCategoryRow {
  id: string; code: string; name: string; description: string | null;
  kind: "INCOME" | "EXPENSE"; defaultAmount: number | null; currency: string;
  recurrence: "ONE_OFF" | "MONTHLY" | "QUARTERLY" | "ANNUAL";
  taxable: boolean; active: boolean;
  propertyId: string | null; propertyName: string | null; chargeCount: number;
}

export interface ChargeRow {
  id: string; reference: string; description: string | null;
  amount: number; currency: string; settled: number; balance: number;
  dueDate: string; periodLabel: string | null;
  status: "DRAFT" | "ISSUED" | "PART_PAID" | "PAID" | "WAIVED" | "OVERDUE";
  waivedReason: string | null;
  propertyId: string; unitId: string | null; unitName: string | null; residentName: string | null;
  category: { id: string; code: string; name: string; kind: string };
}

export const getFeeCategories = (params: { kind?: string; propertyId?: string | null } = {}) =>
  api.get<{ categories: FeeCategoryRow[] }>(`/finance/categories${qs(params)}`);

export const createFeeCategory = (input: {
  propertyId?: string; code?: string; name: string; description?: string;
  kind?: string; defaultAmount?: number; recurrence?: string; taxable?: boolean;
}) => api.post<{ category: FeeCategoryRow }>("/finance/categories", input);

export const getCharges = (params: { status?: string; unitId?: string; propertyId?: string | null; categoryId?: string } = {}) =>
  api.get<{ charges: ChargeRow[]; totals: { billed: number; settled: number; outstanding: number; waived: number } }>(
    `/finance/charges${qs(params)}`,
  );

export const raiseCharge = (input: {
  propertyId?: string; unitId?: string; residentId?: string; categoryId: string;
  amount?: number; dueDate?: string; description?: string; periodLabel?: string; allUnits?: boolean;
}) => api.post<{ created: number }>("/finance/charges", input);

export const settleCharge = (id: string, amount: number, reference?: string) =>
  api.patch<{ settled: number; outstanding: number }>(`/finance/charges/${id}`, { settle: { amount, reference } });

export const waiveCharge = (id: string, reason: string) =>
  api.patch<{ charge: ChargeRow }>(`/finance/charges/${id}`, { waive: true, reason });

/* --------------------------------- Payroll ------------------------------ */

export interface SalaryRow {
  id: string; userId: string; name: string; email: string; accountStatus: string;
  jobTitle: string | null; grossMonthly: number; currency: string;
  effectiveFrom: string; propertyId: string | null; propertyName: string | null; bankReference: string | null;
}

export interface PayslipRow {
  id: string; userId: string; staffName: string; jobTitle: string | null;
  gross: number; deductions: { label: string; amount: number }[];
  totalDeductions: number; net: number; bankReference: string | null;
}

export interface PayRunRow {
  id: string; periodLabel: string; periodStart: string; periodEnd: string;
  status: "DRAFT" | "APPROVED" | "PAID"; currency: string;
  totalGross: number; totalDeductions: number; totalNet: number;
  headcount: number; propertyName: string | null;
  approvedAt: string | null; paidAt: string | null; payslips: PayslipRow[];
}

export const getSalaries = () => api.get<{ salaries: SalaryRow[]; totalMonthly: number }>("/payroll/salaries");

export const setSalary = (input: { userId: string; propertyId?: string; jobTitle?: string; grossMonthly: number; bankReference?: string }) =>
  api.post<{ salary: SalaryRow }>("/payroll/salaries", input);

export const getPayRuns = (status?: string) => api.get<{ runs: PayRunRow[] }>(`/payroll/runs${qs({ status })}`);

export const createPayRun = (input: {
  propertyId?: string; periodLabel: string; periodStart?: string; periodEnd?: string;
  deductions?: { label: string; amount?: number; percent?: number }[];
}) => api.post<{ run: PayRunRow }>("/payroll/runs", input);

export const setPayRunStatus = (id: string, status: "APPROVED" | "PAID") =>
  api.patch<{ run: PayRunRow }>(`/payroll/runs/${id}`, { status });

/* ----------------------------- Paltas Rewards --------------------------- */

export interface RewardMember {
  id: string; name: string; email: string; phone: string | null; joinedAt: string;
  balance: number; balanceValue: number; qualifyingSpend: number;
  tier: string; tierName: string; nextTier: string | null;
  toNextTier: number; tierPercent: number; perks: string[];
  nextExpiry: { points: number; at: string } | null;
  entries: { id: string; kind: string; points: number; reason: string; reference: string | null; at: string }[];
}

export const getRewardMembers = (q?: string) => api.get<{ members: RewardMember[] }>(`/loyalty/members${qs({ q })}`);

export const enrolMember = (input: { email: string; name: string; phone?: string; openingPoints?: number }) =>
  api.post<{ member: RewardMember }>("/loyalty/members", input);

export const recordStay = (id: string, amount: number, reference?: string) =>
  api.post<{ member: RewardMember }>(`/loyalty/members/${id}`, { stay: { amount, reference } });

export const redeemPoints = (id: string, points: number, reference?: string) =>
  api.post<{ member: RewardMember }>(`/loyalty/members/${id}`, { redeem: { points, reference } });

export const adjustPoints = (id: string, points: number, reason: string) =>
  api.post<{ member: RewardMember }>(`/loyalty/members/${id}`, { adjust: { points, reason } });

/* ------------------------- Marketplace publishing ----------------------- */

export interface ListingRow {
  id: string; title: string; summary: string | null; description: string;
  kind: "STAY" | "RENT" | "SALE";
  status: "DRAFT" | "PENDING_REVIEW" | "PUBLISHED" | "UNPUBLISHED" | "REJECTED";
  price: number; currency: string;
  maxGuests: number; bedrooms: number; bathrooms: number;
  amenities: string[]; images: string[];
  /** The same photographs, resolved to somewhere fetchable. */
  imageUrls: string[];
  city: string | null; location: string | null;
  hostName: string; hostKind: string;
  propertyId: string; propertyName: string | null;
  unitId: string | null; unitName: string | null;
  publishedAt: string | null; rejectionReason: string | null; updatedAt: string;
}

export const getListings = (params: { status?: string; propertyId?: string | null } = {}) =>
  api.get<{ listings: ListingRow[] }>(`/listings${qs(params)}`);

export const createListing = (input: {
  propertyId?: string; unitId?: string; title: string; summary?: string;
  description: string; kind?: string; price: number; currency?: string;
  maxGuests?: number; bedrooms?: number; bathrooms?: number;
  amenities?: string[]; images?: string[]; hostName?: string; hostKind?: string;
}) => api.post<{ listing: ListingRow }>("/listings", input);

/**
 * Ask for somewhere to put a photograph.
 *
 * The file itself never goes through the platform: this returns a URL signed
 * for one key and a few minutes, the browser sends the bytes straight to
 * storage, and `confirmListingPhoto` is what decides whether they may be kept.
 */
export const requestPhotoUpload = (listingId: string, file: File) =>
  api.post<{ uploadUrl: string; key: string; contentType: string; expiresInSeconds: number }>(
    `/listings/${listingId}/photos`,
    { contentType: file.type, size: file.size },
  );

/** Attach an upload, once the server has read the bytes and agreed they are an image. */
export const confirmListingPhoto = (listingId: string, key: string) =>
  api.patch<{ images: string[]; urls: string[]; type: string }>(`/listings/${listingId}/photos`, { key });

export const removeListingPhoto = (listingId: string, key: string) =>
  api.del<{ images: string[]; urls: string[] }>(
    `/listings/${listingId}/photos?key=${encodeURIComponent(key)}`,
  );

export const setListingLive = (id: string, action: "publish" | "unpublish" | "reject", reason?: string) =>
  api.post<{ listing: ListingRow }>(`/listings/${id}/publish`, { action, reason });

/* -------------------------------- Payments ------------------------------ */

export const getSettlements = () =>
  api.get<{
    mode: "live" | "test" | "unconfigured";
    settlements: {
      id: string; stripeIntentId: string; amount: number; currency: string;
      status: string; purpose: string; reference: string | null;
      customerEmail: string | null; failureReason: string | null; createdAt: string;
    }[];
    totals: { succeeded: number; pending: number; failed: number };
  }>("/payments/settlements");

/**
 * What this organisation is owed, and what has actually been sent.
 *
 * Distinct from `getSettlements`, which reports what guests paid. Money arriving
 * and money leaving are different questions, and a host asking "where is mine?"
 * is asking this one.
 */
export const getPayoutLedger = () =>
  api.get<{
    account: { connected: boolean; payoutsEnabled: boolean };
    policy: { holdDays: number; minimumPayout: number };
    balances: { currency: string; held: number; payable: number; paid: number }[];
    earnings: {
      bookingReference: string | null; currency: string;
      gross: number; platformFee: number; net: number;
      status: "HELD" | "PAYABLE" | "PAID" | "REVERSED";
      checkOut: string; payableFrom: string | null; paidAt: string | null;
      clawedBack: boolean;
    }[];
    payouts: {
      id: string; currency: string; amount: number; status: string;
      sentAt: string | null; failureReason: string | null; createdAt: string;
    }[];
  }>("/payouts");

/** Returns only the client secret — the key never leaves the server. */
export const startCardPayment = (input: {
  purpose: "charge" | "group_share";
  chargeId?: string; groupBookingId?: string; memberId?: string; customerEmail?: string;
}) => api.post<{ clientSecret: string; amount: number; currency: string; mode: string }>("/payments/intent", input);

/* ----------------------------- Stripe Connect --------------------------- */

export interface ConnectStatus {
  mode: "live" | "test" | "unconfigured";
  connected: boolean;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted?: boolean;
  requirementsDue: string[];
  platformFeeBasisPoints: number;
  error?: string | null;
}

export const getConnectStatus = () => api.get<ConnectStatus>("/payments/connect");

/** Returns a short-lived, single-use Stripe-hosted onboarding link. */
export const startConnectOnboarding = () =>
  api.post<{ url: string; accountId: string }>("/payments/connect", {});

/* --------------------------- Platform operations ------------------------ */

export interface PlatformOverview {
  organisations: {
    id: string; name: string; country: string; currency: string;
    properties: number; users: number; stripeOnboarded: boolean; createdAt: string;
  }[];
  portfolio: { organisations: number; properties: number; buildings: number;
               units: number; residents: number; staff: number };
  bookings: { total: number; byStatus: Record<string, number>; bookedRevenue: number };
  marketplace: {
    listings: Record<string, number>;
    external: { total: number; publishable: number };
  };
  operations: {
    openIncidents: number; activeAlerts: number; openMaintenance: number;
    outstandingCharges: { count: number; amount: number };
    openLeads: number; projects: number;
  };
  activity24h: { action: string; count: number }[];
  generatedAt: string;
}

/**
 * The whole platform, for Paltas operations. Answers 404 to anyone who is not
 * platform staff — a tenant should not learn that this console exists.
 */
export const getPlatformOverview = () => api.get<PlatformOverview>("/platform/overview");

/** Change your own name or phone. Everyone may do this; nobody may do more. */
export const updateMyProfile = (input: { name?: string; phone?: string }) =>
  api.patch<{ user: { id: string; name: string; email: string; phone: string | null } }>("/me", input);
