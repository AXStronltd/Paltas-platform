import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { ensureMembership } from "@/server/membership";
import { hashPassword } from "@/server/password";
import { badRequest, conflict, handle, ok, readJson } from "@/server/http";
import { supabaseAdmin } from "@/server/supabase";

export const dynamic = "force-dynamic";

/** Create the local RBAC principal after Supabase creates an identity. */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      supabaseUserId?: string; email?: string; audience?: "guest" | "staff";
      name?: string; role?: "landlord" | "agent" | "hotel" | "developer";
      businessName?: string; country?: string;
    }>(req);
    if (!body?.supabaseUserId || !body.email || !body.audience || !body.name?.trim()) {
      return badRequest("Name, email and authentication identity are required.");
    }
    const admin = supabaseAdmin();
    if (!admin) return NextResponse.json({ error: { code: "auth_not_configured", message: "Authentication is not configured." } }, { status: 503 });
    const identity = await admin.auth.admin.getUserById(body.supabaseUserId);
    if (identity.error || !identity.data.user?.email || identity.data.user.email.toLowerCase() !== body.email.trim().toLowerCase()) {
      return badRequest("The authentication identity could not be verified.");
    }
    const email = identity.data.user.email.toLowerCase();
    const unusablePassword = await hashPassword(randomBytes(32).toString("hex"));

    if (body.audience === "guest") {
      const existing = await prisma.guest.findFirst({ where: { OR: [{ email }, { supabaseUserId: body.supabaseUserId }] } });
      if (existing) return conflict("An account with that email already exists.");
      const guest = await prisma.guest.create({
        data: { email, name: body.name.trim().slice(0, 120), passwordHash: unusablePassword, supabaseUserId: body.supabaseUserId, country: body.country?.toUpperCase() },
        select: { id: true, name: true, email: true },
      });
      return ok({ guest }, 201);
    }

    if (!body.role || !["landlord", "agent", "hotel", "developer"].includes(body.role)) {
      return badRequest("Please choose a business role.");
    }
    const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { supabaseUserId: body.supabaseUserId }] } });
    if (existing) return conflict("An account with that email already exists.");
    const org = await prisma.organization.create({ data: { name: (body.businessName?.trim() || body.name.trim()).slice(0, 120), country: (body.country || "KE").slice(0, 2).toUpperCase(), approved: false }, select: { id: true } });
    const user = await prisma.user.create({
      data: { orgId: org.id, email, name: body.name.trim().slice(0, 120), passwordHash: unusablePassword, supabaseUserId: body.supabaseUserId, status: "PENDING", requestedRole: body.role },
      select: { id: true, name: true, email: true, status: true, requestedRole: true },
    });
    await ensureMembership(user.id, org.id);
    return ok({ account: user, pending: true }, 201);
  });
}