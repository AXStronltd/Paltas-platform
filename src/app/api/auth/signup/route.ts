import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { badRequest, fail, handle, ok, readJson } from "@/server/http";
import { hashPassword } from "@/server/password";

export const dynamic = "force-dynamic";

/**
 * Sign up as a business — landlord, agent, hotel or developer.
 *
 * Creates a PENDING account and nothing else. It can sign in and do nothing:
 * the authorization engine refuses every status that is not ACTIVE, in all
 * three of its decision paths, so a pending account is safe because of how
 * permission works rather than because this endpoint remembered to be careful.
 *
 * The organisation is created here too, unapproved, because a user needs
 * somewhere to belong and moving them between organisations later is worse.
 * It holds nothing until somebody approves it.
 *
 * The role someone picks is recorded as `requestedRole` — a request, not a
 * grant. The role that actually decides anything is assigned at approval, by a
 * person who checked. Letting a signup form choose its own permissions would
 * make the whole approval step decorative.
 */
const ROLES = ["landlord", "agent", "hotel", "developer"] as const;
type RequestedRole = (typeof ROLES)[number];

const MIN_PASSWORD = 10;

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      name?: string; email?: string; password?: string;
      role?: RequestedRole; businessName?: string; country?: string; phone?: string;
    }>(req);

    if (!body?.name?.trim()) return badRequest("Please give us your name.");
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return badRequest("Please enter a valid email address.");
    }
    if (!body.password || body.password.length < MIN_PASSWORD) {
      return badRequest(`Please choose a password of at least ${MIN_PASSWORD} characters.`);
    }
    if (!body.role || !ROLES.includes(body.role)) {
      return badRequest(`Please choose what you do: ${ROLES.join(", ")}.`);
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { status: true } });
    if (existing) {
      // Deliberately the same answer whichever it is. Saying "already
      // registered" turns this into a way to test which addresses have
      // accounts, and saying "rejected" tells someone their application was
      // turned down by a stranger's probe rather than by us.
      return fail(409, {
        code: "conflict",
        message: "We could not create an account with that address. If it is yours, try signing in or resetting your password.",
      });
    }

    const businessName = body.businessName?.trim() || `${body.name.trim()}`;
    const passwordHash = await hashPassword(body.password);

    const user = await prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: {
          name: businessName.slice(0, 120),
          country: (body.country ?? "KE").slice(0, 2).toUpperCase(),
          approved: false,
        },
        select: { id: true },
      });

      return tx.user.create({
        data: {
          orgId: org.id,
          email,
          name: body.name!.trim().slice(0, 120),
          phone: body.phone?.trim() || null,
          passwordHash,
          status: "PENDING",
          requestedRole: body.role,
          // Not an owner and not platform staff. Those are columns precisely so
          // that nothing a signup form sends can set them.
          isOwner: false,
          isPlatformAdmin: false,
        },
        select: { id: true, name: true, email: true, requestedRole: true, status: true },
      });
    });

    return ok({
      account: user,
      pending: true,
      message: "Thank you. Your account is with PALTAS for approval — we will email you when it is ready.",
    }, 201);
  });
}
