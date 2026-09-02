/**
 * Choosing and applying a group discount.
 *
 * Pure, so the rule that decides what a Hajj party of twelve is quoted can be
 * read and tested without a database or a request. The API calls this; nothing
 * here calls the API.
 */

export interface DiscountRule {
  id: string;
  name: string;
  kind: string;
  valueType: string;
  value: number;
  currency: string;
  minNights: number | null;
  minGuests: number | null;
  minUnits: number | null;
  minLeadDays: number | null;
  maxRedemptions: number | null;
  redemptionCount: number;
  startsAt: Date;
  endsAt: Date;
  active: boolean;
}

export interface BookingShape {
  guests: number;
  units: number;
  nights: number;
  /** Days between booking and check-in, for early-bird rules. */
  leadDays: number;
  /** Gross total in minor units, before discount. */
  amount: number;
  at?: Date;
}

/** Does this rule apply to this booking, right now? */
export function applies(rule: DiscountRule, booking: BookingShape): boolean {
  const now = booking.at ?? new Date();
  if (!rule.active) return false;
  if (rule.startsAt > now || rule.endsAt < now) return false;
  if (rule.maxRedemptions !== null && rule.redemptionCount >= rule.maxRedemptions) return false;
  if (rule.minGuests !== null && booking.guests < rule.minGuests) return false;
  if (rule.minUnits !== null && booking.units < rule.minUnits) return false;
  if (rule.minNights !== null && booking.nights < rule.minNights) return false;
  if (rule.minLeadDays !== null && booking.leadDays < rule.minLeadDays) return false;
  return true;
}

/** What this rule takes off, in minor units, never more than the total. */
export function amountOff(rule: DiscountRule, amount: number): number {
  const raw = rule.valueType === "PERCENTAGE"
    ? Math.round((amount * rule.value) / 100)
    : rule.value;
  return Math.max(0, Math.min(amount, raw));
}

/**
 * The single best rule for this booking.
 *
 * Deliberately best-one rather than all-of-them: stacking discounts is how a
 * platform ends up giving away a stay, and a guest reading "20% off" expects
 * 20% off, not an unpredictable compound. Ties break toward the earlier end
 * date, so the offer about to expire is the one honoured.
 */
export function bestDiscount(
  rules: DiscountRule[],
  booking: BookingShape,
): { rule: DiscountRule; amount: number } | null {
  const candidates = rules
    .filter((r) => applies(r, booking))
    .map((rule) => ({ rule, amount: amountOff(rule, booking.amount) }))
    .filter((c) => c.amount > 0);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) =>
    b.amount - a.amount || a.rule.endsAt.getTime() - b.rule.endsAt.getTime(),
  );
  return candidates[0];
}

/**
 * Split a total across members, to the minor unit, with no money lost or
 * invented. The remainder from integer division goes to the earliest members one
 * unit at a time, so the shares sum exactly to the total — an even split of 100
 * across 3 is 34/33/33, never 33.33 three times.
 */
export function splitEvenly(total: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
