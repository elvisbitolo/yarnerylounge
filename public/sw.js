// Bump VERSION on every release: an unchanged service worker never updates on
// installed PWAs, so they silently keep serving the previous build's cached
// shells (stale auth logic -> reload loops on mobile).
const VERSION = "v18";

// API requests are left to the network by default: a cached /api/me JSON that
// carries a uid replays long after the session cookie is gone, which makes
// reconcileSessionCookie() on /login + /signing-in believe a dead session is
// alive and bounce them in an infinite login <-> signing-in reload loop. Only
// the explicit GET whitelist in CACHEABLE_API_PATHS is ever cached.
const isApiRequest = (url) => {
  try { return new URL(url).pathname.startsWith("/api/"); } catch { return false; }
};

// Idempotent GET APIs whose payload may be replayed while offline. Anything
// session-bearing or mutating (/api/me, /api/auth/*, POSTs) must stay OFF this
// list: replaying /api/me is what causes the login <-> signing-in reload loop
// documented above. The dashboard command endpoint returns every section the
// dashboard renders, so caching it lets the shell paint with last-known data.
const CACHEABLE_API_PATHS = ["/api/dashboard/command"];

const isCacheableApi = (url) => {
  try {
    return CACHEABLE_API_PATHS.includes(new URL(url).pathname);
  } catch {
    return false;
  }
};

// Authenticated app-shell routes. The topbar + sidebar live in the root layout,
// so any signed-in document carries the chrome; warming a handful of primary
// screens means an installed PWA opens to a real, hydratable page offline.
// Each is fetched with the SW's same-origin cookie jar and only stored when it
// resolves to its own path (a redirect to /login is never cached).
const SHELL_URLS = [
  "/dashboard",
  "/feed",
  "/chat",
  "/notifications",
  "/community",
  "/members",
  "/calendar",
];

// Everything Next.js emits for the current build, including the Turbopack
// module registry that each chunk binds its imports against.
const isStaticBuildAsset = (url) => {
  const { pathname } = new URL(url);
  return (
    pathname.startsWith("/_next/static/") ||
    pathname === "/_next/image" ||
    pathname === "/favicon.ico"
  );
};

// Minimal doctype'd offline shell. The SW must ALWAYS hand respondWith() a real
// Response — resolving it with null/undefined makes the browser throw
// "Failed to load ''. A ServiceWorker intercepted the request..." and can leave
// the rendered page in Quirks Mode (no <!DOCTYPE html>).
const OFFLINE_HTML = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Offline</title></head><body style="font-family:system-ui,sans-serif;text-align:center;padding:3rem 1rem"><h1>You're offline</h1><p>Please reconnect and try again.</p></body></html>`;

const offlineResponse = () =>
  new Response(OFFLINE_HTML, {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });

// Only pages that render for a signed-out visitor with no auth redirect.
// NEVER add a route that redirects to /login: addAll() stores the final
// response under the requested URL, and that cached auth shell is exactly
// the stale-shell problem documented in isCacheable() below.
const PRECACHE_URLS = [
  "/",
  "/login",
  "/signup",
  "/about",
  "/guidelines",
  "/privacy",
  "/terms",
  "/explore",
  "/articles",
  "/host",
  "/icon-192.png",
  "/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      // One-by-one: a single failing URL must not abort the whole precache
      // (cache.addAll() rejects on the first failure and caches nothing).
      Promise.all(
        PRECACHE_URLS.map((url) =>
          cache.add(url).catch(() => {})
        )
      )
    )
  );
  self.skipWaiting();
});

// Best-effort warm of the signed-in shell + dashboard data. Runs after
// activation (once per release). Signed-out visitors simply skip: every fetch
// that redirects to /login fails the same-path check and is left uncached.
const warmShell = async () => {
  const cache = await caches.open(VERSION);
  await Promise.all(
    [...SHELL_URLS, ...CACHEABLE_API_PATHS].map(async (url) => {
      try {
        const target = new URL(url, self.location.origin);
        const response = await fetch(target.href, { credentials: "same-origin" });
        if (!response || !response.ok) return;
        if (new URL(response.url).pathname !== target.pathname) return;
        await cache.put(url, response.clone());
      } catch {
        // Offline, signed out, or the route errored -- skip this entry.
      }
    })
  );
};

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key)));
      await self.clients.claim();
      await warmShell();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || !request.url.startsWith(self.location.origin)) return;

  // Only a real 200 for the exact URL is worth caching. Following a redirect
  // to /login or /signup caches that auth shell under the requested URL, which
  // later gets served offline and looks like the app is stuck reloading.
  const isCacheable = (response) => {
    if (!response || !response.ok) return false;
    try {
      return new URL(response.url).pathname === new URL(request.url).pathname;
    } catch {
      return false;
    }
  };

  // Whitelisted GET APIs: fresh data when online, last-known payload offline so
  // the dashboard can still paint its KPIs / activity. Everything else under
  // /api/ is left untouched (see isApiRequest).
  if (isCacheableApi(request.url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then(
            (cached) => cached || new Response("", { status: 503, statusText: "Service Unavailable" })
          )
        )
    );
    return;
  }

  if (isApiRequest(request.url)) return;

  // Next.js build output. A document from one build and a chunk from another
  // is a half-applied deploy: a consumer chunk reaches a module namespace that
  // predates the export it calls, and you get "x.y is not a function" thrown
  // mid-render. The filenames are content-hashed, so there is nothing to gain
  // from reusing them -- always revalidate, and only fall back to the cache
  // when the network is genuinely gone.
  if (isStaticBuildAsset(request.url)) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Filenames are content-hashed, so a cached copy can never be
          // half-applied: store it for the offline shell to hydrate from.
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || offlineResponse()))
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isCacheable(response)) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .then(
          (response) => response || offlineResponse(),
          () =>
            caches.match(request)
              .then((cached) => (cached ? cached : caches.match("/dashboard")))
              .then((cached) => (cached ? cached : caches.match("/")))
              .then((cached) => cached || offlineResponse())
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response && isCacheable(response)) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      }).catch(() => {
        // If fetch fails and we have nothing cached, fall back to the network error
        // by returning a basic Response so the browser doesn't crash.
        return new Response("", { status: 503, statusText: "Service Unavailable" });
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Community", body: "", url: "/" };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text();
    }
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      // Served the retired /icon.png, which is a different design from the
      // icons in layout.js, so push notifications showed stale branding.
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
