/**
 * Seed a working PALTAS organisation.
 *
 * Deliberately seeds *two* properties and staff scoped to one of them, because
 * data isolation is the requirement most easily believed and least easily
 * checked. With this data you can sign in as the Kilimani property manager and
 * confirm that Nyali is not merely hidden — it is absent from every response.
 *
 * Run with: npm run db:seed
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomBytes, randomInt, scrypt as _scrypt } from "node:crypto";
import { promisify } from "node:util";
import { PrismaClient } from "@prisma/client";
// Shared with prisma/sync-listings.mjs, so a fresh database and an existing
// one end up with the same sample inventory, placed the same way.
import { addMissingSampleListings } from "./sample-inventory.mjs";

const scrypt = promisify(_scrypt);
const prisma = new PrismaClient();
const here = dirname(fileURLToPath(import.meta.url));

const SYSTEM_ROLES = JSON.parse(readFileSync(join(here, "../src/lib/security/system-roles.json"), "utf8"));
// Shared with prisma/sync-listings.mjs, so a fresh database and an existing one
// end up with the same sample inventory.


/** Must match src/server/password.ts exactly, or nothing seeded here can log in. */
async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${derived.toString("hex")}`;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function passCode() {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
const qrToken = () => randomBytes(24).toString("base64url");
const days = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);
const hours = (n) => new Date(Date.now() + n * 60 * 60 * 1000);

const DEMO_PASSWORD = process.env.SEED_PASSWORD || "paltas-demo-2026";

async function main() {
  console.log("Seeding PALTAS…");

  // A clean slate for the demo organisations only — cascades take the rest.
  const DEMO_ORGS = ["Paltas Properties", "Coastal Living Ltd", "Paltas (Platform)"];
  const stale = await prisma.organization.findMany({ where: { name: { in: DEMO_ORGS } }, select: { id: true } });
  if (stale.length) {
    await prisma.organization.deleteMany({ where: { id: { in: stale.map((o) => o.id) } } });
    console.log(`  removed ${stale.length} previous demo organisation(s)`);
  }

  // Guests belong to no organisation — that is the point of them, a guest books
  // across tenants — so the cascade above does not reach them. Demo guests are
  // cleared by address instead. Real guest accounts are never touched.
  const DEMO_GUESTS = ["guest@example.com", "other.guest@example.com"];
  const staleGuests = await prisma.guest.deleteMany({ where: { email: { in: DEMO_GUESTS } } });
  if (staleGuests.count) console.log(`  removed ${staleGuests.count} previous demo guest(s)`);

  const org = await prisma.organization.create({
    data: { name: "Paltas Properties", country: "KE", currency: "KES" },
  });

  // Paltas itself. Holds the staff who operate the service and owns no property;
  // every tenant-facing listing excludes it.
  const platformOrg = await prisma.organization.create({
    data: { name: "Paltas (Platform)", country: "KE", currency: "KES", isPlatform: true },
  });

  // A second tenant, so that cross-organisation access is something you can
  // actually see rather than take on trust. Nobody in Paltas Properties can see
  // a single row of it; the platform administrator sees both.
  const tenant2 = await prisma.organization.create({
    data: { name: "Coastal Living Ltd", country: "KE", currency: "KES" },
  });

  // ---- Roles -------------------------------------------------------------
  async function seedRoles(organisationId) {
    const out = {};
    for (const def of SYSTEM_ROLES) {
      out[def.key] = await prisma.role.create({
        data: {
          orgId: organisationId,
          key: def.key,
          name: def.name,
          description: def.description,
          isSystem: true,
          permissions: { create: def.permissions.map((permission) => ({ permission })) },
        },
      });
    }
    return out;
  }
  const roles = await seedRoles(org.id);
  const roles2 = await seedRoles(tenant2.id);
  console.log(`  ${Object.keys(roles).length} roles × 2 tenants`);

  // ---- Owner -------------------------------------------------------------
  const owner = await prisma.user.create({
    data: {
      orgId: org.id,
      email: "owner@paltas.co.ke",
      name: "Amina Yusuf",
      title: "Property Owner",
      phone: "+254 700 000 001",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      isOwner: true,
    },
  });

  // Paltas platform staff. Authority crosses organisations, which is why it is
  // a column on the user rather than anything a tenant could grant.
  const platformAdmin = await prisma.user.create({
    data: {
      orgId: platformOrg.id,
      email: "admin@paltas.com",
      name: "Paltas Admin",
      title: "Platform Administrator",
      phone: "+254 700 000 000",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      isPlatformAdmin: true,
    },
  });

  // ---- Second tenant -----------------------------------------------------
  const owner2 = await prisma.user.create({
    data: {
      orgId: tenant2.id,
      email: "owner@coastalliving.co.ke",
      name: "Salim Bakari",
      title: "Property Owner",
      passwordHash: await hashPassword(DEMO_PASSWORD),
      isOwner: true,
    },
  });
  const coastal = await prisma.property.create({
    data: { orgId: tenant2.id, name: "Diani Palms", address: "Diani Beach Road", city: "Kwale", country: "KE" },
  });
  const coastalBlock = await prisma.building.create({
    data: { propertyId: coastal.id, name: "Palm Wing", floors: 3 },
  });
  for (const [name, floor, beds, rent, status] of [["P-01", 1, 2, 85000, "OCCUPIED"], ["P-02", 2, 2, 85000, "VACANT"]]) {
    await prisma.unit.create({
      data: { buildingId: coastalBlock.id, propertyId: coastal.id, name, floor, bedrooms: beds, rentAmount: rent, status },
    });
  }
  await prisma.gate.create({ data: { propertyId: coastal.id, name: "Beach Gate", kind: "MAIN" } });

  // ---- Portfolio ---------------------------------------------------------
  const kilimani = await prisma.property.create({
    data: { orgId: org.id, name: "Kilimani Heights", address: "Dennis Pritt Road", city: "Nairobi", country: "KE" },
  });
  const nyali = await prisma.property.create({
    data: { orgId: org.id, name: "Nyali Court", address: "Links Road", city: "Mombasa", country: "KE" },
  });

  const blockA = await prisma.building.create({ data: { propertyId: kilimani.id, name: "Block A", floors: 8 } });
  const blockB = await prisma.building.create({ data: { propertyId: kilimani.id, name: "Block B", floors: 6 } });
  const nyaliBlock = await prisma.building.create({ data: { propertyId: nyali.id, name: "Seaview Wing", floors: 4 } });

  const units = {};
  const unitPlan = [
    [blockA, kilimani, "A-101", 1, 2, 65000, "OCCUPIED"],
    [blockA, kilimani, "A-204", 2, 3, 95000, "OCCUPIED"],
    [blockA, kilimani, "A-305", 3, 2, 72000, "OCCUPIED"],
    [blockA, kilimani, "A-402", 4, 1, 48000, "VACANT"],
    [blockB, kilimani, "B-101", 1, 3, 88000, "OCCUPIED"],
    [blockB, kilimani, "B-202", 2, 2, 70000, "NOTICE"],
    [nyaliBlock, nyali, "S-01", 1, 3, 120000, "OCCUPIED"],
    [nyaliBlock, nyali, "S-02", 1, 3, 120000, "VACANT"],
  ];
  for (const [building, property, name, floor, bedrooms, rentAmount, status] of unitPlan) {
    units[name] = await prisma.unit.create({
      data: { buildingId: building.id, propertyId: property.id, name, floor, bedrooms, rentAmount, status },
    });
  }
  console.log(`  2 properties, 3 buildings, ${Object.keys(units).length} units`);

  // ---- Residents ---------------------------------------------------------
  const residents = {};
  const residentPlan = [
    ["A-101", "Daniel Mwangi", "daniel.mwangi@example.com", "+254 711 100 101", "TENANT", true, days(240)],
    ["A-204", "Faith Achieng", "faith.achieng@example.com", "+254 711 100 204", "TENANT", true, days(120)],
    ["A-204", "Peter Achieng", null, "+254 711 100 205", "FAMILY_MEMBER", false, null],
    ["A-305", "Brian Otieno", "brian.otieno@example.com", "+254 711 100 305", "OWNER_OCCUPIER", true, null],
    ["B-101", "Grace Wanjiru", "grace.wanjiru@example.com", "+254 711 100 401", "TENANT", true, days(60)],
    ["B-202", "Samuel Kiptoo", "samuel.kiptoo@example.com", "+254 711 100 402", "TENANT", true, days(15)],
    ["S-01", "Zainab Ali", "zainab.ali@example.com", "+254 711 200 101", "TENANT", true, days(300)],
  ];
  for (const [unitName, fullName, email, phone, type, isPrimary, leaseEnd] of residentPlan) {
    const unit = units[unitName];
    residents[fullName] = await prisma.resident.create({
      data: {
        unitId: unit.id, propertyId: unit.propertyId, fullName, email, phone, type, isPrimary,
        moveInAt: days(-400 + randomInt(200)), leaseEnd,
      },
    });
  }

  // ---- Staff -------------------------------------------------------------
  async function staff({ name, email, title, roleKey, scopeType, scopeId, grants = [] }) {
    const user = await prisma.user.create({
      data: {
        orgId: org.id, email, name, title,
        passwordHash: await hashPassword(DEMO_PASSWORD),
        createdById: owner.id,
      },
    });
    if (roleKey) {
      await prisma.roleAssignment.create({
        data: { userId: user.id, roleId: roles[roleKey].id, scopeType, scopeId, grantedById: owner.id },
      });
    }
    for (const g of grants) {
      await prisma.permissionGrant.create({
        data: {
          userId: user.id, permission: g.permission, effect: g.effect ?? "ALLOW",
          scopeType: g.scopeType ?? scopeType, scopeId: g.scopeId ?? scopeId,
          grantedById: owner.id, note: g.note,
        },
      });
    }
    return user;
  }

  const manager = await staff({
    name: "Joseph Kamau", email: "joseph.kamau@paltas.co.ke", title: "Property Manager",
    roleKey: "property_manager", scopeType: "PROPERTY", scopeId: kilimani.id,
  });

  const securityManager = await staff({
    name: "Mercy Njeri", email: "mercy.njeri@paltas.co.ke", title: "Security Manager",
    roleKey: "security_manager", scopeType: "PROPERTY", scopeId: kilimani.id,
  });

  // The worked example from the brief: a guard with hand-picked permissions.
  // He holds the guard role, is additionally allowed to see residents and
  // security incidents, and is explicitly denied anything financial — the deny
  // is redundant against his role today, and stays correct if the role changes.
  const john = await staff({
    name: "John Mutiso", email: "john.mutiso@paltas.co.ke", title: "Security Guard",
    roleKey: "security_guard", scopeType: "PROPERTY", scopeId: kilimani.id,
    grants: [
      { permission: "resident.view", note: "Needs to confirm who a visitor is calling on" },
      { permission: "visitor.approve", note: "Trusted to approve at the gate on the night shift" },
      { permission: "finance.view", effect: "DENY", note: "No financial access" },
      { permission: "staff.create", effect: "DENY", note: "Cannot create staff" },
      { permission: "property.delete", effect: "DENY", note: "Cannot delete properties" },
      { permission: "owner.info.view", effect: "DENY", note: "No owner information" },
    ],
  });

  const guard2 = await staff({
    name: "Peter Wafula", email: "peter.wafula@paltas.co.ke", title: "Security Guard",
    roleKey: "security_guard", scopeType: "PROPERTY", scopeId: kilimani.id,
  });

  const maintenance = await staff({
    name: "Alice Nduta", email: "alice.nduta@paltas.co.ke", title: "Maintenance Technician",
    roleKey: "maintenance_staff", scopeType: "PROPERTY", scopeId: kilimani.id,
  });

  const accountant = await staff({
    name: "David Omondi", email: "david.omondi@paltas.co.ke", title: "Accountant",
    roleKey: "accountant", scopeType: "ORGANIZATION", scopeId: org.id,
  });

  // Scoped to one building only, to exercise scoping below property level.
  const blockBSupervisor = await staff({
    name: "Ruth Chebet", email: "ruth.chebet@paltas.co.ke", title: "Block B Supervisor",
    roleKey: "property_manager", scopeType: "BUILDING", scopeId: blockB.id,
  });

  // Nyali staff — the control group for data isolation.
  const nyaliManager = await staff({
    name: "Hassan Omar", email: "hassan.omar@paltas.co.ke", title: "Property Manager",
    roleKey: "property_manager", scopeType: "PROPERTY", scopeId: nyali.id,
  });

  console.log("  7 staff accounts");

  // ---- Security: gates, guards, shifts ------------------------------------
  const mainGate = await prisma.gate.create({ data: { propertyId: kilimani.id, name: "Main Gate", kind: "MAIN" } });
  const serviceGate = await prisma.gate.create({ data: { propertyId: kilimani.id, name: "Service Entrance", kind: "SERVICE" } });
  const parkingGate = await prisma.gate.create({ data: { propertyId: kilimani.id, name: "Basement Parking", kind: "PARKING" } });
  await prisma.gate.create({ data: { propertyId: nyali.id, name: "Beach Road Gate", kind: "MAIN" } });

  const johnGuard = await prisma.guard.create({
    data: { propertyId: kilimani.id, userId: john.id, badgeNumber: "KH-G-014", phone: "+254 722 300 014" },
  });
  const peterGuard = await prisma.guard.create({
    data: { propertyId: kilimani.id, userId: guard2.id, badgeNumber: "KH-G-022", phone: "+254 722 300 022" },
  });

  await prisma.guardShift.create({
    data: { propertyId: kilimani.id, guardId: johnGuard.id, gateId: mainGate.id, startsAt: hours(-4), endsAt: hours(8), status: "ACTIVE", checkInAt: hours(-4) },
  });
  await prisma.guardShift.create({
    data: { propertyId: kilimani.id, guardId: peterGuard.id, gateId: serviceGate.id, startsAt: hours(8), endsAt: hours(20), status: "SCHEDULED" },
  });
  await prisma.guardShift.create({
    data: { propertyId: kilimani.id, guardId: johnGuard.id, gateId: mainGate.id, startsAt: hours(-28), endsAt: hours(-16), status: "COMPLETED", checkInAt: hours(-28), checkOutAt: hours(-16) },
  });

  // ---- Access cards -------------------------------------------------------
  const cards = {};
  const cardPlan = [
    ["A-101", "Daniel Mwangi", "A101-01", "RESIDENT", "ACTIVE"],
    ["A-204", "Faith Achieng", "A204-01", "RESIDENT", "ACTIVE"],
    ["A-204", "Peter Achieng", "A204-02", "FAMILY", "SUSPENDED"],
    ["A-305", "Brian Otieno", "A305-01", "RESIDENT", "ACTIVE"],
    ["B-101", "Grace Wanjiru", "B101-01", "RESIDENT", "ACTIVE"],
    ["B-101", "Mary (domestic worker)", "B101-02", "TEMPORARY", "ACTIVE"],
  ];
  for (const [unitName, holderName, cardNumber, type, status] of cardPlan) {
    const unit = units[unitName];
    cards[cardNumber] = await prisma.accessCard.create({
      data: {
        propertyId: unit.propertyId, unitId: unit.id,
        residentId: residents[holderName]?.id ?? null,
        holderName, cardNumber, type, status,
        accessZones: type === "TEMPORARY" ? ["main-gate", "block-b"] : ["main-gate", "parking", "gym"],
        expiresAt: type === "TEMPORARY" ? days(21) : null,
        issuedById: securityManager.id,
        ...(status === "SUSPENDED"
          ? { suspendedAt: hours(-6), suspendedById: john.id, suspendReason: "Card reported lost by resident" }
          : {}),
      },
    });
  }

  // ---- Vehicles -----------------------------------------------------------
  const vehiclePlan = [
    ["A-101", "Daniel Mwangi", "KDA 231X", "Toyota", "Axio", "Silver", "RESIDENT", "B-14"],
    ["A-204", "Faith Achieng", "KCX 887Y", "Mazda", "Demio", "Blue", "RESIDENT", "B-22"],
    ["A-305", "Brian Otieno", "KDG 004Z", "Subaru", "Forester", "White", "RESIDENT", "B-31"],
    ["B-101", "Grace Wanjiru", "KBZ 552A", "Nissan", "Note", "Red", "RESIDENT", "B-08"],
  ];
  for (const [unitName, ownerName, plate, make, model, colour, type, bay] of vehiclePlan) {
    const unit = units[unitName];
    await prisma.vehicle.create({
      data: {
        propertyId: unit.propertyId, unitId: unit.id, residentId: residents[ownerName]?.id ?? null,
        plate, make, model, colour, type, parkingBay: bay, permitNo: `KH-${plate.replace(/\s/g, "")}`,
      },
    });
  }

  // ---- Visitors, invitations, visits --------------------------------------
  const visitorPlan = [
    ["Mercy Wangui", "+254 733 111 222", "FAMILY_FRIEND", null],
    ["Glovo Rider #4821", "+254 733 222 333", "DELIVERY", "Glovo"],
    ["Kevin (Plumber)", "+254 733 333 444", "CONTRACTOR", "Nairobi Plumbing Ltd"],
    ["Mary Njoki", "+254 733 444 555", "DOMESTIC_WORKER", null],
    ["Samuel (Driver)", "+254 733 555 666", "DRIVER", null],
  ];
  const visitors = {};
  for (const [fullName, phone, type, company] of visitorPlan) {
    visitors[fullName] = await prisma.visitor.create({
      data: { propertyId: kilimani.id, fullName, phone, type, company, idType: "National ID", idNumber: String(20000000 + randomInt(9999999)) },
    });
  }

  const invitationPlan = [
    ["A-204", "Faith Achieng", "Mercy Wangui", "FAMILY_FRIEND", "Sunday lunch", hours(-2), hours(6), false, 1, "APPROVED"],
    ["A-101", "Daniel Mwangi", "Glovo Rider #4821", "DELIVERY", "Food delivery", hours(-1), hours(1), false, 1, "APPROVED"],
    ["A-305", "Brian Otieno", "Kevin (Plumber)", "CONTRACTOR", "Bathroom repair", hours(1), days(3), true, 6, "APPROVED"],
    ["B-101", "Grace Wanjiru", "Mary Njoki", "DOMESTIC_WORKER", "Weekday help", days(-2), days(28), true, 40, "APPROVED"],
    ["A-204", "Faith Achieng", "Samuel (Driver)", "DRIVER", "School run", hours(3), days(30), true, 60, "PENDING"],
    ["B-202", "Samuel Kiptoo", "Unnamed guest", "FAMILY_FRIEND", "Evening visit", hours(4), hours(10), false, 1, "PENDING"],
  ];
  const invitations = [];
  for (const [unitName, host, visitorName, visitorType, purpose, validFrom, validTo, recurring, maxUses, status] of invitationPlan) {
    const unit = units[unitName];
    invitations.push(
      await prisma.visitorInvitation.create({
        data: {
          propertyId: unit.propertyId, unitId: unit.id,
          residentId: residents[host]?.id ?? null,
          visitorId: visitors[visitorName]?.id ?? null,
          visitorName, visitorType, purpose, validFrom, validTo, recurring, maxUses,
          passCode: passCode(), qrToken: qrToken(), status,
          createdById: manager.id,
          ...(status === "APPROVED" ? { approvedById: securityManager.id, approvedAt: hours(-3) } : {}),
        },
      }),
    );
  }

  // Two visitors currently on site, one already departed.
  const onSite = [
    [invitations[0], "Mercy Wangui", hours(-1.5), null],
    [invitations[3], "Mary Njoki", hours(-5), null],
    [invitations[1], "Glovo Rider #4821", hours(-0.6), hours(-0.4)],
  ];
  for (const [invitation, visitorName, checkInAt, checkOutAt] of onSite) {
    await prisma.visitorVisit.create({
      data: {
        propertyId: invitation.propertyId, unitId: invitation.unitId, invitationId: invitation.id,
        visitorId: invitation.visitorId, visitorName, visitorType: invitation.visitorType,
        gateId: mainGate.id, badgeNo: `V-${randomInt(100, 999)}`,
        checkInAt, checkInById: john.id,
        ...(checkOutAt ? { checkOutAt, checkOutById: john.id, status: "CHECKED_OUT" } : { status: "ON_SITE" }),
      },
    });
    await prisma.visitorInvitation.update({ where: { id: invitation.id }, data: { useCount: { increment: 1 } } });
  }

  // ---- Access events ------------------------------------------------------
  const eventPlan = [
    ["QR", "GRANTED", "visitor", "Mercy Wangui", "IN", mainGate.id, hours(-1.5), null],
    ["CARD", "GRANTED", "resident", "Daniel Mwangi", "IN", parkingGate.id, hours(-3), null],
    ["CARD", "DENIED", "resident", "Peter Achieng", "IN", mainGate.id, hours(-5), "Card suspended — Card reported lost by resident"],
    ["QR", "DENIED", "visitor", "Unknown pass", "IN", mainGate.id, hours(-7), "Pass not recognised at this property."],
    ["CARD", "GRANTED", "resident", "Grace Wanjiru", "OUT", mainGate.id, hours(-9), null],
    ["QR", "GRANTED", "visitor", "Mary Njoki", "IN", serviceGate.id, hours(-5), null],
    ["MANUAL", "GRANTED", "visitor", "Glovo Rider #4821", "OUT", mainGate.id, hours(-0.4), null],
    ["CARD", "DENIED", "resident", "Peter Achieng", "IN", parkingGate.id, hours(-2), "Card suspended — Card reported lost by resident"],
  ];
  for (const [method, result, subjectType, subjectName, direction, gateId, at, reason] of eventPlan) {
    await prisma.accessEvent.create({
      data: { propertyId: kilimani.id, gateId, direction, method, result, subjectType, subjectName, reason, recordedById: john.id, at },
    });
  }

  // ---- Incidents & alerts -------------------------------------------------
  await prisma.securityIncident.create({
    data: {
      propertyId: kilimani.id, buildingId: blockA.id, unitId: units["A-204"].id,
      reference: "INC-4F2A19", category: "access", severity: "MEDIUM",
      title: "Lost access card reported",
      description: "Resident of A-204 reported a family access card missing after a matatu journey. Card A204-02 suspended pending replacement.",
      location: "Main Gate", occurredAt: hours(-6),
      reportedById: john.id, reportedByName: "John Mutiso", status: "INVESTIGATING",
    },
  });
  await prisma.securityIncident.create({
    data: {
      propertyId: kilimani.id, buildingId: blockB.id,
      reference: "INC-7B31C0", category: "trespass", severity: "HIGH",
      title: "Unauthorised entry attempt at service gate",
      description: "Individual attempted to follow a delivery rider through the service entrance at 21:40. Turned away; description circulated to the night shift.",
      location: "Service Entrance", occurredAt: hours(-30),
      reportedById: guard2.id, reportedByName: "Peter Wafula", status: "OPEN",
    },
  });
  await prisma.securityIncident.create({
    data: {
      propertyId: kilimani.id,
      reference: "INC-2D9E44", category: "parking", severity: "LOW",
      title: "Vehicle parked in reserved bay",
      description: "Visitor vehicle occupied bay B-14 for two hours. Owner contacted and vehicle moved.",
      location: "Basement Parking", occurredAt: days(-4),
      reportedById: guard2.id, reportedByName: "Peter Wafula", status: "RESOLVED",
      resolvedAt: days(-4), resolvedById: securityManager.id,
      resolutionNotes: "Vehicle moved; visitor briefed on bay allocation.",
    },
  });
  await prisma.emergencyAlert.create({
    data: {
      propertyId: kilimani.id, type: "FIRE", message: "Smoke detector triggered on Block A, floor 3 — investigating",
      location: "Block A, 3rd floor", raisedById: john.id, raisedByName: "John Mutiso",
      status: "ACKNOWLEDGED", acknowledgedById: securityManager.id, acknowledgedAt: hours(-0.8), createdAt: hours(-1),
    },
  });

  // ---- Maintenance, payments, expenses ------------------------------------
  const maintenancePlan = [
    ["A-204", "Leaking kitchen tap", "Cold tap drips continuously; washer likely worn.", "MEDIUM", "IN_PROGRESS", "Faith Achieng"],
    ["A-101", "Water heater not working", "No hot water since Tuesday evening.", "HIGH", "ASSIGNED", "Daniel Mwangi"],
    ["A-402", "Repaint before new tenant", "Full repaint and deep clean ahead of viewing.", "LOW", "OPEN", "Joseph Kamau"],
    ["B-101", "Lift alarm intermittent", "Alarm sounds without cause between floors 2 and 4.", "HIGH", "OPEN", "Grace Wanjiru"],
  ];
  for (const [unitName, title, description, priority, status, raisedByName] of maintenancePlan) {
    const unit = units[unitName];
    await prisma.maintenanceRequest.create({
      data: {
        propertyId: unit.propertyId, buildingId: unit.buildingId, unitId: unit.id,
        title, description, priority, status, raisedByName,
        assignedToId: status === "OPEN" ? null : maintenance.id,
        createdAt: days(-randomInt(1, 12)),
      },
    });
  }

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  for (const [unitName, residentName] of [["A-101", "Daniel Mwangi"], ["A-204", "Faith Achieng"], ["A-305", "Brian Otieno"], ["B-101", "Grace Wanjiru"], ["B-202", "Samuel Kiptoo"], ["S-01", "Zainab Ali"]]) {
    const unit = units[unitName];
    // Three months of rent: two settled, the current one in varying states.
    for (let m = 2; m >= 0; m--) {
      const dueDate = new Date(monthStart);
      dueDate.setMonth(dueDate.getMonth() - m);
      const settled = m > 0 || randomInt(3) > 0;
      await prisma.payment.create({
        data: {
          propertyId: unit.propertyId, unitId: unit.id, residentId: residents[residentName]?.id ?? null,
          kind: "RENT", amount: unit.rentAmount ?? 50000, dueDate,
          status: settled ? "PAID" : (m === 0 && randomInt(2) ? "DUE" : "OVERDUE"),
          paidAt: settled ? new Date(dueDate.getTime() + randomInt(4) * 86400000) : null,
          reference: `RNT-${unitName}-${dueDate.getMonth() + 1}`,
        },
      });
    }
  }

  const expensePlan = [
    [kilimani.id, "security", "Guard services — monthly contract", 180000],
    [kilimani.id, "utilities", "Common area water and electricity", 96000],
    [kilimani.id, "maintenance", "Lift servicing", 45000],
    [kilimani.id, "cleaning", "Common area cleaning", 38000],
    [nyali.id, "security", "Guard services — monthly contract", 120000],
    [nyali.id, "utilities", "Borehole pump and grounds", 54000],
  ];
  for (const [propertyId, category, description, amount] of expensePlan) {
    await prisma.expense.create({
      data: { propertyId, category, description, amount, incurredAt: new Date(monthStart.getTime() + randomInt(20) * 86400000), recordedById: accountant.id },
    });
  }

  // ---- Campaigns & discounts ---------------------------------------------
  const hajjCampaign = await prisma.campaign.create({
    data: {
      orgId: org.id,
      name: "Hajj & Umrah season",
      description: "Group rates for pilgrimage parties travelling together.",
      bannerText: "Travelling as a group for Hajj or Umrah? Rates drop from 8 travellers.",
      status: "LIVE",
      startsAt: days(-14),
      endsAt: days(120),
      publishedAt: days(-14),
      createdById: manager.id,
    },
  });
  const longWeekend = await prisma.campaign.create({
    data: {
      orgId: org.id,
      name: "Coast long weekends",
      description: "Three nights or more at the coast.",
      bannerText: "Stay three nights at the coast and the third is discounted.",
      status: "DRAFT",
      startsAt: days(7),
      endsAt: days(90),
      createdById: manager.id,
    },
  });

  const discountPlan = [
    [hajjCampaign.id, "Group of 8 or more", "GROUP", "PERCENTAGE", 12, { minGuests: 8 }, days(-14), days(120)],
    [hajjCampaign.id, "Group of 20 or more", "GROUP", "PERCENTAGE", 18, { minGuests: 20 }, days(-14), days(120)],
    [hajjCampaign.id, "Book 60 days ahead", "EARLY_BIRD", "PERCENTAGE", 8, { minLeadDays: 60 }, days(-14), days(120)],
    [longWeekend.id, "Three nights or more", "LONG_STAY", "PERCENTAGE", 10, { minNights: 3 }, days(7), days(90)],
    [null, "Ramadan family rate", "SEASONAL", "FIXED", 15000, { minGuests: 4 }, days(-30), days(60)],
  ];
  for (const [campaignId, name, kind, valueType, value, thresholds, startsAt, endsAt] of discountPlan) {
    await prisma.discount.create({
      data: {
        orgId: org.id, campaignId, name, kind, valueType, value,
        currency: "KES", startsAt, endsAt, createdById: manager.id,
        minGuests: thresholds.minGuests ?? null,
        minUnits: thresholds.minUnits ?? null,
        minNights: thresholds.minNights ?? null,
        minLeadDays: thresholds.minLeadDays ?? null,
      },
    });
  }

  // ---- A group booking, mid-collection ------------------------------------
  // Twelve pilgrims, so the "8 or more" rule applies; four have paid, which is
  // what makes the split-payment progress meaningful on first sight.
  const gross = 1_680_000;
  const groupDiscount = await prisma.discount.findFirst({ where: { orgId: org.id, name: "Group of 8 or more" } });
  const off = Math.round((gross * groupDiscount.value) / 100);
  const payable = gross - off;
  const share = Math.floor(payable / 12);
  const remainder = payable - share * 12;

  const pilgrims = [
    "Amina Yusuf", "Ibrahim Yusuf", "Halima Noor", "Yusuf Abdi", "Zeinab Hassan", "Omar Farah",
    "Fatuma Ali", "Abdirahman Nur", "Sagal Warsame", "Mohamed Aden", "Ayan Jama", "Khadija Osman",
  ];
  await prisma.groupBooking.create({
    data: {
      orgId: org.id,
      reference: "GRP-7A21C4",
      name: "Yusuf family Umrah party",
      purpose: "UMRAH",
      destination: "Makkah & Madinah",
      organiserName: "Amina Yusuf",
      organiserEmail: "owner@paltas.co.ke",
      organiserPhone: "+254 700 000 001",
      checkIn: days(74),
      checkOut: days(88),
      unitsRequested: 4,
      guests: 12,
      totalAmount: gross,
      currency: "KES",
      discountId: groupDiscount.id,
      discountAmount: off,
      status: "COLLECTING",
      createdById: manager.id,
      members: {
        create: pilgrims.map((name, i) => ({
          name,
          shareAmount: share + (i < remainder ? 1 : 0),
          isOrganiser: i === 0,
          shareStatus: i < 4 ? "PAID" : "PENDING",
          paidAt: i < 4 ? days(-3 + i) : null,
          reference: i < 4 ? `MPESA-${1000 + i}` : null,
        })),
      },
    },
  });

  // ---- Fee schedule -------------------------------------------------------
  const categories = {};
  const categoryPlan = [
    ["RENT", "Rent", "INCOME", 0, "MONTHLY", "Monthly rent, per the lease."],
    ["SERVICE", "Service charge", "INCOME", 8500, "MONTHLY", "Common areas, grounds, lifts and refuse."],
    ["WATER", "Water", "INCOME", 2200, "MONTHLY", "Metered water and sewerage."],
    ["SECURITY", "Security levy", "INCOME", 3500, "MONTHLY", "Guarding contract, CCTV and gate systems."],
    ["PARKING", "Parking", "INCOME", 2000, "MONTHLY", "Reserved basement bay."],
    ["PENALTY", "Late payment penalty", "INCOME", 1500, "ONE_OFF", "Charged after the grace period."],
    ["DEPOSIT", "Security deposit", "INCOME", 0, "ONE_OFF", "Refundable on satisfactory exit."],
    ["PAYROLL", "Staff salaries", "EXPENSE", 0, "MONTHLY", "Guards, maintenance and management."],
    ["UTILITIES", "Common utilities", "EXPENSE", 0, "MONTHLY", "Common-area power and water."],
    ["REPAIRS", "Repairs & maintenance", "EXPENSE", 0, "ONE_OFF", "Reactive and planned works."],
  ];
  for (const [code, name, kind, defaultAmount, recurrence, description] of categoryPlan) {
    categories[code] = await prisma.feeCategory.create({
      data: {
        orgId: org.id, code, name, kind, recurrence, description,
        defaultAmount: defaultAmount || null, createdById: accountant.id,
      },
    });
  }

  // ---- Charges: this month's run, part collected --------------------------
  const occupied = await prisma.unit.findMany({
    where: { propertyId: kilimani.id, status: "OCCUPIED" },
    include: { residents: { where: { active: true, isPrimary: true }, take: 1 } },
  });
  const period = new Date();
  const periodLabel = period.toLocaleString("en-GB", { month: "long", year: "numeric" });
  let chargeSeq = 0;
  for (const unit of occupied) {
    for (const code of ["SERVICE", "WATER", "SECURITY"]) {
      const cat = categories[code];
      const charge = await prisma.charge.create({
        data: {
          orgId: org.id, propertyId: kilimani.id, unitId: unit.id,
          residentId: unit.residents[0]?.id ?? null,
          categoryId: cat.id,
          reference: `CHG-${String(++chargeSeq).padStart(5, "0")}`,
          description: cat.name, amount: cat.defaultAmount, currency: "KES",
          dueDate: new Date(period.getFullYear(), period.getMonth(), 5),
          periodLabel, createdById: accountant.id,
        },
      });
      // Roughly two thirds settled, so arrears are visible on first sight.
      if (chargeSeq % 3 !== 0) {
        await prisma.payment.create({
          data: {
            propertyId: kilimani.id, unitId: unit.id, residentId: unit.residents[0]?.id ?? null,
            chargeId: charge.id, kind: "SERVICE_CHARGE", amount: cat.defaultAmount,
            currency: "KES", dueDate: charge.dueDate, paidAt: days(-randomInt(1, 12)),
            status: "PAID", reference: `MPESA-${randomInt(100000, 999999)}`,
          },
        });
        await prisma.charge.update({ where: { id: charge.id }, data: { status: "PAID" } });
      }
    }
  }

  // ---- Payroll ------------------------------------------------------------
  const salaryPlan = [
    [manager, "Property Manager", 145000],
    [securityManager, "Security Manager", 120000],
    [john, "Security Guard", 42000],
    [guard2, "Security Guard", 42000],
    [maintenance, "Maintenance Technician", 55000],
    [accountant, "Accountant", 130000],
    [blockBSupervisor, "Block B Supervisor", 78000],
  ];
  for (const [user, jobTitle, gross] of salaryPlan) {
    await prisma.salaryProfile.create({
      data: {
        orgId: org.id, userId: user.id, propertyId: kilimani.id, jobTitle,
        grossMonthly: gross, currency: "KES",
        effectiveFrom: days(-200), bankReference: `KE-${randomInt(1000000, 9999999)}`,
        createdById: owner.id,
      },
    });
  }

  // A prepared run for last month, approved and paid. Deduction lines are the
  // organisation's own configuration, not a tax computation by PALTAS.
  const last = new Date(period.getFullYear(), period.getMonth() - 1, 1);
  const lastLabel = last.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const profiles = await prisma.salaryProfile.findMany({ where: { orgId: org.id, active: true }, include: { user: true } });
  const lines = [
    { label: "PAYE", percent: 20 },
    { label: "NSSF", amount: 1080 },
    { label: "SHIF", percent: 2.75 },
  ];
  let tg = 0, td = 0, tn = 0;
  const slips = profiles.map((p) => {
    const deductions = lines.map((l) => ({
      label: l.label,
      amount: l.amount ?? Math.round((p.grossMonthly * l.percent) / 100),
    }));
    const totalDeductions = deductions.reduce((a, d) => a + d.amount, 0);
    const net = p.grossMonthly - totalDeductions;
    tg += p.grossMonthly; td += totalDeductions; tn += net;
    return {
      userId: p.userId, staffName: p.user.name, jobTitle: p.jobTitle,
      gross: p.grossMonthly, deductions, totalDeductions, net,
      currency: "KES", bankReference: p.bankReference,
    };
  });
  await prisma.payRun.create({
    data: {
      orgId: org.id, propertyId: kilimani.id, periodLabel: lastLabel,
      periodStart: last, periodEnd: new Date(period.getFullYear(), period.getMonth(), 0),
      status: "PAID", totalGross: tg, totalDeductions: td, totalNet: tn,
      createdById: accountant.id, approvedById: owner.id,
      approvedAt: days(-8), paidAt: days(-6),
      payslips: { create: slips },
    },
  });

  // ---- Paltas Rewards -----------------------------------------------------
  const memberPlan = [
    ["amina.guest@example.com", "Amina Yusuf", [[420, 620_000, -300], "gold"]],
    ["james.odhiambo@example.com", "James Odhiambo", [[180, 210_000, 0], "silver"]],
    ["lucy.n@example.com", "Lucy Njeri", [[60, 48_000, 0], "bronze"]],
    ["omar.f@example.com", "Omar Farah", [[900, 1_640_000, -1200], "platinum"]],
  ];
  for (const [email, name, [[stays, spend, redeemed]]] of memberPlan) {
    const member = await prisma.loyaltyMember.create({
      data: { orgId: org.id, email, name, joinedAt: days(-randomInt(120, 700)) },
    });
    // Spread the qualifying spend over a handful of completed stays.
    const perStay = Math.floor(spend / 4);
    for (let i = 0; i < 4; i++) {
      await prisma.loyaltyEntry.create({
        data: {
          memberId: member.id, kind: "EARN",
          points: Math.floor((perStay / 100) * 3),
          qualifyingSpend: perStay,
          reason: "Completed stay",
          reference: `BK-${randomInt(10000, 99999)}`,
          at: days(-randomInt(20, 330)),
        },
      });
    }
    if (redeemed) {
      await prisma.loyaltyEntry.create({
        data: {
          memberId: member.id, kind: "REDEEM", points: redeemed,
          reason: `Redeemed against a booking — KES ${Math.abs(redeemed).toLocaleString()} off`,
          at: days(-randomInt(5, 60)),
        },
      });
    }
  }

  // ---- Marketplace listings ----------------------------------------------
  // One live, one still a draft, so the publish flow has both states on sight.
  const vacant = await prisma.unit.findFirst({ where: { propertyId: kilimani.id, status: "VACANT" } });
  await prisma.propertyListing.create({
    data: {
      orgId: org.id, propertyId: kilimani.id, unitId: vacant?.id ?? null,
      title: "Bright 1-bed in Kilimani, walk to Yaya",
      summary: "Quiet block, borehole water, backup power.",
      description:
        "A bright one-bedroom on the fourth floor of Block A, five minutes from Yaya Centre. "
        + "Borehole water and a backup generator mean neither rationing nor blackouts interrupt you. "
        + "Secure parking, 24-hour manned gate, and lifts serviced monthly.",
      kind: "RENT", status: "PUBLISHED", price: 48000, currency: "KES",
      maxGuests: 2, bedrooms: 1, bathrooms: 1,
      amenities: ["wifi", "parking", "backup power", "borehole water", "24h security"],
      images: ["/paltas-logo.png"],
      city: "Nairobi", country: "KE", location: "Dennis Pritt Road",
      hostName: "Amina Yusuf", hostKind: "Landlord",
      publishedAt: days(-9), publishedById: owner.id, createdById: manager.id,
    },
  });
  // A hotel, so the booking engine has real inventory to sell. Whole-property
  // stays sell once; a room type sells the same room many times over, and those
  // are the two cases the availability rules have to tell apart.
  const nyaliListing = await prisma.propertyListing.create({
    data: {
      orgId: org.id, propertyId: nyali.id,
      title: "Nyali Court Hotel — rooms and suites",
      summary: "Sea-facing rooms a short walk from Nyali beach.",
      description:
        "Nyali Court is a small hotel of twenty-eight rooms set back from the beach road, "
        + "with a pool, secure parking and breakfast included in every rate. Rooms face "
        + "either the garden or the sea; the suites have their own balconies.",
      kind: "STAY", status: "PUBLISHED", price: 9500, currency: "KES",
      maxGuests: 2, bedrooms: 1, bathrooms: 1,
      amenities: ["wifi", "pool", "breakfast", "parking", "air conditioning"],
      images: ["/paltas-logo.png"],
      city: "Mombasa", country: "KE", location: "Nyali Road",
      hostName: "Hassan Omar", hostKind: "Hotel",
      publishedAt: days(-20), publishedById: owner.id, createdById: manager.id,
    },
  });

  const gardenRoom = await prisma.hotelRoomType.create({
    data: {
      propertyId: nyali.id, listingId: nyaliListing.id,
      name: "Garden double", description: "A double room facing the courtyard garden.",
      rate: 9500, currency: "KES", totalRooms: 12, maxGuests: 2,
      beds: "1 double", amenities: ["wifi", "breakfast", "air conditioning"],
    },
  });
  await prisma.hotelRoomType.create({
    data: {
      propertyId: nyali.id, listingId: nyaliListing.id,
      name: "Sea-view suite", description: "A suite with a private balcony over the water.",
      rate: 18000, currency: "KES", totalRooms: 4, maxGuests: 4,
      beds: "1 king, 1 sofa bed", amenities: ["wifi", "breakfast", "air conditioning", "balcony", "sea view"],
    },
  });

  // The pool is resurfaced every year once the long rains end.
  await prisma.availabilityBlock.create({
    data: {
      propertyId: nyali.id, listingId: nyaliListing.id,
      from: days(120), to: days(127),
      reason: "Pool resurfacing — hotel closed", createdById: manager.id,
    },
  });

  // Enough real inventory that the marketplace does not look abandoned.
  //
  // A platform with three listings reads as broken rather than new, and the
  // discovery rows below the fold have nothing of their own to show. These are
  // spread across cities and price points so filtering by city, kind or budget
  // actually narrows something.
  await addMissingSampleListings(prisma, {
    orgId: org.id, ownerId: owner.id, createdById: manager.id,
  });

  // A property for sale, so /buy has genuine stock rather than an empty page.
  await prisma.propertyListing.create({
    data: {
      orgId: org.id, propertyId: kilimani.id,
      title: "Four-bedroom townhouse, Lavington",
      summary: "Corner plot, mature garden, off Ring Road.",
      description:
        "A four-bedroom townhouse on a quarter-acre corner plot in Lavington, with a mature "
        + "garden, borehole and staff quarters. Two blocks from Ring Road Kileleshwa and a "
        + "short drive to Yaya Centre. Title deed ready.",
      kind: "SALE", status: "PUBLISHED", price: 48_500_000, currency: "KES",
      maxGuests: 8, bedrooms: 4, bathrooms: 3,
      amenities: ["garden", "borehole", "parking", "staff quarters", "24h security"],
      images: ["/paltas-logo.png"],
      city: "Nairobi", country: "KE", location: "Lavington",
      hostName: "Amina Yusuf", hostKind: "Agent",
      publishedAt: days(-14), publishedById: owner.id, createdById: manager.id,
    },
  });

  // A sales pipeline, so the agent and developer portals have real work in them.
  const riverside = await prisma.project.create({
    data: {
      orgId: org.id, name: "Riverside Gardens", location: "Riverside Drive", city: "Nairobi",
      description: "Forty-eight apartments over six floors, with a rooftop garden and covered parking.",
      currency: "KES", status: "SELLING", completion: 62,
      expectedCompletionAt: days(300), createdById: owner.id,
    },
  });

  // Three floors' worth. Prices rise with the floor, as they do.
  const projectUnits = [];
  for (let floor = 1; floor <= 6; floor++) {
    for (const suffix of ["A", "B"]) {
      projectUnits.push({
        projectId: riverside.id,
        unitNo: `${floor}${suffix}`,
        type: suffix === "A" ? "2-bed" : "3-bed",
        floor,
        bedrooms: suffix === "A" ? 2 : 3,
        bathrooms: suffix === "A" ? 2 : 3,
        areaSqm: suffix === "A" ? 92 : 118,
        price: (suffix === "A" ? 11_500_000 : 15_200_000) + floor * 250_000,
      });
    }
  }
  await prisma.projectUnit.createMany({ data: projectUnits });

  // Some of it has sold, at figures that are not the asking price — which is
  // the normal case and the reason agreedPrice exists.
  const stock = await prisma.projectUnit.findMany({ where: { projectId: riverside.id }, orderBy: { unitNo: "asc" } });
  await prisma.projectUnit.update({
    where: { id: stock[0].id },
    data: { status: "SOLD", buyerName: "Grace Wanjiru", agreedPrice: stock[0].price - 300_000, soldAt: days(-40) },
  });
  await prisma.projectUnit.update({
    where: { id: stock[1].id },
    data: { status: "SOLD", buyerName: "Peter Kimani", agreedPrice: stock[1].price, soldAt: days(-22) },
  });
  await prisma.projectUnit.update({
    where: { id: stock[2].id },
    data: { status: "RESERVED", buyerName: "Aisha Mohamed", reservedAt: days(-5) },
  });

  const leadRows = [
    { name: "Grace Wanjiru", email: "grace.w@example.com", phone: "+254 722 111 222",
      interestedIn: "2-bed at Riverside", budget: 12_000_000, stage: "CLOSED",
      projectId: riverside.id, closedAt: days(-40), lastContactAt: days(-40) },
    { name: "Aisha Mohamed", email: "aisha.m@example.com", phone: "+254 733 444 555",
      interestedIn: "3-bed, high floor", budget: 16_000_000, stage: "RESERVED",
      projectId: riverside.id, lastContactAt: days(-5) },
    { name: "Tom Odhiambo", email: "tom.o@example.com", phone: "+254 711 666 777",
      interestedIn: "Kilimani 1-bed to rent", budget: 55_000, stage: "OFFER",
      propertyId: kilimani.id, lastContactAt: days(-2) },
    { name: "Nadia Hassan", email: "nadia.h@example.com", phone: "+254 700 888 999",
      interestedIn: "Anything near the beach", budget: 9_000_000, stage: "VIEWING",
      lastContactAt: days(-1) },
    { name: "Michael Otieno", phone: "+254 720 121 212",
      interestedIn: "2-bed, ready to move", budget: 13_500_000, stage: "CONTACTED",
      projectId: riverside.id, lastContactAt: days(-3) },
    { name: "Wanjiku Njoroge", email: "wanjiku@example.com",
      interestedIn: "Investment, 2 units", budget: 24_000_000, stage: "NEW" },
    { name: "Daniel Kiptoo", email: "dkiptoo@example.com", phone: "+254 799 000 111",
      interestedIn: "Penthouse", budget: 30_000_000, stage: "LOST",
      lostReason: "Bought elsewhere — we had nothing above the sixth floor.",
      projectId: riverside.id, closedAt: days(-15), lastContactAt: days(-15) },
  ];
  for (const l of leadRows) {
    await prisma.lead.create({
      data: { orgId: org.id, currency: "KES", source: "Website enquiry",
              assignedToId: manager.id, createdById: manager.id, ...l },
    });
  }

  const nadia = await prisma.lead.findFirst({ where: { orgId: org.id, name: "Nadia Hassan" } });
  const tom = await prisma.lead.findFirst({ where: { orgId: org.id, name: "Tom Odhiambo" } });
  await prisma.viewing.createMany({
    data: [
      { orgId: org.id, leadId: nadia?.id ?? null, clientName: "Nadia Hassan",
        scheduledAt: hours(30), durationMins: 45, status: "SCHEDULED",
        notes: "Wants to see the sea-facing side.", agentId: manager.id },
      { orgId: org.id, leadId: tom?.id ?? null, clientName: "Tom Odhiambo",
        propertyId: kilimani.id, scheduledAt: days(-2), durationMins: 30,
        status: "COMPLETED", outcome: "Liked it. Offered slightly under asking.", agentId: manager.id },
      { orgId: org.id, clientName: "Walk-in viewer", propertyId: kilimani.id,
        scheduledAt: days(-6), status: "NO_SHOW", agentId: manager.id },
    ],
  });

  // The rest of the trip. An airport transfer serves every property in the
  // city, so it hangs off the organisation; a mid-stay clean belongs to one
  // place, so it hangs off the property.
  await prisma.serviceOffering.createMany({
    data: [
      { orgId: org.id, kind: "AIRPORT_TRANSFER", name: "Airport pickup",
        description: "Met at arrivals with a name board. One car, up to three bags.",
        price: 3500, currency: "KES", pricing: "FLAT", noticeHours: 6,
        providerName: "Paltas Transfers", createdById: manager.id },
      { orgId: org.id, kind: "DRIVER", name: "Driver and car, per day",
        description: "English-speaking driver, 8 hours, fuel included.",
        price: 7500, currency: "KES", pricing: "PER_NIGHT", noticeHours: 24,
        providerName: "Paltas Transfers", createdById: manager.id },
      { orgId: org.id, propertyId: nyali.id, kind: "CLEANING", name: "Mid-stay clean",
        description: "Full clean and fresh linen, once during your stay.",
        price: 2200, currency: "KES", pricing: "FLAT", noticeHours: 12, createdById: manager.id },
      { orgId: org.id, propertyId: nyali.id, kind: "BREAKFAST", name: "Breakfast",
        description: "Served 7 to 10, per person per morning.",
        price: 900, currency: "KES", pricing: "PER_GUEST_NIGHT", createdById: manager.id },
      { orgId: org.id, propertyId: kilimani.id, kind: "CLEANING", name: "Weekly clean",
        price: 1800, currency: "KES", pricing: "FLAT", createdById: manager.id },
    ],
  });

  const demoGuest = await prisma.guest.create({
    data: {
      email: "guest@example.com", name: "Fatuma Njeri",
      passwordHash: await hashPassword(DEMO_PASSWORD), phone: "+254 722 000 111",
      country: "KE", locale: "en",
    },
  });

  const seedBooking = await prisma.booking.create({
    data: {
      reference: "PLT-SEED-0001",
      guestId: demoGuest.id, listingId: nyaliListing.id, propertyId: nyali.id,
      roomTypeId: gardenRoom.id,
      checkIn: days(14), checkOut: days(17), guests: 2, rooms: 1,
      nightlyRate: 9500, nights: 3, subtotal: 28500,
      serviceFee: 2280, taxes: 1539, total: 32319, currency: "KES",
      status: "CONFIRMED", idempotencyKey: "seed-booking-0001",
      confirmedAt: days(-1),
      events: {
        create: [
          { status: "PENDING", note: "Booking requested, awaiting payment.", actor: "guest", actorId: demoGuest.id },
          { status: "CONFIRMED", note: "Payment received.", actor: "system" },
        ],
      },
    },
  });

  /*
   * What that booking earned its host.
   *
   * In production this row is written by the Stripe webhook when the guest's
   * payment succeeds; the seed writes it directly because there is no webhook
   * to receive. Two of them, deliberately at different stages: one still held
   * because the stay has not happened, and one long finished and already paid,
   * so a payout statement has both halves to show and the tests have something
   * to check the arithmetic against.
   */
  const seedFeeBps = 800;
  const heldFee = Math.floor((seedBooking.total * seedFeeBps) / 10_000);
  await prisma.hostEarning.create({
    data: {
      orgId: org.id, bookingId: seedBooking.id,
      currency: seedBooking.currency, gross: seedBooking.total, platformFee: heldFee,
      checkOut: seedBooking.checkOut, status: "HELD",
    },
  });

  const pastBooking = await prisma.booking.create({
    data: {
      reference: "PLT-SEED-0002",
      guestId: demoGuest.id, listingId: nyaliListing.id, propertyId: nyali.id,
      roomTypeId: gardenRoom.id,
      checkIn: days(-24), checkOut: days(-21), guests: 2, rooms: 1,
      nightlyRate: 9500, nights: 3, subtotal: 28500,
      serviceFee: 2280, taxes: 1539, total: 32319, currency: "KES",
      status: "COMPLETED", idempotencyKey: "seed-booking-0002",
      confirmedAt: days(-30),
    },
  });
  const paidFee = Math.floor((pastBooking.total * seedFeeBps) / 10_000);
  const seedPayout = await prisma.payout.create({
    data: {
      orgId: org.id, currency: pastBooking.currency,
      amount: pastBooking.total - paidFee,
      status: "SENT", sentAt: days(-20),
      idempotencyKey: "payout_seed_0002",
      stripeTransferId: "tr_seed_0002",
    },
  });
  await prisma.hostEarning.create({
    data: {
      orgId: org.id, bookingId: pastBooking.id,
      currency: pastBooking.currency, gross: pastBooking.total, platformFee: paidFee,
      checkOut: pastBooking.checkOut, status: "PAID",
      paidAt: days(-20), payoutId: seedPayout.id,
    },
  });

  await prisma.propertyListing.create({
    data: {
      orgId: tenant2.id, propertyId: coastal.id,
      title: "Diani Palms — beachfront two-bed",
      summary: "Two minutes from the sand.",
      description: "A two-bedroom apartment in the Palm Wing, a short walk from Diani beach.",
      kind: "STAY", status: "DRAFT", price: 14500, currency: "KES",
      maxGuests: 4, bedrooms: 2, bathrooms: 2,
      amenities: ["wifi", "pool", "beach access"], images: [],
      city: "Kwale", country: "KE", location: "Diani Beach Road",
      hostName: "Salim Bakari", hostKind: "Landlord", createdById: owner2.id,
    },
  });

  // ---- Audit trail --------------------------------------------------------
  // A handful of entries so the trail is not empty on first sight, including the
  // card suspension the brief uses as its worked example.
  const auditPlan = [
    [john, "Security Guard", "card.suspend", "card.suspend", "AccessCard", cards["A204-02"].id, units["A-204"].id,
      "Suspended access card A204-02 · Block A A-204 — Card reported lost by resident",
      { status: "ACTIVE", suspendReason: null }, { status: "SUSPENDED", suspendReason: "Card reported lost by resident" }, hours(-6)],
    [john, "Security Guard", "visitor.checkin", "visitor.checkin", "VisitorVisit", null, units["A-204"].id,
      "Checked in Mercy Wangui", null, { checkInAt: hours(-1.5) }, hours(-1.5)],
    [securityManager, "Security Manager", "security.incident.create", "security.incident.create", "SecurityIncident", null, null,
      "Reported high incident INC-7B31C0: Unauthorised entry attempt at service gate", null, { severity: "HIGH" }, hours(-30)],
    [owner, "Property Owner", "staff.create", "staff.create", "User", john.id, null,
      "Created staff account for John Mutiso (Security Guard)", null,
      { name: "John Mutiso", roles: ["security_guard@property"], permissions: ["ALLOW resident.view", "DENY finance.view"] }, days(-30)],
    [owner, "Property Owner", "staff.permissions.manage", "staff.permissions.manage", "User", john.id, null,
      "Changed John Mutiso's access — 2 added, 0 removed", { permissions: ["ALLOW resident.view"] },
      { permissions: ["ALLOW resident.view", "ALLOW visitor.approve", "DENY finance.view"] }, days(-12)],
    [manager, "Property Manager", "resident.create", "resident.create", "Resident", null, units["B-101"].id,
      "Added resident Grace Wanjiru", null, { fullName: "Grace Wanjiru", type: "TENANT" }, days(-60)],
  ];
  for (const [actor, actorRole, action, permission, entityType, entityId, unitId, summary, before, after, at] of auditPlan) {
    await prisma.auditLog.create({
      data: {
        orgId: org.id, actorId: actor.id, actorName: actor.name, actorRole,
        action, permission, entityType, entityId, propertyId: kilimani.id, unitId,
        summary, before, after, at, ip: "197.232.14.8",
      },
    });
  }

  console.log(`
Seed complete.

  Password : ${DEMO_PASSWORD}   (every account below)

  PLATFORM — Paltas staff, authority across every organisation
  admin@paltas.com            Paltas Admin    Platform Administrator — all tenants

  TENANT 1 — ${org.name}

  owner@paltas.co.ke          Amina Yusuf     Property Owner       — everything
  joseph.kamau@paltas.co.ke   Joseph Kamau    Property Manager     — Kilimani Heights only
  mercy.njeri@paltas.co.ke    Mercy Njeri     Security Manager     — Kilimani Heights only
  john.mutiso@paltas.co.ke    John Mutiso     Security Guard       — Kilimani, custom permissions
  peter.wafula@paltas.co.ke   Peter Wafula    Security Guard       — Kilimani, role defaults
  alice.nduta@paltas.co.ke    Alice Nduta     Maintenance          — Kilimani only
  david.omondi@paltas.co.ke   David Omondi    Accountant           — whole organisation, finance only
  ruth.chebet@paltas.co.ke    Ruth Chebet     Block B Supervisor   — Block B only
  hassan.omar@paltas.co.ke    Hassan Omar     Property Manager     — Nyali Court only

  TENANT 2 — ${tenant2.name}
  owner@coastalliving.co.ke   Salim Bakari    Property Owner       — Diani Palms only

  Sign in as Joseph and Hassan in turn to see data isolation within a tenant.
  Sign in as Amina then Salim to see isolation *between* tenants — neither can
  see one row of the other's organisation. Then sign in as admin@paltas.com and
  see all three properties across both.
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
