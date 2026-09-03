import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { guardPlatform, handle, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Accounts waiting on a decision.
 *
 * Paltas staff only, behind guardPlatform — approving a business onto the
 * platform is not something a customer's own administrator should be able to
 * do for themselves, which is the entire point of the queue.
 */
export async function GET(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const g = await guardPlatform("platform.approvals");
    if (!g.ok) return g.response;

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "PENDING";

    const accounts = await prisma.user.findMany({
      where: { status: status as "PENDING" | "REJECTED" | "ACTIVE" },
      orderBy: { createdAt: "asc" },
      take: 200,
      select: {
        id: true, name: true, email: true, phone: true,
        requestedRole: true, status: true, createdAt: true,
        approvedAt: true, rejectedReason: true,
        org: { select: { id: true, name: true, country: true, approved: true } },
      },
    });

    return ok({
      accounts,
      pending: await prisma.user.count({ where: { status: "PENDING" } }),
    });
  });
}
