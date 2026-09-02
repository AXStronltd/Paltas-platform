/**
 * Wire models for Paltas Security Management and the management portal.
 *
 * These mirror what the route handlers return, including their omissions: where
 * the API withholds a field for lack of permission the type marks it optional,
 * so a component cannot read `rentAmount` without acknowledging it may not be
 * there. The permission model shows up in the type system rather than only at
 * runtime.
 */

export type VisitorType = "FAMILY_FRIEND" | "DELIVERY" | "CONTRACTOR" | "DOMESTIC_WORKER" | "DRIVER" | "OTHER";
export type InvitationStatus = "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "CANCELLED" | "USED";
export type VisitStatus = "ON_SITE" | "CHECKED_OUT" | "DENIED";
export type CardType = "RESIDENT" | "FAMILY" | "STAFF" | "TEMPORARY" | "CONTRACTOR";
export type CardStatus = "ACTIVE" | "SUSPENDED" | "LOST" | "EXPIRED" | "REVOKED";
export type IncidentSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentStatus = "OPEN" | "INVESTIGATING" | "RESOLVED" | "CLOSED";
export type AlertType = "PANIC" | "FIRE" | "MEDICAL" | "INTRUSION" | "EVACUATION";
export type AccessResultValue = "GRANTED" | "DENIED";
export type ScopeTypeValue = "ORGANIZATION" | "PROPERTY" | "BUILDING" | "UNIT";

export interface SecurityCounts {
  onSite: number;
  expectedToday: number;
  pendingApprovals: number;
  activeAlerts: number;
  openIncidents: number;
  guardsOnShift: number;
  suspendedCards: number;
  deniedLast24h: number;
  checkedInToday: number;
}

export interface AccessEventRow {
  id: string;
  at: string;
  direction: "IN" | "OUT";
  method: "CARD" | "QR" | "MANUAL" | "PLATE";
  result: AccessResultValue;
  subjectType?: string;
  subjectName: string;
  gateName: string | null;
  unitName?: string | null;
  reason: string | null;
}

export interface Invitation {
  id: string;
  propertyId: string;
  unitId: string;
  unitName?: string;
  residentName?: string;
  visitorName: string;
  visitorPhone: string | null;
  visitorType: VisitorType;
  purpose: string | null;
  validFrom: string;
  validTo: string;
  recurring: boolean;
  usesLeft: number;
  passCode: string;
  status: InvitationStatus;
  vehiclePlate: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface Visit {
  id: string;
  propertyId: string;
  visitorName: string;
  visitorPhone: string | null;
  visitorType: VisitorType;
  unitId: string | null;
  unitName: string | null;
  gateName: string | null;
  badgeNo: string | null;
  vehiclePlate: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  status: VisitStatus;
  notes: string | null;
}

export interface VisitorRecord {
  id: string;
  propertyId: string;
  fullName: string;
  phone: string | null;
  type: VisitorType;
  company: string | null;
  blacklisted: boolean;
  blacklistReason: string | null;
  idType: string | null;
  idNumber: string | null;
  visitCount: number;
}

export interface AccessCardRow {
  id: string;
  propertyId: string;
  unitId: string | null;
  unitName: string | null;
  holderName: string;
  cardNumber: string;
  type: CardType;
  status: CardStatus;
  accessZones: string[];
  issuedAt: string;
  expiresAt: string | null;
  suspendReason: string | null;
}

export interface VehicleRow {
  id: string;
  propertyId: string;
  unitId: string | null;
  unitName: string | null;
  ownerName: string | null;
  plate: string;
  make: string | null;
  model: string | null;
  colour: string | null;
  type: "RESIDENT" | "VISITOR" | "STAFF" | "DELIVERY";
  permitNo: string | null;
  parkingBay: string | null;
}

export interface GateRow {
  id: string;
  propertyId: string;
  name: string;
  kind: "MAIN" | "PEDESTRIAN" | "SERVICE" | "PARKING";
  isActive: boolean;
}

export interface GuardRow {
  id: string;
  propertyId: string;
  userId: string;
  name: string;
  email: string;
  accountStatus: string;
  badgeNumber: string;
  phone: string | null;
  onShift: boolean;
  currentGate: string | null;
  shiftEndsAt: string | null;
}

export interface ShiftRow {
  id: string;
  propertyId: string;
  guardId: string;
  guardName: string;
  badgeNumber: string;
  gateName: string | null;
  startsAt: string;
  endsAt: string;
  status: "SCHEDULED" | "ACTIVE" | "COMPLETED" | "MISSED";
  checkInAt: string | null;
  checkOutAt: string | null;
}

export interface IncidentRow {
  id: string;
  reference: string;
  propertyId: string;
  propertyName: string;
  unitName: string | null;
  category: string;
  severity: IncidentSeverity;
  title: string;
  description: string;
  location: string | null;
  occurredAt: string;
  reportedByName: string | null;
  status: IncidentStatus;
  resolvedAt: string | null;
  resolutionNotes: string | null;
}

export interface AlertRow {
  id: string;
  propertyId: string;
  propertyName: string;
  type: AlertType;
  message: string | null;
  location: string | null;
  raisedByName: string | null;
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  createdAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

/** The gate's answer to a scan: go, or no-go with a reason. */
export interface PassVerdict {
  result: AccessResultValue;
  reason: string | null;
  invitation: null | {
    id: string;
    visitorName: string;
    visitorPhone: string | null;
    visitorType: VisitorType;
    purpose: string | null;
    unitId: string;
    unitName: string;
    hostName?: string;
    vehiclePlate: string | null;
    validTo: string;
    usesLeft: number;
  };
}

export interface CardVerdict {
  result: AccessResultValue;
  reason: string | null;
  card: null | {
    id: string;
    cardNumber: string;
    holderName: string;
    type: CardType;
    status: CardStatus;
    unitName: string | null;
    accessZones: string[];
  };
}

/* ---------------------------------- Portfolio --------------------------- */

export interface PropertyRow {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  country: string;
  kind: string;
  buildings: number;
  units: number;
  residents: number;
  occupiedUnits: number;
  occupancyRate: number;
}

export interface UnitRow {
  id: string;
  propertyId: string;
  propertyName: string;
  buildingId: string;
  buildingName: string;
  name: string;
  floor: number | null;
  bedrooms: number | null;
  status: "OCCUPIED" | "VACANT" | "NOTICE" | "MAINTENANCE";
  residents: { id: string; fullName: string; isPrimary: boolean }[];
  /** Present only when the viewer holds a finance permission. */
  rentAmount?: number | null;
  currency?: string;
}

export interface ResidentRow {
  id: string;
  propertyId: string;
  unitId: string;
  unitName: string;
  fullName: string;
  type: "OWNER_OCCUPIER" | "TENANT" | "FAMILY_MEMBER";
  isPrimary: boolean;
  /** Present only with `resident.contact.view`. */
  email?: string | null;
  phone?: string | null;
  moveInAt?: string | null;
  leaseEnd?: string | null;
}

/* ---------------------------------- Owner ------------------------------- */

export interface OwnerDashboard {
  portfolio: {
    properties: number;
    buildings: number;
    units: number;
    occupiedUnits: number;
    occupancyRate: number;
    residents: number;
    staff: number;
  };
  operations: { openMaintenance: number };
  security: {
    onSiteVisitors: number;
    vehicles: number;
    openIncidents: number;
    activeAlerts: number;
    guards: number;
    visitsLast24h: number;
    deniedLast24h: number;
  };
  finance: null | {
    revenueThisMonth: number;
    expensesThisMonth: number;
    netThisMonth: number;
    outstanding: number;
  };
  financeVisible: boolean;
  properties: {
    id: string;
    name: string;
    city: string | null;
    buildings: number;
    units: number;
    residents: number;
    occupiedUnits: number;
    openIncidents: number;
    onSiteVisitors: number;
  }[];
}

/* ---------------------------------- Staff ------------------------------- */

export interface StaffRow {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  title: string | null;
  isOwner: boolean;
  status: "ACTIVE" | "SUSPENDED" | "INVITED";
  createdAt: string;
  roles: { key: string; name: string; scopeType: ScopeTypeValue; scopeId: string }[];
  customPermissions: {
    permission: string;
    effect: "ALLOW" | "DENY";
    scopeType: ScopeTypeValue;
    scopeId: string;
    note?: string | null;
  }[];
}

export interface RoleDefinition {
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
}

/** One row of the effective-permission view used by the permission editor. */
export interface EffectivePermission {
  permission: string;
  allowed: boolean;
  via: "role" | "direct" | "owner" | null;
  roleName: string | null;
  reason: string;
}

/* ---------------------------------- Audit ------------------------------- */

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  permission: string | null;
  entityType: string;
  entityId: string | null;
  propertyId: string | null;
  unitId: string | null;
  summary: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string | null;
}
