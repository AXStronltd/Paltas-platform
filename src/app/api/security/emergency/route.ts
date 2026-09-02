import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { AlertType } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Live emergency alerts. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const includeResolved = url.searchParams.get("all") === "true";

    const g = await guardList(PERMISSIONS.SECURITY_EMERGENCY_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByProperty(g.access);
    const alerts = await prisma.emergencyAlert.findMany({
      where: {
        ...scoped,
        ...(includeResolved ? {} : { status: { in: ["ACTIVE", "ACKNOWLEDGED"] } }),
      },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { property: { select: { name: true } } },
    });

    return ok({
      alerts: alerts.map((a) => ({
        id: a.id,
        propertyId: a.propertyId,
        propertyName: a.property.name,
        type: a.type,
        message: a.message,
        location: a.location,
        raisedByName: a.raisedByName,
        status: a.status,
        createdAt: a.createdAt,
        acknowledgedAt: a.acknowledgedAt,
        resolvedAt: a.resolvedAt,
      })),
    });
  });
}

/**
 * Raise an alert.
 *
 * Guards and residents both hold this permission, and deliberately nothing else
 * about it is gated: an emergency is the one action where making someone prove
 * their authority first is the wrong trade.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ propertyId?: string; type?: AlertType; message?: string; location?: string }>(req);
    if (!body?.propertyId || !body.type) return badRequest("propertyId and type are required.");

    const g = await guard(PERMISSIONS.SECURITY_EMERGENCY_RAISE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    const alert = await prisma.emergencyAlert.create({
      data: {
        propertyId: body.propertyId,
        type: body.type,
        message: body.message?.trim(),
        location: body.location?.trim(),
        raisedById: g.actor.id,
        raisedByName: g.actor.name,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "security.emergency.raise",
      permission: PERMISSIONS.SECURITY_EMERGENCY_RAISE,
      entityType: "EmergencyAlert",
      entityId: alert.id,
      propertyId: alert.propertyId,
      summary: `Raised ${alert.type} alert${alert.location ? ` at ${alert.location}` : ""}`,
      after: { type: alert.type, message: alert.message, location: alert.location },
    });

    return ok({ alert }, 201);
  });
}
