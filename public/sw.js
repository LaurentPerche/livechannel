self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  event.waitUntil(showLiveChannelNotification(event));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of windows) {
        if ("focus" in client) {
          await client.navigate(targetUrl);
          return client.focus();
        }
      }

      return self.clients.openWindow(targetUrl);
    })()
  );
});

async function showLiveChannelNotification(event) {
  let payload = null;

  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    const response = await fetch("/api/notifications/latest", { credentials: "include" }).catch(() => null);
    payload = response?.ok ? await response.json() : null;
  }

  if (!payload?.videoId) return;

  const title = `New video from ${payload.channelTitle}`;
  await self.registration.showNotification(title, {
    body: payload.title,
    actions: [{ action: "watch-now", title: "Watch now" }],
    data: {
      url: payload.url || `/?jumpVideoId=${encodeURIComponent(payload.videoId)}`
    },
    tag: `livechannel-${payload.videoId}`,
    renotify: true
  });
}
