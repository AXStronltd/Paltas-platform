/**
 * Where a signed-in staff member goes next.
 *
 * One copy, because there are now three places that ask the question — the
 * management sign-in form, the OAuth callback, and the marketplace header's
 * modal — and three copies of this map is three chances for one of them to keep
 * sending people at a dashboard after onboarding stopped being optional.
 *
 * Pure, and imported by client components, so it stays free of anything from
 * src/server. The answer is a suggestion about what to render: every route it
 * names authorises the visitor again on its own.
 */
export const ROLE_DASHBOARDS: Record<string, string> = {
  developer: "/portal/developer",
  landlord: "/portal/landlord",
  agent: "/portal/agent",
  hotel: "/portal/hotel",
  seller: "/portal/seller",
};

export interface StaffDestinationInput {
  onboardingRequired?: boolean | null;
  dashboardRole?: string | null;
}

/**
 * Onboarding comes first and beats any role, because a role that has not been
 * approved yet is a claim rather than a grant. Only once onboarding is complete
 * and the account is active does the role decide the dashboard, and an account
 * with no role at all falls back to /manage, which shows whatever its
 * permissions actually reach.
 */
export function staffDestination(result: StaffDestinationInput | null | undefined): string {
  if (!result) return "/manage";
  if (result.onboardingRequired) return "/onboarding";
  return ROLE_DASHBOARDS[result.dashboardRole ?? ""] ?? "/manage";
}
