import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByProperty, whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * The security dashboard.
 *
 * Every count below is narrowed by the same scope filter the list endpoints use,
 * so a Security Manager covering one property sees the numbers for that property
 * and nobody has to remember to pass a property id to make that true.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const propertyId = new URL(req.url).searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.SECURITY_DASHBOARD_VIEW);
    if (!g.ok) return g.response;

    const byProperty = whereByProperty(g.access);
    const byUnit = whereByPropertyOrUnit(g.access);
    const pin = propertyId ? { propertyId } : {};
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);

    const [
      onSite, expectedToday, pendingApprovals, activeAlerts,
      openIncidents, guardsOnShift, suspendedCards, deniedToday,
      checkedInToday, recentEvents,
    ] = await Promise.all([
      prisma.visitorVisit.count({ where: { ...byUnit, ...pin, status: "ON_SITE" } }),
      prisma.visitorInvitation.count({
        where: { ...byUnit, ...pin, status: "APPROVED", validFrom: { lte: new Date() }, validTo: { gte: new Date() } },
      }),
      prisma.visitorInvitation.count({ where: { ...byUnit, ...pin, status: "PENDING" } }),
      prisma.emergencyAlert.count({ where: { ...byProperty, ...pin, status: { in: ["ACTIVE", "ACKNOWLEDGED"] } } }),
      prisma.securityIncident.count({ where: { ...byUnit, ...pin, status: { in: ["OPEN", "INVESTIGATING"] } } }),
      prisma.guardShift.count({ where: { ...byProperty, ...pin, status: "ACTIVE" } }),
      prisma.accessCard.count({ where: { ...byUnit, ...pin, status: "SUSPENDED" } }),
      prisma.accessEvent.count({ where: { ...byUnit, ...pin, result: "DENIED", at: { gte: since24h } } }),
      prisma.visitorVisit.count({ where: { ...byUnit, ...pin, checkInAt: { gte: dayStart } } }),
      prisma.accessEvent.findMany({
        where: { ...byUnit, ...pin },
        orderBy: { at: "desc" },
        take: 12,
        include: { gate: { select: { name: true } } },
      }),
    ]);

    return ok({
      counts: {
        onSite,
        expectedToday,
        pendingApprovals,
        activeAlerts,
        openIncidents,
        guardsOnShift,
        suspendedCards,
        deniedLast24h: deniedToday,
        checkedInToday,
      },
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        at: e.at,
        direction: e.direction,
        method: e.method,
        result: e.result,
        subjectName: e.subjectName,
        gateName: e.gate?.name ?? null,
        reason: e.reason,
      })),
    });
  });
}
