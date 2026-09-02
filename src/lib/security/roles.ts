/**
 * System roles.
 *
 * These are starting points, not straitjackets. Assigning "Security Guard" gives
 * a guard exactly the gate-side permissions and nothing else — no rent, no
 * contracts, no resident contact details — but the owner can still add a single
 * permission to one guard, or take one away, without inventing a new role. That
 * is the point of keeping per-user grants alongside roles.
 *
 * The definitions live in `system-roles.json` rather than in this file because
 * the database seed needs them too, and two copies of the answer to "what can a
 * guard do" is exactly the kind of drift this module exists to prevent.
 * Wildcards (`visitor.*`) are allowed there to keep the lists readable.
 */

import definitions from "./system-roles.json";
import { WILDCARD, isKnownPermission } from "./permissions";

export interface SystemRole {
  key: string;
  name: string;
  description: string;
  permissions: string[];
}

export const SYSTEM_ROLES: SystemRole[] = definitions;

export const SYSTEM_ROLE_KEYS = SYSTEM_ROLES.map((r) => r.key);

export function systemRole(key: string): SystemRole | undefined {
  return SYSTEM_ROLES.find((r) => r.key === key);
}

/**
 * Every permission a role hands out, wildcards included. Used by the permission
 * editor to show what a role covers before it is assigned.
 */
export function rolePermissions(key: string): string[] {
  return systemRole(key)?.permissions ?? [];
}

/**
 * Catch a role definition that names a permission the product does not have —
 * a typo in a role is a silent hole, since a permission nothing grants is a
 * permission nobody has.
 */
export function unknownPermissionsInRoles(): { role: string; permission: string }[] {
  const bad: { role: string; permission: string }[] = [];
  for (const role of SYSTEM_ROLES) {
    for (const permission of role.permissions) {
      if (permission === WILDCARD || permission.endsWith(".*")) continue;
      if (!isKnownPermission(permission)) bad.push({ role: role.key, permission });
    }
  }
  return bad;
}
