const CACHE_NAME = "homestead-hub-v2";
const ROOT_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
  "./icons/favicon.png"
];

const MODULE_PATHS = [
  "/homestead_hub/finance_hub/",
  "/homestead_hub/solar_hub/",
  "/homestead_hub/tiny_tenant_hub/"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ROOT_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith("homestead-hub-") && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);

  // Do not intercept the individual dashboard apps.
  // This keeps Finance Hub, Solar Hub, and Tiny Tenant using their own files,
  // service workers, manifests, and Supabase behavior.
  if (MODULE_PATHS.some(path => requestUrl.pathname.startsWith(path))) {
    return;
  }

  // Do not cache API/CDN requests. The landing page only needs static root assets cached.
  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});
