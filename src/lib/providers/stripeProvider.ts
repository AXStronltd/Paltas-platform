import type { PaymentProvider, ChargeInput, PaymentIntent } from "./interfaces";
import type { Result } from "@/lib/models";

/**
 * Stripe provider — handles cards, Apple/Google Pay, and bank transfers.
 *
 * SECURITY: Stripe's secret key must NEVER live in frontend code. The real flow
 * is: this client asks YOUR backend to create a PaymentIntent (backend holds the
 * secret key and calls Stripe), the client confirms it with Stripe.js using the
 * publishable key, and Stripe calls your backend webhook to confirm settlement.
 * The `// REAL:` comments mark exactly where that wiring goes. Today it is mocked
 * so the whole checkout journey runs without keys.
 */

function ref() {
  return "STRIPE-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const stripeProvider: PaymentProvider = {
  name: "stripe",
  methods: ["card", "apple_pay", "google_pay", "bank_transfer"],

  async charge(input: ChargeInput): Promise<Result<PaymentIntent>> {
    // REAL: const res = await apiPost('/payments/stripe/create-intent', {
    //   amount: input.amount, currency: input.currency, method: input.method,
    //   idempotencyKey: input.idempotencyKey });
    // then confirm client-side with Stripe.js (publishable key) and rely on the
    // Stripe webhook -> your backend for the authoritative settled status.
    const forceFail = /FAIL/i.test(input.description);
    await wait(900);
    if (forceFail) {
      return okIntent({ reference: ref(), status: "failed", input, failureReason: "Card declined by issuer" });
    }
    // Cards & wallets settle synchronously; bank transfer is treated as pending.
    const status = input.method === "bank_transfer" ? "pending" : "succeeded";
    return okIntent({
      reference: ref(), status, input,
      pendingHint: status === "pending" ? "Awaiting bank transfer confirmation" : undefined,
    });
  },

  async confirm(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: query your backend for the webhook-confirmed status of this intent.
    await wait(600);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "stripe", method: "bank_transfer" }, error: null };
  },

  async refund(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/stripe/refund', { reference });
    await wait(500);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "stripe", method: "card" }, error: null };
  },
};

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function okIntent(p: { reference: string; status: PaymentIntent["status"]; input: ChargeInput; failureReason?: string; pendingHint?: string }): Result<PaymentIntent> {
  return {
    data: {
      reference: p.reference, status: p.status, amount: p.input.amount, currency: p.input.currency,
      provider: "stripe", method: p.input.method, failureReason: p.failureReason, pendingHint: p.pendingHint,
    },
    error: null,
  };
}
