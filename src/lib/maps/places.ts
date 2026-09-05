import { loadGoogleMaps } from "@/components/maps/googleMaps";
import { radiusForPlace } from "@/lib/search/destinations";

/**
 * Google's half of destination search: what places exist, and where they are.
 *
 * Wrapped rather than called directly, for three reasons that all cost money or
 * correctness if ignored.
 *
 * Session tokens. Google bills autocomplete per request unless the keystrokes
 * of one search share a token, in which case the whole typing session plus the
 * details call that follows is billed as a single search. Typing "Marrakesh"
 * without one is nine billable requests; with one it is a fraction of that.
 * The token must be discarded after the details fetch, or the next search
 * silently rides on a stale session and the saving disappears.
 *
 * Bias, never restriction. locationRestriction removes everything outside the
 * box: a visitor in Nairobi typing "Paris" would be told there is no such
 * place. locationBias only prefers what is close, so local results come first
 * and the world is still reachable — which is the behaviour a travel site
 * needs and the one an ordinary map does not.
 *
 * Debounce lives here rather than in the component, so every caller gets it and
 * nobody reintroduces a request per keystroke by wiring their own input.
 */

export interface Prediction {
  placeId: string;
  /** The bold part — usually the place itself. */
  main: string;
  /** The rest — the region and country that disambiguate it. */
  secondary: string;
  types: string[];
}

export interface PlaceDetail {
  placeId: string;
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  types: string[];
  /** How far around this to look for inventory, scaled to what it is. */
  radiusKm: number;
}

let token: google.maps.places.AutocompleteSessionToken | null = null;

/** One token per search, from the first keystroke to the details fetch. */
function sessionToken(): google.maps.places.AutocompleteSessionToken {
  if (!token) token = new google.maps.places.AutocompleteSessionToken();
  return token;
}

/** Called after details, because a token spent is a token that must not be reused. */
function endSession(): void {
  token = null;
}

export interface PredictContext {
  /** The visitor, when they have allowed it. Biases, never restricts. */
  near?: { latitude: number; longitude: number } | null;
  /** What the map is showing, when they have moved it somewhere else. */
  viewport?: { north: number; south: number; east: number; west: number } | null;
}

/**
 * Live predictions for a partial query.
 *
 * Deliberately does not wait for a complete word: "mar" should offer Marrakesh
 * and Marina, which is the entire point of an autocomplete and the thing a
 * geocoder cannot do.
 */
export async function predict(input: string, context: PredictContext = {}): Promise<Prediction[]> {
  const query = input.trim();
  if (!query) return [];
  await loadGoogleMaps();
  if (!window.google?.maps?.places) return [];

  const service = new google.maps.places.AutocompleteService();
  const request: google.maps.places.AutocompletionRequest = {
    input: query,
    sessionToken: sessionToken(),
  };

  // The map's view wins over the visitor's position when they have moved it:
  // someone panning across Andalusia is asking about Andalusia, wherever they
  // happen to be sitting.
  if (context.viewport) {
    request.locationBias = new google.maps.LatLngBounds(
      { lat: context.viewport.south, lng: context.viewport.west },
      { lat: context.viewport.north, lng: context.viewport.east },
    );
  } else if (context.near) {
    request.locationBias = {
      center: { lat: context.near.latitude, lng: context.near.longitude },
      radius: 50_000,
    };
  }

  return new Promise((resolve) => {
    service.getPlacePredictions(request, (results, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
        // ZERO_RESULTS is an answer, not a failure. Anything else is one, but
        // an empty dropdown says so better than an error message would.
        resolve([]);
        return;
      }
      resolve(results.map((r) => ({
        placeId: r.place_id,
        main: r.structured_formatting?.main_text ?? r.description,
        secondary: r.structured_formatting?.secondary_text ?? "",
        types: r.types ?? [],
      })));
    });
  });
}

/**
 * Turn a chosen prediction into coordinates and a name.
 *
 * The session ends here whether the call succeeded or not — a token kept after
 * its details fetch is a token that quietly stops saving anything.
 */
export async function details(placeId: string): Promise<PlaceDetail | null> {
  await loadGoogleMaps();
  if (!window.google?.maps?.places) return null;

  const service = new google.maps.places.PlacesService(document.createElement("div"));
  const request: google.maps.places.PlaceDetailsRequest = {
    placeId,
    // Only what is used. Google prices details by the fields asked for, and
    // asking for everything is how a search feature becomes a line item.
    fields: ["place_id", "name", "formatted_address", "geometry", "address_components", "types"],
    sessionToken: sessionToken(),
  };

  return new Promise((resolve) => {
    service.getDetails(request, (place, status) => {
      endSession();
      const location = place?.geometry?.location;
      if (status !== google.maps.places.PlacesServiceStatus.OK || !place || !location) {
        resolve(null);
        return;
      }
      const part = (type: string) =>
        place.address_components?.find((c) => c.types.includes(type));
      resolve({
        placeId: place.place_id ?? placeId,
        name: place.name ?? place.formatted_address ?? "",
        formattedAddress: place.formatted_address ?? "",
        latitude: location.lat(),
        longitude: location.lng(),
        city: part("locality")?.long_name
          ?? part("postal_town")?.long_name
          ?? part("administrative_area_level_2")?.long_name,
        country: part("country")?.short_name,
        types: place.types ?? [],
        radiusKm: radiusForPlace(place.types),
      });
    });
  });
}

/**
 * A debounced predictor.
 *
 * Returns a function that resolves only for the most recent call — earlier ones
 * resolve empty rather than hanging, so a caller awaiting them is not left with
 * a promise that never settles, and a slow response for "mar" cannot arrive
 * after "marrakesh" and overwrite it.
 */
export function debouncedPredict(waitMs = 220) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let generation = 0;

  return (input: string, context: PredictContext = {}): Promise<Prediction[]> => {
    const mine = ++generation;
    if (timer) clearTimeout(timer);
    return new Promise((resolve) => {
      timer = setTimeout(async () => {
        const results = await predict(input, context);
        resolve(mine === generation ? results : []);
      }, waitMs);
    });
  };
}
