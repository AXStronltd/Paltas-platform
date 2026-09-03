import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardPlatform, handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Operations: the whole platform on one screen.
 *
 * Paltas staff only, and behind `guardPlatform` rather than a permission —
 * being Paltas is a property of the account, not a grant, so no permission edit
 * inside a customer organisation can reach this.
 *
 * Everything here crosses organisation boundaries on purpose, which makes it
 * the single most sensitive endpoint on the platform. Two consequences follow:
 *
 *   It returns counts and aggregates, not records. Operations needs to know
 *   that a tenant has 40 open maintenance requests, not to read them. Anyone
 *   who needs the detail can open that organisation, where the ordinary scoped
 *   endpoints apply and the access is logged against the row.
 *
 *   No personal data. No resident names, no guest emails, no agent phone
 *   numbers. An operations dashboard is looked at all day on shared screens.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardPlatform("platform.overview");
    if (!g.ok) return g.response;

    const [
      orgs, properties, buildings, units, residents, staff,
      bookings, listings, external, incidents, alerts, maintenance,
      charges, leads, projects, recentAudit,
    ] = await Promise.all([
      prisma.organization.findMany({
        where: { isPlatform: false },
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, country: true, currency: true, createdAt: true,
          stripeOnboarded: true,
          _count: { select: { properties: true, users: true } },
        },
      }),
      prisma.property.count(),
      prisma.building.count(),
      prisma.unit.count(),
      prisma.resident.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.booking.groupBy({ by: ["status"], _count: true, _sum: { total: true } }),
      prisma.propertyListing.groupBy({ by: ["status"], _count: true }),
      prisma.externalListing.groupBy({ by: ["displayable"], _count: true }),
      prisma.securityIncident.count({ where: { status: { not: "CLOSED" } } }),
      prisma.emergencyAlert.count({ where: { resolvedAt: null } }),
      prisma.maintenanceRequest.count({ where: { status: { notIn: ["RESOLVED", "CLOSED"] } } }),
      prisma.charge.aggregate({ where: { status: { in: ["ISSUED", "PART_PAID", "OVERDUE"] } }, _sum: { amount: true }, _count: true }),
      prisma.lead.count({ where: { stage: { notIn: ["CLOSED", "LOST"] } } }),
      prisma.project.count(),
      // Activity, not content: how much is happening, and what kind.
      prisma.auditLog.groupBy({
        by: ["action"],
        _count: true,
        where: { at: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        orderBy: { _count: { action: "desc" } },
        take: 8,
      }),
    ]);

    const bookingsByStatus = Object.fromEntries(bookings.map((b) => [b.status, b._count]));
    // Cancelled and refunded bookings are excluded: counting them as revenue
    // would flatter the only number on this page anyone quotes.
    const bookedRevenue = bookings
      .filter((b) => b.status !== "CANCELLED" && b.status !== "REFUNDED")
      .reduce((t, b) => t + (b._sum.total ?? 0), 0);

    return ok({
      organisations: orgs.map((o) => ({
        id: o.id, name: o.name, country: o.country, currency: o.currency,
        properties: o._count.properties, users: o._count.users,
        stripeOnboarded: o.stripeOnboarded, createdAt: o.createdAt,
      })),
      portfolio: { organisations: orgs.length, properties, buildings, units, residents, staff },
      bookings: {
        total: bookings.reduce((t, b) => t + b._count, 0),
        byStatus: bookingsByStatus,
        /** Mixed currencies are summed as-is; see the note in the UI. */
        bookedRevenue,
      },
      marketplace: {
        listings: Object.fromEntries(listings.map((l) => [l.status, l._count])),
        external: {
          total: external.reduce((t, e) => t + e._count, 0),
          publishable: external.find((e) => e.displayable)?._count ?? 0,
        },
      },
      operations: {
        openIncidents: incidents,
        activeAlerts: alerts,
        openMaintenance: maintenance,
        outstandingCharges: { count: charges._count, amount: charges._sum?.amount ?? 0 },
        openLeads: leads,
        projects,
      },
      activity24h: recentAudit.map((a) => ({ action: a.action, count: a._count })),
      generatedAt: new Date(),
    });
  });
}
