import { isMock } from "@/lib/config";
import type { EscrowTransaction, Host, Currency, Result } from "@/lib/models";
import { apiPost, mockDelay } from "./apiClient";

/**
 * Escrow service — the two-sided money-protection engine.
 * Funds are HELD until BOTH the buyer and the host confirm; only then are they
 * released. This is PALTAS's trust moat. In mock mode the state lives in memory;
 * with the API it lives in the backend + a real settlement provider. The rules
 * (release only when both confirm) live here and never change.
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
  if (isMock()) {
    const tx: EscrowTransaction = {
      id: "esc_" + Date.now(), ...input,
      status: "held", buyerConfirmed: false, hostConfirmed: false, createdAt: Date.now(),
    };
    store.unshift(tx);
    return mockDelay({ data: tx, error: null });
  }
  // API: return apiPost<EscrowTransaction>(`/escrow`, input);
  return apiPost<EscrowTransaction>(`/escrow`, input);
}

export async function confirmAsBuyer(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.buyerConfirmed = true; settle(tx); }, `/escrow/${id}/confirm-buyer`);
}

export async function confirmAsHost(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.hostConfirmed = true; settle(tx); }, `/escrow/${id}/confirm-host`);
}

export async function raiseDispute(id: string): Promise<Result<EscrowTransaction>> {
  return transition(id, (tx) => { tx.status = "disputed"; }, `/escrow/${id}/dispute`);
}

export async function getMyEscrows(buyerId: string): Promise<Result<EscrowTransaction[]>> {
  if (isMock()) return mockDelay({ data: [...store], error: null });
  return apiPost<EscrowTransaction[]>(`/escrow/search`, { buyerId });
}

/** Core rule: release only when both sides have confirmed. */
function settle(tx: EscrowTransaction) {
  if (tx.buyerConfirmed && tx.hostConfirmed) tx.status = "released";
}

async function transition(
  id: string,
  mutate: (tx: EscrowTransaction) => void,
  apiPath: string
): Promise<Result<EscrowTransaction>> {
  if (isMock()) {
    const tx = store.find((t) => t.id === id);
    if (!tx) return { data: null as unknown as EscrowTransaction, error: { code: "not_found", message: "Escrow not found" } };
    mutate(tx);
    return mockDelay({ data: tx, error: null });
  }
  // API: return apiPost<EscrowTransaction>(apiPath, {});
  return apiPost<EscrowTransaction>(apiPath, {});
}
