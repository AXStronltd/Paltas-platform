import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { GateKind } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Gates and checkpoints. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const propertyId = new URL(req.url).searchParams.get("propertyId");
    const g = await guardList(PERMISSIONS.GATE_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByProperty(g.access);
    const gates = await prisma.gate.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { name: "asc" },
    });
    return ok({ gates });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ propertyId?: string; name?: string; kind?: GateKind }>(req);
    if (!body?.propertyId || !body.name) return badRequest("propertyId and name are required.");

    const g = await guard(PERMISSIONS.GATE_MANAGE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    const gate = await prisma.gate.create({
      data: { propertyId: body.propertyId, name: body.name.trim(), kind: body.kind ?? "MAIN" },
    });

    await writeAudit({
      actor: g.actor,
      action: "gate.create",
      permission: PERMISSIONS.GATE_MANAGE,
      entityType: "Gate",
      entityId: gate.id,
      propertyId: gate.propertyId,
      summary: `Added ${gate.kind.toLowerCase()} checkpoint "${gate.name}"`,
      after: { name: gate.name, kind: gate.kind },
    });

    return ok({ gate }, 201);
  });
}
