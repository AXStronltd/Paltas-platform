import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { prisma } from "@/server/db";
import { badRequest, conflict, fail, guard, handle, notFound, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import { createPaymentIntent, stripeEnabled, stripeMode } from "@/server/stripe";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Start a card payment.
 *
 * The amount is never taken from the request. The caller names *what* is being
 * paid — a charge, or one traveller's share of a group booking — and the server
 * looks up what is actually owed. A client that can set its own price will
 * eventually be asked to.
 *
 * Only the `clientSecret` comes back, which is what Stripe.js needs and all it
 * needs; the secret key stays in this process.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      purpose?: "charge" | "group_share";
      chargeId?: string;
      groupBookingId?: string;
      memberId?: string;
      customerEmail?: string;
    }>(req);
    if (!body?.purpose) return badRequest("purpose is required.");

    let amount = 0;
    let currency = "KES";
    let description = "";
    let propertyId: string | null = null;
    let reference: string | null = null;

    if (body.purpose === "charge") {
      if (!body.chargeId) return badRequest("chargeId is required.");
      const charge = await prisma.charge.findUnique({
        where: { id: body.chargeId },
        include: { category: { select: { name: true } }, payments: { select: { amount: true, status: true } } },
      });
      if (!charge) return notFound("Charge not found.");

      const g = await guard(PERMISSIONS.PAYMENT_INTENT_CREATE, { propertyId: charge.propertyId, unitId: charge.unitId });
      if (!g.ok) return g.response;
      if (charge.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Charge not found.");

      const settled = charge.payments.filter((p) => p.status === "PAID").reduce((a, p) => a + p.amount, 0);
      amount = charge.amount - settled;
      if (amount <= 0) return conflict("Nothing is outstanding on this charge.");
      currency = charge.currency;
      description = `${charge.category.name} — ${charge.reference}`;
      propertyId = charge.propertyId;
      reference = charge.reference;
    } else {
      if (!body.groupBookingId || !body.memberId) return badRequest("groupBookingId and memberId are required.");
      const group = await prisma.groupBooking.findUnique({
        where: { id: body.groupBookingId },
        include: { members: true },
      });
      if (!group) return notFound("Group booking not found.");

      const g = await guard(PERMISSIONS.PAYMENT_INTENT_CREATE, { propertyId: group.propertyId });
      if (!g.ok) return g.response;
      if (group.orgId !== g.actor.orgId && !g.actor.isPlatformAdmin) return notFound("Group booking not found.");

      const member = group.members.find((m) => m.id === body.memberId);
      if (!member) return notFound("That traveller is not in this group.");
      if (member.shareStatus === "PAID") return conflict(`${member.name}'s share is already settled.`);

      amount = member.shareAmount;
      currency = group.currency;
      description = `${group.reference} — ${member.name}'s share`;
      propertyId = group.propertyId;
      reference = group.reference;
    }

    const gate = await guard(PERMISSIONS.PAYMENT_INTENT_CREATE, { propertyId });
    if (!gate.ok) return gate.response;

    // Checked only after authorisation: whether payments are configured is not
    // something an unauthorised caller should be able to probe for.
    if (!stripeEnabled()) {
      return fail(503, {
        code: "payments_unconfigured",
        message: "Card payments are not configured. Set STRIPE_SECRET_KEY on the server.",
      });
    }

    // Idempotency is anchored on what is being paid, so a retried request
    // resolves to the same Stripe intent rather than a second charge.
    const idempotencyKey = `paltas-${body.purpose}-${body.chargeId ?? body.memberId}-${amount}`;

    // Stripe Connect: once this owner has onboarded, the money settles into
    // their account with PALTAS retaining its stated fee. Until then the same
    // call is a plain charge to the platform account.
    const org = await prisma.organization.findUnique({
      where: { id: gate.actor.orgId },
      select: { stripeAccountId: true, stripeOnboarded: true, platformFeeBasisPoints: true },
    });

    const { intent, error } = await createPaymentIntent({
      amount,
      currency,
      description,
      idempotencyKey,
      customerEmail: body.customerEmail,
      metadata: {
        purpose: body.purpose,
        reference: reference ?? "",
        orgId: gate.actor.orgId,
        ...(body.chargeId ? { chargeId: body.chargeId } : {}),
        ...(body.groupBookingId ? { groupBookingId: body.groupBookingId, memberId: body.memberId! } : {}),
      },
      routing: org?.stripeOnboarded && org.stripeAccountId
        ? { destinationAccountId: org.stripeAccountId, platformFeeBasisPoints: org.platformFeeBasisPoints }
        : undefined,
    });

    if (!intent) return fail(502, { code: "provider_error", message: error ?? "The payment provider refused the request." });

    await prisma.paymentIntentRecord.upsert({
      where: { stripeIntentId: intent.id },
      create: {
        orgId: gate.actor.orgId,
        stripeIntentId: intent.id,
        amount: intent.amount,
        currency: intent.currency,
        status: "REQUIRES_PAYMENT",
        purpose: body.purpose,
        reference,
        chargeId: body.chargeId ?? null,
        groupBookingId: body.groupBookingId ?? null,
        customerEmail: body.customerEmail,
        createdById: gate.actor.id,
      },
      update: { amount: intent.amount, currency: intent.currency },
    });

    await writeAudit({
      actor: gate.actor,
      action: "payment.intent.create",
      permission: PERMISSIONS.PAYMENT_INTENT_CREATE,
      entityType: "PaymentIntentRecord",
      entityId: intent.id,
      propertyId,
      summary: `Started a ${stripeMode()} card payment of ${currency} ${(amount / 1).toLocaleString()} for ${description}`,
      after: { amount, currency, purpose: body.purpose, reference, mode: stripeMode() },
    });

    // Only the client secret and the amount. Never the key, never the raw intent.
    return ok({
      clientSecret: intent.clientSecret,
      amount: intent.amount,
      currency: intent.currency,
      mode: stripeMode(),
    }, 201);
  });
}
