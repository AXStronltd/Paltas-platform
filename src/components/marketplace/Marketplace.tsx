"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import type { Listing, SearchFilters } from "@/lib/models";
import { useI18n } from "@/components/i18n/LocaleProvider";
import { searchListings } from "@/lib/services/listingService";
import { ListingCard } from "./ListingCard";

/**
 * The categories a visitor can filter by.
 *
 * "For sale", "New projects" and "City apartments" all carried `key: "all"` —
 * three different promises that applied the same filter and returned the same
 * list. A category that does not narrow anything is a lie about the inventory.
 *
 * They now carry a real filter each: `kind` for the transaction, `mode` for the
 * kind of stay, and `type` for the shape of the property.
 */
interface Category {
  id: string;
  labelKey: string;
  icon: string;
  filter: Partial<SearchFilters>;
  /** Narrowed after the search, where the API has no matching parameter. */
  refine?: (l: Listing) => boolean;
}

const CATEGORIES: Category[] = [
  { id: "all",        labelKey: "cat.all",        icon: "🌍", filter: { mode: "all" } },
  { id: "stays",      labelKey: "cat.stays",      icon: "🛏️", filter: { mode: "stays" } },
  { id: "hotels",     labelKey: "cat.hotels",     icon: "🏨", filter: { mode: "hotel" } },
  { id: "rent",       labelKey: "cat.rent",       icon: "🔑", filter: { kind: "RENT" } },
  { id: "sale",       labelKey: "cat.sale",       icon: "🏷️", filter: { kind: "SALE" } },
  // A development is a project the platform is selling off-plan; until one is
  // published as a listing this is the sale list narrowed to new-build wording.
  { id: "projects",   labelKey: "cat.projects",   icon: "🏢", filter: { kind: "SALE" },
    refine: (l) => /project|development|off.?plan|new build|phase/i.test(`${l.name} ${l.description}`) },
  { id: "apartments", labelKey: "cat.apartments", icon: "🏙️", filter: {},
    refine: (l) => l.type === "apartment" || l.type === "studio" || l.type === "penthouse" },
];

export function Marketplace() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useSearchParams();
  const [category, setCategory] = useState<Category>(CATEGORIES[0]);
  /** What the visitor typed in the hero, if anything. */
  const [query, setQuery] = useState<SearchFilters>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  /*
   * A search in the address bar.
   *
   * `/?city=Nairobi` and `/?kind=RENT` are what the footer's destination links
   * are made of, and what somebody sends a friend. Without this they would be
   * decoration: the page would load, ignore the query, and show everything.
   *
   * Read once on mount rather than watched, so a visitor who then searches for
   * something else is not dragged back to where they arrived from.
   */
  useEffect(() => {
    const city = params.get("city")?.trim();
    const kind = params.get("kind")?.trim().toUpperCase();
    if (city) setQuery((q) => ({ ...q, city }));
    if (kind === "STAY" || kind === "RENT" || kind === "SALE") {
      const match = CATEGORIES.find((c) => c.filter.kind === kind);
      if (match) setCategory(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The hero is a sibling, not a parent, so it announces a search rather than
  // passing a prop down through the page.
  useEffect(() => {
    const onSearch = (e: Event) => {
      setQuery((e as CustomEvent<SearchFilters>).detail ?? {});
      // A destination search should not be silently confined to the category
      // that happened to be selected.
      setCategory(CATEGORIES[0]);
    };
    window.addEventListener("paltas:search", onSearch);
    return () => window.removeEventListener("paltas:search", onSearch);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    searchListings({ ...query, ...category.filter }).then((res) => {
      if (!active) return;
      const found = res.data ?? [];
      setListings(category.refine ? found.filter(category.refine) : found);
      setLoading(false);
    });
    return () => { active = false; };
  }, [category, query]);

  const searching = Boolean(query.city || query.guests || query.checkIn);

  return (
    <div className="marketplace">
      <div className="chips">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={`chip ${category.id === c.id ? "active" : ""}`}
            onClick={() => setCategory(c)}
          >
            <span className="chip-ico">{c.icon}</span> {t(c.labelKey)}
          </button>
        ))}
      </div>

      {searching && !loading && (
        <div className="results-summary">
          <span>{t("search.resultsFor", { count: listings.length })}</span>
          <button className="link" onClick={() => setQuery({})}>{t("search.clear")}</button>
        </div>
      )}

      {loading ? (
        <div className="loading">{t("search.searching")}</div>
      ) : listings.length === 0 ? (
        <div className="empty-state">
          <p>{t("search.noResults")}</p>
        </div>
      ) : (
        <div className="grid">
          {listings.map((l) => (
            <ListingCard
              key={l.id}
              listing={l}
              onClick={() => router.push(`/listing/${l.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
