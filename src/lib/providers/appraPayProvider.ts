import type { PaymentProvider, ChargeInput, PaymentIntent } from "./interfaces";
import type { Result } from "@/lib/models";

/**
 * Appra Pay provider — a payment GATEWAY that routes card & bank payments.
 *
 * As a gateway, Appra Pay accepts the booking payment and routes it to the
 * underlying rail; PALTAS only talks to Appra Pay's API. Like Stripe, the secret
 * credentials live on YOUR backend, never here. `// REAL:` marks the wiring.
 */

function ref() {
  return "APPRA-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

export const appraPayProvider: PaymentProvider = {
  name: "appra-pay",
  methods: ["card", "bank_transfer"],

  async charge(input: ChargeInput): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/appra/charge', {
    //   amount, currency, method: input.method, idempotencyKey });
    // Appra Pay routes to the card/bank rail and returns a status; settlement is
    // confirmed via its webhook -> your backend.
    await wait(850);
    if (/FAIL/i.test(input.description)) {
      return fail(ref(), input, "Payment routing failed at gateway");
    }
    const status = input.method === "bank_transfer" ? "pending" : "succeeded";
    return {
      data: {
        reference: ref(), status, amount: input.amount, currency: input.currency,
        provider: "appra-pay", method: input.method,
        pendingHint: status === "pending" ? "Awaiting bank confirmation via Appra Pay" : undefined,
      },
      error: null,
    };
  },

  async confirm(reference: string): Promise<Result<PaymentIntent>> {
    await wait(600);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "appra-pay", method: "bank_transfer" }, error: null };
  },

  async refund(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/appra/refund', { reference });
    await wait(500);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "appra-pay", method: "card" }, error: null };
  },
};

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function fail(reference: string, input: ChargeInput, reason: string): Result<PaymentIntent> {
  return { data: { reference, status: "failed", amount: input.amount, currency: input.currency, provider: "appra-pay", method: input.method, failureReason: reason }, error: null };
}
