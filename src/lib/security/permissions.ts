/**
 * The PALTAS permission catalogue.
 *
 * This file is the single vocabulary shared by the API and the UI. A route
 * handler names the permission it requires; a screen names the permission it
 * needs to render. Both resolve against the same strings, so a button that is
 * hidden is hidden *because* the call behind it would be refused — not as a
 * separate, drifting opinion about what the user may do.
 *
 * It is deliberately dependency-free so it can be imported on the server and in
 * the browser without dragging anything along.
 */

export const PERMISSIONS = {
  // -- Portfolio ------------------------------------------------------------
  PROPERTY_VIEW: "property.view",
  PROPERTY_CREATE: "property.create",
  PROPERTY_UPDATE: "property.update",
  PROPERTY_DELETE: "property.delete",
  BUILDING_VIEW: "building.view",
  BUILDING_CREATE: "building.create",
  BUILDING_UPDATE: "building.update",
  BUILDING_DELETE: "building.delete",
  UNIT_VIEW: "unit.view",
  UNIT_CREATE: "unit.create",
  UNIT_UPDATE: "unit.update",
  UNIT_DELETE: "unit.delete",
  RESIDENT_VIEW: "resident.view",
  RESIDENT_CREATE: "resident.create",
  RESIDENT_UPDATE: "resident.update",
  RESIDENT_DELETE: "resident.delete",
  /** Phone numbers, email, lease dates — the private half of a resident record. */
  RESIDENT_CONTACT_VIEW: "resident.contact.view",

  // -- Staff & permissions --------------------------------------------------
  STAFF_VIEW: "staff.view",
  STAFF_CREATE: "staff.create",
  STAFF_UPDATE: "staff.update",
  STAFF_SUSPEND: "staff.suspend",
  STAFF_DELETE: "staff.delete",
  STAFF_PERMISSIONS_MANAGE: "staff.permissions.manage",
  ROLE_VIEW: "role.view",
  ROLE_MANAGE: "role.manage",

  // -- Security: visitors ---------------------------------------------------
  VISITOR_VIEW: "visitor.view",
  VISITOR_CREATE: "visitor.create",
  VISITOR_UPDATE: "visitor.update",
  VISITOR_APPROVE: "visitor.approve",
  VISITOR_CHECKIN: "visitor.checkin",
  VISITOR_CHECKOUT: "visitor.checkout",
  VISITOR_SEARCH: "visitor.search",
  VISITOR_BLACKLIST: "visitor.blacklist",
  INVITATION_VIEW: "invitation.view",
  INVITATION_CREATE: "invitation.create",
  INVITATION_CANCEL: "invitation.cancel",
  /** Scan or key in a QR pass at the gate and be told go / no-go. */
  PASS_VERIFY: "pass.verify",

  // -- Security: access control --------------------------------------------
  CARD_VIEW: "card.view",
  CARD_CREATE: "card.create",
  CARD_SUSPEND: "card.suspend",
  CARD_REINSTATE: "card.reinstate",
  CARD_REVOKE: "card.revoke",
  CARD_VERIFY: "card.verify",
  VEHICLE_VIEW: "vehicle.view",
  VEHICLE_CREATE: "vehicle.create",
  VEHICLE_UPDATE: "vehicle.update",
  VEHICLE_DELETE: "vehicle.delete",
  GATE_VIEW: "gate.view",
  GATE_MANAGE: "gate.manage",

  // -- Security: staffing & events -----------------------------------------
  GUARD_VIEW: "guard.view",
  GUARD_MANAGE: "guard.manage",
  SHIFT_VIEW: "shift.view",
  SHIFT_MANAGE: "shift.manage",
  SECURITY_INCIDENT_VIEW: "security.incident.view",
  SECURITY_INCIDENT_CREATE: "security.incident.create",
  SECURITY_INCIDENT_UPDATE: "security.incident.update",
  SECURITY_INCIDENT_RESOLVE: "security.incident.resolve",
  SECURITY_EMERGENCY_VIEW: "security.emergency.view",
  SECURITY_EMERGENCY_RAISE: "security.emergency.raise",
  SECURITY_EMERGENCY_ACKNOWLEDGE: "security.emergency.acknowledge",
  SECURITY_ACCESS_VIEW: "security.access.view",
  SECURITY_DASHBOARD_VIEW: "security.dashboard.view",
  SECURITY_REPORT_VIEW: "security.report.view",

  // -- Maintenance ----------------------------------------------------------
  MAINTENANCE_VIEW: "maintenance.view",
  MAINTENANCE_CREATE: "maintenance.create",
  MAINTENANCE_UPDATE: "maintenance.update",
  MAINTENANCE_ASSIGN: "maintenance.assign",
  MAINTENANCE_RESOLVE: "maintenance.resolve",

  // -- Pricing, discounts & campaigns ---------------------------------------
  DISCOUNT_VIEW: "discount.view",
  DISCOUNT_CREATE: "discount.create",
  DISCOUNT_UPDATE: "discount.update",
  DISCOUNT_DELETE: "discount.delete",
  CAMPAIGN_VIEW: "campaign.view",
  CAMPAIGN_CREATE: "campaign.create",
  CAMPAIGN_UPDATE: "campaign.update",
  /** Putting prices in front of the public — separate from drafting them. */
  CAMPAIGN_PUBLISH: "campaign.publish",

  // -- Group bookings & split payments --------------------------------------
  GROUP_VIEW: "group.view",
  GROUP_CREATE: "group.create",
  GROUP_UPDATE: "group.update",
  GROUP_CONFIRM: "group.confirm",
  GROUP_PAYMENT_RECORD: "group.payment.record",

  // -- Finance --------------------------------------------------------------
  FINANCE_VIEW: "finance.view",
  FINANCE_PAYMENT_VIEW: "finance.payment.view",
  FINANCE_PAYMENT_RECORD: "finance.payment.record",
  FINANCE_EXPENSE_VIEW: "finance.expense.view",
  FINANCE_EXPENSE_CREATE: "finance.expense.create",
  FINANCE_REPORT_VIEW: "finance.report.view",

  // -- Fee schedule & charges -----------------------------------------------
  FEE_CATEGORY_VIEW: "finance.category.view",
  FEE_CATEGORY_MANAGE: "finance.category.manage",
  CHARGE_VIEW: "finance.charge.view",
  CHARGE_CREATE: "finance.charge.create",
  CHARGE_UPDATE: "finance.charge.update",
  /** Writing off what is owed — deliberately its own permission. */
  CHARGE_WAIVE: "finance.charge.waive",

  // -- Payroll --------------------------------------------------------------
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_MANAGE: "payroll.manage",
  /** Signing off a pay run so it can be paid. */
  PAYROLL_APPROVE: "payroll.approve",
  SALARY_VIEW: "payroll.salary.view",
  SALARY_MANAGE: "payroll.salary.manage",

  // -- Loyalty --------------------------------------------------------------
  LOYALTY_VIEW: "loyalty.view",
  LOYALTY_MANAGE: "loyalty.manage",
  /** Moving points by hand — goodwill, corrections, compensation. */
  LOYALTY_ADJUST: "loyalty.adjust",

  // -- Publishing to the marketplace ----------------------------------------
  LISTING_VIEW: "listing.view",
  LISTING_CREATE: "listing.create",
  LISTING_UPDATE: "listing.update",
  /** Making a listing visible to the public — distinct from drafting it. */
  LISTING_PUBLISH: "listing.publish",
  LISTING_UNPUBLISH: "listing.unpublish",
  /** Platform-side approval of what appears on the marketplace. */
  LISTING_REVIEW: "listing.review",

  // -- Payments -------------------------------------------------------------
  PAYMENT_INTENT_CREATE: "payment.intent.create",
  PAYMENT_SETTLEMENT_VIEW: "payment.settlement.view",
  PAYMENT_REFUND: "payment.refund",
  /** Connecting the account money is paid into — the owner's decision. */
  PAYMENT_CONNECT_MANAGE: "payment.connect.manage",

  // -- Oversight ------------------------------------------------------------
  REPORT_VIEW: "report.view",
  AUDIT_VIEW: "audit.view",
  OWNER_DASHBOARD_VIEW: "owner.dashboard.view",
  /** The owner's own contact and financial identity — off by default for staff. */
  OWNER_INFO_VIEW: "owner.info.view",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Grants may be written as a wildcard: `visitor.*` covers every visitor
 * permission, `*` covers everything. Only the owner is given `*`, and only by
 * virtue of being the owner — it is never stored as a grant anyone can copy.
 */
export const WILDCARD = "*";

export interface PermissionMeta {
  key: Permission;
  label: string;
  /** Shown in the staff permission editor so the choice is understood, not guessed. */
  hint: string;
  /** True where granting this exposes money or personal data — highlighted in the UI. */
  sensitive?: boolean;
}

export interface PermissionGroup {
  key: string;
  label: string;
  permissions: PermissionMeta[];
}

const P = PERMISSIONS;

/**
 * The catalogue as the owner sees it when building a custom staff member.
 * Order and grouping here drive the permission editor directly, so adding a
 * permission to the product means adding it once, here.
 */
export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    key: "portfolio",
    label: "Portfolio",
    permissions: [
      { key: P.PROPERTY_VIEW, label: "View properties", hint: "See properties they are assigned to." },
      { key: P.PROPERTY_CREATE, label: "Add properties", hint: "Create new properties in the organisation." },
      { key: P.PROPERTY_UPDATE, label: "Edit properties", hint: "Change property details." },
      { key: P.PROPERTY_DELETE, label: "Delete properties", hint: "Permanently remove a property and everything under it.", sensitive: true },
      { key: P.BUILDING_VIEW, label: "View buildings", hint: "See buildings within their properties." },
      { key: P.BUILDING_CREATE, label: "Add buildings", hint: "Create buildings under a property." },
      { key: P.BUILDING_UPDATE, label: "Edit buildings", hint: "Rename or restructure a building." },
      { key: P.BUILDING_DELETE, label: "Delete buildings", hint: "Remove a building and its units.", sensitive: true },
      { key: P.UNIT_VIEW, label: "View units", hint: "See units, floors and occupancy." },
      { key: P.UNIT_CREATE, label: "Add units", hint: "Create units within a building." },
      { key: P.UNIT_UPDATE, label: "Edit units", hint: "Change unit details, rent and status." },
      { key: P.UNIT_DELETE, label: "Delete units", hint: "Remove a unit.", sensitive: true },
    ],
  },
  {
    key: "residents",
    label: "Residents & tenants",
    permissions: [
      { key: P.RESIDENT_VIEW, label: "View residents", hint: "See who occupies each unit." },
      { key: P.RESIDENT_CONTACT_VIEW, label: "View resident contact details", hint: "Phone, email and lease dates.", sensitive: true },
      { key: P.RESIDENT_CREATE, label: "Add residents", hint: "Register a new resident or tenant." },
      { key: P.RESIDENT_UPDATE, label: "Edit residents", hint: "Update resident records and move-out dates." },
      { key: P.RESIDENT_DELETE, label: "Remove residents", hint: "Delete a resident record.", sensitive: true },
    ],
  },
  {
    key: "visitors",
    label: "Visitor management",
    permissions: [
      { key: P.VISITOR_VIEW, label: "View visitors", hint: "See expected and on-site visitors." },
      { key: P.VISITOR_SEARCH, label: "Search visitors", hint: "Look up a visitor at the gate." },
      { key: P.VISITOR_CREATE, label: "Register visitors", hint: "Add a walk-in visitor record." },
      { key: P.VISITOR_UPDATE, label: "Edit visitors", hint: "Correct visitor details." },
      { key: P.VISITOR_APPROVE, label: "Approve visitors", hint: "Approve or reject a pending invitation." },
      { key: P.VISITOR_CHECKIN, label: "Check visitors in", hint: "Admit a visitor at the gate." },
      { key: P.VISITOR_CHECKOUT, label: "Check visitors out", hint: "Close out a visit on departure." },
      { key: P.VISITOR_BLACKLIST, label: "Blacklist visitors", hint: "Bar a visitor from the property.", sensitive: true },
      { key: P.INVITATION_VIEW, label: "View invitations", hint: "See invitations raised by residents." },
      { key: P.INVITATION_CREATE, label: "Create invitations", hint: "Raise a visitor invitation and QR pass." },
      { key: P.INVITATION_CANCEL, label: "Cancel invitations", hint: "Revoke an invitation before use." },
      { key: P.PASS_VERIFY, label: "Verify QR passes", hint: "Scan a pass at the gate and get go / no-go." },
    ],
  },
  {
    key: "access",
    label: "Access control",
    permissions: [
      { key: P.CARD_VIEW, label: "View access cards", hint: "See issued cards and their status." },
      { key: P.CARD_VERIFY, label: "Verify access cards", hint: "Check a card at the gate." },
      { key: P.CARD_CREATE, label: "Issue access cards", hint: "Issue resident, family or temporary cards." },
      { key: P.CARD_SUSPEND, label: "Suspend access cards", hint: "Temporarily disable a card." },
      { key: P.CARD_REINSTATE, label: "Reinstate access cards", hint: "Return a suspended card to service." },
      { key: P.CARD_REVOKE, label: "Revoke access cards", hint: "Permanently kill a card.", sensitive: true },
      { key: P.VEHICLE_VIEW, label: "View vehicles", hint: "See registered vehicles and permits." },
      { key: P.VEHICLE_CREATE, label: "Register vehicles", hint: "Record a resident or visitor vehicle." },
      { key: P.VEHICLE_UPDATE, label: "Edit vehicles", hint: "Update plates, permits and bays." },
      { key: P.VEHICLE_DELETE, label: "Remove vehicles", hint: "Deregister a vehicle." },
      { key: P.GATE_VIEW, label: "View gates", hint: "See gates and checkpoints." },
      { key: P.GATE_MANAGE, label: "Manage gates", hint: "Add, rename or deactivate checkpoints." },
    ],
  },
  {
    key: "security-ops",
    label: "Security operations",
    permissions: [
      { key: P.SECURITY_DASHBOARD_VIEW, label: "Security dashboard", hint: "The live security overview." },
      { key: P.GUARD_VIEW, label: "View guards", hint: "See the guard roster." },
      { key: P.GUARD_MANAGE, label: "Manage guards", hint: "Add and deactivate guards." },
      { key: P.SHIFT_VIEW, label: "View shifts", hint: "See the shift schedule." },
      { key: P.SHIFT_MANAGE, label: "Manage shifts", hint: "Schedule shifts and record hand-overs." },
      { key: P.SECURITY_INCIDENT_VIEW, label: "View incidents", hint: "Read security incident reports." },
      { key: P.SECURITY_INCIDENT_CREATE, label: "Report incidents", hint: "File a new security incident." },
      { key: P.SECURITY_INCIDENT_UPDATE, label: "Update incidents", hint: "Add findings and change status." },
      { key: P.SECURITY_INCIDENT_RESOLVE, label: "Resolve incidents", hint: "Close an incident with a resolution." },
      { key: P.SECURITY_EMERGENCY_VIEW, label: "View emergency alerts", hint: "See active alerts." },
      { key: P.SECURITY_EMERGENCY_RAISE, label: "Raise emergency alerts", hint: "Trigger panic, fire, medical or evacuation." },
      { key: P.SECURITY_EMERGENCY_ACKNOWLEDGE, label: "Acknowledge alerts", hint: "Take ownership of a live alert." },
      { key: P.SECURITY_ACCESS_VIEW, label: "View access history", hint: "Every entry and exit, granted or denied." },
      { key: P.SECURITY_REPORT_VIEW, label: "Security reports", hint: "Aggregated security reporting." },
    ],
  },
  {
    key: "maintenance",
    label: "Maintenance",
    permissions: [
      { key: P.MAINTENANCE_VIEW, label: "View maintenance", hint: "See requests and work orders." },
      { key: P.MAINTENANCE_CREATE, label: "Raise requests", hint: "Log a new maintenance request." },
      { key: P.MAINTENANCE_UPDATE, label: "Update work orders", hint: "Post status updates and notes." },
      { key: P.MAINTENANCE_ASSIGN, label: "Assign work", hint: "Assign a request to a staff member." },
      { key: P.MAINTENANCE_RESOLVE, label: "Resolve requests", hint: "Mark work complete." },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    permissions: [
      { key: P.FINANCE_VIEW, label: "View financials", hint: "Revenue, arrears and totals.", sensitive: true },
      { key: P.FINANCE_PAYMENT_VIEW, label: "View payments", hint: "Rent and service charge records.", sensitive: true },
      { key: P.FINANCE_PAYMENT_RECORD, label: "Record payments", hint: "Mark a payment received.", sensitive: true },
      { key: P.FINANCE_EXPENSE_VIEW, label: "View expenses", hint: "Property expenditure.", sensitive: true },
      { key: P.FINANCE_EXPENSE_CREATE, label: "Record expenses", hint: "Log an expense against a property.", sensitive: true },
      { key: P.FINANCE_REPORT_VIEW, label: "Financial reports", hint: "Statements and financial reporting.", sensitive: true },
    ],
  },
  {
    key: "pricing",
    label: "Pricing & campaigns",
    permissions: [
      { key: P.DISCOUNT_VIEW, label: "View discounts", hint: "See the discount rules in force." },
      { key: P.DISCOUNT_CREATE, label: "Create discounts", hint: "Group, seasonal, early-bird and long-stay rules." },
      { key: P.DISCOUNT_UPDATE, label: "Edit discounts", hint: "Change rates, thresholds and validity windows." },
      { key: P.DISCOUNT_DELETE, label: "Delete discounts", hint: "Remove a discount rule.", sensitive: true },
      { key: P.CAMPAIGN_VIEW, label: "View campaigns", hint: "See scheduled and live campaigns." },
      { key: P.CAMPAIGN_CREATE, label: "Create campaigns", hint: "Draft a seasonal campaign." },
      { key: P.CAMPAIGN_UPDATE, label: "Edit campaigns", hint: "Adjust dates, copy and included discounts." },
      { key: P.CAMPAIGN_PUBLISH, label: "Publish campaigns", hint: "Make a campaign live to the public.", sensitive: true },
    ],
  },
  {
    key: "groups",
    label: "Group bookings",
    permissions: [
      { key: P.GROUP_VIEW, label: "View group bookings", hint: "Hajj, Umrah, family and corporate parties." },
      { key: P.GROUP_CREATE, label: "Create group bookings", hint: "Open a group with a shared reference." },
      { key: P.GROUP_UPDATE, label: "Edit group bookings", hint: "Add travellers and adjust shares." },
      { key: P.GROUP_CONFIRM, label: "Confirm group bookings", hint: "Lock a group once its shares are settled.", sensitive: true },
      { key: P.GROUP_PAYMENT_RECORD, label: "Record share payments", hint: "Mark an individual traveller's share paid.", sensitive: true },
    ],
  },
  {
    key: "fees",
    label: "Fee schedule & charges",
    permissions: [
      { key: P.FEE_CATEGORY_VIEW, label: "View fee categories", hint: "The chart of charges the property runs on." },
      { key: P.FEE_CATEGORY_MANAGE, label: "Manage fee categories", hint: "Add rent, service charge, water, levies and penalties.", sensitive: true },
      { key: P.CHARGE_VIEW, label: "View charges", hint: "What each unit and resident owes.", sensitive: true },
      { key: P.CHARGE_CREATE, label: "Raise charges", hint: "Bill a unit or resident under a category.", sensitive: true },
      { key: P.CHARGE_UPDATE, label: "Edit charges", hint: "Correct an amount or due date before it is settled.", sensitive: true },
      { key: P.CHARGE_WAIVE, label: "Waive charges", hint: "Write off what is owed, with a stated reason.", sensitive: true },
    ],
  },
  {
    key: "payroll",
    label: "Payroll",
    permissions: [
      { key: P.SALARY_VIEW, label: "View salaries", hint: "What each staff member is paid.", sensitive: true },
      { key: P.SALARY_MANAGE, label: "Set salaries", hint: "Create and supersede salary profiles.", sensitive: true },
      { key: P.PAYROLL_VIEW, label: "View pay runs", hint: "Monthly pay runs and payslips.", sensitive: true },
      { key: P.PAYROLL_MANAGE, label: "Prepare pay runs", hint: "Build a run and set its deduction lines.", sensitive: true },
      { key: P.PAYROLL_APPROVE, label: "Approve pay runs", hint: "Sign off a run so it can be paid.", sensitive: true },
    ],
  },
  {
    key: "loyalty",
    label: "Paltas Rewards",
    permissions: [
      { key: P.LOYALTY_VIEW, label: "View members", hint: "Balances, tiers and points history." },
      { key: P.LOYALTY_MANAGE, label: "Manage the programme", hint: "Enrol members and run the scheme." },
      { key: P.LOYALTY_ADJUST, label: "Adjust points", hint: "Move points by hand, with a reason recorded.", sensitive: true },
    ],
  },
  {
    key: "publishing",
    label: "Marketplace publishing",
    permissions: [
      { key: P.LISTING_VIEW, label: "View listings", hint: "Drafts and published adverts for your properties." },
      { key: P.LISTING_CREATE, label: "Create listings", hint: "Advertise a unit as a stay, a rental or for sale." },
      { key: P.LISTING_UPDATE, label: "Edit listings", hint: "Change copy, price, photographs and amenities." },
      { key: P.LISTING_PUBLISH, label: "Publish listings", hint: "Make a listing visible to the public.", sensitive: true },
      { key: P.LISTING_UNPUBLISH, label: "Unpublish listings", hint: "Take a listing down." },
      { key: P.LISTING_REVIEW, label: "Review listings", hint: "Approve or reject what appears on the marketplace.", sensitive: true },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    permissions: [
      { key: P.PAYMENT_INTENT_CREATE, label: "Take payments", hint: "Start a card payment for a booking or charge.", sensitive: true },
      { key: P.PAYMENT_SETTLEMENT_VIEW, label: "View settlements", hint: "What the payment provider actually confirmed.", sensitive: true },
      { key: P.PAYMENT_REFUND, label: "Issue refunds", hint: "Return money to a payer.", sensitive: true },
      { key: P.PAYMENT_CONNECT_MANAGE, label: "Manage payouts", hint: "Connect the bank account takings are paid into.", sensitive: true },
    ],
  },
  {
    key: "staff",
    label: "Staff & administration",
    permissions: [
      { key: P.STAFF_VIEW, label: "View staff", hint: "See the staff directory." },
      { key: P.STAFF_CREATE, label: "Create staff accounts", hint: "Invite a new staff member.", sensitive: true },
      { key: P.STAFF_UPDATE, label: "Edit staff", hint: "Change staff details and roles.", sensitive: true },
      { key: P.STAFF_SUSPEND, label: "Suspend staff", hint: "Disable a staff account.", sensitive: true },
      { key: P.STAFF_DELETE, label: "Delete staff", hint: "Remove a staff account.", sensitive: true },
      { key: P.STAFF_PERMISSIONS_MANAGE, label: "Manage permissions", hint: "Decide what other staff can access.", sensitive: true },
      { key: P.ROLE_VIEW, label: "View roles", hint: "See role definitions." },
      { key: P.ROLE_MANAGE, label: "Manage roles", hint: "Create and edit custom roles.", sensitive: true },
    ],
  },
  {
    key: "oversight",
    label: "Reporting & oversight",
    permissions: [
      { key: P.REPORT_VIEW, label: "View reports", hint: "Operational reporting." },
      { key: P.AUDIT_VIEW, label: "View audit trail", hint: "Who did what, and when.", sensitive: true },
      { key: P.OWNER_DASHBOARD_VIEW, label: "Owner dashboard", hint: "The whole-portfolio master view.", sensitive: true },
      { key: P.OWNER_INFO_VIEW, label: "View owner information", hint: "The owner's own details.", sensitive: true },
    ],
  },
];

/** Flat list of every permission in the product, in catalogue order. */
export const ALL_PERMISSIONS: Permission[] = PERMISSION_GROUPS.flatMap((g) =>
  g.permissions.map((p) => p.key),
);

const META_BY_KEY = new Map<string, PermissionMeta>(
  PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.key as string, p] as const)),
);

export function permissionMeta(key: string): PermissionMeta | undefined {
  return META_BY_KEY.get(key);
}

/** Human label for a permission key, falling back to the key itself. */
export function permissionLabel(key: string): string {
  return META_BY_KEY.get(key)?.label ?? key;
}

export function isKnownPermission(key: string): key is Permission {
  return META_BY_KEY.has(key);
}
