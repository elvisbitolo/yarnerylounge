// Bump VERSION on every release: an unchanged service worker never updates on
// installed PWAs, so they silently keep serving the previous build's cached
// shells (stale auth logic -> reload loops on mobile).
const VERSION = "v6";

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

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        cache.addAll([
          "/",
          "/login",
          "/signup",
          "/about",
          "/guidelines",
          "/icon-192.png",
          "/icon-512.png",
        ])
      )
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
  );
  self.clients.claim();
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
            caches.match(request).then((cached) => {
              if (cached) return cached;
              return caches.match("/");
            }).then((cached) => cached || offlineResponse())
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
      icon: "/icon.png",
      badge: "/icon.png",
      data: { url: data.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (new URL(client.url).origin === location.origin && "focus" in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
