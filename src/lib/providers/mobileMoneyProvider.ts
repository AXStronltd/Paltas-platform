import type { PaymentProvider, ChargeInput, PaymentIntent } from "./interfaces";
import type { Result } from "@/lib/models";

/**
 * Mobile money provider — all major African networks (M-Pesa, Airtel Money,
 * MTN MoMo, etc.). The network is auto-detected from the phone prefix by the
 * real gateway; the guest just enters their number.
 *
 * FLOW (this is why mobile money needs its own path): charge() triggers an STK
 * push / prompt to the phone and returns `pending`. The guest approves on their
 * handset; your backend receives the network callback and marks it settled.
 * The UI polls confirm() until succeeded/failed. `// REAL:` marks the wiring.
 */

function ref() {
  return "MM-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// simple in-memory pending store so the mock confirm() can resolve
const pending = new Map<string, { input: ChargeInput; attempts: number }>();

export const mobileMoneyProvider: PaymentProvider = {
  name: "mobile-money",
  methods: ["mobile_money"],

  async charge(input: ChargeInput): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/mobile-money/stk-push', {
    //   amount, currency, phone: input.phone, idempotencyKey });
    // The gateway prompts the phone; you return pending and await the callback.
    if (!input.phone || input.phone.replace(/\D/g, "").length < 9) {
      return fail(ref(), input, "Enter a valid mobile money number");
    }
    if (/FAIL/i.test(input.description)) {
      return fail(ref(), input, "Payment was declined on the handset");
    }
    const reference = ref();
    pending.set(reference, { input, attempts: 0 });
    await wait(700);
    return {
      data: {
        reference, status: "pending", amount: input.amount, currency: input.currency,
        provider: "mobile-money", method: "mobile_money",
        pendingHint: `Check your phone ${maskPhone(input.phone)} and enter your PIN to approve`,
      },
      error: null,
    };
  },

  async confirm(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: read the webhook-confirmed status of this STK push from your backend.
    const p = pending.get(reference);
    await wait(1200);
    if (!p) {
      return { data: { reference, status: "failed", amount: 0, currency: "KES", provider: "mobile-money", method: "mobile_money", failureReason: "Request expired" }, error: null };
    }
    p.attempts += 1;
    // mock: confirm on the 2nd poll to mimic the guest approving on their phone
    if (p.attempts >= 2) {
      pending.delete(reference);
      return { data: { reference, status: "succeeded", amount: p.input.amount, currency: p.input.currency, provider: "mobile-money", method: "mobile_money" }, error: null };
    }
    return { data: { reference, status: "pending", amount: p.input.amount, currency: p.input.currency, provider: "mobile-money", method: "mobile_money", pendingHint: "Waiting for you to approve on your phone…" }, error: null };
  },

  async refund(reference: string): Promise<Result<PaymentIntent>> {
    // REAL: await apiPost('/payments/mobile-money/refund', { reference });
    await wait(500);
    return { data: { reference, status: "succeeded", amount: 0, currency: "KES", provider: "mobile-money", method: "mobile_money" }, error: null };
  },
};

function wait(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function maskPhone(p: string) { const d = p.replace(/\D/g, ""); return d.length > 4 ? "•••• " + d.slice(-3) : p; }
function fail(reference: string, input: ChargeInput, reason: string): Result<PaymentIntent> {
  return { data: { reference, status: "failed", amount: input.amount, currency: input.currency, provider: "mobile-money", method: "mobile_money", failureReason: reason }, error: null };
}
