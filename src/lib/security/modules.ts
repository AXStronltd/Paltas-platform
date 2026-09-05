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
