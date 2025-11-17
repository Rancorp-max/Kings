// Minimal “no-404” service worker.
// It just installs and activates; no caching required.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});
