// Keeps the page itself on the device, so it opens with no signal. It never
// touches a request to another origin - the data comes from GitHub, straight
// from the page - and it does not keep the demo's files.
//
// publish.sh puts the commit in place of "dev". While it is "dev" nothing is
// kept, so a change made here shows on the next reload.
const VERSION = "7baf01b";
// The page shares its origin with every other site of the account, so its
// caches carry its own name, and only those are ever cleared.
const PREFIX = "panel-shell-";
const CACHE = `${PREFIX}${VERSION}`;
const SHELL = ["./", "index.html", "app.css", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png", "bg-hex.svg", "js/app.js", "js/demo.js", "js/edits.js", "js/fields.js", "js/format.js", "js/github.js", "js/motion.js", "js/store.js", "js/pages/connect.js", "js/pages/home.js", "js/pages/parts.js", "js/pages/settings.js", "js/pages/summary.js", "js/pages/tasks.js", "js/shell.js"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (VERSION === "dev") return;
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys())
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (VERSION === "dev" || request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const scope = new URL("./", self.location.href).pathname;
  const path = url.pathname.startsWith(scope) ? url.pathname.slice(scope.length) : null;
  if (path === null || !SHELL.includes(path === "" ? "./" : path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const kept = await cache.match(request, { ignoreSearch: true });
    const fresh = fetch(request).then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    });
    if (kept) {
      fresh.catch(() => {});
      return kept;
    }
    return fresh;
  })());
});
