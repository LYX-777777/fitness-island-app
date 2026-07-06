const CACHE = "fitness-island-v3";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        "./index.html",
        "./styles.css",
        "./app.js",
        "./plan.json",
        "./manifest.json",
        "./assets/favicon.svg",
        "./assets/apple-touch-icon.png",
        "./assets/icon-512.png",
        "./assets/animal-island/animal-icon.png",
        "./assets/animal-island/home-bg.webp",
        "./assets/animal-island/footer-sea.svg",
        "./assets/animal-island/divider-line-brown.svg",
        "./assets/animal-island/cursor-icon-small.png"
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
