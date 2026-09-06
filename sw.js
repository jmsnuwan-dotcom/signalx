const CACHE = "signalx-live-v7";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.js",
  "/auto-refresh.js",
  "/best-setup.js",
  "/diagnostic-ui.js",
  "/gate-audit-ui.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/pwa-192.png",
  "/pwa-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  if (url.pathname.startsWith("/api/")) return;

  // Network-first for the HTML so deployments become visible quickly.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put("/index.html", copy));
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Cache-first for static assets.
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
