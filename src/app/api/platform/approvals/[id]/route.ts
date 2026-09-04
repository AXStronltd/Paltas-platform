import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "@/server/db";
import { badRequest, fail, guardPlatform, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

/**
 * Approve or reject a business account.
 *
 * Approving does three things together, in one transaction, because a half-done
 * approval is worse than none: it activates the account, approves the
 * organisation it belongs to, and gives the person a role.
 *
 * The role comes from `requestedRole` only as a suggestion; the approver names
 * the role that is actually granted. That is the difference between an approval
 * and a rubber stamp — if a signup form could choose its own permissions, the
 * queue would be decorative.
 *
 * The role's permission set comes from system-roles.json, exactly as the seed
 * builds them, so an approved landlord holds the same grants as one created by
 * hand.
 */
const SYSTEM_ROLES = JSON.parse(
  readFileSync(join(process.cwd(), "src/lib/security/system-roles.json"), "utf8"),
) as { key: string; name: string; description?: string; permissions: string[] }[];

/** What each self-declared role is actually granted, once a human agrees. */
const ROLE_FOR: Record<string, string> = {
  landlord: "property_manager",
  agent: "property_manager",
  hotel: "property_manager",
  developer: "property_manager",
};

export async function POST(req: Request, { params }: { params: { id: string } }): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardPlatform("platform.approvals");
    if (!g.ok) return g.response;

    const body = await readJson<{ action?: "approve" | "reject"; reason?: string; roleKey?: string; isOwner?: boolean }>(req);
    if (body?.action !== "approve" && body?.action !== "reject") {
      return badRequest('action must be "approve" or "reject".');
    }

    const account = await prisma.user.findUnique({
      where: { id: params.id },
      select: { id: true, name: true, email: true, status: true, orgId: true, requestedRole: true, onboardingRole: true },
    });
    if (!account) return fail(404, { code: "not_found", message: "Account not found." });
    if (account.status !== "PENDING") {
      return fail(409, {
        code: "conflict",
        message: `That account is already ${account.status.toLowerCase()}.`,
      });
    }

    if (body.action === "reject") {
      // A rejection with no stated reason cannot be reviewed, and reviewing
      // them is how a mistaken one gets undone.
      if (!body.reason?.trim()) return badRequest("A reason is required to reject an account.");

      await prisma.user.update({
        where: { id: account.id },
        data: { status: "REJECTED", rejectedReason: body.reason.trim().slice(0, 400) },
      });

      await writeAudit({
        actor: g.actor,
        action: "account.reject",
        entityType: "User",
        entityId: account.id,
        summary: `Rejected ${account.name} <${account.email}> — ${body.reason.trim()}`,
        before: { status: "PENDING" },
        after: { status: "REJECTED" },
      });

      return ok({ rejected: true });
    }

    const roleKey = body.roleKey ?? ROLE_FOR[account.requestedRole ?? ""] ?? "property_manager";
    const definition = SYSTEM_ROLES.find((r) => r.key === roleKey);
    if (!definition) return badRequest(`Unknown role "${roleKey}".`);

    const requiredTypes = account.onboardingRole === "property_owner"
      ? ["IDENTITY", "OWNERSHIP"]
      : account.onboardingRole === "resident" ? [] : ["IDENTITY"];
    const approvedDocuments = await prisma.verificationDocument.findMany({ where: { userId: account.id, status: "APPROVED" }, select: { type: true } });
    const approvedTypes = new Set(approvedDocuments.map((document) => document.type));
    if (requiredTypes.some((type) => !approvedTypes.has(type as "IDENTITY" | "OWNERSHIP" | "SUPPORTING"))) {
      return fail(409, { code: "verification_required", message: "Required identity or ownership documents must be approved before this account can be activated." });
    }

    await prisma.$transaction(async (tx) => {
      // The organisation becomes real at the same moment its owner does.
      await tx.organization.update({ where: { id: account.orgId }, data: { approved: true } });

      const role = await tx.role.create({
        data: {
          orgId: account.orgId,
          key: definition.key,
          name: definition.name,
          description: definition.description,
          isSystem: true,
          permissions: { create: definition.permissions.map((permission) => ({ permission })) },
        },
        select: { id: true },
      });

      await tx.roleAssignment.create({
        data: {
          userId: account.id,
          roleId: role.id,
          // Their whole organisation. They have no properties yet; this is the
          // scope they will still hold once they add some.
          scopeType: "ORGANIZATION",
          scopeId: account.orgId,
          grantedById: g.actor.id,
        },
      });

      await tx.user.update({
        where: { id: account.id },
        data: {
          status: "ACTIVE",
          // Owner of their own organisation, which is what signing up as a
          // business means. Never platform staff — that is ours to grant.
          isOwner: body.isOwner ?? true,
          approvedById: g.actor.id,
          approvedAt: new Date(),
        },
      });
    });

    await writeAudit({
      actor: g.actor,
      action: "account.approve",
      entityType: "User",
      entityId: account.id,
      summary: `Approved ${account.name} <${account.email}> as ${definition.name}`
        + (account.requestedRole ? ` (asked for: ${account.requestedRole})` : "") + ".",
      before: { status: "PENDING" },
      after: { status: "ACTIVE", role: definition.key },
    });

    return ok({ approved: true, role: definition.key });
  });
}
