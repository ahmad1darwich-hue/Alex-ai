// Clean-up worker: the old Brain app installed a caching service worker on this site. Browsers fetch this file to
// update it; this version deletes every old cache, unregisters itself and reloads open pages on the latest version.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (x) {}
    try { await self.registration.unregister(); } catch (x) {}
    try { for (const c of await self.clients.matchAll({ type: "window" })) c.navigate(c.url); } catch (x) {}
  })());
});
