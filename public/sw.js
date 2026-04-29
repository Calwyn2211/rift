// RIFT service worker — handles push notifications and notification clicks.
// Intentionally does NOT cache fetch responses; we never want stale data.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch {
        data = { title: 'RIFT', body: event.data ? event.data.text() : '' };
    }
    const title = data.title || 'RIFT';
    const options = {
        body: data.body || '',
        icon: '/icon1',
        badge: '/icon0',
        tag: data.tag,
        data: { url: data.url || '/' },
    };
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || '/';
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
            for (const client of list) {
                if (client.url.endsWith(url) && 'focus' in client) return client.focus();
            }
            if (self.clients.openWindow) return self.clients.openWindow(url);
        })
    );
});
