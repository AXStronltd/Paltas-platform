import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, guard, guardList, handle, ok, readJson } from "@/server/http";
import { accessiblePropertyIds } from "@/server/scope";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * What each staff member is paid.
 *
 * Profiles are superseded rather than edited: setting a new salary deactivates
 * the old one and writes a new row with its own effective date, so any payslip
 * can always be explained by the profile that was in force when it was produced.
 * Overwriting the figure would make historic pay unexplainable.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardList(PERMISSIONS.SALARY_VIEW);
    if (!g.ok) return g.response;

    const propertyIds = g.access.kind === "platform" ? null : await accessiblePropertyIds(g.access);

    const profiles = await prisma.salaryProfile.findMany({
      where: {
        active: true,
        ...(g.access.kind === "platform"
          ? { org: { isPlatform: false } }
          : { orgId: g.actor.orgId, OR: [{ propertyId: null }, { propertyId: { in: propertyIds ?? [] } }] }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        user: { select: { id: true, name: true, email: true, title: true, status: true } },
        property: { select: { id: true, name: true } },
      },
    });

    return ok({
      salaries: profiles.map((p) => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        email: p.user.email,
        accountStatus: p.user.status,
        jobTitle: p.jobTitle ?? p.user.title,
        grossMonthly: p.grossMonthly,
        currency: p.currency,
        effectiveFrom: p.effectiveFrom,
        propertyId: p.propertyId,
        propertyName: p.property?.name ?? null,
        bankReference: p.bankReference,
      })),
      totalMonthly: profiles.reduce((a, p) => a + p.grossMonthly, 0),
    });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      userId?: string; propertyId?: string; jobTitle?: string;
      grossMonthly?: number; bankReference?: string; effectiveFrom?: string;
    }>(req);
    if (!body?.userId) return badRequest("userId is required.");
    if (!body.grossMonthly || body.grossMonthly <= 0) return badRequest("grossMonthly must be a positive amount.");

    const g = await guard(PERMISSIONS.SALARY_MANAGE, { propertyId: body.propertyId ?? null });
    if (!g.ok) return g.response;

    const staff = await prisma.user.findUnique({ where: { id: body.userId }, select: { id: true, name: true, orgId: true, title: true } });
    if (!staff) return badRequest("Unknown staff member.");
    if (staff.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return badRequest("Unknown staff member.");

    const previous = await prisma.salaryProfile.findFirst({
      where: { userId: staff.id, active: true },
      orderBy: { effectiveFrom: "desc" },
    });

    const profile = await prisma.$transaction(async (tx) => {
      // Supersede rather than overwrite, so history stays explainable.
      if (previous) await tx.salaryProfile.update({ where: { id: previous.id }, data: { active: false } });
      return tx.salaryProfile.create({
        data: {
          orgId: staff.orgId,
          userId: staff.id,
          propertyId: body.propertyId ?? null,
          jobTitle: body.jobTitle?.trim() ?? staff.title,
          grossMonthly: Math.round(body.grossMonthly!),
          bankReference: body.bankReference?.trim(),
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
          createdById: g.actor.id,
        },
      });
    });

    await writeAudit({
      actor: g.actor,
      action: "payroll.salary.set",
      permission: PERMISSIONS.SALARY_MANAGE,
      entityType: "SalaryProfile",
      entityId: profile.id,
      propertyId: profile.propertyId,
      summary: previous
        ? `Changed ${staff.name}'s salary from ${previous.currency} ${previous.grossMonthly.toLocaleString()} to ${profile.currency} ${profile.grossMonthly.toLocaleString()} monthly`
        : `Set ${staff.name}'s salary at ${profile.currency} ${profile.grossMonthly.toLocaleString()} monthly`,
      before: previous ? { grossMonthly: previous.grossMonthly, effectiveFrom: previous.effectiveFrom } : null,
      after: { grossMonthly: profile.grossMonthly, effectiveFrom: profile.effectiveFrom, jobTitle: profile.jobTitle },
    });

    return ok({ salary: profile }, 201);
  });
}
