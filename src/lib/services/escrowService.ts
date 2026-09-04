import type { EscrowTransaction, Host, Currency, Result } from "@/lib/models";
import { mockDelay } from "./apiClient";

/**
 * Escrow service — the two-sided money-protection engine.
 *
 * Funds are HELD until BOTH the buyer and the host confirm; only then are they
 * released. That rule is the point of the module and does not change.
 *
 * The state lives in memory, in this process. It used to read as though a
 * config switch would move it to "the backend + a real settlement provider",
 * but the branch that claimed to do that posted to `/escrow`, which this
 * application does not serve, and it was unreachable anyway. Money that has
 * actually moved is Stripe's business and is recorded in Postgres — see
 * src/server/stripe.ts and src/server/payouts.ts. This module backs the
 * marketplace checkout demo path only, and being in memory means it is
 * per-process and does not survive a restart.
 */

const store: EscrowTransaction[] = [];

interface CreateEscrowInput {
  code: string;
  kind: "booking" | "offer";
  property: string;
  location: string;
  amount: number;
  currency: Currency;
  buyerId: string;
  buyerName: string;
  host: Host;
  dates: string;
  guests: number;
}

export async function createEscrow(input: CreateEscrowInput): Promise<Result<EscrowTransaction>> {
  const tx: EscrowTransaction = {
    id: "esc_" + Date.now(), ...input,
    status: "held", buyerConfirmed: false, hostConfirmed: false, createdAt: Date.now(),
  };
  store.unshift(tx);
  return mockDelay({ data: tx, error: null });
}

export async function confirmAsBuyer(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.buyerConfirmed = true; settle(tx); });
}

export async function confirmAsHost(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.hostConfirmed = true; settle(tx); });
}

export async function raiseDispute(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.status = "disputed"; });
}

export async function getMyEscrows(buyerId: string): Promise<Result<EscrowTransaction[]>> {
  return mockDelay({ data: [...store], error: null });
}

/** Core rule: release only when both sides have confirmed. */
function settle(tx: EscrowTransaction) {
  if (tx.buyerConfirmed && tx.hostConfirmed) tx.status = "released";
}

async function transition(
  id: string,
  mutate: (tx: EscrowTransaction) => void,
): Promise<Result<EscrowTransaction>> {
  const tx = store.find((t) => t.id === id);
  if (!tx) return { data: null as unknown as EscrowTransaction, error: { code: "not_found", message: "Escrow not found" } };
  mutate(tx);
  return mockDelay({ data: tx, error: null });
}
