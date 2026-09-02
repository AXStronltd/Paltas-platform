import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByProperty, whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Security reporting over a window — defaults to the last 30 days.
 *
 * Grouped counts rather than raw rows: the question this answers is "what has
 * the shape of our security activity been", and pulling 40,000 access events to
 * the browser to answer it would be the wrong way round.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const from = url.searchParams.get("from")
      ? new Date(url.searchParams.get("from")!)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = url.searchParams.get("to") ? new Date(url.searchParams.get("to")!) : new Date();

    const g = await guardList(PERMISSIONS.SECURITY_REPORT_VIEW);
    if (!g.ok) return g.response;

    const byProperty = whereByProperty(g.access);
    const byUnit = whereByPropertyOrUnit(g.access);
    const pin = propertyId ? { propertyId } : {};
    const window = { gte: from, lte: to };

    const [visitsByType, incidentsBySeverity, incidentsByCategory, accessByResult, cardsByStatus, totalVisits, avgStayRows] =
      await Promise.all([
        prisma.visitorVisit.groupBy({
          by: ["visitorType"],
          where: { ...byUnit, ...pin, checkInAt: window },
          _count: { _all: true },
        }),
        prisma.securityIncident.groupBy({
          by: ["severity"],
          where: { ...byUnit, ...pin, occurredAt: window },
          _count: { _all: true },
        }),
        prisma.securityIncident.groupBy({
          by: ["category"],
          where: { ...byUnit, ...pin, occurredAt: window },
          _count: { _all: true },
        }),
        prisma.accessEvent.groupBy({
          by: ["result", "method"],
          where: { ...byUnit, ...pin, at: window },
          _count: { _all: true },
        }),
        prisma.accessCard.groupBy({
          by: ["status"],
          where: { ...byUnit, ...pin },
          _count: { _all: true },
        }),
        prisma.visitorVisit.count({ where: { ...byUnit, ...pin, checkInAt: window } }),
        prisma.visitorVisit.findMany({
          where: { ...byUnit, ...pin, checkInAt: window, checkOutAt: { not: null } },
          select: { checkInAt: true, checkOutAt: true },
          take: 2000,
        }),
      ]);

    const stays = avgStayRows
      .map((v) => (v.checkOutAt!.getTime() - v.checkInAt.getTime()) / 60000)
      .filter((m) => m >= 0);
    const averageStayMinutes = stays.length ? Math.round(stays.reduce((a, b) => a + b, 0) / stays.length) : null;

    const guardsOnRoster = await prisma.guard.count({ where: { ...byProperty, ...pin, active: true } });

    return ok({
      window: { from, to },
      totals: { visits: totalVisits, averageStayMinutes, guardsOnRoster },
      visitsByType: visitsByType.map((r) => ({ type: r.visitorType, count: r._count._all })),
      incidentsBySeverity: incidentsBySeverity.map((r) => ({ severity: r.severity, count: r._count._all })),
      incidentsByCategory: incidentsByCategory.map((r) => ({ category: r.category, count: r._count._all })),
      accessByResult: accessByResult.map((r) => ({ result: r.result, method: r.method, count: r._count._all })),
      cardsByStatus: cardsByStatus.map((r) => ({ status: r.status, count: r._count._all })),
    });
  });
}
