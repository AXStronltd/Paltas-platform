import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByPropertyOrUnit } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { ChargeStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * What each unit and resident owes.
 *
 * A charge carries the payments made against it, so `balance` is derived rather
 * than stored — the commonest way a property ledger goes wrong is a status field
 * that drifted out of step with the money actually received.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") as ChargeStatus | null;
    const unitId = url.searchParams.get("unitId");
    const propertyId = url.searchParams.get("propertyId");
    const categoryId = url.searchParams.get("categoryId");

    const g = await guardList(PERMISSIONS.CHARGE_VIEW);
    if (!g.ok) return g.response;

    const charges = await prisma.charge.findMany({
      where: {
        ...whereByPropertyOrUnit(g.access),
        ...(status ? { status } : {}),
        ...(unitId ? { unitId } : {}),
        ...(propertyId ? { propertyId } : {}),
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ dueDate: "desc" }],
      take: 400,
      include: {
        category: { select: { id: true, code: true, name: true, kind: true } },
        unit: { select: { name: true, building: { select: { name: true } } } },
        resident: { select: { id: true, fullName: true } },
        payments: { select: { id: true, amount: true, status: true, paidAt: true } },
      },
    });

    const rows = charges.map(present);
    const totals = rows.reduce(
      (acc, c) => {
        acc.billed += c.amount;
        acc.settled += c.settled;
        if (c.status !== "WAIVED") acc.outstanding += c.balance;
        else acc.waived += c.amount;
        return acc;
      },
      { billed: 0, settled: 0, outstanding: 0, waived: 0 },
    );

    return ok({ charges: rows, totals });
  });
}

/**
 * Raise a charge.
 *
 * Bulk mode bills a whole property in one go — the monthly service-charge run,
 * which is the single most repeated task in estate finance and the one most
 * often done in a spreadsheet.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; unitId?: string; residentId?: string;
      categoryId?: string; amount?: number; dueDate?: string;
      description?: string; periodLabel?: string;
      /** Bill every occupied unit in the property under this category. */
      allUnits?: boolean;
    }>(req);
    if (!body?.categoryId) return badRequest("categoryId is required.");
    if (!body.propertyId && !body.unitId) return badRequest("propertyId or unitId is required.");

    const g = await guard(PERMISSIONS.CHARGE_CREATE, {
      propertyId: body.propertyId ?? null,
      unitId: body.unitId ?? null,
    });
    if (!g.ok) return g.response;

    const category = await prisma.feeCategory.findUnique({ where: { id: body.categoryId } });
    if (!category) return badRequest("Unknown fee category.");
    if (category.orgId !== g.scope.orgId && !g.actor.isPlatformAdmin) return badRequest("Unknown fee category.");
    if (!category.active) return badRequest(`The category "${category.name}" is switched off.`);

    const amount = body.amount ?? category.defaultAmount;
    if (!amount || amount <= 0) {
      return badRequest("An amount is required — this category has no default to fall back on.");
    }

    const dueDate = body.dueDate ? new Date(body.dueDate) : new Date();
    if (Number.isNaN(dueDate.getTime())) return badRequest("Invalid dueDate.");

    const propertyId = g.scope.propertyId!;
    const ref = () => `CHG-${randomBytes(3).toString("hex").toUpperCase()}`;

    // Which units to bill: one, or every occupied unit for the monthly run.
    let targets: { id: string; residentId: string | null; name: string }[];
    if (body.allUnits) {
      const units = await prisma.unit.findMany({
        where: { propertyId, status: "OCCUPIED" },
        select: { id: true, name: true, residents: { where: { active: true, isPrimary: true }, select: { id: true }, take: 1 } },
      });
      targets = units.map((u) => ({ id: u.id, residentId: u.residents[0]?.id ?? null, name: u.name }));
      if (targets.length === 0) return badRequest("No occupied units to bill.");
    } else if (g.scope.unitId) {
      const unit = await prisma.unit.findUnique({
        where: { id: g.scope.unitId },
        select: { id: true, name: true, residents: { where: { active: true, isPrimary: true }, select: { id: true }, take: 1 } },
      });
      if (!unit) return badRequest("Unknown unit.");
      targets = [{ id: unit.id, residentId: body.residentId ?? unit.residents[0]?.id ?? null, name: unit.name }];
    } else {
      targets = [{ id: "", residentId: body.residentId ?? null, name: "property" }];
    }

    const created = await prisma.$transaction(
      targets.map((t) =>
        prisma.charge.create({
          data: {
            orgId: g.scope.orgId,
            propertyId,
            unitId: t.id || null,
            residentId: t.residentId,
            categoryId: category.id,
            reference: ref(),
            description: body.description?.trim() ?? category.name,
            amount,
            currency: category.currency,
            dueDate,
            periodLabel: body.periodLabel?.trim(),
            createdById: g.actor.id,
          },
        }),
      ),
    );

    await writeAudit({
      actor: g.actor,
      action: "finance.charge.create",
      permission: PERMISSIONS.CHARGE_CREATE,
      entityType: "Charge",
      entityId: created.length === 1 ? created[0].id : null,
      propertyId,
      unitId: created.length === 1 ? created[0].unitId : null,
      summary: created.length === 1
        ? `Raised ${category.currency} ${amount.toLocaleString()} — ${category.name} on ${targets[0].name}`
        : `Billed ${created.length} units ${category.currency} ${amount.toLocaleString()} each for ${category.name}${body.periodLabel ? ` (${body.periodLabel})` : ""} — ${category.currency} ${(amount * created.length).toLocaleString()} total`,
      after: { category: category.name, amount, units: created.length, dueDate },
    });

    return ok({ created: created.length, charges: created }, 201);
  });
}

function present(c: {
  id: string; reference: string; description: string | null; amount: number; currency: string;
  dueDate: Date; periodLabel: string | null; status: ChargeStatus; waivedReason: string | null;
  propertyId: string; unitId: string | null;
  category: { id: string; code: string; name: string; kind: string };
  unit?: { name: string; building: { name: string } } | null;
  resident?: { id: string; fullName: string } | null;
  payments: { id: string; amount: number; status: string; paidAt: Date | null }[];
}) {
  const settled = c.payments.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amount, 0);
  const balance = Math.max(0, c.amount - settled);
  return {
    id: c.id,
    reference: c.reference,
    description: c.description,
    amount: c.amount,
    currency: c.currency,
    settled,
    balance,
    dueDate: c.dueDate,
    periodLabel: c.periodLabel,
    // Derived from the money actually received, not from a field that can drift.
    status: c.status === "WAIVED" ? "WAIVED"
      : balance === 0 ? "PAID"
      : settled > 0 ? "PART_PAID"
      : c.dueDate < new Date() ? "OVERDUE"
      : c.status,
    waivedReason: c.waivedReason,
    propertyId: c.propertyId,
    unitId: c.unitId,
    unitName: c.unit ? `${c.unit.building.name} · ${c.unit.name}` : null,
    residentName: c.resident?.fullName ?? null,
    category: c.category,
  };
}
