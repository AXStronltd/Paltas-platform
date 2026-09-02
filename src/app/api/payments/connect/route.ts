import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { fail, guard, handle, ok, readJson } from "@/server/http";
import { writeAudit } from "@/server/audit";
import {
  createConnectOnboardingLink, createConnectedAccount, retrieveAccount, stripeEnabled, stripeMode,
} from "@/server/stripe";
import { PERMISSIONS } from "@/lib/security/permissions";

export const dynamic = "force-dynamic";

/**
 * Stripe Connect — where an owner's takings are paid.
 *
 * Status comes from Stripe on every read rather than from our own flag, because
 * an account can exist, look connected, and still be unable to receive money
 * while Stripe waits on a document. Reporting our cached boolean in that state
 * would tell an owner they are being paid when they are not.
 */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const g = await guard(PERMISSIONS.PAYMENT_CONNECT_MANAGE, {});
    if (!g.ok) return g.response;

    const org = await prisma.organization.findUnique({
      where: { id: g.actor.orgId },
      select: { name: true, stripeAccountId: true, stripeOnboarded: true, platformFeeBasisPoints: true },
    });

    if (!org?.stripeAccountId) {
      return ok({
        mode: stripeMode(),
        connected: false,
        accountId: null,
        chargesEnabled: false,
        payoutsEnabled: false,
        requirementsDue: [],
        platformFeeBasisPoints: org?.platformFeeBasisPoints ?? 0,
      });
    }

    // Ask Stripe, not ourselves.
    const { account, error } = stripeEnabled()
      ? await retrieveAccount(org.stripeAccountId)
      : { account: null, error: "Payments are not configured." };

    // Keep our flag honest with what Stripe just said.
    if (account && account.chargesEnabled !== org.stripeOnboarded) {
      await prisma.organization.update({
        where: { id: g.actor.orgId },
        data: { stripeOnboarded: account.chargesEnabled },
      });
    }

    return ok({
      mode: stripeMode(),
      connected: true,
      accountId: org.stripeAccountId,
      chargesEnabled: account?.chargesEnabled ?? false,
      payoutsEnabled: account?.payoutsEnabled ?? false,
      detailsSubmitted: account?.detailsSubmitted ?? false,
      requirementsDue: account?.requirementsDue ?? [],
      platformFeeBasisPoints: org.platformFeeBasisPoints,
      error,
    });
  });
}

/**
 * Begin or resume onboarding.
 *
 * Creates the connected account if there is not one yet, then returns a
 * single-use Stripe-hosted link. The link is short-lived by design, so it is
 * generated on demand rather than stored.
 */
export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{ returnUrl?: string; refreshUrl?: string }>(req);

    const g = await guard(PERMISSIONS.PAYMENT_CONNECT_MANAGE, {});
    if (!g.ok) return g.response;

    if (!stripeEnabled()) {
      return fail(503, {
        code: "payments_unconfigured",
        message: "Card payments are not configured. Set STRIPE_SECRET_KEY on the server.",
      });
    }

    const org = await prisma.organization.findUnique({
      where: { id: g.actor.orgId },
      select: { id: true, name: true, country: true, stripeAccountId: true },
    });
    if (!org) return fail(404, { code: "not_found", message: "Organisation not found." });

    let accountId = org.stripeAccountId;
    if (!accountId) {
      const created = await createConnectedAccount({
        email: g.actor.email,
        country: org.country,
        businessName: org.name,
      });
      if (!created.accountId) {
        return fail(502, { code: "provider_error", message: created.error ?? "Stripe refused the request." });
      }
      accountId = created.accountId;
      await prisma.organization.update({ where: { id: org.id }, data: { stripeAccountId: accountId } });

      await writeAudit({
        actor: g.actor,
        action: "payment.connect.create",
        permission: PERMISSIONS.PAYMENT_CONNECT_MANAGE,
        entityType: "Organization",
        entityId: org.id,
        summary: `Created a Stripe connected account for ${org.name} (${stripeMode()} mode)`,
        after: { accountId, mode: stripeMode() },
      });
    }

    const origin = new URL(req.url).origin;
    const link = await createConnectOnboardingLink({
      accountId,
      returnUrl: body?.returnUrl ?? `${origin}/manage/payouts?return=1`,
      refreshUrl: body?.refreshUrl ?? `${origin}/manage/payouts?refresh=1`,
    });
    if (!link.url) return fail(502, { code: "provider_error", message: link.error ?? "Stripe refused the request." });

    await writeAudit({
      actor: g.actor,
      action: "payment.connect.onboarding",
      permission: PERMISSIONS.PAYMENT_CONNECT_MANAGE,
      entityType: "Organization",
      entityId: org.id,
      summary: `Opened Stripe onboarding for ${org.name}`,
      after: { accountId },
    });

    // The link itself is single-use and short-lived; it is not stored.
    return ok({ url: link.url, accountId });
  });
}
