import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import { maskId } from "@/server/presenters";
import type { VisitorType } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * The visitor register: people known to a property, as distinct from individual
 * arrivals. Searching it is what a guard does when someone turns up at the gate
 * without a pass and says they were here last week.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const propertyId = url.searchParams.get("propertyId");
    const type = url.searchParams.get("type") as VisitorType | null;

    // Looking a visitor up by name is a distinct capability from browsing the
    // register, so a guard can be given one without the other.
    const permission = q ? PERMISSIONS.VISITOR_SEARCH : PERMISSIONS.VISITOR_VIEW;
    const g = await guardList(permission);
    if (!g.ok) return g.response;

    const scoped = whereByProperty(g.access);
    const visitors = await prisma.visitor.findMany({
      where: {
        ...(scoped ?? {}),
        ...(propertyId ? { propertyId } : {}),
        ...(type ? { type } : {}),
        ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { idNumber: { contains: q } }] } : {}),
        ...(scoped === null ? { property: { orgId: g.actor.orgId } } : {}),
      },
      orderBy: { fullName: "asc" },
      take: 100,
      select: {
        id: true, propertyId: true, fullName: true, phone: true, type: true,
        company: true, blacklisted: true, blacklistReason: true, idType: true, idNumber: true,
        _count: { select: { visits: true } },
      },
    });

    return ok({
      visitors: visitors.map((v) => ({
        ...v,
        visitCount: v._count.visits,
        _count: undefined,
        // Identity documents are the sensitive half of a visitor record; a guard
        // needs to confirm a number they are shown, not to browse a list of them.
        idNumber: maskId(v.idNumber),
      })),
    });
  });
}

/** Register a walk-in — the visitor who arrives without an invitation. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; fullName?: string; phone?: string;
      type?: VisitorType; company?: string; idType?: string; idNumber?: string;
    }>(req);
    if (!body?.propertyId || !body.fullName) return badRequest("propertyId and fullName are required.");

    const g = await guard(PERMISSIONS.VISITOR_CREATE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    const visitor = await prisma.visitor.create({
      data: {
        propertyId: body.propertyId,
        fullName: body.fullName.trim(),
        phone: body.phone?.trim(),
        type: body.type ?? "FAMILY_FRIEND",
        company: body.company?.trim(),
        idType: body.idType?.trim(),
        idNumber: body.idNumber?.trim(),
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "visitor.create",
      permission: PERMISSIONS.VISITOR_CREATE,
      entityType: "Visitor",
      entityId: visitor.id,
      propertyId: visitor.propertyId,
      summary: `Registered visitor ${visitor.fullName}`,
      after: { fullName: visitor.fullName, type: visitor.type, phone: visitor.phone },
    });

    return ok({ visitor: { ...visitor, idNumber: maskId(visitor.idNumber) } }, 201);
  });
}
