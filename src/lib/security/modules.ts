/**
 * What an organisation has bought, as opposed to what a person may do.
 *
 * These are two different questions and PALTAS needs both. RBAC answers "may
 * this person do it" — a role, held by a user, scoped to a property. This
 * answers "has this organisation paid for the feature at all". A finance
 * manager with every finance permission still cannot open the finance module if
 * their company is on a plan that does not include it, and no amount of role
 * editing should change that.
 *
 * The vocabulary is deliberately not a new one. Every permission is already
 * namespaced by its area — `visitor.approve`, `payroll.view` — so a module is a
 * set of those namespaces rather than a second catalogue that has to be kept in
 * step with the first. Adding a permission to an existing namespace entitles it
 * automatically; adding a new namespace fails the exhaustiveness test below
 * until somebody decides which module sells it.
 *
 * Dependency-free, like the permission catalogue it mirrors, so it can be used
 * on the server and in the browser.
 */

export const MODULES = {
  /** Everything an organisation needs to exist at all. Never sold separately. */
  core: [
    "property", "building", "unit", "resident", "staff", "role",
    "invitation", "owner", "audit", "report", "group",
  ],
  security: ["security", "visitor", "guard", "gate", "pass", "vehicle", "shift", "card"],
  finance: ["finance", "payment", "payroll"],
  bookings: ["booking", "availability", "roomtype", "service"],
  marketplace: ["listing", "lead", "viewing", "review"],
  growth: ["campaign", "discount", "loyalty"],
  projects: ["project", "external"],
  maintenance: ["maintenance"],
} as const;

export type ModuleKey = keyof typeof MODULES;

export const ALL_MODULES = Object.keys(MODULES) as ModuleKey[];

/**
 * Core is not optional.
 *
 * A subscription that lapses must still let its owner sign in, see their
 * properties and pay the invoice. Locking someone out of the record of what
 * they owe is not a way to get paid.
 */
export const ALWAYS_ON: ModuleKey[] = ["core"];

const NAMESPACE_TO_MODULE: Record<string, ModuleKey> = Object.fromEntries(
  Object.entries(MODULES).flatMap(([mod, namespaces]) =>
    namespaces.map((ns) => [ns, mod as ModuleKey]),
  ),
);

/**
 * Which module sells this permission.
 *
 * An unrecognised namespace returns null, and a null is treated as always
 * allowed by the caller. That is the safe direction: a permission nobody has
 * classified yet keeps working exactly as it does today, rather than silently
 * becoming unreachable for every customer at once.
 */
export function moduleForPermission(permission: string): ModuleKey | null {
  const namespace = permission.split(".")[0];
  return NAMESPACE_TO_MODULE[namespace] ?? null;
}

/** Does this set of modules cover the permission? */
export function moduleEntitles(modules: readonly string[], permission: string): boolean {
  const mod = moduleForPermission(permission);
  if (!mod) return true;
  if (ALWAYS_ON.includes(mod)) return true;
  return modules.includes(mod);
}

/** A subscription, reduced to the two facts entitlement depends on. */
export interface SubscriptionView {
  status: string;
  modules: readonly string[];
}

/** An exception recorded against one organisation. */
export interface EntitlementView {
  module: string;
  granted: boolean;
  expiresAt?: Date | string | null;
}

/**
 * Statuses that still buy access.
 *
 * Past-due keeps working. Chasing an invoice and cutting a landlord off from
 * their own tenants mid-tenancy are different things, and the second one costs
 * more than it collects.
 */
const PAYING = new Set(["TRIALING", "ACTIVE", "PAST_DUE"]);

/**
 * Plan plus exceptions, resolved to the modules an organisation may use.
 *
 * Pure, and takes `now` rather than reading the clock, so the expiry rule can be
 * tested at both sides of the boundary. Kept here — not in the server module
 * that loads the rows — because two callers need it: the one that has only an
 * organisation id, and the actor loader that already has the rows in hand and
 * should not fetch them twice.
 */
export function composeModules(
  subscription: SubscriptionView | null | undefined,
  exceptions: readonly EntitlementView[],
  now: Date = new Date(),
): string[] {
  // No subscription means nobody has decided yet, not that everything is
  // refused. A new customer seeing an empty product because a row was missed is
  // a worse failure than one seeing too much, and the boot sweep closes it.
  const base = subscription
    ? PAYING.has(subscription.status) ? subscription.modules : []
    : ALL_MODULES.filter((m) => !ALWAYS_ON.includes(m));

  const modules = new Set<string>(base);
  for (const e of exceptions) {
    if (e.expiresAt && new Date(e.expiresAt) <= now) continue;
    if (e.granted) modules.add(e.module);
    else modules.delete(e.module);
  }
  return [...modules];
}
