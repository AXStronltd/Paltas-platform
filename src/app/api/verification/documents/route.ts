import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { currentActor } from "@/server/actor";
import { badRequest, fail, handle, ok, unauthorized } from "@/server/http";
import { objectSize, presignPut, readHead, storageEnabled } from "@/server/storage";

export const dynamic = "force-dynamic";
const TYPES = ["IDENTITY", "OWNERSHIP", "SUPPORTING"] as const;
const CONTENT_TYPES = ["application/pdf", "image/jpeg", "image/png"] as const;
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();
    const documents = await prisma.verificationDocument.findMany({
      where: { userId: actor.id }, orderBy: { createdAt: "desc" },
      select: { id: true, type: true, fileName: true, contentType: true, size: true, status: true, reviewNote: true, reviewedAt: true, createdAt: true },
    });
    return ok({ documents });
  });
}

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();
    if (!storageEnabled()) return fail(503, { code: "unavailable", message: "Private document storage is not configured yet." });
    const body = await req.json().catch(() => null) as { type?: string; fileName?: string; contentType?: string; size?: number } | null;
    const type = body?.type as (typeof TYPES)[number];
    const contentType = body?.contentType?.split(";")[0].trim().toLowerCase();
    if (!TYPES.includes(type) || !CONTENT_TYPES.includes(contentType as (typeof CONTENT_TYPES)[number])) return badRequest("Upload a PDF, JPG or PNG document with a valid document type.");
    if (!body?.fileName?.trim() || !Number.isInteger(body.size) || body.size! <= 0 || body.size! > MAX_BYTES) return badRequest("Documents must be between 1 byte and 10 MB.");
    const key = `private/verification/${actor.id}/${type.toLowerCase()}-${randomBytes(16).toString("hex")}`;
    const signed = presignPut({ key, contentType: contentType! });
    if (!signed.url) return fail(503, { code: "unavailable", message: signed.error ?? "Could not prepare document upload." });
    return ok({ uploadUrl: signed.url, key, expiresInSeconds: 300 });
  });
}

export async function PUT(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const actor = await currentActor();
    if (!actor) return unauthorized();
    const body = await req.json().catch(() => null) as { key?: string; type?: string; fileName?: string; contentType?: string } | null;
    if (!body?.key?.startsWith(`private/verification/${actor.id}/`)) return badRequest("That document upload does not belong to your account.");
    const contentType = body.contentType?.split(";")[0].trim().toLowerCase() ?? "";
    if (!TYPES.includes(body.type as (typeof TYPES)[number]) || !CONTENT_TYPES.includes(contentType as (typeof CONTENT_TYPES)[number]) || !body.fileName?.trim()) return badRequest("Document details are incomplete.");
    const size = await objectSize(body.key);
    if (!size || size > MAX_BYTES || !await readHead(body.key)) return badRequest("The uploaded document could not be verified. Try again.");
    const document = await prisma.verificationDocument.create({
      data: { userId: actor.id, type: body.type as (typeof TYPES)[number], storageKey: body.key, fileName: body.fileName.trim().slice(0, 180), contentType, size },
      select: { id: true, type: true, status: true, fileName: true, size: true },
    });
    return ok({ document }, 201);
  });
}