/**
 * The shapes the authorisation engine reasons about.
 *
 * Kept apart from Prisma so the engine stays pure and testable: it decides using
 * only the values below, and never reaches for a database. Loading an actor is
 * the server's job (see `src/server/actor.ts`); deciding what that actor may do
 * is this module's job, and the two do not blur.
 */

export type ScopeType = "ORGANIZATION" | "PROPERTY" | "BUILDING" | "UNIT";

export interface Scope {
  type: ScopeType;
  id: string;
}

export type Effect = "ALLOW" | "DENY";

/**
 * One permission, pinned to one node of the Organization → Property → Building →
 * Unit tree. `permission` may be a wildcard (`visitor.*`) when it comes from a
 * role definition.
 */
export interface Grant {
  permission: string;
  effect: Effect;
  scopeType: ScopeType;
  scopeId: string;
  /** Where the grant came from — shown in the UI so an owner can see why. */
  source: "role" | "direct" | "owner" | "platform";
  roleName?: string;
}

export interface ActorRole {
  key: string;
  name: string;
  scopeType: ScopeType;
  scopeId: string;
}

/** The authenticated user, resolved with everything needed to decide. */
export interface Actor {
  id: string;
  orgId: string;
  name: string;
  email: string;
  isOwner: boolean;
  /**
   * Paltas staff operating the service itself. The only authority in the system
   * that crosses organisations — a tenant's owner is absolute inside their own
   * organisation and invisible outside it, whereas this reaches everywhere.
   */
  isPlatformAdmin: boolean;
  status: "ACTIVE" | "SUSPENDED" | "INVITED" | "PENDING" | "REJECTED";
  onboardingCompletedAt: Date | null;
  onboardingRole: string | null;
  roles: ActorRole[];
  grants: Grant[];
  /**
   * Modules the organisation has bought, from its subscription.
   *
   * Optional on purpose. Undefined means "not loaded", and an unloaded value
   * must not be read as "bought nothing" — a code path that forgets to fetch
   * entitlements would otherwise lock every customer out of every module at
   * once. Absent means unrestricted; present and empty means genuinely nothing.
   */
  entitledModules?: string[];
}

export interface Decision {
  allowed: boolean;
  /** Why — quoted back in 403 bodies and written to the audit trail on refusal. */
  reason: string;
  /** The grant that decided it, when one did. */
  matched?: Grant;
}

/**
 * What a list query is allowed to return. `all` is the owner's view; `none` short
 * -circuits to an empty result without touching the database; `scoped` is turned
 * into a Prisma `where` clause by the repositories.
 */
export type ScopeFilter =
  /** Every organisation — Paltas platform staff only. */
  | { kind: "platform" }
  /** Everything inside the actor's own organisation. */
  | { kind: "all" }
  | { kind: "none" }
  | {
      kind: "scoped";
      /**
       * True when the actor is allowed across the whole organisation but has
       * narrower carve-outs denied. The id lists are then empty and the filter
       * reads as "everything except the denied scopes".
       */
      orgWide: boolean;
      propertyIds: string[];
      buildingIds: string[];
      unitIds: string[];
      /** Scopes explicitly denied this permission — subtracted from the above. */
      deniedPropertyIds: string[];
      deniedBuildingIds: string[];
      deniedUnitIds: string[];
    };
