import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { AccessResult } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Access history: every entry and exit, granted or refused.
 *
 * Denials are the interesting rows — a run of refused scans at one gate is the
 * signal this table exists to surface — so they are filterable in their own right.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const result = url.searchParams.get("result") as AccessResult | null;
    const since = url.searchParams.get("since") ? new Date(url.searchParams.get("since")!) : null;
    const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 100) || 100);

    const g = await guardList(PERMISSIONS.SECURITY_ACCESS_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const events = await prisma.accessEvent.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
        ...(result ? { result } : {}),
        ...(since && !Number.isNaN(since.getTime()) ? { at: { gte: since } } : {}),
      },
      orderBy: { at: "desc" },
      take: limit,
      include: {
        gate: { select: { name: true } },
        unit: { select: { name: true, building: { select: { name: true } } } },
      },
    });

    return ok({
      events: events.map((e) => ({
        id: e.id,
        propertyId: e.propertyId,
        at: e.at,
        direction: e.direction,
        method: e.method,
        result: e.result,
        subjectType: e.subjectType,
        subjectName: e.subjectName,
        gateName: e.gate?.name ?? null,
        unitName: e.unit ? `${e.unit.building.name} · ${e.unit.name}` : null,
        reason: e.reason,
      })),
    });
  });
}
