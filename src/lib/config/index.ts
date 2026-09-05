/**
 * Runtime configuration.
 *
 * There used to be a `dataSource` switch here — "mock" or "api" — described as
 * the seam that would make the frontend API-ready. It was never flipped, and by
 * the time the real backend existed it had stopped meaning what it said:
 *
 *   The marketplace read real listings from the database in BOTH branches. The
 *   "api" branch pointed at `/listings`, which is not an endpoint this app has;
 *   the real one is `/api/public/listings`, reached another way entirely. So
 *   setting NEXT_PUBLIC_DATA_SOURCE=api — the obvious thing to do on seeing a
 *   variable set to "mock" on a live site — would have broken the homepage,
 *   not made it real.
 *
 *   Two of the services behind it, portals and escrow, were imported by
 *   nothing at all. The four role portals had long since moved to the real
 *   management API. (The escrow service has since been deleted outright —
 *   PALTAS is not authorised to hold client funds.)
 *
 * A switch that does not do what its name says is worse than no switch, and a
 * live deployment reading `mock` in its own configuration cannot be reasoned
 * about by anybody. It is gone, along with the code it guarded.
 *
 * What is left is one flag, explicit and off by default.
 */

export const config = {
  /**
   * Whether to pad the shopfront with example properties that cannot be booked.
   *
   * For local development only. Opt in explicitly: an unset variable must never
   * show a visitor fiction, and this is deliberately not derived from NODE_ENV,
   * a hostname, or anything else that could be true by accident in production.
   */
  demoCatalogue: process.env.NEXT_PUBLIC_DEMO_CATALOGUE === "true",
} as const;

/**
 * Every caller that renders something a visitor can see must ask this.
 *
 * It used to ride on `dataSource === "mock"`, which meant the live site padded
 * its shopfront with six invented properties — "Palm Court Inn", "Beachfront
 * Family Villa" — attributed to hosts marked "✓ Verified" who do not exist,
 * and whose Book button offered to "simulate a failed payment". Where the
 * catalogue comes from was never the same decision as whether to show visitors
 * properties that cannot be booked.
 */
export const showDemoCatalogue = () => config.demoCatalogue;
