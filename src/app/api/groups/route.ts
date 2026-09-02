import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { bestDiscount, splitEvenly } from "@/lib/pricing/groupPricing";
import { PERMISSIONS } from "@/lib/security/permissions";
import { presentGroup } from "@/server/presenters";
import type { GroupPurpose, GroupStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/** Group bookings — a Hajj or Umrah party, an extended family, a corporate block. */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as GroupStatus | null;
    const purpose = url.searchParams.get("purpose") as GroupPurpose | null;

    const g = await guardList(PERMISSIONS.GROUP_VIEW);
    if (!g.ok) return g.response;

    const groups = await prisma.groupBooking.findMany({
      where: {
        OR: [whereByProperty(g.access), { orgId: g.actor.orgId, propertyId: null }],
        ...(status ? { status } : {}),
        ...(purpose ? { purpose } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: {
        property: { select: { id: true, name: true } },
        discount: { select: { id: true, name: true } },
        members: { orderBy: { createdAt: "asc" } },
      },
      take: 100,
    });

    return ok({ groups: groups.map(presentGroup) });
  });
}

/**
 * Open a group.
 *
 * The best applicable group discount is found and applied at creation, and the
 * amount it took off is *stored* rather than recomputed later — so a rule that
 * is edited or expires next month cannot silently restate what this party was
 * quoted. Shares are split to the minor unit with the remainder distributed, so
 * they always sum exactly to the amount owed.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; name?: string; purpose?: GroupPurpose; destination?: string;
      organiserName?: string; organiserEmail?: string; organiserPhone?: string;
      checkIn?: string; checkOut?: string; unitsRequested?: number; guests?: number;
      totalAmount?: number; currency?: string;
      members?: { name: string; email?: string; phone?: string; shareAmount?: number }[];
    }>(req);

    if (!body?.name?.trim() || !body.organiserName?.trim() || !body.destination?.trim()) {
      return badRequest("name, destination and organiserName are required.");
    }
    if (typeof body.totalAmount !== "number" || body.totalAmount <= 0) {
      return badRequest("totalAmount must be a positive number.");
    }

    const g = await guard(PERMISSIONS.GROUP_CREATE, { propertyId: body.propertyId ?? null });
    if (!g.ok) return g.response;

    const checkIn = body.checkIn ? new Date(body.checkIn) : new Date(Date.now() + 30 * 86400000);
    const checkOut = body.checkOut ? new Date(body.checkOut) : new Date(Date.now() + 37 * 86400000);
    if (Number.isNaN(checkIn.getTime()) || Number.isNaN(checkOut.getTime())) return badRequest("Invalid dates.");
    if (checkOut <= checkIn) return badRequest("checkOut must be after checkIn.");

    const guests = Math.max(1, body.guests ?? 1);
    const units = Math.max(1, body.unitsRequested ?? 1);
    const nights = Math.max(1, Math.round((checkOut.getTime() - checkIn.getTime()) / 86400000));
    const leadDays = Math.max(0, Math.round((checkIn.getTime() - Date.now()) / 86400000));

    const orgId = g.scope.propertyId ? g.scope.orgId : g.actor.orgId;

    // Candidate rules: this property's, plus the organisation-wide ones.
    const rules = await prisma.discount.findMany({
      where: {
        orgId,
        active: true,
        kind: { in: ["GROUP", "SEASONAL", "EARLY_BIRD", "LONG_STAY"] },
        OR: [{ propertyId: body.propertyId ?? null }, { propertyId: null }],
      },
    });

    const chosen = bestDiscount(rules, { guests, units, nights, leadDays, amount: body.totalAmount });
    const discountAmount = chosen?.amount ?? 0;
    const payable = body.totalAmount - discountAmount;

    const requested = body.members ?? [];
    const memberCount = Math.max(1, requested.length);
    const evenShares = splitEvenly(payable, memberCount);
    const members = requested.length
      ? requested.map((m, i) => ({
          name: m.name.trim(),
          email: m.email?.trim(),
          phone: m.phone?.trim(),
          shareAmount: m.shareAmount ?? evenShares[i],
          isOrganiser: i === 0,
        }))
      : [{
          name: body.organiserName.trim(),
          email: body.organiserEmail?.trim(),
          phone: body.organiserPhone?.trim(),
          shareAmount: payable,
          isOrganiser: true,
        }];

    const group = await prisma.groupBooking.create({
      data: {
        orgId,
        propertyId: body.propertyId ?? null,
        reference: `GRP-${randomBytes(3).toString("hex").toUpperCase()}`,
        name: body.name.trim(),
        purpose: body.purpose ?? "FAMILY",
        destination: body.destination.trim(),
        organiserName: body.organiserName.trim(),
        organiserEmail: body.organiserEmail?.trim(),
        organiserPhone: body.organiserPhone?.trim(),
        checkIn,
        checkOut,
        unitsRequested: units,
        guests,
        totalAmount: body.totalAmount,
        currency: body.currency ?? "KES",
        discountId: chosen?.rule.id ?? null,
        discountAmount,
        status: "COLLECTING",
        createdById: g.actor.id,
        members: { create: members },
      },
      include: {
        property: { select: { id: true, name: true } },
        discount: { select: { id: true, name: true } },
        members: { orderBy: { createdAt: "asc" } },
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "group.create",
      permission: PERMISSIONS.GROUP_CREATE,
      entityType: "GroupBooking",
      entityId: group.id,
      propertyId: group.propertyId,
      summary: `Opened group ${group.reference} "${group.name}" — ${guests} guests, ${members.length} payer(s)`
        + (chosen ? `, ${chosen.rule.name} applied (−${group.currency} ${discountAmount.toLocaleString()})` : ", no discount applied"),
      after: {
        reference: group.reference, guests, units,
        totalAmount: group.totalAmount, discount: chosen?.rule.name ?? null, discountAmount,
      },
    });

    return ok({ group: presentGroup(group) }, 201);
  });
}
