/* TuneDeck service worker — app shell + thumbnail caching for offline use. */
const VERSION = "td-v1";
const SHELL = `${VERSION}-shell`;
const STATIC = `${VERSION}-static`;
const IMAGES = `${VERSION}-images`;
const PAGES = ["/", "/library", "/tags", "/tag", "/add", "/settings", "/song", "/song/edit"];
const PUBLIC = ["/login", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/logo-96.png"];
const MAX_IMAGES = 400;

async function cachePage(cache, path) {
  try {
    const res = await fetch(path, { credentials: "same-origin" });
    // Never cache the login redirect in place of an app page.
    if (res.ok && !res.redirected) await cache.put(path, res);
  } catch {
    /* offline during install: pages get cached on first visit */
  }
}

async function warm() {
  const cache = await caches.open(SHELL);
  await Promise.all([...PAGES, ...PUBLIC].map((p) => cachePage(cache, p)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(warm().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "warm") event.waitUntil(warm());
  if (event.data === "clear") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function navigation(request) {
  const url = new URL(request.url);
  const cache = await caches.open(SHELL);
  try {
    const res = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 4000)),
    ]);
    if (res.ok && !res.redirected) cache.put(url.pathname, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(url.pathname)) ||
      (await cache.match("/")) ||
      new Response("<h1>Offline</h1>", { headers: { "Content-Type": "text/html" } })
    );
  }
}

async function cacheFirst(request, name, trim) {
  const cache = await caches.open(name);
  const hit = await cache.match(request);
  if (hit) return hit;
  try {
    const res = await fetch(request);
    if (res.ok || res.type === "opaque") {
      await cache.put(request, res.clone());
      if (trim) trimCache(name, MAX_IMAGES);
    }
    return res;
  } catch {
    return Response.error();
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit || Response.error());
  return hit || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "i.ytimg.com" || url.hostname === "img.youtube.com") {
    event.respondWith(cacheFirst(request, IMAGES, true));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC, false));
    return;
  }
  if (request.headers.get("RSC")) return;
  event.respondWith(staleWhileRevalidate(request));
});
