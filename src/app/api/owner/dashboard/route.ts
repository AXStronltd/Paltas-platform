import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByProperty, whereByPropertyOrUnit, whereForBuildingTable, whereForUnitTable, wherePropertyTable } from "@/server/scope";
import { canAnywhere } from "@/lib/security/authorize";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * The master dashboard: the whole operation on one screen.
 *
 * Written as one endpoint rather than a dozen, because the owner's question is a
 * single question — how is the portfolio doing — and answering it with fourteen
 * round trips would make the screen feel assembled rather than known.
 *
 * The financial block is omitted rather than zeroed for a viewer without finance
 * permission, and the response says so, so an administrator borrowing this screen
 * sees an honest gap instead of a wrong number.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardList(PERMISSIONS.OWNER_DASHBOARD_VIEW);
    if (!g.ok) return g.response;

    // One scope object, expressed for each table's own shape. A platform
    // administrator gets an unrestricted clause here and sees every tenant.
    const byProperty = whereByProperty(g.access);
    const byUnit = whereByPropertyOrUnit(g.access, { building: true });
    const propertyWhere = wherePropertyTable(g.access);
    const staffWhere = g.access.kind === "platform"
      ? { isOwner: false, isPlatformAdmin: false, org: { isPlatform: false } }
      : { orgId: g.actor.orgId, isOwner: false };

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const showFinance = canAnywhere(g.actor, PERMISSIONS.FINANCE_VIEW);

    const [
      properties, buildings, units, occupiedUnits, residents, staff,
      openMaintenance, onSiteVisitors, vehicles, openIncidents, activeAlerts,
      guards, visitsToday, deniedLast24h,
    ] = await Promise.all([
      prisma.property.count({ where: propertyWhere }),
      prisma.building.count({ where: whereForBuildingTable(g.access) }),
      prisma.unit.count({ where: whereForUnitTable(g.access) }),
      prisma.unit.count({ where: { AND: [whereForUnitTable(g.access), { status: "OCCUPIED" as const }] } }),
      prisma.resident.count({ where: { AND: [byUnit, { active: true as const }] } }),
      prisma.user.count({ where: staffWhere }),
      prisma.maintenanceRequest.count({ where: { AND: [byUnit, { status: { in: ["OPEN", "ASSIGNED", "IN_PROGRESS"] as const } }] } }),
      prisma.visitorVisit.count({ where: { AND: [byUnit, { status: "ON_SITE" as const }] } }),
      prisma.vehicle.count({ where: { AND: [byUnit, { active: true as const }] } }),
      prisma.securityIncident.count({ where: { AND: [byUnit, { status: { in: ["OPEN", "INVESTIGATING"] as const } }] } }),
      prisma.emergencyAlert.count({ where: { AND: [byProperty, { status: { in: ["ACTIVE", "ACKNOWLEDGED"] as const } }] } }),
      prisma.guard.count({ where: { AND: [byUnit, { active: true as const }] } }),
      prisma.visitorVisit.count({ where: { AND: [byUnit, { checkInAt: { gte: since24h } }] } }),
      prisma.accessEvent.count({ where: { AND: [byUnit, { result: "DENIED" as const, at: { gte: since24h } }] } }),
    ]);

    let finance: Record<string, number> | null = null;
    if (showFinance) {
      const [collected, outstanding, expenses] = await Promise.all([
        prisma.payment.aggregate({ where: { AND: [byUnit, { status: "PAID" as const, paidAt: { gte: monthStart } }] }, _sum: { amount: true } }),
        prisma.payment.aggregate({ where: { AND: [byUnit, { status: { in: ["DUE", "OVERDUE"] as const } }] }, _sum: { amount: true } }),
        prisma.expense.aggregate({ where: { AND: [byProperty, { incurredAt: { gte: monthStart } }] }, _sum: { amount: true } }),
      ]);
      const revenue = collected._sum.amount ?? 0;
      const spend = expenses._sum.amount ?? 0;
      finance = {
        revenueThisMonth: revenue,
        expensesThisMonth: spend,
        netThisMonth: revenue - spend,
        outstanding: outstanding._sum.amount ?? 0,
      };
    }

    // The per-property row the owner drills into.
    const perProperty = await prisma.property.findMany({
      where: propertyWhere,
      orderBy: { name: "asc" },
      select: {
        id: true, name: true, city: true,
        _count: { select: { buildings: true, units: true, residents: true } },
      },
    });
    const occupiedByProperty = await prisma.unit.groupBy({
      by: ["propertyId"],
      where: { AND: [whereForUnitTable(g.access), { status: "OCCUPIED" as const }] },
      _count: { _all: true },
    });
    const incidentsByProperty = await prisma.securityIncident.groupBy({
      by: ["propertyId"],
      where: { AND: [byUnit, { status: { in: ["OPEN", "INVESTIGATING"] as const } }] },
      _count: { _all: true },
    });
    const onSiteByProperty = await prisma.visitorVisit.groupBy({
      by: ["propertyId"],
      where: { AND: [byUnit, { status: "ON_SITE" as const }] },
      _count: { _all: true },
    });

    return ok({
      portfolio: {
        properties, buildings, units, occupiedUnits,
        occupancyRate: units ? Math.round((occupiedUnits / units) * 100) : 0,
        residents, staff,
      },
      operations: { openMaintenance },
      security: {
        onSiteVisitors, vehicles, openIncidents, activeAlerts, guards,
        visitsLast24h: visitsToday, deniedLast24h,
      },
      finance,
      financeVisible: showFinance,
      properties: perProperty.map((p) => ({
        id: p.id,
        name: p.name,
        city: p.city,
        buildings: p._count.buildings,
        units: p._count.units,
        residents: p._count.residents,
        occupiedUnits: occupiedByProperty.find((o) => o.propertyId === p.id)?._count._all ?? 0,
        openIncidents: incidentsByProperty.find((o) => o.propertyId === p.id)?._count._all ?? 0,
        onSiteVisitors: onSiteByProperty.find((o) => o.propertyId === p.id)?._count._all ?? 0,
      })),
    });
  });
}
