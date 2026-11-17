// Extra service-worker logic: open the app when a reminder notification is tapped.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      try { await c.focus(); c.postMessage({ type: 'notification-click', data }); return; } catch (e) { /* try next */ }
    }
    const c = await self.clients.openWindow(self.registration.scope);
    if (c) setTimeout(() => c.postMessage({ type: 'notification-click', data }), 1500);
  })());
});
