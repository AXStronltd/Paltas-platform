/**
 * Mock providers. Each satisfies its interface exactly, so swapping in a real
 * provider later is a one-line change in the registry below — no journey edits.
 * The mock payment provider can simulate failure so the UI's failed/error
 * states are real and tested, not decorative.
 */

import type {
  PaymentProvider, KYCProvider, NotificationProvider, PaymentIntent,
} from "./interfaces";
import type { Result } from "@/lib/models";

const delay = <T>(v: T, ms = 500) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const ok = <T>(data: T): Result<T> => ({ data, error: null });

export const mockPaymentProvider: PaymentProvider = {
  name: "mock-psp",
  methods: ["card"],
  async charge({ amount, currency, description, method }): Promise<Result<PaymentIntent>> {
    const forceFail = /FAIL/i.test(description);
    await delay(null, 900);
    if (forceFail) {
      return ok<PaymentIntent>({ reference: ref(), status: "failed", amount, currency, provider: "mock-psp", method, failureReason: "Card declined by issuer" });
    }
    return ok<PaymentIntent>({ reference: ref(), status: "succeeded", amount, currency, provider: "mock-psp", method });
  },
  async refund(reference): Promise<Result<PaymentIntent>> {
    await delay(null, 600);
    return ok<PaymentIntent>({ reference, status: "succeeded", amount: 0, currency: "KES", provider: "mock-psp", method: "card" });
  },
};

export const mockKYCProvider: KYCProvider = {
  name: "mock-kyc",
  async startVerification(subjectId) { await delay(null, 200); return ok({ verificationId: "kyc_" + subjectId, status: "pending" as const }); },
  async getStatus() { await delay(null, 200); return ok({ status: "verified" as const }); },
};

export const mockNotificationProvider: NotificationProvider = {
  name: "mock-notify",
  async send() { await delay(null, 100); return ok({ delivered: true }); },
};

function ref() {
  return "PX-" + Math.random().toString(36).slice(2, 8).toUpperCase();
}
