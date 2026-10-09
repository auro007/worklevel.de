/* WORKLEVEL V15.6.2 — shell cache for /techniker + /login (production registration only) */
const CACHE = "worklevel-shell-v15.6";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon.svg",
  "/techniker",
  "/login"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            cache.add(url).catch(() => undefined)
          )
        )
      )
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

function isShellAsset(url) {
  return (
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname === "/sw.js" ||
    url.pathname.startsWith("/_next/static/")
  );
}

function isShellNavigation(pathname) {
  return (
    pathname === "/techniker" ||
    pathname.startsWith("/techniker/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API / auth-ish routes — network only (no offline fake writes)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/auth/")
  ) {
    return;
  }

  // Navigations: network-first, cache shell for offline open of /techniker & /login
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => {
              cache.put(request, copy);
              if (isShellNavigation(url.pathname)) {
                const stable =
                  url.pathname.startsWith("/login") ? "/login" : "/techniker";
                cache.put(stable, response.clone());
              }
            });
          }
          return response;
        })
        .catch(async () => {
          const cached =
            (await caches.match(request)) ||
            (url.pathname.startsWith("/login")
              ? await caches.match("/login")
              : await caches.match("/techniker")) ||
            (await caches.match("/techniker")) ||
            (await caches.match("/login"));
          if (cached) return cached;
          return new Response(
            "<!doctype html><html lang=\"de\"><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"/><title>WORKLEVEL offline</title><body style=\"font-family:system-ui;background:#0b0c0e;color:#f5f7fa;padding:24px\"><h1 style=\"color:#ff6a00\">WORKLEVEL</h1><p>Offline — Shell nicht im Cache. Einmal online <strong>/techniker</strong> oder <strong>/login</strong> öffnen.</p><p style=\"color:#9ca3af;font-size:14px\">Auftragsdaten und Speichern brauchen weiterhin Netz.</p></body></html>",
            { headers: { "Content-Type": "text/html; charset=utf-8" } }
          );
        })
    );
    return;
  }

  // Static shell assets: cache-first
  if (isShellAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
