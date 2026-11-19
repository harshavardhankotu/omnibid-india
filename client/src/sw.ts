import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute, type PrecacheEntry } from "workbox-precaching";
import { registerRoute, setCatchHandler } from "workbox-routing";
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

interface SWNotificationAction {
  action: string;
  title: string;
}

interface SWNotificationOptions extends NotificationOptions {
  badge?: string;
  actions?: SWNotificationAction[];
  renotify?: boolean;
}

interface SWWindowClient {
  url: string;
  focused?: boolean;
  focus(): Promise<SWWindowClient>;
  postMessage(message: unknown): void;
}

interface SWScope {
  __WB_MANIFEST: Array<PrecacheEntry | string>;
  location: Location;
  skipWaiting(): Promise<void>;
  clients: {
    claim(): Promise<void>;
    matchAll(opts?: { type?: "window" | "worker" | "sharedworker" | "all"; includeUncontrolled?: boolean }): Promise<SWWindowClient[]>;
    openWindow(url: string): Promise<SWWindowClient | null>;
  };
  registration: {
    showNotification(title: string, options?: SWNotificationOptions): Promise<void>;
  };
  addEventListener(type: string, listener: (event: any) => void): void;
}

declare const self: SWScope;

// 1. Precache Vite-built assets + offline fallback page
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST || []);

// 2. Navigation Strategy (HTML pages / SPA routes): NetworkFirst with cached SPA shell & offline.html fallback
registerRoute(
  ({ url, request }) =>
    request.mode === "navigate" && !url.pathname.startsWith("/api"),
  new NetworkFirst({
    cacheName: "omnibid-pages-v2",
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  })
);

// 3. Read-only Public API Caching (categories, requirements feed, market offers) for offline browsing
registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    (url.pathname.startsWith("/api/categories") ||
      url.pathname.startsWith("/api/requirements") ||
      url.pathname.startsWith("/api/market") ||
      url.pathname.startsWith("/api/affiliate/offers")),
  new NetworkFirst({
    cacheName: "omnibid-api-v3",
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      {
        cacheWillUpdate: async ({ response }) => {
          const contentType = response?.headers.get("content-type") || "";
          return contentType.toLowerCase().includes("json") ? response : null;
        },
      },
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 }),
    ],
  })
);

// 3b. Dashboard & User State Caching (Cached Mode): NetworkFirst with 3s timeout & offline fallback telemetry
const DASHBOARD_CACHE_NAME = "omnibid-dashboard-v1";

registerRoute(
  ({ url, request }) =>
    request.method === "GET" &&
    (url.pathname.startsWith("/api/dashboard/") ||
      url.pathname === "/api/auth/me" ||
      url.pathname.startsWith("/api/kyc/") ||
      url.pathname.startsWith("/api/analytics/") ||
      url.pathname.startsWith("/api/notifications")),
  new NetworkFirst({
    cacheName: DASHBOARD_CACHE_NAME,
    networkTimeoutSeconds: 3,
    plugins: [
      new CacheableResponsePlugin({ statuses: [200] }),
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 }),
      {
        cachedResponseWillBeUsed: async ({ request, cachedResponse }) => {
          if (cachedResponse) {
            const cachedAt = cachedResponse.headers.get("date") || new Date().toISOString();
            const path = new URL(request.url).pathname;
            void self.clients
              .matchAll({ type: "window", includeUncontrolled: true })
              .then((clients) => {
                for (const client of clients) {
                  client.postMessage({
                    type: "SW_CACHED_RESPONSE",
                    path,
                    cachedAt,
                  });
                }
              });
          }
          return cachedResponse;
        },
      },
    ],
  })
);

// 4. Static Styles, Scripts, and Images: StaleWhileRevalidate
registerRoute(
  ({ request }) =>
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "image",
  new StaleWhileRevalidate({
    cacheName: "omnibid-assets-v2",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

// 5. Google Fonts: CacheFirst (long-lived)
registerRoute(
  ({ url }) =>
    url.origin === "https://fonts.googleapis.com" ||
    url.origin === "https://fonts.gstatic.com",
  new CacheFirst({
    cacheName: "omnibid-fonts-v2",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 }),
    ],
  })
);

// 6. Global Offline Catch Handler for failed navigation requests
setCatchHandler(async ({ request }) => {
  if (request.destination === "document" || request.mode === "navigate") {
    const cachedAppShell = await matchPrecache("/index.html");
    if (cachedAppShell) return cachedAppShell;
    const cachedOffline = await matchPrecache("/offline.html");
    if (cachedOffline) return cachedOffline;
  }
  return Response.error();
});

// 7. Lifecycle & Client Message Handling (Skip Waiting + Cache Clear + In-App SW Notification Trigger)
self.addEventListener("install", () => {
  void self.skipWaiting();
});

self.addEventListener("activate", (event: any) => {
  event.waitUntil(
    (async () => {
      if (typeof caches !== "undefined") {
        await caches.delete("omnibid-api-v2");
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event: any) => {
  const data = event?.data;
  if (!data) return;

  if (data.type === "SKIP_WAITING") {
    void self.skipWaiting();
  }

  if (data.type === "CLEAR_DASHBOARD_CACHE" && typeof caches !== "undefined") {
    event.waitUntil(caches.delete(DASHBOARD_CACHE_NAME));
  }

  if (data.type === "SHOW_NOTIFICATION" && data.payload) {
    const p = data.payload;
    event.waitUntil(
      self.registration.showNotification(p.title || "OmniBid India", {
        body: p.body || "New procurement update available.",
        icon: p.icon || "/pwa-192x192.png",
        badge: p.badge || "/pwa-192x192.png",
        tag: p.tag || "omnibid-alert",
        data: { url: p.url || "/notifications" },
      })
    );
  }
});

// 8. Web Push Notification Handling
self.addEventListener("push", (event: any) => {
  let payload: Record<string, any> = {
    title: "OmniBid Deal Alert",
    body: "New reverse-auction bid or tender update available.",
    url: "/notifications",
    tag: "omnibid-push",
  };

  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      payload.body = event.data.text();
    }
  }

  const options: SWNotificationOptions = {
    body: payload.body,
    icon: payload.icon || "/pwa-192x192.png",
    badge: payload.badge || "/pwa-192x192.png",
    tag: payload.tag || "omnibid-push",
    renotify: true,
    data: {
      url: payload.url || "/notifications",
    },
    actions: Array.isArray(payload.actions)
      ? payload.actions
      : [{ action: "open", title: "View Update" }],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "OmniBid India", options)
  );
});

// 9. Notification Click Handling (Focus existing window or open target URL)
self.addEventListener("notificationclick", (event: any) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  const fullTargetUrl = new URL(targetUrl, self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if (client.url === fullTargetUrl && "focus" in client) {
            client.postMessage({ type: "NOTIFICATION_CLICKED", url: targetUrl });
            return client.focus();
          }
        }
        if (clientList.length > 0 && "focus" in clientList[0]) {
          clientList[0].postMessage({ type: "NOTIFICATION_CLICKED", url: targetUrl });
          return clientList[0].focus();
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});
