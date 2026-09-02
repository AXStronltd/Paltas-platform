import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, conflict, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Approve a pay run, or mark it paid.
 *
 * Approval is its own permission, and the approver may not be the person who
 * prepared it — the oldest control in payroll, and the one that stops a single
 * compromised account from both inventing a salary and signing it off.
 */
export async function PATCH(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ status?: "APPROVED" | "PAID" }>(req);
    if (!body?.status) return badRequest("status is required.");

    const run = await prisma.payRun.findUnique({ where: { id: params.id }, include: { payslips: true } });
    if (!run) return notFound("Pay run not found.");

    const g = await guard(PERMISSIONS.PAYROLL_APPROVE, { propertyId: run.propertyId });
    if (!g.ok) return g.response;
    if (run.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Pay run not found.");

    if (body.status === "APPROVED") {
      if (run.status !== "DRAFT") return conflict(`This run is already ${run.status.toLowerCase()}.`);
      if (run.createdById && run.createdById === g.actor.id && !g.actor.isOwner && !g.actor.isPlatformAdmin) {
        return conflict("A pay run must be approved by someone other than the person who prepared it.");
      }
    }
    if (body.status === "PAID" && run.status !== "APPROVED") {
      return conflict("A run must be approved before it can be marked paid.");
    }

    const updated = await prisma.payRun.update({
      where: { id: run.id },
      data: body.status === "APPROVED"
        ? { status: "APPROVED", approvedById: g.actor.id, approvedAt: new Date() }
        : { status: "PAID", paidAt: new Date() },
    });

    await writeAudit({
      actor: g.actor,
      action: body.status === "APPROVED" ? "payroll.run.approve" : "payroll.run.pay",
      permission: PERMISSIONS.PAYROLL_APPROVE,
      entityType: "PayRun",
      entityId: run.id,
      propertyId: run.propertyId,
      summary: body.status === "APPROVED"
        ? `Approved ${run.periodLabel} pay run — ${run.payslips.length} staff, net ${run.currency} ${run.totalNet.toLocaleString()}`
        : `Marked ${run.periodLabel} pay run paid — ${run.currency} ${run.totalNet.toLocaleString()} released`,
      before: { status: run.status },
      after: { status: updated.status, headcount: run.payslips.length, totalNet: run.totalNet },
    });

    return ok({ run: updated });
  });
}
