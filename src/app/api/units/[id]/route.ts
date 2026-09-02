import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guard, handle, notFound, ok } from "@/server/http";
import { decide } from "@/lib/security/authorize";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * The bottom of the drill-down: Portfolio → Property → Building → Unit →
 * Resident → visitors, access, maintenance, payments.
 *
 * Each section is fetched only if the viewer holds the permission for it *at
 * this unit*, and omitted entirely otherwise. That is why the response reports
 * which sections it contains: a Security Manager opening this unit gets visitors,
 * cards and vehicles with no payments block at all, and the UI can say so rather
 * than render an empty table that looks like a unit with no rent due.
 */
export async function GET(_req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.UNIT_VIEW, { unitId: params.id });
    if (!g.ok) return g.response;

    const unit = await prisma.unit.findUnique({
      where: { id: params.id },
      include: {
        building: { select: { id: true, name: true } },
        property: { select: { id: true, name: true, city: true } },
      },
    });
    if (!unit) return notFound("Unit not found.");

    const may = (permission: string) => decide(g.actor, permission, g.scope.chain).allowed;

    const [residents, invitations, visits, cards, vehicles, maintenance, payments] = await Promise.all([
      may(PERMISSIONS.RESIDENT_VIEW)
        ? prisma.resident.findMany({ where: { unitId: unit.id, active: true }, orderBy: { isPrimary: "desc" } })
        : null,
      may(PERMISSIONS.INVITATION_VIEW)
        ? prisma.visitorInvitation.findMany({ where: { unitId: unit.id }, orderBy: { validFrom: "desc" }, take: 20 })
        : null,
      may(PERMISSIONS.VISITOR_VIEW)
        ? prisma.visitorVisit.findMany({ where: { unitId: unit.id }, orderBy: { checkInAt: "desc" }, take: 20 })
        : null,
      may(PERMISSIONS.CARD_VIEW)
        ? prisma.accessCard.findMany({ where: { unitId: unit.id }, orderBy: { issuedAt: "desc" } })
        : null,
      may(PERMISSIONS.VEHICLE_VIEW)
        ? prisma.vehicle.findMany({ where: { unitId: unit.id, active: true }, orderBy: { plate: "asc" } })
        : null,
      may(PERMISSIONS.MAINTENANCE_VIEW)
        ? prisma.maintenanceRequest.findMany({ where: { unitId: unit.id }, orderBy: { createdAt: "desc" }, take: 20 })
        : null,
      may(PERMISSIONS.FINANCE_PAYMENT_VIEW)
        ? prisma.payment.findMany({ where: { unitId: unit.id }, orderBy: { dueDate: "desc" }, take: 24 })
        : null,
    ]);

    const showContact = may(PERMISSIONS.RESIDENT_CONTACT_VIEW);

    return ok({
      unit: {
        id: unit.id,
        name: unit.name,
        floor: unit.floor,
        bedrooms: unit.bedrooms,
        status: unit.status,
        building: unit.building,
        property: unit.property,
        ...(may(PERMISSIONS.FINANCE_VIEW) ? { rentAmount: unit.rentAmount, currency: unit.currency } : {}),
      },
      residents: residents?.map((r) => ({
        id: r.id,
        fullName: r.fullName,
        type: r.type,
        isPrimary: r.isPrimary,
        ...(showContact ? { email: r.email, phone: r.phone, moveInAt: r.moveInAt, leaseEnd: r.leaseEnd } : {}),
      })),
      invitations: invitations?.map((i) => ({
        id: i.id, visitorName: i.visitorName, visitorType: i.visitorType,
        validFrom: i.validFrom, validTo: i.validTo, status: i.status, passCode: i.passCode,
      })),
      visits: visits?.map((v) => ({
        id: v.id, visitorName: v.visitorName, visitorType: v.visitorType,
        checkInAt: v.checkInAt, checkOutAt: v.checkOutAt, status: v.status,
      })),
      cards,
      vehicles,
      maintenance,
      payments,
      /** Which blocks above the viewer was permitted to see. */
      sections: {
        residents: residents !== null,
        invitations: invitations !== null,
        visits: visits !== null,
        cards: cards !== null,
        vehicles: vehicles !== null,
        maintenance: maintenance !== null,
        payments: payments !== null,
      },
    });
  });
}
