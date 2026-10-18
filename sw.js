// Service worker: makes the app installable and usable offline.
//   - App shell (HTML, CSS, JS, libraries, icons): served from cache, refreshed in the background.
//   - Data files (data/**): network first so the 30-minute data refresh shows up, cache as fallback.
const CACHE = "political-percentage-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "lib/d3.min.js", "lib/topojson-client.min.js",
  "js/model.js", "js/app.js", "js/refresh.js", "js/pwa.js",
  "data/states-meta.js", "data/leaders.js", "data/state-indicators.js", "data/polling.js",
  "data/generated/atlas.js", "data/generated/elections.js", "data/generated/house2024.js",
  "data/generated/congress.js", "data/generated/cities.js", "data/generated/indicators.js", "data/generated/version.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  const isData = url.pathname.includes("/data/");
  event.respondWith(isData ? networkFirst(req) : staleWhileRevalidate(req, event));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res.ok) cache.put(stripQuery(req), res.clone());
    return res;
  } catch {
    return (await cache.match(stripQuery(req))) ?? Response.error();
  }
}

async function staleWhileRevalidate(req, event) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req, { ignoreSearch: true });
  const update = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => cached);
  if (cached) { event.waitUntil(update); return cached; }
  return update;
}

// version.js is requested with a cache-busting ?t= query; store it under its plain URL.
function stripQuery(req) {
  const u = new URL(req.url);
  u.search = "";
  return new Request(u.toString());
}
