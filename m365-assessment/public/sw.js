// Minimal service worker: enables PWA installability without caching any
// tenant data or auth responses (an assessment tool must never serve stale
// Graph results). All requests pass through to the network.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {
  // No respondWith(): let the browser handle the request normally.
});
