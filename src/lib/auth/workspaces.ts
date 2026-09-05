import { ROLE_DASHBOARDS } from "./destination";

/**
 * The workspaces one account can actually open.
 *
 * Not a menu of everything PALTAS has — a list of the places this particular
 * person may go, derived from what they hold. A landlord holds two: the
 * landlord portal, and a management console showing six of its twelve sections.
 * A tenant holds one. Paltas staff hold the operations console as well.
 *
 * That plurality is why a chooser is worth building at all. It was not obvious:
 * `onboardingRole` is a single column, so it looks as though everyone has one
 * workspace and a chooser would be a list of one. The role portal and the
 * management console are two different places, reached with the same account.
 *
 * Pure, and takes only what it needs, so it can be tested without a database
 * and used on either side of the wire.
 */

export interface Workspace {
  /** Stable id, used in URLs and as a React key. */
  key: string;
  href: string;
  /** Message key. The catalogues hold the words. */
  labelKey: string;
  descriptionKey: string;
  /** Set only for organisations, whose names are data, not translations. */
  name?: string;
}

export interface WorkspaceInput {
  /** developer | landlord | agent | hotel | seller, or null. */
  dashboardRole?: string | null;
  /** Permission keys the account holds anywhere. */
  permissions?: string[];
  isPlatformAdmin?: boolean;
  /** Organisations this account belongs to. One is the ordinary case. */
  organizations?: WorkspaceOrg[];
  /** The organisation currently being acted inside — `User.orgId`. */
  activeOrgId?: string | null;
}

export interface WorkspaceOrg {
  id: string;
  name: string;
}

/**
 * Any one of these means the management console has something on it.
 *
 * Checked rather than assumed: an account that holds none of them would open
 * /manage to a sidebar of nothing, and offering that as a "workspace" is
 * offering an empty room.
 */
const MANAGE_PERMISSIONS = [
  "owner.dashboard.view", "property.view", "visitor.view", "listing.view",
  "fee.category.view", "payroll.view", "payment.connect.manage",
  "discount.view", "loyalty.view", "group.view", "staff.view", "audit.view",
];

export function availableWorkspaces(input: WorkspaceInput): Workspace[] {
  const spaces: Workspace[] = [];
  const held = new Set(input.permissions ?? []);

  // Their own portal first: it is the one shaped around what they do.
  const role = input.dashboardRole ?? "";
  if (ROLE_DASHBOARDS[role]) {
    spaces.push({
      key: role,
      href: ROLE_DASHBOARDS[role],
      labelKey: `ws.${role}`,
      descriptionKey: `ws.${role}.sub`,
    });
  }

  // The management console, when it would not be empty.
  if (input.isPlatformAdmin || MANAGE_PERMISSIONS.some((p) => held.has(p))) {
    spaces.push({
      key: "manage",
      href: "/manage",
      labelKey: "ws.manage",
      descriptionKey: "ws.manage.sub",
    });
  }

  // A second organisation is the one case where the account itself, not the
  // area of the app, is the thing being chosen. Almost nobody has one today —
  // every account was backfilled with exactly one membership — so this stays
  // out of the way entirely until a person genuinely belongs to two, rather
  // than showing everyone a company picker with their own company in it.
  const orgs = input.organizations ?? [];
  if (orgs.length > 1) {
    for (const org of orgs) {
      if (org.id === input.activeOrgId) continue;
      spaces.push({
        key: `org:${org.id}`,
        href: `/workspace/switch?org=${encodeURIComponent(org.id)}`,
        labelKey: "ws.org",
        descriptionKey: "ws.org.sub",
        // The only workspace whose name is data rather than a message key:
        // an organisation is called what its owner called it.
        name: org.name,
      });
    }
  }

  return spaces;
}

/**
 * Where to send someone after they sign in.
 *
 * One workspace means there is nothing to choose, so choosing is skipped — a
 * chooser that always shows a single card is a click that decides nothing, on
 * every login, forever. Two or more, and the person picks.
 */
export function landingFor(input: WorkspaceInput): string {
  const spaces = availableWorkspaces(input);
  if (spaces.length === 0) return "/manage";
  if (spaces.length === 1) return spaces[0].href;
  return "/workspace";
}
