import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe, server-side only.
 *
 * Deliberately talks to Stripe's REST API with `fetch` rather than pulling in the
 * SDK: it keeps the dependency surface small and, more usefully, makes every
 * field that leaves this process visible in one file. Money is worth reading.
 *
 * Rules this module exists to enforce:
 *
 *  - The secret key is read from `STRIPE_SECRET_KEY` and never leaves the server.
 *    It is never logged, never returned in a response, and never interpolated
 *    into an error message.
 *  - A key exposed through a `NEXT_PUBLIC_` variable is treated as a fatal
 *    misconfiguration rather than something to warn about and carry on with,
 *    because that variable is compiled into the browser bundle.
 *  - Webhook signatures are verified with a timing-safe comparison before the
 *    payload is believed. An unverified webhook is an unauthenticated stranger
 *    telling you a payment succeeded.
 */

const STRIPE_API = "https://api.stripe.com/v1";

/** Live keys move real money; the distinction is worth surfacing in the UI. */
export function stripeMode(): "live" | "test" | "unconfigured" {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return "unconfigured";
  return key.startsWith("sk_live_") ? "live" : "test";
}

export function stripeEnabled(): boolean {
  return stripeMode() !== "unconfigured";
}

/**
 * Guard against the one mistake that cannot be undone quietly: a secret key
 * placed in a NEXT_PUBLIC_ variable, which Next.js inlines into JavaScript
 * served to every visitor.
 */
export function assertNoPublicSecret(): void {
  for (const [name, value] of Object.entries(process.env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    // sk_ and rk_ are Stripe's secret and restricted keys; mk_ and other
    // provider prefixes are caught too, because the cost of a false positive
    // here is a clear error message and the cost of a miss is a leaked secret.
    if (typeof value === "string" && /^(sk|rk|mk)_/.test(value)) {
      throw new Error(
        `${name} contains a Stripe secret key. NEXT_PUBLIC_ variables are compiled into the browser bundle — ` +
        `move it to STRIPE_SECRET_KEY and roll the exposed key immediately.`,
      );
    }
  }
}

function secret(): string {
  assertNoPublicSecret();
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  return key;
}

/** Form-encode the nested shape Stripe's API expects. */
function encode(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") body.set(k, String(v));
  }
  return body.toString();
}

/**
 * Stripe Connect.
 *
 * PALTAS serves many property owners, so payments should settle into *their*
 * accounts with PALTAS retaining a stated fee — not into one pooled balance that
 * someone then reconciles and pays out by hand. That is a destination charge:
 * `transfer_data[destination]` names the owner's connected account, and
 * `application_fee_amount` is PALTAS's cut, deducted by Stripe.
 *
 * Passing neither is a plain charge to the platform account, which is what
 * happens until an organisation has onboarded — so the same code path serves
 * both, and switching an owner on is a matter of storing their account id.
 */
export interface ConnectRouting {
  /** The owner's connected account, e.g. acct_1234. */
  destinationAccountId?: string | null;
  /** PALTAS's share, in basis points of the amount (250 = 2.5%). */
  platformFeeBasisPoints?: number;
}

/**
 * Create a connected account for a property owner.
 *
 * `controller` rather than the older `type: express` parameters: Stripe's
 * current shape, where the platform pays the fees and the owner gets a Stripe
 * -hosted dashboard. The owner remains responsible for their own tax and
 * identity information, which is the point of Connect — PALTAS never holds it.
 */
export async function createConnectedAccount(input: {
  email?: string;
  country?: string;
  businessName: string;
}): Promise<{ accountId: string | null; error: string | null }> {
  try {
    const res = await fetch(`${STRIPE_API}/accounts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: encode({
        country: input.country ?? "KE",
        email: input.email,
        "business_profile[name]": input.businessName,
        "controller[losses][payments]": "application",
        "controller[fees][payer]": "application",
        "controller[stripe_dashboard][type]": "express",
      }),
    });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) return { accountId: null, error: json.error?.message ?? `Stripe refused (${res.status}).` };
    return { accountId: json.id, error: null };
  } catch {
    return { accountId: null, error: "Could not reach the payment provider." };
  }
}

/**
 * Whether Stripe considers this account ready to be paid.
 *
 * `charges_enabled` and `payouts_enabled` are the only honest answer — an
 * account can exist, look onboarded, and still be unable to receive money
 * because Stripe is waiting on a document.
 */
export async function retrieveAccount(accountId: string): Promise<{
  account: { chargesEnabled: boolean; payoutsEnabled: boolean; detailsSubmitted: boolean; requirementsDue: string[] } | null;
  error: string | null;
}> {
  try {
    const res = await fetch(`${STRIPE_API}/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${secret()}`, "Stripe-Version": "2024-06-20" },
    });
    const json = (await res.json()) as {
      charges_enabled?: boolean; payouts_enabled?: boolean; details_submitted?: boolean;
      requirements?: { currently_due?: string[] };
      error?: { message?: string };
    };
    if (!res.ok) return { account: null, error: json.error?.message ?? `Stripe refused (${res.status}).` };
    return {
      account: {
        chargesEnabled: json.charges_enabled ?? false,
        payoutsEnabled: json.payouts_enabled ?? false,
        detailsSubmitted: json.details_submitted ?? false,
        requirementsDue: json.requirements?.currently_due ?? [],
      },
      error: null,
    };
  } catch {
    return { account: null, error: "Could not reach the payment provider." };
  }
}

/** Create the onboarding link an owner follows to connect their account. */
export async function createConnectOnboardingLink(input: {
  accountId: string;
  refreshUrl: string;
  returnUrl: string;
}): Promise<{ url: string | null; error: string | null }> {
  try {
    const res = await fetch(`${STRIPE_API}/account_links`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: encode({
        account: input.accountId,
        refresh_url: input.refreshUrl,
        return_url: input.returnUrl,
        type: "account_onboarding",
      }),
    });
    const json = (await res.json()) as { url?: string; error?: { message?: string } };
    if (!res.ok || !json.url) return { url: null, error: json.error?.message ?? `Stripe refused (${res.status}).` };
    return { url: json.url, error: null };
  } catch {
    return { url: null, error: "Could not reach the payment provider." };
  }
}

export interface StripeIntent {
  id: string;
  clientSecret: string;
  status: string;
  amount: number;
  currency: string;
}

/**
 * Create a PaymentIntent.
 *
 * `amount` must have been computed by the caller from something in our own
 * database — a charge, a group booking share — and never taken from the request
 * body. A client that can name its own price is a client that will.
 *
 * `idempotencyKey` is passed to Stripe so a retried request cannot double-charge.
 */
export async function createPaymentIntent(input: {
  amount: number;
  currency: string;
  description: string;
  idempotencyKey: string;
  customerEmail?: string;
  metadata?: Record<string, string>;
  /** Omit until the owner has onboarded; the charge then goes to the platform. */
  routing?: ConnectRouting;
}): Promise<{ intent: StripeIntent | null; error: string | null }> {
  try {
    const params: Record<string, string | number | undefined> = {
      amount: Math.round(input.amount),
      currency: input.currency.toLowerCase(),
      description: input.description,
      "automatic_payment_methods[enabled]": "true",
      receipt_email: input.customerEmail,
    };
    for (const [k, v] of Object.entries(input.metadata ?? {})) {
      params[`metadata[${k}]`] = v;
    }

    // Destination charge: the owner is paid, PALTAS keeps a stated fee.
    const destination = input.routing?.destinationAccountId;
    if (destination) {
      params["transfer_data[destination]"] = destination;
      const bps = input.routing?.platformFeeBasisPoints ?? 0;
      if (bps > 0) {
        // Rounded down, so the platform never takes more than the stated rate.
        params.application_fee_amount = Math.floor((Math.round(input.amount) * bps) / 10_000);
      }
    }

    const res = await fetch(`${STRIPE_API}/payment_intents`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": input.idempotencyKey,
        "Stripe-Version": "2024-06-20",
      },
      body: encode(params),
    });

    const json = (await res.json()) as {
      id?: string; client_secret?: string; status?: string;
      amount?: number; currency?: string;
      error?: { message?: string; code?: string };
    };

    if (!res.ok || !json.id || !json.client_secret) {
      // Stripe's message is safe to surface; the key never appears in it.
      return { intent: null, error: json.error?.message ?? `Stripe refused the request (${res.status}).` };
    }

    return {
      intent: {
        id: json.id,
        clientSecret: json.client_secret,
        status: json.status ?? "requires_payment_method",
        amount: json.amount ?? input.amount,
        currency: (json.currency ?? input.currency).toUpperCase(),
      },
      error: null,
    };
  } catch (e) {
    // Never echo the exception verbatim — a misconfigured fetch can carry headers.
    console.error("[stripe] payment intent failed:", (e as Error).name);
    return { intent: null, error: "Could not reach the payment provider." };
  }
}

/**
 * Refund a guest — and take the money back from wherever it went.
 *
 * On a destination charge Stripe has already moved the host's share out of the
 * platform's balance. Refunding without `reverse_transfer` therefore pays the
 * guest out of PALTAS's own money while the host keeps theirs, which is a
 * silent loss on every single refund. `refund_application_fee` gives back the
 * platform's cut too, because keeping a commission on a stay that did not
 * happen is not a fee, it is a charge for nothing.
 *
 * Both are no-ops on a charge that was never routed to a connected account, so
 * this is safe for platform-only charges as well.
 */
export async function refundPaymentIntent(
  intentId: string,
  amount?: number,
  opts: {
    /** Pull the host's share back. Default true: it is what a refund means. */
    reverseTransfer?: boolean;
    /** Give back PALTAS's cut. Default true. */
    refundApplicationFee?: boolean;
  } = {},
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`${STRIPE_API}/refunds`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: encode({
        payment_intent: intentId,
        amount: amount ? Math.round(amount) : undefined,
        reverse_transfer: (opts.reverseTransfer ?? true) ? "true" : undefined,
        refund_application_fee: (opts.refundApplicationFee ?? true) ? "true" : undefined,
      }),
    });
    const json = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `Refund refused (${res.status}).` };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Could not reach the payment provider." };
  }
}

/**
 * Verify a webhook signature.
 *
 * Stripe signs `${timestamp}.${rawBody}` with the endpoint secret. The raw body
 * matters: parsing and re-serialising the JSON changes the bytes and the
 * signature will not match, which is why the route reads `req.text()`.
 *
 * The timestamp tolerance stops a captured, valid webhook from being replayed
 * indefinitely.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  endpointSecret: string | undefined,
  toleranceSeconds = 300,
): { ok: boolean; reason?: string } {
  if (!endpointSecret) return { ok: false, reason: "STRIPE_WEBHOOK_SECRET is not set." };
  if (!signatureHeader) return { ok: false, reason: "Missing Stripe-Signature header." };

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((p) => p.trim().split("=") as [string, string]),
  );
  const timestamp = parts.t;
  const provided = parts.v1;
  if (!timestamp || !provided) return { ok: false, reason: "Malformed signature header." };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > toleranceSeconds) {
    return { ok: false, reason: "Signature timestamp outside tolerance." };
  }

  const expected = createHmac("sha256", endpointSecret)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided, "utf8");
  if (a.length !== b.length) return { ok: false, reason: "Signature mismatch." };
  if (!timingSafeEqual(a, b)) return { ok: false, reason: "Signature mismatch." };

  return { ok: true };
}

/** Stripe's statuses, mapped onto ours. */
export function mapStatus(stripeStatus: string): "REQUIRES_PAYMENT" | "PROCESSING" | "SUCCEEDED" | "FAILED" | "CANCELLED" {
  switch (stripeStatus) {
    case "succeeded": return "SUCCEEDED";
    case "processing": return "PROCESSING";
    case "canceled": return "CANCELLED";
    case "requires_payment_method":
    case "requires_confirmation":
    case "requires_action":
    case "requires_capture": return "REQUIRES_PAYMENT";
    default: return "FAILED";
  }
}

/**
 * Send a host their money.
 *
 * A transfer, not a destination charge: the guest paid PALTAS, the money was
 * held until the stay finished, and this is the moment it moves. Separating the
 * two is what makes a refund possible at all — there is no platform balance to
 * refund from if the host was paid at the moment the card cleared.
 *
 * The idempotency key is derived from the earnings being paid, so a run retried
 * after a crash is recognised by Stripe as the same transfer rather than a
 * second one. That is the single most expensive mistake this file can make.
 */
export async function createTransfer(input: {
  amount: number;
  currency: string;
  destination: string;
  idempotencyKey: string;
  metadata?: Record<string, string>;
}): Promise<{ transferId: string | null; error: string | null }> {
  try {
    const params: Record<string, string | number | undefined> = {
      amount: Math.round(input.amount),
      currency: input.currency.toLowerCase(),
      destination: input.destination,
    };
    for (const [k, v] of Object.entries(input.metadata ?? {})) params[`metadata[${k}]`] = v;

    const res = await fetch(`${STRIPE_API}/transfers`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: encode(params),
    });
    const json = (await res.json()) as { id?: string; error?: { message?: string } };
    if (!res.ok || !json.id) {
      return { transferId: null, error: json.error?.message ?? `Transfer refused (${res.status}).` };
    }
    return { transferId: json.id, error: null };
  } catch {
    return { transferId: null, error: "Could not reach the payment provider." };
  }
}

/**
 * Take a transfer back, when a stay is refunded after the host was paid.
 *
 * Partial by amount, because a partial refund should not claw back the whole
 * payout. Stripe refuses to reverse more than was sent, which is the backstop
 * for an arithmetic mistake here.
 */
export async function reverseTransfer(
  transferId: string,
  amount?: number,
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const res = await fetch(`${STRIPE_API}/transfers/${transferId}/reversals`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret()}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Stripe-Version": "2024-06-20",
      },
      body: encode({ amount: amount ? Math.round(amount) : undefined }),
    });
    const json = (await res.json()) as { error?: { message?: string } };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `Reversal refused (${res.status}).` };
    return { ok: true, error: null };
  } catch {
    return { ok: false, error: "Could not reach the payment provider." };
  }
}
