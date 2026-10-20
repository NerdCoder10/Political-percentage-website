// Service worker: makes the app installable and usable offline.
//   Every request goes to the network first, so app and data updates appear immediately;
//   the cached copy is used only when the phone is offline.
const CACHE = "political-percentage-v4";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/style.css",
  "lib/d3.min.js", "lib/topojson-client.min.js",
  "js/model.js", "js/app.js", "js/stats.js", "js/refresh.js", "js/pwa.js",
  "data/states-meta.js", "data/leaders.js", "data/state-indicators.js", "data/polling.js",
  "data/generated/atlas.js", "data/generated/elections.js", "data/generated/house2024.js",
  "data/generated/congress.js", "data/generated/cities.js", "data/generated/indicators.js", "data/generated/signals.js", "data/generated/version.js",
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
  // Network first for everything, so code and data changes appear on the next load;
  // the cache is only the offline fallback.
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    // Page navigations can't be re-issued with options, so fetch them by URL.
    const res = await fetch(req.mode === "navigate" ? req.url : req, { cache: "no-store" });
    if (res.ok) cache.put(stripQuery(req), res.clone());
    return res;
  } catch {
    return (await cache.match(stripQuery(req))) ?? Response.error();
  }
}

// version.js is requested with a cache-busting ?t= query; store it under its plain URL.
function stripQuery(req) {
  const u = new URL(req.url);
  u.search = "";
  return new Request(u.toString());
}
