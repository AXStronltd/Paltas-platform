/**
 * May we publish this?
 *
 * One pure function decides, so the rule that keeps someone else's photographs
 * off our shopfront can be read in full and tested without a database or a
 * network. Everything that writes an external listing asks this first, and the
 * answer is stored on the row — public queries then filter on a column rather
 * than recomputing the rule, so a query that forgets it returns nothing rather
 * than everything.
 *
 * The default is refusal. A source with no recorded licence is ingested for
 * internal analysis and never displayed. That is deliberate: the failure mode
 * of being too cautious is an emptier page, and the failure mode of being too
 * permissive is publishing a photographer's work commercially without their
 * permission.
 *
 * Three rights are tracked separately because they genuinely are separate:
 *
 *   Facts — price, bedrooms, floor area. Individually these are not
 *   copyrightable in most jurisdictions. A substantial extract of a database
 *   of them can still infringe the EU sui generis database right, which is why
 *   facts alone are not enough to publish.
 *
 *   Photographs and descriptions. Almost always owned by the photographer,
 *   agent or originating portal, and the thing rights holders actually sue
 *   over. Needs its own grant.
 *
 *   Agent names, phones and emails. Personal data. Republishing it is
 *   processing under GDPR and needs a lawful basis, and Article 14 notice to
 *   people who never gave it to us. Needs its own grant again.
 */

export type LicenceStatus = "NONE" | "RESEARCH_ONLY" | "LICENSED";

export interface SourceLicence {
  key: string;
  licenceStatus: LicenceStatus;
  displayRights: boolean;
  imageRights: boolean;
  contactDataRights: boolean;
  /** ISO country codes the licence covers. Empty means unrestricted. */
  territories: string[];
  licenceExpiry: Date | null;
  active: boolean;
}

export interface ListingFacts {
  country?: string | null;
  suppressed?: boolean;
}

export interface Verdict {
  /** May the listing appear on the public marketplace at all? */
  displayable: boolean;
  /** May its photographs be shown? */
  images: boolean;
  /** May the agent's contact details be shown? */
  contact: boolean;
  /** Plain words, stored on the row so the decision can be explained later. */
  reason: string;
}

const REFUSE = (reason: string): Verdict =>
  ({ displayable: false, images: false, contact: false, reason });

export function evaluateLicence(
  source: SourceLicence,
  listing: ListingFacts = {},
  now: Date = new Date(),
): Verdict {
  // A takedown outranks everything, including a valid licence. A rights holder
  // who asks us to remove something should not have to ask twice because a
  // later sync re-created the row.
  if (listing.suppressed) return REFUSE("Suppressed following a takedown request.");

  if (!source.active) return REFUSE("Source is not active.");

  if (source.licenceStatus === "NONE") {
    return REFUSE("No licence recorded for this source — internal analysis only.");
  }
  if (source.licenceStatus === "RESEARCH_ONLY") {
    return REFUSE("Licensed for research and pricing analysis only, not for display.");
  }

  // LICENSED, but display is still granted separately: a data licence for
  // market analysis is not the same as permission to republish.
  if (!source.displayRights) {
    return REFUSE("Licence does not grant public display rights.");
  }

  if (source.licenceExpiry && source.licenceExpiry <= now) {
    return REFUSE(`Licence expired on ${source.licenceExpiry.toISOString().slice(0, 10)}.`);
  }

  // A licence for Spain does not cover a listing in Kenya. An unknown country
  // is refused rather than assumed to be inside the territory.
  if (source.territories.length > 0) {
    const country = listing.country?.toUpperCase();
    if (!country) return REFUSE("Licence is territory-limited and this listing has no country.");
    if (!source.territories.map((t) => t.toUpperCase()).includes(country)) {
      return REFUSE(`Licence does not cover ${country}.`);
    }
  }

  return {
    displayable: true,
    images: source.imageRights,
    contact: source.contactDataRights,
    reason: source.imageRights
      ? "Licensed for display."
      : "Licensed for display, without image rights — photographs withheld.",
  };
}

/**
 * Strip a listing down to what the licence actually permits.
 *
 * Applied on the way out, every time, rather than trusted to the caller. If a
 * licence covers the facts but not the photographs, the photographs must not
 * be in the payload at all — not merely hidden by the UI, which is one CSS
 * change away from being published.
 */
export function applyLicence<T extends {
  images: string[];
  agentName?: string | null;
  agentPhone?: string | null;
  agentEmail?: string | null;
  description?: string | null;
}>(listing: T, verdict: Verdict): T {
  return {
    ...listing,
    images: verdict.images ? listing.images : [],
    agentName: verdict.contact ? listing.agentName : null,
    agentPhone: verdict.contact ? listing.agentPhone : null,
    agentEmail: verdict.contact ? listing.agentEmail : null,
  };
}
