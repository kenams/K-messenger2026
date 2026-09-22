// K-ssenger web push service worker.
// Deliberately minimal: the server never sends message/K-Pulse content in
// push payloads (see apps/server/src/push.ts, assertMetadataOnlyPushPayload)
// — only a generic title/body/data, so there is nothing sensitive to decrypt
// or hide here even though this file runs outside the app's normal auth.

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'K-ssenger', body: 'Tu as une nouvelle notification.', data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Best-effort — show the generic fallback above rather than nothing.
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/favicon.ico',
      tag: payload.data?.type ? `${payload.data.type}:${payload.data.conversationId ?? payload.data.senderId ?? ''}` : undefined,
      data: payload.data ?? {},
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});
