import type { GroupPurpose, GroupStatus, InvitationStatus, ListingKind, ListingStatus, VisitorType } from "@prisma/client";
import {
  balanceFrom, nextExpiry, qualifyingSpendFrom, tierProgress, type LedgerEntry,
} from "@/lib/loyalty/loyalty";

/**
 * Shared response shapes.
 *
 * These live outside the route files because a Next.js route module may only
 * export HTTP handlers and its own config — anything else it exports is a build
 * error. Which is a useful constraint: it keeps helpers that two endpoints share
 * from quietly becoming a dependency of one endpoint on another.
 */

export interface InvitationRecord {
  id: string;
  propertyId: string;
  unitId: string;
  visitorName: string;
  visitorPhone: string | null;
  visitorType: VisitorType;
  purpose: string | null;
  validFrom: Date;
  validTo: Date;
  recurring: boolean;
  maxUses: number;
  useCount: number;
  passCode: string;
  status: InvitationStatus;
  vehiclePlate: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  unit?: { id: string; name: string; building: { name: string } } | null;
  resident?: { id: string; fullName: string } | null;
}

/**
 * The wire shape of an invitation. `qrToken` never appears here — the pass image
 * is fetched from its own endpoint, which checks permission again.
 */
export function presentInvitation(i: InvitationRecord) {
  return {
    id: i.id,
    propertyId: i.propertyId,
    unitId: i.unitId,
    unitName: i.unit ? `${i.unit.building.name} · ${i.unit.name}` : undefined,
    residentName: i.resident?.fullName,
    visitorName: i.visitorName,
    visitorPhone: i.visitorPhone,
    visitorType: i.visitorType,
    purpose: i.purpose,
    validFrom: i.validFrom,
    validTo: i.validTo,
    recurring: i.recurring,
    usesLeft: Math.max(0, i.maxUses - i.useCount),
    passCode: i.passCode,
    status: i.status,
    vehiclePlate: i.vehiclePlate,
    approvedAt: i.approvedAt,
    createdAt: i.createdAt,
  };
}

/** Show only the last four characters of an identity document. */
export function maskId(value: string | null): string | null {
  if (!value) return value;
  return value.length <= 4 ? value : `••••${value.slice(-4)}`;
}

/* ------------------------------ Pricing --------------------------------- */

export interface DiscountRecord {
  id: string;
  orgId: string;
  propertyId: string | null;
  campaignId: string | null;
  name: string;
  description: string | null;
  kind: string;
  valueType: string;
  value: number;
  currency: string;
  code: string | null;
  minNights: number | null;
  minGuests: number | null;
  minUnits: number | null;
  minLeadDays: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
  property?: { id: string; name: string } | null;
  campaign?: { id: string; name: string; status: string } | null;
}

/** "20% off" / "KES 5,000 off" — one phrasing, used in the UI and the audit log. */
export function describeDiscount(d: Pick<DiscountRecord, "valueType" | "value" | "currency">): string {
  return d.valueType === "PERCENTAGE" ? `${d.value}% off` : `${d.currency} ${d.value.toLocaleString()} off`;
}

/**
 * `live` is the field that matters to a caller: not whether the rule exists, but
 * whether it would actually apply if someone booked right now. Computed here so
 * every surface agrees on the answer.
 */
export function presentDiscount(d: DiscountRecord, now = new Date()) {
  return {
    id: d.id,
    propertyId: d.propertyId,
    propertyName: d.property?.name ?? null,
    campaignId: d.campaignId,
    campaignName: d.campaign?.name ?? null,
    campaignStatus: d.campaign?.status ?? null,
    name: d.name,
    description: d.description,
    kind: d.kind,
    valueType: d.valueType,
    value: d.value,
    currency: d.currency,
    label: describeDiscount(d),
    code: d.code,
    minNights: d.minNights,
    minGuests: d.minGuests,
    minUnits: d.minUnits,
    minLeadDays: d.minLeadDays,
    maxRedemptions: d.maxRedemptions,
    redemptionCount: d.redemptionCount,
    startsAt: d.startsAt,
    endsAt: d.endsAt,
    active: d.active,
    live:
      d.active &&
      d.startsAt <= now &&
      d.endsAt >= now &&
      (d.maxRedemptions === null || d.redemptionCount < d.maxRedemptions),
  };
}

/* --------------------------- Group bookings ----------------------------- */

export interface GroupRecord {
  id: string; reference: string; name: string; purpose: GroupPurpose; destination: string;
  organiserName: string; organiserEmail: string | null; organiserPhone: string | null;
  checkIn: Date; checkOut: Date; unitsRequested: number; guests: number;
  totalAmount: number; currency: string; discountAmount: number; status: GroupStatus;
  propertyId: string | null; createdAt: Date; confirmedAt: Date | null;
  property?: { id: string; name: string } | null;
  discount?: { id: string; name: string } | null;
  members: { id: string; name: string; email: string | null; phone: string | null; shareAmount: number; shareStatus: string; paidAt: Date | null; isOrganiser: boolean }[];
}

/**
 * The organiser's view of a group: what is owed, what has arrived, and the one
 * percentage that tells them whether they can stop chasing people.
 */
export function presentGroup(g: GroupRecord) {
  const payable = g.totalAmount - g.discountAmount;
  const collected = g.members.filter((m) => m.shareStatus === "PAID").reduce((a, m) => a + m.shareAmount, 0);
  return {
    id: g.id,
    reference: g.reference,
    name: g.name,
    purpose: g.purpose,
    destination: g.destination,
    organiserName: g.organiserName,
    organiserEmail: g.organiserEmail,
    organiserPhone: g.organiserPhone,
    propertyId: g.propertyId,
    propertyName: g.property?.name ?? null,
    checkIn: g.checkIn,
    checkOut: g.checkOut,
    guests: g.guests,
    unitsRequested: g.unitsRequested,
    currency: g.currency,
    totalAmount: g.totalAmount,
    discountName: g.discount?.name ?? null,
    discountAmount: g.discountAmount,
    payable,
    collected,
    outstanding: payable - collected,
    /** The number that tells an organiser whether they can stop chasing people. */
    percentCollected: payable ? Math.round((collected / payable) * 100) : 100,
    status: g.status,
    confirmedAt: g.confirmedAt,
    createdAt: g.createdAt,
    members: g.members,
  };
}

/* ----------------------------- Paltas Rewards --------------------------- */

export interface MemberRow {
  id: string; email: string; name: string; phone: string | null; joinedAt: Date;
  entries: { id: string; kind: string; points: number; qualifyingSpend: number | null; reason: string; reference: string | null; at: Date }[];
}

/**
 * Balance and tier derived from the ledger on every read, so they cannot drift
 * from the entries that justify them.
 */
export function summariseMember(m: MemberRow) {
  const ledger: LedgerEntry[] = m.entries.map((e) => ({
    points: e.points,
    at: e.at,
    kind: e.kind as LedgerEntry["kind"],
    qualifyingSpend: e.qualifyingSpend ?? undefined,
  }));
  const balance = balanceFrom(ledger);
  const qualifying = qualifyingSpendFrom(ledger);
  const progress = tierProgress(qualifying);
  const expiring = nextExpiry(ledger);

  return {
    id: m.id,
    name: m.name,
    email: m.email,
    phone: m.phone,
    joinedAt: m.joinedAt,
    balance,
    /** Points are one shilling each, so the balance has a stated cash value. */
    balanceValue: balance,
    qualifyingSpend: qualifying,
    tier: progress.tier.key,
    tierName: progress.tier.name,
    nextTier: progress.next?.name ?? null,
    toNextTier: progress.remaining,
    tierPercent: progress.percent,
    perks: progress.tier.perks,
    nextExpiry: expiring ? { points: expiring.points, at: expiring.at } : null,
    entries: m.entries.slice(0, 50),
  };
}

/* ------------------------------ Publishing ------------------------------ */

export interface ListingRecord {
  id: string; title: string; summary: string | null; description: string;
  kind: ListingKind; status: ListingStatus; price: number; currency: string;
  maxGuests: number; bedrooms: number; bathrooms: number;
  amenities: string[]; images: string[]; city: string | null; location: string | null;
  hostName: string; hostKind: string;
  propertyId: string; unitId: string | null;
  publishedAt: Date | null; rejectionReason: string | null; updatedAt: Date;
  property?: { id: string; name: string; city: string | null } | null;
  unit?: { id: string; name: string; building: { name: string } } | null;
}

/** The private view of a listing — every field, at any status. */
export function presentListing(l: ListingRecord) {
  return {
    id: l.id,
    title: l.title,
    summary: l.summary,
    description: l.description,
    kind: l.kind,
    status: l.status,
    price: l.price,
    currency: l.currency,
    maxGuests: l.maxGuests,
    bedrooms: l.bedrooms,
    bathrooms: l.bathrooms,
    amenities: l.amenities,
    images: l.images,
    city: l.city,
    location: l.location,
    hostName: l.hostName,
    hostKind: l.hostKind,
    propertyId: l.propertyId,
    propertyName: l.property?.name ?? null,
    unitId: l.unitId,
    unitName: l.unit ? `${l.unit.building.name} · ${l.unit.name}` : null,
    publishedAt: l.publishedAt,
    rejectionReason: l.rejectionReason,
    updatedAt: l.updatedAt,
  };
}
