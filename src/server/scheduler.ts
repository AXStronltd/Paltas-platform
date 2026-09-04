import type { Actor } from "@/lib/security/types";

/**
 * Who the audit trail names when a machine did it.
 *
 * Not a user, and deliberately not able to become one: no roles, no grants, and
 * a status that would fail every guard in the platform. It exists so an entry
 * can say a scheduler did this, rather than borrowing the name of whichever
 * member of staff last touched the settings.
 *
 * Here rather than inside one route because there are two schedulers now — the
 * payout run and the outbox flush — and an identity defined twice is an
 * identity that will eventually disagree with itself.
 */
export const SCHEDULER: Actor = {
  id: "system:scheduler",
  orgId: "",
  name: "Scheduler",
  email: "",
  isOwner: false,
  isPlatformAdmin: false,
  status: "SUSPENDED",
  onboardingCompletedAt: null,
  onboardingRole: null,
  roles: [],
  grants: [],
};
