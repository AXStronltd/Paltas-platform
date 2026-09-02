/**
 * Provider abstraction layer.
 *
 * PALTAS is a stays/real-estate marketplace, so its integrations are the ones a
 * marketplace needs: take a booking payment, hold it in escrow, verify hosts,
 * and notify guests. These are INTERFACES — the product depends only on them,
 * never on a concrete provider. A mock provider satisfies them today; a real
 * one (a licensed PSP, an escrow/settlement partner, a KYC vendor) is dropped
 * in later by implementing the same interface. No user journey changes.
 *
 * This is exactly the "do not hard-code around one provider" requirement,
 * scoped to what PALTAS actually does — not a payments-transfer app.
 */

import type { Currency, Result } from "@/lib/models";

/** Payment methods a provider can offer at checkout. */
export type PaymentMethod =
  | "card"
  | "apple_pay"
  | "google_pay"
  | "bank_transfer"
  | "mobile_money"
  | "appra_pay";

/** Result of attempting to take a booking payment. */
export interface PaymentIntent {
  reference: string;
  /** "pending" is used by async rails like mobile money (awaiting STK push / OTP). */
  status: "processing" | "pending" | "succeeded" | "failed";
  amount: number;
  currency: Currency;
  provider: string;
  method: PaymentMethod;
  failureReason?: string;
  /** For mobile money: a human hint shown while we await confirmation. */
  pendingHint?: string;
}

export interface ChargeInput {
  amount: number;
  currency: Currency;
  idempotencyKey: string;
  description: string;
  method: PaymentMethod;
  /** Mobile money needs the payer's phone; card/wallet need their own fields (collected by provider UI later). */
  phone?: string;
}

/** Collects the guest's booking payment. A real impl wraps a licensed PSP. */
export interface PaymentProvider {
  readonly name: string;
  /** Which methods this provider supports — drives the checkout selector. */
  readonly methods: PaymentMethod[];
  charge(input: ChargeInput): Promise<Result<PaymentIntent>>;
  /** Poll/confirm an async (pending) payment such as mobile money. */
  confirm?(reference: string): Promise<Result<PaymentIntent>>;
  refund(reference: string): Promise<Result<PaymentIntent>>;
}

/** Holds booking funds until both sides confirm, then releases to the host. */
export interface EscrowProvider {
  readonly name: string;
  hold(input: { reference: string; amount: number; currency: Currency }): Promise<Result<{ escrowRef: string }>>;
  release(escrowRef: string): Promise<Result<{ released: true }>>;
  reverse(escrowRef: string): Promise<Result<{ reversed: true }>>;
}

/** Verifies host / listing identity & ownership (the "Verified" badge). */
export interface KYCProvider {
  readonly name: string;
  startVerification(subjectId: string): Promise<Result<{ verificationId: string; status: "pending" }>>;
  getStatus(verificationId: string): Promise<Result<{ status: "pending" | "verified" | "rejected" }>>;
}

/** Sends booking confirmations, receipts, and updates (email/in-app/SMS). */
export interface NotificationProvider {
  readonly name: string;
  send(input: { to: string; channel: "email" | "sms" | "in-app"; title: string; body: string }): Promise<Result<{ delivered: boolean }>>;
}
