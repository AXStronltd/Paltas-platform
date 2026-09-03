// PALTAS service worker — installable PWA and an offline shell.
//
// Bumping this name is what retires an old cache: `activate` deletes every
// cache whose key is not this one.
const CACHE = "paltas-v2";
const CORE = ["/", "/bookings", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/**
 * Anything under /api is never cached, and never served from cache.
 *
 * An earlier version cache-first'd every GET that was not a navigation, which
 * included the API. That is wrong in three separate ways, and the third is
 * serious:
 *
 *   - a booking list would show yesterday's state;
 *   - /api/guest/me would say you are signed in after you signed out;
 *   - and on a shared device — a front-desk tablet, a family phone — the next
 *     person to use the browser could be served the previous person's cached
 *     responses, because a cache does not know who asked.
 *
 * The cost of not caching the API is that the app needs a network to show live
 * data, which is simply true. The offline shell still loads.
 */
const isApi = (url) => url.pathname.startsWith("/api/");

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Someone else's origin is not ours to cache.
  if (url.origin !== self.location.origin) return;

  // The API is always live. No cache read, no cache write, no offline fallback:
  // a stale answer here is worse than a visible failure.
  if (isApi(url)) {
    event.respondWith(fetch(req));
    return;
  }

  // Pages: network first so content is fresh, cache as a fallback when offline.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/"))),
    );
    return;
  }

  // Static assets: cache first, since they are content-hashed by the build.
  event.respondWith(
    caches.match(req).then((cached) =>
      cached || fetch(req).then((res) => {
        // Only store real successes. Caching a 404 or a redirect makes it
        // permanent for the life of the cache.
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => cached),
    ),
  );
});
