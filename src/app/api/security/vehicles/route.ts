import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { VehicleType } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Registered vehicles. `?plate=` is the gate lookup; the rest is administration. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const plate = url.searchParams.get("plate")?.trim().toUpperCase();
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.VEHICLE_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const vehicles = await prisma.vehicle.findMany({
      where: {
        ...scoped,
        ...(plate ? { plate: { contains: plate } } : {}),
        ...(propertyId ? { propertyId } : {}),
        active: true,
      },
      orderBy: { plate: "asc" },
      take: 200,
      include: {
        unit: { select: { name: true, building: { select: { name: true } } } },
        resident: { select: { fullName: true } },
      },
    });

    return ok({
      vehicles: vehicles.map((v) => ({
        id: v.id,
        propertyId: v.propertyId,
        unitId: v.unitId,
        unitName: v.unit ? `${v.unit.building.name} · ${v.unit.name}` : null,
        ownerName: v.resident?.fullName ?? null,
        plate: v.plate,
        make: v.make,
        model: v.model,
        colour: v.colour,
        type: v.type,
        permitNo: v.permitNo,
        parkingBay: v.parkingBay,
      })),
    });
  });
}

/** Record a vehicle — a resident's car, or a visitor's noted at the gate. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; unitId?: string; residentId?: string; visitorId?: string;
      plate?: string; make?: string; model?: string; colour?: string;
      type?: VehicleType; permitNo?: string; parkingBay?: string;
    }>(req);
    if (!body?.plate?.trim()) return badRequest("plate is required.");
    if (!body.unitId && !body.propertyId) return badRequest("unitId or propertyId is required.");

    const g = await guard(PERMISSIONS.VEHICLE_CREATE, {
      unitId: body.unitId ?? null,
      propertyId: body.propertyId ?? null,
    });
    if (!g.ok) return g.response;

    const plate = body.plate.trim().toUpperCase();
    const existing = await prisma.vehicle.findUnique({
      where: { propertyId_plate: { propertyId: g.scope.propertyId!, plate } },
    });
    if (existing) return conflict(`${plate} is already registered at this property.`);

    const vehicle = await prisma.vehicle.create({
      data: {
        propertyId: g.scope.propertyId!,
        unitId: body.unitId ?? null,
        residentId: body.residentId ?? null,
        visitorId: body.visitorId ?? null,
        plate,
        make: body.make?.trim(),
        model: body.model?.trim(),
        colour: body.colour?.trim(),
        type: body.type ?? "RESIDENT",
        permitNo: body.permitNo?.trim(),
        parkingBay: body.parkingBay?.trim(),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "vehicle.create",
      permission: PERMISSIONS.VEHICLE_CREATE,
      entityType: "Vehicle",
      entityId: vehicle.id,
      propertyId: vehicle.propertyId,
      unitId: vehicle.unitId,
      summary: `Registered vehicle ${vehicle.plate} (${vehicle.type.toLowerCase()})`,
      after: { plate: vehicle.plate, type: vehicle.type, make: vehicle.make, model: vehicle.model },
    });

    return ok({ vehicle }, 201);
  });
}
