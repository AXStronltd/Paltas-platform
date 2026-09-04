import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { fail, handle, ok, readJson } from "@/server/http";
import { anthropicEnabled, assertKeyNotPublic, configurationHint, model, streamChat, textOnly } from "@/server/anthropic";
import { systemPrompt } from "@/lib/support/knowledge";
import {
  RATE_LIMIT, callerKey, sanitiseHistory, sendable, windowStart,
} from "@/lib/support/chat";
import { DEFAULT_LOCALE, isLocale, localeOf } from "@/lib/i18n/locales";

export const dynamic = "force-dynamic";

/**
 * The help assistant.
 *
 * Unauthenticated on purpose: somebody who cannot work out how to sign up is
 * exactly the person who needs to ask a question, and putting help behind an
 * account is how a help feature ends up unused. But an open endpoint that calls
 * a paid API is somebody's bill, so it is rate limited by caller, in the
 * database rather than in memory — a restart or a second instance must not hand
 * out a fresh allowance.
 *
 * The browser sends conversation turns and a locale. It cannot send
 * instructions: the system prompt is built here, from the knowledge base, and
 * a client-supplied "system" role is dropped by `sanitiseHistory` before
 * anything reaches the model.
 */

/** Salt so the stored digest is specific to this deployment. */
function salt(): string {
  return process.env.SUPPORT_HASH_SALT || process.env.STRIPE_WEBHOOK_SECRET || "paltas-support";
}

function callerHash(): string {
  const forwarded = headers().get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return createHash("sha256").update(callerKey(forwarded, salt())).digest("hex").slice(0, 40);
}

/**
 * Count this request, and say whether it is one too many.
 *
 * The increment happens before the model is called, not after. A request that
 * fails still cost a round trip and still has to count, or a caller who can
 * make it fail has an unlimited allowance.
 */
async function overLimit(hash: string, now: Date): Promise<false | { retryAfterMinutes: number }> {
  const hour = windowStart(now, 1);
  const day = windowStart(now, 24);

  const [hourRow, dayTotal] = await Promise.all([
    prisma.supportUsage.upsert({
      where: { callerHash_windowStart: { callerHash: hash, windowStart: hour } },
      create: { callerHash: hash, windowStart: hour, count: 1 },
      update: { count: { increment: 1 } },
      select: { count: true },
    }),
    prisma.supportUsage.aggregate({
      where: { callerHash: hash, windowStart: { gte: day } },
      _sum: { count: true },
    }),
  ]);

  if (hourRow.count > RATE_LIMIT.perHour) {
    const minutes = Math.ceil((hour.getTime() + 3_600_000 - now.getTime()) / 60_000);
    return { retryAfterMinutes: Math.max(minutes, 1) };
  }
  if ((dayTotal._sum.count ?? 0) > RATE_LIMIT.perDay) return { retryAfterMinutes: 60 };
  return false;
}

/** Whether the assistant can answer at all, for the widget to check before opening. */
export async function GET(): Promise<NextResponse> {
  return handle(async () => {
    const available = anthropicEnabled();
    return ok({
      available,
      model: available ? model() : null,
      // Only while it is off, and only variable names — never a value.
      ...(available ? {} : { configuration: configurationHint() }),
    });
  });
}

export async function POST(req: Request): Promise<Response> {
  // A refusal here is a fatal misconfiguration, not a bad request: the key is
  // already in the browser bundle and the deployment must not serve traffic
  // as if nothing were wrong.
  assertKeyNotPublic();

  const body = await readJson<{ messages?: unknown; locale?: string; path?: string }>(req);
  const turns = sanitiseHistory(body?.messages);
  if (!sendable(turns)) {
    return fail(400, { code: "bad_request", message: "Ask a question and I will try to help." });
  }

  if (!anthropicEnabled()) {
    return fail(503, {
      code: "unavailable",
      message: "The help assistant is not switched on for this deployment yet.",
    });
  }

  /*
   * A database that cannot answer means the allowance cannot be checked, and an
   * unchecked allowance on a paid API is somebody's invoice. Refuse rather than
   * carry on: the site is in trouble anyway if this fails, and the help panel
   * saying "try again shortly" is a better failure than an open endpoint.
   */
  let limited: false | { retryAfterMinutes: number };
  try {
    limited = await overLimit(callerHash(), new Date());
  } catch {
    return fail(503, {
      code: "unavailable",
      message: "The assistant is unavailable just now. Please try again shortly, or use the WhatsApp link in the footer.",
    });
  }

  if (limited) {
    return fail(429, {
      code: "rate_limited",
      message: `That is a lot of questions at once. Try again in ${limited.retryAfterMinutes} minute(s), or use the WhatsApp link in the footer.`,
    });
  }

  const locale = isLocale(body?.locale) ? body.locale : DEFAULT_LOCALE;
  const result = await streamChat({
    system: systemPrompt({
      locale,
      languageName: localeOf(locale).englishName,
      // A path is a hint about context, and it is attacker-controlled, so it is
      // capped and stripped of anything that is not a path.
      path: typeof body?.path === "string" ? body.path.replace(/[^a-zA-Z0-9/_-]/g, "").slice(0, 80) : undefined,
    }),
    turns,
    signal: req.signal,
  });

  if (!result.ok || !result.body) {
    // The provider's own message goes to the log, not to the visitor: it can
    // name the model, the account, or a quota, none of which is theirs.
    console.error(`[support] Claude API ${result.status}: ${result.error ?? ""}`);
    return fail(502, {
      code: "upstream",
      message: "I could not reach the assistant just now. Please try again, or use the WhatsApp link in the footer.",
    });
  }

  return new Response(textOnly(result.body), {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
