// The build script replaces this token with the deployment commit SHA.
// Every deployed release therefore gets a distinct cache namespace automatically.
const VERSION = "__SERVICE_WORKER_VERSION__";

const isApiRequest = (url) => {
  try { return new URL(url).pathname.startsWith("/api/"); } catch { return false; }
};

const isStaticBuildAsset = (url) => {
  const { pathname } = new URL(url);
  return pathname.startsWith("/_next/static/") || pathname === "/_next/image" || pathname === "/favicon.ico";
};

const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem"><h1>You're offline</h1><p>Please reconnect and try again.</p></body></html>`;
const offlineResponse = () => new Response(OFFLINE_HTML, {
  status: 503,
  statusText: "Service Unavailable",
  headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
});

// Only public, signed-out pages and static icons are precached.
// Authenticated documents and member-specific API responses are never cached.
const PRECACHE_URLS = [
  "/", "/login", "/signup", "/about", "/guidelines", "/privacy",
  "/terms", "/explore", "/articles", "/host", "/icon-192.png", "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await Promise.all(PRECACHE_URLS.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  // Never intercept API requests. Dashboard data, membership state, and all
  // authenticated API responses must always come from the live server.
  if (isApiRequest(request.url)) return;

  // Next.js assets are content-hashed. Revalidate online and use a cached copy
  // only when offline, preventing mixed-build JavaScript bundles.
  if (isStaticBuildAsset(request.url)) {
    event.respondWith(fetch(request).then((response) => {
      if (response?.ok) {
        const copy = response.clone();
        caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
      }
      return response;
    }).catch(async () => (await caches.match(request)) || offlineResponse()));
    return;
  }

  // Authenticated navigations (including /dashboard) are network-only.
  // Never save them or fall back to an old cached dashboard. When offline,
  // show an explicit offline page instead of stale member data/UI.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => offlineResponse()));
    return;
  }

  // Public static assets may use cache-first behavior. Do not cache HTML or
  // dynamic responses here; the online response remains authoritative.
  event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || offlineResponse()));
});
