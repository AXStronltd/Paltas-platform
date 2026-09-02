/**
 * Provider registry - the single place that decides WHICH providers exist and
 * how a chosen payment method routes to a provider.
 *
 * PALTAS now offers three payment providers, all behind the same interface:
 *   - Stripe        card, Apple/Google Pay, bank transfer
 *   - Appra Pay     gateway routing card & bank
 *   - Mobile Money  all major African networks (STK push)
 *
 * To add or replace a provider, implement PaymentProvider and register it here.
 * Nothing in the checkout journey changes.
 */

import type { EscrowProvider, KYCProvider, NotificationProvider, PaymentProvider, PaymentMethod } from "./interfaces";
import { mockEscrowProvider, mockKYCProvider, mockNotificationProvider } from "./mock";
import { stripeProvider } from "./stripeProvider";
import { appraPayProvider } from "./appraPayProvider";
import { mobileMoneyProvider } from "./mobileMoneyProvider";

export const paymentProviders: PaymentProvider[] = [
  stripeProvider,
  appraPayProvider,
  mobileMoneyProvider,
];

export interface PaymentOption {
  method: PaymentMethod;
  providerName: string;
  label: string;
  sublabel: string;
  icon: string;
}

export function paymentOptions(): PaymentOption[] {
  const labels: Record<PaymentMethod, { label: string; sublabel: string; icon: string }> = {
    card: { label: "Card", sublabel: "Visa, Mastercard", icon: "💳" },
    apple_pay: { label: "Apple Pay", sublabel: "Fast & secure", icon: "" },
    google_pay: { label: "Google Pay", sublabel: "Fast & secure", icon: "🟢" },
    bank_transfer: { label: "Bank transfer", sublabel: "Direct from your bank", icon: "🏦" },
    mobile_money: { label: "Mobile money", sublabel: "M-Pesa, Airtel, MTN & more", icon: "📱" },
    appra_pay: { label: "Appra Pay", sublabel: "Pay via Appra", icon: "🅰️" },
  };
  const opts: PaymentOption[] = [];
  const seen = new Set<string>();
  for (const p of paymentProviders) {
    for (const m of p.methods) {
      const key = m + ":" + p.name;
      if (seen.has(key)) continue;
      seen.add(key);
      opts.push({ method: m, providerName: p.name, label: labels[m].label, sublabel: labels[m].sublabel, icon: labels[m].icon });
    }
  }
  return opts;
}

export function providerFor(method: PaymentMethod, providerName: string): PaymentProvider {
  return paymentProviders.find((p) => p.name === providerName && p.methods.includes(method)) ?? stripeProvider;
}

export const providers = {
  payment: stripeProvider,
  escrow: mockEscrowProvider,
  kyc: mockKYCProvider,
  notification: mockNotificationProvider,
};
