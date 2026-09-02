import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardList, handle, ok } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { PaymentStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Rent and service-charge records.
 *
 * Behind `finance.payment.view`, which the Security Manager and Security Guard
 * roles do not carry — this is the endpoint the requirement means when it says a
 * guard has no access to rent.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as PaymentStatus | null;
    const propertyId = url.searchParams.get("propertyId");

    const g = await guardList(PERMISSIONS.FINANCE_PAYMENT_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByPropertyOrUnit(g.access);
    const payments = await prisma.payment.findMany({
      where: {
        ...scoped,
        ...(status ? { status } : {}),
        ...(propertyId ? { propertyId } : {}),
      },
      orderBy: { dueDate: "desc" },
      take: 300,
      include: {
        unit: { select: { name: true, building: { select: { name: true } } } },
        resident: { select: { fullName: true } },
      },
    });

    const totals = payments.reduce(
      (acc, p) => {
        if (p.status === "PAID") acc.paid += p.amount;
        else acc.outstanding += p.amount;
        return acc;
      },
      { paid: 0, outstanding: 0 },
    );

    return ok({
      payments: payments.map((p) => ({
        id: p.id,
        propertyId: p.propertyId,
        unitName: p.unit ? `${p.unit.building.name} · ${p.unit.name}` : null,
        residentName: p.resident?.fullName ?? null,
        kind: p.kind,
        amount: p.amount,
        currency: p.currency,
        dueDate: p.dueDate,
        paidAt: p.paidAt,
        status: p.status,
        reference: p.reference,
      })),
      totals,
    });
  });
}
