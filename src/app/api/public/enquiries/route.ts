import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/server/db";
import { badRequest, fail, handle, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * "I want to buy" and "I want to sell", from someone who is not signed in.
 *
 * Unauthenticated on purpose. An enquiry from a stranger is how every lead
 * begins, and requiring an account before someone can ask a question loses most
 * of them. But it is a public write, which needs care:
 *
 *   The client names an intent, not a record. It cannot set a stage, an owner,
 *   an organisation, or anything else that would let it inject a lead deep in
 *   somebody's pipeline. Everything else is derived here.
 *
 *   Routing is derived from the listing, so a buyer's question reaches the
 *   agent who actually holds that property. A seller with no listing yet goes
 *   to the Paltas platform organisation, where operations triage it — there is
 *   no other honest answer to "whose lead is this?" before anyone has spoken
 *   to them.
 *
 *   Rate limited by email and by address. Without it, this endpoint is a
 *   spam-injection point into every agent's working queue.
 */

/** Enquiries allowed from one email, or one address, per hour. */
const MAX_PER_HOUR = 5;

export async function POST(req: Request): Promise<NextResponse> {
  return handle(async () => {
    const body = await readJson<{
      intent?: "buy" | "sell";
      name?: string; email?: string; phone?: string;
      listingId?: string; interestedIn?: string; budget?: number;
      city?: string; propertyType?: string; message?: string;
    }>(req);

    if (body?.intent !== "buy" && body?.intent !== "sell") {
      return badRequest("Tell us whether you want to buy or to sell.");
    }
    if (!body.name?.trim()) return badRequest("Please give us a name.");
    const email = body.email?.trim().toLowerCase();
    const phone = body.phone?.trim();
    // Without one of these there is no way to answer, which makes the enquiry
    // a record of nothing.
    if (!email && !phone) return badRequest("Please leave an email address or a phone number.");
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return badRequest("That email address does not look right.");
    }

    const since = new Date(Date.now() - 60 * 60 * 1000);
    const ip = headers().get("x-forwarded-for")?.split(",")[0]?.trim()
      ?? headers().get("x-real-ip")
      ?? null;

    const recent = await prisma.lead.count({
      where: {
        createdAt: { gte: since },
        OR: [
          ...(email ? [{ email }] : []),
          ...(ip ? [{ source: { endsWith: `ip:${ip}` } }] : []),
        ],
      },
    });
    if (recent >= MAX_PER_HOUR) {
      return fail(429, {
        code: "rate_limited",
        message: "That is a lot of enquiries in one hour. Please give us a little time to reply to the last one.",
      });
    }

    // A buyer asking about a specific property goes to whoever holds it.
    let orgId: string | null = null;
    let propertyId: string | null = null;
    let listingId: string | null = null;
    let about = body.interestedIn?.trim() || null;

    if (body.listingId) {
      const listing = await prisma.propertyListing.findFirst({
        // PUBLISHED only: a draft is not something a stranger can have seen,
        // so an enquiry naming one is either stale or probing.
        where: { id: body.listingId, status: "PUBLISHED" },
        select: { id: true, orgId: true, propertyId: true, title: true },
      });
      if (!listing) return badRequest("That listing is no longer available.");
      orgId = listing.orgId;
      propertyId = listing.propertyId;
      listingId = listing.id;
      about = about ?? listing.title;
    }

    if (!orgId) {
      // No listing named — a seller, or a buyer describing what they want.
      // Paltas triages these; see the note at the top.
      const platform = await prisma.organization.findFirst({
        where: { isPlatform: true },
        select: { id: true },
      });
      if (!platform) {
        return fail(503, { code: "unavailable", message: "Enquiries are not being taken just now." });
      }
      orgId = platform.id;
    }

    const budget = body.budget === undefined ? null : Math.max(0, Math.round(Number(body.budget) || 0)) || null;

    const summary = body.intent === "sell"
      ? [
          body.propertyType?.trim() ? `Selling: ${body.propertyType.trim()}` : "Wants to sell",
          body.city?.trim(),
        ].filter(Boolean).join(" · ")
      : about ?? [body.propertyType?.trim(), body.city?.trim()].filter(Boolean).join(" in ") ?? "Looking to buy";

    await prisma.lead.create({
      data: {
        orgId,
        propertyId,
        listingId,
        name: body.name.trim().slice(0, 120),
        email: email ?? null,
        phone: phone ?? null,
        interestedIn: summary.slice(0, 300) || null,
        budget,
        // Stage, owner and currency are all set here, never by the caller.
        stage: "NEW",
        // The address is recorded in the source string rather than a column of
        // its own: it is only ever used for the rate limit above, and a column
        // would invite it being read for other things.
        source: `${body.intent === "sell" ? "Sell enquiry" : "Buy enquiry"}${ip ? ` · ip:${ip}` : ""}`,
        notes: body.message?.trim().slice(0, 2000) || null,
        lastContactAt: new Date(),
      },
      select: { id: true },
    });

    // No lead id goes back. The visitor does not need it, and returning one
    // would let anyone enumerate the pipeline by submitting forms.
    return ok({
      received: true,
      intent: body.intent,
      message: body.intent === "sell"
        ? "Thank you. Someone from PALTAS will call you about your property."
        : "Thank you. An agent will be in touch about what you are looking for.",
    }, 201);
  });
}
