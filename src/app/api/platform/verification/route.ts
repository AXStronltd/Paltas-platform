import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, guardPlatform, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const gate = await guardPlatform("platform.verification");
    if (!gate.ok) return gate.response;
    const documents = await prisma.verificationDocument.findMany({
      where: { status: "PENDING" }, orderBy: { createdAt: "asc" },
      select: { id: true, type: true, fileName: true, contentType: true, size: true, status: true, createdAt: true, user: { select: { id: true, name: true, email: true, status: true, requestedRole: true } } },
    });
    return ok({ documents });
  });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const gate = await guardPlatform("platform.verification");
    if (!gate.ok) return gate.response;
    const body = await readJson<{ status?: "APPROVED" | "REJECTED"; reviewNote?: string }>(req);
    const id = new URL(req.url).searchParams.get("id");
    if (!id || (body?.status !== "APPROVED" && body?.status !== "REJECTED")) return badRequest("Document id and review status are required.");
    if (body.status === "REJECTED" && !body.reviewNote?.trim()) return badRequest("A rejection reason is required.");
    const document = await prisma.verificationDocument.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!document) return fail(404, { code: "not_found", message: "Document not found." });
    const updated = await prisma.verificationDocument.update({ where: { id }, data: { status: body.status, reviewNote: body.reviewNote?.trim().slice(0, 400) || null, reviewedById: gate.actor.id, reviewedAt: new Date() }, select: { id: true, status: true } });
    await writeAudit({ actor: gate.actor, action: `verification.document.${body.status.toLowerCase()}`, entityType: "VerificationDocument", entityId: id, summary: `${body.status === "APPROVED" ? "Approved" : "Rejected"} a verification document`, before: { status: document.status }, after: { status: updated.status } });
    return ok({ document: updated });
  });
}