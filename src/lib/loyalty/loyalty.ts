/**
 * Paltas Rewards — the rules, as pure functions.
 *
 * Loyalty schemes are where otherwise-honest products keep their dark patterns:
 * points with no stated cash value, tiers computed from a secret formula, and
 * balances that quietly expire. Having just argued in the pricing panel that a
 * guest should always know what they are paying, it would be incoherent to run a
 * rewards programme they cannot audit. So:
 *
 *  - **Points have a fixed, stated value.** 1 point = 1 shilling off. Not "up
 *    to", not variable by season. If the value can move, it is not a currency.
 *  - **Points are earned on completed stays**, never on booking. Points that
 *    vest at checkout and are clawed back on cancellation are a support burden
 *    and read as a bait-and-switch.
 *  - **Tier is a rolling 12-month window**, so status reflects the last year of
 *    custom rather than a lifetime total that can only ever go up.
 *  - **Expiry is long and visible.** 24 months from earning, and the UI shows
 *    the next batch to expire rather than letting it lapse silently.
 *
 * Everything here is pure so those claims are testable without a database.
 */

export type TierKey = "bronze" | "silver" | "gold" | "platinum";

export interface Tier {
  key: TierKey;
  name: string;
  /** Qualifying spend, in minor units, over the rolling window. */
  threshold: number;
  /** Points earned per 100 minor units spent. */
  earnRatePer100: number;
  perks: string[];
}

/**
 * Thresholds are qualifying *spend*, not points, so that the way in is legible:
 * "spend this much in a year and you reach this tier" needs no conversion.
 */
export const TIERS: Tier[] = [
  {
    key: "bronze",
    name: "Bronze",
    threshold: 0,
    earnRatePer100: 2,
    perks: ["2 points per KES 100 spent", "Member-only rates where hosts offer them"],
  },
  {
    key: "silver",
    name: "Silver",
    threshold: 150_000,
    earnRatePer100: 3,
    perks: ["3 points per KES 100 spent", "Free cancellation window extended by 24 hours", "Priority support"],
  },
  {
    key: "gold",
    name: "Gold",
    threshold: 500_000,
    earnRatePer100: 4,
    perks: ["4 points per KES 100 spent", "Late checkout when the property allows", "No booking amendment fees"],
  },
  {
    key: "platinum",
    name: "Platinum",
    threshold: 1_500_000,
    earnRatePer100: 5,
    perks: ["5 points per KES 100 spent", "Room upgrade on request", "Dedicated group-booking desk", "Annual bonus of 5,000 points"],
  },
];

/** One point is one shilling off. Fixed, and stated wherever points are shown. */
export const POINT_VALUE = 1;

/** Points lapse two years after they are earned. Long, and surfaced in the UI. */
export const EXPIRY_MONTHS = 24;

/** The rolling window over which tier-qualifying spend is counted. */
export const TIER_WINDOW_MONTHS = 12;

export const ROUNDING_NOTE =
  "Points are rounded down to the whole point, so a stay never earns more than it should.";

export function tierByKey(key: TierKey): Tier {
  return TIERS.find((t) => t.key === key) ?? TIERS[0];
}

/** The tier a given qualifying spend reaches. */
export function tierForSpend(qualifyingSpend: number): Tier {
  let reached = TIERS[0];
  for (const tier of TIERS) {
    if (qualifyingSpend >= tier.threshold) reached = tier;
  }
  return reached;
}

/**
 * Points earned by a completed stay.
 *
 * Rounded down, deliberately: rounding up would let a platform advertise a rate
 * it does not honour on the arithmetic.
 */
export function pointsForStay(amount: number, tier: Tier): number {
  if (amount <= 0) return 0;
  return Math.floor((amount / 100) * tier.earnRatePer100);
}

/** What a balance is worth, in minor units. */
export function pointsValue(points: number): number {
  return Math.max(0, Math.floor(points)) * POINT_VALUE;
}

/**
 * How many points to spend against a bill, and what remains.
 *
 * Never redeems more than the bill — a guest cannot be left with a negative
 * balance or a credit they did not ask for.
 */
export function redeem(points: number, billAmount: number): { pointsUsed: number; amountOff: number; pointsLeft: number } {
  const available = Math.max(0, Math.floor(points));
  const maxOff = Math.min(pointsValue(available), Math.max(0, billAmount));
  const pointsUsed = Math.ceil(maxOff / POINT_VALUE);
  return { pointsUsed, amountOff: maxOff, pointsLeft: available - pointsUsed };
}

export interface TierProgress {
  tier: Tier;
  next: Tier | null;
  /** Minor units still to spend before the next tier. */
  remaining: number;
  /** 0–100, how far through the current tier band. */
  percent: number;
}

/** Where someone stands, and what it would take to move up. */
export function tierProgress(qualifyingSpend: number): TierProgress {
  const tier = tierForSpend(qualifyingSpend);
  const next = TIERS[TIERS.findIndex((t) => t.key === tier.key) + 1] ?? null;
  if (!next) return { tier, next: null, remaining: 0, percent: 100 };

  const band = next.threshold - tier.threshold;
  const into = qualifyingSpend - tier.threshold;
  return {
    tier,
    next,
    remaining: Math.max(0, next.threshold - qualifyingSpend),
    percent: band > 0 ? Math.min(100, Math.max(0, Math.round((into / band) * 100))) : 100,
  };
}

export interface LedgerEntry {
  points: number;
  at: Date;
  kind: "EARN" | "REDEEM" | "ADJUST" | "EXPIRE";
  /** Spend that produced an EARN, used for tier qualification. */
  qualifyingSpend?: number;
}

/**
 * Balance from the ledger rather than a stored number.
 *
 * A mutable balance column is one bad write away from being wrong with no way to
 * tell; a ledger can always be re-derived and reconciled. Same reasoning as the
 * audit trail elsewhere in this product.
 */
export function balanceFrom(entries: LedgerEntry[]): number {
  return entries.reduce((total, e) => total + e.points, 0);
}

/** Spend inside the rolling tier window, which is what status is computed from. */
export function qualifyingSpendFrom(entries: LedgerEntry[], now = new Date()): number {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - TIER_WINDOW_MONTHS);
  return entries
    .filter((e) => e.kind === "EARN" && e.at >= cutoff)
    .reduce((total, e) => total + (e.qualifyingSpend ?? 0), 0);
}

/**
 * The next tranche of points to lapse, so it can be shown rather than sprung.
 * Earned points expire oldest-first; redemptions are assumed to consume the
 * oldest points, which is the arrangement that favours the member.
 */
export function nextExpiry(entries: LedgerEntry[], now = new Date()): { points: number; at: Date } | null {
  const earned = entries
    .filter((e) => e.kind === "EARN" && e.points > 0)
    .sort((a, b) => a.at.getTime() - b.at.getTime());
  if (earned.length === 0) return null;

  // Points already spent are taken off the oldest tranches first.
  let spent = entries
    .filter((e) => e.kind === "REDEEM" || e.kind === "EXPIRE")
    .reduce((total, e) => total + Math.abs(e.points), 0);

  for (const tranche of earned) {
    const remaining = tranche.points - Math.min(spent, tranche.points);
    spent = Math.max(0, spent - tranche.points);
    if (remaining <= 0) continue;

    const expiresAt = new Date(tranche.at);
    expiresAt.setMonth(expiresAt.getMonth() + EXPIRY_MONTHS);
    if (expiresAt <= now) continue;
    return { points: remaining, at: expiresAt };
  }
  return null;
}
