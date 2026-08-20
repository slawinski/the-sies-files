// Minimal, safe service worker for The Sieś Files.
// Network-first for everything; NEVER caches or intercepts /api responses
// (secret projections must not be shared-cached — docs/03 §17/§19).

const CACHE = "sies-shell-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never touch API or SSE traffic.
  if (url.pathname.startsWith("/api/")) return;
  if (request.method !== "GET") return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        const clone = response.clone();
        caches
          .open(CACHE)
          .then((cache) => cache.put(request, clone))
          .catch(() => {});
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || Response.error()),
      ),
  );
});
