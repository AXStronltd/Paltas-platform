import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { whereByProperty } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const url = new URL(req.url);
    const propertyId = url.searchParams.get("propertyId");
    const from = url.searchParams.get("from") ? new Date(url.searchParams.get("from")!) : null;

    const g = await guardList(PERMISSIONS.FINANCE_EXPENSE_VIEW);
    if (!g.ok) return g.response;

    const scoped = whereByProperty(g.access);
    const expenses = await prisma.expense.findMany({
      where: {
        ...scoped,
        ...(propertyId ? { propertyId } : {}),
        ...(from && !Number.isNaN(from.getTime()) ? { incurredAt: { gte: from } } : {}),
      },
      orderBy: { incurredAt: "desc" },
      take: 300,
      include: { property: { select: { name: true } } },
    });

    return ok({
      expenses: expenses.map((e) => ({
        id: e.id,
        propertyId: e.propertyId,
        propertyName: e.property.name,
        category: e.category,
        description: e.description,
        amount: e.amount,
        currency: e.currency,
        incurredAt: e.incurredAt,
      })),
      total: expenses.reduce((a, e) => a + e.amount, 0),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ propertyId?: string; category?: string; description?: string; amount?: number; incurredAt?: string }>(req);
    if (!body?.propertyId || !body.category?.trim() || !body.amount) {
      return badRequest("propertyId, category and amount are required.");
    }
    if (body.amount <= 0) return badRequest("amount must be greater than zero.");

    const g = await guard(PERMISSIONS.FINANCE_EXPENSE_CREATE, { propertyId: body.propertyId });
    if (!g.ok) return g.response;

    const expense = await prisma.expense.create({
      data: {
        propertyId: body.propertyId,
        category: body.category.trim(),
        description: body.description?.trim(),
        amount: Math.round(body.amount),
        incurredAt: body.incurredAt ? new Date(body.incurredAt) : new Date(),
        recordedById: g.actor.id,
      },
    });

    await writeAudit({
      actor: g.actor,
      action: "finance.expense.create",
      permission: PERMISSIONS.FINANCE_EXPENSE_CREATE,
      entityType: "Expense",
      entityId: expense.id,
      propertyId: expense.propertyId,
      summary: `Recorded ${expense.currency} ${expense.amount.toLocaleString()} expense (${expense.category})`,
      after: { category: expense.category, amount: expense.amount, description: expense.description },
    });

    return ok({ expense }, 201);
  });
}
