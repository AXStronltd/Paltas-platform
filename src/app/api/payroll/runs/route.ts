import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, guardList, handle, ok, readJson } from "@/server/http";
import { accessiblePropertyIds } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";
import type { PayRunStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

/**
 * Monthly pay runs.
 *
 * Deduction lines are supplied by the organisation, not computed here. PALTAS is
 * not a certified payroll calculator for any jurisdiction, and quietly producing
 * a PAYE figure that a revenue authority disagrees with would be worse than
 * offering nothing — so the statutory lines are the organisation's own inputs,
 * named and shown on every payslip, and the responsibility stays where it
 * belongs.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const status = new URL(req.url).searchParams.get("status") as PayRunStatus | null;

    const g = await guardList(PERMISSIONS.PAYROLL_VIEW);
    if (!g.ok) return g.response;

    const propertyIds = g.access.kind === "platform" ? null : await accessiblePropertyIds(g.access);

    const runs = await prisma.payRun.findMany({
      where: {
        ...(g.access.kind === "platform"
          ? { org: { isPlatform: false } }
          : { orgId: g.actor.orgId, OR: [{ propertyId: null }, { propertyId: { in: propertyIds ?? [] } }] }),
        ...(status ? { status } : {}),
      },
      orderBy: { periodStart: "desc" },
      include: {
        property: { select: { id: true, name: true } },
        payslips: { orderBy: { staffName: "asc" } },
      },
      take: 60,
    });

    return ok({
      runs: runs.map((r) => ({
        id: r.id,
        periodLabel: r.periodLabel,
        periodStart: r.periodStart,
        periodEnd: r.periodEnd,
        status: r.status,
        currency: r.currency,
        totalGross: r.totalGross,
        totalDeductions: r.totalDeductions,
        totalNet: r.totalNet,
        headcount: r.payslips.length,
        propertyName: r.property?.name ?? null,
        approvedAt: r.approvedAt,
        paidAt: r.paidAt,
        payslips: r.payslips.map((p) => ({
          id: p.id,
          userId: p.userId,
          staffName: p.staffName,
          jobTitle: p.jobTitle,
          gross: p.gross,
          deductions: p.deductions,
          totalDeductions: p.totalDeductions,
          net: p.net,
          bankReference: p.bankReference,
        })),
      })),
    });
  });
}

interface DeductionLine { label: string; amount?: number; percent?: number }

/**
 * Build a run from the salary profiles in force, applying the deduction lines
 * given. A percentage line is resolved against gross at build time and stored as
 * a settled amount, so a later change to the rate cannot restate a payslip that
 * has already been issued.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      propertyId?: string; periodLabel?: string; periodStart?: string; periodEnd?: string;
      deductions?: DeductionLine[];
    }>(req);
    if (!body?.periodLabel?.trim()) return badRequest("periodLabel is required, e.g. \"September 2026\".");

    const g = await guard(PERMISSIONS.PAYROLL_MANAGE, { propertyId: body.propertyId ?? null });
    if (!g.ok) return g.response;

    const orgId = g.scope.propertyId ? g.scope.orgId : g.actor.orgId;
    const periodStart = body.periodStart ? new Date(body.periodStart) : startOfMonth(new Date());
    const periodEnd = body.periodEnd ? new Date(body.periodEnd) : endOfMonth(periodStart);
    if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) return badRequest("Invalid period dates.");
    if (periodEnd <= periodStart) return badRequest("The period must end after it starts.");

    const existing = await prisma.payRun.findFirst({
      where: { orgId, periodLabel: body.periodLabel.trim(), propertyId: body.propertyId ?? null },
      select: { id: true, status: true },
    });
    if (existing) return conflict(`A ${existing.status.toLowerCase()} run already exists for ${body.periodLabel.trim()}.`);

    const profiles = await prisma.salaryProfile.findMany({
      where: {
        orgId, active: true,
        ...(body.propertyId ? { OR: [{ propertyId: body.propertyId }, { propertyId: null }] } : {}),
        effectiveFrom: { lte: periodEnd },
      },
      include: { user: { select: { id: true, name: true, title: true, status: true } } },
    });
    const payable = profiles.filter((p) => p.user.status === "ACTIVE");
    if (payable.length === 0) return badRequest("No active salary profiles to pay.");

    const lines = body.deductions ?? [];
    let totalGross = 0, totalDeductions = 0, totalNet = 0;

    const slips = payable.map((p) => {
      const resolved = lines.map((l) => ({
        label: l.label,
        amount: l.amount !== undefined
          ? Math.round(l.amount)
          : Math.round((p.grossMonthly * (l.percent ?? 0)) / 100),
      }));
      // Deductions can never exceed gross — a negative payslip is always an error.
      const raw = resolved.reduce((a, d) => a + d.amount, 0);
      const deducted = Math.min(raw, p.grossMonthly);
      const net = p.grossMonthly - deducted;

      totalGross += p.grossMonthly;
      totalDeductions += deducted;
      totalNet += net;

      return {
        userId: p.userId,
        staffName: p.user.name,
        jobTitle: p.jobTitle ?? p.user.title,
        gross: p.grossMonthly,
        deductions: resolved,
        totalDeductions: deducted,
        net,
        currency: p.currency,
        bankReference: p.bankReference,
      };
    });

    const run = await prisma.payRun.create({
      data: {
        orgId,
        propertyId: body.propertyId ?? null,
        periodLabel: body.periodLabel.trim(),
        periodStart,
        periodEnd,
        totalGross,
        totalDeductions,
        totalNet,
        createdById: g.actor.id,
        payslips: { create: slips },
      },
      include: { payslips: true },
    });

    await writeAudit({
      actor: g.actor,
      action: "payroll.run.create",
      permission: PERMISSIONS.PAYROLL_MANAGE,
      entityType: "PayRun",
      entityId: run.id,
      propertyId: run.propertyId,
      summary: `Prepared ${run.periodLabel} pay run — ${slips.length} staff, gross ${run.currency} ${totalGross.toLocaleString()}, net ${run.currency} ${totalNet.toLocaleString()}`,
      after: { period: run.periodLabel, headcount: slips.length, totalGross, totalDeductions, totalNet },
    });

    return ok({ run }, 201);
  });
}

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
