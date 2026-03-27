self.__NORTHSTAR_SW_VERSION = "northstar-sw-v21";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    if ("navigationPreload" in self.registration) {
      try {
        await self.registration.navigationPreload.enable();
      } catch (_) {
        // Ignore unsupported preload behavior.
      }
    }

    await self.clients.claim();

    const clientList = await clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(clientList.map((client) => {
      if ("navigate" in client) {
        return client.navigate(client.url).catch(() => {
          client.postMessage({ type: "APP_SHELL_UPDATED", version: self.__NORTHSTAR_SW_VERSION });
        });
      }
      return client.postMessage({ type: "APP_SHELL_UPDATED", version: self.__NORTHSTAR_SW_VERSION });
    }));
  })());
});

self.addEventListener("push", (event) => {
  let title = "North Star";
  let body = "Open North Star";
  let tag = "north-star-signal";
  let requireInteraction = false;
  let navData = null;

  if (event.data) {
    const rawText = event.data.text();
    try {
      const json = JSON.parse(rawText);
      if (json.title) title = json.title;
      if (json.body) body = json.body;
      else if (json.text) body = json.text;
      if (json.tag) tag = json.tag;
      if (typeof json.requireInteraction === "boolean") requireInteraction = json.requireInteraction;
      if (json.type && json.id) {
        navData = { type: json.type, id: json.id };
      } else if (json.url) {
        navData = { url: json.url };
      } else if (json.data && json.data.url) {
        navData = { url: json.data.url };
      }
    } catch (_) {
      if (rawText && rawText.length > 0) body = rawText;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/pwa-192x192.png",
      badge: "/pwa-192x192.png",
      tag,
      renotify: true,
      requireInteraction,
      vibrate: [100, 50, 100],
      data: {
        dateOfArrival: Date.now(),
        nav: navData,
      },
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const navData = notification.data ? notification.data.nav : null;
  notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const scope = self.registration.scope;
      const scopedClients = clientList.filter((client) => client.url.startsWith(scope) && "focus" in client);
      const visibleClient = scopedClients.find((client) => client.visibilityState === "visible");
      const fallbackClient = scopedClients[0];
      const targetClient = visibleClient || fallbackClient;

      if (targetClient) {
        return targetClient.focus().then((focusedClient) => {
          if (navData?.type && navData?.id) {
            setTimeout(() => {
              focusedClient.postMessage({
                type: "DEEP_LINK",
                navType: navData.type,
                navId: navData.id,
              });
            }, 100);
          }
        });
      }

      if (clients.openWindow) {
        let url = "/";
        if (navData?.type && navData?.id) {
          url = `/?navType=${navData.type}&navId=${navData.id}`;
        } else if (navData?.url) {
          url = navData.url;
        }
        return clients.openWindow(url);
      }

      return undefined;
    }),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const preload = await event.preloadResponse;
        if (preload) return preload;
        return await fetch(event.request, { cache: "no-store" });
      } catch (_) {
        return fetch(event.request);
      }
    })());
  }
});
