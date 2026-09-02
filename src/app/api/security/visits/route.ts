import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { VisitStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Arrivals. Defaults to who is on site right now — the gate's first question. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = (url.searchParams.get("status") as VisitStatus | null) ?? "ON_SITE";
    const propertyId = url.searchParams.get("propertyId");
    const limit = Math.min(200, Number(url.searchParams.get("limit") ?? 100) || 100);

    const g = await guardList(PERMISSIONS.VISITOR_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const visits = await prisma.visitorVisit.findMany({
      where: {
        ...scoped,
        ...(url.searchParams.get("status") === "ALL" ? {} : { status }),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { checkInAt: "desc" },
      take: limit,
      include: {
        unit: { select: { id: true, name: true, building: { select: { name: true } } } },
        gate: { select: { id: true, name: true } },
      },
    });

    return ok({
      visits: visits.map((v) => ({
        id: v.id,
        propertyId: v.propertyId,
        visitorName: v.visitorName,
        visitorPhone: v.visitorPhone,
        visitorType: v.visitorType,
        unitId: v.unitId,
        unitName: v.unit ? `${v.unit.building.name} · ${v.unit.name}` : null,
        gateName: v.gate?.name ?? null,
        badgeNo: v.badgeNo,
        vehiclePlate: v.vehiclePlate,
        checkInAt: v.checkInAt,
        checkOutAt: v.checkOutAt,
        status: v.status,
        notes: v.notes,
      })),
    });
  });
}
