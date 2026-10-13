// Keeps the page itself on the device, so it opens with no signal. It never
// touches a request to another origin - the data comes from GitHub, straight
// from the page - and it does not keep the demo's files.
//
// publish.sh puts the commit in place of "dev". While it is "dev" nothing is
// kept, so a change made here shows on the next reload.
//
// A new version installs beside the old one, takes over as soon as it has
// every file, and the page - seeing it has a new worker - reloads itself once
// (app.js), so a publish shows on the first open after it. Every publish is a
// new version (the commit), so that is the one way the page changes.
const VERSION = "daf67e4";
// The page shares its origin with every other site of the account, so its
// caches carry its own name, and only those are ever cleared.
const PREFIX = "panel-shell-";
const CACHE = `${PREFIX}${VERSION}`;
// What the first versions called theirs, before the prefix.
const LEGACY = /^shell-([0-9a-f]{7}|dev)$/;
const SHELL = ["./", "index.html", "app.css", "manifest.webmanifest", "icon.svg", "icon-180.png", "icon-512.png", "bg-hex.svg", "img/res-food.png", "img/res-wood.png", "img/res-stone.png", "img/res-gold.png", "js/app.js", "js/demo.js", "js/edits.js", "js/fields.js", "js/format.js", "js/github.js", "js/motion.js", "js/store.js", "js/pages/connect.js", "js/pages/home.js", "js/pages/parts.js", "js/pages/settings.js", "js/pages/summary.js", "js/pages/tasks.js", "js/shell.js"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  if (VERSION === "dev") return;
  // Past the browser's own cache: a new version must keep the new files, not
  // the copies of the old ones the browser may still hold for some minutes.
  event.waitUntil(caches.open(CACHE).then((cache) =>
    cache.addAll(SHELL.map((path) => new Request(path, { cache: "reload" })))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys())
      if ((name.startsWith(PREFIX) && name !== CACHE) || LEGACY.test(name)) await caches.delete(name);
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
  // What this version kept, as it kept it. Nothing is refreshed one file at a
  // time: that left a mix of two versions in the cache around a publish, and
  // a page made of both does not start. A change arrives as a new version,
  // whole (install), or not at all.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(request, { ignoreSearch: true })) || fetch(request);
  })());
});
